"use client";

import { useActionState, useState, useEffect } from "react";
import { triggerIngest, IngestState } from "@/app/actions";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles, TrendingUp, Search } from "lucide-react";
import { toast } from "sonner";

const initialState: IngestState = {
    success: false,
    message: "",
};

export function IngestModal() {
    const [state, formAction, isPending] = useActionState(triggerIngest, initialState);
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<"topic" | "trending">("topic");
    const queryClient = useQueryClient();

    // Trigger refetch when task starts successfully
    useEffect(() => {
        if (state.success && state.runId) {
            toast.success("Discovery job started!");

            // Invalidate queries to trigger refresh
            queryClient.invalidateQueries({ queryKey: ["channels"] });
            queryClient.invalidateQueries({ queryKey: ["stats"] });
            queryClient.invalidateQueries({ queryKey: ["activeTasks"] });

            // Close modal after short delay
            const timer = setTimeout(() => {
                setOpen(false);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [state.success, state.runId, queryClient]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="rounded-full gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white border-0">
                    <Sparkles className="h-4 w-4" />
                    New Discovery Job
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Start Ingestion Job</DialogTitle>
                    <DialogDescription>
                        Trigger the AI agent to discover and analyze YouTube channels.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="topic" className="w-full" onValueChange={(v) => setMode(v as any)}>
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="topic" className="flex items-center gap-2">
                            <Search className="h-4 w-4" />
                            Topic Search
                        </TabsTrigger>
                        <TabsTrigger value="trending" className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Trend Surfer
                        </TabsTrigger>
                    </TabsList>

                    <form action={formAction} className="space-y-4">
                        <input type="hidden" name="mode" value={mode} />

                        <TabsContent value="topic" className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="topic">Topic / Keyword</Label>
                                <Input
                                    id="topic"
                                    name="topic"
                                    placeholder="e.g. 'Skibidi Toilet', 'Lofi Hip Hop'"
                                    required={mode === "topic"}
                                />
                                <p className="text-xs text-muted-foreground">
                                    The agent will search for this topic to find seed channels.
                                </p>
                            </div>
                        </TabsContent>

                        <TabsContent value="trending" className="space-y-4">
                            <div className="rounded-md bg-muted p-4 border border-border">
                                <div className="flex items-start gap-4">
                                    <div className="p-2 bg-primary/10 rounded-full">
                                        <TrendingUp className="h-6 w-6 text-primary" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-semibold">Trend Surfing Mode</h4>
                                        <p className="text-xs text-muted-foreground">
                                            Automatically scrapes the Top 50 Trending videos from Gaming, Tech, and Entertainment to find fresh Slop.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        {/* Common Advanced Settings (Collapsible details later? Keep simple for now) */}
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className="space-y-2">
                                <Label htmlFor="targetCount">Target Results</Label>
                                <Input
                                    id="targetCount"
                                    name="targetCount"
                                    type="number"
                                    defaultValue={50}
                                    min={10}
                                    max={500}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="minVideos">Min Videos</Label>
                                <Input
                                    id="minVideos"
                                    name="minVideos"
                                    type="number"
                                    defaultValue={10}
                                />
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isPending}>
                                {isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Starting...
                                    </>
                                ) : (
                                    "Start Job"
                                )}
                            </Button>
                        </div>

                        {state.message && (
                            <p className={`text-sm ${state.success ? "text-green-500" : "text-red-500"}`}>
                                {state.message}
                            </p>
                        )}
                    </form>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
