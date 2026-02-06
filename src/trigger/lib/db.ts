import { neon } from "@neondatabase/serverless";
import type { ClassificationResult } from "./schema";

// ============================================================
// Get database connection
// ============================================================

function getDb() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not set");
    return neon(url);
}

// ============================================================
// Initialize database schema
// ============================================================

export async function initializeSchema() {
    const sql = getDb();

    await sql`
    CREATE TABLE IF NOT EXISTS channels (
      id SERIAL PRIMARY KEY,
      channel_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      
      -- Classification
      classification TEXT NOT NULL,
      slop_score INTEGER,
      confidence INTEGER,
      slop_type TEXT,
      method TEXT,
      
      -- Metrics
      velocity REAL,
      video_count INTEGER,
      subscriber_count INTEGER,
      view_count BIGINT,
      views_per_sub REAL,
      age_in_days INTEGER,
      
      -- AI signals
      has_spam_keywords BOOLEAN,
      templated_titles BOOLEAN,
      content_type TEXT,
      reasons TEXT[],
      recent_videos TEXT[],
      ai_reasoning TEXT,
      
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

    await sql`CREATE INDEX IF NOT EXISTS idx_channels_classification ON channels(classification)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_channels_slop_type ON channels(slop_type)`;

    console.log("Database schema initialized");
}

// ============================================================
// Insert classification results
// ============================================================

export async function insertClassification(result: ClassificationResult) {
    const sql = getDb();

    await sql`
    INSERT INTO channels (
      channel_id,
      title,
      classification,
      slop_score,
      confidence,
      slop_type,
      method,
      velocity,
      video_count,
      views_per_sub,
      age_in_days,
      has_spam_keywords,
      templated_titles,
      content_type,
      reasons,
      recent_videos,
      ai_reasoning
    ) VALUES (
      ${result.channelId},
      ${result.title},
      ${result.classification},
      ${result.slopScore},
      ${result.confidence},
      ${result.slopType},
      ${result.method},
      ${result.metrics.velocity},
      ${result.metrics.videoCount},
      ${result.metrics.viewsPerSub},
      ${result.metrics.ageInDays},
      ${result.aiAnalysis?.nlpSignals.hasSpamKeywords ?? false},
      ${result.aiAnalysis?.nlpSignals.templatedTitles ?? false},
      ${result.aiAnalysis?.nlpSignals.contentType ?? null},
      ${result.reasons},
      ${result.recentVideos},
      ${result.aiAnalysis?.reasoning ?? null}
    )
    ON CONFLICT (channel_id) DO UPDATE SET
      classification = EXCLUDED.classification,
      slop_score = EXCLUDED.slop_score,
      confidence = EXCLUDED.confidence,
      slop_type = EXCLUDED.slop_type,
      method = EXCLUDED.method,
      velocity = EXCLUDED.velocity,
      video_count = EXCLUDED.video_count,
      views_per_sub = EXCLUDED.views_per_sub,
      reasons = EXCLUDED.reasons,
      recent_videos = EXCLUDED.recent_videos,
      ai_reasoning = EXCLUDED.ai_reasoning
  `;
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

export async function getClassificationStats() {
    const sql = getDb();

    const stats = await sql`
    SELECT 
      classification,
      slop_type,
      COUNT(*) as count
    FROM channels
    GROUP BY classification, slop_type
    ORDER BY count DESC
  `;

    return stats;
}

export async function getSlopChannels(limit = 100) {
    const sql = getDb();

    return sql`
    SELECT channel_id, title, slop_score, slop_type, reasons
    FROM channels
    WHERE classification = 'SLOP'
    ORDER BY slop_score DESC
    LIMIT ${limit}
  `;
}
