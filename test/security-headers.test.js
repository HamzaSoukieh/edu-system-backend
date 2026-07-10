const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../src/app");

function start() {
    return new Promise((resolve) => {
        const server = app.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            resolve({ server, base: `http://127.0.0.1:${port}` });
        });
    });
}

test("helmet security headers are applied and x-powered-by is removed (SEC-11)", async () => {
    const { server, base } = await start();
    try {
        const res = await fetch(`${base}/health`);
        assert.equal(res.status, 200);
        // helmet defaults
        assert.equal(res.headers.get("x-content-type-options"), "nosniff");
        assert.ok(res.headers.get("x-frame-options"), "expected X-Frame-Options header");
        // x-powered-by must be gone
        assert.equal(res.headers.get("x-powered-by"), null);
    } finally {
        server.close();
    }
});
