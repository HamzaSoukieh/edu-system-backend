const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const authRoutes = require("./routes/authRoutes");
const institutionRoutes = require("./routes/institutionRoutes");
const platformRoutes = require("./routes/platformRoutes");
const stripeWebhookController = require("./controllers/stripeWebhookController");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

// Security headers (SEC-11). Disable the default content-security-policy: this is a
// JSON API + static file host, not an HTML app, and a document CSP here only risks
// breaking cross-origin loading of /uploads assets. Cross-origin-resource-policy is
// relaxed so the separate frontend origin can load public images/logos.
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" },
    })
);

const DEVELOPMENT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

function parseAllowedOrigins() {
    const configuredOrigins = [process.env.FRONTEND_URL, process.env.FRONTEND_URLS]
        .filter(Boolean)
        .flatMap((value) => value.split(","))
        .map((origin) => origin.trim())
        .filter(Boolean);

    const defaultOrigins = process.env.NODE_ENV === "production"
        ? []
        : DEVELOPMENT_ALLOWED_ORIGINS;

    return [...new Set([...configuredOrigins, ...defaultOrigins])];
}

const allowedOrigins = parseAllowedOrigins();

// In development the Vite dev server may land on any free port (5173, 5174, …)
// when earlier instances hold the default, and it may report itself as either
// `localhost` or `127.0.0.1`. Hardcoding two ports meant the browser blocked
// login/signup whenever the app ran on a different port. So, OUTSIDE production,
// accept any loopback origin regardless of port. Production keeps the strict,
// explicit allowlist from FRONTEND_URL(S).
function isLoopbackOrigin(origin) {
    if (process.env.NODE_ENV === "production") {
        return false;
    }
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function isOriginAllowed(origin) {
    return !origin || allowedOrigins.includes(origin) || isLoopbackOrigin(origin);
}

app.use(
    cors({
        credentials: true,
        origin(origin, callback) {
            return callback(null, isOriginAllowed(origin));
        },
    })
);
app.post("/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookController.handleStripeWebhook);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.get("/health", (_req, res) => {
    return res.status(200).json({ status: "ok" });
});
// SEC-13: member profile pictures are PII and must not be publicly served.
// Block that subdirectory before the public static handler; institution logos
// (under /uploads/institution-logos) remain public. A future authenticated or
// signed-URL route can serve profile pictures to authorized viewers.
app.use("/uploads/member-profiles", (_req, res) => res.status(404).json({ message: "Not found" }));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
app.use("/auth", authRoutes);
app.use("/institutions", institutionRoutes);
app.use("/platform", platformRoutes);

app.use((req, res) => {
    return res.status(404).json({ message: "Route not found" });
});

app.use(errorHandler);

module.exports = app;
