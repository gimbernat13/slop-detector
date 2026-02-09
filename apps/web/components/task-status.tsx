"use client";

import { useQuery } from "@tanstack/react-query";
import { getActiveTaskCount } from "@/app/actions";
import { Loader2, Activity } from "lucide-react";

export function TaskStatus() {
    const { data: activeCount = 0 } = useQuery({
        queryKey: ["activeTasks"],
        queryFn: () => getActiveTaskCount(),
        refetchInterval: 5000, // Poll every 5s
    });

    if (activeCount === 0) return null;

    return (
        <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 text-indigo-500 rounded-full border border-indigo-500/20 text-xs font-medium animate-pulse">
            <Activity className="h-3 w-3" />
            <span>{activeCount} trigger.dev job active</span>
            <Loader2 className="h-3 w-3 animate-spin ml-1" />
        </div>
    );
}
