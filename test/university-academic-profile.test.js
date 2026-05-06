const test = require("node:test");
const assert = require("node:assert/strict");

const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");
const MemberProfile = require("../src/models/MemberProfile");
const User = require("../src/models/User");
const Section = require("../src/models/Section");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");
const universityAcademicOutcomeService = require("../src/services/universityAcademicOutcomeService");
const { buildUniversityAcademicProfile } = require("../src/services/universityAcademicProfileService");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439099";
const actorUserId = "507f1f77bcf86cd799439012";
const actorMembership = {
    _id: "507f1f77bcf86cd799439013",
    role: "admin",
    institutionId,
};
const studentMembershipId = "507f1f77bcf86cd799439021";
const instructorMembershipId = "507f1f77bcf86cd799439022";
const suspendedStudentMembershipId = "507f1f77bcf86cd799439023";
const studentUserId = "507f1f77bcf86cd799439024";
const semesterOneId = "507f1f77bcf86cd799439031";
const semesterTwoId = "507f1f77bcf86cd799439032";
const subjectOneId = "507f1f77bcf86cd799439041";
const subjectTwoId = "507f1f77bcf86cd799439042";
const sectionOneId = "507f1f77bcf86cd799439051";
const sectionTwoId = "507f1f77bcf86cd799439052";
const enrollmentOneId = "507f1f77bcf86cd799439061";
const enrollmentTwoId = "507f1f77bcf86cd799439062";

function createQuery(result) {
    return {
        select() {
            return this;
        },
        sort() {
            return this;
        },
        lean: async () => result,
    };
}

function normalizeId(value) {
    if (value === undefined || value === null) {
        return null;
    }

    return value.toString();
}

function buildOutcome(overrides = {}) {
    return {
        enrollmentId: enrollmentOneId,
        sectionId: sectionOneId,
        semesterId: semesterOneId,
        subjectId: subjectOneId,
        outcomeStatus: "passed_final",
        percentage: 90,
        attemptedCreditHours: 3,
        earnedCreditHours: 3,
        gradePoint: 4,
        qualityPoints: 12,
        ...overrides,
    };
}

function buildOutcomeResult(overrides = {}) {
    return {
        outcomes: [
            buildOutcome(),
            buildOutcome({
                enrollmentId: enrollmentTwoId,
                sectionId: sectionTwoId,
                semesterId: semesterTwoId,
                subjectId: subjectOneId,
                outcomeStatus: "failed",
                percentage: 55,
                attemptedCreditHours: 3,
                earnedCreditHours: 0,
                gradePoint: 0,
                qualityPoints: 0,
            }),
        ],
        summary: {
            attemptedCreditHours: 6,
            earnedCreditHours: 3,
            qualityPoints: 12,
            cumulativeGpa: 2,
        },
        subjectOutcomeSummaries: [
            {
                subjectId: subjectOneId,
                attemptCount: 2,
                bestOutcomeStatus: "passed_final",
                bestOutcomeEnrollmentId: enrollmentOneId,
                bestOutcomeSectionId: sectionOneId,
                hasFailedAttempt: true,
                hasPassedImprovableAttempt: false,
                hasPassedFinalAttempt: true,
            },
        ],
        excluded: [],
        ...overrides,
    };
}

function buildDataset(overrides = {}) {
    return {
        institution: { _id: institutionId, type: "university" },
        memberships: [
            {
                _id: studentMembershipId,
                institutionId,
                userId: studentUserId,
                role: "student",
                status: "active",
            },
            {
                _id: instructorMembershipId,
                institutionId,
                userId: "507f1f77bcf86cd799439025",
                role: "instructor",
                status: "active",
            },
            {
                _id: suspendedStudentMembershipId,
                institutionId,
                userId: "507f1f77bcf86cd799439026",
                role: "student",
                status: "suspended",
            },
            {
                _id: "507f1f77bcf86cd799439027",
                institutionId: otherInstitutionId,
                userId: "507f1f77bcf86cd799439028",
                role: "student",
                status: "active",
            },
        ],
        profile: {
            _id: "507f1f77bcf86cd799439071",
            fullName: "Lina University",
        },
        user: {
            _id: studentUserId,
            email: "lina@example.com",
        },
        sections: [
            {
                _id: sectionOneId,
                institutionId,
                semesterId: semesterOneId,
                subjectId: subjectOneId,
                code: "A",
                title: "Section A",
            },
            {
                _id: sectionTwoId,
                institutionId,
                semesterId: semesterTwoId,
                subjectId: subjectOneId,
                code: "B",
                title: "Section B",
            },
        ],
        subjects: [
            {
                _id: subjectOneId,
                institutionId,
                code: "CS201",
                name: "Data Structures",
                creditHours: 3,
            },
            {
                _id: subjectTwoId,
                institutionId,
                code: "MATH101",
                name: "Calculus",
                creditHours: 3,
            },
        ],
        semesters: [
            {
                _id: semesterOneId,
                institutionId,
                name: "Fall 2025",
                startDate: new Date("2025-09-01T00:00:00.000Z"),
                endDate: new Date("2025-12-20T00:00:00.000Z"),
                status: "archived",
            },
            {
                _id: semesterTwoId,
                institutionId,
                name: "Spring 2026",
                startDate: new Date("2026-02-01T00:00:00.000Z"),
                endDate: new Date("2026-05-20T00:00:00.000Z"),
                status: "active",
            },
        ],
        outcomeResult: buildOutcomeResult(),
        ...overrides,
    };
}

function mockProviderDependencies(t, dataset, queryLog = {}) {
    t.mock.method(Institution, "findOne", (query) => {
        queryLog.institutionFindOne = query;
        if (normalizeId(query._id) !== institutionId) {
            return createQuery(null);
        }

        return createQuery(dataset.institution);
    });

    t.mock.method(Membership, "findOne", (query) => {
        queryLog.membershipFindOne = query;
        const membership =
            dataset.memberships.find(
                (row) =>
                    normalizeId(row._id) === normalizeId(query._id) &&
                    normalizeId(row.institutionId) === normalizeId(query.institutionId)
            ) || null;

        return createQuery(membership);
    });

    t.mock.method(MemberProfile, "findOne", (query) => {
        queryLog.memberProfileFindOne = query;
        if (
            normalizeId(query.institutionId) !== institutionId ||
            normalizeId(query.membershipId) !== studentMembershipId
        ) {
            return createQuery(null);
        }

        return createQuery(dataset.profile);
    });

    t.mock.method(User, "findOne", (query) => {
        queryLog.userFindOne = query;
        if (normalizeId(query._id) !== studentUserId) {
            return createQuery(null);
        }

        return createQuery(dataset.user);
    });

    t.mock.method(Section, "find", (query) => {
        queryLog.sectionFind = query;
        const sectionIds = new Set((query._id?.$in || []).map(normalizeId));
        return createQuery(
            dataset.sections.filter(
                (section) =>
                    normalizeId(section.institutionId) === normalizeId(query.institutionId) &&
                    sectionIds.has(normalizeId(section._id))
            )
        );
    });

    t.mock.method(Subject, "find", (query) => {
        queryLog.subjectFind = query;
        const subjectIds = new Set((query._id?.$in || []).map(normalizeId));
        return createQuery(
            dataset.subjects.filter(
                (subject) =>
                    normalizeId(subject.institutionId) === normalizeId(query.institutionId) &&
                    subjectIds.has(normalizeId(subject._id))
            )
        );
    });

    t.mock.method(Semester, "find", (query) => {
        queryLog.semesterFind = query;
        const semesterIds = new Set((query._id?.$in || []).map(normalizeId));
        return createQuery(
            dataset.semesters.filter(
                (semester) =>
                    normalizeId(semester.institutionId) === normalizeId(query.institutionId) &&
                    semesterIds.has(normalizeId(semester._id))
            )
        );
    });

    t.mock.method(universityAcademicOutcomeService, "listStudentAcademicOutcomes", async (args) => {
        queryLog.outcomeArgs = args;
        return dataset.outcomeResult;
    });
}

test("university academic profile provider returns a safe transcript profile", async (t) => {
    const queryLog = {};
    mockProviderDependencies(t, buildDataset(), queryLog);

    const result = await buildUniversityAcademicProfile({
        institutionId,
        studentMembershipId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.institutionType, "university");
    assert.deepEqual(result.student, {
        studentMembershipId,
        name: "Lina University",
        email: "lina@example.com",
    });
    assert.deepEqual(result.summary, {
        cumulativeGpa: 2,
        totalEarnedCreditHours: 3,
        totalAttemptedCreditHours: 6,
        totalPassedSubjects: 1,
        totalFailedSubjects: 0,
    });
    assert.equal(result.semesters.length, 2);
    assert.equal(result.semesters[0].semesterId, semesterOneId);
    assert.equal(result.semesters[0].gpa, 4);
    assert.equal(result.semesters[1].semesterId, semesterTwoId);
    assert.equal(result.semesters[1].gpa, 0);
    assert.equal(result.subjectAttempts.length, 2);
    assert.deepEqual(
        result.subjectAttempts.map((attempt) => ({
            enrollmentId: attempt.enrollmentId,
            subjectCode: attempt.subjectCode,
            sectionCode: attempt.sectionCode,
            attemptNumber: attempt.attemptNumber,
            attemptCount: attempt.attemptCount,
            isRepeatedSubject: attempt.isRepeatedSubject,
            isLatestAttempt: attempt.isLatestAttempt,
            isBestAttempt: attempt.isBestAttempt,
            previousAttemptCount: attempt.previousAttemptCount,
            hasPreviousAttempt: attempt.hasPreviousAttempt,
            attemptLabel: attempt.attemptLabel,
        })),
        [
            {
                enrollmentId: enrollmentOneId,
                subjectCode: "CS201",
                sectionCode: "A",
                attemptNumber: 1,
                attemptCount: 2,
                isRepeatedSubject: true,
                isLatestAttempt: false,
                isBestAttempt: true,
                previousAttemptCount: 0,
                hasPreviousAttempt: false,
                attemptLabel: "Attempt 1",
            },
            {
                enrollmentId: enrollmentTwoId,
                subjectCode: "CS201",
                sectionCode: "B",
                attemptNumber: 2,
                attemptCount: 2,
                isRepeatedSubject: true,
                isLatestAttempt: true,
                isBestAttempt: false,
                previousAttemptCount: 1,
                hasPreviousAttempt: true,
                attemptLabel: "Attempt 2",
            },
        ]
    );
    assert.deepEqual(result.subjectOutcomeSummaries[0], {
        subjectId: subjectOneId,
        subjectCode: "CS201",
        subjectName: "Data Structures",
        attemptCount: 2,
        attempts: [
            {
                attemptNumber: 1,
                enrollmentId: enrollmentOneId,
                sectionId: sectionOneId,
                semesterId: semesterOneId,
                outcomeStatus: "passed_final",
                percentage: 90,
                isLatestAttempt: false,
                isBestAttempt: true,
            },
            {
                attemptNumber: 2,
                enrollmentId: enrollmentTwoId,
                sectionId: sectionTwoId,
                semesterId: semesterTwoId,
                outcomeStatus: "failed",
                percentage: 55,
                isLatestAttempt: true,
                isBestAttempt: false,
            },
        ],
        bestOutcomeStatus: "passed_final",
        bestOutcomeEnrollmentId: enrollmentOneId,
        bestOutcomeSectionId: sectionOneId,
        bestPercentage: 90,
        latestOutcomeStatus: "failed",
        latestOutcomeEnrollmentId: enrollmentTwoId,
        latestOutcomeSectionId: sectionTwoId,
        latestPercentage: 55,
        hasFailedAttempt: true,
        hasPassedImprovableAttempt: false,
        hasPassedFinalAttempt: true,
        failedThenPassed: false,
        passedThenRepeated: true,
        repeatedAfterFinalPass: true,
    });
    assert.deepEqual(result.gpaCalculation, {
        mode: "all_finalized_attempts",
        message:
            "Cumulative GPA follows the current university academic outcome service behavior and counts all finalized attempts until a repeatPolicy is introduced.",
    });
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.excluded, []);
    assert.equal(queryLog.membershipFindOne.institutionId, institutionId);
    assert.equal(queryLog.outcomeArgs.institutionId, institutionId);
    assert.equal(queryLog.outcomeArgs.studentMemberId, studentMembershipId);
    assert.equal(queryLog.sectionFind.institutionId, institutionId);
    assert.equal(queryLog.subjectFind.institutionId, institutionId);
    assert.equal(queryLog.semesterFind.institutionId, institutionId);
});

test("university academic profile displays failed-then-passed repeated attempts without changing GPA", async (t) => {
    mockProviderDependencies(
        t,
        buildDataset({
            outcomeResult: buildOutcomeResult({
                outcomes: [
                    buildOutcome({
                        enrollmentId: enrollmentTwoId,
                        sectionId: sectionTwoId,
                        semesterId: semesterTwoId,
                        subjectId: subjectOneId,
                        outcomeStatus: "passed_final",
                        percentage: 82,
                        attemptedCreditHours: 3,
                        earnedCreditHours: 3,
                        gradePoint: 3,
                        qualityPoints: 9,
                    }),
                    buildOutcome({
                        enrollmentId: enrollmentOneId,
                        sectionId: sectionOneId,
                        semesterId: semesterOneId,
                        subjectId: subjectOneId,
                        outcomeStatus: "failed",
                        percentage: 52,
                        attemptedCreditHours: 3,
                        earnedCreditHours: 0,
                        gradePoint: 0,
                        qualityPoints: 0,
                    }),
                ],
                summary: {
                    attemptedCreditHours: 6,
                    earnedCreditHours: 3,
                    qualityPoints: 9,
                    cumulativeGpa: 1.5,
                },
                subjectOutcomeSummaries: [],
            }),
        })
    );

    const result = await buildUniversityAcademicProfile({
        institutionId,
        studentMembershipId,
        actorUserId,
        actorMembership,
    });

    assert.deepEqual(result.summary, {
        cumulativeGpa: 1.5,
        totalEarnedCreditHours: 3,
        totalAttemptedCreditHours: 6,
        totalPassedSubjects: 1,
        totalFailedSubjects: 0,
    });
    assert.deepEqual(
        result.subjectAttempts.map((attempt) => ({
            enrollmentId: attempt.enrollmentId,
            outcomeStatus: attempt.outcomeStatus,
            attemptNumber: attempt.attemptNumber,
            attemptCount: attempt.attemptCount,
            isLatestAttempt: attempt.isLatestAttempt,
            isBestAttempt: attempt.isBestAttempt,
        })),
        [
            {
                enrollmentId: enrollmentOneId,
                outcomeStatus: "failed",
                attemptNumber: 1,
                attemptCount: 2,
                isLatestAttempt: false,
                isBestAttempt: false,
            },
            {
                enrollmentId: enrollmentTwoId,
                outcomeStatus: "passed_final",
                attemptNumber: 2,
                attemptCount: 2,
                isLatestAttempt: true,
                isBestAttempt: true,
            },
        ]
    );
    assert.equal(result.subjectOutcomeSummaries.length, 1);
    assert.equal(result.subjectOutcomeSummaries[0].bestOutcomeStatus, "passed_final");
    assert.equal(result.subjectOutcomeSummaries[0].bestOutcomeEnrollmentId, enrollmentTwoId);
    assert.equal(result.subjectOutcomeSummaries[0].latestOutcomeStatus, "passed_final");
    assert.equal(result.subjectOutcomeSummaries[0].latestOutcomeEnrollmentId, enrollmentTwoId);
    assert.equal(result.subjectOutcomeSummaries[0].bestPercentage, 82);
    assert.equal(result.subjectOutcomeSummaries[0].latestPercentage, 82);
    assert.equal(result.subjectOutcomeSummaries[0].failedThenPassed, true);
    assert.equal(result.subjectOutcomeSummaries[0].passedThenRepeated, false);
    assert.equal(result.subjectOutcomeSummaries[0].repeatedAfterFinalPass, false);
});

test("university academic profile returns a safe empty profile when no finalized outcomes exist", async (t) => {
    mockProviderDependencies(
        t,
        buildDataset({
            outcomeResult: {
                outcomes: [],
                summary: {
                    attemptedCreditHours: 0,
                    earnedCreditHours: 0,
                    qualityPoints: 0,
                    cumulativeGpa: null,
                },
                subjectOutcomeSummaries: [],
            },
        })
    );

    const result = await buildUniversityAcademicProfile({
        institutionId,
        studentMembershipId,
        actorUserId,
        actorMembership,
    });

    assert.deepEqual(result.summary, {
        cumulativeGpa: null,
        totalEarnedCreditHours: 0,
        totalAttemptedCreditHours: 0,
        totalPassedSubjects: 0,
        totalFailedSubjects: 0,
    });
    assert.deepEqual(result.semesters, []);
    assert.deepEqual(result.subjectAttempts, []);
    assert.deepEqual(result.subjectOutcomeSummaries, []);
    assert.deepEqual(result.excluded, []);
    assert.deepEqual(result.warnings, [
        {
            code: "no_finalized_academic_outcomes",
            message: "No finalized academic outcomes are available for this student yet.",
        },
    ]);
});

test("university academic profile preserves excluded explanations from outcome service", async (t) => {
    mockProviderDependencies(
        t,
        buildDataset({
            outcomeResult: buildOutcomeResult({
                excluded: [
                    {
                        reasonCode: "section_not_closed",
                        message: "This section is not finalized yet, so it is not included in official GPA.",
                        sectionId: sectionTwoId,
                        semesterId: semesterTwoId,
                        subjectId: subjectOneId,
                    },
                ],
            }),
        })
    );

    const result = await buildUniversityAcademicProfile({
        institutionId,
        studentMembershipId,
        actorUserId,
        actorMembership,
    });

    assert.deepEqual(result.excluded, [
        {
            reasonCode: "section_not_closed",
            message: "This section is not finalized yet, so it is not included in official GPA.",
            sectionId: sectionTwoId,
            semesterId: semesterTwoId,
            subjectId: subjectOneId,
        },
    ]);
});

test("university academic profile deduplicates and sanitizes excluded explanations", async (t) => {
    mockProviderDependencies(
        t,
        buildDataset({
            outcomeResult: buildOutcomeResult({
                excluded: [
                    {
                        reasonCode: "missing_assessment_result",
                        message: "Missing result",
                        sectionId: sectionOneId,
                        semesterId: semesterOneId,
                        subjectId: subjectOneId,
                        assessmentId: "507f1f77bcf86cd799439091",
                        audit: { internal: true },
                    },
                    {
                        reasonCode: "missing_assessment_result",
                        message: "Duplicate message should not produce a second row",
                        sectionId: sectionOneId,
                        semesterId: semesterOneId,
                        subjectId: subjectOneId,
                        assessmentId: "507f1f77bcf86cd799439091",
                        tenantSecret: "do-not-return",
                    },
                ],
            }),
        })
    );

    const result = await buildUniversityAcademicProfile({
        institutionId,
        studentMembershipId,
        actorUserId,
        actorMembership,
    });

    assert.deepEqual(result.excluded, [
        {
            reasonCode: "missing_assessment_result",
            message: "Missing result",
            sectionId: sectionOneId,
            semesterId: semesterOneId,
            subjectId: subjectOneId,
            assessmentId: "507f1f77bcf86cd799439091",
        },
    ]);
});

test("university academic profile preserves existing GPA and credit behavior from outcome service", async (t) => {
    mockProviderDependencies(
        t,
        buildDataset({
            outcomeResult: buildOutcomeResult({
                outcomes: [
                    buildOutcome({
                        attemptedCreditHours: 4,
                        earnedCreditHours: 4,
                        gradePoint: 3.5,
                        qualityPoints: 14,
                    }),
                ],
                summary: {
                    attemptedCreditHours: 4,
                    earnedCreditHours: 4,
                    qualityPoints: 14,
                    cumulativeGpa: 3.5,
                },
                subjectOutcomeSummaries: [],
            }),
        })
    );

    const result = await buildUniversityAcademicProfile({
        institutionId,
        studentMembershipId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.summary.cumulativeGpa, 3.5);
    assert.equal(result.summary.totalAttemptedCreditHours, 4);
    assert.equal(result.summary.totalEarnedCreditHours, 4);
    assert.equal(result.subjectAttempts[0].qualityPoints, 14);
    assert.equal(result.subjectAttempts[0].gradePoint, 3.5);
});

test("university academic profile decorations stay scoped to the same institution", async (t) => {
    const queryLog = {};
    mockProviderDependencies(
        t,
        buildDataset({
            sections: [
                {
                    _id: sectionOneId,
                    institutionId: otherInstitutionId,
                    semesterId: semesterOneId,
                    subjectId: subjectOneId,
                    code: "FOREIGN",
                    title: "Foreign Section",
                },
            ],
            subjects: [
                {
                    _id: subjectOneId,
                    institutionId: otherInstitutionId,
                    code: "FOREIGN101",
                    name: "Foreign Subject",
                    creditHours: 3,
                },
            ],
            semesters: [
                {
                    _id: semesterOneId,
                    institutionId: otherInstitutionId,
                    name: "Foreign Semester",
                    startDate: new Date("2025-09-01T00:00:00.000Z"),
                    endDate: new Date("2025-12-20T00:00:00.000Z"),
                    status: "archived",
                },
            ],
            outcomeResult: buildOutcomeResult({
                outcomes: [buildOutcome()],
                summary: {
                    attemptedCreditHours: 3,
                    earnedCreditHours: 3,
                    qualityPoints: 12,
                    cumulativeGpa: 4,
                },
                subjectOutcomeSummaries: [],
            }),
        }),
        queryLog
    );

    const result = await buildUniversityAcademicProfile({
        institutionId,
        studentMembershipId,
        actorUserId,
        actorMembership,
    });

    assert.equal(queryLog.sectionFind.institutionId, institutionId);
    assert.equal(queryLog.subjectFind.institutionId, institutionId);
    assert.equal(queryLog.semesterFind.institutionId, institutionId);
    assert.equal(result.subjectAttempts[0].sectionCode, null);
    assert.equal(result.subjectAttempts[0].subjectCode, null);
    assert.equal(result.subjectAttempts[0].semesterName, null);
});

test("university academic profile documents semesterId filter as not applied for now", async (t) => {
    mockProviderDependencies(t, buildDataset());

    const result = await buildUniversityAcademicProfile({
        institutionId,
        studentMembershipId,
        semesterId: semesterOneId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.semesters.length, 2);
    assert.deepEqual(result.warnings, [
        {
            code: "semester_filter_not_applied",
            message:
                "semesterId filtering is not supported by the university academic outcome service yet; returning the full profile.",
            semesterId: semesterOneId,
        },
    ]); 
});

test("university academic profile self access does not require section.manage", async (t) => {
    const queryLog = {};
    mockProviderDependencies(t, buildDataset(), queryLog);

    const result = await buildUniversityAcademicProfile({
        institutionId,
        studentMembershipId,
        actorUserId: studentUserId,
        actorMembership: {
            _id: studentMembershipId,
            role: "student",
            institutionId,
            status: "active",
        },
        accessMode: "self",
    });

    assert.equal(result.student.studentMembershipId, studentMembershipId);
    assert.equal(queryLog.outcomeArgs.studentMemberId, studentMembershipId);
});

test("university academic profile rejects invalid studentMembershipId", async () => {
    await assert.rejects(
        () =>
            buildUniversityAcademicProfile({
                institutionId,
                studentMembershipId: "not-an-id",
                actorUserId,
                actorMembership,
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "studentMembershipId is invalid");
            return true;
        }
    );
});

test("university academic profile rejects cross-tenant studentMembershipId", async (t) => {
    mockProviderDependencies(t, buildDataset());

    await assert.rejects(
        () =>
            buildUniversityAcademicProfile({
                institutionId,
                studentMembershipId: "507f1f77bcf86cd799439027",
                actorUserId,
                actorMembership,
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "studentMembershipId is invalid");
            return true;
        }
    );
});

test("university academic profile rejects non-student and non-active target memberships", async (t) => {
    mockProviderDependencies(t, buildDataset());

    await assert.rejects(
        () =>
            buildUniversityAcademicProfile({
                institutionId,
                studentMembershipId: instructorMembershipId,
                actorUserId,
                actorMembership,
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "studentMembershipId must reference a student membership");
            return true;
        }
    );

    await assert.rejects(
        () =>
            buildUniversityAcademicProfile({
                institutionId,
                studentMembershipId: suspendedStudentMembershipId,
                actorUserId,
                actorMembership,
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Student member must be active");
            return true;
        }
    );
});

test("university academic profile rejects actor membership from another institution", async () => {
    await assert.rejects(
        () =>
            buildUniversityAcademicProfile({
                institutionId,
                studentMembershipId,
                actorUserId,
                actorMembership: {
                    _id: "507f1f77bcf86cd799439081",
                    role: "admin",
                    institutionId: otherInstitutionId,
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Institution access denied");
            return true;
        }
    );
});

test("university academic profile rejects unsupported accessMode values", async () => {
    await assert.rejects(
        () =>
            buildUniversityAcademicProfile({
                institutionId,
                studentMembershipId,
                actorUserId,
                actorMembership,
                accessMode: "student",
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "accessMode is invalid");
            return true;
        }
    );
});

test("university academic profile is university-only and default staff mode rejects students", async (t) => {
    mockProviderDependencies(t, buildDataset({ institution: { _id: institutionId, type: "school" } }));

    await assert.rejects(
        () =>
            buildUniversityAcademicProfile({
                institutionId,
                studentMembershipId,
                actorUserId,
                actorMembership,
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Academic profile is only supported for university institutions");
            return true;
        }
    );

    await assert.rejects(
        () =>
            buildUniversityAcademicProfile({
                institutionId,
                studentMembershipId,
                actorUserId,
                actorMembership: {
                    _id: studentMembershipId,
                    role: "student",
                    institutionId,
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Permission denied");
            return true;
        }
    );
});
