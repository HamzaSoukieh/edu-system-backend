// Fail-fast environment validation (SEC-12). Missing critical secrets should
// crash the process at boot with a clear message, not surface as opaque 500s
// per request at runtime.

const ALWAYS_REQUIRED = ["MONGO_URI", "JWT_SECRET", "QR_JWT_SECRET"];

// Additional variables that must be present in production.
const PRODUCTION_REQUIRED = ["FRONTEND_URL"];

function validateEnv(env = process.env) {
    const required = [...ALWAYS_REQUIRED];
    if (env.NODE_ENV === "production") {
        required.push(...PRODUCTION_REQUIRED);
    }

    const missing = required.filter((key) => {
        const value = env[key];
        return value === undefined || value === null || String(value).trim() === "";
    });

    if (missing.length) {
        throw new Error(
            `Missing required environment variable(s): ${missing.join(", ")}. ` +
                "Refusing to start. Set them (see .env.example) and try again."
        );
    }

    // SEC-9: the QR attendance date override must never be relied on outside an
    // explicit non-production context.
    if (env.NODE_ENV === "production" && env.ATTENDANCE_QR_DATE_OVERRIDE) {
        throw new Error(
            "ATTENDANCE_QR_DATE_OVERRIDE must not be set in production. Refusing to start."
        );
    }

    return true;
}

module.exports = { validateEnv, ALWAYS_REQUIRED, PRODUCTION_REQUIRED };
