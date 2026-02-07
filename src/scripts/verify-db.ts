
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { channels } from "../trigger/db/schema.js";
import { count } from "drizzle-orm";

async function main() {
    console.log("🔍 Verifying database connection...");

    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL is not set");
        process.exit(1);
    }

    try {
        const sql = neon(process.env.DATABASE_URL);
        const db = drizzle(sql);

        const result = await db.select({ count: count() }).from(channels);

        console.log("✅ Database connected successfully!");
        console.log(`📊 Current channel count: ${result[0].count}`);

    } catch (error) {
        console.error("❌ Database connection failed:", error);
        process.exit(1);
    }
}

main();
