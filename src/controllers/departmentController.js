const departmentService = require("../services/departmentService");

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

async function createDepartment(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const createdByUserId = req.user?.id || null;

        const result = await departmentService.createDepartment({
            institutionId,
            createdByUserId,
            payload: req.body || {},
        });

        return res.status(201).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function listDepartments(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const result = await departmentService.listDepartments({
            institutionId,
            status: req.query?.status,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getDepartmentById(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const departmentId = req.params.departmentId;
        const result = await departmentService.getDepartmentById({
            institutionId,
            departmentId,
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function updateDepartment(req, res) {
    try {
        const institutionId = req.params.institutionId || req.tenantId;
        const departmentId = req.params.departmentId;
        const result = await departmentService.updateDepartment({
            institutionId,
            departmentId,
            payload: req.body || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    listDepartments,
    getDepartmentById,
    createDepartment,
    updateDepartment,
};
