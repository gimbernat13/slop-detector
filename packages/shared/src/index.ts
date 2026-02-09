// Schema exports
export {
    YouTubeChannelSchema,
    YouTubeSearchResultSchema,
    YouTubeVideoSchema,
    NormalizedChannelSchema,
    ClassificationSchema,
    SlopTypeSchema,
    NLPSignalsSchema,
    BehaviorSignalsSchema,
    ClassificationResultSchema,
    ReviewStatusSchema,
    ReviewActionSchema,
} from "./schemas";

// Type exports
export type {
    YouTubeChannel,
    YouTubeSearchResult,
    YouTubeVideo,
    NormalizedChannel,
    Classification,
    SlopType,
    ClassificationResult,
    ReviewStatus,
    ReviewAction,
} from "./types";

// Utility exports
export { normalizeChannel } from "./utils";
export { getTrendingSeeds, SLOP_TOPICS } from "./trend-surfer";
