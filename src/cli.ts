#!/usr/bin/env npx tsx

import ora from "ora";
import chalk from "chalk";
import inquirer from "inquirer";
import Table from "cli-table3";
import cliProgress from "cli-progress";
import gradient from "gradient-string";
import figlet from "figlet";
import boxen from "boxen";
import { config } from "dotenv";

// Load env vars
config();

// Import lib modules directly
import { fetchChannelMetadata, fetchRecentVideos } from "./trigger/lib/youtube";
import { normalizeChannel } from "./trigger/lib/schema";
import { classifyChannel } from "./trigger/lib/classifier";
import { insertClassification, initializeSchema } from "./trigger/lib/db";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

// Custom gradient theme
const coolGradient = gradient(["#00d4ff", "#9333ea", "#ff0080"]);
const slopGradient = gradient(["#ff0000", "#ff6600", "#ffcc00"]);
const okGradient = gradient(["#00ff00", "#00cc00", "#009900"]);

// ============================================================
// Banner - ASCII Art with Gradient
// ============================================================

function printBanner() {
    console.clear();

    const title = figlet.textSync("SLOP DETECTOR", {
        font: "Small",
        horizontalLayout: "default",
    });

    console.log("\n" + coolGradient(title));

    console.log(boxen(
        chalk.white("🔍 AI-Powered YouTube Spam Channel Detector\n") +
        chalk.gray("   Built with Trigger.dev + Gemini AI"),
        {
            padding: 1,
            margin: { top: 0, bottom: 1, left: 2, right: 2 },
            borderStyle: "round",
            borderColor: "cyan",
        }
    ));
}

// ============================================================
// YouTube Search Functions
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
    return [...new Set(channelIds)] as string[];
}

function parseChannelInput(input: string): string | null {
    if (input.startsWith("@")) return input;
    if (input.startsWith("UC") && input.length === 24) return input;
    const channelMatch = input.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (channelMatch) return channelMatch[1];
    const handleMatch = input.match(/youtube\.com\/@([a-zA-Z0-9_-]+)/);
    if (handleMatch) return `@${handleMatch[1]}`;
    return null;
}

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
    return data.items?.[0]?.snippet?.channelId || null;
}

async function snowballFromChannel(channelId: string, maxChannels = 20): Promise<string[]> {
    const videos = await fetchRecentVideos(channelId, 5);
    if (videos.length === 0) return [channelId];

    const allChannelIds = new Set<string>([channelId]);

    for (const videoTitle of videos.slice(0, 3)) {
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
// Display Results with Style
// ============================================================

interface ClassificationResult {
    channelId: string;
    title: string;
    classification: string;
    slopType: string | null;
    confidence: number;
}

function displayResults(results: ClassificationResult[]) {
    const slop = results.filter(r => r.classification === "SLOP").length;
    const suspicious = results.filter(r => r.classification === "SUSPICIOUS").length;
    const okay = results.filter(r => r.classification === "OKAY").length;

    console.log("\n");

    // Summary box
    const summaryText = [
        `${chalk.bold("📊 Analysis Complete")}`,
        "",
        `   Total Analyzed: ${chalk.cyan.bold(results.length)}`,
        `   ${slopGradient("🚨 SLOP:")} ${chalk.red.bold(slop)}`,
        `   ${chalk.yellow("⚠️  SUSPICIOUS:")} ${chalk.yellow.bold(suspicious)}`,
        `   ${okGradient("✅ OKAY:")} ${chalk.green.bold(okay)}`,
    ].join("\n");

    console.log(boxen(summaryText, {
        padding: 1,
        margin: { top: 0, bottom: 1, left: 2, right: 2 },
        borderStyle: "double",
        borderColor: slop > 0 ? "red" : suspicious > 0 ? "yellow" : "green",
        title: "Results",
        titleAlignment: "center",
    }));

    // Results table
    const table = new Table({
        head: [
            chalk.cyan.bold("Channel"),
            chalk.cyan.bold("Status"),
            chalk.cyan.bold("Type"),
            chalk.cyan.bold("Conf."),
        ],
        colWidths: [32, 18, 16, 8],
        style: {
            head: [],
            border: ["gray"],
        },
        chars: {
            "top": "─", "top-mid": "┬", "top-left": "╭", "top-right": "╮",
            "bottom": "─", "bottom-mid": "┴", "bottom-left": "╰", "bottom-right": "╯",
            "left": "│", "left-mid": "├", "mid": "─", "mid-mid": "┼",
            "right": "│", "right-mid": "┤", "middle": "│"
        },
    });

    for (const result of results) {
        const status = result.classification === "SLOP"
            ? chalk.bgRed.white.bold(" SLOP ")
            : result.classification === "SUSPICIOUS"
                ? chalk.bgYellow.black(" SUSPICIOUS ")
                : chalk.bgGreen.white(" OKAY ");

        const slopType = result.slopType
            ? chalk.magenta(result.slopType)
            : chalk.gray("—");

        const conf = result.confidence >= 80
            ? chalk.red.bold(`${result.confidence}%`)
            : result.confidence >= 50
                ? chalk.yellow(`${result.confidence}%`)
                : chalk.gray(`${result.confidence}%`);

        table.push([
            result.title.slice(0, 30),
            status,
            slopType,
            conf,
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
        console.log(chalk.red("  ❌ YOUTUBE_API_KEY not set in .env\n"));
        process.exit(1);
    }
    if (!process.env.GEMINI_API_KEY) {
        console.log(chalk.red("  ❌ GEMINI_API_KEY not set in .env\n"));
        process.exit(1);
    }

    // Parse command line args
    const args = process.argv.slice(2);
    let mode: string;
    let input: string;
    let count: number;
    let minSubs = 0;
    let maxSubs = Infinity;

    if (args.length >= 2) {
        mode = args[0];
        input = args[1];
        count = parseInt(args[2]) || 10;
        // Optional: --min-subs=1000 --max-subs=1000000
        for (const arg of args) {
            if (arg.startsWith("--min-subs=")) minSubs = parseInt(arg.split("=")[1]) || 0;
            if (arg.startsWith("--max-subs=")) maxSubs = parseInt(arg.split("=")[1]) || Infinity;
        }

        console.log(boxen(
            `${chalk.cyan("Mode:")} ${chalk.white.bold(mode)}\n` +
            `${chalk.cyan("Input:")} ${chalk.white.bold(input)}\n` +
            `${chalk.cyan("Max channels:")} ${chalk.white.bold(count)}\n` +
            `${chalk.cyan("Subs filter:")} ${chalk.white.bold(minSubs.toLocaleString())} - ${chalk.white.bold(maxSubs === Infinity ? "∞" : maxSubs.toLocaleString())}`,
            { padding: { left: 2, right: 2, top: 0, bottom: 0 }, borderStyle: "round", borderColor: "gray" }
        ));
        console.log();
    } else {
        // Interactive mode with nice prompts
        const modeAnswer = await inquirer.prompt([
            {
                type: "list",
                name: "mode",
                message: chalk.cyan.bold("🎯 Select discovery mode:"),
                choices: [
                    {
                        name: `${chalk.green("❄️  Snowball")} ${chalk.gray("— Find related channels from a seed")}`,
                        value: "snowball"
                    },
                    {
                        name: `${chalk.blue("📹 Video Search")} ${chalk.gray("— Search videos, get unique channels")}`,
                        value: "videos"
                    },
                    {
                        name: `${chalk.yellow("🔍 Channel Search")} ${chalk.gray("— Direct channel keyword search")}`,
                        value: "search"
                    },
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
                    default: mode === "videos" ? "lofi beats 24/7 live stream" : "lofi hip hop",
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

        // Filter options
        const filterAnswer = await inquirer.prompt([
            {
                type: "list",
                name: "filter",
                message: chalk.cyan("🎚️  Filter by subscriber count?"),
                choices: [
                    { name: `${chalk.gray("No filter")} — Analyze all channels`, value: "none" },
                    { name: `${chalk.yellow("Small")} — Under 10K subscribers`, value: "small" },
                    { name: `${chalk.blue("Medium")} — 10K - 100K subscribers`, value: "medium" },
                    { name: `${chalk.green("Large")} — 100K - 1M subscribers`, value: "large" },
                    { name: `${chalk.magenta("Huge")} — Over 1M subscribers`, value: "huge" },
                    { name: `${chalk.cyan("Custom")} — Set custom range`, value: "custom" },
                ],
            },
        ]);

        if (filterAnswer.filter === "small") {
            minSubs = 0; maxSubs = 10000;
        } else if (filterAnswer.filter === "medium") {
            minSubs = 10000; maxSubs = 100000;
        } else if (filterAnswer.filter === "large") {
            minSubs = 100000; maxSubs = 1000000;
        } else if (filterAnswer.filter === "huge") {
            minSubs = 1000000; maxSubs = Infinity;
        } else if (filterAnswer.filter === "custom") {
            const customAnswer = await inquirer.prompt([
                { type: "number", name: "minSubs", message: chalk.cyan("Min subscribers:"), default: 0 },
                { type: "number", name: "maxSubs", message: chalk.cyan("Max subscribers:"), default: 1000000 },
            ]);
            minSubs = customAnswer.minSubs;
            maxSubs = customAnswer.maxSubs;
        }
        console.log();
    }

    // Progress bar setup
    const progressBar = new cliProgress.SingleBar({
        format: `  ${chalk.cyan("{bar}")} ${chalk.gray("|")} {percentage}% ${chalk.gray("|")} {value}/{total} ${chalk.gray("|")} {task}`,
        barCompleteChar: "█",
        barIncompleteChar: "░",
        hideCursor: true,
    }, cliProgress.Presets.shades_grey);

    // Step 1: Get channel IDs
    let channelIds: string[] = [];
    const discoverySpinner = ora({
        text: chalk.yellow(`  Discovering channels...`),
        spinner: "dots12",
    }).start();

    try {
        if (mode === "snowball") {
            discoverySpinner.text = chalk.yellow("  Resolving seed channel...");
            let channelId = parseChannelInput(input) || (input.startsWith("@") ? input : null);

            if (channelId?.startsWith("@")) {
                channelId = await resolveHandle(channelId);
            }

            if (!channelId) throw new Error("Could not resolve channel");

            discoverySpinner.text = chalk.yellow("  Snowballing to find related channels...");
            channelIds = await snowballFromChannel(channelId, count);
            discoverySpinner.succeed(chalk.green(`  ❄️  Found ${channelIds.length} related channels`));
        } else if (mode === "videos") {
            channelIds = await searchVideosByKeyword(input, count * 3);
            channelIds = channelIds.slice(0, count);
            discoverySpinner.succeed(chalk.green(`  📹 Found ${channelIds.length} channels from video search`));
        } else {
            channelIds = await searchChannelsByKeyword(input, count);
            discoverySpinner.succeed(chalk.green(`  🔍 Found ${channelIds.length} channels`));
        }
    } catch (error) {
        discoverySpinner.fail(chalk.red("  ❌ Discovery failed"));
        console.error(error);
        process.exit(1);
    }

    // Step 2: Initialize DB
    const dbSpinner = ora({ text: chalk.yellow("  Initializing database..."), spinner: "dots" }).start();
    try {
        await initializeSchema();
        dbSpinner.succeed(chalk.green("  📦 Database ready"));
    } catch (error) {
        dbSpinner.fail(chalk.red("  ❌ Database error"));
        process.exit(1);
    }

    // Step 3: Fetch metadata
    const metaSpinner = ora({ text: chalk.yellow("  Fetching channel metadata..."), spinner: "dots" }).start();
    let channels;
    try {
        const allChannels = await fetchChannelMetadata(channelIds);

        // Apply subscriber filter
        channels = allChannels.filter((ch: any) => {
            const subs = parseInt(ch.statistics?.subscriberCount || "0");
            return subs >= minSubs && subs <= maxSubs;
        });

        if (channels.length < allChannels.length) {
            metaSpinner.succeed(chalk.green(`  📡 Loaded ${allChannels.length} channels, ${chalk.yellow(channels.length)} after filter`));
        } else {
            metaSpinner.succeed(chalk.green(`  📡 Loaded ${channels.length} channels`));
        }
    } catch (error) {
        metaSpinner.fail(chalk.red("  ❌ Metadata fetch failed"));
        process.exit(1);
    }

    // Step 4: Analyze with progress bar
    console.log();
    console.log(chalk.cyan.bold("  🤖 Analyzing with Gemini AI...\n"));

    progressBar.start(channels.length, 0, { task: "Starting..." });

    const results: ClassificationResult[] = [];

    for (let i = 0; i < channels.length; i++) {
        const channel = channels[i];
        progressBar.update(i, { task: channel.snippet.title.slice(0, 30) });

        try {
            const recentVideos = await fetchRecentVideos(channel.id, 10);
            const normalized = normalizeChannel(channel, recentVideos);
            const classification = await classifyChannel(normalized);
            await insertClassification(classification);

            results.push({
                channelId: classification.channelId,
                title: classification.title,
                classification: classification.classification,
                slopType: classification.slopType,
                confidence: classification.confidence,
            });

            progressBar.update(i + 1, {
                task: `${channel.snippet.title.slice(0, 20)} → ${classification.classification}`
            });
        } catch (error) {
            progressBar.update(i + 1, { task: `Error: ${channel.snippet.title.slice(0, 20)}` });
        }
    }

    progressBar.stop();

    // Display results
    displayResults(results);

    // Final message
    console.log(boxen(
        coolGradient("Thanks for using Slop Detector! 🎉"),
        {
            padding: { left: 2, right: 2, top: 0, bottom: 0 },
            borderStyle: "round",
            borderColor: "cyan",
            textAlignment: "center",
        }
    ));
    console.log();
}

main().catch(console.error);
