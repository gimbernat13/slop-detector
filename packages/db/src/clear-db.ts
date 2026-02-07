import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { getDb } from "./client.js";
import { channels } from "./schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from monorepo root
config({ path: resolve(__dirname, "../../../.env") });

async function clearDb() {
    console.log("🚀 Clearing database...");
    const db = getDb();

    try {
        const result = await db.delete(channels);
        console.log("✅ Database cleared successfully!");
    } catch (error) {
        console.error("❌ Error clearing database:", error);
        process.exit(1);
    }
}

clearDb();
