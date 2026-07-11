const test = require("node:test");
const assert = require("node:assert/strict");

const { errorHandler } = require("../src/middleware/errorHandler");
const logger = require("../src/utils/logger");

function fakeRes() {
    return {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

// Capture logger.error calls (the module is silent under NODE_ENV=test, so we
// spy on the method directly rather than on console).
function withLoggerSpy(run) {
    const original = logger.error;
    const calls = [];
    logger.error = (message, meta) => calls.push({ message, meta });
    try {
        return run(calls);
    } finally {
        logger.error = original;
    }
}

test("errorHandler masks 5xx to a generic message and logs the fault", () => {
    withLoggerSpy((calls) => {
        const res = fakeRes();
        const err = new Error("Mongo exploded");
        err.statusCode = 500;
        errorHandler(err, { method: "POST", originalUrl: "/auth/signup" }, res, () => {});

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { message: "Internal server error" });
        assert.equal(calls.length, 1, "a 5xx fault is logged");
        assert.equal(calls[0].meta.statusCode, 500);
        assert.equal(calls[0].meta.method, "POST");
        assert.equal(calls[0].meta.path, "/auth/signup");
        assert.match(calls[0].meta.message, /Mongo exploded/);
        assert.ok(calls[0].meta.stack, "stack is captured server-side");
    });
});

test("errorHandler passes a 4xx message through and does NOT log it", () => {
    withLoggerSpy((calls) => {
        const res = fakeRes();
        const err = new Error("Email is already in use");
        err.statusCode = 409;
        errorHandler(err, { method: "POST", originalUrl: "/auth/signup" }, res, () => {});

        assert.equal(res.statusCode, 409);
        assert.deepEqual(res.body, { message: "Email is already in use" });
        assert.equal(calls.length, 0, "4xx client errors are not logged");
    });
});

test("errorHandler defaults a non-integer statusCode to 500 (masked + logged)", () => {
    withLoggerSpy((calls) => {
        const res = fakeRes();
        errorHandler(new Error("boom"), { method: "GET", originalUrl: "/x" }, res, () => {});

        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { message: "Internal server error" });
        assert.equal(calls.length, 1);
    });
});

test("logger.format renders level, message and JSON meta; tolerates circular meta", () => {
    assert.equal(logger.format("info", "hello"), "[info] hello");
    assert.equal(logger.format("error", "x", { a: 1 }), '[error] x {"a":1}');
    const circular = {};
    circular.self = circular;
    assert.equal(logger.format("error", "circ", circular), "[error] circ");
});

test("logger is silent under NODE_ENV=test unless LOG_IN_TEST=1", () => {
    // NODE_ENV=test here; capture console.error to prove suppression.
    const originalConsole = console.error;
    const seen = [];
    console.error = (line) => seen.push(line);
    try {
        logger.error("should be suppressed", { a: 1 });
        assert.equal(seen.length, 0, "suppressed in test env by default");

        process.env.LOG_IN_TEST = "1";
        logger.error("should appear", { a: 1 });
        assert.equal(seen.length, 1);
        assert.match(seen[0], /should appear/);
    } finally {
        delete process.env.LOG_IN_TEST;
        console.error = originalConsole;
    }
});
