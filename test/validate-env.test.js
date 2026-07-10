const test = require("node:test");
const assert = require("node:assert/strict");

const { validateEnv } = require("../src/config/validateEnv");

const base = {
    MONGO_URI: "mongodb://127.0.0.1:27017/x",
    JWT_SECRET: "s",
    QR_JWT_SECRET: "q",
};

test("passes when all required vars are present", () => {
    assert.equal(validateEnv({ ...base }), true);
});

test("throws listing every missing required var", () => {
    assert.throws(
        () => validateEnv({ NODE_ENV: "development" }),
        /Missing required environment variable\(s\): MONGO_URI, JWT_SECRET, QR_JWT_SECRET/
    );
});

test("treats empty strings as missing", () => {
    assert.throws(() => validateEnv({ ...base, JWT_SECRET: "   " }), /JWT_SECRET/);
});

test("requires FRONTEND_URL in production", () => {
    assert.throws(() => validateEnv({ ...base, NODE_ENV: "production" }), /FRONTEND_URL/);
    assert.equal(validateEnv({ ...base, NODE_ENV: "production", FRONTEND_URL: "https://app" }), true);
});

test("refuses the QR date override in production", () => {
    assert.throws(
        () => validateEnv({ ...base, NODE_ENV: "production", FRONTEND_URL: "https://app", ATTENDANCE_QR_DATE_OVERRIDE: "2026-01-01" }),
        /ATTENDANCE_QR_DATE_OVERRIDE must not be set in production/
    );
});
