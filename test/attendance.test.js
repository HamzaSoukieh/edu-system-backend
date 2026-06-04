const test = require("node:test");
const assert = require("node:assert/strict");

const AttendanceRecord = require("../src/models/AttendanceRecord");
const Enrollment = require("../src/models/Enrollment");
const Institution = require("../src/models/Institution");
const MemberProfile = require("../src/models/MemberProfile");
const Membership = require("../src/models/Membership");
const Section = require("../src/models/Section");
const SectionSession = require("../src/models/SectionSession");
const Subject = require("../src/models/Subject");
const User = require("../src/models/User");
const attendanceService = require("../src/services/attendanceService");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";
const sectionId = "507f1f77bcf86cd799439021";
const subjectId = "507f1f77bcf86cd799439031";
const instructorMemberId = "507f1f77bcf86cd799439041";
const otherInstructorMemberId = "507f1f77bcf86cd799439042";
const actorUserId = "507f1f77bcf86cd799439051";
const studentOneMemberId = "507f1f77bcf86cd799439061";
const studentTwoMemberId = "507f1f77bcf86cd799439062";
const studentThreeMemberId = "507f1f77bcf86cd799439063";
const userOneId = "507f1f77bcf86cd799439071";
const userTwoId = "507f1f77bcf86cd799439072";
const userThreeId = "507f1f77bcf86cd799439073";
const sessionOneId = "507f1f77bcf86cd799439081";
const sessionTwoId = "507f1f77bcf86cd799439082";
const sessionThreeId = "507f1f77bcf86cd799439083";

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

function buildInstitution(overrides = {}) {
    return {
        _id: institutionId,
        policies: {
            warnAfterAbsences: 3,
            dropAfterAbsences: 5,
            lateToAbsenceRatio: 3,
            excusedCountsAsAbsence: false,
        },
        ...overrides,
    };
}

function buildSection(overrides = {}) {
    return {
        _id: sectionId,
        institutionId,
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
        code: "MATH101",
        name: "Math",
        departmentId: null,
        classLevelId: null,
        ...overrides,
    };
}

function buildSectionSession(overrides = {}) {
    return {
        _id: sessionOneId,
        institutionId,
        sectionId,
        sessionDate: new Date("2026-05-01T00:00:00.000Z"),
        startTime: "09:00",
        endTime: "10:00",
        status: "completed",
        attendanceState: "closed",
        ...overrides,
    };
}

function buildAttendanceRecord(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439091",
        institutionId,
        sectionId,
        sectionSessionId: sessionOneId,
        enrollmentId: "507f1f77bcf86cd799439101",
        studentMemberId: studentOneMemberId,
        attendanceStatus: "present",
        source: "manual",
        checkedInAt: null,
        note: null,
        recordedByUserId: actorUserId,
        createdAt: new Date("2026-05-01T09:00:00.000Z"),
        updatedAt: new Date("2026-05-01T09:00:00.000Z"),
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

function buildStudentMembership({ studentMemberId, userId }) {
    return {
        _id: studentMemberId,
        institutionId,
        userId,
        role: "student",
        status: "active",
    };
}

function mockAttendanceAnalyticsDependencies(t, dataset = {}) {
    const data = {
        institution: buildInstitution(),
        section: buildSection(),
        subject: buildSubject(),
        sectionSessions: [
            buildSectionSession({ _id: sessionOneId }),
            buildSectionSession({ _id: sessionTwoId, sessionDate: new Date("2026-05-02T00:00:00.000Z") }),
            buildSectionSession({ _id: sessionThreeId, sessionDate: new Date("2026-05-03T00:00:00.000Z") }),
        ],
        attendanceRecords: [],
        queryLog: [],
        ...dataset,
    };

    t.mock.method(Institution, "findOne", (query) => {
        data.queryLog.push({ model: "Institution", method: "findOne", query });
        return createQuery(matchesId(data.institution?._id, query._id) ? data.institution : null);
    });
    t.mock.method(Section, "findOne", (query) => {
        data.queryLog.push({ model: "Section", method: "findOne", query });
        return createQuery(
            matchesId(data.section?._id, query._id) && matchesId(data.section?.institutionId, query.institutionId)
                ? data.section
                : null
        );
    });
    t.mock.method(Subject, "findOne", (query) => {
        data.queryLog.push({ model: "Subject", method: "findOne", query });
        return createQuery(
            matchesId(data.subject?._id, query._id) && matchesId(data.subject?.institutionId, query.institutionId)
                ? data.subject
                : null
        );
    });
    t.mock.method(SectionSession, "find", (query) => {
        data.queryLog.push({ model: "SectionSession", method: "find", query });
        const sessions = data.sectionSessions
            .filter((item) => matchesId(item.institutionId, query.institutionId))
            .filter((item) => matchesId(item.sectionId, query.sectionId))
            .filter((item) => matchesId(item.status, query.status || item.status))
            .filter((item) => matchesId(item.attendanceState, query.attendanceState || item.attendanceState));
        return createQuery(sessions);
    });
    t.mock.method(AttendanceRecord, "find", (query) => {
        data.queryLog.push({ model: "AttendanceRecord", method: "find", query });
        const records = data.attendanceRecords
            .filter((item) => matchesId(item.institutionId, query.institutionId))
            .filter((item) => matchesId(item.sectionId, query.sectionId))
            .filter((item) => matchesId(item.sectionSessionId, query.sectionSessionId || item.sectionSessionId));
        return createQuery(records);
    });
    t.mock.method(Membership, "find", (query) => {
        data.queryLog.push({ model: "Membership", method: "find", query });
        const memberships = [
            buildStudentMembership({ studentMemberId: studentOneMemberId, userId: userOneId }),
            buildStudentMembership({ studentMemberId: studentTwoMemberId, userId: userTwoId }),
            buildStudentMembership({ studentMemberId: studentThreeMemberId, userId: userThreeId }),
        ].filter((item) => matchesId(item.institutionId, query.institutionId) && matchesId(item._id, query._id));
        return createQuery(memberships);
    });
    t.mock.method(MemberProfile, "find", (query) => {
        data.queryLog.push({ model: "MemberProfile", method: "find", query });
        const profiles = [
            { _id: "507f1f77bcf86cd799439111", institutionId, membershipId: studentOneMemberId, fullName: "A Student" },
            { _id: "507f1f77bcf86cd799439112", institutionId, membershipId: studentTwoMemberId, fullName: "B Student" },
            { _id: "507f1f77bcf86cd799439113", institutionId, membershipId: studentThreeMemberId, fullName: "C Student" },
        ].filter((item) => matchesId(item.institutionId, query.institutionId) && matchesId(item.membershipId, query.membershipId));
        return createQuery(profiles);
    });
    t.mock.method(User, "find", (query) => {
        data.queryLog.push({ model: "User", method: "find", query });
        const users = [
            { _id: userOneId, email: "a@example.test" },
            { _id: userTwoId, email: "b@example.test" },
            { _id: userThreeId, email: "c@example.test" },
        ].filter((item) => matchesId(item._id, query._id));
        return createQuery(users);
    });
    t.mock.method(Enrollment, "findOneAndUpdate", () => {
        throw new Error("Enrollment.status must not be updated by attendance analytics");
    });
    t.mock.method(Subject, "findOneAndUpdate", () => {
        throw new Error("Subject must not be modified by attendance analytics");
    });

    return data;
}

test("attendance policy helpers resolve defaults and calculate risk", () => {
    assert.deepEqual(attendanceService.resolveAttendancePolicySummary(null), {
        warnAfterAbsences: 3,
        dropAfterAbsences: 5,
        lateToAbsenceRatio: 3,
        excusedCountsAsAbsence: false,
    });

    assert.deepEqual(
        attendanceService.resolveAttendancePolicySummary({
            warnAfterAbsences: -1,
            dropAfterAbsences: "5",
            lateToAbsenceRatio: 0,
            excusedCountsAsAbsence: "yes",
        }),
        {
            warnAfterAbsences: 3,
            dropAfterAbsences: 5,
            lateToAbsenceRatio: 3,
            excusedCountsAsAbsence: false,
        }
    );

    assert.deepEqual(
        attendanceService.resolveAttendancePolicySummary({
            warnAfterAbsences: 1,
            dropAfterAbsences: 5,
            lateToAbsenceRatio: 2.5,
            excusedCountsAsAbsence: false,
        }),
        {
            warnAfterAbsences: 1,
            dropAfterAbsences: 5,
            lateToAbsenceRatio: 3,
            excusedCountsAsAbsence: false,
        }
    );

    assert.equal(
        attendanceService.resolveAttendancePolicySummary({
            lateToAbsenceRatio: 1,
        }).lateToAbsenceRatio,
        1
    );

    const metrics = {
        presentCount: 1,
        lateCount: 4,
        absentCount: 2,
        excusedCount: 1,
        totalCount: 8,
    };

    assert.deepEqual(
        attendanceService.buildAttendanceRisk(
            metrics,
            attendanceService.resolveAttendancePolicySummary({
                warnAfterAbsences: 3,
                dropAfterAbsences: 5,
                lateToAbsenceRatio: 3,
                excusedCountsAsAbsence: false,
            })
        ),
        {
            status: "warning",
            effectiveAbsences: 3,
            warnAfterAbsences: 3,
            dropAfterAbsences: 5,
            absentCount: 2,
            lateCount: 4,
            excusedCount: 1,
            lateAbsenceEquivalent: 1,
        }
    );

    assert.equal(
        attendanceService.buildAttendanceRisk(
            metrics,
            attendanceService.resolveAttendancePolicySummary({
                warnAfterAbsences: 3,
                dropAfterAbsences: 4,
                lateToAbsenceRatio: 3,
                excusedCountsAsAbsence: true,
            })
        ).status,
        "drop_risk"
    );

    assert.equal(
        attendanceService.buildAttendanceRisk(
            { presentCount: 5, lateCount: 0, absentCount: 2, excusedCount: 0, totalCount: 7 },
            attendanceService.resolveAttendancePolicySummary({
                warnAfterAbsences: 0,
                dropAfterAbsences: 0,
                lateToAbsenceRatio: 3,
                excusedCountsAsAbsence: false,
            })
        ).status,
        "good"
    );
});

test("QR attendance date override is local-only and falls back safely", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalOverride = process.env.ATTENDANCE_QR_DATE_OVERRIDE;
    const now = new Date("2026-06-04T12:00:00.000Z");

    try {
        process.env.NODE_ENV = "test";
        delete process.env.ATTENDANCE_QR_DATE_OVERRIDE;
        assert.equal(
            attendanceService.resolveQrAttendanceAvailabilityDate(now).toISOString().slice(0, 10),
            "2026-06-04"
        );

        process.env.ATTENDANCE_QR_DATE_OVERRIDE = "2026-06-07";
        assert.equal(
            attendanceService.resolveQrAttendanceAvailabilityDate(now).toISOString().slice(0, 10),
            "2026-06-07"
        );

        process.env.ATTENDANCE_QR_DATE_OVERRIDE = "not-a-date";
        assert.equal(
            attendanceService.resolveQrAttendanceAvailabilityDate(now).toISOString().slice(0, 10),
            "2026-06-04"
        );

        process.env.NODE_ENV = "production";
        process.env.ATTENDANCE_QR_DATE_OVERRIDE = "2026-06-07";
        assert.equal(
            attendanceService.resolveQrAttendanceAvailabilityDate(now).toISOString().slice(0, 10),
            "2026-06-04"
        );
    } finally {
        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }

        if (originalOverride === undefined) {
            delete process.env.ATTENDANCE_QR_DATE_OVERRIDE;
        } else {
            process.env.ATTENDANCE_QR_DATE_OVERRIDE = originalOverride;
        }
    }
});

test("section attendance analytics applies institution attendance policy risk without writes", async (t) => {
    const data = mockAttendanceAnalyticsDependencies(t, {
        institution: buildInstitution({
            policies: {
                warnAfterAbsences: 3,
                dropAfterAbsences: 5,
                lateToAbsenceRatio: 3,
                excusedCountsAsAbsence: false,
            },
        }),
        attendanceRecords: [
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439091", sectionSessionId: sessionOneId, studentMemberId: studentOneMemberId, attendanceStatus: "absent" }),
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439092", sectionSessionId: sessionTwoId, studentMemberId: studentOneMemberId, attendanceStatus: "absent" }),
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439093", sectionSessionId: sessionThreeId, studentMemberId: studentOneMemberId, attendanceStatus: "late" }),
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439094", sectionSessionId: sessionOneId, studentMemberId: studentOneMemberId, attendanceStatus: "late" }),
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439095", sectionSessionId: sessionTwoId, studentMemberId: studentOneMemberId, attendanceStatus: "late" }),
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439096", sectionSessionId: sessionThreeId, studentMemberId: studentOneMemberId, attendanceStatus: "late" }),
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439097", sectionSessionId: sessionOneId, studentMemberId: studentOneMemberId, attendanceStatus: "excused" }),
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439098", sectionSessionId: sessionOneId, studentMemberId: studentTwoMemberId, attendanceStatus: "absent" }),
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439099", sectionSessionId: sessionTwoId, studentMemberId: studentTwoMemberId, attendanceStatus: "absent" }),
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439100", sectionSessionId: sessionThreeId, studentMemberId: studentTwoMemberId, attendanceStatus: "absent" }),
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439101", sectionSessionId: sessionOneId, studentMemberId: studentTwoMemberId, attendanceStatus: "absent" }),
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439102", sectionSessionId: sessionTwoId, studentMemberId: studentTwoMemberId, attendanceStatus: "absent" }),
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439103", sectionSessionId: sessionOneId, studentMemberId: studentThreeMemberId, attendanceStatus: "present" }),
        ],
    });

    const result = await attendanceService.getSectionAttendanceAnalytics({
        institutionId,
        sectionId,
        actorUserId,
        actorMembership: buildMembership(),
        query: {},
    });

    assert.deepEqual(result.attendanceAnalytics.attendancePolicySummary, {
        warnAfterAbsences: 3,
        dropAfterAbsences: 5,
        lateToAbsenceRatio: 3,
        excusedCountsAsAbsence: false,
    });

    const byStudentId = new Map(
        result.attendanceAnalytics.perStudent.map((row) => [row.studentMemberId, row])
    );
    assert.equal(byStudentId.get(studentOneMemberId).attendanceRisk.status, "warning");
    assert.equal(byStudentId.get(studentOneMemberId).attendanceRisk.effectiveAbsences, 3);
    assert.equal(byStudentId.get(studentOneMemberId).attendanceRisk.lateAbsenceEquivalent, 1);
    assert.equal(byStudentId.get(studentOneMemberId).attendanceRisk.excusedCount, 1);
    assert.equal(byStudentId.get(studentTwoMemberId).attendanceRisk.status, "drop_risk");
    assert.equal(byStudentId.get(studentTwoMemberId).attendanceRisk.effectiveAbsences, 5);
    assert.equal(byStudentId.get(studentThreeMemberId).attendanceRisk.status, "good");

    const tenantScopedReads = data.queryLog.filter((entry) =>
        ["Section", "Subject", "SectionSession", "AttendanceRecord", "Membership", "MemberProfile"].includes(entry.model)
    );
    assert.ok(tenantScopedReads.length > 0);
    for (const entry of tenantScopedReads) {
        assert.equal(normalizeId(entry.query.institutionId), institutionId, `${entry.model}.${entry.method} must be tenant scoped`);
    }
});

test("section attendance analytics respects excused-as-absence institution policy", async (t) => {
    mockAttendanceAnalyticsDependencies(t, {
        institution: buildInstitution({
            policies: {
                warnAfterAbsences: 2,
                dropAfterAbsences: 4,
                lateToAbsenceRatio: 3,
                excusedCountsAsAbsence: true,
            },
        }),
        attendanceRecords: [
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439121", sectionSessionId: sessionOneId, studentMemberId: studentOneMemberId, attendanceStatus: "absent" }),
            buildAttendanceRecord({ _id: "507f1f77bcf86cd799439122", sectionSessionId: sessionTwoId, studentMemberId: studentOneMemberId, attendanceStatus: "excused" }),
        ],
    });

    const result = await attendanceService.getSectionAttendanceAnalytics({
        institutionId,
        sectionId,
        actorUserId,
        actorMembership: buildMembership(),
        query: {},
    });

    assert.equal(result.attendanceAnalytics.perStudent[0].attendanceRisk.effectiveAbsences, 2);
    assert.equal(result.attendanceAnalytics.perStudent[0].attendanceRisk.status, "warning");
});

test("section attendance analytics keeps permissions and tenant isolation", async (t) => {
    mockAttendanceAnalyticsDependencies(t);

    await assert.rejects(
        () =>
            attendanceService.getSectionAttendanceAnalytics({
                institutionId,
                sectionId,
                actorUserId,
                actorMembership: buildMembership({ _id: otherInstructorMemberId }),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Permission denied");
            return true;
        }
    );

    t.mock.reset();
    mockAttendanceAnalyticsDependencies(t);
    await assert.rejects(
        () =>
            attendanceService.getSectionAttendanceAnalytics({
                institutionId: otherInstitutionId,
                sectionId,
                actorUserId,
                actorMembership: buildMembership({ institutionId: otherInstitutionId, role: "admin" }),
                query: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Section not found");
            return true;
        }
    );
});

test("section attendance analytics includes policy defaults when institution policy is missing", async (t) => {
    mockAttendanceAnalyticsDependencies(t, {
        institution: buildInstitution({ policies: null }),
        sectionSessions: [],
        attendanceRecords: [],
    });

    const result = await attendanceService.getSectionAttendanceAnalytics({
        institutionId,
        sectionId,
        actorUserId,
        actorMembership: buildMembership(),
        query: {},
    });

    assert.deepEqual(result.attendanceAnalytics.attendancePolicySummary, {
        warnAfterAbsences: 3,
        dropAfterAbsences: 5,
        lateToAbsenceRatio: 3,
        excusedCountsAsAbsence: false,
    });
    assert.deepEqual(result.attendanceAnalytics.perStudent, []);
});
