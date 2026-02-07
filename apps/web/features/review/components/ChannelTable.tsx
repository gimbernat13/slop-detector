"use client";

import type { Channel } from "@slop-detector/db";
import {
    Table,
    TableBody,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ChannelRow } from "./ChannelRow";

interface ChannelTableProps {
    channels: Channel[];
    onSort: (key: keyof Channel) => void;
    sortConfig: { key: keyof Channel; direction: "asc" | "desc" };
}

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
    if (!active) return <span className="ml-1 opacity-20 text-xs">↕</span>;
    return direction === "asc" ? <span className="ml-1 text-xs">↑</span> : <span className="ml-1 text-xs">↓</span>;
}

export function ChannelTable({ channels, onSort, sortConfig }: ChannelTableProps) {
    if (channels.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                No channels found. Run the ingestion pipeline to start analyzing.
            </div>
        );
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="cursor-pointer select-none" onClick={() => onSort("title")}>
                            Channel <SortIcon active={sortConfig.key === "title"} direction={sortConfig.direction} />
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => onSort("subscriberCount")}>
                            Subscribers <SortIcon active={sortConfig.key === "subscriberCount"} direction={sortConfig.direction} />
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => onSort("viewCount")}>
                            Views <SortIcon active={sortConfig.key === "viewCount"} direction={sortConfig.direction} />
                        </TableHead>
                        <TableHead>Classification</TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => onSort("slopScore")}>
                            Score <SortIcon active={sortConfig.key === "slopScore"} direction={sortConfig.direction} />
                        </TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => onSort("velocity")}>
                            Velocity <SortIcon active={sortConfig.key === "velocity"} direction={sortConfig.direction} />
                        </TableHead>
                        <TableHead>Review Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {channels.map((channel) => (
                        <ChannelRow key={channel.id} channel={channel} />
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
