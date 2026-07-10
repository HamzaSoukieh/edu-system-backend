const enrollmentService = require("../services/enrollmentService");

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

function buildErrorResponse(error, statusCode) {
    const response = {
        message: resolveMessage(error, statusCode),
    };

    if (statusCode < 500 && error?.reasonCode) {
        response.reasonCode = error.reasonCode;
    }

    if (statusCode < 500 && Array.isArray(error?.blockingReasonCodes)) {
        response.blockingReasonCodes = [...error.blockingReasonCodes];
    }

    return response;
}

async function createEnrollment(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const createdByUserId = req.user?.id || null;
        const result = await enrollmentService.createEnrollment({
            institutionId,
            sectionId,
            createdByUserId,
            payload: req.body || {},
        });

        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json(buildErrorResponse(error, statusCode));
    }
}

async function listEnrollments(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const result = await enrollmentService.listEnrollments({
            institutionId,
            sectionId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json(buildErrorResponse(error, statusCode));
    }
}

async function getEnrollmentById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const enrollmentId = req.params.enrollmentId;
        const result = await enrollmentService.getEnrollmentById({
            institutionId,
            sectionId,
            enrollmentId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json(buildErrorResponse(error, statusCode));
    }
}

async function updateEnrollmentStatus(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const enrollmentId = req.params.enrollmentId;
        const result = await enrollmentService.updateEnrollmentStatus({
            institutionId,
            sectionId,
            enrollmentId,
            payload: req.body || {},
            actorUserId: req.user?.id || req.user?._id || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json(buildErrorResponse(error, statusCode));
    }
}

async function getSelfEnrollmentEligibility(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const sectionId = req.params.sectionId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await enrollmentService.getSelfEnrollmentEligibility({
            institutionId,
            sectionId,
            actorUserId,
            actorMembership: req.membership || null,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json(buildErrorResponse(error, statusCode));
    }
}

async function listMySelfEnrollmentSections(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await enrollmentService.listMySelfEnrollmentSections({
            institutionId,
            actorUserId,
            actorMembership: req.membership || null,
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json(buildErrorResponse(error, statusCode));
    }
}

async function createMySelfEnrollmentSubmission(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const actorUserId = req.user?.id || req.user?._id || null;
        const result = await enrollmentService.createMySelfEnrollmentSubmission({
            institutionId,
            actorUserId,
            actorMembership: req.membership || null,
            payload: req.body || {},
        });

        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json(buildErrorResponse(error, statusCode));
    }
}

module.exports = {
    createEnrollment,
    listEnrollments,
    getEnrollmentById,
    updateEnrollmentStatus,
    listMySelfEnrollmentSections,
    getSelfEnrollmentEligibility,
    createMySelfEnrollmentSubmission,
};
