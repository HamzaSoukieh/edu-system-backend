const test = require("node:test");
const assert = require("node:assert/strict");

const authService = require("../src/services/authService");

// Deterministic gating tests for devOtpCode exposure (D-003 / IM-6).
// The security-critical guarantee: production NEVER returns an OTP value.

test("devOtpFields exposes the OTP outside production", () => {
    const prev = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = "development";
        assert.deepEqual(authService.devOtpFields("123456"), { devOtpCode: "123456" });
        process.env.NODE_ENV = "test";
        assert.deepEqual(authService.devOtpFields("654321"), { devOtpCode: "654321" });
    } finally {
        process.env.NODE_ENV = prev;
    }
});

test("devOtpFields NEVER exposes the OTP in production", () => {
    const prev = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = "production";
        assert.deepEqual(authService.devOtpFields("123456"), {});
    } finally {
        process.env.NODE_ENV = prev;
    }
});

test("devOtpFields returns empty when no code is provided", () => {
    const prev = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = "development";
        assert.deepEqual(authService.devOtpFields(null), {});
        assert.deepEqual(authService.devOtpFields(undefined), {});
        assert.deepEqual(authService.devOtpFields(""), {});
    } finally {
        process.env.NODE_ENV = prev;
    }
});
