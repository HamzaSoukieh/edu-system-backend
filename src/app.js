const express = require("express");
const path = require("path");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const institutionRoutes = require("./routes/institutionRoutes");
const stripeWebhookController = require("./controllers/stripeWebhookController");

const app = express();

const DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

function parseAllowedOrigins() {
    const configuredOrigins = [process.env.FRONTEND_URL, process.env.FRONTEND_URLS]
        .filter(Boolean)
        .flatMap((value) => value.split(","))
        .map((origin) => origin.trim())
        .filter(Boolean);

    return [...new Set([...configuredOrigins, ...DEFAULT_ALLOWED_ORIGINS])];
}

const allowedOrigins = parseAllowedOrigins();

app.use(
    cors({
        credentials: true,
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(null, false);
        },
    })
);
app.post("/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookController.handleStripeWebhook);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
app.use("/auth", authRoutes);
app.use("/institutions", institutionRoutes);

app.use((req, res) => {
    return res.status(404).json({ message: "Route not found" });
});

app.use((error, _req, res, _next) => {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const message = statusCode >= 500 ? "Internal server error" : error.message;

    return res.status(statusCode).json({ message });
});

module.exports = app;
