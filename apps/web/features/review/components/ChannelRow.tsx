"use client";

import { useState } from "react";
import type { Channel } from "@slop-detector/db";
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
        <>
            <TableRow
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setIsOpen(!isOpen)}
                data-state={isOpen ? "open" : "closed"}
            >
                <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
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
                            className="hover:underline text-blue-500 font-semibold truncate max-w-[200px] md:max-w-[300px]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {channel.title}
                        </a>
                    </div>
                </TableCell>
                <TableCell>
                    {formatNumber(channel.subscriberCount)}
                </TableCell>
                <TableCell>
                    {formatNumber(channel.viewCount)}
                </TableCell>
                <TableCell>
                    <ClassificationBadge classification={channel.classification} />
                </TableCell>

                <TableCell>
                    {channel.slopScore !== null ? (
                        <div className="flex items-center gap-2" title={`Score: ${channel.slopScore}`}>
                            <div className="h-2 w-16 bg-secondary rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${channel.slopScore >= 70
                                        ? "bg-red-500"
                                        : channel.slopScore >= 40
                                            ? "bg-yellow-500"
                                            : "bg-green-500"
                                        }`}
                                    style={{ width: `${Math.min(channel.slopScore, 100)}%` }}
                                />
                            </div>
                            <span className="text-xs text-muted-foreground w-6 text-right">
                                {channel.slopScore}
                            </span>
                        </div>
                    ) : (
                        "—"
                    )}
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

            {isOpen && (
                <TableRow className="bg-muted/30 border-b-0">
                    <TableCell colSpan={7} className="py-4 whitespace-normal">
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
                                {channel.latestVideoId && (
                                    <div className="mb-2">
                                        <a
                                            href={`https://www.youtube.com/watch?v=${channel.latestVideoId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block hover:opacity-80 transition-opacity"
                                        >
                                            <img
                                                src={`https://i.ytimg.com/vi/${channel.latestVideoId}/mqdefault.jpg`}
                                                alt="Latest Video"
                                                className="w-full h-auto object-cover rounded-md border aspect-video"
                                            />
                                        </a>
                                    </div>
                                )}
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
            )}
        </>
    );
}
