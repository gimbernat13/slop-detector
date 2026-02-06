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
// YouTube Search
// ============================================================

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

    // Parse command line args: npx tsx src/cli.ts "lofi beats" 5
    const args = process.argv.slice(2);
    let keywords: string;
    let count: number;

    if (args.length >= 1) {
        // Non-interactive mode
        keywords = args[0];
        count = parseInt(args[1]) || 5;
        console.log(chalk.cyan(`🔍 Keywords: "${keywords}"`));
        console.log(chalk.cyan(`📊 Channels to analyze: ${count}`));
        console.log();
    } else {
        // Interactive mode
        const answers1 = await inquirer.prompt([
            {
                type: "input",
                name: "keywords",
                message: chalk.cyan("🔍 Enter search keywords (e.g. 'lofi hip hop 24/7', 'kids nursery rhymes'):"),
                default: "lofi beats 24/7",
            },
        ]);
        keywords = answers1.keywords;

        const answers2 = await inquirer.prompt([
            {
                type: "number",
                name: "count",
                message: chalk.cyan("📊 How many channels to analyze?"),
                default: 5,
            },
        ]);
        count = answers2.count;
        console.log();
    }

    // Step 1: Search channels
    const searchSpinner = ora({
        text: chalk.yellow("🔍 Searching YouTube for channels..."),
        spinner: "dots12",
    }).start();

    let channelIds: string[];
    try {
        channelIds = await searchChannelsByKeyword(keywords, count);
        searchSpinner.succeed(chalk.green(`✅ Found ${channelIds.length} channels`));
    } catch (error) {
        searchSpinner.fail(chalk.red("❌ Failed to search YouTube"));
        console.error(error);
        process.exit(1);
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
