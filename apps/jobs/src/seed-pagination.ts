import { getDb, channels } from "@slop-detector/db";
import { v4 as uuidv4 } from "uuid";

async function seed() {
    const db = getDb();
    const count = 50;
    console.log(`Seeding ${count} channels...`);

    const newChannels = Array.from({ length: count }).map((_, i) => ({
        id: uuidv4(),
        channelId: `UC_TEST_${i}_${Date.now()}`,
        title: `Test Channel ${i}`,
        description: "Generated for infinite scroll test",
        classification: i % 3 === 0 ? "SLOP" : i % 3 === 1 ? "SUSPICIOUS" : "OKAY",
        slopScore: Math.floor(Math.random() * 100),
        confidence: Math.floor(Math.random() * 100),
        createdAt: new Date(Date.now() - i * 1000 * 60 * 60), // Shifting time to ensure sort order
        videoCount: "100",
        viewCount: "10000",
        subscriberCount: "1000",
    }));

    // Batch insert might differ based on DB adapter, doing loop for safety or use insertMany if available
    // Drizzle supports insert([...])
    await db.insert(channels).values(newChannels as any);

    console.log("Seeding complete.");
}

seed().catch(console.error);
