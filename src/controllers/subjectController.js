const subjectService = require("../services/subjectService");

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

async function createSubject(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const departmentId = req.params.departmentId;
        const createdByUserId = req.user?.id || null;

        const result = await subjectService.createSubject({
            institutionId,
            departmentId,
            createdByUserId,
            payload: req.body || {},
        });

        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    createSubject,
};
