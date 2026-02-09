import { useMutation, useQueryClient, InfiniteData } from "@tanstack/react-query";
import { confirmChannel, overrideChannel, flagChannel } from "../services/channels";
import type { Channel } from "@slop-detector/db";
import type { Classification } from "@slop-detector/shared";
import { toast } from "sonner";
import { PaginatedChannels } from "../services/channels";

export function useChannelMutations() {
    const queryClient = useQueryClient();

    const updateChannelInCache = (channelId: string, updater: (channel: Channel) => Channel) => {
        queryClient.setQueriesData<InfiniteData<PaginatedChannels>>(
            { queryKey: ["channels"] },
            (oldData) => {
                if (!oldData) return oldData;

                return {
                    ...oldData,
                    pages: oldData.pages.map((page) => ({
                        ...page,
                        items: page.items.map((channel) => {
                            if (channel.channelId === channelId) {
                                return updater(channel);
                            }
                            return channel;
                        }),
                    })),
                };
            }
        );
    };

    const confirm = useMutation({
        mutationFn: async (channelId: string) => {
            await confirmChannel(channelId);
        },
        onMutate: async (channelId) => {
            await queryClient.cancelQueries({ queryKey: ["channels"] });
            const previousData = queryClient.getQueriesData({ queryKey: ["channels"] });

            updateChannelInCache(channelId, (channel) => ({
                ...channel,
                humanReviewStatus: "confirmed",
                humanReviewedAt: new Date(),
            }));

            return { previousData };
        },
        onError: (_err, _variables, context) => {
            if (context?.previousData) {
                context.previousData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            toast.error("Failed to confirm channel");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["stats"] }); // Refresh stats if any
            // We usually don't need to invalidate the list immediately if the optimistic update was correct,
            // but for safety we can refetch in the background.
            queryClient.invalidateQueries({ queryKey: ["channels"] });
        },
        onSuccess: () => {
            toast.success("Channel confirmed");
        }
    });

    const override = useMutation({
        mutationFn: async ({ channelId, newClassification }: { channelId: string; newClassification: Classification }) => {
            await overrideChannel(channelId, newClassification);
        },
        onMutate: async ({ channelId, newClassification }) => {
            await queryClient.cancelQueries({ queryKey: ["channels"] });
            const previousData = queryClient.getQueriesData({ queryKey: ["channels"] });

            updateChannelInCache(channelId, (channel) => ({
                ...channel,
                classification: newClassification,
                humanReviewStatus: "overridden",
                humanReviewedAt: new Date(),
            }));

            return { previousData };
        },
        onError: (_err, _variables, context) => {
            if (context?.previousData) {
                context.previousData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            toast.error("Failed to override channel");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["stats"] });
            queryClient.invalidateQueries({ queryKey: ["channels"] });
        },
        onSuccess: () => {
            toast.success("Channel classification updated");
        }
    });

    const flag = useMutation({
        mutationFn: async ({ channelId, reason }: { channelId: string; reason: string }) => {
            await flagChannel(channelId, reason);
        },
        onMutate: async ({ channelId, reason }) => {
            await queryClient.cancelQueries({ queryKey: ["channels"] });
            const previousData = queryClient.getQueriesData({ queryKey: ["channels"] });

            updateChannelInCache(channelId, (channel) => ({
                ...channel,
                humanReviewStatus: "flagged",
                flagReason: reason,
                humanReviewedAt: new Date(),
            }));

            return { previousData };
        },
        onError: (_err, _variables, context) => {
            if (context?.previousData) {
                context.previousData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            toast.error("Failed to flag channel");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["stats"] });
            queryClient.invalidateQueries({ queryKey: ["channels"] });
        },
        onSuccess: () => {
            toast.success("Channel flagged");
        }
    });

    return {
        confirm,
        override,
        flag
    };
}
