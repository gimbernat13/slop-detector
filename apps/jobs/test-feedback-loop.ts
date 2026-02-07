
import { ingestChannel } from "./src/trigger/ingest-channel.js";
import { fetchTrendingChannelIds } from "./src/trigger/lib/youtube.js";

async function main() {
    console.log("🔄 STARTING FEEDBACK LOOP TEST");
    console.log("--------------------------------");

    // 1. Fetch fresh IDs from new categories to ensure we get non-duplicates
    // Category 1: Film & Animation
    // Category 28: Science & Tech
    console.log("📡 Fetching fresh trending channels from Film (1) and Science (28)...");

    const [film, tech] = await Promise.all([
        fetchTrendingChannelIds("1", 10),
        fetchTrendingChannelIds("28", 10)
    ]);

    const seedIds = Array.from(new Set([...film.ids, ...tech.ids]));
    console.log(`✅  Found ${seedIds.length} candidate channels.`);

    // 2. Run Ingestion (Directly invoking the function logic if possible, or mocking the task run)
    // Since ingestChannel is a task, we should invoke its 'run' method directly if exported, 
    // but Trigger.dev tasks wrap the function. 
    // We will use the 'run' function extract if we can, but since it's wrapped, 
    // we might need to invoke the logic manually or use the CLI code structure.

    // Actually, looking at ingest-channel.ts, it exports 'ingestChannel'. 
    // We can't easily call 'ingestChannel.run()' directly in unit test style without mocking.
    // So instead, I will mistakenly trying to call the internal logic? 
    // BETTER APPROACH: Just call the underlying logic if I can refactor, 
    // BUT for now, let's just use the `trigger` method if we have the secret key, 
    // OR just copy the logic briefly here to "simulate" the run for the user 
    // without the overhead of the Task wrapper.

    // To be safe and quick, I will effectively "inline" the ingest logic here 
    // using the library functions I know work. This guarantees we see the logs 
    // without Trigger.dev async overhead obscuring them.

    const { normalizeChannel } = await import("@slop-detector/shared");
    const { fetchChannelMetadata, fetchRecentVideos } = await import("./src/trigger/lib/youtube.js");
    const { classifyChannel } = await import("./src/trigger/lib/classifier.js");

    // Mock DB insert to avoid noise or errors if DB is strict, 
    // but actually we WANT to test DB insert too? 
    // Let's just mock it to console.log for the feedback loop to see "what WOULD happen"
    const insertClassification = async (c: any) => { };

    console.log(`\n🕵️  Analyzing ${seedIds.length} channels...`);

    // Fetch Metadata
    const channels = await fetchChannelMetadata(seedIds);

    for (const channel of channels) {
        try {
            console.log(`\n--------------------------------------------------`);
            console.log(`📺 Channel: ${channel.snippet.title} (Subs: ${channel.statistics.subscriberCount})`);

            const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
            const recentVideos = uploadsId ? await fetchRecentVideos(uploadsId, 5) : [];
            const recentTitles = recentVideos.map(v => v.title);
            const latestVideoId = recentVideos[0]?.id;

            const normalized = normalizeChannel(channel, recentTitles, latestVideoId);

            // CLASSIFY
            const result = await classifyChannel(normalized);

            const color = result.classification === "SLOP" ? "\x1b[31m" : // Red
                result.classification === "SUSPICIOUS" ? "\x1b[33m" : // Yellow
                    "\x1b[32m"; // Green
            const reset = "\x1b[0m";

            console.log(`🎯 Verdict: ${color}[${result.classification}]${reset} (Conf: ${result.confidence}%)`);
            console.log(`📝 Reason: ${result.reasons[0]}`);
            if (result.slopType) console.log(`🗑️  Type: ${result.slopType}`);
            console.log(`📹 Recent: ${recentTitles.slice(0, 3).join(", ")}`);

        } catch (e) {
            console.error(`❌ Failed to analyze ${channel.snippet.title}:`, e);
        }
    }
}

main();
