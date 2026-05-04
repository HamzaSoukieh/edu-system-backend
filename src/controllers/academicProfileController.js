const academicProfileService = require("../services/academicProfileService");

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

async function getMyAcademicProfile(req, res) {
    try {
        const result = await academicProfileService.buildMyAcademicProfile({
            institutionId: req.params.institutionId || req.tenantId,
            actorUserId: req.user?.id || req.user?._id || null,
            actorMembership: req.membership || null,
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

async function getStudentAcademicProfile(req, res) {
    try {
        const result = await academicProfileService.buildStudentAcademicProfile({
            institutionId: req.params.institutionId || req.tenantId,
            studentMembershipId: req.params.studentMembershipId,
            actorUserId: req.user?.id || req.user?._id || null,
            actorMembership: req.membership || null,
            query: req.query || {},
        });

        return res.status(200).json(result);
    } catch (error) {
        const statusCode = resolveStatusCode(error);
        return res.status(statusCode).json({ message: resolveMessage(error, statusCode) });
    }
}

module.exports = {
    getMyAcademicProfile,
    getStudentAcademicProfile,
};
