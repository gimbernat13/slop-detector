import { YouTubeChannelSchema, YouTubeSearchResultSchema, type YouTubeChannel } from "./schema";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

function getApiKey(): string {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) throw new Error("YOUTUBE_API_KEY not set");
    return key;
}

// ============================================================
// Fetch channel metadata (batch up to 50)
// ============================================================

export async function fetchChannelMetadata(channelIds: string[]): Promise<YouTubeChannel[]> {
    if (channelIds.length === 0) return [];
    if (channelIds.length > 50) {
        throw new Error("YouTube API only allows 50 channels per request");
    }

    const url = new URL(`${YOUTUBE_API_BASE}/channels`);
    url.searchParams.set("part", "snippet,statistics");
    url.searchParams.set("id", channelIds.join(","));
    url.searchParams.set("key", getApiKey());

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const items = data.items || [];

    return items.map((item: unknown) => YouTubeChannelSchema.parse(item));
}

// ============================================================
// Fetch related channels (snowball expansion)
// ============================================================

export async function fetchRelatedChannels(channelId: string, maxResults = 20): Promise<string[]> {
    // Note: YouTube deprecated relatedToChannelId in 2023
    // Alternative: Search for videos from channel, then get unique channel IDs from results
    // Or: Use channel's "featured channels" if available

    // Workaround: Search for similar content using channel's title/keywords
    const channel = await fetchChannelMetadata([channelId]);
    if (channel.length === 0) return [];

    const searchQuery = channel[0].snippet.title.split(" ").slice(0, 3).join(" ");

    const url = new URL(`${YOUTUBE_API_BASE}/search`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "channel");
    url.searchParams.set("q", searchQuery);
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("key", getApiKey());

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const items = data.items || [];

    // Extract channel IDs, excluding the original
    const relatedIds: string[] = [];
    for (const item of items) {
        try {
            const parsed = YouTubeSearchResultSchema.parse(item);
            const id = parsed.snippet.channelId;
            if (id && id !== channelId && !relatedIds.includes(id)) {
                relatedIds.push(id);
            }
        } catch {
            // Skip malformed items
        }
    }

    return relatedIds;
}

// ============================================================
// Fetch recent videos for a channel (for NLP analysis)
// ============================================================

export async function fetchRecentVideos(channelId: string, maxResults = 10): Promise<string[]> {
    const url = new URL(`${YOUTUBE_API_BASE}/search`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("channelId", channelId);
    url.searchParams.set("type", "video");
    url.searchParams.set("order", "date");
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("key", getApiKey());

    const response = await fetch(url.toString());
    if (!response.ok) {
        // Some channels might have search disabled
        console.warn(`Could not fetch videos for ${channelId}: ${response.status}`);
        return [];
    }

    const data = await response.json();
    const items = data.items || [];

    // Extract video titles
    return items.map((item: { snippet?: { title?: string } }) =>
        item.snippet?.title || "Untitled"
    );
}

// ============================================================
// Snowball expand from seed channels
// ============================================================

export async function snowballExpand(
    seedChannelIds: string[],
    relatedPerChannel = 10,
    maxTotal = 50
): Promise<string[]> {
    const allChannelIds = new Set(seedChannelIds);

    for (const seedId of seedChannelIds) {
        if (allChannelIds.size >= maxTotal) break;

        try {
            const related = await fetchRelatedChannels(seedId, relatedPerChannel);
            for (const id of related) {
                if (allChannelIds.size >= maxTotal) break;
                allChannelIds.add(id);
            }
        } catch (error) {
            console.warn(`Failed to expand from ${seedId}:`, error);
        }
    }

    return Array.from(allChannelIds);
}
