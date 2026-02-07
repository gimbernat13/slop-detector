import { describe, it, expect } from "vitest";
import {
    YouTubeChannelSchema,
    NormalizedChannelSchema,
    ClassificationResultSchema,
    normalizeChannel,
} from "../lib/schema.js";

describe("YouTubeChannelSchema", () => {
    it("parses valid YouTube API response", () => {
        const raw = {
            id: "UCsT0YIqwnpJCM-mx7-gSA4Q",
            snippet: {
                title: "TEDx Talks",
                description: "TEDx is an international community...",
                publishedAt: "2009-06-23T16:00:48Z",
            },
            statistics: {
                viewCount: "8793372646",
                subscriberCount: "44100000",
                videoCount: "254024",
            },
        };

        const result = YouTubeChannelSchema.parse(raw);

        expect(result.id).toBe("UCsT0YIqwnpJCM-mx7-gSA4Q");
        expect(result.snippet.title).toBe("TEDx Talks");
        // Statistics should be converted to numbers
        expect(result.statistics.viewCount).toBe(8793372646);
        expect(result.statistics.subscriberCount).toBe(44100000);
        expect(result.statistics.videoCount).toBe(254024);
    });

    it("handles missing optional fields with defaults", () => {
        const raw = {
            id: "UC123",
            snippet: {
                title: "Test Channel",
                publishedAt: "2024-01-01T00:00:00Z",
                // description missing - should default to ""
            },
            statistics: {
                viewCount: "1000",
                videoCount: "10",
                // subscriberCount missing - should default to 0
            },
        };

        const result = YouTubeChannelSchema.parse(raw);

        expect(result.snippet.description).toBe("");
        expect(result.statistics.subscriberCount).toBe(0);
    });
});

describe("normalizeChannel", () => {
    it("calculates velocity and engagement metrics", () => {
        const raw = {
            id: "UC123",
            snippet: {
                title: "Lofi Beats 24/7",
                description: "Relaxing music",
                publishedAt: "2024-01-01T00:00:00Z",
            },
            statistics: {
                viewCount: 50000,
                subscriberCount: 100000,
                videoCount: 365,
            },
        };

        const recentVideos = ["Lofi Mix #1", "Lofi Mix #2", "Lofi Mix #3"];

        // Mock date to be 365 days after publish
        const result = normalizeChannel(raw as any, recentVideos);

        expect(result.channelId).toBe("UC123");
        expect(result.title).toBe("Lofi Beats 24/7");
        expect(result.recentVideos).toEqual(recentVideos);
        expect(result.viewsPerSub).toBe(0.5); // 50000 / 100000
        // velocity depends on current date, just check it's positive
        expect(result.velocity).toBeGreaterThan(0);
        expect(result.ageInDays).toBeGreaterThan(0);
    });

    it("avoids division by zero for channels with no subscribers", () => {
        const raw = {
            id: "UC123",
            snippet: {
                title: "New Channel",
                description: "",
                publishedAt: "2024-01-01T00:00:00Z",
            },
            statistics: {
                viewCount: 100,
                subscriberCount: 0, // edge case
                videoCount: 5,
            },
        };

        const result = normalizeChannel(raw as any, []);

        // Should use 1 instead of 0 to avoid NaN
        expect(result.viewsPerSub).toBe(100);
        expect(Number.isFinite(result.viewsPerSub)).toBe(true);
    });
});

describe("ClassificationResultSchema", () => {
    it("validates a complete classification result", () => {
        const result = {
            channelId: "UC123",
            title: "Lofi Beats 24/7",
            classification: "SLOP",
            confidence: 95,
            slopScore: 85,
            slopType: "ai_music",
            method: "ai",
            metrics: {
                velocity: 6.9,
                ageInDays: 180,
                viewsPerSub: 0.42,
                videoCount: 1247,
            },
            aiAnalysis: {
                reasoning: "Templated titles, spam keywords detected",
                nlpSignals: {
                    hasSpamKeywords: true,
                    templatedTitles: true,
                    genericDescription: true,
                    contentType: "background_music",
                },
                behaviorSignals: {
                    highVelocity: true,
                    deadEngagement: true,
                    newOperation: false,
                },
            },
            reasons: [
                "High velocity: 6.9 videos/day",
                "Spam keywords detected",
            ],
            recentVideos: ["Lofi Mix #247", "Lofi Mix #248"],
        };

        const parsed = ClassificationResultSchema.parse(result);

        expect(parsed.classification).toBe("SLOP");
        expect(parsed.slopType).toBe("ai_music");
        expect(parsed.aiAnalysis?.nlpSignals.hasSpamKeywords).toBe(true);
    });

    it("rejects invalid classification values", () => {
        const invalid = {
            channelId: "UC123",
            title: "Test",
            classification: "INVALID", // not in enum
            confidence: 50,
            slopScore: 50,
            slopType: null,
            method: "rule",
            metrics: { velocity: 1, ageInDays: 100, viewsPerSub: 10, videoCount: 100 },
            reasons: [],
            recentVideos: [],
        };

        expect(() => ClassificationResultSchema.parse(invalid)).toThrow();
    });
});
