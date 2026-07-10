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
        "academicDecision.review",
        "academicDecision.apply",
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

const ACADEMIC_OVERSIGHT_SCOPE_PERMISSIONS = [
    "academicRisk.read_scope",
    "academicProfile.read_scope",
    "academicStanding.read_scope",
    "academicDecision.read_scope",
    "academicDecision.recommend_scope",
];

const COORDINATION_SCOPE_PERMISSIONS = [
    "section.read_scope",
    "sectionSession.read_scope",
    "sectionSession.manage_scope",
    "attendance.read_scope",
    "attendance.manage_scope",
];

// Canonical scoped/organizational roles (D-005). The frontend's dean / principal /
// president / head / coordinator / mentor roles are modeled here as first-class
// responsibility types — NEVER inferred from free-text profile fields.
const RESPONSIBILITY_PERMISSIONS = {
    head: [...ACADEMIC_OVERSIGHT_SCOPE_PERMISSIONS],
    coordinator: [...COORDINATION_SCOPE_PERMISSIONS],
    mentor: [
        "academicProfile.read_scope",
        "academicStanding.read_scope",
    ],
    // College faculty leader: academic oversight + coordination over their faculty.
    dean: [...ACADEMIC_OVERSIGHT_SCOPE_PERMISSIONS, ...COORDINATION_SCOPE_PERMISSIONS],
    // School institution-level leader.
    principal: [...ACADEMIC_OVERSIGHT_SCOPE_PERMISSIONS, "section.read_scope", "attendance.read_scope"],
    // College institution-level leader.
    president: [...ACADEMIC_OVERSIGHT_SCOPE_PERMISSIONS, "section.read_scope", "attendance.read_scope"],
};

const RESPONSIBILITY_ALLOWED_SCOPES = {
    head: ["institution", "department", "classLevel"],
    coordinator: ["department", "classLevel", "class", "section"],
    mentor: ["class", "section"],
    dean: ["department", "classLevel"],
    principal: ["institution"],
    president: ["institution"],
};

const RESPONSIBILITY_TYPES = Object.keys(RESPONSIBILITY_ALLOWED_SCOPES);

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
    RESPONSIBILITY_TYPES,
    getAllowedResponsibilityScopes,
    isResponsibilityScopeAllowed,
};
