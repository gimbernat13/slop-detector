"use server";

import { tasks, runs } from "@trigger.dev/sdk/v3";
import { getTrendingSeeds } from "@slop-detector/shared";
import { revalidatePath } from "next/cache";

// Ensure API Key for shared logic
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

export interface IngestState {
    success: boolean;
    message: string;
    runId?: string;
}

export async function triggerIngest(prevState: IngestState, formData: FormData): Promise<IngestState> {
    const mode = formData.get("mode") as "topic" | "trending";
    const topic = formData.get("topic") as string;

    // Filters
    const targetCount = Number(formData.get("targetCount")) || 100;
    const minSubscribers = Number(formData.get("minSubscribers")) || 0;
    const minVideos = Number(formData.get("minVideos")) || 10;
    const duration = formData.get("duration") as "long" | "short" | "any" || "any";
    const forceFresh = formData.get("forceFresh") === "on";

    let payload: any = {
        targetCount,
        minSubscribers,
        minVideos,
        duration,
        forceFresh
    };

    try {
        if (mode === "trending") {
            if (!YOUTUBE_API_KEY) {
                return { success: false, message: "Server Error: YOUTUBE_API_KEY not set" };
            }
            // Use Shared Logic
            const seeds = await getTrendingSeeds(YOUTUBE_API_KEY);
            payload.seedChannelIds = seeds.seedChannelIds;
            payload.keywords = seeds.keywords;
        } else {
            if (!topic || topic.trim().length < 3) {
                return { success: false, message: "Please enter a valid topic (3+ chars)" };
            }
            payload.keywords = [topic];
        }

        // Trigger Task
        const handle = await tasks.trigger("ingest.channel", payload);

        return {
            success: true,
            message: `Task started!`,
            runId: handle.id
        };

    } catch (error) {
        console.error("Failed to trigger ingest:", error);
        return { success: false, message: "Failed to start task. Check server logs." };
    }
}

export async function getActiveTaskCount() {
    try {
        const list = await runs.list({
            taskIdentifier: "ingest.channel",
            status: ["EXECUTING", "QUEUED", "DELAYED"],
            limit: 1,
        });
        return list.data.length;
    } catch (error) {
        console.error("Failed to fetch active tasks:", error);
        return 0;
    }
}

import { getChannels } from "@/features/review";
import type { Classification } from "@slop-detector/shared";

export async function fetchMoreChannels(filter?: Classification, limit = 20, cursor = 0) {
    return getChannels(filter, limit, cursor);
}
