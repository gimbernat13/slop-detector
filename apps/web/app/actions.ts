"use server";

import { getChannels } from "@/features/review";
import type { Classification } from "@slop-detector/shared";

export async function fetchMoreChannels(filter: Classification | undefined, limit: number, cursor: number) {
    return getChannels(filter, limit, cursor);
}
