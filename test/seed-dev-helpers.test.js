const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildSchoolUsefulRoutes,
    buildUsefulRoutes,
    getDatabaseNameFromUri,
    looksLikeLocalDatabaseName,
    normalizeEmail,
    normalizeName,
    normalizeNameKey,
    parseArgs,
} = require("../scripts/seed-dev");

test("seed helpers normalize safe demo identifiers", () => {
    assert.equal(normalizeEmail(" Owner@Example.Test "), "owner@example.test");
    assert.equal(normalizeName(" Demo   University "), "Demo University");
    assert.equal(normalizeNameKey(" Demo   University "), "demo university");
});

test("seed helpers parse Mongo database names", () => {
    assert.equal(
        getDatabaseNameFromUri("mongodb://localhost:27017/edu-system?retryWrites=true"),
        "edu-system"
    );
    assert.equal(
        getDatabaseNameFromUri("mongodb+srv://user:pass@example.test/edu-saas-dev?retryWrites=true"),
        "edu-saas-dev"
    );
    assert.equal(getDatabaseNameFromUri(""), "");
});

test("seed helpers identify reset-safe local database names", () => {
    assert.equal(looksLikeLocalDatabaseName("edu-saas-dev"), true);
    assert.equal(looksLikeLocalDatabaseName("edu-saas-test"), true);
    assert.equal(looksLikeLocalDatabaseName("edu-system"), true);
    assert.equal(looksLikeLocalDatabaseName("production"), false);
    assert.equal(looksLikeLocalDatabaseName("edu-saas"), false);
});

test("seed helpers parse reset argument", () => {
    assert.deepEqual(parseArgs([]), { reset: false });
    assert.deepEqual(parseArgs(["--reset"]), { reset: true });
});

test("seed output route helpers include existing university and new school demo routes", () => {
    const universityRoutes = buildUsefulRoutes(
        "institution-university",
        { programmingA: "section-programming" },
        { student1: "student-one" }
    );
    assert.ok(universityRoutes.includes("/institutions/institution-university/sections/section-programming/results"));

    const schoolRoutes = buildSchoolUsefulRoutes(
        "institution-school",
        { grade7MathA: "section-math" },
        { schoolStudentA: "student-aya" },
        {
            academicYearId: "year-school",
            semesterId: "semester-school",
            schoolClassId: "class-grade-seven-a",
        }
    );

    assert.ok(schoolRoutes.includes("/institutions/institution-school/class-levels"));
    assert.ok(
        schoolRoutes.includes(
            "/institutions/institution-school/school-outcomes/classes/class-grade-seven-a/academic-years/year-school/promotion-summary"
        )
    );
    assert.ok(
        schoolRoutes.includes(
            "/institutions/institution-school/students/me/academic-profile?academicYearId=year-school"
        )
    );
});
