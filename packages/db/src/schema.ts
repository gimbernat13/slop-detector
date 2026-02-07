import { pgTable, text, integer, real, boolean, timestamp, serial, bigint } from 'drizzle-orm/pg-core';

// Human review status enum values
export const REVIEW_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    OVERRIDDEN: 'overridden',
    FLAGGED: 'flagged',
} as const;

export type ReviewStatus = typeof REVIEW_STATUS[keyof typeof REVIEW_STATUS];

export const channels = pgTable('channels', {
    id: serial('id').primaryKey(),
    channelId: text('channel_id').notNull().unique(),
    title: text('title').notNull(),
    description: text('description'),

    // Classification
    classification: text('classification').notNull(),
    slopScore: integer('slop_score'),
    confidence: integer('confidence'),
    slopType: text('slop_type'),
    method: text('method'),

    // Metrics
    velocity: real('velocity'),
    videoCount: integer('video_count'),
    subscriberCount: integer('subscriber_count'),
    viewCount: bigint('view_count', { mode: 'number' }),
    viewsPerSub: real('views_per_sub'),
    ageInDays: integer('age_in_days'),

    // AI signals
    hasSpamKeywords: boolean('has_spam_keywords'),
    templatedTitles: boolean('templated_titles'),
    contentType: text('content_type'),
    reasons: text('reasons').array(),
    recentVideos: text('recent_videos').array(),
    aiReasoning: text('ai_reasoning'),

    // Human review fields
    humanReviewStatus: text('human_review_status').default('pending'),
    humanReviewedAt: timestamp('human_reviewed_at'),
    flagReason: text('flag_reason'),

    createdAt: timestamp('created_at').defaultNow(),
});

// Type inference for queries
export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
