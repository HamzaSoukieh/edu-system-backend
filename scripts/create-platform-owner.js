#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const PlatformAdmin = require("../src/models/PlatformAdmin");
const User = require("../src/models/User");

function normalizeEmail(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseEmailArg(args) {
    const index = args.indexOf("--email");
    const email = index >= 0 ? normalizeEmail(args[index + 1]) : "";
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        throw new Error("Usage: npm run platform:create-owner -- --email owner@example.test");
    }
    return email;
}

async function createPlatformOwner(email) {
    const user = await User.findOne({ email }).select("_id email status isEmailVerified").lean();
    if (!user) throw new Error("Verified active user not found");
    if (user.status !== "active" || user.isEmailVerified !== true) throw new Error("User must be active and email-verified");
    if (await PlatformAdmin.exists({ userId: user._id })) throw new Error("Platform administrator already exists for this user");

    await PlatformAdmin.create({
        userId: user._id,
        role: "platform_owner",
        status: "active",
        createdByUserId: user._id,
    });
    return user.email;
}

async function main() {
    const email = parseEmailArg(process.argv.slice(2));
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured");
    await mongoose.connect(process.env.MONGO_URI);
    try {
        const createdEmail = await createPlatformOwner(email);
        console.log(`Platform owner created for ${createdEmail}`);
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    main().catch(async (error) => {
        console.error(error.message);
        try { await mongoose.disconnect(); } catch (_disconnectError) {}
        process.exitCode = 1;
    });
}

module.exports = { createPlatformOwner, normalizeEmail, parseEmailArg };
