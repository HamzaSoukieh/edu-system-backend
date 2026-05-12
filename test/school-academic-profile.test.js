const test = require("node:test");
const assert = require("node:assert/strict");

const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");
const schoolFinalOutcomeService = require("../src/services/schoolFinalOutcomeService");
const schoolReportCardService = require("../src/services/schoolReportCardService");
const { buildSchoolAcademicProfile } = require("../src/services/schoolAcademicProfileService");

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
const suspendedStudentMembershipId = "507f1f77bcf86cd799439024";
const academicYearId = "507f1f77bcf86cd799439031";
const semesterId = "507f1f77bcf86cd799439041";
const finalOutcomeId = "507f1f77bcf86cd799439051";

function createQuery(result) {
    return {
        select() {
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

function collectForbiddenKeys(value, forbiddenKeys, found = []) {
    if (!value || typeof value !== "object") {
        return found;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => collectForbiddenKeys(item, forbiddenKeys, found));
        return found;
    }

    Object.keys(value).forEach((key) => {
        if (forbiddenKeys.includes(key)) {
            found.push(key);
        }

        collectForbiddenKeys(value[key], forbiddenKeys, found);
    });

    return found;
}

function buildYearlyReportCard(overrides = {}) {
    return {
        student: {
            membershipId: studentMembershipId,
            fullName: "Mona Student",
            email: "mona@example.com",
            status: "active",
        },
        academicYear: { id: academicYearId },
        yearlyAveragePercentage: 89.5,
        failedSubjectCount: 0,
        criticalFailedSubjects: [],
        promotionDecision: {
            decision: "promoted",
            allowedToPromote: true,
            reasonCodes: [],
            reasons: [],
            warnings: [],
        },
        complete: true,
        hasMissingResults: false,
        warnings: [],
        subjects: [],
        ...overrides,
    };
}

function buildSemesterReportCard(overrides = {}) {
    return {
        student: {
            membershipId: studentMembershipId,
            fullName: "Mona Student",
            email: "mona@example.com",
            status: "active",
        },
        semester: { id: semesterId, name: "Semester 1" },
        semesterAveragePercentage: 88,
        complete: true,
        hasMissingResults: false,
        warnings: [],
        subjects: [],
        ...overrides,
    };
}

function buildFinalOutcome(overrides = {}) {
    return {
        id: finalOutcomeId,
        institutionId,
        academicYearId,
        classLevelId: "507f1f77bcf86cd799439061",
        schoolClassId: "507f1f77bcf86cd799439071",
        studentMembershipId,
        policy: {
            policyId: "507f1f77bcf86cd799439081",
            policyName: "School Promotion Policy",
            resolutionLevel: "class_level",
        },
        finalDecision: "promoted",
        finalReasonCodes: [],
        finalReasons: [],
        finalWarnings: [],
        calculatedDecision: "promoted",
        calculatedReasonCodes: [],
        calculatedReasons: [],
        calculatedWarnings: [],
        override: {
            isOverridden: false,
            overriddenBy: null,
            overriddenAt: null,
            reason: null,
        },
        status: "finalized",
        finalizedBy: actorUserId,
        finalizedAt: new Date("2026-04-30T10:00:00.000Z"),
        audit: {
            createdBy: actorUserId,
            updatedBy: actorUserId,
        },
        createdAt: new Date("2026-04-30T10:00:00.000Z"),
        updatedAt: new Date("2026-04-30T10:00:00.000Z"),
        outcomeSnapshot: {
            yearlyAveragePercentage: 89.5,
            failedSubjectCount: 0,
            criticalFailedSubjects: [],
            complete: true,
            hasMissingResults: false,
            missingResults: [],
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
                institutionId,
                role: "student",
                status: "active",
            },
            {
                _id: instructorMembershipId,
                institutionId,
                role: "instructor",
                status: "active",
            },
            {
                _id: suspendedStudentMembershipId,
                institutionId,
                role: "student",
                status: "suspended",
            },
            {
                _id: "507f1f77bcf86cd799439023",
                institutionId: otherInstitutionId,
                role: "student",
                status: "active",
            },
        ],
        yearlyReportCard: buildYearlyReportCard(),
        semesterReportCard: buildSemesterReportCard(),
        finalOutcome: null,
        finalOutcomeError: (() => {
            const error = new Error("School final outcome not found");
            error.statusCode = 404;
            return error;
        })(),
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

    t.mock.method(schoolReportCardService, "getStudentYearlyReportCard", async (args) => {
        queryLog.yearlyReportCardArgs = args;
        return { reportCard: dataset.yearlyReportCard };
    });

    t.mock.method(schoolReportCardService, "getStudentSemesterReportCard", async (args) => {
        queryLog.semesterReportCardArgs = args;
        return { reportCard: dataset.semesterReportCard };
    });

    t.mock.method(schoolFinalOutcomeService, "getSchoolFinalOutcomeForStudentYear", async (args) => {
        queryLog.finalOutcomeArgs = args;
        if (dataset.finalOutcome) {
            return { schoolFinalOutcome: dataset.finalOutcome };
        }

        throw dataset.finalOutcomeError;
    });
}

test("school academic profile provider returns yearly summary", async (t) => {
    const queryLog = {};
    mockProviderDependencies(t, buildDataset(), queryLog);

    const result = await buildSchoolAcademicProfile({
        institutionId,
        studentMembershipId,
        academicYearId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.institutionType, "school");
    assert.deepEqual(result.student, {
        studentMembershipId,
        name: "Mona Student",
        email: "mona@example.com",
    });
    assert.equal(result.academicYear.id, academicYearId);
    assert.equal(result.summary.yearlyAveragePercentage, 89.5);
    assert.equal(result.summary.failedSubjectCount, 0);
    assert.deepEqual(result.summary.criticalFailedSubjects, []);
    assert.equal(result.summary.decision, "promoted");
    assert.equal(result.summary.allowedToPromote, true);
    assert.equal(result.summary.complete, true);
    assert.equal(result.summary.hasMissingResults, false);
    assert.equal(result.reportCards.yearly.yearlyAveragePercentage, 89.5);
    assert.equal(result.reportCards.semester, null);
    assert.equal(result.finalOutcome, null);
    assert.equal("academicStanding" in result, false);
    assert.equal("repeatPolicy" in result, false);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.excluded, []);
    assert.equal(queryLog.membershipFindOne.institutionId, institutionId);
    assert.equal(queryLog.yearlyReportCardArgs.institutionId, institutionId);
    assert.equal(queryLog.finalOutcomeArgs.academicYearId, academicYearId);
});

test("school academic profile requires academicYearId", async () => {
    await assert.rejects(
        () =>
            buildSchoolAcademicProfile({
                institutionId,
                studentMembershipId,
                actorUserId,
                actorMembership,
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "academicYearId is required");
            return true;
        }
    );
});

test("school academic profile rejects invalid ids clearly", async () => {
    await assert.rejects(
        () =>
            buildSchoolAcademicProfile({
                institutionId,
                studentMembershipId: "not-an-id",
                academicYearId,
                actorUserId,
                actorMembership,
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "studentMembershipId is invalid");
            return true;
        }
    );

    await assert.rejects(
        () =>
            buildSchoolAcademicProfile({
                institutionId,
                studentMembershipId,
                academicYearId: "not-an-id",
                actorUserId,
                actorMembership,
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "academicYearId is invalid");
            return true;
        }
    );
});

test("school academic profile finalOutcome is null when not finalized", async (t) => {
    const error = new Error("Not found");
    error.statusCode = 404;
    mockProviderDependencies(t, buildDataset({ finalOutcomeError: error }));

    const result = await buildSchoolAcademicProfile({
        institutionId,
        studentMembershipId,
        academicYearId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.finalOutcome, null);
});

test("school academic profile includes finalOutcome when finalized", async (t) => {
    mockProviderDependencies(t, buildDataset({ finalOutcome: buildFinalOutcome() }));

    const result = await buildSchoolAcademicProfile({
        institutionId,
        studentMembershipId,
        academicYearId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.finalOutcome.id, finalOutcomeId);
    assert.equal(result.finalOutcome.finalDecision, "promoted");
    assert.equal(result.finalOutcome.calculatedDecision, "promoted");
    assert.equal(result.finalOutcome.status, "finalized");
    assert.equal(result.finalOutcome.outcomeSnapshot.yearlyAveragePercentage, 89.5);
    assert.deepEqual(result.finalOutcome.override, {
        isOverridden: false,
        reason: null,
        overriddenAt: null,
    });
    assert.ok(result.finalOutcome.finalizedAt);
    assert.equal("institutionId" in result.finalOutcome, false);
    assert.equal("studentMembershipId" in result.finalOutcome, false);
    assert.equal("classLevelId" in result.finalOutcome, false);
    assert.equal("schoolClassId" in result.finalOutcome, false);
    assert.equal("policy" in result.finalOutcome, false);
    assert.equal("finalizedBy" in result.finalOutcome, false);
    assert.equal("audit" in result.finalOutcome, false);
    assert.equal("createdAt" in result.finalOutcome, false);
    assert.equal("updatedAt" in result.finalOutcome, false);
});

test("school academic profile sanitizes nested finalOutcome reasons and warnings", async (t) => {
    mockProviderDependencies(
        t,
        buildDataset({
            finalOutcome: buildFinalOutcome({
                override: {
                    isOverridden: true,
                    overriddenBy: actorUserId,
                    overriddenAt: new Date("2026-05-01T10:00:00.000Z"),
                    reason: "Approved by academic office",
                },
                calculatedReasons: [
                    {
                        code: "MISSING_REQUIRED_RESULTS",
                        message: "Manual review required",
                        actorUserId,
                        institutionId,
                        audit: { createdBy: actorUserId },
                    },
                ],
                calculatedWarnings: [
                    {
                        reasonCode: "missing_assessment_result",
                        message: "Missing score",
                        finalizedBy: actorUserId,
                    },
                ],
                finalReasons: [
                    {
                        code: "MANUAL_OVERRIDE",
                        message: "Final school outcome decision was manually overridden.",
                        reason: "Approved by academic office",
                        actorUserId,
                        institutionId,
                        policy: { policyName: "Internal policy snapshot" },
                    },
                ],
                finalWarnings: [
                    {
                        code: "FINAL_WARNING",
                        message: "Final warning",
                        actorUserId,
                        audit: { updatedBy: actorUserId },
                    },
                ],
            }),
        })
    );

    const result = await buildSchoolAcademicProfile({
        institutionId,
        studentMembershipId,
        academicYearId,
        actorUserId,
        actorMembership,
    });

    assert.deepEqual(result.finalOutcome.finalReasons, [
        {
            code: "MANUAL_OVERRIDE",
            message: "Final school outcome decision was manually overridden.",
            reason: "Approved by academic office",
        },
    ]);
    assert.deepEqual(result.finalOutcome.calculatedReasons, [
        {
            code: "MISSING_REQUIRED_RESULTS",
            message: "Manual review required",
        },
    ]);
    assert.deepEqual(result.finalOutcome.calculatedWarnings, [
        {
            reasonCode: "missing_assessment_result",
            message: "Missing score",
        },
    ]);
    assert.deepEqual(result.finalOutcome.finalWarnings, [
        {
            code: "FINAL_WARNING",
            message: "Final warning",
        },
    ]);
    assert.deepEqual(
        collectForbiddenKeys(result.finalOutcome, [
            "actorUserId",
            "institutionId",
            "studentMembershipId",
            "finalizedBy",
            "overriddenBy",
            "audit",
            "policy",
            "createdAt",
            "updatedAt",
        ]),
        []
    );
});

test("school academic profile includes semester report card when semesterId is provided", async (t) => {
    const queryLog = {};
    mockProviderDependencies(t, buildDataset(), queryLog);

    const result = await buildSchoolAcademicProfile({
        institutionId,
        studentMembershipId,
        academicYearId,
        semesterId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.reportCards.semester.semester.id, semesterId);
    assert.equal(result.reportCards.semester.semesterAveragePercentage, 88);
    assert.equal(queryLog.semesterReportCardArgs.semesterId, semesterId);
});

test("school academic profile includes semester-level explanations when semesterId is provided", async (t) => {
    mockProviderDependencies(
        t,
        buildDataset({
            semesterReportCard: buildSemesterReportCard({
                complete: false,
                hasMissingResults: true,
                warnings: [
                    {
                        code: "missing_assessment_result",
                        message: "Semester score is missing",
                        semesterId,
                        subjectId: "507f1f77bcf86cd799439091",
                    },
                ],
            }),
        })
    );

    const result = await buildSchoolAcademicProfile({
        institutionId,
        studentMembershipId,
        academicYearId,
        semesterId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.reportCards.semester.complete, false);
    assert.equal(result.reportCards.semester.hasMissingResults, true);
    assert.deepEqual(result.warnings, [
        {
            code: "missing_assessment_result",
            message: "Semester score is missing",
            semesterId,
            subjectId: "507f1f77bcf86cd799439091",
        },
    ]);
    assert.deepEqual(result.excluded, [
        {
            reasonCode: "missing_assessment_result",
            message: "Semester score is missing",
            semesterId,
            subjectId: "507f1f77bcf86cd799439091",
        },
        {
            reasonCode: "missing_semester_result",
            message: "The semester report card has missing or incomplete results.",
            semesterId,
        },
    ]);
});

test("school academic profile self access passes self mode to nested school reads", async (t) => {
    const queryLog = {};
    mockProviderDependencies(t, buildDataset({ finalOutcome: buildFinalOutcome() }), queryLog);

    const result = await buildSchoolAcademicProfile({
        institutionId,
        studentMembershipId,
        academicYearId,
        semesterId,
        actorUserId,
        actorMembership: {
            _id: studentMembershipId,
            role: "student",
            institutionId,
            status: "active",
        },
        accessMode: "self",
    });

    assert.equal(queryLog.yearlyReportCardArgs.accessMode, "self");
    assert.equal(queryLog.semesterReportCardArgs.accessMode, "self");
    assert.equal(queryLog.finalOutcomeArgs.accessMode, "self");
    assert.equal(result.finalOutcome.finalDecision, "promoted");
    assert.equal("audit" in result.finalOutcome, false);
    assert.equal("finalizedBy" in result.finalOutcome, false);
});

test("school academic profile preserves completion, warning, and decision details", async (t) => {
    mockProviderDependencies(
        t,
        buildDataset({
            yearlyReportCard: buildYearlyReportCard({
                yearlyAveragePercentage: 72,
                complete: false,
                hasMissingResults: true,
                promotionDecision: {
                    decision: "manual_review",
                    allowedToPromote: false,
                    reasonCodes: ["MISSING_REQUIRED_RESULTS"],
                    reasons: [{ code: "MISSING_REQUIRED_RESULTS", missingResultCount: 1 }],
                    warnings: [{ code: "MISSING_REQUIRED_RESULTS", message: "Manual review required" }],
                },
                warnings: [{ code: "missing_assessment_result", message: "Missing score" }],
            }),
        })
    );

    const result = await buildSchoolAcademicProfile({
        institutionId,
        studentMembershipId,
        academicYearId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.summary.complete, false);
    assert.equal(result.summary.hasMissingResults, true);
    assert.equal(result.summary.decision, "manual_review");
    assert.equal(result.summary.allowedToPromote, false);
    assert.deepEqual(result.summary.reasonCodes, ["MISSING_REQUIRED_RESULTS"]);
    assert.deepEqual(result.summary.reasons, [{ code: "MISSING_REQUIRED_RESULTS", missingResultCount: 1 }]);
    assert.deepEqual(result.warnings, [{ code: "missing_assessment_result", message: "Missing score" }]);
    assert.deepEqual(result.excluded, [
        {
            reasonCode: "missing_assessment_result",
            message: "Missing score",
        },
        {
            reasonCode: "incomplete_school_year_outcome",
            message: "The school year outcome has missing or incomplete results.",
            academicYearId,
        },
    ]);
    assert.deepEqual(result.reportCards.yearly.promotionDecision.warnings, [
        { code: "MISSING_REQUIRED_RESULTS", message: "Manual review required" },
    ]);
});

test("school academic profile rejects cross-tenant studentMembershipId", async (t) => {
    mockProviderDependencies(t, buildDataset());

    await assert.rejects(
        () =>
            buildSchoolAcademicProfile({
                institutionId,
                studentMembershipId: "507f1f77bcf86cd799439023",
                academicYearId,
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

test("school academic profile rejects non-student target membership", async (t) => {
    mockProviderDependencies(t, buildDataset());

    await assert.rejects(
        () =>
            buildSchoolAcademicProfile({
                institutionId,
                studentMembershipId: instructorMembershipId,
                academicYearId,
                actorUserId,
                actorMembership,
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "studentMembershipId must reference a student membership");
            return true;
        }
    );
});

test("school academic profile rejects non-active target student membership", async (t) => {
    mockProviderDependencies(t, buildDataset());

    await assert.rejects(
        () =>
            buildSchoolAcademicProfile({
                institutionId,
                studentMembershipId: suspendedStudentMembershipId,
                academicYearId,
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

test("school academic profile rejects unsupported accessMode values", async () => {
    await assert.rejects(
        () =>
            buildSchoolAcademicProfile({
                institutionId,
                studentMembershipId,
                academicYearId,
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

test("school academic profile is school-only and default staff mode rejects students", async (t) => {
    mockProviderDependencies(t, buildDataset({ institution: { _id: institutionId, type: "university" } }));

    await assert.rejects(
        () =>
            buildSchoolAcademicProfile({
                institutionId,
                studentMembershipId,
                academicYearId,
                actorUserId,
                actorMembership,
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Class levels are only available for school institutions");
            return true;
        }
    );

    await assert.rejects(
        () =>
            buildSchoolAcademicProfile({
                institutionId,
                studentMembershipId,
                academicYearId,
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
