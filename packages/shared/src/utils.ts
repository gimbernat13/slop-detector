import type { YouTubeChannel, NormalizedChannel } from "./types";

/**
 * Normalize raw YouTube API channel data to our internal format
 */
export function normalizeChannel(
    raw: YouTubeChannel,
    recentVideos: { id: string; title: string; publishedAt: string }[], // Rich objects
    latestVideoId?: string
): NormalizedChannel {
    const publishedAt = new Date(raw.snippet.publishedAt);
    const now = new Date();
    const ageInDays = Math.max(1, Math.floor((now.getTime() - publishedAt.getTime()) / 86400000));

    const videoCount = raw.statistics.videoCount;
    const subscriberCount = raw.statistics.subscriberCount || 1; // avoid division by zero
    const viewCount = raw.statistics.viewCount;

    // Calculate Recent Velocity (last 14 days)
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
    const recentUploads = recentVideos.filter(v => new Date(v.publishedAt) > twoWeeksAgo);

    // If we have less than 14 days of history/videos, we might under-calculate, 
    // but usually "velocity" implies density.
    // If the channel is brand new (<14 days), usage ageInDays.
    const recentDivisor = Math.min(ageInDays, 14);
    const recentVelocity = recentUploads.length / Math.max(1, recentDivisor);

    return {
        channelId: raw.id,
        title: raw.snippet.title,
        description: raw.snippet.description,
        publishedAt: raw.snippet.publishedAt,
        thumbnailUrl: raw.snippet.thumbnails?.default?.url,
        latestVideoId,


        videoCount,
        subscriberCount,
        viewCount,

        velocity: videoCount / ageInDays,
        recentVelocity,
        ageInDays,
        viewsPerSub: viewCount / subscriberCount,

        recentVideos,
    };
}
