const fs = require("fs");
const memberService = require("../services/memberService");

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

function buildErrorBody(error, statusCode) {
    const body = {
        message: resolveMessage(error, statusCode),
    };

    if (statusCode < 500 && error?.code) {
        body.code = error.code;
    }

    if (statusCode < 500 && error?.details && typeof error.details === "object") {
        body.details = error.details;
    }

    return body;
}

function createPayloadError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function resolveMemberPayload(req) {
    const rawBody = req.body;
    let payload = {};

    if (typeof rawBody === "string") {
        try {
            payload = JSON.parse(rawBody);
        } catch (_error) {
            throw createPayloadError("Request body must be a valid JSON object");
        }

        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            throw createPayloadError("Request body must be an object");
        }
    } else if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
        payload = { ...rawBody };
    }

    if (payload.payload !== undefined) {
        if (typeof payload.payload !== "string") {
            throw createPayloadError("payload must be a valid JSON object");
        }

        let parsedPayload;
        try {
            parsedPayload = JSON.parse(payload.payload);
        } catch (_error) {
            throw createPayloadError("payload must be a valid JSON object");
        }

        if (!parsedPayload || typeof parsedPayload !== "object" || Array.isArray(parsedPayload)) {
            throw createPayloadError("payload must be an object");
        }

        payload = {
            ...parsedPayload,
            ...payload,
        };
        delete payload.payload;
    }

    if (payload.profile !== undefined && typeof payload.profile === "string") {
        let parsedProfile;
        try {
            parsedProfile = JSON.parse(payload.profile);
        } catch (_error) {
            throw createPayloadError("profile must be a valid JSON object");
        }

        if (!parsedProfile || typeof parsedProfile !== "object" || Array.isArray(parsedProfile)) {
            throw createPayloadError("profile must be an object");
        }

        payload.profile = parsedProfile;
    }

    if (req.file) {
        const profilePictureUrl = `/uploads/member-profiles/${req.file.filename}`;
        const profile =
            payload.profile && typeof payload.profile === "object" && !Array.isArray(payload.profile)
                ? { ...payload.profile }
                : {};

        profile.profilePictureUrl = profilePictureUrl;
        payload.profile = profile;
    }

    return payload;
}

function removeUploadedFile(filePath) {
    if (!filePath) {
        return;
    }

    fs.promises.unlink(filePath).catch(() => {});
}

async function createMember(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const createdByUserId = req.user?.id || null;
        const payload = resolveMemberPayload(req);
        const result = await memberService.createMember({
            institutionId,
            createdByUserId,
            payload,
        });

        return res.status(201).json(result);
    } catch (error) {
        removeUploadedFile(req.file?.path);
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json(buildErrorBody(error, statusCode));
    }
}

async function listMembers(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await memberService.listMembers({
            institutionId,
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json(buildErrorBody(error, statusCode));
    }
}

async function getMemberById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const membershipId = req.params.membershipId;
        const result = await memberService.getMemberById({
            institutionId,
            membershipId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json(buildErrorBody(error, statusCode));
    }
}

async function getMyMemberProfile(req, res) {
    try {
        const institutionId = req.tenantId || req.params.institutionId;
        const result = await memberService.getMyMemberProfile({
            institutionId,
            actorUser: req.user,
            actorMembership: req.membership,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json(buildErrorBody(error, statusCode));
    }
}

async function updateMember(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const membershipId = req.params.membershipId;
        const payload = resolveMemberPayload(req);
        const result = await memberService.updateMember({
            institutionId,
            membershipId,
            payload,
        });

        return res.status(200).json(result);
    } catch (error) {
        removeUploadedFile(req.file?.path);
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json(buildErrorBody(error, statusCode));
    }
}

async function updateMemberStatus(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const membershipId = req.params.membershipId;
        const result = await memberService.updateMemberStatus({
            institutionId,
            membershipId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json(buildErrorBody(error, statusCode));
    }
}

module.exports = {
    createMember,
    listMembers,
    getMemberById,
    getMyMemberProfile,
    updateMember,
    updateMemberStatus,
};
