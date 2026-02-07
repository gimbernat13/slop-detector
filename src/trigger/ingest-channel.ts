import { task } from "@trigger.dev/sdk/v3";
import { fetchChannelMetadata, fetchRecentVideos, snowballExpand } from "./lib/youtube.js";
import { normalizeChannel, type YouTubeChannel } from "./lib/schema.js";
import { classifyChannel } from "./lib/classifier.js";
import { insertClassification } from "./lib/db.js";

// ============================================================
// Main Ingestion Pipeline
// ============================================================

export const ingestChannel = task({
    id: "ingest.channel",
    maxDuration: 600, // 10 minutes max

    run: async (payload: { seedChannelIds?: string[]; keywords?: string[]; expandRelated?: boolean; minSubscribers?: number; minVideos?: number; targetCount?: number }) => {
        const { seedChannelIds = [], keywords = [], expandRelated = true, minSubscribers = 0, minVideos = 0, targetCount = 100 } = payload;

        console.log(`Starting ingestion. Target: ${targetCount} results.`);
        console.log(`Filters: Min Subs=${minSubscribers}, Min Videos=${minVideos}`);

        const results: { channelId: string; title: string; classification: string; slopType: string | null; confidence: number; method: string }[] = [];
        const visitedIds = new Set<string>();

        // Stats
        let skippedExisting = 0;
        let skippedLowSubs = 0;
        let skippedLowVideos = 0;
        let skippedLowVelocity = 0;

        // State for pagination
        // Map keyword -> nextPageToken
        const keywordTokens: Record<string, string | undefined> = {};
        let trendingToken: string | undefined = undefined;

        // Initialize "queue" with initial seeds
        let candidateQueue = new Set<string>(seedChannelIds);

        const startTime = Date.now();
        const MAX_RUNTIME_MS = 540000; // 9 minutes (leave 1 min buffer)

        // Utility: Check if we should stop
        const shouldStop = () => {
            if (results.length >= targetCount) return true;
            if (Date.now() - startTime > MAX_RUNTIME_MS) {
                console.log("⏳ Time limit reached. Stopping.");
                return true;
            }
            return false;
        };

        // Load DB module once
        const { getExistingChannelIds, insertClassification } = await import("./lib/db.js");
        const { fetchChannelMetadata, searchChannelsByTopic, fetchRecentVideos, snowballExpand, fetchTrendingChannelIds } = await import("./lib/youtube.js");

        let loopCount = 0;

        while (!shouldStop()) {
            loopCount++;
            console.log(`\n--- Loop ${loopCount} (Found: ${results.length}/${targetCount}) ---`);

            // If queue is empty, fetch more candidates
            if (candidateQueue.size === 0) {
                console.log("Candidate queue empty. Fetching more...");

                // Mode A: Topic Search Pagination
                if (keywords.length > 0) {
                    for (const keyword of keywords) {
                        try {
                            const currentToken = keywordTokens[keyword];
                            // If we have a token or it's the first run (undefined), go for it.
                            // If we hit end of results (null?), we skip? 
                            // API returns undefined for next page if done.
                            // But for first run key won't exist.

                            const tokenToUse = keywordTokens[keyword];

                            console.log(`Searching "${keyword}" (Page: ${tokenToUse ? 'Next' : 'First'})...`);
                            const searchRes = await searchChannelsByTopic(keyword, 50, tokenToUse);

                            searchRes.ids.forEach(id => {
                                if (!visitedIds.has(id)) candidateQueue.add(id);
                            });

                            keywordTokens[keyword] = searchRes.nextPageToken; // Update token
                        } catch (e) {
                            console.error(`Search failed for ${keyword}:`, e);
                        }
                    }
                }

                // Mode B: Trending Pagination (fallback if no keywords)
                if (keywords.length === 0 && candidateQueue.size === 0) {
                    console.log(`Fetching trending channels (Page: ${trendingToken ? 'Next' : 'First'})...`);
                    try {
                        const trendingRes = await fetchTrendingChannelIds(undefined, 50, trendingToken);

                        trendingRes.ids.forEach(id => {
                            if (!visitedIds.has(id)) candidateQueue.add(id);
                        });
                        trendingToken = trendingRes.nextPageToken;
                    } catch (e) {
                        console.error("Trending fetch failed:", e);
                    }
                }

                // Mode C: Snowball from successful results (if enabled)
                if (expandRelated && results.length > 0 && candidateQueue.size < 50) {
                    // Pick last 5 winners to snowball
                    const seeders = results.slice(-5).map(r => r.channelId);
                    console.log(`Snowballing from ${seeders.length} recent winners...`);
                    const related = await snowballExpand(seeders, 10, 50);
                    related.forEach(id => {
                        if (!visitedIds.has(id)) candidateQueue.add(id);
                    });
                }
            }

            // If still empty, we are out of ideas
            if (candidateQueue.size === 0) {
                console.log("⚠️ No more candidates found. Stopping.");
                break;
            }

            // --- Process Queue ---
            const batchIds = Array.from(candidateQueue).slice(0, 50); // Take max 50
            batchIds.forEach(id => candidateQueue.delete(id)); // Remove from queue
            batchIds.forEach(id => visitedIds.add(id)); // Mark visited

            // 1. Filter Existing in DB
            const existingIds = await getExistingChannelIds(batchIds);
            const newChannelIds = batchIds.filter(id => !existingIds.has(id));
            skippedExisting += existingIds.size;

            if (newChannelIds.length === 0) {
                console.log("All candidates in this batch were duplicates. Skipping fetch.");
                continue;
            }

            console.log(`Processing ${newChannelIds.length} new channels...`);

            // 2. Fetch Metadata
            const channels = await fetchChannelMetadata(newChannelIds);

            // 3. Analyze
            for (const channel of channels) {
                if (shouldStop()) break;

                try {
                    const normalized = normalizeChannel(channel, []);

                    // Pre-Filters
                    if (normalized.subscriberCount < minSubscribers) {
                        skippedLowSubs++;
                        continue;
                    }
                    if (normalized.videoCount < minVideos) {
                        skippedLowVideos++;
                        continue;
                    }
                    // Low Velocity Check (< 0.5/day)
                    if (normalized.velocity < 0.5) {
                        skippedLowVelocity++;
                        continue;
                    }

                    console.log(`Analyzing: ${channel.snippet.title}`);
                    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
                    const recentVideos = uploadsPlaylistId
                        ? await fetchRecentVideos(uploadsPlaylistId, 10)
                        : [];

                    const fullNormalized = normalizeChannel(channel, recentVideos);
                    const classification = await classifyChannel(fullNormalized);

                    await insertClassification(classification);

                    results.push({
                        channelId: classification.channelId,
                        title: classification.title,
                        classification: classification.classification,
                        slopType: classification.slopType,
                        confidence: classification.confidence,
                        method: classification.method,
                    });
                    console.log(`  → ${classification.classification}`);

                } catch (error) {
                    console.error(`Error analyzing ${channel.id}:`, error);
                }
            }
        }

        const summary = {
            total: results.length,
            slop: results.filter(r => r.classification === "SLOP").length,
            suspicious: results.filter(r => r.classification === "SUSPICIOUS").length,
            okay: results.filter(r => r.classification === "OKAY").length,
            skipped: {
                existing: skippedExisting,
                lowSubs: skippedLowSubs,
                lowVideos: skippedLowVideos,
                lowVelocity: skippedLowVelocity
            }
        };

        console.log("\n=== INGESTION COMPLETE ===");
        console.log(JSON.stringify(summary, null, 2));

        return {
            summary,
            results,
        };
    },
});
