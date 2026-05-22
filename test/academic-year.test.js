const test = require("node:test");
const assert = require("node:assert/strict");

const AcademicYear = require("../src/models/AcademicYear");
const Institution = require("../src/models/Institution");
const Semester = require("../src/models/Semester");
const SchoolAcademicPolicy = require("../src/models/SchoolAcademicPolicy");
const ClassLevel = require("../src/models/ClassLevel");
const Subject = require("../src/models/Subject");
const institutionRoutes = require("../src/routes/institutionRoutes");
const academicYearController = require("../src/controllers/academicYearController");
const academicYearService = require("../src/services/academicYearService");
const semesterService = require("../src/services/semesterService");
const schoolAcademicPolicyService = require("../src/services/schoolAcademicPolicyService");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439012";
const academicYearId = "507f1f77bcf86cd799439021";
const otherAcademicYearId = "507f1f77bcf86cd799439022";
const semesterId = "507f1f77bcf86cd799439031";
const otherSemesterId = "507f1f77bcf86cd799439032";
const classLevelId = "507f1f77bcf86cd799439041";
const subjectId = "507f1f77bcf86cd799439051";
const actorUserId = "507f1f77bcf86cd799439061";

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
    if (condition?.$ne !== undefined) {
        return normalizeId(value) !== normalizeId(condition.$ne);
    }

    if (condition?.$in) {
        return condition.$in.map(normalizeId).includes(normalizeId(value));
    }

    return normalizeId(value) === normalizeId(condition);
}

function buildInstitution(overrides = {}) {
    return {
        _id: institutionId,
        type: "school",
        ...overrides,
    };
}

function buildAcademicYear(overrides = {}) {
    return {
        _id: academicYearId,
        institutionId,
        name: "2026-2027",
        nameNormalized: "2026-2027",
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2027-06-30T00:00:00.000Z"),
        status: "draft",
        createdByUserId: actorUserId,
        archivedAt: null,
        createdAt: new Date("2026-05-17T00:00:00.000Z"),
        updatedAt: new Date("2026-05-17T00:00:00.000Z"),
        ...overrides,
    };
}

function buildSemester(overrides = {}) {
    return {
        _id: semesterId,
        institutionId,
        academicYearId,
        name: "Semester 1",
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2026-12-20T00:00:00.000Z"),
        teachingDays: ["Monday", "Wednesday"],
        calendarOverrides: [],
        examDates: [],
        weekCount: 16,
        status: "archived",
        createdByUserId: actorUserId,
        createdAt: new Date("2026-05-17T00:00:00.000Z"),
        updatedAt: new Date("2026-05-17T00:00:00.000Z"),
        ...overrides,
    };
}

function buildPolicyPayload(overrides = {}) {
    return {
        name: "School Promotion Policy 2026",
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
                { semesterId, weight: 50 },
                { semesterId: otherSemesterId, weight: 50 },
            ],
        },
        failureRules: {
            failIfAnyCriticalSubjectFailed: true,
            criticalSubjectRules: [{ subjectId, failAction: "repeat_year" }],
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
        _id: "507f1f77bcf86cd799439071",
        institutionId,
        ...buildPolicyPayload(),
        audit: {
            createdBy: actorUserId,
            updatedBy: actorUserId,
        },
        createdAt: new Date("2026-05-17T00:00:00.000Z"),
        updatedAt: new Date("2026-05-17T00:00:00.000Z"),
        save: async function save() {
            return this;
        },
        toObject() {
            return this;
        },
        ...overrides,
    };
}

function mockInstitution(t, institution = buildInstitution()) {
    return t.mock.method(Institution, "findOne", () => createQuery(institution));
}

function mockAcademicYearFindOne(t, result = null) {
    return t.mock.method(AcademicYear, "findOne", () => createQuery(result));
}

function createResponse() {
    return {
        statusCode: null,
        body: null,
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

test("AcademicYear model validates dates and exposes expected indexes", async () => {
    const academicYear = new AcademicYear({
        institutionId,
        name: "2026-2027",
        nameNormalized: "2026-2027",
        startDate: new Date("2027-06-30T00:00:00.000Z"),
        endDate: new Date("2026-09-01T00:00:00.000Z"),
    });

    await assert.rejects(() => academicYear.validate(), /endDate must be after startDate/);

    const indexes = AcademicYear.schema.indexes();
    assert.ok(indexes.some(([fields, options]) => fields.institutionId === 1 && fields.nameNormalized === 1 && options.unique));
    assert.ok(
        indexes.some(
            ([fields, options]) =>
                fields.institutionId === 1 &&
                fields.status === 1 &&
                options.unique &&
                options.partialFilterExpression?.status === "active"
        )
    );
});

test("createAcademicYear creates a tenant-scoped academic year", async (t) => {
    mockInstitution(t, buildInstitution({ type: "university" }));
    const queries = [];
    t.mock.method(AcademicYear, "findOne", (query) => {
        queries.push(query);
        return createQuery(null);
    });
    const createMock = t.mock.method(AcademicYear, "create", async (payload) =>
        buildAcademicYear({
            ...payload,
            _id: academicYearId,
        })
    );

    const result = await academicYearService.createAcademicYear({
        institutionId,
        createdByUserId: actorUserId,
        payload: {
            name: " 2026-2027 ",
            startDate: "2026-09-01",
            endDate: "2027-06-30",
            status: "draft",
        },
    });

    assert.equal(createMock.mock.callCount(), 1);
    assert.equal(createMock.mock.calls[0].arguments[0].institutionId, institutionId);
    assert.equal(createMock.mock.calls[0].arguments[0].nameNormalized, "2026-2027");
    assert.equal(result.academicYear.name, "2026-2027");
    assert.equal(result.academicYear.startDate, "2026-09-01");
    assert.ok(queries.every((query) => query.institutionId === institutionId));
});

test("listAcademicYears filters and paginates within one institution", async (t) => {
    mockInstitution(t);
    let receivedQuery = null;
    t.mock.method(AcademicYear, "countDocuments", (query) => {
        receivedQuery = query;
        return Promise.resolve(1);
    });
    t.mock.method(AcademicYear, "find", () => createQuery([buildAcademicYear({ status: "active" })]));

    const result = await academicYearService.listAcademicYears({
        institutionId,
        query: {
            status: "active",
            search: "2026",
            page: "2",
            limit: "10",
        },
    });

    assert.equal(receivedQuery.institutionId, institutionId);
    assert.equal(receivedQuery.status, "active");
    assert.ok(receivedQuery.nameNormalized.$regex);
    assert.equal(result.academicYears.length, 1);
    assert.deepEqual(result.pagination, {
        page: 2,
        limit: 10,
        total: 1,
        totalPages: 1,
    });
});

test("getAcademicYearById and getActiveAcademicYear use tenant scoped queries", async (t) => {
    mockInstitution(t);
    const queries = [];
    t.mock.method(AcademicYear, "findOne", (query) => {
        queries.push(query);
        return createQuery(buildAcademicYear({ status: query.status || "draft" }));
    });

    const byId = await academicYearService.getAcademicYearById({
        institutionId,
        academicYearId,
    });
    const active = await academicYearService.getActiveAcademicYear({ institutionId });

    assert.equal(byId.academicYear.id, academicYearId);
    assert.equal(active.academicYear.status, "active");
    assert.deepEqual(queries[0], { _id: academicYearId, institutionId });
    assert.deepEqual(queries[1], { institutionId, status: "active" });
});

test("getActiveAcademicYear returns clear 404 when none exists", async (t) => {
    mockInstitution(t);
    mockAcademicYearFindOne(t, null);

    await assert.rejects(
        () => academicYearService.getActiveAcademicYear({ institutionId }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Active academic year not found");
            return true;
        }
    );
});

test("updateAcademicYear updates draft years and blocks archived years", async (t) => {
    mockInstitution(t);
    t.mock.method(AcademicYear, "findOne", (query) => {
        if (query.nameNormalized) {
            return createQuery(null);
        }

        if (query.status === "active") {
            return createQuery(null);
        }

        return createQuery(buildAcademicYear());
    });
    const updateMock = t.mock.method(AcademicYear, "findOneAndUpdate", (query, update) =>
        createQuery(
            buildAcademicYear({
                ...update.$set,
                status: update.$set.status || "draft",
            })
        )
    );

    const result = await academicYearService.updateAcademicYear({
        institutionId,
        academicYearId,
        payload: {
            name: "2026-2027 Updated",
            status: "active",
        },
    });

    assert.equal(updateMock.mock.callCount(), 1);
    assert.equal(result.academicYear.name, "2026-2027 Updated");
    assert.equal(result.academicYear.status, "active");

    t.mock.restoreAll();
    mockInstitution(t);
    mockAcademicYearFindOne(t, buildAcademicYear({ status: "archived", archivedAt: new Date() }));

    await assert.rejects(
        () =>
            academicYearService.updateAcademicYear({
                institutionId,
                academicYearId,
                payload: { status: "active" },
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Archived academic years cannot be updated");
            return true;
        }
    );
});

test("archiveAcademicYear archives the academic year", async (t) => {
    mockInstitution(t);
    mockAcademicYearFindOne(t, buildAcademicYear({ status: "active" }));
    const updateMock = t.mock.method(AcademicYear, "findOneAndUpdate", (query, update) =>
        createQuery(
            buildAcademicYear({
                status: update.$set.status,
                archivedAt: update.$set.archivedAt,
            })
        )
    );

    const result = await academicYearService.archiveAcademicYear({
        institutionId,
        academicYearId,
    });

    assert.equal(updateMock.mock.callCount(), 1);
    assert.equal(result.academicYear.status, "archived");
    assert.ok(result.academicYear.archivedAt);
});

test("createAcademicYear rejects invalid dates, duplicate names, duplicate active years, and missing institutions", async (t) => {
    mockInstitution(t);
    await assert.rejects(
        () =>
            academicYearService.createAcademicYear({
                institutionId,
                createdByUserId: actorUserId,
                payload: {
                    name: "Bad Year",
                    startDate: "2027-01-01",
                    endDate: "2027-01-01",
                },
            }),
        /endDate must be after startDate/
    );

    t.mock.restoreAll();
    mockInstitution(t);
    mockAcademicYearFindOne(t, buildAcademicYear());
    await assert.rejects(
        () =>
            academicYearService.createAcademicYear({
                institutionId,
                createdByUserId: actorUserId,
                payload: {
                    name: "2026-2027",
                    startDate: "2026-09-01",
                    endDate: "2027-06-30",
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Academic year name already exists in this institution");
            return true;
        }
    );

    t.mock.restoreAll();
    mockInstitution(t);
    t.mock.method(AcademicYear, "findOne", (query) => {
        if (query.status === "active") {
            return createQuery(buildAcademicYear({ _id: otherAcademicYearId, status: "active" }));
        }

        return createQuery(null);
    });
    await assert.rejects(
        () =>
            academicYearService.createAcademicYear({
                institutionId,
                createdByUserId: actorUserId,
                payload: {
                    name: "2026-2027",
                    startDate: "2026-09-01",
                    endDate: "2027-06-30",
                    status: "active",
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.message, "Another active academic year already exists for this institution");
            return true;
        }
    );

    t.mock.restoreAll();
    mockInstitution(t, null);
    await assert.rejects(
        () =>
            academicYearService.createAcademicYear({
                institutionId,
                createdByUserId: actorUserId,
                payload: {
                    name: "2026-2027",
                    startDate: "2026-09-01",
                    endDate: "2027-06-30",
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Institution not found");
            return true;
        }
    );
});

test("AcademicYear tenant isolation allows same name in different institutions and rejects invalid academicYearId", async (t) => {
    mockInstitution(t);
    const queries = [];
    t.mock.method(AcademicYear, "findOne", (query) => {
        queries.push(query);
        return createQuery(null);
    });
    t.mock.method(AcademicYear, "create", async (payload) => buildAcademicYear(payload));

    await academicYearService.createAcademicYear({
        institutionId: otherInstitutionId,
        createdByUserId: actorUserId,
        payload: {
            name: "2026-2027",
            startDate: "2026-09-01",
            endDate: "2027-06-30",
        },
    });

    assert.equal(queries[0].institutionId, otherInstitutionId);

    await assert.rejects(
        () => academicYearService.getAcademicYearById({ institutionId, academicYearId: "bad-id" }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Invalid academicYearId");
            return true;
        }
    );
});

test("Semester create and update can link to a valid academicYearId", async (t) => {
    mockAcademicYearFindOne(t, buildAcademicYear({ status: "active" }));
    t.mock.method(Semester, "findOne", (query) => {
        if (query.status === "active") {
            return createQuery(null);
        }

        return createQuery(buildSemester({ status: "archived", academicYearId: null }));
    });
    const createMock = t.mock.method(Semester, "create", async (payload) => buildSemester(payload));
    const updateMock = t.mock.method(Semester, "findOneAndUpdate", (query, update) =>
        createQuery(buildSemester(update.$set))
    );

    const createResult = await semesterService.createSemester({
        institutionId,
        createdByUserId: actorUserId,
        payload: {
            academicYearId: ` ${academicYearId} `,
            name: "Semester 1",
            startDate: "2026-09-01",
            endDate: "2026-12-20",
            teachingDays: ["Monday", "Wednesday"],
            status: "archived",
        },
    });
    assert.equal(createMock.mock.calls[0].arguments[0].academicYearId, academicYearId);
    assert.equal(createResult.semester.academicYearId, academicYearId);

    const updateResult = await semesterService.updateSemester({
        institutionId,
        semesterId,
        payload: {
            academicYearId: ` ${academicYearId} `,
        },
    });
    assert.equal(updateMock.mock.calls[0].arguments[1].$set.academicYearId, academicYearId);
    assert.equal(updateResult.semester.academicYearId, academicYearId);
});

test("Semester keeps omitted academicYearId backward compatible and allows clearing with null", async (t) => {
    t.mock.method(Semester, "findOne", () => createQuery(buildSemester({ academicYearId })));
    const createMock = t.mock.method(Semester, "create", async (payload) => buildSemester(payload));
    const updateMock = t.mock.method(Semester, "findOneAndUpdate", (query, update) =>
        createQuery(buildSemester(update.$set))
    );

    const createResult = await semesterService.createSemester({
        institutionId,
        createdByUserId: actorUserId,
        payload: {
            name: "Semester 1",
            startDate: "2026-09-01",
            endDate: "2026-12-20",
            teachingDays: ["Monday", "Wednesday"],
            status: "archived",
        },
    });

    assert.equal(createMock.mock.calls[0].arguments[0].academicYearId, null);
    assert.equal(createResult.semester.academicYearId, null);

    const updateResult = await semesterService.updateSemester({
        institutionId,
        semesterId,
        payload: {
            academicYearId: null,
        },
    });

    assert.equal(updateMock.mock.calls[0].arguments[1].$set.academicYearId, null);
    assert.equal(updateResult.semester.academicYearId, null);
});

test("Semester rejects invalid, wrong-tenant, and archived academicYearId links", async (t) => {
    await assert.rejects(
        () =>
            semesterService.createSemester({
                institutionId,
                createdByUserId: actorUserId,
                payload: {
                    academicYearId: "bad-id",
                    name: "Semester 1",
                    startDate: "2026-09-01",
                    endDate: "2026-12-20",
                    teachingDays: ["Monday"],
                },
            }),
        /academicYearId is invalid/
    );

    t.mock.method(AcademicYear, "findOne", (query) => {
        assert.equal(query.institutionId, institutionId);
        return createQuery(null);
    });
    t.mock.method(Semester, "findOne", () => createQuery(null));

    await assert.rejects(
        () =>
            semesterService.createSemester({
                institutionId,
                createdByUserId: actorUserId,
                payload: {
                    academicYearId,
                    name: "Semester 1",
                    startDate: "2026-09-01",
                    endDate: "2026-12-20",
                    teachingDays: ["Monday"],
                    status: "archived",
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Academic year not found");
            return true;
        }
    );

    t.mock.restoreAll();
    mockAcademicYearFindOne(t, buildAcademicYear({ status: "archived" }));
    t.mock.method(Semester, "findOne", () => createQuery(null));

    await assert.rejects(
        () =>
            semesterService.createSemester({
                institutionId,
                createdByUserId: actorUserId,
                payload: {
                    academicYearId,
                    name: "Semester 1",
                    startDate: "2026-09-01",
                    endDate: "2026-12-20",
                    teachingDays: ["Monday"],
                    status: "archived",
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Academic year is archived");
            return true;
        }
    );
});

test("SchoolAcademicPolicy validates academicYearId and linked semester academic years", async (t) => {
    mockInstitution(t);
    mockAcademicYearFindOne(t, buildAcademicYear({ status: "active" }));
    t.mock.method(ClassLevel, "findOne", () => createQuery({ _id: classLevelId, institutionId, status: "active" }));
    t.mock.method(Semester, "find", () =>
        createQuery([
            buildSemester({ _id: semesterId, academicYearId }),
            buildSemester({ _id: otherSemesterId, academicYearId }),
        ])
    );
    t.mock.method(Subject, "find", () =>
        createQuery([{ _id: subjectId, institutionId, classLevelId, departmentId: null }])
    );
    t.mock.method(SchoolAcademicPolicy, "findOne", () => createQuery(null));
    const createMock = t.mock.method(SchoolAcademicPolicy, "create", async (payload) => buildPolicyRecord(payload));

    const result = await schoolAcademicPolicyService.createSchoolAcademicPolicy({
        institutionId,
        actorUserId,
        payload: buildPolicyPayload(),
    });

    assert.equal(createMock.mock.callCount(), 1);
    assert.equal(result.schoolAcademicPolicy.appliesTo.academicYearId, academicYearId);
});

test("SchoolAcademicPolicy rejects missing academicYearId and mismatched linked semester year", async (t) => {
    mockInstitution(t);
    mockAcademicYearFindOne(t, null);

    await assert.rejects(
        () =>
            schoolAcademicPolicyService.createSchoolAcademicPolicy({
                institutionId,
                actorUserId,
                payload: buildPolicyPayload(),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Academic year not found");
            return true;
        }
    );

    t.mock.restoreAll();
    mockInstitution(t);
    mockAcademicYearFindOne(t, buildAcademicYear({ status: "active" }));
    t.mock.method(ClassLevel, "findOne", () => createQuery({ _id: classLevelId, institutionId, status: "active" }));
    t.mock.method(Semester, "find", () =>
        createQuery([
            buildSemester({ _id: semesterId, academicYearId }),
            buildSemester({ _id: otherSemesterId, academicYearId: otherAcademicYearId }),
        ])
    );
    t.mock.method(Subject, "find", () => createQuery([]));

    await assert.rejects(
        () =>
            schoolAcademicPolicyService.createSchoolAcademicPolicy({
                institutionId,
                actorUserId,
                payload: buildPolicyPayload(),
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "aggregationRules.semesterWeights must belong to appliesTo.academicYearId");
            return true;
        }
    );
});

test("SchoolAcademicPolicy rejects archived appliesTo.academicYearId and missing weighted semesters", async (t) => {
    mockInstitution(t);
    mockAcademicYearFindOne(t, buildAcademicYear({ status: "archived" }));

    await assert.rejects(
        () =>
            schoolAcademicPolicyService.createSchoolAcademicPolicy({
                institutionId,
                actorUserId,
                payload: buildPolicyPayload(),
            }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, "Academic year is archived");
            return true;
        }
    );

    t.mock.restoreAll();
    mockInstitution(t);
    mockAcademicYearFindOne(t, buildAcademicYear({ status: "active" }));
    t.mock.method(ClassLevel, "findOne", () => createQuery({ _id: classLevelId, institutionId, status: "active" }));
    t.mock.method(Semester, "find", () => createQuery([buildSemester({ _id: semesterId, academicYearId })]));

    await assert.rejects(
        () =>
            schoolAcademicPolicyService.createSchoolAcademicPolicy({
                institutionId,
                actorUserId,
                payload: buildPolicyPayload(),
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "One or more semesterWeights.semesterId values were not found");
            return true;
        }
    );
});

test("SchoolAcademicPolicy keeps old semesters without academicYearId backward compatible", async (t) => {
    mockInstitution(t);
    mockAcademicYearFindOne(t, buildAcademicYear({ status: "active" }));
    t.mock.method(ClassLevel, "findOne", () => createQuery({ _id: classLevelId, institutionId, status: "active" }));
    t.mock.method(Semester, "find", () =>
        createQuery([
            buildSemester({ _id: semesterId, academicYearId: null }),
            buildSemester({ _id: otherSemesterId, academicYearId: undefined }),
        ])
    );
    t.mock.method(Subject, "find", () =>
        createQuery([{ _id: subjectId, institutionId, classLevelId, departmentId: null }])
    );
    t.mock.method(SchoolAcademicPolicy, "findOne", () => createQuery(null));
    t.mock.method(SchoolAcademicPolicy, "create", async (payload) => buildPolicyRecord(payload));

    const result = await schoolAcademicPolicyService.createSchoolAcademicPolicy({
        institutionId,
        actorUserId,
        payload: buildPolicyPayload(),
    });

    assert.equal(result.schoolAcademicPolicy.appliesTo.academicYearId, academicYearId);
});

test("SchoolAcademicPolicy update validates academicYearId references", async (t) => {
    mockInstitution(t);
    mockAcademicYearFindOne(t, null);
    t.mock.method(SchoolAcademicPolicy, "findOne", () => createQuery(buildPolicyRecord()));

    await assert.rejects(
        () =>
            schoolAcademicPolicyService.updateSchoolAcademicPolicy({
                institutionId,
                policyId: "507f1f77bcf86cd799439071",
                actorUserId,
                payload: {
                    appliesTo: {
                        academicYearId: otherAcademicYearId,
                    },
                },
            }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, "Academic year not found");
            return true;
        }
    );
});

test("AcademicYear controllers and routes return expected envelopes and guard shape", async (t) => {
    const serviceCalls = [];
    t.mock.method(academicYearService, "createAcademicYear", async (args) => {
        serviceCalls.push({ method: "createAcademicYear", args });
        return { academicYear: buildAcademicYear() };
    });
    t.mock.method(academicYearService, "getActiveAcademicYear", async (args) => {
        serviceCalls.push({ method: "getActiveAcademicYear", args });
        return { academicYear: buildAcademicYear({ status: "active" }) };
    });

    const createRes = createResponse();
    await academicYearController.createAcademicYear(
        {
            params: { institutionId },
            user: { id: actorUserId },
            body: { name: "2026-2027" },
        },
        createRes
    );
    assert.equal(createRes.statusCode, 201);
    assert.ok(createRes.body.academicYear);

    const activeRes = createResponse();
    await academicYearController.getActiveAcademicYear(
        {
            params: { institutionId },
        },
        activeRes
    );
    assert.equal(activeRes.statusCode, 200);
    assert.equal(activeRes.body.academicYear.status, "active");
    assert.deepEqual(serviceCalls.map((call) => call.method), ["createAcademicYear", "getActiveAcademicYear"]);

    const findRoute = (path, method) =>
        institutionRoutes.stack
            .filter((layer) => layer.route)
            .map((layer) => layer.route)
            .find((route) => route.path === path && route.methods[method]);

    const createRoute = findRoute("/:institutionId/academic-years", "post");
    const activeRoute = findRoute("/:institutionId/academic-years/active", "get");
    const getRoute = findRoute("/:institutionId/academic-years/:academicYearId", "get");
    const updateRoute = findRoute("/:institutionId/academic-years/:academicYearId", "patch");
    const archiveRoute = findRoute("/:institutionId/academic-years/:academicYearId/archive", "post");

    assert.ok(createRoute);
    assert.ok(activeRoute);
    assert.ok(getRoute);
    assert.ok(updateRoute);
    assert.ok(archiveRoute);
    assert.deepEqual(
        createRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "<anonymous>", "createAcademicYear"]
    );
    assert.deepEqual(
        activeRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "<anonymous>", "getActiveAcademicYear"]
    );
    assert.deepEqual(
        archiveRoute.stack.map((layer) => layer.handle.name || "<anonymous>"),
        ["authJwt", "requireEmailVerified", "<anonymous>", "<anonymous>", "archiveAcademicYear"]
    );
});
