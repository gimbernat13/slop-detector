"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    confirmChannel,
    overrideChannel,
    flagChannel,
} from "../services/channels";

interface ReviewActionsProps {
    channelId: string;
    currentStatus: string | null;
}

export function ReviewActions({ channelId, currentStatus }: ReviewActionsProps) {
    const [isPending, startTransition] = useTransition();
    const [showOverride, setShowOverride] = useState(false);
    const [showFlag, setShowFlag] = useState(false);
    const [flagReason, setFlagReason] = useState("");

    const handleConfirm = () => {
        toast.promise(
            async () => {
                await confirmChannel(channelId);
            },
            {
                loading: "Confirming...",
                success: "Channel confirmed",
                error: "Failed to confirm channel",
            }
        );
    };

    const handleOverride = (newClassification: string) => {
        toast.promise(
            async () => {
                await overrideChannel(channelId, newClassification as "SLOP" | "SUSPICIOUS" | "OKAY");
                setShowOverride(false);
            },
            {
                loading: "Updating classification...",
                success: "Classification updated",
                error: "Failed to update classification",
            }
        );
    };

    const handleFlag = () => {
        if (!flagReason.trim()) return;
        toast.promise(
            async () => {
                await flagChannel(channelId, flagReason);
                setShowFlag(false);
                setFlagReason("");
            },
            {
                loading: "Flagging channel...",
                success: "Channel flagged",
                error: "Failed to flag channel",
            }
        );
    };

    if (currentStatus === "confirmed" || currentStatus === "overridden") {
        return (
            <span className="text-sm text-muted-foreground italic">
                Reviewed
            </span>
        );
    }

    return (
        <div className="flex items-center gap-2">
            {!showOverride && !showFlag && (
                <>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleConfirm}
                        disabled={isPending}
                        className="h-7 text-xs"
                    >
                        ✓ Confirm
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowOverride(true)}
                        disabled={isPending}
                        className="h-7 text-xs"
                    >
                        ↻ Override
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowFlag(true)}
                        disabled={isPending}
                        className="h-7 text-xs text-orange-600 hover:text-orange-700"
                    >
                        🚩 Flag
                    </Button>
                </>
            )}

            {showOverride && (
                <div className="flex items-center gap-2">
                    <Select onValueChange={handleOverride} disabled={isPending}>
                        <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue placeholder="Change to..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="SLOP">SLOP</SelectItem>
                            <SelectItem value="SUSPICIOUS">SUSPICIOUS</SelectItem>
                            <SelectItem value="OKAY">OKAY</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowOverride(false)}
                        className="h-7 text-xs"
                    >
                        Cancel
                    </Button>
                </div>
            )}

            {showFlag && (
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        placeholder="Reason..."
                        value={flagReason}
                        onChange={(e) => setFlagReason(e.target.value)}
                        className="h-7 px-2 text-xs border rounded w-32"
                    />
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleFlag}
                        disabled={isPending || !flagReason.trim()}
                        className="h-7 text-xs"
                    >
                        Submit
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                            setShowFlag(false);
                            setFlagReason("");
                        }}
                        className="h-7 text-xs"
                    >
                        Cancel
                    </Button>
                </div>
            )}
        </div>
    );
}
