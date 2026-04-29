const test = require("node:test");
const assert = require("node:assert/strict");

const Assessment = require("../src/models/Assessment");
const AssessmentResult = require("../src/models/AssessmentResult");
const Enrollment = require("../src/models/Enrollment");
const Section = require("../src/models/Section");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");
const {
    calculateSchoolSubjectSemesterOutcome,
    calculateSchoolSubjectYearOutcome,
    calculateSchoolStudentYearOutcome,
} = require("../src/services/schoolOutcomeService");

const institutionId = "507f1f77bcf86cd799439011";
const otherInstitutionId = "507f1f77bcf86cd799439099";
const studentMembershipId = "507f1f77bcf86cd799439012";
const academicYearId = "507f1f77bcf86cd799439013";
const classLevelId = "507f1f77bcf86cd799439014";
const semesterOneId = "507f1f77bcf86cd799439021";
const semesterTwoId = "507f1f77bcf86cd799439022";
const subjectOneId = "507f1f77bcf86cd799439031";
const subjectTwoId = "507f1f77bcf86cd799439032";
const sectionOneId = "507f1f77bcf86cd799439041";
const sectionTwoId = "507f1f77bcf86cd799439042";
const sectionThreeId = "507f1f77bcf86cd799439043";
const otherSectionSameSubjectId = "507f1f77bcf86cd799439044";
const assessmentOneId = "507f1f77bcf86cd799439051";
const assessmentTwoId = "507f1f77bcf86cd799439052";
const assessmentThreeId = "507f1f77bcf86cd799439053";
const assessmentFourId = "507f1f77bcf86cd799439054";
const otherSectionAssessmentId = "507f1f77bcf86cd799439057";
const enrollmentOneId = "507f1f77bcf86cd799439071";
const enrollmentTwoId = "507f1f77bcf86cd799439072";
const enrollmentThreeId = "507f1f77bcf86cd799439073";

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
        gradingRules: {
            subjectPassMinPercentage: 50,
            yearPassMinPercentage: 60,
        },
        aggregationRules: {
            semesterWeights: [
                { semesterId: semesterOneId, weight: 50 },
                { semesterId: semesterTwoId, weight: 50 },
            ],
        },
        failureRules: {
            criticalSubjectRules: [{ subjectId: subjectTwoId, failAction: "repeat_year" }],
        },
        ...overrides,
    };
}

function buildDataset(overrides = {}) {
    const semesters = [
        { _id: semesterOneId, institutionId },
        { _id: semesterTwoId, institutionId },
    ];
    const subjects = [
        {
            _id: subjectOneId,
            institutionId,
            classLevelId,
            departmentId: null,
            name: "Math",
            code: "MATH",
            status: "active",
        },
        {
            _id: subjectTwoId,
            institutionId,
            classLevelId,
            departmentId: null,
            name: "Arabic",
            code: "AR",
            status: "active",
        },
    ];
    const sections = [
        {
            _id: sectionOneId,
            institutionId,
            semesterId: semesterOneId,
            subjectId: subjectOneId,
            status: "closed",
        },
        {
            _id: sectionTwoId,
            institutionId,
            semesterId: semesterTwoId,
            subjectId: subjectOneId,
            status: "closed",
        },
        {
            _id: sectionThreeId,
            institutionId,
            semesterId: semesterOneId,
            subjectId: subjectTwoId,
            status: "closed",
        },
        {
            _id: otherSectionSameSubjectId,
            institutionId,
            semesterId: semesterOneId,
            subjectId: subjectOneId,
            status: "closed",
        },
    ];
    const enrollments = [
        {
            _id: enrollmentOneId,
            institutionId,
            sectionId: sectionOneId,
            studentMemberId: studentMembershipId,
            status: "enrolled",
        },
        {
            _id: enrollmentTwoId,
            institutionId,
            sectionId: sectionTwoId,
            studentMemberId: studentMembershipId,
            status: "enrolled",
        },
        {
            _id: enrollmentThreeId,
            institutionId,
            sectionId: sectionThreeId,
            studentMemberId: studentMembershipId,
            status: "enrolled",
        },
        {
            _id: "507f1f77bcf86cd799439074",
            institutionId,
            sectionId: otherSectionSameSubjectId,
            studentMemberId: studentMembershipId,
            status: "dropped",
        },
    ];
    const assessments = [
        {
            _id: assessmentOneId,
            institutionId,
            sectionId: sectionOneId,
            maxScore: 100,
            weight: 40,
            status: "published",
        },
        {
            _id: assessmentTwoId,
            institutionId,
            sectionId: sectionOneId,
            maxScore: 50,
            weight: 60,
            status: "published",
        },
        {
            _id: assessmentThreeId,
            institutionId,
            sectionId: sectionTwoId,
            maxScore: 100,
            weight: 100,
            status: "published",
        },
        {
            _id: assessmentFourId,
            institutionId,
            sectionId: sectionThreeId,
            maxScore: 100,
            weight: 100,
            status: "published",
        },
        {
            _id: otherSectionAssessmentId,
            institutionId,
            sectionId: otherSectionSameSubjectId,
            maxScore: 100,
            weight: 100,
            status: "published",
        },
        {
            _id: "507f1f77bcf86cd799439055",
            institutionId,
            sectionId: sectionOneId,
            maxScore: 100,
            weight: 100,
            status: "draft",
        },
        {
            _id: "507f1f77bcf86cd799439056",
            institutionId: otherInstitutionId,
            sectionId: sectionOneId,
            maxScore: 100,
            weight: 100,
            status: "published",
        },
    ];
    const assessmentResults = [
        {
            _id: "507f1f77bcf86cd799439061",
            institutionId,
            sectionId: sectionOneId,
            assessmentId: assessmentOneId,
            studentMemberId: studentMembershipId,
            score: 80,
        },
        {
            _id: "507f1f77bcf86cd799439062",
            institutionId,
            sectionId: sectionOneId,
            assessmentId: assessmentTwoId,
            studentMemberId: studentMembershipId,
            score: 40,
        },
        {
            _id: "507f1f77bcf86cd799439063",
            institutionId,
            sectionId: sectionTwoId,
            assessmentId: assessmentThreeId,
            studentMemberId: studentMembershipId,
            score: 60,
        },
        {
            _id: "507f1f77bcf86cd799439064",
            institutionId,
            sectionId: sectionThreeId,
            assessmentId: assessmentFourId,
            enrollmentId: enrollmentThreeId,
            studentMemberId: studentMembershipId,
            score: 45,
        },
        {
            _id: "507f1f77bcf86cd799439066",
            institutionId,
            sectionId: otherSectionSameSubjectId,
            assessmentId: otherSectionAssessmentId,
            enrollmentId: "507f1f77bcf86cd799439074",
            studentMemberId: studentMembershipId,
            score: 100,
        },
        {
            _id: "507f1f77bcf86cd799439065",
            institutionId: otherInstitutionId,
            sectionId: sectionOneId,
            assessmentId: assessmentOneId,
            studentMemberId: studentMembershipId,
            score: 100,
        },
    ];

    assessmentResults[0].enrollmentId = enrollmentOneId;
    assessmentResults[1].enrollmentId = enrollmentOneId;
    assessmentResults[2].enrollmentId = enrollmentTwoId;

    return {
        semesters: overrides.semesters || semesters,
        subjects: overrides.subjects || subjects,
        sections: overrides.sections || sections,
        enrollments: overrides.enrollments || enrollments,
        assessments: overrides.assessments || assessments,
        assessmentResults: overrides.assessmentResults || assessmentResults,
    };
}

function mockSchoolOutcomeModels(t, dataset, { onAssessmentFind = null } = {}) {
    t.mock.method(Semester, "findOne", (query) => {
        const result = dataset.semesters.find(
            (semester) =>
                normalizeId(semester._id) === normalizeId(query._id) &&
                normalizeId(semester.institutionId) === normalizeId(query.institutionId)
        );
        return createQuery(result || null);
    });

    t.mock.method(Subject, "findOne", (query) => {
        const result = dataset.subjects.find((subject) => {
            if (normalizeId(subject._id) !== normalizeId(query._id)) {
                return false;
            }

            if (normalizeId(subject.institutionId) !== normalizeId(query.institutionId)) {
                return false;
            }

            if (query.classLevelId && normalizeId(subject.classLevelId) !== normalizeId(query.classLevelId)) {
                return false;
            }

            return true;
        });
        return createQuery(result || null);
    });

    t.mock.method(Subject, "find", (query) => {
        const result = dataset.subjects.filter(
            (subject) =>
                normalizeId(subject.institutionId) === normalizeId(query.institutionId) &&
                normalizeId(subject.classLevelId) === normalizeId(query.classLevelId) &&
                subject.departmentId === query.departmentId &&
                subject.status === query.status
        );
        return createQuery(result);
    });

    t.mock.method(Section, "find", (query) => {
        const result = dataset.sections.filter((section) => {
            if (normalizeId(section.institutionId) !== normalizeId(query.institutionId)) {
                return false;
            }

            if (query._id?.$in && !includesId(query._id.$in, section._id)) {
                return false;
            }

            if (query.subjectId && normalizeId(section.subjectId) !== normalizeId(query.subjectId)) {
                return false;
            }

            if (query.semesterId?.$in && !includesId(query.semesterId.$in, section.semesterId)) {
                return false;
            }

            if (query.semesterId && !query.semesterId.$in && normalizeId(section.semesterId) !== normalizeId(query.semesterId)) {
                return false;
            }

            return true;
        });
        return createQuery(result);
    });

    t.mock.method(Enrollment, "find", (query) => {
        const sectionIds = query.sectionId?.$in || null;
        const result = dataset.enrollments.filter((enrollment) => {
            if (normalizeId(enrollment.institutionId) !== normalizeId(query.institutionId)) {
                return false;
            }

            if (query.studentMemberId && normalizeId(enrollment.studentMemberId) !== normalizeId(query.studentMemberId)) {
                return false;
            }

            if (query.status && enrollment.status !== query.status) {
                return false;
            }

            if (sectionIds && !includesId(sectionIds, enrollment.sectionId)) {
                return false;
            }

            return true;
        });

        return createQuery(result);
    });

    t.mock.method(Assessment, "find", (query) => {
        if (onAssessmentFind) {
            onAssessmentFind(query);
        }

        const sectionIds = query.sectionId?.$in || [];
        const result = dataset.assessments.filter(
            (assessment) =>
                normalizeId(assessment.institutionId) === normalizeId(query.institutionId) &&
                includesId(sectionIds, assessment.sectionId) &&
                assessment.status === query.status
        );
        return createQuery(result);
    });

    t.mock.method(AssessmentResult, "find", (query) => {
        const sectionIds = query.sectionId?.$in || [];
        const assessmentIds = query.assessmentId?.$in || [];
        const enrollmentIds = query.enrollmentId?.$in || [];
        const result = dataset.assessmentResults.filter(
            (assessmentResult) =>
                normalizeId(assessmentResult.institutionId) === normalizeId(query.institutionId) &&
                normalizeId(assessmentResult.studentMemberId) === normalizeId(query.studentMemberId) &&
                includesId(enrollmentIds, assessmentResult.enrollmentId) &&
                includesId(sectionIds, assessmentResult.sectionId) &&
                includesId(assessmentIds, assessmentResult.assessmentId)
        );
        return createQuery(result);
    });
}

test("calculates subject semester percentage from published AssessmentResult", async (t) => {
    mockSchoolOutcomeModels(t, buildDataset());

    const outcome = await calculateSchoolSubjectSemesterOutcome({
        institutionId,
        studentMembershipId,
        subjectId: subjectOneId,
        semesterId: semesterOneId,
        policy: buildPolicy(),
    });

    assert.equal(outcome.percentage, 80);
    assert.equal(outcome.passed, true);
    assert.equal(outcome.failed, false);
    assert.equal(outcome.complete, true);
    assert.equal(outcome.hasMissingResults, false);
    assert.equal(outcome.passedBasedOnAvailableResults, true);
    assert.equal(outcome.source.publishedAssessmentCount, 2);
    assert.equal(outcome.source.resultCount, 2);
});

test("ignores draft and unpublished assessments", async (t) => {
    const assessmentQueries = [];
    mockSchoolOutcomeModels(t, buildDataset(), {
        onAssessmentFind(query) {
            assessmentQueries.push(query);
        },
    });

    const outcome = await calculateSchoolSubjectSemesterOutcome({
        institutionId,
        studentMembershipId,
        subjectId: subjectOneId,
        semesterId: semesterOneId,
        policy: buildPolicy(),
    });

    assert.equal(outcome.percentage, 80);
    assert.ok(assessmentQueries.every((query) => query.status === "published"));
    assert.deepEqual(outcome.source.assessmentIds, [assessmentOneId, assessmentTwoId]);
});

test("subject semester outcome uses only the student's enrolled section", async (t) => {
    mockSchoolOutcomeModels(t, buildDataset());

    const outcome = await calculateSchoolSubjectSemesterOutcome({
        institutionId,
        studentMembershipId,
        subjectId: subjectOneId,
        semesterId: semesterOneId,
        policy: buildPolicy(),
    });

    assert.deepEqual(outcome.source.sectionIds, [sectionOneId]);
    assert.deepEqual(outcome.source.enrollmentIds, [enrollmentOneId]);
    assert.deepEqual(outcome.source.assessmentIds, [assessmentOneId, assessmentTwoId]);
    assert.equal(outcome.missingResults.some((warning) => warning.assessmentId === otherSectionAssessmentId), false);
});

test("no enrolled subject section returns a missing warning", async (t) => {
    const dataset = buildDataset({
        enrollments: buildDataset().enrollments.filter(
            (enrollment) => normalizeId(enrollment.sectionId) !== sectionOneId
        ),
    });
    mockSchoolOutcomeModels(t, dataset);

    const outcome = await calculateSchoolSubjectSemesterOutcome({
        institutionId,
        studentMembershipId,
        subjectId: subjectOneId,
        semesterId: semesterOneId,
        policy: buildPolicy(),
    });

    assert.equal(outcome.percentage, null);
    assert.equal(outcome.complete, false);
    assert.equal(outcome.hasMissingResults, true);
    assert.equal(outcome.passed, false);
    assert.equal(outcome.failed, false);
    assert.equal(outcome.missingResults[0].code, "no_enrolled_subject_section");
});

test("calculates subject yearly percentage with 50/50 semester weights", async (t) => {
    mockSchoolOutcomeModels(t, buildDataset());

    const outcome = await calculateSchoolSubjectYearOutcome({
        institutionId,
        studentMembershipId,
        subjectId: subjectOneId,
        academicYearId,
        policy: buildPolicy(),
    });

    assert.equal(outcome.yearlyPercentage, 70);
    assert.equal(outcome.passed, true);
    assert.equal(outcome.complete, true);
    assert.equal(outcome.hasMissingResults, false);
    assert.equal(outcome.semesterBreakdown.length, 2);
});

test("calculates subject yearly percentage with custom semester weights", async (t) => {
    mockSchoolOutcomeModels(t, buildDataset());

    const outcome = await calculateSchoolSubjectYearOutcome({
        institutionId,
        studentMembershipId,
        subjectId: subjectOneId,
        academicYearId,
        policy: buildPolicy({
            aggregationRules: {
                semesterWeights: [
                    { semesterId: semesterOneId, weight: 40 },
                    { semesterId: semesterTwoId, weight: 60 },
                ],
            },
        }),
    });

    assert.equal(outcome.yearlyPercentage, 68);
});

test("calculates student yearly average", async (t) => {
    mockSchoolOutcomeModels(t, buildDataset());

    const outcome = await calculateSchoolStudentYearOutcome({
        institutionId,
        studentMembershipId,
        academicYearId,
        classLevelId,
        policy: buildPolicy(),
    });

    assert.equal(outcome.yearlyAveragePercentage, 57.5);
    assert.equal(outcome.complete, false);
    assert.equal(outcome.hasMissingResults, true);
    assert.equal(outcome.passedYearAverage, false);
    assert.equal(outcome.failedSubjectCount, 1);
    assert.equal(outcome.subjects.length, 2);
});

test("detects failed subject based on subjectPassMinPercentage", async (t) => {
    mockSchoolOutcomeModels(t, buildDataset());

    const outcome = await calculateSchoolSubjectYearOutcome({
        institutionId,
        studentMembershipId,
        subjectId: subjectTwoId,
        academicYearId,
        policy: buildPolicy(),
    });

    assert.equal(outcome.yearlyPercentage, 45);
    assert.equal(outcome.passed, false);
    assert.equal(outcome.failed, false);
    assert.equal(outcome.failedBasedOnAvailableResults, true);
    assert.equal(outcome.complete, false);
});

test("detects critical failed subject from policy criticalSubjectRules", async (t) => {
    mockSchoolOutcomeModels(t, buildDataset());

    const outcome = await calculateSchoolStudentYearOutcome({
        institutionId,
        studentMembershipId,
        academicYearId,
        classLevelId,
        policy: buildPolicy(),
    });

    assert.deepEqual(outcome.criticalFailedSubjects, [
        {
            subjectId: subjectTwoId,
            yearlyPercentage: 45,
            failAction: "repeat_year",
        },
    ]);
});

test("detects missing result without crashing", async (t) => {
    const dataset = buildDataset({
        assessmentResults: buildDataset().assessmentResults.filter(
            (assessmentResult) => normalizeId(assessmentResult.assessmentId) !== assessmentTwoId
        ),
    });
    mockSchoolOutcomeModels(t, dataset);

    const outcome = await calculateSchoolSubjectSemesterOutcome({
        institutionId,
        studentMembershipId,
        subjectId: subjectOneId,
        semesterId: semesterOneId,
        policy: buildPolicy(),
    });

    assert.equal(outcome.percentage, 80);
    assert.equal(outcome.missingResults.length, 1);
    assert.equal(outcome.complete, false);
    assert.equal(outcome.hasMissingResults, true);
    assert.equal(outcome.passed, false);
    assert.equal(outcome.passedBasedOnAvailableResults, true);
    assert.equal(outcome.missingResults[0].code, "missing_assessment_result");
    assert.equal(outcome.missingResults[0].assessmentId, assessmentTwoId);
});

test("invalid assessment maxScore does not produce NaN and returns configuration warning", async (t) => {
    const dataset = buildDataset({
        assessments: buildDataset().assessments.map((assessment) =>
            normalizeId(assessment._id) === assessmentOneId
                ? { ...assessment, maxScore: 0 }
                : assessment
        ),
    });
    mockSchoolOutcomeModels(t, dataset);

    const outcome = await calculateSchoolSubjectSemesterOutcome({
        institutionId,
        studentMembershipId,
        subjectId: subjectOneId,
        semesterId: semesterOneId,
        policy: buildPolicy(),
    });

    assert.equal(outcome.percentage, 80);
    assert.equal(Number.isNaN(outcome.percentage), false);
    assert.equal(outcome.source.applicableWeightTotal, 60);
    assert.equal(outcome.missingResults[0].code, "invalid_assessment_configuration");
    assert.equal(outcome.missingResults[0].assessmentId, assessmentOneId);
});

test("invalid assessment weight does not produce NaN and returns configuration warning", async (t) => {
    const dataset = buildDataset({
        assessments: buildDataset().assessments.map((assessment) =>
            normalizeId(assessment._id) === assessmentTwoId
                ? { ...assessment, weight: null }
                : assessment
        ),
    });
    mockSchoolOutcomeModels(t, dataset);

    const outcome = await calculateSchoolSubjectSemesterOutcome({
        institutionId,
        studentMembershipId,
        subjectId: subjectOneId,
        semesterId: semesterOneId,
        policy: buildPolicy(),
    });

    assert.equal(outcome.percentage, 80);
    assert.equal(Number.isNaN(outcome.source.publishedWeightTotal), false);
    assert.equal(outcome.source.applicableWeightTotal, 40);
    assert.equal(outcome.missingResults[0].code, "invalid_assessment_configuration");
    assert.equal(outcome.missingResults[0].assessmentId, assessmentTwoId);
});

test("keeps tenant isolation and does not use results from another institution", async (t) => {
    mockSchoolOutcomeModels(t, buildDataset());

    const outcome = await calculateSchoolSubjectSemesterOutcome({
        institutionId,
        studentMembershipId,
        subjectId: subjectOneId,
        semesterId: semesterOneId,
        policy: buildPolicy(),
    });

    assert.equal(outcome.percentage, 80);
    assert.equal(outcome.source.resultCount, 2);
});
