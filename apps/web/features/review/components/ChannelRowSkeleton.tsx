import { TableCell, TableRow } from "@/components/ui/table";

export function ChannelRowSkeleton() {
    return (
        <TableRow className="hover:bg-transparent">
            {/* Channel Info */}
            <TableCell>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                    <div className="space-y-2">
                        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                    </div>
                </div>
            </TableCell>
            {/* Stats */}
            <TableCell>
                <div className="h-4 w-12 bg-muted animate-pulse rounded" />
            </TableCell>
            <TableCell>
                <div className="h-4 w-12 bg-muted animate-pulse rounded" />
            </TableCell>
            {/* Classification */}
            <TableCell>
                <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
            </TableCell>
            {/* Score */}
            <TableCell>
                <div className="flex items-center gap-2">
                    <div className="h-2 w-16 bg-muted animate-pulse rounded-full" />
                    <div className="h-3 w-6 bg-muted animate-pulse rounded" />
                </div>
            </TableCell>
            {/* Type */}
            <TableCell>
                <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            </TableCell>
            {/* Velocity */}
            <TableCell>
                <div className="h-4 w-14 bg-muted animate-pulse rounded" />
            </TableCell>
            {/* Status */}
            <TableCell>
                <div className="h-5 w-24 bg-muted animate-pulse rounded-full" />
            </TableCell>
            {/* Actions */}
            <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                    <div className="h-8 w-8 bg-muted animate-pulse rounded" />
                    <div className="h-8 w-8 bg-muted animate-pulse rounded" />
                    <div className="h-8 w-8 bg-muted animate-pulse rounded" />
                </div>
            </TableCell>
        </TableRow>
    );
}
