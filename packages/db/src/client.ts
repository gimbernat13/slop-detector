import { neon } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Singleton pattern for serverless environments
let db: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(): NeonHttpDatabase<typeof schema> {
    if (db) return db;

    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL environment variable is not set");

    const client = neon(url);
    db = drizzle(client, { schema });

    return db;
}

// Re-export drizzle operators for convenience
export { eq, desc, asc, inArray, sql, and, or } from "drizzle-orm";
