const test = require("node:test");
const assert = require("node:assert/strict");

const Institution = require("../src/models/Institution");
const ClassLevel = require("../src/models/ClassLevel");
const ClassStudentAssignment = require("../src/models/ClassStudentAssignment");
const MemberProfile = require("../src/models/MemberProfile");
const Membership = require("../src/models/Membership");
const SchoolAcademicPolicy = require("../src/models/SchoolAcademicPolicy");
const SchoolClass = require("../src/models/SchoolClass");
const Section = require("../src/models/Section");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");
const User = require("../src/models/User");
const schoolAcademicPolicyService = require("../src/services/schoolAcademicPolicyService");
const schoolOutcomeService = require("../src/services/schoolOutcomeService");
const schoolPromotionService = require("../src/services/schoolPromotionService");
const {
    getStudentSemesterReportCard,
    getStudentYearlyReportCard,
    getClassPromotionSummary,
} = require("../src/services/schoolReportCardService");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439099";
const actorUserId = "507f1f77bcf86cd799439012";
const actorMembership = {
    _id: "507f1f77bcf86cd799439013",
    role: "admin",
    institutionId,
};
const studentMembershipId = "507f1f77bcf86cd799439021";
const studentTwoMembershipId = "507f1f77bcf86cd799439022";
const academicYearId = "507f1f77bcf86cd799439031";
const classLevelId = "507f1f77bcf86cd799439041";
const schoolClassId = "507f1f77bcf86cd799439051";
const semesterOneId = "507f1f77bcf86cd799439061";
const semesterTwoId = "507f1f77bcf86cd799439062";
const mathSubjectId = "507f1f77bcf86cd799439071";
const arabicSubjectId = "507f1f77bcf86cd799439072";

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
    if (value === undefined || value === null) {
        return null;
    }

    return value.toString();
}

function includesId(values = [], value) {
    const normalizedValue = normalizeId(value);
    return values.map(normalizeId).includes(normalizedValue);
}

function buildPolicy(overrides = {}) {
    return {
        id: "507f1f77bcf86cd799439081",
        _id: "507f1f77bcf86cd799439081",
        institutionId,
        name: "School Promotion Policy",
        status: "active",
        appliesTo: {
            academicYearId,
            schoolStageId: null,
            classLevelId,
        },
        gradingRules: {
            gradingMode: "percentage",
            scaleMax: 100,
            subjectPassMinPercentage: 50,
            yearPassMinPercentage: 60,
        },
        aggregationRules: {
            yearCalculationMethod: "weighted_semesters",
            semesterWeights: [
                { semesterId: semesterOneId, weight: 50 },
                { semesterId: semesterTwoId, weight: 50 },
            ],
        },
        failureRules: {
            failIfAnyCriticalSubjectFailed: true,
            criticalSubjectRules: [{ subjectId: arabicSubjectId, failAction: "repeat_year" }],
            failIfFailedSubjectCountAtLeast: 3,
            countCriticalSubjectsInFailedSubjectTotal: true,
        },
        promotionRules: {
            enabled: true,
            passDecision: "promoted",
            failDecision: "repeat_year",
            allowConditionalPromotion: true,
            allowManualReview: true,
        },
        ...overrides,
    };
}

function buildDataset(overrides = {}) {
    return {
        institution: { _id: institutionId, type: "school" },
        memberships: [
            {
                _id: studentMembershipId,
                userId: "507f1f77bcf86cd799439091",
                institutionId,
                role: "student",
                status: "active",
            },
            {
                _id: studentTwoMembershipId,
                userId: "507f1f77bcf86cd799439092",
                institutionId,
                role: "student",
                status: "active",
            },
        ],
        profiles: [
            {
                _id: "507f1f77bcf86cd7994390a1",
                membershipId: studentMembershipId,
                institutionId,
                fullName: "Mona Student",
            },
            {
                _id: "507f1f77bcf86cd7994390a2",
                membershipId: studentTwoMembershipId,
                institutionId,
                fullName: "Ziad Student",
            },
        ],
        users: [
            { _id: "507f1f77bcf86cd799439091", email: "mona@example.com" },
            { _id: "507f1f77bcf86cd799439092", email: "ziad@example.com" },
        ],
        semesters: [
            {
                _id: semesterOneId,
                institutionId,
                name: "Semester 1",
                startDate: new Date("2026-01-01T00:00:00.000Z"),
                endDate: new Date("2026-05-30T00:00:00.000Z"),
                status: "active",
            },
            {
                _id: semesterTwoId,
                institutionId,
                name: "Semester 2",
                startDate: new Date("2026-06-01T00:00:00.000Z"),
                endDate: new Date("2026-10-30T00:00:00.000Z"),
                status: "archived",
            },
        ],
        schoolClasses: [
            {
                _id: schoolClassId,
                institutionId,
                classLevelId,
                name: "Grade 7 A",
                code: "G7-A",
                status: "active",
            },
        ],
        classLevels: [
            {
                _id: classLevelId,
                institutionId,
                name: "Grade 7",
                code: "G7",
                status: "active",
            },
        ],
        assignments: [
            {
                _id: "507f1f77bcf86cd7994390b1",
                institutionId,
                semesterId: semesterOneId,
                classId: schoolClassId,
                studentMemberId: studentMembershipId,
                status: "assigned",
            },
            {
                _id: "507f1f77bcf86cd7994390b2",
                institutionId,
                semesterId: semesterTwoId,
                classId: schoolClassId,
                studentMemberId: studentMembershipId,
                status: "assigned",
            },
            {
                _id: "507f1f77bcf86cd7994390b3",
                institutionId,
                semesterId: semesterOneId,
                classId: schoolClassId,
                studentMemberId: studentTwoMembershipId,
                status: "assigned",
            },
        ],
        sections: [
            {
                _id: "507f1f77bcf86cd7994390c1",
                institutionId,
                semesterId: semesterOneId,
                schoolClassId,
                subjectId: mathSubjectId,
            },
            {
                _id: "507f1f77bcf86cd7994390c2",
                institutionId,
                semesterId: semesterOneId,
                schoolClassId,
                subjectId: arabicSubjectId,
            },
            {
                _id: "507f1f77bcf86cd7994390c3",
                institutionId: otherInstitutionId,
                semesterId: semesterOneId,
                schoolClassId,
                subjectId: mathSubjectId,
            },
        ],
        subjects: [
            {
                _id: mathSubjectId,
                institutionId,
                classLevelId,
                departmentId: null,
                name: "Math",
                code: "MATH",
                status: "active",
            },
            {
                _id: arabicSubjectId,
                institutionId,
                classLevelId,
                departmentId: null,
                name: "Arabic",
                code: "AR",
                status: "active",
            },
        ],
        policies: [buildPolicy()],
        ...overrides,
    };
}

function mockBaseModels(t, dataset, queryLog = {}) {
    t.mock.method(Institution, "findOne", (query) => {
        queryLog.institutionFindOne = query;
        if (normalizeId(query._id) !== institutionId) {
            return createQuery(null);
        }

        return createQuery(dataset.institution);
    });

    t.mock.method(Membership, "find", (query) => {
        queryLog.membershipFind = query;
        const membershipIds = query._id?.$in || [];
        return createQuery(
            dataset.memberships.filter(
                (membership) =>
                    normalizeId(membership.institutionId) === normalizeId(query.institutionId) &&
                    membership.role === query.role &&
                    includesId(membershipIds, membership._id)
            )
        );
    });

    t.mock.method(MemberProfile, "find", (query) => {
        queryLog.profileFind = query;
        const membershipIds = query.membershipId?.$in || [];
        return createQuery(
            dataset.profiles.filter(
                (profile) =>
                    normalizeId(profile.institutionId) === normalizeId(query.institutionId) &&
                    includesId(membershipIds, profile.membershipId)
            )
        );
    });

    t.mock.method(User, "find", (query) => {
        const userIds = query._id?.$in || [];
        return createQuery(dataset.users.filter((user) => includesId(userIds, user._id)));
    });

    t.mock.method(Semester, "findOne", (query) => {
        queryLog.semesterFindOne = query;
        return createQuery(
            dataset.semesters.find(
                (semester) =>
                    normalizeId(semester._id) === normalizeId(query._id) &&
                    normalizeId(semester.institutionId) === normalizeId(query.institutionId)
            ) || null
        );
    });

    t.mock.method(ClassStudentAssignment, "findOne", (query) => {
        queryLog.assignmentFindOne = query;
        return createQuery(
            dataset.assignments.find(
                (assignment) =>
                    normalizeId(assignment.institutionId) === normalizeId(query.institutionId) &&
                    normalizeId(assignment.semesterId) === normalizeId(query.semesterId) &&
                    normalizeId(assignment.studentMemberId) === normalizeId(query.studentMemberId) &&
                    assignment.status === query.status
            ) || null
        );
    });

    t.mock.method(ClassStudentAssignment, "find", (query) => {
        queryLog.assignmentFind = query;
        const semesterIds = query.semesterId?.$in || [];
        return createQuery(
            dataset.assignments.filter((assignment) => {
                if (normalizeId(assignment.institutionId) !== normalizeId(query.institutionId)) {
                    return false;
                }

                if (query.studentMemberId && normalizeId(assignment.studentMemberId) !== normalizeId(query.studentMemberId)) {
                    return false;
                }

                if (query.classId && normalizeId(assignment.classId) !== normalizeId(query.classId)) {
                    return false;
                }

                if (semesterIds.length && !includesId(semesterIds, assignment.semesterId)) {
                    return false;
                }

                return assignment.status === query.status;
            })
        );
    });

    t.mock.method(SchoolClass, "findOne", (query) => {
        queryLog.schoolClassFindOne = query;
        return createQuery(
            dataset.schoolClasses.find(
                (schoolClass) =>
                    normalizeId(schoolClass._id) === normalizeId(query._id) &&
                    normalizeId(schoolClass.institutionId) === normalizeId(query.institutionId)
            ) || null
        );
    });

    t.mock.method(ClassLevel, "findOne", (query) => {
        queryLog.classLevelFindOne = query;
        return createQuery(
            dataset.classLevels.find(
                (classLevel) =>
                    normalizeId(classLevel._id) === normalizeId(query._id) &&
                    normalizeId(classLevel.institutionId) === normalizeId(query.institutionId)
            ) || null
        );
    });

    t.mock.method(Section, "find", (query) => {
        queryLog.sectionFind = query;
        return createQuery(
            dataset.sections.filter(
                (section) =>
                    normalizeId(section.institutionId) === normalizeId(query.institutionId) &&
                    normalizeId(section.schoolClassId) === normalizeId(query.schoolClassId) &&
                    normalizeId(section.semesterId) === normalizeId(query.semesterId)
            )
        );
    });

    t.mock.method(Subject, "find", (query) => {
        queryLog.subjectFind = query;
        const subjectIds = query._id?.$in || [];
        return createQuery(
            dataset.subjects.filter((subject) => {
                if (normalizeId(subject.institutionId) !== normalizeId(query.institutionId)) {
                    return false;
                }

                if (subjectIds.length && !includesId(subjectIds, subject._id)) {
                    return false;
                }

                if (query.classLevelId && normalizeId(subject.classLevelId) !== normalizeId(query.classLevelId)) {
                    return false;
                }

                if (query.departmentId !== undefined && subject.departmentId !== query.departmentId) {
                    return false;
                }

                if (query.status && subject.status !== query.status) {
                    return false;
                }

                return true;
            })
        );
    });

    t.mock.method(SchoolAcademicPolicy, "find", (query) => {
        queryLog.policyFind = query;
        return createQuery(
            dataset.policies.filter(
                (policy) =>
                    normalizeId(policy.institutionId) === normalizeId(query.institutionId) &&
                    policy.status === query.status &&
                    normalizeId(policy.appliesTo?.academicYearId) === normalizeId(query["appliesTo.academicYearId"])
            )
        );
    });

    t.mock.method(SchoolAcademicPolicy, "findOne", (query) => {
        queryLog.policyFindOne = query;
        return createQuery(
            dataset.policies.find((policy) => {
                const semesterIds = (policy.aggregationRules?.semesterWeights || []).map((row) => row.semesterId);
                return (
                    normalizeId(policy.institutionId) === normalizeId(query.institutionId) &&
                    policy.status === query.status &&
                    includesId(semesterIds, query["aggregationRules.semesterWeights.semesterId"]) &&
                    normalizeId(policy.appliesTo?.classLevelId) === normalizeId(query["appliesTo.classLevelId"]) &&
                    normalizeId(policy.appliesTo?.schoolStageId) === normalizeId(query["appliesTo.schoolStageId"])
                );
            }) || null
        );
    });
}

function mockOutcomeAndPromotion(t, { semesterMissing = false, yearlyMissing = false } = {}) {
    t.mock.method(schoolOutcomeService, "calculateSchoolSubjectSemesterOutcome", async ({ subjectId, semesterId }) => ({
        subjectId: normalizeId(subjectId),
        semesterId: normalizeId(semesterId),
        percentage: normalizeId(subjectId) === mathSubjectId ? 80 : 45,
        passed: !semesterMissing && normalizeId(subjectId) === mathSubjectId,
        failed: !semesterMissing && normalizeId(subjectId) !== mathSubjectId,
        passedBasedOnAvailableResults: normalizeId(subjectId) === mathSubjectId,
        failedBasedOnAvailableResults: normalizeId(subjectId) !== mathSubjectId,
        complete: !semesterMissing,
        hasMissingResults: semesterMissing,
        missingResults: semesterMissing
            ? [
                  {
                      code: "missing_assessment_result",
                      subjectId: normalizeId(subjectId),
                      semesterId: normalizeId(semesterId),
                      message: "Missing score",
                  },
              ]
            : [],
    }));

    t.mock.method(schoolOutcomeService, "calculateSchoolStudentYearOutcome", async ({ studentMembershipId }) => ({
        studentMembershipId: normalizeId(studentMembershipId),
        academicYearId,
        classLevelId,
        yearlyAveragePercentage: yearlyMissing ? 70 : 82,
        passedYearAverage: !yearlyMissing,
        passedYearAverageBasedOnAvailableResults: true,
        complete: !yearlyMissing,
        hasMissingResults: yearlyMissing,
        subjects: [
            {
                subjectId: mathSubjectId,
                academicYearId,
                yearlyPercentage: 85,
                passed: !yearlyMissing,
                failed: false,
                passedBasedOnAvailableResults: true,
                failedBasedOnAvailableResults: false,
                complete: !yearlyMissing,
                hasMissingResults: yearlyMissing,
                semesterBreakdown: [
                    {
                        subjectId: mathSubjectId,
                        semesterId: semesterOneId,
                        weight: 50,
                        percentage: 80,
                        passed: !yearlyMissing,
                        failed: false,
                        passedBasedOnAvailableResults: true,
                        failedBasedOnAvailableResults: false,
                        complete: !yearlyMissing,
                        hasMissingResults: yearlyMissing,
                        missingResults: yearlyMissing ? [{ code: "missing_assessment_result" }] : [],
                    },
                ],
                missingResults: yearlyMissing ? [{ code: "missing_assessment_result", subjectId: mathSubjectId }] : [],
            },
            {
                subjectId: arabicSubjectId,
                academicYearId,
                yearlyPercentage: 79,
                passed: true,
                failed: false,
                passedBasedOnAvailableResults: true,
                failedBasedOnAvailableResults: false,
                complete: true,
                hasMissingResults: false,
                semesterBreakdown: [],
                missingResults: [],
            },
        ],
        failedSubjectCount: 0,
        criticalFailedSubjects: [],
        missingResults: yearlyMissing ? [{ code: "missing_assessment_result", subjectId: mathSubjectId }] : [],
    }));

    t.mock.method(schoolPromotionService, "resolveSchoolPromotionDecision", ({ studentYearOutcome }) => ({
        decision: studentYearOutcome.complete ? "promoted" : "manual_review",
        allowedToPromote: studentYearOutcome.complete,
        reasonCodes: studentYearOutcome.complete ? [] : ["MISSING_REQUIRED_RESULTS"],
        reasons: [],
        warnings: studentYearOutcome.complete
            ? []
            : [{ code: "MISSING_REQUIRED_RESULTS", message: "Manual review required" }],
    }));
}

test("student semester report card assembles class, policy, subjects, and completion fields", async (t) => {
    const dataset = buildDataset();
    const queryLog = {};
    mockBaseModels(t, dataset, queryLog);
    mockOutcomeAndPromotion(t);

    const result = await getStudentSemesterReportCard({
        institutionId,
        studentMembershipId,
        semesterId: semesterOneId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.reportCard.student.fullName, "Mona Student");
    assert.equal(result.reportCard.semester.id, semesterOneId);
    assert.equal(result.reportCard.classLevel.name, "Grade 7");
    assert.equal(result.reportCard.schoolClass.name, "Grade 7 A");
    assert.equal(result.reportCard.policy.id, dataset.policies[0].id);
    assert.equal(result.reportCard.subjects.length, 2);
    assert.equal(result.reportCard.semesterAveragePercentage, 62.5);
    assert.equal(result.reportCard.complete, true);
    assert.equal(result.reportCard.hasMissingResults, false);
    assert.equal("gpa" in result.reportCard, false);
    assert.equal("creditHours" in result.reportCard, false);
    assert.equal(queryLog.assignmentFindOne.institutionId, institutionId);
    assert.equal(queryLog.assignmentFindOne.status, ClassStudentAssignment.schema.path("status").defaultValue);
    assert.equal(queryLog.policyFindOne.institutionId, institutionId);
    assert.equal(queryLog.subjectFind.status, Subject.schema.path("status").defaultValue);
});

test("student yearly report card includes promotion decision and critical subject flags", async (t) => {
    const dataset = buildDataset();
    mockBaseModels(t, dataset);
    mockOutcomeAndPromotion(t);
    t.mock.method(schoolAcademicPolicyService, "resolveSchoolAcademicPolicyForClassLevel", async () => ({
        policy: dataset.policies[0],
        resolutionLevel: "class_level",
    }));

    const result = await getStudentYearlyReportCard({
        institutionId,
        studentMembershipId,
        academicYearId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.reportCard.student.fullName, "Mona Student");
    assert.equal(result.reportCard.academicYear.id, academicYearId);
    assert.equal(result.reportCard.promotionDecision.decision, "promoted");
    assert.equal(result.reportCard.subjects.find((subject) => subject.subjectId === arabicSubjectId).isCritical, true);
    assert.equal(result.reportCard.complete, true);
    assert.equal(result.reportCard.hasMissingResults, false);
    assert.equal("gpa" in result.reportCard, false);
    assert.equal("creditHours" in result.reportCard, false);
});

test("class promotion summary uses promotion decision service for assigned students", async (t) => {
    const dataset = buildDataset();
    const queryLog = {};
    mockBaseModels(t, dataset, queryLog);
    mockOutcomeAndPromotion(t);
    t.mock.method(schoolAcademicPolicyService, "resolveSchoolAcademicPolicyForClassLevel", async () => ({
        policy: dataset.policies[0],
        resolutionLevel: "class_level",
    }));

    const result = await getClassPromotionSummary({
        institutionId,
        schoolClassId,
        academicYearId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.promotionSummary.schoolClass.id, schoolClassId);
    assert.equal(result.promotionSummary.policy.id, dataset.policies[0].id);
    assert.equal(result.promotionSummary.students.length, 2);
    assert.deepEqual(result.promotionSummary.students.map((student) => student.decision), ["promoted", "promoted"]);
    assert.ok(result.promotionSummary.students.every((student) => student.allowedToPromote === true));
    assert.equal(queryLog.assignmentFind.status, ClassStudentAssignment.schema.path("status").defaultValue);
});

test("missing active school policy returns a clear error", async (t) => {
    mockBaseModels(t, buildDataset({ policies: [] }));
    mockOutcomeAndPromotion(t);

    await assert.rejects(
        () =>
            getStudentYearlyReportCard({
                institutionId,
                studentMembershipId,
                academicYearId,
                actorUserId,
                actorMembership,
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Active school academic policy not found for this academic year");
            return true;
        }
    );
});

test("missing assessment results produce warnings and incomplete yearly report card", async (t) => {
    const dataset = buildDataset();
    mockBaseModels(t, dataset);
    mockOutcomeAndPromotion(t, { yearlyMissing: true });
    t.mock.method(schoolAcademicPolicyService, "resolveSchoolAcademicPolicyForClassLevel", async () => ({
        policy: dataset.policies[0],
        resolutionLevel: "class_level",
    }));

    const result = await getStudentYearlyReportCard({
        institutionId,
        studentMembershipId,
        academicYearId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.reportCard.complete, false);
    assert.equal(result.reportCard.hasMissingResults, true);
    assert.equal(result.reportCard.promotionDecision.decision, "manual_review");
    assert.equal(result.reportCard.subjects[0].passed, false);
    assert.ok(result.reportCard.warnings.some((warning) => warning.code === "missing_assessment_result"));
    assert.ok(result.reportCard.warnings.some((warning) => warning.code === "MISSING_REQUIRED_RESULTS"));
});

test("actor membership from another institution cannot access school report cards", async () => {
    await assert.rejects(
        () =>
            getStudentSemesterReportCard({
                institutionId,
                studentMembershipId,
                semesterId: semesterOneId,
                actorUserId,
                actorMembership: {
                    _id: "507f1f77bcf86cd799439013",
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

test("actor membership without institutionId cannot access school report cards", async () => {
    await assert.rejects(
        () =>
            getStudentSemesterReportCard({
                institutionId,
                studentMembershipId,
                semesterId: semesterOneId,
                actorUserId,
                actorMembership: {
                    _id: "507f1f77bcf86cd799439013",
                    role: "admin",
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Institution access denied");
            return true;
        }
    );
});

test("unsupported roles cannot access school report cards", async () => {
    await assert.rejects(
        () =>
            getStudentSemesterReportCard({
                institutionId,
                studentMembershipId,
                semesterId: semesterOneId,
                actorUserId,
                actorMembership: {
                    _id: "507f1f77bcf86cd799439013",
                    role: "instructor",
                    institutionId,
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Permission denied");
            return true;
        }
    );

    await assert.rejects(
        () =>
            getStudentSemesterReportCard({
                institutionId,
                studentMembershipId,
                semesterId: semesterOneId,
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
