import { schedules, tasks } from "@trigger.dev/sdk/v3";
import { SLOP_TOPICS, TRENDING_CATEGORIES } from "./lib/topics.js";
import { fetchTrendingKeywords } from "./lib/youtube.js";

// ============================================================
// Hourly Crawler Task
// ============================================================

export const crawler = schedules.task({
    id: "crawler.trending",
    // cron: "0 * * * *", // Run every hour (Disabled for Demo)
    // cron: "0 0 31 2 *", // February 31st trick failed build validation
    cron: "0 0 1 1 1", // Valid cron (Monday, Jan 1st at 00:00) but effectively disabled for demo purposes if we don't start the schedule
    maxDuration: 300, // 5 minutes to decide and trigger

    run: async (payload) => {
        console.log("🕷️ Crawler waking up...");
        const date = new Date(payload.timestamp);

        let targetKeywords: string[] = [];
        let method = "static";

        // Strategy: 10% Trending, 90% Static Slop (for better demo results)
        // This ensures we find garbage most of the time
        const coinFlip = Math.random() > 0.9;

        try {
            if (coinFlip) {
                // Method A: Dynamic Trends (The "Zeitgeist")
                console.log("🎲 Strategy: Trending Videos");
                method = "trending";

                // Fetch trending from Gaming (20) or Entertainment (24)
                // Randomly pick one
                const category = Math.random() > 0.5
                    ? TRENDING_CATEGORIES.GAMING
                    : TRENDING_CATEGORIES.ENTERTAINMENT;

                const trends = await fetchTrendingKeywords(category, 10);

                // Pick 3 random trending titles to search for
                // (searching all 10 might be too expensive/noisy)
                targetKeywords = trends
                    .sort(() => 0.5 - Math.random())
                    .slice(0, 3);

                console.log(`Found trending keywords: ${targetKeywords.join(", ")}`);
            } else {
                // Method B: Static Slop (The "Safety Net")
                console.log("🎲 Strategy: Static Topics");
                method = "static";

                // Pick 1 random topic
                const randomTopic = SLOP_TOPICS[Math.floor(Math.random() * SLOP_TOPICS.length)];
                targetKeywords = [randomTopic];
            }

            // Fallback if trends failed
            if (targetKeywords.length === 0) {
                console.log("⚠️ No keywords found, falling back to emergency static topic.");
                targetKeywords = ["Skibidi Toilet"];
            }

            // Trigger Ingestion
            console.log(`🚀 Triggering ingest for: ${targetKeywords.join(", ")}`);

            await tasks.trigger("ingest.channel", {
                keywords: targetKeywords,
                minSubscribers: 1000, // Filter out absolute noise
                minVideos: 10         // Filter out brand new spam
            });

            return {
                status: "success",
                method,
                keywords: targetKeywords
            };

        } catch (error) {
            console.error("Crawler failed:", error);
            throw error;
        }
    },
});
