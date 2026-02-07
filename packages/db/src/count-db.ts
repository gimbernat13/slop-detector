import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { getDb } from "./client.js";
import { channels } from "./schema.js";
import { sql } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from monorepo root
config({ path: resolve(__dirname, "../../../.env") });

async function countDb() {
    const db = getDb();

    try {
        const result = await db.select({ count: sql<number>`count(*)` }).from(channels);
        console.log(`📊 Current record count: ${result[0].count}`);
    } catch (error) {
        console.error("❌ Error counting records:", error);
        process.exit(1);
    }
}

countDb();
