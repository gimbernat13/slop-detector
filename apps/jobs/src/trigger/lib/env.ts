import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let isLoaded = false;

/**
 * Robustly loads the .env file from the project root.
 * Can be called multiple times safely.
 */
export function loadEnv() {
    if (isLoaded) return;

    // We are in apps/jobs/src/trigger/lib/env.ts
    // Need to go up 5 levels to reach root if built, or 4 levels if source.
    // Let's use a more flexible approach searching upwards for .env

    const rootEnvPath = join(__dirname, "../../../../../.env");
    // Failsafe: check common locations relative to this file
    config({ path: rootEnvPath });

    // Also try standard config() in case CWD is already root
    config();

    isLoaded = true;
}
