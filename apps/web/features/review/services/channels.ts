"use server";

import { getDb, channels, eq, desc } from "@slop-detector/db";
import type { Channel, ReviewStatus } from "@slop-detector/db";
import type { Classification } from "@slop-detector/shared";
import { revalidatePath } from "next/cache";

// ============================================================
// Fetch Channels
// ============================================================

// Pagination Response
export type PaginatedChannels = {
    items: Channel[];
    nextCursor?: number;
};

export async function getChannels(filter?: Classification, limit = 20, cursor = 0): Promise<PaginatedChannels> {
    const db = getDb();

    if (filter) {
        const items = await db
            .select()
            .from(channels)
            .where(eq(channels.classification, filter))
            .orderBy(desc(channels.createdAt))
            .limit(limit)
            .offset(cursor);

        const nextCursor = items.length === limit ? cursor + limit : undefined;
        return { items, nextCursor };
    }

    // Balanced fetch is tricky with cursor pagination without complex logic.
    // For now, let's just fetch ALL if no filter is provided, ordered by date.
    // This simplifies the infinite scroll significantly.
    // If we need balanced, we'd need separate cursors for each category.

    const items = await db
        .select()
        .from(channels)
        .orderBy(desc(channels.createdAt))
        .limit(limit)
        .offset(cursor);

    const nextCursor = items.length === limit ? cursor + limit : undefined;
    return { items, nextCursor };
}

// ============================================================
// Stats for Donut Chart
// ============================================================

export async function getStats() {
    const db = getDb();

    const all = await db.select().from(channels);

    const stats = {
        slop: all.filter((c) => c.classification === "SLOP").length,
        suspicious: all.filter((c) => c.classification === "SUSPICIOUS").length,
        okay: all.filter((c) => c.classification === "OKAY").length,
        pending: all.filter((c) => c.humanReviewStatus === "pending").length,
        confirmed: all.filter((c) => c.humanReviewStatus === "confirmed").length,
        overridden: all.filter((c) => c.humanReviewStatus === "overridden").length,
        flagged: all.filter((c) => c.humanReviewStatus === "flagged").length,
    };

    return stats;
}

// ============================================================
// Human Review Actions
// ============================================================

export async function confirmChannel(channelId: string) {
    const db = getDb();

    await db
        .update(channels)
        .set({
            humanReviewStatus: "confirmed",
            humanReviewedAt: new Date(),
        })
        .where(eq(channels.channelId, channelId));

    revalidatePath("/");
}

export async function overrideChannel(
    channelId: string,
    newClassification: Classification
) {
    const db = getDb();

    await db
        .update(channels)
        .set({
            classification: newClassification,
            humanReviewStatus: "overridden",
            humanReviewedAt: new Date(),
        })
        .where(eq(channels.channelId, channelId));

    revalidatePath("/");
}

export async function flagChannel(channelId: string, reason: string) {
    const db = getDb();

    await db
        .update(channels)
        .set({
            humanReviewStatus: "flagged",
            humanReviewedAt: new Date(),
            flagReason: reason,
        })
        .where(eq(channels.channelId, channelId));

    revalidatePath("/");
}
