const express = require("express");
const path = require("path");
const authRoutes = require("./routes/authRoutes");
const institutionRoutes = require("./routes/institutionRoutes");

const app = express();

app.use(express.json());
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
