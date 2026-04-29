const test = require("node:test");
const assert = require("node:assert/strict");

const {
    validateSelfEnrollmentBrowseQuery,
    resolveSelfEnrollmentBrowseCandidates,
    filterSelfEnrollmentBrowseSectionList,
    toSelfEnrollmentBrowseSectionListItem,
} = require("../src/services/enrollmentService");
const { resolveSelfEnrollmentEligibility } = require("../src/services/universitySelfEnrollmentEligibilityService");

function buildPolicy(overrides = {}) {
    return {
        minimumEnrollmentCreditHours: 12,
        defaultMaxCreditHours: 18,
        overloadMinGpa: 3,
        overloadMaxCreditHours: 21,
        gpaBands: [{ minPercentage: 0, maxPercentage: 100, gradePoint: 4 }],
        ...overrides,
    };
}

function buildEligibilityContext(overrides = {}) {
    const baseContext = {
        studentMembership: {
            _id: "member-student-1",
            role: "student",
            status: "active",
        },
        activeSemester: {
            _id: "semester-active-1",
            name: "Spring 2026",
            status: "active",
        },
        targetSection: {
            _id: "section-target-1",
            semesterId: "semester-active-1",
            status: "draft",
            capacity: 30,
        },
        targetSubject: {
            _id: "subject-target-1",
            code: "CS201",
            name: "Data Structures",
            creditHours: 3,
            prerequisiteSubjectIds: [],
            status: "active",
        },
        policy: buildPolicy(),
        existingSectionEnrollment: null,
        currentSectionSeatCount: 10,
        academicOutcomeSummary: {
            outcomes: [],
            summary: {
                cumulativeGpa: 2.5,
            },
        },
        prerequisiteSubjects: [],
        currentActiveSemesterSections: [],
        currentActiveSemesterSubjects: [],
    };

    return {
        ...baseContext,
        ...overrides,
        studentMembership: {
            ...baseContext.studentMembership,
            ...(overrides.studentMembership || {}),
        },
        activeSemester: {
            ...baseContext.activeSemester,
            ...(overrides.activeSemester || {}),
        },
        targetSection: {
            ...baseContext.targetSection,
            ...(overrides.targetSection || {}),
        },
        targetSubject: {
            ...baseContext.targetSubject,
            ...(overrides.targetSubject || {}),
        },
        policy: buildPolicy(overrides.policy || {}),
        academicOutcomeSummary: {
            ...baseContext.academicOutcomeSummary,
            ...(overrides.academicOutcomeSummary || {}),
            summary: {
                ...baseContext.academicOutcomeSummary.summary,
                ...(overrides.academicOutcomeSummary?.summary || {}),
            },
            outcomes:
                overrides.academicOutcomeSummary?.outcomes || baseContext.academicOutcomeSummary.outcomes,
        },
    };
}

function buildSection(overrides = {}) {
    return {
        _id: "section-1",
        institutionId: "institution-1",
        semesterId: "semester-active-1",
        subjectId: "subject-1",
        schoolClassId: null,
        code: "A",
        title: "Section A",
        capacity: 30,
        status: "active",
        updatedAt: new Date("2026-04-20T00:00:00.000Z"),
        ...overrides,
    };
}

function buildSubject(overrides = {}) {
    return {
        _id: "subject-1",
        institutionId: "institution-1",
        code: "CS201",
        name: "Data Structures",
        creditHours: 3,
        prerequisiteSubjectIds: [],
        status: "active",
        ...overrides,
    };
}

test("resolveSelfEnrollmentBrowseCandidates keeps active-semester university discovery targets", () => {
    const activeSemester = {
        _id: "semester-active-1",
        name: "Spring 2026",
        status: "active",
    };
    const section = buildSection();
    const subject = buildSubject();
    const candidates = resolveSelfEnrollmentBrowseCandidates({
        institutionId: "institution-1",
        activeSemester,
        sections: [section],
        subjectById: new Map([[subject._id, subject]]),
    });
    const eligibility = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            activeSemester,
            targetSection: {
                _id: section._id,
                semesterId: section.semesterId,
                status: section.status,
                capacity: section.capacity,
            },
            targetSubject: subject,
            policy: { minimumEnrollmentCreditHours: 3 },
            currentSectionSeatCount: 10,
        })
    );
    const item = toSelfEnrollmentBrowseSectionListItem({
        section,
        subject,
        activeSemester,
        eligibility,
    });

    assert.equal(candidates.length, 1);
    assert.deepEqual(Object.keys(item), [
        "id",
        "semesterId",
        "subjectId",
        "code",
        "title",
        "creditHours",
        "capacity",
        "remainingSeatCount",
        "status",
        "updatedAt",
        "semester",
        "subject",
        "eligibilitySummary",
    ]);
    assert.deepEqual(item.subject, {
        id: "subject-1",
        code: "CS201",
        name: "Data Structures",
    });
    assert.deepEqual(item.semester, {
        id: "semester-active-1",
        name: "Spring 2026",
        status: "active",
        isActive: true,
    });
    assert.deepEqual(item.eligibilitySummary, {
        isEligible: true,
        blockingReasonCodes: [],
    });
    assert.equal(item.remainingSeatCount, 20);
});

test("validateSelfEnrollmentBrowseQuery keeps browse list unfiltered by default", () => {
    assert.deepEqual(validateSelfEnrollmentBrowseQuery({}), {
        availableOnly: false,
    });
});

test("resolveSelfEnrollmentBrowseCandidates excludes invalid and tenant-mismatched targets", () => {
    const activeSemester = {
        _id: "semester-active-1",
        name: "Spring 2026",
        status: "active",
    };
    const validSection = buildSection({ _id: "section-valid-1", subjectId: "subject-valid-1" });
    const validSubject = buildSubject({ _id: "subject-valid-1" });
    const candidates = resolveSelfEnrollmentBrowseCandidates({
        institutionId: "institution-1",
        activeSemester,
        sections: [
            validSection,
            buildSection({ _id: "section-other-tenant", institutionId: "institution-2", subjectId: "subject-valid-1" }),
            buildSection({ _id: "section-other-semester", semesterId: "semester-old-1", subjectId: "subject-valid-1" }),
            buildSection({ _id: "section-school", schoolClassId: "class-1", subjectId: "subject-valid-1" }),
            buildSection({ _id: "section-cancelled", status: "cancelled", subjectId: "subject-valid-1" }),
            buildSection({ _id: "section-inactive-subject", subjectId: "subject-inactive-1" }),
            buildSection({ _id: "section-no-credit", subjectId: "subject-no-credit-1" }),
            buildSection({ _id: "section-subject-other-tenant", subjectId: "subject-other-tenant-1" }),
        ],
        subjectById: new Map([
            [validSubject._id, validSubject],
            ["subject-inactive-1", buildSubject({ _id: "subject-inactive-1", status: "archived" })],
            ["subject-no-credit-1", buildSubject({ _id: "subject-no-credit-1", creditHours: null })],
            ["subject-other-tenant-1", buildSubject({ _id: "subject-other-tenant-1", institutionId: "institution-2" })],
        ]),
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].section._id, "section-valid-1");
    assert.equal(candidates[0].subject._id, "subject-valid-1");
});

test("availableOnly=true excludes full sections but keeps sections with seats", () => {
    const filteredSections = filterSelfEnrollmentBrowseSectionList({
        availableOnly: true,
        sections: [
            {
                id: "section-open-1",
                remainingSeatCount: 2,
                eligibilitySummary: {
                    isEligible: false,
                    blockingReasonCodes: ["missing_prerequisites"],
                },
            },
            {
                id: "section-open-2",
                remainingSeatCount: null,
                eligibilitySummary: {
                    isEligible: true,
                    blockingReasonCodes: [],
                },
            },
            {
                id: "section-full-1",
                remainingSeatCount: 0,
                eligibilitySummary: {
                    isEligible: false,
                    blockingReasonCodes: ["section_full"],
                },
            },
        ],
    });

    assert.deepEqual(
        filteredSections.map((section) => section.id),
        ["section-open-1", "section-open-2"]
    );
});

test("browse row eligibility summary stays consistent with the shared preview rules", () => {
    const activeSemester = {
        _id: "semester-active-1",
        name: "Spring 2026",
        status: "active",
    };
    const section = buildSection({
        _id: "section-blocked-1",
        subjectId: "subject-blocked-1",
    });
    const subject = buildSubject({
        _id: "subject-blocked-1",
        prerequisiteSubjectIds: ["subject-prereq-1"],
    });
    const eligibility = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            activeSemester,
            targetSection: {
                _id: section._id,
                semesterId: section.semesterId,
                status: section.status,
                capacity: section.capacity,
            },
            targetSubject: subject,
            policy: { minimumEnrollmentCreditHours: 3 },
            prerequisiteSubjects: [
                {
                    _id: "subject-prereq-1",
                    code: "CS101",
                    name: "Intro to CS",
                },
            ],
        })
    );
    const item = toSelfEnrollmentBrowseSectionListItem({
        section,
        subject,
        activeSemester,
        eligibility,
    });

    assert.equal(eligibility.isEligible, false);
    assert.deepEqual(eligibility.blockingReasonCodes, ["missing_prerequisites"]);
    assert.deepEqual(item.eligibilitySummary, {
        isEligible: false,
        blockingReasonCodes: ["missing_prerequisites"],
    });
});

test("browse row keeps blocked eligibility summary when seats exist but credit-load rules block enrollment", () => {
    const activeSemester = {
        _id: "semester-active-1",
        name: "Spring 2026",
        status: "active",
    };
    const section = buildSection({
        _id: "section-load-blocked-1",
        subjectId: "subject-load-blocked-1",
        capacity: 30,
    });
    const subject = buildSubject({
        _id: "subject-load-blocked-1",
        creditHours: 3,
    });
    const eligibility = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            activeSemester,
            targetSection: {
                _id: section._id,
                semesterId: section.semesterId,
                status: section.status,
                capacity: section.capacity,
            },
            targetSubject: subject,
            policy: {
                minimumEnrollmentCreditHours: 3,
                defaultMaxCreditHours: 6,
                overloadMaxCreditHours: 9,
            },
            currentSectionSeatCount: 10,
            currentActiveSemesterSections: [
                {
                    _id: "section-current-1",
                    subjectId: "subject-current-1",
                },
                {
                    _id: "section-current-2",
                    subjectId: "subject-current-2",
                },
            ],
            currentActiveSemesterSubjects: [
                {
                    _id: "subject-current-1",
                    creditHours: 3,
                },
                {
                    _id: "subject-current-2",
                    creditHours: 3,
                },
            ],
        })
    );
    const item = toSelfEnrollmentBrowseSectionListItem({
        section,
        subject,
        activeSemester,
        eligibility,
    });

    assert.equal(item.remainingSeatCount, 20);
    assert.deepEqual(item.eligibilitySummary, {
        isEligible: false,
        blockingReasonCodes: ["projected_credit_load_exceeds_max"],
    });
});

test("browse row keeps eligible summary when seats exist and no blockers apply", () => {
    const activeSemester = {
        _id: "semester-active-1",
        name: "Spring 2026",
        status: "active",
    };
    const section = buildSection({
        _id: "section-eligible-1",
        subjectId: "subject-eligible-1",
    });
    const subject = buildSubject({
        _id: "subject-eligible-1",
    });
    const eligibility = resolveSelfEnrollmentEligibility(
        buildEligibilityContext({
            activeSemester,
            targetSection: {
                _id: section._id,
                semesterId: section.semesterId,
                status: section.status,
                capacity: section.capacity,
            },
            targetSubject: subject,
            policy: { minimumEnrollmentCreditHours: 3 },
            currentSectionSeatCount: 10,
        })
    );
    const item = toSelfEnrollmentBrowseSectionListItem({
        section,
        subject,
        activeSemester,
        eligibility,
    });

    assert.deepEqual(item.eligibilitySummary, {
        isEligible: true,
        blockingReasonCodes: [],
    });
});
