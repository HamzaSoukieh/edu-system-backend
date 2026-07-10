const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { buildLimiter } = require("../src/middleware/rateLimit");

// Ensure the limiter is active even under NODE_ENV=test for this suite.
process.env.RATE_LIMIT_ENABLED = "true";

function startApp(limiter) {
    const app = express();
    app.set("trust proxy", true);
    app.post("/probe", limiter, (req, res) => res.status(200).json({ ok: true }));
    return new Promise((resolve) => {
        const server = app.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            resolve({ server, base: `http://127.0.0.1:${port}` });
        });
    });
}

async function hit(base) {
    const res = await fetch(`${base}/probe`, { method: "POST" });
    return res.status;
}

test("auth rate limiter allows up to the limit then returns 429", async () => {
    const limit = 3;
    const limiter = buildLimiter({ windowMs: 60 * 1000, limit, message: "slow down" });
    const { server, base } = await startApp(limiter);
    try {
        const statuses = [];
        for (let i = 0; i < limit + 2; i += 1) {
            statuses.push(await hit(base));
        }
        const allowed = statuses.filter((s) => s === 200).length;
        const blocked = statuses.filter((s) => s === 429).length;
        assert.equal(allowed, limit, `expected exactly ${limit} allowed, got ${allowed} (${statuses})`);
        assert.ok(blocked >= 1, `expected at least one 429, got ${blocked} (${statuses})`);
    } finally {
        server.close();
    }
});

test("rate limiter 429 response body carries a message", async () => {
    const limiter = buildLimiter({ windowMs: 60 * 1000, limit: 1, message: "too many" });
    const { server, base } = await startApp(limiter);
    try {
        await hit(base); // consume the single allowed request
        const res = await fetch(`${base}/probe`, { method: "POST" });
        assert.equal(res.status, 429);
        const body = await res.json();
        assert.equal(body.message, "too many");
    } finally {
        server.close();
    }
});
