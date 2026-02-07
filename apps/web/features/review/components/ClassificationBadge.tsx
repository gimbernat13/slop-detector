"use client";

import { Badge } from "@/components/ui/badge";

interface ClassificationBadgeProps {
    classification: string;
}

export function ClassificationBadge({ classification }: ClassificationBadgeProps) {
    switch (classification) {
        case "SLOP":
            return (
                <Badge variant="destructive" className="font-semibold">
                    🚨 SLOP
                </Badge>
            );
        case "SUSPICIOUS":
            return (
                <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600 border-yellow-500/50">
                    ⚠️ SUSPICIOUS
                </Badge>
            );
        case "OKAY":
            return (
                <Badge variant="secondary" className="bg-green-500/20 text-green-600 border-green-500/50">
                    ✅ OKAY
                </Badge>
            );
        default:
            return <Badge variant="outline">{classification}</Badge>;
    }
}

interface ReviewStatusBadgeProps {
    status: string | null;
}

export function ReviewStatusBadge({ status }: ReviewStatusBadgeProps) {
    switch (status) {
        case "confirmed":
            return (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                    ✓ Confirmed
                </Badge>
            );
        case "overridden":
            return (
                <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30">
                    ↻ Overridden
                </Badge>
            );
        case "flagged":
            return (
                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                    🚩 Flagged
                </Badge>
            );
        case "pending":
        default:
            return (
                <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/30">
                    ○ Pending
                </Badge>
            );
    }
}
