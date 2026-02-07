import { task } from "@trigger.dev/sdk/v3";
import { fetchChannelMetadata, fetchRecentVideos, snowballExpand } from "./lib/youtube";
import { normalizeChannel } from "./lib/schema";
import { classifyChannel } from "./lib/classifier";
import { insertClassification, initializeSchema } from "./lib/db";

// ============================================================
// Main Ingestion Pipeline
// ============================================================

export const ingestChannel = task({
    id: "ingest.channel",
    maxDuration: 600, // 10 minutes max

    run: async (payload: { seedChannelIds?: string[]; keywords?: string[]; expandRelated?: boolean; minSubscribers?: number; minVideos?: number }) => {
        const { seedChannelIds = [], keywords = [], expandRelated = true, minSubscribers = 0, minVideos = 0 } = payload;

        console.log(`Starting ingestion with ${seedChannelIds.length} seed channels and ${keywords.length} keywords`);
        console.log(`Filters: Min Subs=${minSubscribers}, Min Videos=${minVideos}`);

        // Step 1: Initialize DB schema (idempotent)
        console.log("Step 1: Ensuring database schema...");
        await initializeSchema();

        // Step 2: Discovery (Mixed Mode)
        console.log("Step 2: Discovery phase...");
        const channelIdSet = new Set(seedChannelIds);

        // Mode A: Topic Search (High Impact)
        if (keywords.length > 0) {
            const { searchChannelsByTopic } = await import("./lib/youtube");
            for (const keyword of keywords) {
                console.log(`Searching for active channels on topic: "${keyword}"...`);
                const found = await searchChannelsByTopic(keyword, 50);
                found.forEach(id => channelIdSet.add(id));
            }
        }

        // Mode B: Snowball (Legacy)
        if (expandRelated && seedChannelIds.length > 0) {
            console.log("Expanding related channels...");
            const expanded = await snowballExpand(seedChannelIds, 10, 30);
            expanded.forEach(id => channelIdSet.add(id));
        }

        const channelIds = Array.from(channelIdSet);
        console.log(`Total unique channels to analyze: ${channelIds.length}`);

        // Step 3: Fetch channel metadata in batches
        console.log("Step 3: Fetching channel metadata...");
        // Split into chunks of 50
        const channels = [];
        for (let i = 0; i < channelIds.length; i += 50) {
            const chunk = channelIds.slice(i, i + 50);
            const batch = await fetchChannelMetadata(chunk);
            channels.push(...batch);
        }
        console.log(`Fetched metadata for ${channels.length} channels`);

        // Step 4-7: Process each channel
        const results = [];
        for (const channel of channels) {
            try {
                // Calculate basic metrics first to Pre-Filter
                const normalized = normalizeChannel(channel, []); // Pass empty videos first just to get velocity

                // PRE-FILTERS

                // 1. Subscriber Count
                if (normalized.subscriberCount < minSubscribers) {
                    console.log(`Skipping ${channel.snippet.title} (Subs: ${normalized.subscriberCount} < ${minSubscribers})`);
                    continue;
                }

                // 2. Video Count
                if (normalized.videoCount < minVideos) {
                    console.log(`Skipping ${channel.snippet.title} (Videos: ${normalized.videoCount} < ${minVideos})`);
                    continue;
                }

                // 3. Low Velocity Check (Hard Rule)
                // If velocity < 0.5 videos/day (less than 1 video every 2 days), skip.
                // Exception: If subscriber count > 100k, maybe keep it? optimizing for slop farms.
                if (normalized.velocity < 0.5) {
                    console.log(`Skipping ${channel.snippet.title} (Low velocity: ${normalized.velocity.toFixed(2)}/day)`);
                    continue;
                }

                // Fetch recent videos for NLP (Only for survivors)
                console.log(`Processing: ${channel.snippet.title} (Vel: ${normalized.velocity.toFixed(2)})`);
                const recentVideos = await fetchRecentVideos(channel.id, 10);

                // Re-normalize with videos
                const fullNormalized = normalizeChannel(channel, recentVideos);

                // Classify (rules first, then AI if needed)
                const classification = await classifyChannel(fullNormalized);

                // Store in Neon
                await insertClassification(classification);

                results.push({
                    channelId: classification.channelId,
                    title: classification.title,
                    classification: classification.classification,
                    slopType: classification.slopType,
                    confidence: classification.confidence,
                    method: classification.method,
                });

                console.log(`  → ${classification.classification} (${classification.method}, ${classification.confidence}% confidence)`);
            } catch (error) {
                console.error(`Failed to process ${channel.id}:`, error);
            }
        }

        // Summary
        const summary = {
            total: results.length,
            slop: results.filter(r => r.classification === "SLOP").length,
            suspicious: results.filter(r => r.classification === "SUSPICIOUS").length,
            okay: results.filter(r => r.classification === "OKAY").length,
        };

        console.log("\n=== INGESTION COMPLETE ===");
        console.log(`Total: ${summary.total}`);
        console.log(`SLOP: ${summary.slop}`);
        console.log(`SUSPICIOUS: ${summary.suspicious}`);
        console.log(`OKAY: ${summary.okay}`);

        return {
            summary,
            results,
        };
    },
});
