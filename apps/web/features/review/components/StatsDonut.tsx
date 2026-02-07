"use client";

import { Pie, PieChart, Label } from "recharts";
import {
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    ChartLegend,
    ChartLegendContent,
} from "@/components/ui/chart";

interface StatsDonutProps {
    stats: {
        slop: number;
        suspicious: number;
        okay: number;
    };
}

const chartConfig = {
    channels: {
        label: "Channels",
    },
    slop: {
        label: "SLOP",
        color: "hsl(0 84% 60%)",
    },
    suspicious: {
        label: "Suspicious",
        color: "hsl(45 93% 47%)",
    },
    okay: {
        label: "Okay",
        color: "hsl(142 71% 45%)",
    },
} satisfies ChartConfig;

export function StatsDonut({ stats }: StatsDonutProps) {
    const chartData = [
        { name: "slop", value: stats.slop, fill: "var(--color-slop)" },
        { name: "suspicious", value: stats.suspicious, fill: "var(--color-suspicious)" },
        { name: "okay", value: stats.okay, fill: "var(--color-okay)" },
    ].filter(d => d.value > 0);

    const total = stats.slop + stats.suspicious + stats.okay;

    if (total === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
                No data yet
            </div>
        );
    }

    return (
        <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square max-h-[250px]"
        >
            <PieChart>
                <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                />
                <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    strokeWidth={5}
                >
                    <Label
                        content={({ viewBox }) => {
                            if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                return (
                                    <text
                                        x={viewBox.cx}
                                        y={viewBox.cy}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                    >
                                        <tspan
                                            x={viewBox.cx}
                                            y={viewBox.cy}
                                            className="fill-foreground text-3xl font-bold"
                                        >
                                            {total.toLocaleString()}
                                        </tspan>
                                        <tspan
                                            x={viewBox.cx}
                                            y={(viewBox.cy || 0) + 24}
                                            className="fill-muted-foreground text-sm"
                                        >
                                            Channels
                                        </tspan>
                                    </text>
                                );
                            }
                        }}
                    />
                </Pie>
                <ChartLegend
                    content={<ChartLegendContent nameKey="name" />}
                    className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
                />
            </PieChart>
        </ChartContainer>
    );
}
