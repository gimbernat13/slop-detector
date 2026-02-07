import { z } from "zod";

// ============================================================
// YouTube API Response Schemas (raw from API)
// ============================================================

export const YouTubeChannelSchema = z.object({
    id: z.string(),
    snippet: z.object({
        title: z.string(),
        description: z.string().default(""),
        publishedAt: z.string(),
        customUrl: z.string().optional(),
        thumbnails: z.object({
            default: z.object({ url: z.string() }).optional(),
        }).optional(),
    }),
    statistics: z.object({
        viewCount: z.string().transform(Number),
        subscriberCount: z.string().transform(Number).default("0"),
        videoCount: z.string().transform(Number),
        hiddenSubscriberCount: z.boolean().optional(),
    }),
    contentDetails: z.object({
        relatedPlaylists: z.object({
            uploads: z.string(),
        }),
    }).optional(),
});

export const YouTubeSearchResultSchema = z.object({
    id: z.object({
        kind: z.string(),
        channelId: z.string().optional(),
        videoId: z.string().optional(),
    }),
    snippet: z.object({
        title: z.string(),
        description: z.string(),
        channelId: z.string(),
        channelTitle: z.string(),
    }),
});

export const YouTubeVideoSchema = z.object({
    id: z.object({
        videoId: z.string(),
    }),
    snippet: z.object({
        title: z.string(),
        publishedAt: z.string(),
    }),
});

// ============================================================
// Normalized Channel (after processing)
// ============================================================

export const NormalizedChannelSchema = z.object({
    channelId: z.string(),
    title: z.string(),
    description: z.string(),
    publishedAt: z.string(),
    thumbnailUrl: z.string().optional(),

    // Statistics
    videoCount: z.number(),
    subscriberCount: z.number(),
    viewCount: z.number(),

    // Calculated metrics
    velocity: z.number(), // videos per day
    ageInDays: z.number(),
    viewsPerSub: z.number(),

    // Recent videos for NLP
    recentVideos: z.array(z.string()),
});

// ============================================================
// Classification Result
// ============================================================

export const ClassificationSchema = z.enum(["SLOP", "SUSPICIOUS", "OKAY"]);

export const SlopTypeSchema = z.enum([
    "ai_music",
    "kids_content",
    "ai_voice",
    "background_music",
    "templated_spam",
]).nullable();

export const NLPSignalsSchema = z.object({
    hasSpamKeywords: z.boolean(),
    templatedTitles: z.boolean(),
    genericDescription: z.boolean(),
    contentType: z.string().nullable(),
});

export const BehaviorSignalsSchema = z.object({
    highVelocity: z.boolean(),
    deadEngagement: z.boolean(),
    newOperation: z.boolean(),
});

export const ClassificationResultSchema = z.object({
    channelId: z.string(),
    title: z.string(),

    // Classification
    classification: ClassificationSchema,
    confidence: z.number().min(0).max(100),
    slopScore: z.number().min(0).max(100),
    slopType: SlopTypeSchema,
    method: z.enum(["rule", "ai"]),

    // Metrics
    metrics: z.object({
        velocity: z.number(),
        ageInDays: z.number(),
        viewsPerSub: z.number(),
        videoCount: z.number(),
        subscriberCount: z.number(),
        viewCount: z.number(),
    }),

    // AI analysis (optional, only for AI method)
    aiAnalysis: z.object({
        reasoning: z.string(),
        nlpSignals: NLPSignalsSchema,
        behaviorSignals: BehaviorSignalsSchema,
    }).optional(),

    // Human-readable reasons
    reasons: z.array(z.string()),
    recentVideos: z.array(z.string()),
});

// ============================================================
// Type exports
// ============================================================

export type YouTubeChannel = z.infer<typeof YouTubeChannelSchema>;
export type YouTubeSearchResult = z.infer<typeof YouTubeSearchResultSchema>;
export type YouTubeVideo = z.infer<typeof YouTubeVideoSchema>;
export type NormalizedChannel = z.infer<typeof NormalizedChannelSchema>;
export type Classification = z.infer<typeof ClassificationSchema>;
export type SlopType = z.infer<typeof SlopTypeSchema>;
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

// ============================================================
// Helper: Normalize YouTube API response
// ============================================================

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
