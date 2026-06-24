const { Queue } = require("bullmq");
const { EMAIL_QUEUE_NAME, EMAIL_JOB_TYPES } = require("./emailQueueNames");

const ALLOWED_PAYLOAD_KEYS = new Set([
    "institutionId",
    "entityId",
    "recipientMembershipId",
    "emailType",
    "notificationId",
]);
const ALLOWED_EMAIL_TYPES = new Set(Object.values(EMAIL_JOB_TYPES));

let emailQueue;
let queueFactory = (name, options) => new Queue(name, options);

function isEmailQueueEnabled() {
    return String(process.env.EMAIL_QUEUE_ENABLED || "false").toLowerCase() === "true";
}

function getRedisConnectionOptions(
    redisUrl = process.env.REDIS_URL || "redis://redis:6379",
    maxRetriesPerRequest = 1
) {
    let parsed;
    try {
        parsed = new URL(redisUrl);
    } catch (error) {
        throw new Error("REDIS_URL must be a valid redis:// or rediss:// URL with a valid port");
    }

    if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
        throw new Error("REDIS_URL must use redis:// or rediss://");
    }

    const port = parsed.port ? Number(parsed.port) : 6379;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error("REDIS_URL port must be an integer between 1 and 65535");
    }

    const rawDbPath = parsed.pathname || "";
    const dbPath = rawDbPath.replace(/^\//, "");
    if (rawDbPath && rawDbPath !== "/" && !/^\d+$/.test(dbPath)) {
        throw new Error("REDIS_URL database path must be a non-negative integer like /0");
    }

    const options = {
        host: parsed.hostname,
        port,
        maxRetriesPerRequest,
        connectTimeout: 5000,
    };
    if (parsed.username) options.username = decodeURIComponent(parsed.username);
    if (parsed.password) options.password = decodeURIComponent(parsed.password);
    if (dbPath) {
        const db = Number(dbPath);
        if (!Number.isInteger(db) || db < 0) {
            throw new Error("REDIS_URL database path must be a non-negative integer like /0");
        }
        options.db = db;
    }
    if (parsed.protocol === "rediss:") options.tls = {};
    return options;
}

function buildEmailJobId({ institutionId, entityId, recipientMembershipId, emailType }) {
    // BullMQ reserves colons in custom job IDs, so use a stable safe delimiter.
    return `${emailType}~${institutionId}~${entityId}~${recipientMembershipId}`;
}

function sanitizeEmailJobPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Email job payload must be an object");
    }

    for (const key of Object.keys(payload)) {
        if (!ALLOWED_PAYLOAD_KEYS.has(key)) {
            throw new Error(`Unsupported email job payload field: ${key}`);
        }
    }

    const sanitized = {
        institutionId: String(payload.institutionId || "").trim(),
        entityId: String(payload.entityId || "").trim(),
        recipientMembershipId: String(payload.recipientMembershipId || "").trim(),
        emailType: String(payload.emailType || "").trim(),
    };
    if (!sanitized.institutionId || !sanitized.entityId || !sanitized.recipientMembershipId) {
        throw new Error("Email job IDs are required");
    }
    if (!ALLOWED_EMAIL_TYPES.has(sanitized.emailType)) {
        throw new Error("Unsupported email job type");
    }
    if (payload.notificationId !== undefined && payload.notificationId !== null) {
        sanitized.notificationId = String(payload.notificationId).trim();
        if (!sanitized.notificationId) {
            throw new Error("Email job notificationId must not be empty");
        }
    }
    return sanitized;
}

function getEmailQueue() {
    if (!emailQueue) {
        emailQueue = queueFactory(EMAIL_QUEUE_NAME, {
            connection: getRedisConnectionOptions(),
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: "exponential", delay: 2000 },
                removeOnComplete: { age: 86400, count: 1000 },
                removeOnFail: { age: 604800, count: 5000 },
            },
        });
    }
    return emailQueue;
}

async function enqueueEmailJob(payload) {
    if (!isEmailQueueEnabled()) {
        return { queued: false, reason: "disabled" };
    }

    const data = sanitizeEmailJobPayload(payload);
    const jobId = buildEmailJobId(data);
    try {
        await getEmailQueue().add(data.emailType, data, { jobId });
        return { queued: true, jobId };
    } catch (error) {
        console.error("Failed to enqueue email job", {
            emailType: data.emailType,
            institutionId: data.institutionId,
            entityId: data.entityId,
            recipientMembershipId: data.recipientMembershipId,
            error: error?.message || error,
        });
        // TODO/verify: add a MongoDB outbox for atomic business-write-to-queue delivery.
        return { queued: false, reason: "enqueue_failed" };
    }
}

async function closeEmailQueue() {
    if (emailQueue) {
        await emailQueue.close();
        emailQueue = null;
    }
}

function setQueueFactoryForTests(factory) {
    queueFactory = factory;
    emailQueue = null;
}

module.exports = {
    buildEmailJobId,
    sanitizeEmailJobPayload,
    enqueueEmailJob,
    getRedisConnectionOptions,
    closeEmailQueue,
    setQueueFactoryForTests,
};
