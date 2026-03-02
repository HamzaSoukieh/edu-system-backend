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

async function listSubjects(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await subjectService.listSubjects({
            institutionId,
            departmentId: req.query?.departmentId,
            active: req.query?.active,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getSubjectById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const subjectId = req.params.subjectId;
        const result = await subjectService.getSubjectById({
            institutionId,
            subjectId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
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

async function updateSubject(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const subjectId = req.params.subjectId;
        const result = await subjectService.updateSubject({
            institutionId,
            subjectId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function deleteSubject(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const subjectId = req.params.subjectId;
        const result = await subjectService.deleteSubject({
            institutionId,
            subjectId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    listSubjects,
    getSubjectById,
    createSubject,
    updateSubject,
    deleteSubject,
};
