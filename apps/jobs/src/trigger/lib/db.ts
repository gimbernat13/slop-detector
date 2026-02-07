import { getDb, channels, desc, inArray, eq } from "@slop-detector/db";
import type { ClassificationResult } from "@slop-detector/shared";
import { loadEnv } from "./env.js";


// ============================================================
// Insert classification results
// ============================================================

export async function insertClassification(result: ClassificationResult) {
    loadEnv();
    const db = getDb();


    console.log(`Inserting classification for ${result.channelId}`);

    await db.insert(channels).values({
        channelId: result.channelId,
        title: result.title,
        description: result.description,
        thumbnailUrl: result.thumbnailUrl,
        classification: result.classification,
        slopScore: result.slopScore,
        confidence: result.confidence,
        slopType: result.slopType,
        method: result.method,
        velocity: result.metrics.velocity,
        videoCount: result.metrics.videoCount,
        viewsPerSub: result.metrics.viewsPerSub,
        subscriberCount: result.metrics.subscriberCount,
        viewCount: result.metrics.viewCount,
        ageInDays: result.metrics.ageInDays,
        isMadeForKids: result.metrics.isMadeForKids ?? false,
        hasSpamKeywords: result.aiAnalysis?.nlpSignals.hasSpamKeywords ?? false,
        templatedTitles: result.aiAnalysis?.nlpSignals.templatedTitles ?? false,
        contentType: result.aiAnalysis?.nlpSignals.contentType ?? null,
        reasons: result.reasons,
        recentVideos: result.recentVideos,
        latestVideoId: result.latestVideoId,
        aiReasoning: result.aiAnalysis?.reasoning ?? null,
        categoryId: result.metrics.categoryId ?? null,
        humanReviewStatus: "pending",
    }).onConflictDoUpdate({
        target: channels.channelId,
        set: {
            classification: result.classification,
            slopScore: result.slopScore,
            confidence: result.confidence,
            slopType: result.slopType,
            method: result.method,
            velocity: result.metrics.velocity,
            videoCount: result.metrics.videoCount,
            viewsPerSub: result.metrics.viewsPerSub,
            isMadeForKids: result.metrics.isMadeForKids ?? false,
            categoryId: result.metrics.categoryId ?? null,
            reasons: result.reasons,
            recentVideos: result.recentVideos,
            latestVideoId: result.latestVideoId,
            aiReasoning: result.aiAnalysis?.reasoning ?? null,
        }
    });
}

// ============================================================
// Batch insert
// ============================================================

export async function insertClassifications(results: ClassificationResult[]) {
    for (const result of results) {
        await insertClassification(result);
    }
}

// ============================================================
// Query helpers
// ============================================================

export async function getSlopChannels(limit = 100) {
    loadEnv();
    const db = getDb();


    return await db.select({
        channel_id: channels.channelId,
        title: channels.title,
        slop_score: channels.slopScore,
        slop_type: channels.slopType,
        reasons: channels.reasons
    })
        .from(channels)
        .where(eq(channels.classification, 'SLOP'))
        .orderBy(desc(channels.slopScore))
        .limit(limit);
}

export async function getExistingChannelIds(channelIds: string[]): Promise<Set<string>> {
    loadEnv();
    const db = getDb();

    if (channelIds.length === 0) return new Set();

    const existing = await db.select({ channelId: channels.channelId })
        .from(channels)
        .where(inArray(channels.channelId, channelIds));

    return new Set(existing.map(row => row.channelId));
}
