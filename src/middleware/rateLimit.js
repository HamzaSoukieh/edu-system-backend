const rateLimit = require("express-rate-limit");

// Application-level rate limiting for authentication endpoints (SEC-8). This is
// defense-in-depth independent of any reverse proxy (nginx). Two tiers:
//   - standard:  login, OTP verify, password reset  (credential guessing)
//   - issuance:  signup, forgot-password, OTP resend (email/OTP flooding)
//
// Limits are configurable via env; sensible defaults applied. Disabled under
// NODE_ENV=test unless RATE_LIMIT_ENABLED=true, so the existing unit suite is not
// throttled while the limiter itself remains directly testable.

function parseIntEnv(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function shouldSkip() {
    return process.env.NODE_ENV === "test" && process.env.RATE_LIMIT_ENABLED !== "true";
}

function buildLimiter({ windowMs, limit, message }) {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        skip: shouldSkip,
        // Do not include the (anti-enumeration-sensitive) body in the key; IP-based.
        message: { message },
        handler: (req, res, _next, options) => {
            res.status(options.statusCode).json(options.message);
        },
    });
}

const authStandardLimiter = buildLimiter({
    windowMs: parseIntEnv(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 60 * 1000),
    limit: parseIntEnv(process.env.RATE_LIMIT_AUTH_STANDARD_MAX, 10),
    message: "Too many attempts. Please try again later.",
});

const authIssuanceLimiter = buildLimiter({
    windowMs: parseIntEnv(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 60 * 1000),
    limit: parseIntEnv(process.env.RATE_LIMIT_AUTH_ISSUANCE_MAX, 5),
    message: "Too many requests. Please try again later.",
});

module.exports = {
    authStandardLimiter,
    authIssuanceLimiter,
    buildLimiter,
};
