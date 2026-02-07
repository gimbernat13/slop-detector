import { normalizeChannel } from "@slop-detector/shared";
import { fetchChannelMetadata, fetchRecentVideos } from "./src/trigger/lib/youtube.js";
import { classifyChannel } from "./src/trigger/lib/classifier.js";
import { insertClassification } from "./src/trigger/lib/db.js";
import { loadEnv } from "./src/trigger/lib/env.js";
import { config } from "dotenv";

config();
loadEnv();

async function retest(handle: string) {
    console.log(`\n🔍 Retesting: ${handle}`);

    // 1. Resolve handle to ID (simple search)
    const { getApiKey } = await import("./src/trigger/lib/youtube.js");
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", handle);
    searchUrl.searchParams.set("type", "channel");
    searchUrl.searchParams.set("maxResults", "1");
    searchUrl.searchParams.set("key", process.env.YOUTUBE_API_KEY!);

    const sRes = await fetch(searchUrl.toString());
    const sData = await sRes.json() as any;
    const channelId = sData.items?.[0]?.snippet?.channelId;

    if (!channelId) {
        console.error(`Could not resolve ${handle}`);
        return;
    }

    console.log(`✅ Resolved to: ${channelId}`);

    // 2. Fetch Rich Metadata
    const channels = await fetchChannelMetadata([channelId]);
    const channel = channels[0];
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;

    console.log(`Fetching videos for ${channel.snippet.title}...`);
    const recentVideosData = await fetchRecentVideos(uploadsPlaylistId, 10);

    // 3. Classify
    const normalized = normalizeChannel(channel, recentVideosData, recentVideosData[0]?.id);

    console.log("--- Enrichment Data Check ---");
    console.log(`Category: ${normalized.categoryId}`);
    console.log(`First Video Tags: ${normalized.recentVideos[0]?.tags?.join(", ")}`);
    console.log(`First Video Duration: ${normalized.recentVideos[0]?.duration}`);

    const result = await classifyChannel(normalized);
    console.log(`\nRESULT: [${result.classification}] Confidence: ${result.confidence}%`);
    console.log(`Reasoning: ${result.aiAnalysis?.reasoning || result.reasons[0]}`);

    // 4. Persist
    await insertClassification(result);
    console.log("✅ Persisted to DB.");
}

async function runAll() {
    await retest("@JeffGeerling");
    await retest("@GamersNexus");
    await retest("@Blippi");
}

runAll().catch(console.error);
