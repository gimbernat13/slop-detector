import { tasks } from "@trigger.dev/sdk/v3";

async function run() {
    console.log("🕷️ FORCE-RUNNING Crawler Logic...");

    // We can't "trigger" a schedule directly from the SDK usually, creates a standard run
    // But we can just trigger the task that the schedule normally runs if we exported it as a task.
    // However, `crawler.trending` IS a task (schedule.task).

    try {
        const handle = await tasks.trigger("crawler.trending", {
            timestamp: new Date(),
            lastTimestamp: new Date(Date.now() - 3600000),
            externalId: "manual-test-run"
        });

        console.log(`✅ Crawler triggered! Run ID: ${handle.id}`);
        console.log(`View run: https://cloud.trigger.dev/runs/${handle.id}`);
    } catch (error) {
        console.error("Failed to trigger crawler:", error);
    }
}

run();
