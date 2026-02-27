const dotenv = require("dotenv");
const mongoose = require("mongoose");
const app = require("./app");

dotenv.config();

const PORT = process.env.PORT || 5000;

async function start() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");

        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("Failed to start:", err.message);
        process.exit(1);
    }
}

start();
