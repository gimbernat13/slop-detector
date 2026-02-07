"use client";

import { useState } from "react";
import type { Channel } from "@slop-detector/db";
import { ChannelTable } from "./ChannelTable";
import { ChannelTabs } from "./ChannelTabs";
import type { Classification } from "@slop-detector/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DashboardClientProps {
    channels: Channel[];
    counts: {
        all: number;
        slop: number;
        suspicious: number;
        okay: number;
    };
}

export function DashboardClient({ channels, counts }: DashboardClientProps) {
    const [filter, setFilter] = useState<Classification | "all">("all");
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

    const sortedChannels = [...channels].sort((a, b) => {
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

    const filteredChannels = sortedChannels.filter((channel) => {
        if (filter === "all") return true;
        return channel.classification === filter;
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Channels for Review</CardTitle>
                <ChannelTabs
                    counts={counts}
                    currentFilter={filter}
                    onFilterChange={setFilter}
                />
            </CardHeader>
            <CardContent>
                <ChannelTable
                    channels={filteredChannels}
                    onSort={handleSort}
                    sortConfig={sortConfig}
                />
            </CardContent>
        </Card>
    );
}
