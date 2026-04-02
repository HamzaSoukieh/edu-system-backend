const ROLE_PERMISSIONS = {
    admin: [
        "institution.manage",
        "department.manage",
        "class.manage",
        "membership.manage",
        "semester.manage",
        "subject.manage",
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
    head: [
        "membership.manage_scope",
        "section.manage_scope",
        "student.kick",
    ],
    mentor: [
        "membership.manage_scope",
        "student.kick",
        "attendance.manage_scope",
    ],
    coordinator: [
        "section.manage_scope",
        "attendance.manage_scope",
    ],
};

module.exports = {
    ROLE_PERMISSIONS,
    RESPONSIBILITY_PERMISSIONS,
};
