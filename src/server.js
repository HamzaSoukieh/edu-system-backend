const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const { validateEnv } = require("./config/validateEnv");

// SEC-12: fail fast on missing critical config rather than 500-ing per request.
try {
    validateEnv();
} catch (error) {
    console.error(`Startup config error: ${error.message}`);
    process.exit(1);
}

const app = require("./app");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 5000;

async function start() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");

        app.listen(PORT, HOST, () => {
            console.log(`Server running on http://${HOST}:${PORT}`);
        });
    } catch (err) {
        console.error("Failed to start:", err.message);
        process.exit(1);
    }
}

start();
