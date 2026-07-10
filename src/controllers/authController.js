const authService = require("../services/authService");

function resolveStatusCode(error) {
    if (error && Number.isInteger(error.statusCode)) {
        return error.statusCode;
    }

    return 500;
}

function resolveMessage(error, statusCode) {
    if (statusCode >= 500) {
        return "Internal server error";
    }

    return error.message || "Request failed";
}

function requestMeta(req) {
    return {
        ip: req.ip,
        userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
    };
}

async function signup(req, res) {
    try {
        const result = await authService.signup(req.body || {}, requestMeta(req));
        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function login(req, res) {
    try {
        const result = await authService.login(req.body || {}, requestMeta(req));
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function refresh(req, res) {
    try {
        const result = await authService.refreshSession(req.body || {}, requestMeta(req));
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function logout(req, res) {
    try {
        const result = await authService.logout(req.body || {});
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function logoutAll(req, res) {
    try {
        const result = await authService.logoutAll(req.user || {});
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function resendSignupOtp(req, res) {
    try {
        const result = await authService.resendSignupOtp(req.user || {});
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function verifySignupOtp(req, res) {
    try {
        const result = await authService.verifySignupOtp(req.user || {}, req.body?.code);
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function forgotPassword(req, res) {
    try {
        const result = await authService.forgotPassword(req.body || {});
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function resetPassword(req, res) {
    try {
        const result = await authService.resetPassword(req.body || {});
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function setupPassword(req, res) {
    try {
        const result = await authService.setupPassword(req.body || {}, requestMeta(req));
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    signup,
    login,
    refresh,
    logout,
    logoutAll,
    resendSignupOtp,
    verifySignupOtp,
    forgotPassword,
    resetPassword,
    setupPassword,
};
