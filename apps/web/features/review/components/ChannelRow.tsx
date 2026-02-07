"use client";

import { useState } from "react";
import type { Channel } from "@slop-detector/db";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClassificationBadge, ReviewStatusBadge } from "./ClassificationBadge";
import { ReviewActions } from "./ReviewActions";

interface ChannelRowProps {
    channel: Channel;
}

function formatNumber(num: number | null): string {
    if (num === null) return "—";
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
}

export function ChannelRow({ channel }: ChannelRowProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Collapsible asChild open={isOpen} onOpenChange={setIsOpen}>
            <>
                <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/50">
                        <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                                <span className="text-muted-foreground text-xs">
                                    {isOpen ? "▼" : "▶"}
                                </span>
                                {channel.thumbnailUrl && (
                                    <img
                                        src={channel.thumbnailUrl}
                                        alt={channel.title}
                                        className="w-8 h-8 rounded-full object-cover"
                                    />
                                )}
                                <a
                                    href={`https://youtube.com/channel/${channel.channelId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:underline text-blue-500"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {channel.title}
                                </a>
                            </div>
                        </TableCell>
                        <TableCell>
                            <ClassificationBadge classification={channel.classification} />
                        </TableCell>
                        <TableCell>
                            <span
                                className={
                                    channel.slopScore && channel.slopScore >= 70
                                        ? "text-red-500 font-semibold"
                                        : channel.slopScore && channel.slopScore >= 40
                                            ? "text-yellow-500"
                                            : "text-green-500"
                                }
                            >
                                {channel.slopScore ?? "—"}
                            </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                            {channel.slopType ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                            {channel.velocity ? `${channel.velocity.toFixed(2)}/day` : "—"}
                        </TableCell>
                        <TableCell>
                            <ReviewStatusBadge status={channel.humanReviewStatus} />
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <ReviewActions
                                channelId={channel.channelId}
                                currentStatus={channel.humanReviewStatus}
                            />
                        </TableCell>
                    </TableRow>
                </CollapsibleTrigger>

                <CollapsibleContent asChild>
                    <TableRow className="bg-muted/30 border-b-0">
                        <TableCell colSpan={7} className="py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 px-4">
                                {/* Stats */}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-semibold text-muted-foreground">Stats</h4>
                                    <div className="space-y-1 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Subscribers</span>
                                            <span className="font-medium">{formatNumber(channel.subscriberCount)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Views</span>
                                            <span className="font-medium">{formatNumber(channel.viewCount)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Videos</span>
                                            <span className="font-medium">{formatNumber(channel.videoCount)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Age</span>
                                            <span className="font-medium">{channel.ageInDays ? `${channel.ageInDays} days` : "—"}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Views/Sub</span>
                                            <span className="font-medium">{channel.viewsPerSub?.toFixed(1) ?? "—"}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* AI Signals */}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-semibold text-muted-foreground">AI Signals</h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className={channel.hasSpamKeywords ? "text-red-500" : "text-green-500"}>
                                                {channel.hasSpamKeywords ? "⚠️" : "✓"}
                                            </span>
                                            <span>Spam Keywords</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={channel.templatedTitles ? "text-red-500" : "text-green-500"}>
                                                {channel.templatedTitles ? "⚠️" : "✓"}
                                            </span>
                                            <span>Templated Titles</span>
                                        </div>
                                        <div className="text-muted-foreground">
                                            Content: <span className="text-foreground">{channel.contentType ?? "Unknown"}</span>
                                        </div>
                                        <div className="text-muted-foreground">
                                            Method: <span className="text-foreground">{channel.method ?? "—"}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Reasons */}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-semibold text-muted-foreground">Reasons</h4>
                                    <div className="flex flex-wrap gap-1">
                                        {channel.reasons && channel.reasons.length > 0 ? (
                                            channel.reasons.map((reason, i) => (
                                                <Badge key={i} variant="outline" className="text-xs">
                                                    {reason}
                                                </Badge>
                                            ))
                                        ) : (
                                            <span className="text-sm text-muted-foreground">No reasons</span>
                                        )}
                                    </div>
                                </div>

                                {/* Recent Videos */}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-semibold text-muted-foreground">Recent Videos</h4>
                                    <div className="space-y-1 text-sm max-h-32 overflow-y-auto">
                                        {channel.recentVideos && channel.recentVideos.length > 0 ? (
                                            channel.recentVideos.slice(0, 5).map((video, i) => (
                                                <div key={i} className="text-muted-foreground truncate" title={video}>
                                                    • {video}
                                                </div>
                                            ))
                                        ) : (
                                            <span className="text-muted-foreground">No recent videos</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* AI Reasoning */}
                            {channel.aiReasoning && (
                                <div className="mt-4 px-4">
                                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">AI Reasoning</h4>
                                    <p className="text-sm text-muted-foreground bg-background/50 p-3 rounded-md border">
                                        {channel.aiReasoning}
                                    </p>
                                </div>
                            )}

                            {/* Description */}
                            {channel.description && (
                                <div className="mt-4 px-4">
                                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Description</h4>
                                    <p className="text-sm text-muted-foreground line-clamp-3">
                                        {channel.description}
                                    </p>
                                </div>
                            )}
                        </TableCell>
                    </TableRow>
                </CollapsibleContent>
            </>
        </Collapsible>
    );
}
