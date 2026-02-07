import { task } from "@trigger.dev/sdk/v3";
import { fetchChannelMetadata, fetchRecentVideos } from "./lib/youtube.js";
import { normalizeChannel } from "@slop-detector/shared";
import { classifyChannel, classifyByRules } from "./lib/classifier.js";
import { insertClassification } from "./lib/db.js";

// ============================================================
// Main Ingestion Pipeline
// ============================================================

export const ingestChannel = task({
    id: "ingest.channel",
    maxDuration: 600, // 10 minutes max

    run: async (payload: {
        seedChannelIds?: string[];
        keywords?: string[];
        minSubscribers?: number;
        minVideos?: number;
        targetCount?: number;
        forceFresh?: boolean;
        duration?: "long" | "short" | "any";
    }) => {
        const {
            seedChannelIds = [],
            keywords = [],
            minSubscribers = 0,
            minVideos = 0,
            targetCount = 100,
            forceFresh = false,
            duration = "any"
        } = payload;

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
        const { fetchChannelMetadata, searchChannelsByTopic, fetchRecentVideos, fetchTrendingChannelIds } = await import("./lib/youtube.js");

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

                            console.log(`Searching "${keyword}" (Page: ${tokenToUse ? 'Next' : 'First'}, Duration: ${duration})...`);
                            const searchRes = await searchChannelsByTopic(keyword, 50, tokenToUse, duration);

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

                // Mode C: Snowball removed
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

            // 1. Filter Existing in DB (unless forceFresh is true)
            let newChannelIds = batchIds;
            if (!forceFresh) {
                const existingIds = await getExistingChannelIds(batchIds);
                newChannelIds = batchIds.filter(id => !existingIds.has(id));
                skippedExisting += existingIds.size;
            } else {
                console.log(`Force fresh enabled. Reprocessing ${batchIds.length} candidates...`);
            }

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
                    const normalizedPreview = normalizeChannel(channel, []);

                    // Pre-Filters
                    if (normalizedPreview.subscriberCount < minSubscribers) {
                        skippedLowSubs++;
                        continue;
                    }
                    if (normalizedPreview.videoCount < minVideos) {
                        skippedLowVideos++;
                        continue;
                    }
                    // Low Velocity Check (< 0.01/day = ~1 video every 100 days)
                    if (normalizedPreview.velocity < 0.01) {
                        skippedLowVelocity++;
                        continue;
                    }

                    console.log(`Analyzing: ${channel.snippet.title}`);
                    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
                    const recentVideosData = uploadsPlaylistId
                        ? await fetchRecentVideos(uploadsPlaylistId, 10)
                        : [];

                    const latestVideoId = recentVideosData.length > 0 ? recentVideosData[0].id : undefined;

                    // Pass rich data to normalizer
                    const normalized = normalizeChannel(channel, recentVideosData, latestVideoId);

                    console.log(`  > Metadata Check: ${normalized.recentVideos.length} videos`);
                    if (normalized.recentVideos.length > 0) {
                        console.log(`  > First Video Sample: "${normalized.recentVideos[0].title}" | Tags: ${normalized.recentVideos[0].tags?.length || 0}`);
                    }

                    console.log(`  > Recent Velocity: ${normalized.recentVelocity.toFixed(2)}/day (Lifetime: ${normalized.velocity.toFixed(2)})`);

                    const classification = await classifyChannel(normalized);

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
