const test = require("node:test");
const assert = require("node:assert/strict");

const Institution = require("../src/models/Institution");
const ClassLevel = require("../src/models/ClassLevel");
const ClassStudentAssignment = require("../src/models/ClassStudentAssignment");
const SchoolAcademicPolicy = require("../src/models/SchoolAcademicPolicy");
const SchoolClass = require("../src/models/SchoolClass");
const SchoolFinalOutcome = require("../src/models/SchoolFinalOutcome");
const schoolAcademicPolicyService = require("../src/services/schoolAcademicPolicyService");
const schoolOutcomeService = require("../src/services/schoolOutcomeService");
const schoolPromotionService = require("../src/services/schoolPromotionService");
const {
    MANUAL_OVERRIDE_REASON_CODE,
    finalizeSchoolStudentYearOutcome,
    overrideSchoolFinalOutcome,
    getSchoolFinalOutcomeForStudentYear,
} = require("../src/services/schoolFinalOutcomeService");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439099";
const actorUserId = "507f1f77bcf86cd799439012";
const actorMembership = {
    _id: "507f1f77bcf86cd799439013",
    role: "admin",
    institutionId,
};
const studentMembershipId = "507f1f77bcf86cd799439021";
const academicYearId = "507f1f77bcf86cd799439031";
const classLevelId = "507f1f77bcf86cd799439041";
const schoolClassId = "507f1f77bcf86cd799439051";
const semesterOneId = "507f1f77bcf86cd799439061";
const semesterTwoId = "507f1f77bcf86cd799439062";
const policyId = "507f1f77bcf86cd799439081";
const finalOutcomeId = "507f1f77bcf86cd799439091";

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
        id: policyId,
        _id: policyId,
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
            failIfAnyCriticalSubjectFailed: false,
            criticalSubjectRules: [],
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

function buildStudentYearOutcome(overrides = {}) {
    return {
        studentMembershipId,
        academicYearId,
        classLevelId,
        yearlyAveragePercentage: 82,
        passedYearAverage: true,
        passedYearAverageBasedOnAvailableResults: true,
        complete: true,
        hasMissingResults: false,
        subjects: [],
        failedSubjectCount: 0,
        criticalFailedSubjects: [],
        missingResults: [],
        ...overrides,
    };
}

function buildPromotionDecision(overrides = {}) {
    return {
        decision: "promoted",
        allowedToPromote: true,
        reasonCodes: [],
        reasons: [],
        warnings: [],
        ...overrides,
    };
}

function buildFinalOutcomeRecord(overrides = {}) {
    return {
        _id: finalOutcomeId,
        institutionId,
        academicYearId,
        classLevelId,
        schoolClassId,
        studentMembershipId,
        policy: {
            policyId,
            policyName: "School Promotion Policy",
            resolutionLevel: "class_level",
        },
        outcomeSnapshot: {
            yearlyAveragePercentage: 82,
            failedSubjectCount: 0,
            criticalFailedSubjects: [],
            complete: true,
            hasMissingResults: false,
            missingResults: [],
        },
        calculatedDecision: "promoted",
        calculatedReasons: [],
        calculatedReasonCodes: [],
        calculatedWarnings: [],
        finalDecision: "promoted",
        finalReasons: [],
        finalReasonCodes: [],
        finalWarnings: [],
        override: {
            isOverridden: false,
            overriddenBy: null,
            overriddenAt: null,
            reason: null,
        },
        status: "finalized",
        finalizedBy: actorUserId,
        finalizedAt: new Date("2026-04-29T10:00:00.000Z"),
        audit: {
            createdBy: actorUserId,
            updatedBy: actorUserId,
        },
        createdAt: new Date("2026-04-29T10:00:00.000Z"),
        updatedAt: new Date("2026-04-29T10:00:00.000Z"),
        async save() {
            return this;
        },
        ...overrides,
    };
}

function buildDataset(overrides = {}) {
    return {
        institution: { _id: institutionId, type: "school" },
        policies: [buildPolicy()],
        assignments: [
            {
                _id: "507f1f77bcf86cd7994390a1",
                institutionId,
                semesterId: semesterOneId,
                classId: schoolClassId,
                studentMemberId: studentMembershipId,
                status: "assigned",
            },
            {
                _id: "507f1f77bcf86cd7994390a2",
                institutionId,
                semesterId: semesterTwoId,
                classId: schoolClassId,
                studentMemberId: studentMembershipId,
                status: "assigned",
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
        existingFinalOutcome: null,
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

    t.mock.method(ClassStudentAssignment, "find", (query) => {
        queryLog.assignmentFind = query;
        const semesterIds = query.semesterId?.$in || [];
        return createQuery(
            dataset.assignments.filter(
                (assignment) =>
                    normalizeId(assignment.institutionId) === normalizeId(query.institutionId) &&
                    normalizeId(assignment.studentMemberId) === normalizeId(query.studentMemberId) &&
                    includesId(semesterIds, assignment.semesterId) &&
                    assignment.status === query.status
            )
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

    t.mock.method(SchoolFinalOutcome, "findOne", (query) => {
        queryLog.finalOutcomeFindOne = query;
        if (query._id) {
            const outcome = dataset.existingFinalOutcome;
            return createQuery(
                outcome &&
                    normalizeId(outcome._id) === normalizeId(query._id) &&
                    normalizeId(outcome.institutionId) === normalizeId(query.institutionId)
                    ? outcome
                    : null
            );
        }

        const outcome = dataset.existingFinalOutcome;
        if (
            outcome &&
            normalizeId(outcome.institutionId) === normalizeId(query.institutionId) &&
            normalizeId(outcome.academicYearId) === normalizeId(query.academicYearId) &&
            normalizeId(outcome.studentMembershipId) === normalizeId(query.studentMembershipId) &&
            outcome.status !== "cancelled"
        ) {
            return createQuery(outcome);
        }

        return createQuery(null);
    });
}

function mockPolicyOutcomePromotion(t, {
    policy = buildPolicy(),
    studentYearOutcome = buildStudentYearOutcome(),
    promotionDecision = buildPromotionDecision(),
} = {}) {
    t.mock.method(schoolAcademicPolicyService, "resolveSchoolAcademicPolicyForClassLevel", async () => ({
        policy,
        resolutionLevel: "class_level",
    }));
    t.mock.method(schoolOutcomeService, "calculateSchoolStudentYearOutcome", async () => studentYearOutcome);
    t.mock.method(schoolPromotionService, "resolveSchoolPromotionDecision", () => promotionDecision);
}

test("finalizes calculated promoted decision and stores the snapshot", async (t) => {
    const dataset = buildDataset();
    const queryLog = {};
    let createdPayload = null;
    mockBaseModels(t, dataset, queryLog);
    mockPolicyOutcomePromotion(t);
    t.mock.method(SchoolFinalOutcome, "create", async (payload) => {
        createdPayload = payload;
        return buildFinalOutcomeRecord({
            _id: "507f1f77bcf86cd7994390b1",
            ...payload,
        });
    });

    const result = await finalizeSchoolStudentYearOutcome({
        institutionId,
        studentMembershipId,
        academicYearId,
        actorUserId,
        actorMembership,
        payload: {},
    });

    assert.equal(result.schoolFinalOutcome.calculatedDecision, "promoted");
    assert.equal(result.schoolFinalOutcome.finalDecision, "promoted");
    assert.equal(result.schoolFinalOutcome.status, "finalized");
    assert.equal(result.schoolFinalOutcome.policy.policyId, policyId);
    assert.equal(result.schoolFinalOutcome.outcomeSnapshot.yearlyAveragePercentage, 82);
    assert.equal(result.schoolFinalOutcome.audit.createdBy, actorUserId);
    assert.equal(result.schoolFinalOutcome.audit.updatedBy, actorUserId);
    assert.equal(createdPayload.institutionId, institutionId);
    assert.equal(queryLog.finalOutcomeFindOne.institutionId, institutionId);
    assert.equal(queryLog.assignmentFind.status, ClassStudentAssignment.schema.path("status").defaultValue);
    assert.equal("gpa" in result.schoolFinalOutcome, false);
    assert.equal("creditHours" in result.schoolFinalOutcome, false);
});

test("finalizes calculated repeat_year decision", async (t) => {
    mockBaseModels(t, buildDataset());
    mockPolicyOutcomePromotion(t, {
        studentYearOutcome: buildStudentYearOutcome({
            yearlyAveragePercentage: 45,
            failedSubjectCount: 3,
        }),
        promotionDecision: buildPromotionDecision({
            decision: "repeat_year",
            allowedToPromote: false,
            reasonCodes: ["FAILED_SUBJECT_COUNT_LIMIT_REACHED"],
            reasons: [{ code: "FAILED_SUBJECT_COUNT_LIMIT_REACHED", failedSubjectCount: 3 }],
        }),
    });
    t.mock.method(SchoolFinalOutcome, "create", async (payload) =>
        buildFinalOutcomeRecord({
            _id: "507f1f77bcf86cd7994390b2",
            ...payload,
        })
    );

    const result = await finalizeSchoolStudentYearOutcome({
        institutionId,
        studentMembershipId,
        academicYearId,
        actorUserId,
        actorMembership,
        payload: {},
    });

    assert.equal(result.schoolFinalOutcome.calculatedDecision, "repeat_year");
    assert.equal(result.schoolFinalOutcome.finalDecision, "repeat_year");
    assert.deepEqual(result.schoolFinalOutcome.finalReasonCodes, ["FAILED_SUBJECT_COUNT_LIMIT_REACHED"]);
});

test("finalize with override reason stores calculated and final decisions separately", async (t) => {
    mockBaseModels(t, buildDataset());
    mockPolicyOutcomePromotion(t);
    t.mock.method(SchoolFinalOutcome, "create", async (payload) =>
        buildFinalOutcomeRecord({
            _id: "507f1f77bcf86cd7994390b3",
            ...payload,
        })
    );

    const result = await finalizeSchoolStudentYearOutcome({
        institutionId,
        studentMembershipId,
        academicYearId,
        actorUserId,
        actorMembership,
        payload: {
            override: {
                finalDecision: "manual_review",
                reason: "Incomplete paperwork needs admin review.",
            },
        },
    });

    assert.equal(result.schoolFinalOutcome.calculatedDecision, "promoted");
    assert.equal(result.schoolFinalOutcome.finalDecision, "manual_review");
    assert.equal(result.schoolFinalOutcome.override.isOverridden, true);
    assert.equal(result.schoolFinalOutcome.override.reason, "Incomplete paperwork needs admin review.");
    assert.ok(result.schoolFinalOutcome.finalReasonCodes.includes(MANUAL_OVERRIDE_REASON_CODE));
});

test("finalize override without reason is rejected", async () => {
    await assert.rejects(
        () =>
            finalizeSchoolStudentYearOutcome({
                institutionId,
                studentMembershipId,
                academicYearId,
                actorUserId,
                actorMembership,
                payload: {
                    override: {
                        finalDecision: "manual_review",
                    },
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "override.reason is required");
            return true;
        }
    );
});

test("duplicate non-cancelled final outcome is rejected", async (t) => {
    mockBaseModels(t, buildDataset({ existingFinalOutcome: buildFinalOutcomeRecord() }));

    await assert.rejects(
        () =>
            finalizeSchoolStudentYearOutcome({
                institutionId,
                studentMembershipId,
                academicYearId,
                actorUserId,
                actorMembership,
                payload: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(
                error.message,
                "A non-cancelled school final outcome already exists for this student and academic year"
            );
            return true;
        }
    );
});

test("duplicate finalized outcome from unique index is returned as conflict", async (t) => {
    mockBaseModels(t, buildDataset());
    mockPolicyOutcomePromotion(t);
    t.mock.method(SchoolFinalOutcome, "create", async () => {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
    });

    await assert.rejects(
        () =>
            finalizeSchoolStudentYearOutcome({
                institutionId,
                studentMembershipId,
                academicYearId,
                actorUserId,
                actorMembership,
                payload: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(
                error.message,
                "A finalized school final outcome already exists for this student and academic year"
            );
            return true;
        }
    );
});

test("later override with reason succeeds without erasing calculated snapshot", async (t) => {
    const existingOutcome = buildFinalOutcomeRecord();
    mockBaseModels(t, buildDataset({ existingFinalOutcome: existingOutcome }));

    const result = await overrideSchoolFinalOutcome({
        institutionId,
        outcomeId: finalOutcomeId,
        actorUserId,
        actorMembership,
        payload: {
            finalDecision: "conditional_promotion",
            reason: "Committee approved conditional promotion.",
        },
    });

    assert.equal(result.schoolFinalOutcome.calculatedDecision, "promoted");
    assert.equal(result.schoolFinalOutcome.finalDecision, "conditional_promotion");
    assert.equal(result.schoolFinalOutcome.outcomeSnapshot.yearlyAveragePercentage, 82);
    assert.equal(result.schoolFinalOutcome.override.isOverridden, true);
    assert.equal(result.schoolFinalOutcome.override.reason, "Committee approved conditional promotion.");
    assert.ok(result.schoolFinalOutcome.finalReasonCodes.includes(MANUAL_OVERRIDE_REASON_CODE));
    assert.equal(result.schoolFinalOutcome.audit.updatedBy, actorUserId);
});

test("later override without reason is rejected", async () => {
    await assert.rejects(
        () =>
            overrideSchoolFinalOutcome({
                institutionId,
                outcomeId: finalOutcomeId,
                actorUserId,
                actorMembership,
                payload: {
                    finalDecision: "manual_review",
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "reason is required");
            return true;
        }
    );
});

test("invalid finalDecision is rejected", async () => {
    await assert.rejects(
        () =>
            overrideSchoolFinalOutcome({
                institutionId,
                outcomeId: finalOutcomeId,
                actorUserId,
                actorMembership,
                payload: {
                    finalDecision: "warning",
                    reason: "Warnings are not final outcomes.",
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "finalDecision is invalid");
            return true;
        }
    );
});

test("cancelled outcome cannot be overridden", async (t) => {
    mockBaseModels(t, buildDataset({ existingFinalOutcome: buildFinalOutcomeRecord({ status: "cancelled" }) }));

    await assert.rejects(
        () =>
            overrideSchoolFinalOutcome({
                institutionId,
                outcomeId: finalOutcomeId,
                actorUserId,
                actorMembership,
                payload: {
                    finalDecision: "manual_review",
                    reason: "Late review.",
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Cancelled school final outcomes cannot be overridden");
            return true;
        }
    );
});

test("get final outcome is tenant-scoped", async (t) => {
    const queryLog = {};
    mockBaseModels(t, buildDataset({ existingFinalOutcome: buildFinalOutcomeRecord() }), queryLog);

    const result = await getSchoolFinalOutcomeForStudentYear({
        institutionId,
        studentMembershipId,
        academicYearId,
        actorUserId,
        actorMembership,
    });

    assert.equal(result.schoolFinalOutcome.id, finalOutcomeId);
    assert.equal(queryLog.finalOutcomeFindOne.institutionId, institutionId);
    assert.equal(queryLog.finalOutcomeFindOne.studentMembershipId, studentMembershipId);
    assert.equal(queryLog.finalOutcomeFindOne.academicYearId, academicYearId);
});

test("actor membership from another institution cannot access final outcomes", async () => {
    await assert.rejects(
        () =>
            getSchoolFinalOutcomeForStudentYear({
                institutionId,
                studentMembershipId,
                academicYearId,
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

test("actor membership without institutionId cannot access final outcomes", async () => {
    await assert.rejects(
        () =>
            getSchoolFinalOutcomeForStudentYear({
                institutionId,
                studentMembershipId,
                academicYearId,
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

test("school final outcome reads reject unsupported accessMode values", async () => {
    await assert.rejects(
        () =>
            getSchoolFinalOutcomeForStudentYear({
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

test("unsupported roles cannot finalize final outcomes", async () => {
    await assert.rejects(
        () =>
            finalizeSchoolStudentYearOutcome({
                institutionId,
                studentMembershipId,
                academicYearId,
                actorUserId,
                actorMembership: {
                    _id: studentMembershipId,
                    role: "student",
                    institutionId,
                },
                payload: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.equal(error.message, "Permission denied");
            return true;
        }
    );
});

test("SchoolFinalOutcome has a finalized-only unique partial index", () => {
    const indexes = SchoolFinalOutcome.schema.indexes();
    const finalizedUniqueIndex = indexes.find(([fields, options]) => {
        return (
            fields.institutionId === 1 &&
            fields.academicYearId === 1 &&
            fields.studentMembershipId === 1 &&
            fields.status === 1 &&
            options?.unique === true &&
            options?.partialFilterExpression?.status === "finalized"
        );
    });

    assert.ok(finalizedUniqueIndex);
});
