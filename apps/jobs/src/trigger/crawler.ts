import { schedules, tasks } from "@trigger.dev/sdk/v3";
import { fetchTrendingChannelIds } from "./lib/youtube.js";

// ============================================================
// Hourly Trend Surfing Crawler
// ============================================================

export const crawler = schedules.task({
    id: "crawler.trending",
    cron: "0 * * * *", // Run every hour
    maxDuration: 300, // 5 minutes to decide and trigger

    run: async (payload) => {
        console.log("🌊 Trend Surfer waking up...");

        try {
            // 1. Trending Fetch (The "Base Layer")
            console.log("Fetching Top 50 Trending Channels across 5 categories...");
            const [gaming, entertainment, film, people, tech] = await Promise.all([
                fetchTrendingChannelIds("20", 50),
                fetchTrendingChannelIds("24", 50),
                fetchTrendingChannelIds("1", 50),
                fetchTrendingChannelIds("22", 50),
                fetchTrendingChannelIds("28", 50)
            ]);

            const trendingIds = new Set([
                ...gaming.ids, ...entertainment.ids, ...film.ids, ...people.ids, ...tech.ids
            ]);

            // 2. Topic Rotation (The "Infinite Layer")
            const SLOP_TOPICS = [
                "minecraft but", "skibidi toilet", "asmr eating", "crypto news",
                "fortnite glitch", "roblox story", "gta 6 leak", "ai tools",
                "lofi hip hop 24/7", "meditation music", "satisfying slime",
                "life hacks", "prank", "reaction", "mr beast clone"
            ];

            // Pick 3 random topics
            const randomTopics = SLOP_TOPICS.sort(() => 0.5 - Math.random()).slice(0, 3);
            console.log(`🎲 Rotating Topics: ${randomTopics.join(", ")}`);

            // Trigger Ingestion with Seeds + Topics
            await tasks.trigger("ingest.channel", {
                seedChannelIds: Array.from(trendingIds),
                keywords: randomTopics, // Ingest will search these pages
                minSubscribers: 0,
                minVideos: 5,
                targetCount: 150, // Higher target for combo run
                forceFresh: false // Let DB filter duplicates, but topics will find new ones
            });

            return {
                status: "success",
                method: "hybrid_crawler",
                count: trendingIds.size,
                topics: randomTopics
            };

        } catch (error) {
            console.error("Crawler failed:", error);
            throw error;
        }
    },
});
