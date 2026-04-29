const test = require("node:test");
const assert = require("node:assert/strict");

const Enrollment = require("../src/models/Enrollment");
const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");
const Section = require("../src/models/Section");
const Subject = require("../src/models/Subject");
const Semester = require("../src/models/Semester");

function buildPolicy(overrides = {}) {
    return {
        minimumEnrollmentCreditHours: 3,
        defaultMaxCreditHours: 18,
        overloadMinGpa: 3,
        overloadMaxCreditHours: 21,
        gpaBands: [{ minPercentage: 0, maxPercentage: 100, gradePoint: 4 }],
        ...overrides,
    };
}

function buildInstitution(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439011",
        type: "university",
        ...overrides,
    };
}

function buildSection(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439021",
        institutionId: "507f1f77bcf86cd799439011",
        semesterId: "507f1f77bcf86cd799439031",
        subjectId: "507f1f77bcf86cd799439041",
        schoolClassId: null,
        status: "active",
        capacity: 30,
        ...overrides,
    };
}

function buildSubject(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439041",
        institutionId: "507f1f77bcf86cd799439011",
        code: "CS201",
        name: "Data Structures",
        creditHours: 3,
        prerequisiteSubjectIds: [],
        status: "active",
        ...overrides,
    };
}

function buildActiveSemester(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439031",
        institutionId: "507f1f77bcf86cd799439011",
        name: "Spring 2026",
        status: "active",
        ...overrides,
    };
}

function buildActorMembership(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439051",
        institutionId: "507f1f77bcf86cd799439011",
        role: "student",
        status: "active",
        ...overrides,
    };
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
    };
}

function createSequence(values) {
    let index = 0;

    return () => {
        const value = values[Math.min(index, values.length - 1)];
        index += 1;
        return value;
    };
}

function mockQueryMethod(t, target, methodName, valuesOrResolver) {
    const resolver =
        typeof valuesOrResolver === "function" ? valuesOrResolver : createSequence(valuesOrResolver);

    return t.mock.method(target, methodName, (...args) => createQuery(resolver(...args)));
}

function loadEnrollmentServiceWithDependencyMocks({
    policy = buildPolicy(),
    academicOutcomeSummary = {
        outcomes: [],
        subjectOutcomeSummaries: [],
        summary: {
            cumulativeGpa: 2.5,
        },
    },
} = {}) {
    const policyServicePath = require.resolve("../src/services/universityAcademicPolicyService");
    const academicOutcomeServicePath = require.resolve("../src/services/universityAcademicOutcomeService");
    const enrollmentServicePath = require.resolve("../src/services/enrollmentService");

    const policyService = require(policyServicePath);
    const academicOutcomeService = require(academicOutcomeServicePath);
    const originalResolveAcademicPolicyForSemester = policyService.resolveAcademicPolicyForSemester;
    const originalListStudentAcademicOutcomes = academicOutcomeService.listStudentAcademicOutcomes;

    policyService.resolveAcademicPolicyForSemester = async () => policy;
    academicOutcomeService.listStudentAcademicOutcomes = async () => academicOutcomeSummary;

    delete require.cache[enrollmentServicePath];
    const enrollmentService = require(enrollmentServicePath);

    return {
        enrollmentService,
        restore() {
            delete require.cache[enrollmentServicePath];
            policyService.resolveAcademicPolicyForSemester = originalResolveAcademicPolicyForSemester;
            academicOutcomeService.listStudentAcademicOutcomes = originalListStudentAcademicOutcomes;
        },
    };
}

test("createMySelfEnrollmentSubmission validates that sectionIds is a non-empty array", async (t) => {
    const actorMembership = buildActorMembership();
    const { enrollmentService, restore } = loadEnrollmentServiceWithDependencyMocks();

    t.after(restore);

    await assert.rejects(
        () =>
            enrollmentService.createMySelfEnrollmentSubmission({
                institutionId: "507f1f77bcf86cd799439011",
                actorUserId: "507f1f77bcf86cd799439071",
                actorMembership,
                payload: {},
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "sectionIds must be a non-empty array");
            return true;
        }
    );
});

test("createMySelfEnrollmentSubmission creates shared enrollments for a deduplicated valid submission", async (t) => {
    const actorMembership = buildActorMembership();
    const institution = buildInstitution();
    const activeSemester = buildActiveSemester();
    const sectionOne = buildSection({
        _id: "507f1f77bcf86cd799439021",
        subjectId: "507f1f77bcf86cd799439041",
    });
    const sectionTwo = buildSection({
        _id: "507f1f77bcf86cd799439022",
        subjectId: "507f1f77bcf86cd799439042",
        code: "B",
    });
    const subjectOne = buildSubject({
        _id: "507f1f77bcf86cd799439041",
        code: "CS201",
    });
    const subjectTwo = buildSubject({
        _id: "507f1f77bcf86cd799439042",
        code: "CS202",
        name: "Algorithms",
    });
    const createdAt = new Date("2026-04-20T10:00:00.000Z");
    const createdEnrollments = [
        {
            _id: "507f1f77bcf86cd799439061",
            sectionId: sectionOne._id,
            studentMemberId: actorMembership._id,
            status: "enrolled",
            enrolledAt: createdAt,
            createdAt,
            updatedAt: createdAt,
        },
        {
            _id: "507f1f77bcf86cd799439062",
            sectionId: sectionTwo._id,
            studentMemberId: actorMembership._id,
            status: "enrolled",
            enrolledAt: createdAt,
            createdAt,
            updatedAt: createdAt,
        },
    ];
    const { enrollmentService, restore } = loadEnrollmentServiceWithDependencyMocks({
        policy: buildPolicy({
            minimumEnrollmentCreditHours: 3,
            defaultMaxCreditHours: 12,
            overloadMaxCreditHours: 15,
        }),
    });

    t.after(restore);
    mockQueryMethod(t, Institution, "findOne", [institution, institution, institution]);
    mockQueryMethod(t, Semester, "findOne", [activeSemester]);
    mockQueryMethod(t, Section, "findOne", [sectionOne, sectionTwo]);
    t.mock.method(Section, "find", () => createQuery([sectionOne, sectionTwo]));
    t.mock.method(Subject, "find", () => createQuery([subjectOne, subjectTwo]));
    mockQueryMethod(t, Membership, "findOne", [
        {
            _id: actorMembership._id,
            role: "student",
            status: "active",
        },
        {
            _id: actorMembership._id,
            role: "student",
            status: "active",
        },
    ]);
    mockQueryMethod(t, Enrollment, "find", [[], []]);
    const findOneMock = mockQueryMethod(t, Enrollment, "findOne", [null, null]);
    const countDocumentsMock = t.mock.method(Enrollment, "countDocuments", createSequence([12, 7]));
    t.mock.method(Enrollment, "aggregate", async () => [
        { _id: sectionOne._id, enrolledSeatCount: 12 },
        { _id: sectionTwo._id, enrolledSeatCount: 7 },
    ]);
    const createMock = t.mock.method(Enrollment, "create", createSequence(createdEnrollments));

    const result = await enrollmentService.createMySelfEnrollmentSubmission({
        institutionId: institution._id,
        actorUserId: "507f1f77bcf86cd799439071",
        actorMembership,
        payload: {
            sectionIds: [sectionOne._id, sectionOne._id, sectionTwo._id],
        },
    });

    assert.deepEqual(result, {
        enrollments: [
            {
                id: createdEnrollments[0]._id,
                sectionId: sectionOne._id,
                studentMemberId: actorMembership._id,
                status: "enrolled",
                enrolledAt: createdAt,
                createdAt,
                updatedAt: createdAt,
            },
            {
                id: createdEnrollments[1]._id,
                sectionId: sectionTwo._id,
                studentMemberId: actorMembership._id,
                status: "enrolled",
                enrolledAt: createdAt,
                createdAt,
                updatedAt: createdAt,
            },
        ],
        submission: {
            sectionIds: [sectionOne._id, sectionTwo._id],
            loadSummary: {
                currentCreditHours: 0,
                selectedCreditHours: 6,
                selectedSectionCount: 2,
                selectedSubjectCount: 2,
                projectedCreditHours: 6,
                cumulativeGpa: 2.5,
                minimumEnrollmentCreditHours: 3,
                maxAllowedCreditHours: 12,
                belowMinimumEnrollment: false,
                exceedsAllowedMax: false,
                overloadMinGpa: 3,
                qualifiesForOverloadByGpa: false,
                nearGraduationExceptionApplied: false,
                nearGraduationExceptionDeferred: true,
                remainingGraduationCreditHours: null,
                graduationRequirementDataAvailable: false,
            },
        },
    });
    assert.equal(findOneMock.mock.calls.length, 2);
    assert.equal(countDocumentsMock.mock.calls.length, 2);
    assert.equal(createMock.mock.calls.length, 2);
});

test("createMySelfEnrollmentSubmission rejects when one submitted section is missing prerequisites", async (t) => {
    const actorMembership = buildActorMembership();
    const institution = buildInstitution();
    const activeSemester = buildActiveSemester();
    const sectionOne = buildSection({
        _id: "507f1f77bcf86cd799439021",
        subjectId: "507f1f77bcf86cd799439041",
    });
    const sectionTwo = buildSection({
        _id: "507f1f77bcf86cd799439022",
        subjectId: "507f1f77bcf86cd799439042",
        code: "B",
    });
    const subjectOne = buildSubject({
        _id: "507f1f77bcf86cd799439041",
        code: "CS201",
    });
    const subjectTwo = buildSubject({
        _id: "507f1f77bcf86cd799439042",
        code: "CS202",
        name: "Algorithms",
        prerequisiteSubjectIds: ["507f1f77bcf86cd799439081"],
    });
    const prerequisiteSubject = {
        _id: "507f1f77bcf86cd799439081",
        code: "CS101",
        name: "Intro to CS",
    };
    const { enrollmentService, restore } = loadEnrollmentServiceWithDependencyMocks({
        policy: buildPolicy({
            minimumEnrollmentCreditHours: 3,
        }),
    });

    t.after(restore);
    mockQueryMethod(t, Institution, "findOne", [institution]);
    mockQueryMethod(t, Semester, "findOne", [activeSemester]);
    t.mock.method(Section, "find", () => createQuery([sectionOne, sectionTwo]));
    t.mock.method(Subject, "find", (query) => {
        const subjectIds = (query?._id?.$in || []).map((value) => value.toString());
        if (subjectIds.includes(prerequisiteSubject._id)) {
            return createQuery([prerequisiteSubject]);
        }

        return createQuery([subjectOne, subjectTwo]);
    });
    mockQueryMethod(t, Enrollment, "find", [[], []]);
    t.mock.method(Enrollment, "aggregate", async () => [
        { _id: sectionOne._id, enrolledSeatCount: 12 },
        { _id: sectionTwo._id, enrolledSeatCount: 7 },
    ]);
    const createMock = t.mock.method(Enrollment, "create", async () => {
        throw new Error("create should not be called when submission validation blocks");
    });

    await assert.rejects(
        () =>
            enrollmentService.createMySelfEnrollmentSubmission({
                institutionId: institution._id,
                actorUserId: "507f1f77bcf86cd799439071",
                actorMembership,
                payload: {
                    sectionIds: [sectionOne._id, sectionTwo._id],
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "One or more prerequisite subjects are not satisfied.");
            assert.deepEqual(error.blockingReasonCodes, ["missing_prerequisites"]);
            return true;
        }
    );

    assert.equal(createMock.mock.calls.length, 0);
});

test("createMySelfEnrollmentSubmission blocks a full section anywhere in the submitted selection", async (t) => {
    const actorMembership = buildActorMembership();
    const institution = buildInstitution();
    const activeSemester = buildActiveSemester();
    const sectionOne = buildSection({
        _id: "507f1f77bcf86cd799439021",
        subjectId: "507f1f77bcf86cd799439041",
    });
    const sectionTwo = buildSection({
        _id: "507f1f77bcf86cd799439022",
        subjectId: "507f1f77bcf86cd799439042",
        capacity: 20,
        code: "B",
    });
    const subjectOne = buildSubject({
        _id: "507f1f77bcf86cd799439041",
        code: "CS201",
    });
    const subjectTwo = buildSubject({
        _id: "507f1f77bcf86cd799439042",
        code: "CS202",
        name: "Algorithms",
    });
    const { enrollmentService, restore } = loadEnrollmentServiceWithDependencyMocks({
        policy: buildPolicy({
            minimumEnrollmentCreditHours: 3,
        }),
    });

    t.after(restore);
    mockQueryMethod(t, Institution, "findOne", [institution]);
    mockQueryMethod(t, Semester, "findOne", [activeSemester]);
    t.mock.method(Section, "find", () => createQuery([sectionOne, sectionTwo]));
    t.mock.method(Subject, "find", () => createQuery([subjectOne, subjectTwo]));
    mockQueryMethod(t, Enrollment, "find", [[], []]);
    t.mock.method(Enrollment, "aggregate", async () => [
        { _id: sectionOne._id, enrolledSeatCount: 12 },
        { _id: sectionTwo._id, enrolledSeatCount: 20 },
    ]);
    const createMock = t.mock.method(Enrollment, "create", async () => {
        throw new Error("create should not be called when a submitted section is already full");
    });

    await assert.rejects(
        () =>
            enrollmentService.createMySelfEnrollmentSubmission({
                institutionId: institution._id,
                actorUserId: "507f1f77bcf86cd799439071",
                actorMembership,
                payload: {
                    sectionIds: [sectionOne._id, sectionTwo._id],
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Section capacity is full.");
            assert.deepEqual(error.blockingReasonCodes, ["section_full"]);
            return true;
        }
    );

    assert.equal(createMock.mock.calls.length, 0);
});

test("createMySelfEnrollmentSubmission rejects existing same-section enrollment conflicts in the submitted selection", async (t) => {
    const actorMembership = buildActorMembership();
    const institution = buildInstitution();
    const activeSemester = buildActiveSemester();
    const sectionOne = buildSection({
        _id: "507f1f77bcf86cd799439021",
        subjectId: "507f1f77bcf86cd799439041",
    });
    const sectionTwo = buildSection({
        _id: "507f1f77bcf86cd799439022",
        subjectId: "507f1f77bcf86cd799439042",
        code: "B",
    });
    const subjectOne = buildSubject({
        _id: "507f1f77bcf86cd799439041",
        code: "CS201",
    });
    const subjectTwo = buildSubject({
        _id: "507f1f77bcf86cd799439042",
        code: "CS202",
        name: "Algorithms",
    });
    const { enrollmentService, restore } = loadEnrollmentServiceWithDependencyMocks({
        policy: buildPolicy({
            minimumEnrollmentCreditHours: 3,
        }),
    });

    t.after(restore);
    mockQueryMethod(t, Institution, "findOne", [institution]);
    mockQueryMethod(t, Semester, "findOne", [activeSemester]);
    t.mock.method(Section, "find", () => createQuery([sectionOne, sectionTwo]));
    t.mock.method(Subject, "find", () => createQuery([subjectOne, subjectTwo]));
    mockQueryMethod(t, Enrollment, "find", [[
        {
            _id: "507f1f77bcf86cd799439091",
            sectionId: sectionTwo._id,
            status: "enrolled",
        },
    ], []]);
    t.mock.method(Enrollment, "aggregate", async () => [
        { _id: sectionOne._id, enrolledSeatCount: 12 },
        { _id: sectionTwo._id, enrolledSeatCount: 7 },
    ]);
    const createMock = t.mock.method(Enrollment, "create", async () => {
        throw new Error("create should not be called when duplicate enrollment blocks");
    });

    await assert.rejects(
        () =>
            enrollmentService.createMySelfEnrollmentSubmission({
                institutionId: institution._id,
                actorUserId: "507f1f77bcf86cd799439071",
                actorMembership,
                payload: {
                    sectionIds: [sectionOne._id, sectionTwo._id],
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Student is already enrolled in the target section.");
            assert.deepEqual(error.blockingReasonCodes, ["already_enrolled_in_section"]);
            return true;
        }
    );

    assert.equal(createMock.mock.calls.length, 0);
});

test("createMySelfEnrollmentSubmission keeps tenant scoping and rejects a selected section outside the institution context", async (t) => {
    const actorMembership = buildActorMembership();
    const institution = buildInstitution();
    const activeSemester = buildActiveSemester();
    const { enrollmentService, restore } = loadEnrollmentServiceWithDependencyMocks({
        policy: buildPolicy({
            minimumEnrollmentCreditHours: 3,
        }),
    });

    t.after(restore);
    mockQueryMethod(t, Institution, "findOne", [institution]);
    mockQueryMethod(t, Semester, "findOne", [activeSemester]);
    t.mock.method(Section, "find", () => createQuery([]));

    await assert.rejects(
        () =>
            enrollmentService.createMySelfEnrollmentSubmission({
                institutionId: institution._id,
                actorUserId: "507f1f77bcf86cd799439071",
                actorMembership,
                payload: {
                    sectionIds: ["507f1f77bcf86cd799439021"],
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "One or more sections were not found");
            return true;
        }
    );
});
