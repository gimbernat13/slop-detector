import { YouTubeChannelSchema } from "@slop-detector/shared";
import type { YouTubeChannel } from "@slop-detector/shared";
import { z } from "zod";

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
    url.searchParams.set("part", "snippet,statistics,contentDetails");
    url.searchParams.set("id", channelIds.join(","));
    url.searchParams.set("key", getApiKey());

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    const items = data.items || [];

    return items.map((item: unknown) => YouTubeChannelSchema.parse(item));
}

// ============================================================
// Fetch recent videos for a channel (using playlistItems = 1 quota unit)
// ============================================================

const PlaylistItemSchema = z.object({
    snippet: z.object({
        title: z.string(),
        resourceId: z.object({
            videoId: z.string(),
        }),
    }),
});

export async function fetchRecentVideos(uploadsPlaylistId: string, maxResults = 10): Promise<string[]> {
    if (!uploadsPlaylistId) return [];

    const url = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("playlistId", uploadsPlaylistId);
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("key", getApiKey());

    const response = await fetch(url.toString());
    if (!response.ok) {
        console.warn(`Could not fetch videos for playlist ${uploadsPlaylistId}: ${response.status}`);
        return [];
    }

    const data = await response.json() as any;
    const items = data.items || [];

    // Extract video titles
    return items.map((item: unknown) => {
        try {
            const parsed = PlaylistItemSchema.parse(item);
            return parsed.snippet.title;
        } catch {
            return "Untitled";
        }
    });
}

// ============================================================
// Search channels by topic (High Impact Discovery)
// ============================================================

export async function searchChannelsByTopic(topic: string, maxResults = 50, pageToken?: string): Promise<{ ids: string[]; nextPageToken?: string }> {
    const url = new URL(`${YOUTUBE_API_BASE}/search`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", topic);
    url.searchParams.set("type", "video"); // Search videos to find channels
    // User wants BIG channels, so we order by viewCount to find the most successful slop
    url.searchParams.set("order", "viewCount");
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("key", getApiKey());
    if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    const items = data.items || [];

    // Extract unique channel IDs
    const channelIds = new Set<string>();
    for (const item of items) {
        if (item.snippet?.channelId) {
            channelIds.add(item.snippet.channelId);
        }
    }

    return {
        ids: Array.from(channelIds),
        nextPageToken: data.nextPageToken
    };
}

// ============================================================
// Fetch Trending Keywords (Dynamic Discovery)
// ============================================================

export async function fetchTrendingKeywords(categoryId?: string, maxResults = 10): Promise<string[]> {
    const url = new URL(`${YOUTUBE_API_BASE}/videos`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("chart", "mostPopular");
    url.searchParams.set("regionCode", "US"); // Default to US trends
    if (categoryId) {
        url.searchParams.set("videoCategoryId", categoryId);
    }
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("key", getApiKey());

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    const items = data.items || [];

    // Extract titles and clean them up
    // We want broad keywords, not specific video titles
    // But for "Slop", the video titles ARE the keywords (e.g. "GTA 6 Trailer")
    return items.map((item: { snippet?: { title?: string } }) =>
        item.snippet?.title || ""
    ).filter((t: string) => t.length > 0);
}

export async function fetchTrendingChannelIds(categoryId?: string, maxResults = 50, pageToken?: string): Promise<{ ids: string[]; nextPageToken?: string }> {
    const url = new URL(`${YOUTUBE_API_BASE}/videos`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("chart", "mostPopular");
    url.searchParams.set("regionCode", "US");
    if (categoryId) {
        url.searchParams.set("videoCategoryId", categoryId);
    }
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("key", getApiKey());
    if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
        const errorBody = await response.text();
        console.error("YouTube API Error Details:", errorBody);
        throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    const items = data.items || [];

    const channelIds = new Set<string>();
    for (const item of items) {
        if (item.snippet?.channelId) {
            channelIds.add(item.snippet.channelId);
        }
    }

    return {
        ids: Array.from(channelIds),
        nextPageToken: data.nextPageToken
    };
}
