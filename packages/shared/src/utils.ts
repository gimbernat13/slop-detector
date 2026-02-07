import type { YouTubeChannel, NormalizedChannel } from "./types";

/**
 * Normalize raw YouTube API channel data to our internal format
 */
export function normalizeChannel(
    raw: YouTubeChannel,
    recentVideos: string[]
): NormalizedChannel {
    const publishedAt = new Date(raw.snippet.publishedAt);
    const now = new Date();
    const ageInDays = Math.max(1, Math.floor((now.getTime() - publishedAt.getTime()) / 86400000));

    const videoCount = raw.statistics.videoCount;
    const subscriberCount = raw.statistics.subscriberCount || 1; // avoid division by zero
    const viewCount = raw.statistics.viewCount;

    return {
        channelId: raw.id,
        title: raw.snippet.title,
        description: raw.snippet.description,
        publishedAt: raw.snippet.publishedAt,
        thumbnailUrl: raw.snippet.thumbnails?.default?.url,

        videoCount,
        subscriberCount,
        viewCount,

        velocity: videoCount / ageInDays,
        ageInDays,
        viewsPerSub: viewCount / subscriberCount,

        recentVideos,
    };
}
