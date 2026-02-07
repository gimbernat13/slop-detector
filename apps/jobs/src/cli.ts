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
import { tasks, runs } from "@trigger.dev/sdk/v3";

// Load env vars
config();

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
// Helpers
// ============================================================

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

async function resolveHandle(handle: string): Promise<string | null> {
    if (!YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY not set");

    const url = new URL(`${YOUTUBE_API_BASE}/search`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "channel");
    url.searchParams.set("q", handle);
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("key", YOUTUBE_API_KEY);

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = await response.json() as any;
    return data.items?.[0]?.snippet?.channelId || null;
}

async function parseChannelInput(input: string): Promise<string> {
    if (input.startsWith("UC") && input.length === 24) return input;

    // Resolve handles or keywords
    const inputClean = input.startsWith("@") ? input : `@${input}`;
    const spinner = ora(chalk.yellow(`Resolving ${input}...`)).start();

    try {
        const resolvedId = await resolveHandle(inputClean);
        if (resolvedId) {
            spinner.succeed(chalk.green(`Resolved to ${resolvedId}`));
            return resolvedId;
        } else {
            spinner.fail(chalk.red(`Could not resolve handle. Using raw input.`));
            return input;
        }
    } catch (e) {
        spinner.fail(chalk.red(`Resolution failed due to missing API key or error.`));
        return input;
    }
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

interface RunSummary {
    total: number;
    slop: number;
    suspicious: number;
    okay: number;
    skipped?: {
        existing: number;
        lowSubs: number;
        lowVideos: number;
        lowVelocity: number;
    };
}

function displayResults(results: ClassificationResult[], summary?: RunSummary) {
    const slop = summary?.slop ?? results.filter(r => r.classification === "SLOP").length;
    const suspicious = summary?.suspicious ?? results.filter(r => r.classification === "SUSPICIOUS").length;
    const okay = summary?.okay ?? results.filter(r => r.classification === "OKAY").length;

    console.log("\n");

    // Summary box
    const summaryLines = [
        `${chalk.bold("📊 Analysis Complete")}`,
        "",
        `   Total Analyzed: ${chalk.cyan.bold(results.length)}`,
        `   ${slopGradient("🚨 SLOP:")} ${chalk.red.bold(slop)}`,
        `   ${chalk.yellow("⚠️  SUSPICIOUS:")} ${chalk.yellow.bold(suspicious)}`,
        `   ${okGradient("✅ OKAY:")} ${chalk.green.bold(okay)}`,
    ];

    if (summary?.skipped) {
        summaryLines.push("");
        summaryLines.push(chalk.gray("   --- Skipped ---"));
        summaryLines.push(`   Done/Duplicate: ${chalk.gray(summary.skipped.existing)}`);
        summaryLines.push(`   Low Velocity:   ${chalk.gray(summary.skipped.lowVelocity)}`);
        summaryLines.push(`   Small/New:      ${chalk.gray(summary.skipped.lowSubs + summary.skipped.lowVideos)}`);
    }

    const summaryText = summaryLines.join("\n");

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

    // Interactive mode
    const modeAnswer = await inquirer.prompt([
        {
            type: "list",
            name: "mode",
            message: chalk.cyan.bold("🎯 Select discovery mode:"),
            choices: [

                {
                    name: `  ${chalk.magenta.bold("🔍 Topic Search")}    ${chalk.gray("→ Find active channels posting about a topic")}`,
                    value: "topic",
                },
                {
                    name: `  ${chalk.yellow.bold("🌊 Trend Surfing")}    ${chalk.gray("→ Ingest Top 50 Trending Channels DIRECTLY")}`,
                    value: "trending",
                },
            ],
            loop: false,
        },
    ]);

    let triggerPayload: any = {};

    if (modeAnswer.mode === "trending") {
        console.log(chalk.yellow("🌊 Fetching Top 50 Trending Channels..."));
        const { fetchTrendingChannelIds } = await import("./trigger/lib/youtube.js");
        // Fetch Gaming (20) and Entertainment (24)
        const { ids: textIds } = await fetchTrendingChannelIds("24", 25);
        const { ids: gameIds } = await fetchTrendingChannelIds("20", 25);
        const allIds = [...new Set([...textIds, ...gameIds])]; // Unique

        console.log(chalk.green(`✅ Found ${allIds.length} unique trending channels.`));
        triggerPayload = { seedChannelIds: allIds };

    } else {
        const topicAnswer = await inquirer.prompt([
            {
                type: "input",
                name: "topic",
                message: chalk.cyan("🔍 Enter topic (e.g. 'Skibidi Toilet', 'Lofi AI'):"),
                validate: (input) => input.length > 3 ? true : "Please enter a valid topic",
            },
        ]);
        triggerPayload = { keywords: [topicAnswer.topic] };
    }

    // Optional Filters
    const filterAnswer = await inquirer.prompt([
        {
            type: "number",
            name: "targetCount",
            message: chalk.cyan("🎯 Target Result Count (guaranteed analysis):"),
            default: 100,
        },
        {
            type: "number",
            name: "minSubscribers",
            message: chalk.cyan("📉 Min Subscribers (filter small channels):"),
            default: 0,
        },
        {
            type: "number",
            name: "minVideos",
            message: chalk.cyan("🎥 Min Video Count (filter new channels):"),
            default: 10,
        },
    ]);

    // Merge filters into payload
    triggerPayload = {
        ...triggerPayload,
        targetCount: filterAnswer.targetCount,
        minSubscribers: filterAnswer.minSubscribers,
        minVideos: filterAnswer.minVideos,
    };

    // Trigger the task
    const spinner = ora(chalk.cyan("🚀 Triggering task 'ingest.channel'...")).start();

    try {
        const handle = await tasks.trigger("ingest.channel", triggerPayload);

        spinner.succeed(chalk.green(`Task triggered! Run ID: ${handle.id}`));
        console.log(chalk.gray(`   View at: https://cloud.trigger.dev/runs/${handle.id}`));

        // Poll for completion
        const pollSpinner = ora(chalk.yellow("⏳ Waiting for task to complete...")).start();

        let run;
        while (true) {
            run = await runs.retrieve(handle.id);

            if (run.status === "COMPLETED" || run.status === "FAILED" || run.status === "CANCELED" || run.status === "CRASHED" || run.status === "SYSTEM_FAILURE") {
                break;
            }

            // Update spinner with duration or status
            pollSpinner.text = chalk.yellow(`⏳ Task is ${run.status}... (${run.durationMs ? (run.durationMs / 1000).toFixed(1) + 's' : 'running'})`);
            await new Promise(r => setTimeout(r, 1000));
        }

        if (run.status === "COMPLETED") {
            pollSpinner.succeed(chalk.green("Task completed successfully!"));

            if (run.output && run.output.results) {
                displayResults(run.output.results, run.output.summary);
            } else {
                console.log(chalk.yellow("No results returned in output."));
                console.log(run.output);
            }
        } else {
            pollSpinner.fail(chalk.red(`Task finished with status: ${run.status}`));
            if (run.error) {
                console.error(chalk.red(run.error.message));
            }
        }

    } catch (error) {
        spinner.fail(chalk.red("Failed to trigger task"));
        console.error(error);
        if (error instanceof Error && error.message.includes("TRIGGER_SECRET_KEY")) {
            console.log(chalk.yellow("\n💡 You need to set TRIGGER_SECRET_KEY in .env to invoke tasks."));
        }
    }
}

main().catch(console.error);
