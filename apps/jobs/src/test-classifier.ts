
import { fetchChannelMetadata, fetchRecentVideos } from "./trigger/lib/youtube.js";
import { normalizeChannel } from "@slop-detector/shared";
import { classifyChannel } from "./trigger/lib/classifier.js";
import { loadEnv } from "./trigger/lib/env.js";

async function main() {
    loadEnv();
    const args = process.argv.slice(2);
    const forceAiIndex = args.indexOf("--force-ai");
    const forceAi = forceAiIndex !== -1;

    if (forceAi) {
        args.splice(forceAiIndex, 1);
    }

    let channelId = args[0];

    if (!channelId) {
        console.error("Usage: npx tsx src/test-classifier.ts <CHANNEL_ID_OR_SEARCH_TERM> [--force-ai]");
        process.exit(1);
    }

    // If not a Channel ID (starting with UC), search for it
    if (!channelId.startsWith("UC")) {
        console.log(`\n🔎 Searching for channel matching: "${channelId}"...`);
        const { searchChannelsByTopic } = await import("./trigger/lib/youtube.js");
        const results = await searchChannelsByTopic(channelId, 1);
        if (results.ids.length === 0) {
            console.error("❌ No channels found for that search term.");
            return;
        }
        channelId = results.ids[0];
        console.log(`✅ Found top result: ${channelId}`);
    }

    console.log(`\n🔍 Fetching metadata for channel: ${channelId}...`);

    try {
        const channels = await fetchChannelMetadata([channelId]);
        if (channels.length === 0) {
            console.error("❌ Channel not found or API error.");
            return;
        }

        const channel = channels[0];
        console.log(`Title: ${channel.snippet.title}`);

        const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
        console.log(`Uploads Playlist: ${uploadsPlaylistId}`);

        const recentVideosData = uploadsPlaylistId
            ? await fetchRecentVideos(uploadsPlaylistId, 10)
            : [];

        const latestVideoId = recentVideosData.length > 0 ? recentVideosData[0].id : undefined;

        console.log(`fetched ${recentVideosData.length} recent videos.`);

        // Analyze
        const normalized = normalizeChannel(channel, recentVideosData, latestVideoId);

        console.log("\n🚀 Running Classification...");
        const result = await classifyChannel(normalized, { forceAi });

        console.log("\n✅ Classification Result:");
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error("❌ Error:", error);
    }
}

main();
