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
}

export function ChannelTable({ channels }: ChannelTableProps) {
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
                        <TableHead>Channel</TableHead>
                        <TableHead>Subscribers</TableHead>
                        <TableHead>Views</TableHead>
                        <TableHead>Classification</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Velocity</TableHead>
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
