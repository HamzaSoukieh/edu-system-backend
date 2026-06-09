const ROLE_PERMISSIONS = {
    admin: [
        "institution.manage",
        "department.manage",
        "class.manage",
        "membership.manage",
        "semester.manage",
        "subject.manage",
        "section.read",
        "section.manage",
        "student.kick",
        "attendance.manage",
        "billing.manage",
    ],
    instructor: [
        "section.read",
        "attendance.take",
        "attendance.excuse",
    ],
    student: [
        "section.read",
        "enrollment.self_manage",
        "attendance.read_self",
        "billing.read_self",
    ],
};

const RESPONSIBILITY_PERMISSIONS = {
    head: [],
    coordinator: [
        "section.read_scope",
        "sectionSession.read_scope",
        "sectionSession.manage_scope",
        "attendance.read_scope",
        "attendance.manage_scope",
    ],
    mentor: [],
};

const RESPONSIBILITY_ALLOWED_SCOPES = {
    head: ["institution", "department", "classLevel"],
    coordinator: ["department", "classLevel", "class", "section"],
    mentor: ["class", "section"],
};

function getAllowedResponsibilityScopes(responsibilityType) {
    return RESPONSIBILITY_ALLOWED_SCOPES[responsibilityType] || [];
}

function isResponsibilityScopeAllowed(responsibilityType, scopeType) {
    return getAllowedResponsibilityScopes(responsibilityType).includes(scopeType);
}

module.exports = {
    ROLE_PERMISSIONS,
    RESPONSIBILITY_PERMISSIONS,
    RESPONSIBILITY_ALLOWED_SCOPES,
    getAllowedResponsibilityScopes,
    isResponsibilityScopeAllowed,
};
