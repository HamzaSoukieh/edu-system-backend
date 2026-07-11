// Global Express error handler.
//
// Preserves the existing client contract — a bare { message }, with 5xx masked
// to a generic "Internal server error" so stacks/DB errors never leak — and adds
// server-side logging of faults (BR-14): a 5xx previously returned silently with
// no record, which is exactly why the signup-500 was hard to trace. 4xx are
// expected client errors and are deliberately NOT logged (they would be noise).

const logger = require("../utils/logger");

function errorHandler(error, req, res, _next) {
    const statusCode = Number.isInteger(error && error.statusCode) ? error.statusCode : 500;

    if (statusCode >= 500) {
        logger.error("Unhandled request error", {
            method: req && req.method,
            path: (req && (req.originalUrl || req.url)) || undefined,
            statusCode,
            message: error && error.message,
            stack: error && error.stack,
        });
    }

    const message = statusCode >= 500 ? "Internal server error" : error.message;
    return res.status(statusCode).json({ message });
}

module.exports = { errorHandler };
