const test = require("node:test");
const assert = require("node:assert/strict");

const Institution = require("../src/models/Institution");
const AcademicYear = require("../src/models/AcademicYear");
const ClassLevel = require("../src/models/ClassLevel");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");
const SchoolAcademicPolicy = require("../src/models/SchoolAcademicPolicy");
const {
    validateCreateSchoolAcademicPolicyInput,
    createSchoolAcademicPolicy,
    listSchoolAcademicPolicies,
    getSchoolAcademicPolicyById,
    updateSchoolAcademicPolicy,
    archiveSchoolAcademicPolicy,
    resolveSchoolAcademicPolicyForClassLevel,
} = require("../src/services/schoolAcademicPolicyService");

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

function buildInstitution(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439011",
        type: "school",
        ...overrides,
    };
}

function buildClassLevel(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439021",
        institutionId: "507f1f77bcf86cd799439011",
        status: "active",
        ...overrides,
    };
}

function buildSemester(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439031",
        institutionId: "507f1f77bcf86cd799439011",
        ...overrides,
    };
}

function buildAcademicYear(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439051",
        institutionId: "507f1f77bcf86cd799439011",
        status: "active",
        ...overrides,
    };
}

function buildSubject(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439041",
        institutionId: "507f1f77bcf86cd799439011",
        classLevelId: "507f1f77bcf86cd799439021",
        departmentId: null,
        ...overrides,
    };
}

function buildPolicyPayload(overrides = {}) {
    return {
        name: "School Promotion Policy 2026",
        status: "active",
        appliesTo: {
            academicYearId: "507f1f77bcf86cd799439051",
            schoolStageId: "507f1f77bcf86cd799439052",
            classLevelId: "507f1f77bcf86cd799439021",
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
                {
                    semesterId: "507f1f77bcf86cd799439031",
                    weight: 50,
                },
                {
                    semesterId: "507f1f77bcf86cd799439032",
                    weight: 50,
                },
            ],
        },
        failureRules: {
            failIfAnyCriticalSubjectFailed: true,
            criticalSubjectRules: [
                {
                    subjectId: "507f1f77bcf86cd799439041",
                    failAction: "repeat_year",
                },
            ],
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

function buildPolicyRecord(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439061",
        institutionId: "507f1f77bcf86cd799439011",
        name: "School Promotion Policy 2026",
        status: "active",
        appliesTo: {
            academicYearId: "507f1f77bcf86cd799439051",
            schoolStageId: "507f1f77bcf86cd799439052",
            classLevelId: "507f1f77bcf86cd799439021",
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
                {
                    semesterId: "507f1f77bcf86cd799439031",
                    weight: 50,
                },
                {
                    semesterId: "507f1f77bcf86cd799439032",
                    weight: 50,
                },
            ],
        },
        failureRules: {
            failIfAnyCriticalSubjectFailed: true,
            criticalSubjectRules: [
                {
                    subjectId: "507f1f77bcf86cd799439041",
                    failAction: "repeat_year",
                },
            ],
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
        audit: {
            createdBy: "507f1f77bcf86cd799439071",
            updatedBy: "507f1f77bcf86cd799439071",
        },
        createdAt: new Date("2026-04-25T10:00:00.000Z"),
        updatedAt: new Date("2026-04-25T10:00:00.000Z"),
        save: async function save() {
            this.updatedAt = new Date("2026-04-25T12:00:00.000Z");
            return this;
        },
        toObject() {
            return this;
        },
        ...overrides,
    };
}

function mockSchoolInstitution(t, institution = buildInstitution()) {
    return t.mock.method(Institution, "findOne", () => createQuery(institution));
}

function mockAcademicYear(t, academicYear = buildAcademicYear()) {
    return t.mock.method(AcademicYear, "findOne", () => createQuery(academicYear));
}

function mockScopeReferences(t) {
    mockAcademicYear(t);
    t.mock.method(ClassLevel, "findOne", () => createQuery(buildClassLevel()));
    t.mock.method(Semester, "find", () =>
        createQuery([buildSemester(), buildSemester({ _id: "507f1f77bcf86cd799439032" })])
    );
    t.mock.method(Subject, "find", () => createQuery([buildSubject()]));
}

test("validateCreateSchoolAcademicPolicyInput accepts a valid school policy payload", () => {
    const input = validateCreateSchoolAcademicPolicyInput(buildPolicyPayload());

    assert.equal(input.name, "School Promotion Policy 2026");
    assert.equal(input.status, "active");
    assert.equal(input.gradingRules.gradingMode, "percentage");
    assert.equal(input.aggregationRules.semesterWeights.length, 2);
    assert.equal(input.failureRules.criticalSubjectRules[0].failAction, "repeat_year");
    assert.equal(input.promotionRules.passDecision, "promoted");
});

test("validateCreateSchoolAcademicPolicyInput rejects missing required academicYearId", () => {
    assert.throws(
        () =>
            validateCreateSchoolAcademicPolicyInput(
                buildPolicyPayload({
                    appliesTo: {
                        schoolStageId: "507f1f77bcf86cd799439052",
                        classLevelId: "507f1f77bcf86cd799439021",
                    },
                })
            ),
        /appliesTo\.academicYearId is required/
    );
});

test("validateCreateSchoolAcademicPolicyInput rejects invalid percentage thresholds", () => {
    assert.throws(
        () =>
            validateCreateSchoolAcademicPolicyInput(
                buildPolicyPayload({
                    gradingRules: {
                        gradingMode: "percentage",
                        scaleMax: 100,
                        subjectPassMinPercentage: 101,
                        yearPassMinPercentage: 60,
                    },
                })
            ),
        /gradingRules\.subjectPassMinPercentage must be <= 100/
    );
});

test("validateCreateSchoolAcademicPolicyInput rejects semester weights that do not total 100", () => {
    assert.throws(
        () =>
            validateCreateSchoolAcademicPolicyInput(
                buildPolicyPayload({
                    aggregationRules: {
                        yearCalculationMethod: "weighted_semesters",
                        semesterWeights: [
                            { semesterId: "507f1f77bcf86cd799439031", weight: 40 },
                            { semesterId: "507f1f77bcf86cd799439032", weight: 40 },
                        ],
                    },
                })
            ),
        /aggregationRules\.semesterWeights total must equal 100/
    );
});

test("validateCreateSchoolAcademicPolicyInput rejects duplicate semesterIds", () => {
    assert.throws(
        () =>
            validateCreateSchoolAcademicPolicyInput(
                buildPolicyPayload({
                    aggregationRules: {
                        yearCalculationMethod: "weighted_semesters",
                        semesterWeights: [
                            { semesterId: "507f1f77bcf86cd799439031", weight: 50 },
                            { semesterId: "507f1f77bcf86cd799439031", weight: 50 },
                        ],
                    },
                })
            ),
        /aggregationRules\.semesterWeights must not contain duplicate semesterIds/
    );
});

test("validateCreateSchoolAcademicPolicyInput rejects missing semesterWeight semesterId", () => {
    assert.throws(
        () =>
            validateCreateSchoolAcademicPolicyInput(
                buildPolicyPayload({
                    aggregationRules: {
                        yearCalculationMethod: "weighted_semesters",
                        semesterWeights: [
                            { weight: 50 },
                            { semesterId: "507f1f77bcf86cd799439032", weight: 50 },
                        ],
                    },
                })
            ),
        /aggregationRules\.semesterWeights\[0\]\.semesterId is required/
    );
});

test("validateCreateSchoolAcademicPolicyInput rejects duplicate critical subjectIds", () => {
    assert.throws(
        () =>
            validateCreateSchoolAcademicPolicyInput(
                buildPolicyPayload({
                    failureRules: {
                        failIfAnyCriticalSubjectFailed: true,
                        criticalSubjectRules: [
                            { subjectId: "507f1f77bcf86cd799439041", failAction: "repeat_year" },
                            { subjectId: "507f1f77bcf86cd799439041", failAction: "warning" },
                        ],
                        failIfFailedSubjectCountAtLeast: 3,
                        countCriticalSubjectsInFailedSubjectTotal: true,
                    },
                })
            ),
        /failureRules\.criticalSubjectRules must not contain duplicate subjectIds/
    );
});

test("validateCreateSchoolAcademicPolicyInput rejects invalid failAction", () => {
    assert.throws(
        () =>
            validateCreateSchoolAcademicPolicyInput(
                buildPolicyPayload({
                    failureRules: {
                        failIfAnyCriticalSubjectFailed: true,
                        criticalSubjectRules: [
                            { subjectId: "507f1f77bcf86cd799439041", failAction: "block" },
                        ],
                        failIfFailedSubjectCountAtLeast: 3,
                        countCriticalSubjectsInFailedSubjectTotal: true,
                    },
                })
            ),
        /failureRules\.criticalSubjectRules\[0\]\.failAction is invalid/
    );
});

test("validateCreateSchoolAcademicPolicyInput rejects fail_semester because school promotion is year-based", () => {
    assert.throws(
        () =>
            validateCreateSchoolAcademicPolicyInput(
                buildPolicyPayload({
                    failureRules: {
                        failIfAnyCriticalSubjectFailed: true,
                        criticalSubjectRules: [
                            { subjectId: "507f1f77bcf86cd799439041", failAction: "fail_semester" },
                        ],
                        failIfFailedSubjectCountAtLeast: 3,
                        countCriticalSubjectsInFailedSubjectTotal: true,
                    },
                })
            ),
        /failureRules\.criticalSubjectRules\[0\]\.failAction is invalid/
    );
});

test("validateCreateSchoolAcademicPolicyInput rejects invalid promotion decision", () => {
    assert.throws(
        () =>
            validateCreateSchoolAcademicPolicyInput(
                buildPolicyPayload({
                    promotionRules: {
                        enabled: true,
                        passDecision: "graduated",
                        failDecision: "repeat_year",
                        allowConditionalPromotion: true,
                        allowManualReview: true,
                    },
                })
            ),
        /promotionRules\.passDecision is invalid/
    );
});

test("validateCreateSchoolAcademicPolicyInput rejects string booleans", () => {
    assert.throws(
        () =>
            validateCreateSchoolAcademicPolicyInput(
                buildPolicyPayload({
                    failureRules: {
                        failIfAnyCriticalSubjectFailed: "false",
                        criticalSubjectRules: [],
                        failIfFailedSubjectCountAtLeast: 3,
                        countCriticalSubjectsInFailedSubjectTotal: true,
                    },
                })
            ),
        /failureRules\.failIfAnyCriticalSubjectFailed must be a boolean/
    );

    assert.throws(
        () =>
            validateCreateSchoolAcademicPolicyInput(
                buildPolicyPayload({
                    promotionRules: {
                        enabled: "true",
                        passDecision: "promoted",
                        failDecision: "repeat_year",
                        allowConditionalPromotion: true,
                        allowManualReview: true,
                    },
                })
            ),
        /promotionRules\.enabled must be a boolean/
    );
});

test("validateCreateSchoolAcademicPolicyInput enforces promotion decision availability flags", () => {
    assert.throws(
        () =>
            validateCreateSchoolAcademicPolicyInput(
                buildPolicyPayload({
                    promotionRules: {
                        enabled: true,
                        passDecision: "promoted",
                        failDecision: "conditional_promotion",
                        allowConditionalPromotion: false,
                        allowManualReview: true,
                    },
                })
            ),
        /promotionRules\.failDecision cannot be conditional_promotion/
    );

    assert.throws(
        () =>
            validateCreateSchoolAcademicPolicyInput(
                buildPolicyPayload({
                    promotionRules: {
                        enabled: true,
                        passDecision: "manual_review",
                        failDecision: "repeat_year",
                        allowConditionalPromotion: true,
                        allowManualReview: false,
                    },
                })
            ),
        /promotionRules\.passDecision cannot be manual_review/
    );
});

test("createSchoolAcademicPolicy creates a valid school academic policy", async (t) => {
    mockSchoolInstitution(t);
    mockScopeReferences(t);
    t.mock.method(SchoolAcademicPolicy, "findOne", () => createQuery(null));
    const createMock = t.mock.method(SchoolAcademicPolicy, "create", async (payload) =>
        buildPolicyRecord({
            ...payload,
            _id: "507f1f77bcf86cd799439099",
        })
    );

    const result = await createSchoolAcademicPolicy({
        institutionId: "507f1f77bcf86cd799439011",
        actorUserId: "507f1f77bcf86cd799439071",
        payload: buildPolicyPayload(),
    });

    assert.equal(createMock.mock.callCount(), 1);
    assert.equal(result.schoolAcademicPolicy.id, "507f1f77bcf86cd799439099");
    assert.equal(result.schoolAcademicPolicy.audit.createdBy, "507f1f77bcf86cd799439071");
    assert.equal(result.schoolAcademicPolicy.appliesTo.classLevelId, "507f1f77bcf86cd799439021");
});

test("createSchoolAcademicPolicy rejects critical subjects outside appliesTo.classLevelId", async (t) => {
    mockSchoolInstitution(t);
    mockAcademicYear(t);
    t.mock.method(ClassLevel, "findOne", () => createQuery(buildClassLevel()));
    t.mock.method(Semester, "find", () =>
        createQuery([buildSemester(), buildSemester({ _id: "507f1f77bcf86cd799439032" })])
    );
    t.mock.method(Subject, "find", () =>
        createQuery([
            buildSubject({
                classLevelId: "507f1f77bcf86cd799439099",
            }),
        ])
    );

    await assert.rejects(
        () =>
            createSchoolAcademicPolicy({
                institutionId: "507f1f77bcf86cd799439011",
                actorUserId: "507f1f77bcf86cd799439071",
                payload: buildPolicyPayload(),
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(
                error.message,
                "failureRules.criticalSubjectRules must reference subjects from appliesTo.classLevelId"
            );
            return true;
        }
    );
});

test("createSchoolAcademicPolicy prevents two active policies for the same exact scope", async (t) => {
    mockSchoolInstitution(t);
    mockScopeReferences(t);
    t.mock.method(SchoolAcademicPolicy, "findOne", () => createQuery({ _id: "507f1f77bcf86cd799439081" }));

    await assert.rejects(
        () =>
            createSchoolAcademicPolicy({
                institutionId: "507f1f77bcf86cd799439011",
                actorUserId: "507f1f77bcf86cd799439071",
                payload: buildPolicyPayload(),
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "An active school academic policy already exists for this exact scope");
            return true;
        }
    );
});

test("listSchoolAcademicPolicies stays tenant-scoped to the same institution", async (t) => {
    mockSchoolInstitution(t);
    let receivedQuery = null;
    t.mock.method(SchoolAcademicPolicy, "find", (query) => {
        receivedQuery = query;
        return createQuery([buildPolicyRecord()]);
    });

    const result = await listSchoolAcademicPolicies({
        institutionId: "507f1f77bcf86cd799439011",
        query: { status: "all" },
    });

    assert.equal(receivedQuery.institutionId, "507f1f77bcf86cd799439011");
    assert.equal(result.schoolAcademicPolicies.length, 1);
});

test("getSchoolAcademicPolicyById is tenant-scoped", async (t) => {
    mockSchoolInstitution(t);
    let receivedQuery = null;
    t.mock.method(SchoolAcademicPolicy, "findOne", (query) => {
        receivedQuery = query;
        return createQuery(null);
    });

    await assert.rejects(
        () =>
            getSchoolAcademicPolicyById({
                institutionId: "507f1f77bcf86cd799439011",
                policyId: "507f1f77bcf86cd799439061",
            }),
        (error) => {
            assert.equal(receivedQuery.institutionId, "507f1f77bcf86cd799439011");
            assert.equal(receivedQuery._id, "507f1f77bcf86cd799439061");
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "School academic policy not found");
            return true;
        }
    );
});

test("updateSchoolAcademicPolicy is tenant-scoped and updates audit.updatedBy", async (t) => {
    mockSchoolInstitution(t);
    mockScopeReferences(t);
    const policy = buildPolicyRecord();
    t.mock.method(SchoolAcademicPolicy, "findOne", (query) => {
        if (query.status === "active") {
            return createQuery(null);
        }

        return createQuery(policy);
    });

    const result = await updateSchoolAcademicPolicy({
        institutionId: "507f1f77bcf86cd799439011",
        policyId: "507f1f77bcf86cd799439061",
        actorUserId: "507f1f77bcf86cd799439072",
        payload: {
            name: "Updated School Promotion Policy",
            promotionRules: {
                failDecision: "manual_review",
            },
        },
    });

    assert.equal(result.schoolAcademicPolicy.name, "Updated School Promotion Policy");
    assert.equal(result.schoolAcademicPolicy.promotionRules.failDecision, "manual_review");
    assert.equal(result.schoolAcademicPolicy.audit.updatedBy, "507f1f77bcf86cd799439072");
});

test("archiveSchoolAcademicPolicy is tenant-scoped and archives the policy", async (t) => {
    mockSchoolInstitution(t);
    const policy = buildPolicyRecord();
    t.mock.method(SchoolAcademicPolicy, "findOne", () => createQuery(policy));

    const result = await archiveSchoolAcademicPolicy({
        institutionId: "507f1f77bcf86cd799439011",
        policyId: "507f1f77bcf86cd799439061",
        actorUserId: "507f1f77bcf86cd799439072",
    });

    assert.equal(result.schoolAcademicPolicy.status, "archived");
    assert.equal(result.schoolAcademicPolicy.audit.updatedBy, "507f1f77bcf86cd799439072");
});

test("resolveSchoolAcademicPolicyForClassLevel returns class-level policy before stage policy", async (t) => {
    mockSchoolInstitution(t);
    t.mock.method(ClassLevel, "findOne", () => createQuery(buildClassLevel()));
    t.mock.method(SchoolAcademicPolicy, "findOne", (query) => {
        if (query["appliesTo.classLevelId"] === "507f1f77bcf86cd799439021") {
            return createQuery(buildPolicyRecord());
        }

        return createQuery(null);
    });

    const result = await resolveSchoolAcademicPolicyForClassLevel({
        institutionId: "507f1f77bcf86cd799439011",
        academicYearId: "507f1f77bcf86cd799439051",
        schoolStageId: "507f1f77bcf86cd799439052",
        classLevelId: "507f1f77bcf86cd799439021",
    });

    assert.equal(result.resolutionLevel, "class_level");
    assert.equal(result.policy.id, "507f1f77bcf86cd799439061");
});

test("resolveSchoolAcademicPolicyForClassLevel returns class-level no-stage policy before stage policy", async (t) => {
    mockSchoolInstitution(t);
    t.mock.method(ClassLevel, "findOne", () => createQuery(buildClassLevel()));
    t.mock.method(SchoolAcademicPolicy, "findOne", (query) => {
        if (
            query["appliesTo.classLevelId"] === "507f1f77bcf86cd799439021" &&
            query["appliesTo.schoolStageId"] === "507f1f77bcf86cd799439052"
        ) {
            return createQuery(null);
        }

        if (
            query["appliesTo.classLevelId"] === "507f1f77bcf86cd799439021" &&
            query["appliesTo.schoolStageId"] === null
        ) {
            return createQuery(
                buildPolicyRecord({
                    _id: "507f1f77bcf86cd799439064",
                    appliesTo: {
                        academicYearId: "507f1f77bcf86cd799439051",
                        schoolStageId: null,
                        classLevelId: "507f1f77bcf86cd799439021",
                    },
                })
            );
        }

        return createQuery(
            buildPolicyRecord({
                _id: "507f1f77bcf86cd799439062",
                appliesTo: {
                    academicYearId: "507f1f77bcf86cd799439051",
                    schoolStageId: "507f1f77bcf86cd799439052",
                    classLevelId: null,
                },
            })
        );
    });

    const result = await resolveSchoolAcademicPolicyForClassLevel({
        institutionId: "507f1f77bcf86cd799439011",
        academicYearId: "507f1f77bcf86cd799439051",
        schoolStageId: "507f1f77bcf86cd799439052",
        classLevelId: "507f1f77bcf86cd799439021",
    });

    assert.equal(result.resolutionLevel, "class_level");
    assert.equal(result.policy.id, "507f1f77bcf86cd799439064");
    assert.equal(result.policy.appliesTo.schoolStageId, null);
});

test("resolveSchoolAcademicPolicyForClassLevel returns stage policy before academic-year default", async (t) => {
    mockSchoolInstitution(t);
    t.mock.method(ClassLevel, "findOne", () => createQuery(buildClassLevel()));
    t.mock.method(SchoolAcademicPolicy, "findOne", (query) => {
        if (query["appliesTo.classLevelId"] === "507f1f77bcf86cd799439021") {
            return createQuery(null);
        }

        if (query["appliesTo.schoolStageId"] === "507f1f77bcf86cd799439052") {
            return createQuery(
                buildPolicyRecord({
                    _id: "507f1f77bcf86cd799439062",
                    appliesTo: {
                        academicYearId: "507f1f77bcf86cd799439051",
                        schoolStageId: "507f1f77bcf86cd799439052",
                        classLevelId: null,
                    },
                })
            );
        }

        return createQuery(
            buildPolicyRecord({
                _id: "507f1f77bcf86cd799439063",
                appliesTo: {
                    academicYearId: "507f1f77bcf86cd799439051",
                    schoolStageId: null,
                    classLevelId: null,
                },
            })
        );
    });

    const result = await resolveSchoolAcademicPolicyForClassLevel({
        institutionId: "507f1f77bcf86cd799439011",
        academicYearId: "507f1f77bcf86cd799439051",
        schoolStageId: "507f1f77bcf86cd799439052",
        classLevelId: "507f1f77bcf86cd799439021",
    });

    assert.equal(result.resolutionLevel, "school_stage");
    assert.equal(result.policy.id, "507f1f77bcf86cd799439062");
});

test("resolveSchoolAcademicPolicyForClassLevel uses only active policies", async (t) => {
    mockSchoolInstitution(t);
    t.mock.method(ClassLevel, "findOne", () => createQuery(buildClassLevel()));
    const queries = [];
    t.mock.method(SchoolAcademicPolicy, "findOne", (query) => {
        queries.push(query);
        return createQuery(null);
    });

    const result = await resolveSchoolAcademicPolicyForClassLevel({
        institutionId: "507f1f77bcf86cd799439011",
        academicYearId: "507f1f77bcf86cd799439051",
        schoolStageId: "507f1f77bcf86cd799439052",
        classLevelId: "507f1f77bcf86cd799439021",
    });

    assert.equal(result.policy, null);
    assert.equal(result.resolutionLevel, null);
    assert.ok(queries.length >= 2);
    assert.ok(queries.every((query) => query.status === "active"));
});
