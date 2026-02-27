function requireEmailVerified(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    if (!req.user.isEmailVerified) {
        return res.status(403).json({ message: "Email is not verified" });
    }

    return next();
}

module.exports = requireEmailVerified;
