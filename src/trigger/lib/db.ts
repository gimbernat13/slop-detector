import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { channels } from "../db/schema.js"; // Import the Drizzle schema
import { desc, inArray, eq } from "drizzle-orm";
import type { ClassificationResult } from "./schema.js";

// ============================================================
// Get database connection
// ============================================================

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const client = neon(url);
  return drizzle(client);
}

// ============================================================
// Insert classification results
// ============================================================

export async function insertClassification(result: ClassificationResult) {
  const db = getDb();

  console.log(`Inserting classification for ${result.channelId}`);

  await db.insert(channels).values({
    channelId: result.channelId,
    title: result.title,
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
    hasSpamKeywords: result.aiAnalysis?.nlpSignals.hasSpamKeywords ?? false,
    templatedTitles: result.aiAnalysis?.nlpSignals.templatedTitles ?? false,
    contentType: result.aiAnalysis?.nlpSignals.contentType ?? null,
    reasons: result.reasons,
    recentVideos: result.recentVideos,
    aiReasoning: result.aiAnalysis?.reasoning ?? null,
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
      reasons: result.reasons,
      recentVideos: result.recentVideos,
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
  const db = getDb();
  if (channelIds.length === 0) return new Set();

  const existing = await db.select({ channelId: channels.channelId })
    .from(channels)
    .where(inArray(channels.channelId, channelIds));

  return new Set(existing.map(row => row.channelId));
}

// Note: initializeSchema and getClassificationStats are removed or need update if needed.
// initializeSchema is replaced by drizzle-kit push.
// getClassificationStats can be implemented if needed but wasn't strictly used in the pipeline flow shown.
