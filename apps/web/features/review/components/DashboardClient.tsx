"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChannelTable } from "./ChannelTable";
import type { Channel } from "@slop-detector/db";
import type { Classification } from "@slop-detector/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { fetchMoreChannels } from "@/app/actions";

interface DashboardClientProps {
    initialChannels: Channel[];
    counts: {
        all: number;
        slop: number;
        suspicious: number;
        okay: number;
    };
}

export function DashboardClient({ initialChannels, counts }: DashboardClientProps) {
    const [activeTab, setActiveTab] = useState<"all" | Classification>("all");
    const { ref, inView } = useInView();

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: ["channels", activeTab],
        queryFn: async ({ pageParam = 0 }) => {
            const filter = activeTab === "all" ? undefined : activeTab;
            return fetchMoreChannels(filter, 20, pageParam);
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        initialData: () => {
            if (activeTab === 'all') {
                return {
                    pages: [{ items: initialChannels, nextCursor: initialChannels.length === 20 ? 20 : undefined }],
                    pageParams: [0]
                }
            }
            return undefined;
        },
        refetchInterval: 30000, // Poll every 30s for general updates
    });

    useEffect(() => {
        if (inView && hasNextPage) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, fetchNextPage]);

    // Client-side sort for loaded items
    const [sortConfig, setSortConfig] = useState<{ key: keyof Channel; direction: "asc" | "desc" }>({
        key: "createdAt",
        direction: "desc",
    });

    const handleSort = (key: keyof Channel) => {
        setSortConfig((prev) => ({
            key,
            direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
        }));
    };

    const allChannelsRaw = data?.pages.flatMap((page) => page.items) || [];

    // Deduplicate by channelId (or id) to prevent crashes from pagination shifts
    const uniqueChannelsMap = new Map();
    allChannelsRaw.forEach(c => {
        if (!uniqueChannelsMap.has(c.channelId)) {
            uniqueChannelsMap.set(c.channelId, c);
        }
    });
    const allChannels = Array.from(uniqueChannelsMap.values());

    // Apply sort to the flattened list
    const sortedChannels = [...allChannels].sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === bValue) return 0;
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        if (sortConfig.direction === "asc") {
            return aValue < bValue ? -1 : 1;
        } else {
            return aValue > bValue ? -1 : 1;
        }
    });

    return (
        <div className="space-y-4">
            <Tabs
                defaultValue="all"
                className="w-full"
                onValueChange={(v) => setActiveTab(v as "all" | Classification)}
            >
                <TabsList>
                    <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
                    <TabsTrigger value="SLOP">Slop ({counts.slop})</TabsTrigger>
                    <TabsTrigger value="SUSPICIOUS">Suspicious ({counts.suspicious})</TabsTrigger>
                    <TabsTrigger value="OKAY">Okay ({counts.okay})</TabsTrigger>
                </TabsList>

                <div className="mt-4">
                    <ChannelTable
                        channels={sortedChannels}
                        onSort={handleSort}
                        sortConfig={sortConfig}
                        isLoadingMore={isFetchingNextPage}
                    />

                    {/* Infinite Scroll Trigger */}
                    <div ref={ref} className="h-4" />
                </div>
            </Tabs>
        </div>
    );
}
