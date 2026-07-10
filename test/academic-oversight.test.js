const test = require("node:test");
const assert = require("node:assert/strict");

const Assessment = require("../src/models/Assessment");
const AssessmentResult = require("../src/models/AssessmentResult");
const AttendanceRecord = require("../src/models/AttendanceRecord");
const ClassLevel = require("../src/models/ClassLevel");
const Department = require("../src/models/Department");
const Enrollment = require("../src/models/Enrollment");
const Institution = require("../src/models/Institution");
const MemberProfile = require("../src/models/MemberProfile");
const Membership = require("../src/models/Membership");
const ResponsibilityAssignment = require("../src/models/ResponsibilityAssignment");
const SchoolClass = require("../src/models/SchoolClass");
const Section = require("../src/models/Section");
const SectionSession = require("../src/models/SectionSession");
const Subject = require("../src/models/Subject");
const User = require("../src/models/User");
const { RESPONSIBILITY_PERMISSIONS } = require("../src/auth/permissions");
const {
    hasResponsibilityPermissionWithinScope,
} = require("../src/auth/scopedResponsibilities");
const academicOversightController = require("../src/controllers/academicOversightController");
const academicOversightService = require("../src/services/academicOversightService");
const universityAcademicOutcomeService = require("../src/services/universityAcademicOutcomeService");
const institutionRoutes = require("../src/routes/institutionRoutes");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";
const ownerUserId = "507f1f77bcf86cd799439021";
const adminUserId = "507f1f77bcf86cd799439022";
const headUserId = "507f1f77bcf86cd799439023";
const instructorUserId = "507f1f77bcf86cd799439024";
const studentUserId = "507f1f77bcf86cd799439025";
const otherStudentUserId = "507f1f77bcf86cd799439026";
const thirdStudentUserId = "507f1f77bcf86cd799439027";
const adminMembershipId = "507f1f77bcf86cd799439031";
const headMembershipId = "507f1f77bcf86cd799439032";
const instructorMembershipId = "507f1f77bcf86cd799439033";
const studentMembershipId = "507f1f77bcf86cd799439034";
const otherStudentMembershipId = "507f1f77bcf86cd799439035";
const thirdStudentMembershipId = "507f1f77bcf86cd799439036";
const departmentId = "507f1f77bcf86cd799439041";
const otherDepartmentId = "507f1f77bcf86cd799439042";
const crossTenantDepartmentId = "507f1f77bcf86cd799439048";
const classLevelId = "507f1f77bcf86cd799439043";
const otherClassLevelId = "507f1f77bcf86cd799439049";
const subjectId = "507f1f77bcf86cd799439044";
const otherSubjectId = "507f1f77bcf86cd799439045";
const classLevelSubjectId = "507f1f77bcf86cd799439046";
const schoolClassId = "507f1f77bcf86cd799439047";
const sectionId = "507f1f77bcf86cd799439051";
const otherSectionId = "507f1f77bcf86cd799439052";
const classLevelSectionId = "507f1f77bcf86cd799439053";
const crossTenantSectionId = "507f1f77bcf86cd799439054";
const sessionId = "507f1f77bcf86cd799439061";
const assessmentId = "507f1f77bcf86cd799439071";
const otherAssessmentId = "507f1f77bcf86cd799439072";

function normalizeId(value) {
    return value === undefined || value === null ? null : value.toString();
}

function createQuery(result) {
    return {
        select() {
            return this;
        },
        sort() {
            return this;
        },
        lean: async () => result,
        then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
        },
    };
}

function matchesValue(value, condition) {
    if (condition === undefined) {
        return true;
    }

    if (condition && typeof condition === "object" && !Array.isArray(condition)) {
        if (condition.$in) {
            return condition.$in.map(normalizeId).includes(normalizeId(value));
        }
        if (condition.$ne !== undefined) {
            return normalizeId(value) !== normalizeId(condition.$ne);
        }
    }

    return normalizeId(value) === normalizeId(condition);
}

function matchesRecord(record, query = {}) {
    return Object.entries(query).every(([field, condition]) => {
        if (field === "$or") {
            return condition.some((item) => matchesRecord(record, item));
        }

        return matchesValue(record[field], condition);
    });
}

function buildInstitution(overrides = {}) {
    return {
        _id: institutionId,
        ownerUserId,
        type: "university",
        policies: {
            warnAfterAbsences: 2,
            dropAfterAbsences: 4,
            lateToAbsenceRatio: 2,
            excusedCountsAsAbsence: true,
        },
        ...overrides,
    };
}

function buildMembership(overrides = {}) {
    return {
        _id: adminMembershipId,
        institutionId,
        userId: adminUserId,
        role: "admin",
        status: "active",
        ...overrides,
    };
}

function buildAssignment(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439081",
        institutionId,
        userId: headUserId,
        responsibilityType: "head",
        scopeType: "department",
        scopeId: departmentId,
        isActive: true,
        startAt: null,
        endAt: null,
        permissions: ["section.read_scope", "membership.manage"],
        ...overrides,
    };
}

function buildDataset(overrides = {}) {
    return {
        institutions: [
            buildInstitution(),
            buildInstitution({ _id: otherInstitutionId, ownerUserId: "507f1f77bcf86cd799439099" }),
        ],
        memberships: [
            buildMembership(),
            buildMembership({
                _id: headMembershipId,
                userId: headUserId,
                role: "instructor",
            }),
            buildMembership({
                _id: instructorMembershipId,
                userId: instructorUserId,
                role: "instructor",
            }),
            buildMembership({
                _id: studentMembershipId,
                userId: studentUserId,
                role: "student",
            }),
            buildMembership({
                _id: otherStudentMembershipId,
                userId: otherStudentUserId,
                role: "student",
            }),
        ],
        profiles: [
            {
                _id: "507f1f77bcf86cd799439091",
                institutionId,
                membershipId: studentMembershipId,
                userId: studentUserId,
                fullName: "Scoped Student",
                fullNameNormalized: "scoped student",
            },
            {
                _id: "507f1f77bcf86cd799439092",
                institutionId,
                membershipId: otherStudentMembershipId,
                userId: otherStudentUserId,
                fullName: "Outside Student",
                fullNameNormalized: "outside student",
            },
        ],
        users: [
            { _id: studentUserId, email: "scoped@example.test", passwordHash: "secret" },
            { _id: otherStudentUserId, email: "outside@example.test", passwordHash: "secret" },
        ],
        departments: [
            { _id: departmentId, institutionId },
            { _id: otherDepartmentId, institutionId },
            { _id: crossTenantDepartmentId, institutionId: otherInstitutionId },
        ],
        subjects: [
            { _id: subjectId, institutionId, departmentId, classLevelId: null },
            { _id: otherSubjectId, institutionId, departmentId: otherDepartmentId, classLevelId: null },
            { _id: classLevelSubjectId, institutionId, departmentId: null, classLevelId },
        ],
        classLevels: [
            { _id: classLevelId, institutionId },
            { _id: otherClassLevelId, institutionId: otherInstitutionId },
        ],
        schoolClasses: [{ _id: schoolClassId, institutionId, classLevelId }],
        sections: [
            { _id: sectionId, institutionId, subjectId, schoolClassId: null },
            { _id: otherSectionId, institutionId, subjectId: otherSubjectId, schoolClassId: null },
            { _id: classLevelSectionId, institutionId, subjectId: classLevelSubjectId, schoolClassId },
        ],
        enrollments: [
            {
                _id: "507f1f77bcf86cd799439101",
                institutionId,
                sectionId,
                studentMemberId: studentMembershipId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd799439102",
                institutionId,
                sectionId: otherSectionId,
                studentMemberId: otherStudentMembershipId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd799439103",
                institutionId,
                sectionId: classLevelSectionId,
                studentMemberId: studentMembershipId,
                status: "enrolled",
            },
        ],
        sectionSessions: [
            {
                _id: sessionId,
                institutionId,
                sectionId,
                status: "completed",
                attendanceState: "closed",
            },
        ],
        attendanceRecords: [
            {
                _id: "507f1f77bcf86cd799439111",
                institutionId,
                sectionId,
                sectionSessionId: sessionId,
                studentMemberId: studentMembershipId,
                attendanceStatus: "absent",
            },
            {
                _id: "507f1f77bcf86cd799439112",
                institutionId,
                sectionId,
                sectionSessionId: sessionId,
                studentMemberId: studentMembershipId,
                attendanceStatus: "late",
            },
            {
                _id: "507f1f77bcf86cd799439113",
                institutionId,
                sectionId,
                sectionSessionId: sessionId,
                studentMemberId: studentMembershipId,
                attendanceStatus: "excused",
            },
        ],
        assessments: [
            {
                _id: assessmentId,
                institutionId,
                sectionId,
                status: "published",
                maxScore: 100,
                weight: 100,
            },
        ],
        assessmentResults: [
            {
                _id: "507f1f77bcf86cd799439121",
                institutionId,
                sectionId,
                assessmentId,
                studentMemberId: studentMembershipId,
                score: 55,
            },
        ],
        assignments: [buildAssignment()],
        queryLog: [],
        writeLog: [],
        ...overrides,
    };
}

function buildAdditiveHeadScopeOverrides({ assignments } = {}) {
    return {
        memberships: [
            buildMembership(),
            buildMembership({
                _id: headMembershipId,
                userId: headUserId,
                role: "instructor",
            }),
            buildMembership({
                _id: studentMembershipId,
                userId: studentUserId,
                role: "student",
            }),
            buildMembership({
                _id: otherStudentMembershipId,
                userId: otherStudentUserId,
                role: "student",
            }),
            buildMembership({
                _id: thirdStudentMembershipId,
                userId: thirdStudentUserId,
                role: "student",
            }),
        ],
        profiles: [
            {
                _id: "507f1f77bcf86cd799439091",
                institutionId,
                membershipId: studentMembershipId,
                userId: studentUserId,
                fullName: "Math Grade 9 Student",
                fullNameNormalized: "math grade 9 student",
            },
            {
                _id: "507f1f77bcf86cd799439092",
                institutionId,
                membershipId: otherStudentMembershipId,
                userId: otherStudentUserId,
                fullName: "Science Grade 10 Student",
                fullNameNormalized: "science grade 10 student",
            },
            {
                _id: "507f1f77bcf86cd799439093",
                institutionId,
                membershipId: thirdStudentMembershipId,
                userId: thirdStudentUserId,
                fullName: "Science Grade 9 Student",
                fullNameNormalized: "science grade 9 student",
            },
        ],
        users: [
            { _id: studentUserId, email: "math-grade9@example.test", passwordHash: "secret" },
            { _id: otherStudentUserId, email: "science-grade10@example.test", passwordHash: "secret" },
            { _id: thirdStudentUserId, email: "science-grade9@example.test", passwordHash: "secret" },
        ],
        departments: [
            { _id: departmentId, institutionId },
            { _id: otherDepartmentId, institutionId },
            { _id: crossTenantDepartmentId, institutionId: otherInstitutionId },
        ],
        subjects: [
            { _id: subjectId, institutionId, departmentId, classLevelId: null },
            { _id: classLevelSubjectId, institutionId, departmentId: otherDepartmentId, classLevelId },
            { _id: otherSubjectId, institutionId, departmentId: otherDepartmentId, classLevelId: null },
        ],
        classLevels: [
            { _id: classLevelId, institutionId },
            { _id: otherClassLevelId, institutionId: otherInstitutionId },
        ],
        schoolClasses: [{ _id: schoolClassId, institutionId, classLevelId }],
        sections: [
            { _id: sectionId, institutionId, subjectId, schoolClassId: null },
            { _id: classLevelSectionId, institutionId, subjectId: classLevelSubjectId, schoolClassId },
            { _id: otherSectionId, institutionId, subjectId: otherSubjectId, schoolClassId: null },
            { _id: crossTenantSectionId, institutionId: otherInstitutionId, subjectId: otherSubjectId, schoolClassId: null },
        ],
        enrollments: [
            {
                _id: "507f1f77bcf86cd799439101",
                institutionId,
                sectionId,
                studentMemberId: studentMembershipId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd799439102",
                institutionId,
                sectionId: classLevelSectionId,
                studentMemberId: otherStudentMembershipId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd799439103",
                institutionId,
                sectionId: otherSectionId,
                studentMemberId: thirdStudentMembershipId,
                status: "enrolled",
            },
        ],
        sectionSessions: [],
        attendanceRecords: [],
        assessments: [],
        assessmentResults: [],
        assignments:
            assignments ||
            [
                buildAssignment({ scopeType: "department", scopeId: departmentId }),
                buildAssignment({
                    _id: "507f1f77bcf86cd799439082",
                    scopeType: "classLevel",
                    scopeId: classLevelId,
                }),
            ],
    };
}

function mockModel(t, model, modelName, records, data) {
    t.mock.method(model, "findOne", (query) => {
        data.queryLog.push({ model: modelName, method: "findOne", query });
        return createQuery(records.find((record) => matchesRecord(record, query)) || null);
    });
    t.mock.method(model, "find", (query) => {
        data.queryLog.push({ model: modelName, method: "find", query });
        return createQuery(records.filter((record) => matchesRecord(record, query)));
    });
    t.mock.method(model, "create", async (payload) => {
        data.writeLog.push({ model: modelName, method: "create", payload });
        throw new Error(`${modelName}.create should not be called by academic oversight`);
    });
    t.mock.method(model, "findOneAndUpdate", (query, update) => {
        data.writeLog.push({ model: modelName, method: "findOneAndUpdate", query, update });
        throw new Error(`${modelName}.findOneAndUpdate should not be called by academic oversight`);
    });
    t.mock.method(model, "deleteOne", (query) => {
        data.writeLog.push({ model: modelName, method: "deleteOne", query });
        throw new Error(`${modelName}.deleteOne should not be called by academic oversight`);
    });
    for (const method of ["updateOne", "updateMany", "deleteMany", "findByIdAndUpdate", "findByIdAndDelete"]) {
        t.mock.method(model, method, (...args) => {
            data.writeLog.push({ model: modelName, method, args });
            throw new Error(`${modelName}.${method} should not be called by academic oversight`);
        });
    }
}

function mockAcademicOversightDependencies(t, overrides = {}) {
    const data = buildDataset(overrides);
    mockModel(t, Institution, "Institution", data.institutions, data);
    mockModel(t, Membership, "Membership", data.memberships, data);
    mockModel(t, MemberProfile, "MemberProfile", data.profiles, data);
    mockModel(t, User, "User", data.users, data);
    mockModel(t, ResponsibilityAssignment, "ResponsibilityAssignment", data.assignments, data);
    mockModel(t, Department, "Department", data.departments, data);
    mockModel(t, Subject, "Subject", data.subjects, data);
    mockModel(t, ClassLevel, "ClassLevel", data.classLevels, data);
    mockModel(t, SchoolClass, "SchoolClass", data.schoolClasses, data);
    mockModel(t, Section, "Section", data.sections, data);
    mockModel(t, Enrollment, "Enrollment", data.enrollments, data);
    mockModel(t, SectionSession, "SectionSession", data.sectionSessions, data);
    mockModel(t, AttendanceRecord, "AttendanceRecord", data.attendanceRecords, data);
    mockModel(t, Assessment, "Assessment", data.assessments, data);
    mockModel(t, AssessmentResult, "AssessmentResult", data.assessmentResults, data);

    t.mock.method(universityAcademicOutcomeService, "listStudentAcademicOutcomes", async ({ studentMemberId }) => {
        if (normalizeId(studentMemberId) === studentMembershipId) {
            return {
                outcomes: [{ outcomeStatus: "failed" }],
                summary: {
                    cumulativeGpa: 1.5,
                    totalEarnedCreditHours: 3,
                    totalAttemptedCreditHours: 6,
                },
                academicStandingRules: null,
                excluded: [],
                warnings: [],
            };
        }

        return {
            outcomes: [],
            summary: {
                cumulativeGpa: null,
                totalEarnedCreditHours: 0,
                totalAttemptedCreditHours: 0,
            },
            academicStandingRules: null,
            excluded: [],
            warnings: [],
        };
    });

    return data;
}

function headActor(overrides = {}) {
    return {
        actorUserId: headUserId,
        actorMembership: buildMembership({
            _id: headMembershipId,
            userId: headUserId,
            role: "instructor",
            ...overrides,
        }),
    };
}

function adminActor(overrides = {}) {
    return {
        actorUserId: adminUserId,
        actorMembership: buildMembership(overrides),
    };
}

async function assertRejectsWith(promiseFactory, statusCode, message) {
    await assert.rejects(
        promiseFactory,
        (error) => {
            assert.equal(error.statusCode, statusCode);
            assert.equal(error.message, message);
            return true;
        }
    );
}

function createResponse() {
    return {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

function assertTenantScopedReads(data, modelNames) {
    for (const entry of data.queryLog.filter((item) => modelNames.includes(item.model))) {
        assert.equal(
            normalizeId(entry.query.institutionId),
            institutionId,
            `${entry.model}.${entry.method} must include institutionId`
        );
    }
}

function sortedStudentIds(result) {
    return result.students.map((row) => row.student.id).sort();
}

function setHeadPermissionsForTest(t, permissions) {
    const original = [...RESPONSIBILITY_PERMISSIONS.head];
    RESPONSIBILITY_PERMISSIONS.head.length = 0;
    RESPONSIBILITY_PERMISSIONS.head.push(...permissions);
    const restore = () => {
        RESPONSIBILITY_PERMISSIONS.head.length = 0;
        RESPONSIBILITY_PERMISSIONS.head.push(...original);
    };
    t.after(restore);
    return restore;
}

test("permission catalog activates Head academic read-only permissions only", () => {
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicRisk.read_scope"), true);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicProfile.read_scope"), true);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicStanding.read_scope"), true);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicDecision.read_scope"), true);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicDecision.recommend_scope"), true);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("section.read_scope"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("sectionSession.manage_scope"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("attendance.read_scope"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("attendance.manage_scope"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicDecision.approve"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicDecision.reject"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicDecision.apply"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("enrollment.drop"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.coordinator.includes("attendance.manage_scope"), true);
    assert.deepEqual(RESPONSIBILITY_PERMISSIONS.mentor, [
        "academicProfile.read_scope",
        "academicStanding.read_scope",
    ]);

    assert.equal(
        hasResponsibilityPermissionWithinScope({
            assignment: buildAssignment({ permissions: ["attendance.manage_scope"] }),
            permission: "attendance.manage_scope",
            scopeType: "department",
            scopeId: departmentId,
        }),
        false
    );
});

test("admin and Head institution assignment resolve institution-wide academic oversight scope", async (t) => {
    mockAcademicOversightDependencies(t);

    const admin = await academicOversightService.resolveAcademicOversightStudentScope({
        institutionId,
        ...adminActor(),
        permission: "academicRisk.read_scope",
    });
    assert.equal(admin.scope.institutionWide, true);
    assert.deepEqual(
        admin.scope.studentMemberIds.sort(),
        [studentMembershipId, otherStudentMembershipId].sort()
    );

    t.mock.reset();
    mockAcademicOversightDependencies(t, {
        assignments: [buildAssignment({ scopeType: "institution", scopeId: institutionId })],
    });
    const head = await academicOversightService.resolveAcademicOversightStudentScope({
        institutionId,
        ...headActor(),
        permission: "academicRisk.read_scope",
    });
    assert.equal(head.scope.institutionWide, true);
    assert.equal(head.scope.studentMemberIds.includes(studentMembershipId), true);
    assert.equal(head.scope.studentMemberIds.includes(otherStudentMembershipId), true);
});

test("Head department scope derives subject, section, and student IDs through trusted DB records", async (t) => {
    const data = mockAcademicOversightDependencies(t);

    const result = await academicOversightService.resolveAcademicOversightStudentScope({
        institutionId,
        ...headActor(),
        permission: "academicRisk.read_scope",
    });

    assert.equal(result.scope.institutionWide, false);
    assert.deepEqual(result.scope.departmentIds, [departmentId]);
    assert.deepEqual(result.scope.subjectIds, [subjectId]);
    assert.deepEqual(result.scope.sectionIds, [sectionId]);
    assert.deepEqual(result.scope.studentMemberIds, [studentMembershipId]);

    const subjectQuery = data.queryLog.find((entry) => entry.model === "Subject" && entry.method === "find").query;
    assert.equal(normalizeId(subjectQuery.institutionId), institutionId);
    assert.equal(normalizeId(subjectQuery.departmentId.$in[0]), departmentId);
});

test("Head classLevel scope derives through Subject.classLevelId and SchoolClass.classLevelId", async (t) => {
    mockAcademicOversightDependencies(t, {
        assignments: [buildAssignment({ scopeType: "classLevel", scopeId: classLevelId })],
    });

    const result = await academicOversightService.resolveAcademicOversightStudentScope({
        institutionId,
        ...headActor(),
        permission: "academicRisk.read_scope",
    });

    assert.deepEqual(result.scope.classLevelIds, [classLevelId]);
    assert.equal(result.scope.subjectIds.includes(classLevelSubjectId), true);
    assert.equal(result.scope.schoolClassIds.includes(schoolClassId), true);
    assert.equal(result.scope.sectionIds.includes(classLevelSectionId), true);
    assert.equal(result.scope.studentMemberIds.includes(studentMembershipId), true);
});

test("inactive expired cross-tenant coordinator mentor student and normal instructor access do not resolve Head oversight", async (t) => {
    mockAcademicOversightDependencies(t, {
        assignments: [
            buildAssignment({ isActive: false }),
            buildAssignment({ endAt: new Date("2000-01-01T00:00:00.000Z") }),
            buildAssignment({ institutionId: otherInstitutionId }),
            buildAssignment({ responsibilityType: "coordinator", scopeType: "department" }),
            buildAssignment({ responsibilityType: "mentor", scopeType: "section", scopeId: sectionId }),
        ],
    });

    await assertRejectsWith(
        () =>
            academicOversightService.resolveAcademicOversightStudentScope({
                institutionId,
                ...headActor(),
                permission: "academicRisk.read_scope",
            }),
        403,
        "Permission denied"
    );

    await assertRejectsWith(
        () =>
            academicOversightService.resolveAcademicOversightStudentScope({
                institutionId,
                actorUserId: instructorUserId,
                actorMembership: buildMembership({
                    _id: instructorMembershipId,
                    userId: instructorUserId,
                    role: "instructor",
                }),
                permission: "academicRisk.read_scope",
            }),
        403,
        "Permission denied"
    );

    await assertRejectsWith(
        () =>
            academicOversightService.resolveAcademicOversightStudentScope({
                institutionId,
                actorUserId: studentUserId,
                actorMembership: buildMembership({
                    _id: studentMembershipId,
                    userId: studentUserId,
                    role: "student",
                }),
                permission: "academicRisk.read_scope",
            }),
        403,
        "Permission denied"
    );
});

test("academic oversight rejects mismatched actor membership context", async (t) => {
    mockAcademicOversightDependencies(t);

    await assertRejectsWith(
        () =>
            academicOversightService.resolveAcademicOversightStudentScope({
                institutionId,
                actorUserId: headUserId,
                actorMembership: buildMembership({
                    _id: headMembershipId,
                    userId: instructorUserId,
                    role: "instructor",
                }),
                permission: "academicRisk.read_scope",
            }),
        403,
        "Institution access denied"
    );
});

test("risk list is scoped, cannot be expanded by foreign filters, and returns compact safe summaries", async (t) => {
    const data = mockAcademicOversightDependencies(t);

    const result = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { page: "1", limit: "10" },
    });

    assert.equal(result.students.length, 1);
    const row = result.students[0];
    assert.equal(row.student.id, studentMembershipId);
    assert.equal(row.student.email, "scoped@example.test");
    assert.equal(row.student.passwordHash, undefined);
    assert.equal(row.attendanceRisk.level, "warning");
    assert.equal(row.attendanceRisk.absences, 1);
    assert.equal(row.attendanceRisk.lateCount, 1);
    assert.equal(row.attendanceRisk.excusedCount, 1);
    assert.equal(row.attendanceRisk.effectiveAbsences, 2);
    assert.equal(row.gradeRisk.level, "high");
    assert.equal(row.gradeRisk.currentAverage, 55);
    assert.equal(row.academicStanding, undefined);
    assert.equal(row.academicProfile, undefined);
    assert.equal(result.academicRiskSummary.totalStudents, 1);

    const narrowedOutside = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { departmentId: otherDepartmentId },
    });
    assert.equal(narrowedOutside.students.length, 0);
    assert.equal(narrowedOutside.academicRiskSummary.totalStudents, 0);

    const sectionExpanded = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { sectionId: otherSectionId },
    });
    assert.equal(sectionExpanded.students.length, 0);

    assert.equal(data.writeLog.length, 0);
});

test("multiple Head assignments are additive OR grants and never reduce access", async (t) => {
    mockAcademicOversightDependencies(t, buildAdditiveHeadScopeOverrides({
        assignments: [buildAssignment({ scopeType: "department", scopeId: departmentId })],
    }));
    const departmentOnly = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
    });
    assert.deepEqual(sortedStudentIds(departmentOnly), [studentMembershipId]);

    t.mock.reset();
    mockAcademicOversightDependencies(t, buildAdditiveHeadScopeOverrides({
        assignments: [buildAssignment({ scopeType: "classLevel", scopeId: classLevelId })],
    }));
    const classLevelOnly = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
    });
    assert.deepEqual(sortedStudentIds(classLevelOnly), [otherStudentMembershipId]);

    t.mock.reset();
    mockAcademicOversightDependencies(t, buildAdditiveHeadScopeOverrides());
    const combined = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
    });

    assert.deepEqual(sortedStudentIds(combined), [otherStudentMembershipId, studentMembershipId].sort());
    assert.equal(combined.students.some((row) => row.student.id === thirdStudentMembershipId), false);
    assert.equal(combined.scope.studentCount, 2);
    assert.equal(combined.scope.sectionCount, 2);
});

test("filters narrow additive Head scope without reinterpreting assignments as department/classLevel AND", async (t) => {
    mockAcademicOversightDependencies(t, buildAdditiveHeadScopeOverrides());

    const mathFilter = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { departmentId },
    });
    assert.deepEqual(sortedStudentIds(mathFilter), [studentMembershipId]);

    const grade10Filter = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { classLevelId },
    });
    assert.deepEqual(sortedStudentIds(grade10Filter), [otherStudentMembershipId]);

    const scienceGrade10Filter = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { departmentId: otherDepartmentId, classLevelId },
    });
    assert.deepEqual(sortedStudentIds(scienceGrade10Filter), [otherStudentMembershipId]);

    const scienceGrade10SectionFilter = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { sectionId: classLevelSectionId },
    });
    assert.deepEqual(sortedStudentIds(scienceGrade10SectionFilter), [otherStudentMembershipId]);

    const scienceGrade9SectionFilter = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { sectionId: otherSectionId },
    });
    assert.deepEqual(scienceGrade9SectionFilter.students, []);

    const crossTenantDepartmentFilter = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { departmentId: crossTenantDepartmentId },
    });
    assert.deepEqual(crossTenantDepartmentFilter.students, []);

    const crossTenantClassLevelFilter = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { classLevelId: otherClassLevelId },
    });
    assert.deepEqual(crossTenantClassLevelFilter.students, []);

    const crossTenantSectionFilter = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { sectionId: crossTenantSectionId },
    });
    assert.deepEqual(crossTenantSectionFilter.students, []);
});

test("attendance risk counts only records from each student's active enrolled sections", async (t) => {
    const otherSessionId = "507f1f77bcf86cd799439062";
    const classLevelSessionId = "507f1f77bcf86cd799439063";
    const data = mockAcademicOversightDependencies(t, {
        assignments: [buildAssignment({ scopeType: "institution", scopeId: institutionId })],
        memberships: [
            buildMembership(),
            buildMembership({
                _id: headMembershipId,
                userId: headUserId,
                role: "instructor",
            }),
            buildMembership({
                _id: studentMembershipId,
                userId: studentUserId,
                role: "student",
            }),
            buildMembership({
                _id: otherStudentMembershipId,
                userId: otherStudentUserId,
                role: "student",
            }),
            buildMembership({
                _id: thirdStudentMembershipId,
                userId: thirdStudentUserId,
                role: "student",
            }),
        ],
        profiles: [
            {
                _id: "507f1f77bcf86cd799439091",
                institutionId,
                membershipId: studentMembershipId,
                userId: studentUserId,
                fullName: "Scoped Student",
                fullNameNormalized: "scoped student",
            },
            {
                _id: "507f1f77bcf86cd799439092",
                institutionId,
                membershipId: otherStudentMembershipId,
                userId: otherStudentUserId,
                fullName: "Other Student",
                fullNameNormalized: "other student",
            },
            {
                _id: "507f1f77bcf86cd799439093",
                institutionId,
                membershipId: thirdStudentMembershipId,
                userId: thirdStudentUserId,
                fullName: "Third Student",
                fullNameNormalized: "third student",
            },
        ],
        users: [
            { _id: studentUserId, email: "scoped@example.test", passwordHash: "secret" },
            { _id: otherStudentUserId, email: "other@example.test", passwordHash: "secret" },
            { _id: thirdStudentUserId, email: "third@example.test", passwordHash: "secret" },
        ],
        enrollments: [
            {
                _id: "507f1f77bcf86cd799439101",
                institutionId,
                sectionId,
                studentMemberId: studentMembershipId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd799439102",
                institutionId,
                sectionId: otherSectionId,
                studentMemberId: otherStudentMembershipId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd799439103",
                institutionId,
                sectionId: classLevelSectionId,
                studentMemberId: studentMembershipId,
                status: "dropped",
            },
            {
                _id: "507f1f77bcf86cd799439104",
                institutionId,
                sectionId: classLevelSectionId,
                studentMemberId: thirdStudentMembershipId,
                status: "enrolled",
            },
        ],
        sectionSessions: [
            {
                _id: sessionId,
                institutionId,
                sectionId,
                status: "completed",
                attendanceState: "closed",
            },
            {
                _id: otherSessionId,
                institutionId,
                sectionId: otherSectionId,
                status: "completed",
                attendanceState: "closed",
            },
            {
                _id: classLevelSessionId,
                institutionId,
                sectionId: classLevelSectionId,
                status: "completed",
                attendanceState: "closed",
            },
        ],
        attendanceRecords: [
            {
                _id: "507f1f77bcf86cd799439111",
                institutionId,
                sectionId,
                sectionSessionId: sessionId,
                studentMemberId: studentMembershipId,
                attendanceStatus: "absent",
            },
            {
                _id: "507f1f77bcf86cd799439112",
                institutionId,
                sectionId: otherSectionId,
                sectionSessionId: otherSessionId,
                studentMemberId: studentMembershipId,
                attendanceStatus: "absent",
            },
            {
                _id: "507f1f77bcf86cd799439113",
                institutionId,
                sectionId: classLevelSectionId,
                sectionSessionId: classLevelSessionId,
                studentMemberId: studentMembershipId,
                attendanceStatus: "absent",
            },
            {
                _id: "507f1f77bcf86cd799439114",
                institutionId,
                sectionId: otherSectionId,
                sectionSessionId: otherSessionId,
                studentMemberId: otherStudentMembershipId,
                attendanceStatus: "late",
            },
        ],
        assessments: [],
        assessmentResults: [],
    });

    const result = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
    });

    const rowsByStudentId = new Map(result.students.map((row) => [row.student.id, row]));
    assert.equal(rowsByStudentId.get(studentMembershipId).attendanceRisk.absences, 1);
    assert.equal(rowsByStudentId.get(studentMembershipId).attendanceRisk.level, "good");
    assert.equal(rowsByStudentId.get(otherStudentMembershipId).attendanceRisk.lateCount, 1);
    assert.equal(rowsByStudentId.get(thirdStudentMembershipId).attendanceRisk.level, "unknown");

    const attendanceQuery = data.queryLog.find(
        (entry) => entry.model === "AttendanceRecord" && entry.method === "find"
    ).query;
    assert.equal(normalizeId(attendanceQuery.institutionId), institutionId);
    assert.deepEqual(
        attendanceQuery.sectionId.$in.map(normalizeId).sort(),
        [classLevelSectionId, otherSectionId, sectionId].sort()
    );
});

test("grade risk counts only assessments from each student's active enrolled sections", async (t) => {
    const data = mockAcademicOversightDependencies(t, {
        assignments: [buildAssignment({ scopeType: "institution", scopeId: institutionId })],
        assessments: [
            {
                _id: assessmentId,
                institutionId,
                sectionId,
                status: "published",
                maxScore: 100,
                weight: 100,
            },
            {
                _id: otherAssessmentId,
                institutionId,
                sectionId: otherSectionId,
                status: "published",
                maxScore: 100,
                weight: 100,
            },
        ],
        assessmentResults: [
            {
                _id: "507f1f77bcf86cd799439121",
                institutionId,
                sectionId,
                assessmentId,
                studentMemberId: studentMembershipId,
                score: 88,
            },
            {
                _id: "507f1f77bcf86cd799439122",
                institutionId,
                sectionId: otherSectionId,
                assessmentId: otherAssessmentId,
                studentMemberId: otherStudentMembershipId,
                score: 92,
            },
        ],
        attendanceRecords: [],
    });

    const result = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { page: "1", limit: "10" },
    });

    const rowsByStudentId = new Map(result.students.map((row) => [row.student.id, row]));
    assert.equal(rowsByStudentId.get(studentMembershipId).gradeRisk.missingResults, 0);
    assert.equal(rowsByStudentId.get(studentMembershipId).gradeRisk.currentAverage, 88);
    assert.equal(rowsByStudentId.get(otherStudentMembershipId).gradeRisk.missingResults, 0);
    assert.equal(rowsByStudentId.get(otherStudentMembershipId).gradeRisk.currentAverage, 92);

    const assessmentResultQuery = data.queryLog.find(
        (entry) => entry.model === "AssessmentResult" && entry.method === "find"
    ).query;
    assert.deepEqual(
        assessmentResultQuery.sectionId.$in.map(normalizeId).sort(),
        [classLevelSectionId, otherSectionId, sectionId].sort()
    );
});

test("missing grade results count only active enrollment sections and ignore dropped sections", async (t) => {
    mockAcademicOversightDependencies(t, {
        assignments: [buildAssignment({ scopeType: "institution", scopeId: institutionId })],
        enrollments: [
            {
                _id: "507f1f77bcf86cd799439101",
                institutionId,
                sectionId,
                studentMemberId: studentMembershipId,
                status: "enrolled",
            },
            {
                _id: "507f1f77bcf86cd799439102",
                institutionId,
                sectionId: otherSectionId,
                studentMemberId: studentMembershipId,
                status: "dropped",
            },
        ],
        assessments: [
            {
                _id: assessmentId,
                institutionId,
                sectionId,
                status: "published",
                maxScore: 100,
                weight: 100,
            },
            {
                _id: otherAssessmentId,
                institutionId,
                sectionId: otherSectionId,
                status: "published",
                maxScore: 100,
                weight: 100,
            },
        ],
        assessmentResults: [],
        attendanceRecords: [],
    });

    const result = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { studentMemberId: studentMembershipId },
    });

    assert.equal(result.students.length, 1);
    assert.equal(result.students[0].gradeRisk.missingResults, 1);
    assert.equal(result.students[0].gradeRisk.level, "high");
});

test("invalid published assessment configuration keeps grade risk unknown without marking student good", async (t) => {
    mockAcademicOversightDependencies(t, {
        assignments: [buildAssignment({ scopeType: "institution", scopeId: institutionId })],
        enrollments: [
            {
                _id: "507f1f77bcf86cd799439101",
                institutionId,
                sectionId,
                studentMemberId: studentMembershipId,
                status: "enrolled",
            },
        ],
        assessments: [
            {
                _id: assessmentId,
                institutionId,
                sectionId,
                status: "published",
                maxScore: 0,
                weight: 100,
            },
        ],
        assessmentResults: [
            {
                _id: "507f1f77bcf86cd799439121",
                institutionId,
                sectionId,
                assessmentId,
                studentMemberId: studentMembershipId,
                score: 88,
            },
        ],
        attendanceRecords: [],
    });

    const result = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { studentMemberId: studentMembershipId },
    });

    assert.equal(result.students.length, 1);
    assert.equal(result.students[0].gradeRisk.level, "unknown");
    assert.equal(result.students[0].gradeRisk.currentAverage, null);
    assert.equal(result.students[0].gradeRisk.reasons.includes("invalid_published_assessment_configuration"), true);
    assert.notEqual(result.students[0].riskLevel, "good");
});

test("query filters narrow trusted scope relationships without expanding Head access", async (t) => {
    const data = mockAcademicOversightDependencies(t, {
        subjects: [
            { _id: subjectId, institutionId, departmentId, classLevelId: null },
            { _id: otherSubjectId, institutionId, departmentId, classLevelId: null },
            { _id: classLevelSubjectId, institutionId, departmentId: null, classLevelId },
        ],
        assignments: [buildAssignment()],
    });

    const sectionFiltered = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { sectionId },
    });
    assert.deepEqual(sectionFiltered.students.map((row) => row.student.id), [studentMembershipId]);
    assert.equal(sectionFiltered.scope.sectionCount, 1);
    const assessmentQuery = data.queryLog.find(
        (entry) => entry.model === "Assessment" && entry.method === "find"
    ).query;
    assert.deepEqual(assessmentQuery.sectionId.$in.map(normalizeId), [sectionId]);

    const outsideDepartment = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { departmentId: otherDepartmentId },
    });
    assert.equal(outsideDepartment.students.length, 0);
    assert.equal(outsideDepartment.scope.sectionCount, 0);

    const insideStudent = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { studentMemberId: studentMembershipId },
    });
    assert.equal(insideStudent.students.length, 1);

    const outsideStudent = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { studentMemberId: instructorMembershipId },
    });
    assert.equal(outsideStudent.students.length, 0);
});

test("classLevel and cross-tenant filters fail closed", async (t) => {
    mockAcademicOversightDependencies(t, {
        sections: [
            { _id: sectionId, institutionId, subjectId, schoolClassId: null },
            { _id: classLevelSectionId, institutionId, subjectId: classLevelSubjectId, schoolClassId },
            { _id: crossTenantSectionId, institutionId: otherInstitutionId, subjectId: otherSubjectId, schoolClassId: null },
        ],
        assignments: [buildAssignment({ scopeType: "classLevel", scopeId: classLevelId })],
    });

    const outsideSection = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { sectionId },
    });
    assert.equal(outsideSection.students.length, 0);
    assert.equal(outsideSection.scope.sectionCount, 0);

    const crossTenantSection = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { sectionId: crossTenantSectionId },
    });
    assert.equal(crossTenantSection.students.length, 0);
    assert.equal(crossTenantSection.scope.sectionCount, 0);
});

test("cross-tenant department and classLevel Head assignments are ignored", async (t) => {
    mockAcademicOversightDependencies(t, {
        assignments: [
            buildAssignment({ scopeType: "department", scopeId: crossTenantDepartmentId }),
            buildAssignment({ scopeType: "classLevel", scopeId: otherClassLevelId }),
        ],
    });

    const result = await academicOversightService.resolveAcademicOversightStudentScope({
        institutionId,
        ...headActor(),
        permission: "academicRisk.read_scope",
    });

    assert.equal(result.scope.studentMemberIds.length, 0);
    assert.equal(result.scope.sectionIds.length, 0);
    assert.equal(result.scope.departmentIds.length, 0);
    assert.equal(result.scope.classLevelIds.length, 0);
});

test("student detail is allowed only inside resolved Head scope and remains tenant scoped", async (t) => {
    const data = mockAcademicOversightDependencies(t);

    const detail = await academicOversightService.getAcademicOversightStudent({
        institutionId,
        studentMemberId: studentMembershipId,
        ...headActor(),
    });
    assert.equal(detail.student.student.id, studentMembershipId);
    assert.equal(detail.student.academicProfile.gpa, 1.5);
    assert.equal(detail.student.academicStanding, undefined);

    const standing = await academicOversightService.getAcademicOversightStudentStanding({
        institutionId,
        studentMemberId: studentMembershipId,
        ...headActor(),
    });
    assert.equal(standing.student.student.id, studentMembershipId);
    assert.equal(standing.student.academicStanding.standing, "probation");
    assert.equal(standing.student.academicProfile, undefined);

    await assertRejectsWith(
        () =>
            academicOversightService.getAcademicOversightStudent({
                institutionId,
                studentMemberId: otherStudentMembershipId,
                ...headActor(),
            }),
        403,
        "Student is outside academic oversight scope"
    );

    const membershipQuery = data.queryLog.find(
        (entry) => entry.model === "Membership" && entry.method === "find"
    ).query;
    assert.equal(normalizeId(membershipQuery.institutionId), institutionId);
});

test("academic risk profile and standing permissions gate returned data independently", async (t) => {
    const restoreRiskPermissions = setHeadPermissionsForTest(t, ["academicRisk.read_scope"]);
    mockAcademicOversightDependencies(t);

    const riskList = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
    });
    assert.equal(riskList.students[0].academicProfile, undefined);
    assert.equal(riskList.students[0].academicStanding, undefined);

    await assertRejectsWith(
        () =>
            academicOversightService.getAcademicOversightStudent({
                institutionId,
                studentMemberId: studentMembershipId,
                ...headActor(),
            }),
        403,
        "Permission denied"
    );

    await assertRejectsWith(
        () =>
            academicOversightService.getAcademicOversightStudentStanding({
                institutionId,
                studentMemberId: studentMembershipId,
                ...headActor(),
            }),
        403,
        "Permission denied"
    );
    restoreRiskPermissions();

    t.mock.reset();
    const restoreProfilePermissions = setHeadPermissionsForTest(t, ["academicProfile.read_scope"]);
    mockAcademicOversightDependencies(t);
    const profile = await academicOversightService.getAcademicOversightStudent({
        institutionId,
        studentMemberId: studentMembershipId,
        ...headActor(),
    });
    assert.equal(profile.student.academicProfile.gpa, 1.5);
    assert.equal(profile.student.academicStanding, undefined);

    await assertRejectsWith(
        () =>
            academicOversightService.listAcademicOversightStudents({
                institutionId,
                ...headActor(),
            }),
        403,
        "Permission denied"
    );
    restoreProfilePermissions();

    t.mock.reset();
    setHeadPermissionsForTest(t, ["academicStanding.read_scope"]);
    mockAcademicOversightDependencies(t);
    const standing = await academicOversightService.getAcademicOversightStudentStanding({
        institutionId,
        studentMemberId: studentMembershipId,
        ...headActor(),
    });
    assert.equal(standing.student.academicStanding.standing, "probation");
    assert.equal(standing.student.academicProfile, undefined);

    await assertRejectsWith(
        () =>
            academicOversightService.getAcademicOversightStudent({
                institutionId,
                studentMemberId: studentMembershipId,
                ...headActor(),
            }),
        403,
        "Permission denied"
    );
});

test("academic oversight summary list and detail are tenant-scoped read-only flows", async (t) => {
    const data = mockAcademicOversightDependencies(t);

    await academicOversightService.getAcademicOversightRiskSummary({
        institutionId,
        ...headActor(),
    });
    await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
        query: { sectionId },
    });
    await academicOversightService.getAcademicOversightStudent({
        institutionId,
        studentMemberId: studentMembershipId,
        ...headActor(),
    });
    await academicOversightService.getAcademicOversightStudentStanding({
        institutionId,
        studentMemberId: studentMembershipId,
        ...headActor(),
    });

    assert.equal(data.writeLog.length, 0);
    assertTenantScopedReads(data, [
        "ResponsibilityAssignment",
        "Department",
        "Subject",
        "ClassLevel",
        "SchoolClass",
        "Section",
        "Enrollment",
        "SectionSession",
        "AttendanceRecord",
        "Assessment",
        "AssessmentResult",
        "Membership",
        "MemberProfile",
    ]);
});

test("empty scope returns empty summary safely and does not write academic records", async (t) => {
    const data = mockAcademicOversightDependencies(t, {
        subjects: [],
        sections: [],
        enrollments: [],
        attendanceRecords: [],
        assessments: [],
        assessmentResults: [],
    });

    const result = await academicOversightService.getAcademicOversightRiskSummary({
        institutionId,
        ...headActor(),
    });

    assert.equal(result.academicRiskSummary.totalStudents, 0);
    assert.equal(result.scope.studentCount, 0);
    assert.equal(data.writeLog.length, 0);
});

test("missing attendance records and academic data return unknown or safe unavailable markers", async (t) => {
    mockAcademicOversightDependencies(t, {
        attendanceRecords: [],
        assessments: [],
        assessmentResults: [],
    });

    const riskList = await academicOversightService.listAcademicOversightStudents({
        institutionId,
        ...headActor(),
    });

    assert.equal(riskList.students[0].attendanceRisk.level, "unknown");
    assert.equal(riskList.students[0].gradeRisk.level, "unknown");
    assert.equal(riskList.students[0].riskLevel, "unknown");
    assert.equal(riskList.academicRiskSummary.attendanceRisk.unknown, 1);

    t.mock.reset();
    mockAcademicOversightDependencies(t, {
        attendanceRecords: [],
        assessments: [],
        assessmentResults: [],
    });
    t.mock.method(universityAcademicOutcomeService, "listStudentAcademicOutcomes", async () => ({
        outcomes: [],
        summary: {
            cumulativeGpa: null,
            totalEarnedCreditHours: 0,
            totalAttemptedCreditHours: 0,
        },
        academicStandingRules: null,
        excluded: [],
        warnings: [],
    }));

    const noDataStanding = await academicOversightService.getAcademicOversightStudentStanding({
        institutionId,
        studentMemberId: studentMembershipId,
        ...headActor(),
    });
    assert.equal(noDataStanding.student.academicStanding.standing, "no_standing_yet");
    assert.equal(noDataStanding.student.academicStanding.dataUnavailable, false);

    t.mock.reset();
    mockAcademicOversightDependencies(t, {
        attendanceRecords: [],
        assessments: [],
        assessmentResults: [],
    });
    t.mock.method(universityAcademicOutcomeService, "listStudentAcademicOutcomes", async () => {
        throw new Error("profile unavailable");
    });

    const profile = await academicOversightService.getAcademicOversightStudent({
        institutionId,
        studentMemberId: studentMembershipId,
        ...headActor(),
    });
    assert.equal(profile.student.academicProfile.gpa, null);
    assert.equal(profile.student.academicProfile.dataUnavailable, true);

    const standing = await academicOversightService.getAcademicOversightStudentStanding({
        institutionId,
        studentMemberId: studentMembershipId,
        ...headActor(),
    });
    assert.equal(standing.student.academicStanding.standing, null);
    assert.equal(standing.student.academicStanding.dataUnavailable, true);
    assert.equal(standing.student.riskLevel, "unknown");
});

test("controller passes actor context and routes are wired with auth and institution middleware", async (t) => {
    let receivedArgs = null;
    t.mock.method(academicOversightService, "getAcademicOversightRiskSummary", async (args) => {
        receivedArgs = args;
        return {
            academicRiskSummary: { totalStudents: 0 },
        };
    });
    let receivedStandingArgs = null;
    t.mock.method(academicOversightService, "getAcademicOversightStudentStanding", async (args) => {
        receivedStandingArgs = args;
        return {
            student: {
                student: { id: studentMembershipId },
                academicStanding: { standing: "probation" },
            },
        };
    });

    const res = createResponse();
    const membership = buildMembership();
    await academicOversightController.getAcademicOversightRiskSummary(
        {
            params: { institutionId },
            user: { id: adminUserId },
            membership,
            query: { riskLevel: "high" },
        },
        res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(receivedArgs.actorUserId, adminUserId);
    assert.equal(receivedArgs.actorMembership, membership);
    assert.equal(receivedArgs.query.riskLevel, "high");

    const standingRes = createResponse();
    await academicOversightController.getAcademicOversightStudentStanding(
        {
            params: { institutionId, studentMemberId: studentMembershipId },
            user: { id: adminUserId },
            membership,
            query: {},
        },
        standingRes
    );
    assert.equal(standingRes.statusCode, 200);
    assert.equal(receivedStandingArgs.studentMemberId, studentMembershipId);
    assert.equal(receivedStandingArgs.actorMembership, membership);

    const routes = institutionRoutes.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route)
        .filter((route) => String(route.path).includes("academic-oversight"));

    assert.equal(routes.length, 4);
    for (const route of routes) {
        const handles = route.stack.map((layer) => layer.handle);
        assert.equal(handles.some((handle) => handle.name === "authJwt"), true);
        assert.equal(handles.some((handle) => handle.name === "requireEmailVerified"), true);
        assert.equal(route.stack.length >= 4, true);
        assert.equal(handles.some((handle) => handle.requiredPermission), false);
    }
});
