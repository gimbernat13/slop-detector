#!/usr/bin/env npx tsx

import ora from "ora";
import chalk from "chalk";
import inquirer from "inquirer";
import Table from "cli-table3";
import { config } from "dotenv";

// Load env vars
config();

// Import lib modules directly (no Trigger.dev API needed)
import { fetchChannelMetadata, fetchRecentVideos } from "./trigger/lib/youtube";
import { normalizeChannel } from "./trigger/lib/schema";
import { classifyChannel } from "./trigger/lib/classifier";
import { insertClassification, initializeSchema } from "./trigger/lib/db";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

// ============================================================
// Banner
// ============================================================

function printBanner() {
    console.log(chalk.cyan.bold(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🔍  ${chalk.yellow.bold("SLOP DETECTOR")}  🔍                                ║
║                                                           ║
║   AI-Powered YouTube Spam Channel Detector                ║
║   Built with Trigger.dev + Gemini AI                      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`));
}

// ============================================================
// YouTube Search Functions
// ============================================================

// Search for channels by keyword
async function searchChannelsByKeyword(keyword: string, maxResults = 20): Promise<string[]> {
    const url = new URL(`${YOUTUBE_API_BASE}/search`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "channel");
    url.searchParams.set("q", keyword);
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("key", YOUTUBE_API_KEY!);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`YouTube API error: ${response.status}`);

    const data = await response.json();
    return (data.items || []).map((item: any) => item.snippet.channelId);
}

// Search for videos by keyword - returns unique channel IDs
async function searchVideosByKeyword(keyword: string, maxResults = 50): Promise<string[]> {
    const url = new URL(`${YOUTUBE_API_BASE}/search`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("q", keyword);
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("key", YOUTUBE_API_KEY!);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`YouTube API error: ${response.status}`);

    const data = await response.json();
    const channelIds = (data.items || []).map((item: any) => item.snippet.channelId);
    return [...new Set(channelIds)] as string[]; // Dedupe
}

// Get channel ID from URL or handle
function parseChannelInput(input: string): string | null {
    // Handle format: @username
    if (input.startsWith("@")) {
        return input; // Will need to resolve later
    }
    // Channel ID: UC...
    if (input.startsWith("UC") && input.length === 24) {
        return input;
    }
    // URL format: youtube.com/channel/UC...
    const channelMatch = input.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (channelMatch) return channelMatch[1];
    // URL format: youtube.com/@handle
    const handleMatch = input.match(/youtube\.com\/@([a-zA-Z0-9_-]+)/);
    if (handleMatch) return `@${handleMatch[1]}`;

    return null;
}

// Resolve @handle to channel ID
async function resolveHandle(handle: string): Promise<string | null> {
    const url = new URL(`${YOUTUBE_API_BASE}/search`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "channel");
    url.searchParams.set("q", handle);
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("key", YOUTUBE_API_KEY!);

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = await response.json();
    if (data.items && data.items.length > 0) {
        return data.items[0].snippet.channelId;
    }
    return null;
}

// Snowball: get a channel's videos, then find similar video titles
async function snowballFromChannel(channelId: string, maxChannels = 20): Promise<string[]> {
    // Get channel's recent videos
    const videos = await fetchRecentVideos(channelId, 5);
    if (videos.length === 0) return [channelId];

    // Search for similar videos using the channel's video titles
    const allChannelIds = new Set<string>([channelId]);

    for (const videoTitle of videos.slice(0, 3)) {
        // Extract key terms from title
        const searchTerms = videoTitle
            .replace(/[^\w\s]/g, "")
            .split(" ")
            .filter(w => w.length > 3)
            .slice(0, 4)
            .join(" ");

        if (searchTerms.length < 5) continue;

        const foundChannels = await searchVideosByKeyword(searchTerms, 20);
        foundChannels.forEach(id => allChannelIds.add(id));

        if (allChannelIds.size >= maxChannels) break;
    }

    return [...allChannelIds].slice(0, maxChannels);
}

// ============================================================
// Display Results
// ============================================================

interface ClassificationResult {
    channelId: string;
    title: string;
    classification: string;
    slopType: string | null;
    confidence: number;
}

function displayResults(results: ClassificationResult[]) {
    console.log("\n");
    console.log(chalk.cyan.bold("═══════════════════════════════════════════════════════════"));
    console.log(chalk.cyan.bold("                    📊 RESULTS                              "));
    console.log(chalk.cyan.bold("═══════════════════════════════════════════════════════════"));
    console.log();

    // Summary
    const slop = results.filter(r => r.classification === "SLOP").length;
    const suspicious = results.filter(r => r.classification === "SUSPICIOUS").length;
    const okay = results.filter(r => r.classification === "OKAY").length;

    console.log(chalk.white.bold("  📈 Summary:"));
    console.log(`     Total Analyzed: ${chalk.cyan(results.length)}`);
    console.log(`     ${chalk.red("🚨 SLOP:")} ${chalk.red.bold(slop)}`);
    console.log(`     ${chalk.yellow("⚠️  SUSPICIOUS:")} ${chalk.yellow.bold(suspicious)}`);
    console.log(`     ${chalk.green("✅ OKAY:")} ${chalk.green.bold(okay)}`);
    console.log();

    // Results table
    const table = new Table({
        head: [
            chalk.cyan("Channel"),
            chalk.cyan("Classification"),
            chalk.cyan("Type"),
            chalk.cyan("Confidence"),
        ],
        colWidths: [30, 16, 18, 12],
        style: { head: [], border: [] },
    });

    for (const result of results) {
        const classification = result.classification === "SLOP"
            ? chalk.red.bold("🚨 SLOP")
            : result.classification === "SUSPICIOUS"
                ? chalk.yellow("⚠️  SUSPICIOUS")
                : chalk.green("✅ OKAY");

        const slopType = result.slopType
            ? chalk.magenta(result.slopType)
            : chalk.gray("-");

        const confidence = result.confidence >= 80
            ? chalk.red.bold(`${result.confidence}%`)
            : result.confidence >= 50
                ? chalk.yellow(`${result.confidence}%`)
                : chalk.gray(`${result.confidence}%`);

        table.push([
            result.title.slice(0, 28),
            classification,
            slopType,
            confidence,
        ]);
    }

    console.log(table.toString());
    console.log();
}

// ============================================================
// Main CLI
// ============================================================

async function main() {
    printBanner();

    // Check env vars
    if (!YOUTUBE_API_KEY) {
        console.log(chalk.red("❌ YOUTUBE_API_KEY not set in .env"));
        process.exit(1);
    }
    if (!process.env.GEMINI_API_KEY) {
        console.log(chalk.red("❌ GEMINI_API_KEY not set in .env"));
        process.exit(1);
    }

    // Parse command line args
    const args = process.argv.slice(2);
    let mode: string;
    let input: string;
    let count: number;

    if (args.length >= 2) {
        // Non-interactive: npx tsx src/cli.ts snowball @ElGuauXD 10
        mode = args[0];
        input = args[1];
        count = parseInt(args[2]) || 10;
        console.log(chalk.cyan(`🎯 Mode: ${mode}`));
        console.log(chalk.cyan(`🔍 Input: "${input}"`));
        console.log(chalk.cyan(`📊 Max channels: ${count}`));
        console.log();
    } else {
        // Interactive mode
        const modeAnswer = await inquirer.prompt([
            {
                type: "list",
                name: "mode",
                message: chalk.cyan("🎯 How do you want to find channels?"),
                choices: [
                    { name: "🔍 Search by keywords (e.g. 'lofi hip hop 24/7')", value: "search" },
                    { name: "❄️  Snowball from slop channel (find related channels)", value: "snowball" },
                    { name: "📹 Search videos (finds more unique channels)", value: "videos" },
                ],
            },
        ]);
        mode = modeAnswer.mode;

        if (mode === "snowball") {
            const channelAnswer = await inquirer.prompt([
                {
                    type: "input",
                    name: "input",
                    message: chalk.cyan("🔗 Enter channel URL, @handle, or ID:"),
                    default: "@ElGuauXD",
                },
            ]);
            input = channelAnswer.input;
        } else {
            const keywordAnswer = await inquirer.prompt([
                {
                    type: "input",
                    name: "input",
                    message: chalk.cyan("🔍 Enter search keywords:"),
                    default: mode === "videos" ? "lofi beats 24/7 live stream" : "lofi beats 24/7",
                },
            ]);
            input = keywordAnswer.input;
        }

        const countAnswer = await inquirer.prompt([
            {
                type: "number",
                name: "count",
                message: chalk.cyan("📊 How many channels to analyze?"),
                default: 10,
            },
        ]);
        count = countAnswer.count;
        console.log();
    }

    // Step 1: Get channel IDs based on mode
    let channelIds: string[] = [];

    if (mode === "snowball") {
        const snowballSpinner = ora({
            text: chalk.yellow("❄️  Snowballing from seed channel..."),
            spinner: "dots12",
        }).start();

        try {
            // Parse and resolve channel input
            let channelId = parseChannelInput(input);
            if (!channelId) {
                // Try as direct input
                channelId = input.startsWith("@") ? input : null;
            }

            if (channelId?.startsWith("@")) {
                snowballSpinner.text = chalk.yellow(`🔍 Resolving ${channelId}...`);
                channelId = await resolveHandle(channelId);
            }

            if (!channelId) {
                throw new Error("Could not resolve channel");
            }

            snowballSpinner.text = chalk.yellow(`❄️  Finding related channels from ${channelId}...`);
            channelIds = await snowballFromChannel(channelId, count);
            snowballSpinner.succeed(chalk.green(`✅ Found ${channelIds.length} channels via snowball`));
        } catch (error) {
            snowballSpinner.fail(chalk.red("❌ Snowball failed"));
            console.error(error);
            process.exit(1);
        }
    } else if (mode === "videos") {
        const searchSpinner = ora({
            text: chalk.yellow("📹 Searching for videos..."),
            spinner: "dots12",
        }).start();

        try {
            channelIds = await searchVideosByKeyword(input, count * 3);
            channelIds = channelIds.slice(0, count);
            searchSpinner.succeed(chalk.green(`✅ Found ${channelIds.length} unique channels from videos`));
        } catch (error) {
            searchSpinner.fail(chalk.red("❌ Video search failed"));
            console.error(error);
            process.exit(1);
        }
    } else {
        // Default: search channels
        const searchSpinner = ora({
            text: chalk.yellow("🔍 Searching YouTube for channels..."),
            spinner: "dots12",
        }).start();

        try {
            channelIds = await searchChannelsByKeyword(input, count);
            searchSpinner.succeed(chalk.green(`✅ Found ${channelIds.length} channels`));
        } catch (error) {
            searchSpinner.fail(chalk.red("❌ Failed to search YouTube"));
            console.error(error);
            process.exit(1);
        }
    }

    // Step 2: Initialize DB
    const dbSpinner = ora({
        text: chalk.yellow("🗄️  Initializing database..."),
        spinner: "dots12",
    }).start();

    try {
        await initializeSchema();
        dbSpinner.succeed(chalk.green("✅ Database ready"));
    } catch (error) {
        dbSpinner.fail(chalk.red("❌ Database error"));
        console.error(error);
        process.exit(1);
    }

    // Step 3: Fetch channel metadata
    const metaSpinner = ora({
        text: chalk.yellow("📡 Fetching channel metadata..."),
        spinner: "dots12",
    }).start();

    let channels;
    try {
        channels = await fetchChannelMetadata(channelIds);
        metaSpinner.succeed(chalk.green(`✅ Fetched ${channels.length} channels`));
    } catch (error) {
        metaSpinner.fail(chalk.red("❌ Failed to fetch metadata"));
        console.error(error);
        process.exit(1);
    }

    // Step 4: Analyze each channel
    console.log();
    console.log(chalk.cyan.bold("🤖 Analyzing channels with Gemini AI..."));
    console.log();

    const results: ClassificationResult[] = [];

    for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        const spinner = ora({
            text: chalk.yellow(`  [${i + 1}/${channels.length}] ${channel.snippet.title}`),
            spinner: "dots",
        }).start();

        try {
            // Fetch recent videos
            const recentVideos = await fetchRecentVideos(channel.id, 10);

            // Normalize
            const normalized = normalizeChannel(channel, recentVideos);

            // Classify with AI
            const classification = await classifyChannel(normalized);

            // Store in DB
            await insertClassification(classification);

            results.push({
                channelId: classification.channelId,
                title: classification.title,
                classification: classification.classification,
                slopType: classification.slopType,
                confidence: classification.confidence,
            });

            const emoji = classification.classification === "SLOP" ? "🚨"
                : classification.classification === "SUSPICIOUS" ? "⚠️" : "✅";

            spinner.succeed(chalk.gray(`  [${i + 1}/${channels.length}] ${channel.snippet.title} → ${emoji} ${classification.classification}`));
        } catch (error) {
            spinner.fail(chalk.red(`  [${i + 1}/${channels.length}] ${channel.snippet.title} → ❌ Error`));
            console.error(error);
        }
    }

    // Display results
    displayResults(results);

    console.log(chalk.cyan.bold("Thanks for using Slop Detector! 🎉\n"));
}

main().catch(console.error);
