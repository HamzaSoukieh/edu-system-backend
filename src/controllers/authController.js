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

async function signup(req, res) {
    try {
        const result = await authService.signup(req.body || {});
        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function login(req, res) {
    try {
        const result = await authService.login(req.body || {});
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

module.exports = {
    signup,
    login,
    resendSignupOtp,
    verifySignupOtp,
    forgotPassword,
    resetPassword,
};
