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

    run: async (payload: { seedChannelIds: string[]; expandRelated?: boolean }) => {
        const { seedChannelIds, expandRelated = true } = payload;

        console.log(`Starting ingestion with ${seedChannelIds.length} seed channels`);

        // Step 1: Initialize DB schema (idempotent)
        console.log("Step 1: Ensuring database schema...");
        await initializeSchema();

        // Step 2: Snowball expand to find related channels
        let channelIds = seedChannelIds;
        if (expandRelated) {
            console.log("Step 2: Expanding to related channels...");
            channelIds = await snowballExpand(seedChannelIds, 10, 30);
            console.log(`Expanded to ${channelIds.length} channels`);
        }

        // Step 3: Fetch channel metadata in batches
        console.log("Step 3: Fetching channel metadata...");
        const channels = await fetchChannelMetadata(channelIds.slice(0, 50)); // API limit
        console.log(`Fetched metadata for ${channels.length} channels`);

        // Step 4-7: Process each channel
        const results = [];
        for (const channel of channels) {
            try {
                // Fetch recent videos for NLP
                console.log(`Processing: ${channel.snippet.title}`);
                const recentVideos = await fetchRecentVideos(channel.id, 10);

                // Normalize
                const normalized = normalizeChannel(channel, recentVideos);

                // Classify (rules first, then AI if needed)
                const classification = await classifyChannel(normalized);

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
