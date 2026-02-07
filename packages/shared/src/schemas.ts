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
    description: z.string().optional(),
    thumbnailUrl: z.string().optional(),

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
// Human Review Schemas
// ============================================================

export const ReviewStatusSchema = z.enum(["pending", "confirmed", "overridden", "flagged"]);

export const ReviewActionSchema = z.object({
    channelId: z.string(),
    action: z.enum(["confirm", "override", "flag"]),
    newClassification: ClassificationSchema.optional(),
    flagReason: z.string().optional(),
});
