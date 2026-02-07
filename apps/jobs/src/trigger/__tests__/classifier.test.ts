import { describe, it, expect } from "vitest";
import { classifyByRules } from "../lib/classifier";
import { NormalizedChannel } from "@slop-detector/shared";

// Helper to create a dummy channel
function createChannel(overrides: Partial<NormalizedChannel> = {}): NormalizedChannel {
    return {
        channelId: "UC123",
        title: "Test Channel",
        description: "Test Description",
        publishedAt: new Date().toISOString(),
        videoCount: 100,
        subscriberCount: 1000,
        viewCount: 10000,
        velocity: 1,
        ageInDays: 100,
        viewsPerSub: 10,
        recentVideos: [],
        latestVideoId: undefined,
        recentVelocity: 1, // Default
        ...overrides,
    };
}

describe("classifyByRules", () => {
    it("should classify high velocity (>10) as SLOP", () => {
        const channel = createChannel({ velocity: 11 });
        const result = classifyByRules(channel);
        expect(result).not.toBeNull();
        expect(result?.classification).toBe("SLOP");
        expect(result?.reasons[0]).toContain("High velocity");
    });

    it("should classify medium velocity (>5) with spam keywords as SLOP", () => {
        const channel = createChannel({
            velocity: 6,
            title: "Lofi Beats to Study To",
        });
        const result = classifyByRules(channel);
        expect(result).not.toBeNull();
        expect(result?.classification).toBe("SLOP");
        expect(result?.reasons[0]).toContain("High velocity (>5/day) with spam keywords");
    });



    it("should return null (fall through to AI) for ambiguous cases", () => {
        const channel = createChannel({
            velocity: 2, // Not high, not low
            viewsPerSub: 10, // Not high
            title: "Just a normal gaming channel",
        });
        const result = classifyByRules(channel);
        expect(result).toBeNull();
    });
});

