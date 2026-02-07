import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ChannelTabsProps {
    counts: {
        all: number;
        slop: number;
        suspicious: number;
        okay: number;
    };
    currentFilter: string;
    onFilterChange: (filter: any) => void;
}

export function ChannelTabs({ counts, currentFilter, onFilterChange }: ChannelTabsProps) {
    return (
        <Tabs value={currentFilter} onValueChange={onFilterChange} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all" className="gap-2">
                    All
                    <span className="text-xs text-muted-foreground">({counts.all})</span>
                </TabsTrigger>
                <TabsTrigger value="SLOP" className="gap-2">
                    <span className="text-red-500">🚨</span> SLOP
                    <span className="text-xs text-muted-foreground">({counts.slop})</span>
                </TabsTrigger>
                <TabsTrigger value="SUSPICIOUS" className="gap-2">
                    <span className="text-yellow-500">⚠️</span> Suspicious
                    <span className="text-xs text-muted-foreground">({counts.suspicious})</span>
                </TabsTrigger>
                <TabsTrigger value="OKAY" className="gap-2">
                    <span className="text-green-500">✅</span> Okay
                    <span className="text-xs text-muted-foreground">({counts.okay})</span>
                </TabsTrigger>
            </TabsList>
        </Tabs>
    );
}
