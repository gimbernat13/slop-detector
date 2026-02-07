"use client";

import type { Channel } from "@slop-detector/db";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ClassificationBadge, ReviewStatusBadge } from "./ClassificationBadge";
import { ReviewActions } from "./ReviewActions";

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
                        <TableHead className="w-[250px]">Channel</TableHead>
                        <TableHead>Classification</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Velocity</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Review Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {channels.map((channel) => (
                        <TableRow key={channel.id}>
                            <TableCell className="font-medium">
                                <a
                                    href={`https://youtube.com/channel/${channel.channelId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:underline text-blue-600"
                                >
                                    {channel.title}
                                </a>
                            </TableCell>
                            <TableCell>
                                <ClassificationBadge
                                    classification={channel.classification}
                                />
                            </TableCell>
                            <TableCell>
                                <span
                                    className={
                                        channel.slopScore && channel.slopScore >= 70
                                            ? "text-red-600 font-semibold"
                                            : channel.slopScore && channel.slopScore >= 40
                                                ? "text-yellow-600"
                                                : "text-green-600"
                                    }
                                >
                                    {channel.slopScore ?? "—"}
                                </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                                {channel.slopType ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm">
                                {channel.velocity
                                    ? `${channel.velocity.toFixed(2)}/day`
                                    : "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                                {channel.method ?? "—"}
                            </TableCell>
                            <TableCell>
                                <ReviewStatusBadge status={channel.humanReviewStatus} />
                            </TableCell>
                            <TableCell className="text-right">
                                <ReviewActions
                                    channelId={channel.channelId}
                                    currentStatus={channel.humanReviewStatus}
                                />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
