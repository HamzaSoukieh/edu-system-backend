const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

function getTokenFromHeader(authHeader) {
    if (!authHeader || typeof authHeader !== "string") {
        return null;
    }

    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2) {
        return null;
    }

    const [scheme, token] = parts;
    if (scheme.toLowerCase() !== "bearer" || !token) {
        return null;
    }

    return token;
}

function getUserIdFromPayload(payload) {
    if (!payload || typeof payload.sub !== "string") {
        return null;
    }

    if (!mongoose.Types.ObjectId.isValid(payload.sub)) {
        return null;
    }

    return payload.sub;
}

async function authJwt(req, res, next) {
    try {
        const token = getTokenFromHeader(req.headers.authorization);
        if (!token) {
            return res.status(401).json({ message: "Missing or invalid authorization token" });
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            return res.status(500).json({ message: "JWT_SECRET is not configured" });
        }

        const payload = jwt.verify(token, jwtSecret);
        const userId = getUserIdFromPayload(payload);
        if (!userId) {
            return res.status(401).json({ message: "Invalid token" });
        }

        const user = await User.findById(userId).select("_id email status isEmailVerified").lean();

        if (!user) {
            return res.status(401).json({ message: "Invalid token user" });
        }

        if (user.status !== "active") {
            return res.status(403).json({ message: "Account is not active" });
        }

        req.user = {
            id: user._id.toString(),
            email: user.email,
            status: user.status,
            isEmailVerified: user.isEmailVerified,
        };

        return next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({ message: "Token expired" });
        }

        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({ message: "Invalid token" });
        }

        return next(error);
    }
}

module.exports = authJwt;
