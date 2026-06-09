const test = require("node:test");
const assert = require("node:assert/strict");

const Institution = require("../src/models/Institution");
const ResponsibilityAssignment = require("../src/models/ResponsibilityAssignment");
const Section = require("../src/models/Section");
const SectionSession = require("../src/models/SectionSession");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");
const sectionSessionService = require("../src/services/sectionSessionService");

const institutionId = "507f1f77bcf86cd799439011";
const sectionId = "507f1f77bcf86cd799439021";
const semesterId = "507f1f77bcf86cd799439031";
const subjectId = "507f1f77bcf86cd799439041";
const sectionSessionId = "507f1f77bcf86cd799439051";
const departmentId = "507f1f77bcf86cd799439052";
const instructorMemberId = "507f1f77bcf86cd799439061";
const otherInstructorMemberId = "507f1f77bcf86cd799439062";
const actorUserId = "507f1f77bcf86cd799439071";

function createQuery(result) {
    return {
        select() {
            return this;
        },
        sort() {
            return this;
        },
        skip() {
            return this;
        },
        limit() {
            return this;
        },
        lean: async () => result,
        then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
        },
    };
}

function normalizeId(value) {
    return value === undefined || value === null ? null : value.toString();
}

function matchesId(value, condition) {
    if (condition?.$in) {
        return condition.$in.map(normalizeId).includes(normalizeId(value));
    }

    if (condition?.$ne !== undefined) {
        return normalizeId(value) !== normalizeId(condition.$ne);
    }

    return normalizeId(value) === normalizeId(condition);
}

function buildSection(overrides = {}) {
    return {
        _id: sectionId,
        institutionId,
        semesterId,
        subjectId,
        code: "SEC-1",
        title: "Section 1",
        instructorMemberId,
        status: "active",
        ...overrides,
    };
}

function buildSubject(overrides = {}) {
    return {
        _id: subjectId,
        institutionId,
        departmentId: null,
        classLevelId: null,
        name: "Math",
        code: "MATH101",
        ...overrides,
    };
}

function buildSemester(overrides = {}) {
    return {
        _id: semesterId,
        institutionId,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        teachingDays: ["Thursday"],
        calendarOverrides: [],
        examDates: [],
        ...overrides,
    };
}

function buildMembership(overrides = {}) {
    return {
        _id: instructorMemberId,
        institutionId,
        userId: actorUserId,
        role: "instructor",
        status: "active",
        ...overrides,
    };
}

function mockSectionSessionCreateDependencies(t, overrides = {}) {
    const data = {
        institution: { _id: institutionId },
        section: buildSection(),
        subject: buildSubject(),
        semester: buildSemester(),
        duplicateSectionSession: null,
        responsibilityAssignments: [],
        ...overrides,
    };

    t.mock.method(Institution, "findOne", (query) =>
        createQuery(matchesId(data.institution?._id, query._id) ? data.institution : null)
    );
    t.mock.method(Section, "findOne", (query) =>
        createQuery(
            matchesId(data.section?._id, query._id) && matchesId(data.section?.institutionId, query.institutionId)
                ? data.section
                : null
        )
    );
    t.mock.method(Subject, "findOne", (query) =>
        createQuery(
            matchesId(data.subject?._id, query._id) && matchesId(data.subject?.institutionId, query.institutionId)
                ? data.subject
                : null
        )
    );
    t.mock.method(Semester, "findOne", (query) =>
        createQuery(
            matchesId(data.semester?._id, query._id) && matchesId(data.semester?.institutionId, query.institutionId)
                ? data.semester
                : null
        )
    );
    t.mock.method(ResponsibilityAssignment, "find", (query) => {
        const assignments = data.responsibilityAssignments
            .filter((assignment) => matchesId(assignment.institutionId, query.institutionId))
            .filter((assignment) => matchesId(assignment.userId, query.userId))
            .filter((assignment) => matchesId(assignment.responsibilityType, query.responsibilityType || assignment.responsibilityType))
            .filter((assignment) => matchesId(assignment.scopeType, query.scopeType))
            .filter((assignment) => matchesId(assignment.scopeId, query.scopeId))
            .filter((assignment) => matchesId(assignment.isActive, query.isActive));
        return createQuery(assignments);
    });
    t.mock.method(SectionSession, "findOne", () => createQuery(data.duplicateSectionSession));
    t.mock.method(SectionSession, "create", async (payload) => ({
        _id: sectionSessionId,
        attendanceState: "not_started",
        createdAt: new Date("2026-06-04T00:00:00.000Z"),
        updatedAt: new Date("2026-06-04T00:00:00.000Z"),
        ...payload,
    }));
}

test("assigned instructor can create a section session", async (t) => {
    mockSectionSessionCreateDependencies(t);

    const result = await sectionSessionService.createSectionSession({
        institutionId,
        sectionId,
        createdByUserId: actorUserId,
        actorMembership: buildMembership(),
        payload: {
            sessionType: "lecture",
            sessionDate: "2026-06-04",
            startTime: "09:00",
            endTime: "10:00",
            room: "Room 101",
        },
    });

    assert.equal(result.sectionSession.sectionId, sectionId);
    assert.equal(result.sectionSession.sessionType, "lecture");
    assert.equal(result.sectionSession.createdByUserId, actorUserId);
});

test("unassigned instructor cannot create a section session", async (t) => {
    mockSectionSessionCreateDependencies(t);

    await assert.rejects(
        () =>
            sectionSessionService.createSectionSession({
                institutionId,
                sectionId,
                createdByUserId: actorUserId,
                actorMembership: buildMembership({ _id: otherInstructorMemberId }),
                payload: {
                    sessionType: "lecture",
                    sessionDate: "2026-06-04",
                    startTime: "09:00",
                    endTime: "10:00",
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Permission denied");
            return true;
        }
    );
});

test("coordinator can create a section session inside assigned department scope", async (t) => {
    mockSectionSessionCreateDependencies(t, {
        subject: buildSubject({ departmentId }),
        responsibilityAssignments: [
            {
                _id: "507f1f77bcf86cd799439081",
                institutionId,
                userId: actorUserId,
                responsibilityType: "coordinator",
                scopeType: "department",
                scopeId: departmentId,
                isActive: true,
            },
        ],
    });

    const result = await sectionSessionService.createSectionSession({
        institutionId,
        sectionId,
        createdByUserId: actorUserId,
        actorMembership: buildMembership({ _id: otherInstructorMemberId }),
        payload: {
            sessionType: "lecture",
            sessionDate: "2026-06-04",
            startTime: "09:00",
            endTime: "10:00",
        },
    });

    assert.equal(result.sectionSession.sectionId, sectionId);
    assert.equal(result.sectionSession.sessionType, "lecture");
});

test("head cannot create a section session even with stored operational permissions", async (t) => {
    mockSectionSessionCreateDependencies(t, {
        subject: buildSubject({ departmentId }),
        responsibilityAssignments: [
            {
                _id: "507f1f77bcf86cd799439081",
                institutionId,
                userId: actorUserId,
                responsibilityType: "head",
                scopeType: "department",
                scopeId: departmentId,
                permissions: ["sectionSession.manage_scope"],
                isActive: true,
            },
        ],
    });

    await assert.rejects(
        () =>
            sectionSessionService.createSectionSession({
                institutionId,
                sectionId,
                createdByUserId: actorUserId,
                actorMembership: buildMembership({ _id: otherInstructorMemberId }),
                payload: {
                    sessionType: "lecture",
                    sessionDate: "2026-06-04",
                    startTime: "09:00",
                    endTime: "10:00",
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Permission denied");
            return true;
        }
    );
});
