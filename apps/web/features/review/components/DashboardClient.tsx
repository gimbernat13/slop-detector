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

    const filteredChannels = channels.filter((channel) => {
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
                <ChannelTable channels={filteredChannels} />
            </CardContent>
        </Card>
    );
}
