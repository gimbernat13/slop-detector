import { config } from "dotenv";
import { resolve } from "path";
import type { Config } from "drizzle-kit";

// Load .env from monorepo root
config({ path: resolve(__dirname, "../../.env") });

export default {
    schema: "./src/schema.ts",
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
} satisfies Config;
