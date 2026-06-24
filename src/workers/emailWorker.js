const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { Worker } = require("bullmq");
const { EMAIL_QUEUE_NAME } = require("../queues/emailQueueNames");
const { getRedisConnectionOptions } = require("../queues/emailQueue");
const { processEmailJob } = require("./emailJobProcessor");

dotenv.config();

function getConcurrency() {
    const value = Number.parseInt(process.env.EMAIL_WORKER_CONCURRENCY || "2", 10);
    return Number.isInteger(value) && value > 0 ? value : 2;
}

async function start() {
    if (String(process.env.EMAIL_QUEUE_ENABLED || "false").toLowerCase() !== "true") {
        console.log("Email worker disabled");
        return;
    }

    await mongoose.connect(process.env.MONGO_URI);
    const worker = new Worker(EMAIL_QUEUE_NAME, processEmailJob, {
        connection: getRedisConnectionOptions(undefined, null),
        concurrency: getConcurrency(),
    });

    worker.on("active", (job) => console.log("Email job started", { jobId: job.id, emailType: job.name }));
    worker.on("completed", (job, result) => console.log("Email job completed", {
        jobId: job.id,
        emailType: job.name,
        skipped: Boolean(result?.skipped),
    }));
    worker.on("failed", (job, error) => console.error("Email job failed", {
        jobId: job?.id,
        emailType: job?.name,
        error: error?.message || error,
    }));
    console.log("Email worker started", { concurrency: getConcurrency() });

    let shuttingDown = false;
    async function shutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log("Email worker shutting down", { signal });
        try {
            await worker.close();
        } finally {
            await mongoose.disconnect();
        }
    }
    process.on("SIGINT", () => shutdown("SIGINT").finally(() => process.exit(0)));
    process.on("SIGTERM", () => shutdown("SIGTERM").finally(() => process.exit(0)));

    return { worker, shutdown };
}

if (require.main === module) {
    start().catch((error) => {
        console.error("Failed to start email worker", { error: error?.message || error });
        process.exit(1);
    });
}

module.exports = { getConcurrency, start };
