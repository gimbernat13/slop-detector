"use server";

import { getDb, channels, eq, desc } from "@slop-detector/db";
import type { Channel, ReviewStatus } from "@slop-detector/db";
import type { Classification } from "@slop-detector/shared";
import { revalidatePath } from "next/cache";

// ============================================================
// Fetch Channels
// ============================================================

export async function getChannels(filter?: Classification): Promise<Channel[]> {
    const db = getDb();

    if (filter) {
        return await db
            .select()
            .from(channels)
            .where(eq(channels.classification, filter))
            .orderBy(desc(channels.slopScore))
            .limit(100);
    }

    return await db
        .select()
        .from(channels)
        .orderBy(desc(channels.slopScore))
        .limit(100);
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
