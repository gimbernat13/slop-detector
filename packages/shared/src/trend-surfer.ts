
import { z } from "zod";

export const SLOP_TOPICS = [
    "minecraft but", "skibidi toilet", "asmr eating", "crypto news",
    "fortnite glitch", "roblox story", "gta 6 leak", "ai tools",
    "lofi hip hop 24/7", "meditation music", "satisfying slime",
    "life hacks", "prank", "reaction", "mr beast clone",
    "ai political news", "election leaks", "government secrets revealed",
    "breaking political news", "political drama",
    "finger family nursery rhymes", "bad baby", "toy play videos",
    "satisfying asmr compilation", "hydraulic press compilation",
    "chatgpt money glitch", "passive income ai", "ai breaking news 24/7",
    "shorts funny animals", "unusual memes", "trending challenges"
];

const TrendingResponse = z.object({
    items: z.array(z.object({
        snippet: z.object({
            channelId: z.string()
        })
    })).optional(),
    nextPageToken: z.string().optional()
});

async function fetchTrendingPage(apiKey: string, categoryId?: string, pageToken?: string): Promise<{ ids: string[], nextPageToken?: string }> {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("chart", "mostPopular");
    url.searchParams.set("regionCode", "US");
    if (categoryId) url.searchParams.set("videoCategoryId", categoryId);
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`YouTube API Error: ${res.statusText}`);

    const json = await res.json();
    const data = TrendingResponse.parse(json);

    const ids = data.items?.map(i => i.snippet.channelId) || [];
    return { ids, nextPageToken: data.nextPageToken };
}

export async function getTrendingSeeds(apiKey: string): Promise<{ seedChannelIds: string[], keywords: string[] }> {
    // Categories: Gaming (20), Entertainment (24), Film (1), People (22), Tech (28)
    const categories = ["20", "24", "1", "22", "28"];
    const allIds = new Set<string>();

    await Promise.all(categories.map(async (cat) => {
        try {
            // Page 1
            const p1 = await fetchTrendingPage(apiKey, cat);
            p1.ids.forEach(id => allIds.add(id));

            // Page 2 (Deep fetch)
            if (p1.nextPageToken) {
                const p2 = await fetchTrendingPage(apiKey, cat, p1.nextPageToken);
                p2.ids.forEach(id => allIds.add(id));
            }
        } catch (e) {
            console.error(`Failed to fetch trending for cat ${cat}`, e);
        }
    }));

    // Random topics
    const randomTopics = SLOP_TOPICS.sort(() => 0.5 - Math.random()).slice(0, 3);

    return {
        seedChannelIds: Array.from(allIds),
        keywords: randomTopics
    };
}
