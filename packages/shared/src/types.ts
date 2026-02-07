import type { z } from "zod";
import type {
    YouTubeChannelSchema,
    YouTubeSearchResultSchema,
    YouTubeVideoSchema,
    NormalizedChannelSchema,
    ClassificationSchema,
    SlopTypeSchema,
    ClassificationResultSchema,
    ReviewStatusSchema,
    ReviewActionSchema,
} from "./schemas";

// YouTube API types
export type YouTubeChannel = z.infer<typeof YouTubeChannelSchema>;
export type YouTubeSearchResult = z.infer<typeof YouTubeSearchResultSchema>;
export type YouTubeVideo = z.infer<typeof YouTubeVideoSchema>;

// Processed types
export type NormalizedChannel = z.infer<typeof NormalizedChannelSchema>;
export type Classification = z.infer<typeof ClassificationSchema>;
export type SlopType = z.infer<typeof SlopTypeSchema>;
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

// Human review types
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type ReviewAction = z.infer<typeof ReviewActionSchema>;
