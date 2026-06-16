const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const AcademicDecision = require("../src/models/AcademicDecision");
const Assessment = require("../src/models/Assessment");
const AssessmentResult = require("../src/models/AssessmentResult");
const AttendanceRecord = require("../src/models/AttendanceRecord");
const ClassLevel = require("../src/models/ClassLevel");
const Department = require("../src/models/Department");
const Enrollment = require("../src/models/Enrollment");
const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");
const Notification = require("../src/models/Notification");
const ResponsibilityAssignment = require("../src/models/ResponsibilityAssignment");
const SchoolClass = require("../src/models/SchoolClass");
const Section = require("../src/models/Section");
const SectionSession = require("../src/models/SectionSession");
const Subject = require("../src/models/Subject");
const academicDecisionController = require("../src/controllers/academicDecisionController");
const notificationController = require("../src/controllers/notificationController");
const academicDecisionService = require("../src/services/academicDecisionService");
const academicOversightService = require("../src/services/academicOversightService");
const notificationService = require("../src/services/notificationService");
const universityAcademicOutcomeService = require("../src/services/universityAcademicOutcomeService");
const institutionRoutes = require("../src/routes/institutionRoutes");

const institutionId = "507f1f77bcf86cd799449011";
const otherInstitutionId = "507f1f77bcf86cd799449012";
const ownerUserId = "507f1f77bcf86cd799449021";
const adminUserId = "507f1f77bcf86cd799449022";
const otherAdminUserId = "507f1f77bcf86cd799449023";
const headUserId = "507f1f77bcf86cd799449024";
const secondHeadUserId = "507f1f77bcf86cd799449025";
const coordinatorUserId = "507f1f77bcf86cd799449026";
const mentorUserId = "507f1f77bcf86cd799449027";
const instructorUserId = "507f1f77bcf86cd799449028";
const studentUserId = "507f1f77bcf86cd799449029";
const inactiveAdminUserId = "507f1f77bcf86cd79944902a";
const crossTenantAdminUserId = "507f1f77bcf86cd79944902b";
const ownerMembershipId = "507f1f77bcf86cd799449031";
const adminMembershipId = "507f1f77bcf86cd799449032";
const otherAdminMembershipId = "507f1f77bcf86cd799449033";
const headMembershipId = "507f1f77bcf86cd799449034";
const secondHeadMembershipId = "507f1f77bcf86cd799449035";
const coordinatorMembershipId = "507f1f77bcf86cd799449036";
const mentorMembershipId = "507f1f77bcf86cd799449037";
const instructorMembershipId = "507f1f77bcf86cd799449038";
const studentMembershipId = "507f1f77bcf86cd799449039";
const inactiveAdminMembershipId = "507f1f77bcf86cd79944903a";
const crossTenantAdminMembershipId = "507f1f77bcf86cd79944903b";
const departmentId = "507f1f77bcf86cd799449041";
const otherDepartmentId = "507f1f77bcf86cd799449042";
const classLevelId = "507f1f77bcf86cd799449043";
const subjectId = "507f1f77bcf86cd799449044";
const classSubjectId = "507f1f77bcf86cd799449045";
const schoolClassId = "507f1f77bcf86cd799449046";
const sectionId = "507f1f77bcf86cd799449051";
const classSectionId = "507f1f77bcf86cd799449052";
const outsideSectionId = "507f1f77bcf86cd799449053";
const enrollmentId = "507f1f77bcf86cd799449061";
const classEnrollmentId = "507f1f77bcf86cd799449062";
const droppedEnrollmentId = "507f1f77bcf86cd799449063";
const outsideEnrollmentId = "507f1f77bcf86cd799449064";
const decisionId = "507f1f77bcf86cd799449071";
const approvedDecisionId = "507f1f77bcf86cd799449072";
const notificationId = "507f1f77bcf86cd799449081";

function normalizeId(value) {
    return value === undefined || value === null ? null : value.toString();
}

function createQuery(result) {
    const state = {
        result,
        skip: 0,
        limit: null,
    };
    const query = {
        select() {
            return this;
        },
        sort() {
            return this;
        },
        skip(value) {
            state.skip = Number(value) || 0;
            return this;
        },
        limit(value) {
            state.limit = Number(value) || null;
            return this;
        },
        lean: async () => {
            if (!Array.isArray(state.result)) {
                return state.result;
            }
            const skipped = state.result.slice(state.skip);
            return state.limit === null ? skipped : skipped.slice(0, state.limit);
        },
        then(resolve, reject) {
            return this.lean().then(resolve, reject);
        },
    };

    return query;
}

function matchesValue(value, condition) {
    if (condition === undefined) {
        return true;
    }

    if (condition && typeof condition === "object" && !Array.isArray(condition)) {
        if (condition.$in) {
            return condition.$in.map(normalizeId).includes(normalizeId(value));
        }
        if (condition.$ne !== undefined) {
            return normalizeId(value) !== normalizeId(condition.$ne);
        }
    }

    return normalizeId(value) === normalizeId(condition);
}

function readPath(record, path) {
    return path.split(".").reduce((current, key) => (current ? current[key] : undefined), record);
}

function matchesRecord(record, query = {}) {
    return Object.entries(query).every(([field, condition]) => {
        if (field === "$or") {
            return condition.some((item) => matchesRecord(record, item));
        }

        return matchesValue(readPath(record, field), condition);
    });
}

function buildMembership(overrides = {}) {
    return {
        _id: headMembershipId,
        institutionId,
        userId: headUserId,
        role: "instructor",
        status: "active",
        ...overrides,
    };
}

function buildAssignment(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799449091",
        institutionId,
        userId: headUserId,
        responsibilityType: "head",
        scopeType: "department",
        scopeId: departmentId,
        permissions: ["billing.manage", "enrollment.drop", "academicDecision.approve"],
        isActive: true,
        startAt: null,
        endAt: null,
        ...overrides,
    };
}

function buildDecision(overrides = {}) {
    const now = new Date("2026-06-14T10:00:00.000Z");
    const status = overrides.status || "recommended";
    return {
        _id: decisionId,
        institutionId,
        studentMemberId: studentMembershipId,
        enrollmentId,
        sectionId,
        decisionType: "enrollment_drop",
        status,
        isOpen: ["recommended", "approved", "applying"].includes(status),
        reason: "Student has repeated high-risk indicators requiring review.",
        evidenceSnapshot: {
            capturedAt: now,
            attendanceRisk: { level: "warning" },
            gradeRisk: { level: "high" },
            academicStanding: { standing: "probation", dataUnavailable: false },
        },
        scopeSnapshot: {
            responsibilityType: "head",
            matchedAssignmentIds: ["507f1f77bcf86cd799449091"],
            institutionWide: false,
            departmentIds: [departmentId],
            classLevelIds: [],
            sectionId,
        },
        reviewSnapshot: null,
        recommendedByUserId: headUserId,
        approvedByUserId: null,
        rejectedByUserId: null,
        appliedByUserId: null,
        applyingByUserId: null,
        cancelledByUserId: null,
        recommendedAt: now,
        approvedAt: null,
        rejectedAt: null,
        appliedAt: null,
        applyingAt: null,
        cancelledAt: null,
        history: [
            {
                action: "recommended",
                fromStatus: null,
                toStatus: "recommended",
                actorUserId: headUserId,
                at: now,
                note: null,
            },
        ],
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

function buildApprovedDecision(overrides = {}) {
    const now = new Date("2026-06-14T10:00:00.000Z");
    return buildDecision({
        status: "approved",
        isOpen: true,
        approvedByUserId: adminUserId,
        approvedAt: new Date("2026-06-14T11:00:00.000Z"),
        history: [
            {
                action: "recommended",
                fromStatus: null,
                toStatus: "recommended",
                actorUserId: headUserId,
                at: now,
                note: null,
            },
            {
                action: "approved",
                fromStatus: "recommended",
                toStatus: "approved",
                actorUserId: adminUserId,
                at: new Date("2026-06-14T11:00:00.000Z"),
                note: null,
            },
        ],
        ...overrides,
    });
}

function buildDataset(overrides = {}) {
    return {
        institutions: [
            {
                _id: institutionId,
                ownerUserId,
                type: "university",
                policies: {
                    warnAfterAbsences: 1,
                    dropAfterAbsences: 2,
                    lateToAbsenceRatio: 2,
                    excusedCountsAsAbsence: false,
                },
            },
            { _id: otherInstitutionId, ownerUserId: crossTenantAdminUserId, type: "university" },
        ],
        memberships: [
            buildMembership({
                _id: ownerMembershipId,
                userId: ownerUserId,
                role: "admin",
            }),
            buildMembership({
                _id: adminMembershipId,
                userId: adminUserId,
                role: "admin",
            }),
            buildMembership({
                _id: otherAdminMembershipId,
                userId: ownerUserId,
                role: "admin",
            }),
            buildMembership(),
            buildMembership({
                _id: secondHeadMembershipId,
                userId: secondHeadUserId,
            }),
            buildMembership({
                _id: coordinatorMembershipId,
                userId: coordinatorUserId,
            }),
            buildMembership({
                _id: mentorMembershipId,
                userId: mentorUserId,
            }),
            buildMembership({
                _id: instructorMembershipId,
                userId: instructorUserId,
            }),
            buildMembership({
                _id: studentMembershipId,
                userId: studentUserId,
                role: "student",
            }),
            buildMembership({
                _id: inactiveAdminMembershipId,
                userId: inactiveAdminUserId,
                role: "admin",
                status: "suspended",
            }),
            buildMembership({
                _id: crossTenantAdminMembershipId,
                institutionId: otherInstitutionId,
                userId: crossTenantAdminUserId,
                role: "admin",
            }),
        ],
        assignments: [
            buildAssignment(),
            buildAssignment({
                _id: "507f1f77bcf86cd799449092",
                userId: secondHeadUserId,
            }),
            buildAssignment({
                _id: "507f1f77bcf86cd799449093",
                userId: coordinatorUserId,
                responsibilityType: "coordinator",
            }),
            buildAssignment({
                _id: "507f1f77bcf86cd799449094",
                userId: mentorUserId,
                responsibilityType: "mentor",
                scopeType: "section",
                scopeId: sectionId,
            }),
        ],
        departments: [
            { _id: departmentId, institutionId },
            { _id: otherDepartmentId, institutionId: otherInstitutionId },
        ],
        classLevels: [{ _id: classLevelId, institutionId }],
        schoolClasses: [{ _id: schoolClassId, institutionId, classLevelId }],
        subjects: [
            { _id: subjectId, institutionId, departmentId, classLevelId: null },
            { _id: classSubjectId, institutionId, departmentId: null, classLevelId },
        ],
        sections: [
            { _id: sectionId, institutionId, subjectId, schoolClassId: null, status: "active" },
            { _id: classSectionId, institutionId, subjectId: classSubjectId, schoolClassId, status: "active" },
            { _id: outsideSectionId, institutionId, subjectId: classSubjectId, schoolClassId: null, status: "active" },
        ],
        enrollments: [
            {
                _id: enrollmentId,
                institutionId,
                sectionId,
                studentMemberId: studentMembershipId,
                status: "enrolled",
                droppedAt: null,
                droppedByUserId: null,
                droppedByAcademicDecisionId: null,
            },
            {
                _id: classEnrollmentId,
                institutionId,
                sectionId: classSectionId,
                studentMemberId: studentMembershipId,
                status: "enrolled",
                droppedAt: null,
                droppedByUserId: null,
                droppedByAcademicDecisionId: null,
            },
            {
                _id: droppedEnrollmentId,
                institutionId,
                sectionId,
                studentMemberId: studentMembershipId,
                status: "dropped",
                droppedAt: new Date("2026-06-14T09:00:00.000Z"),
                droppedByUserId: adminUserId,
                droppedByAcademicDecisionId: null,
            },
            {
                _id: outsideEnrollmentId,
                institutionId,
                sectionId: outsideSectionId,
                studentMemberId: studentMembershipId,
                status: "enrolled",
                droppedAt: null,
                droppedByUserId: null,
                droppedByAcademicDecisionId: null,
            },
        ],
        sectionSessions: [
            {
                _id: "507f1f77bcf86cd7994490a1",
                institutionId,
                sectionId,
                status: "completed",
                attendanceState: "closed",
            },
        ],
        attendanceRecords: [
            {
                _id: "507f1f77bcf86cd7994490a2",
                institutionId,
                sectionId,
                sectionSessionId: "507f1f77bcf86cd7994490a1",
                studentMemberId: studentMembershipId,
                attendanceStatus: "absent",
            },
            {
                _id: "507f1f77bcf86cd7994490a3",
                institutionId,
                sectionId,
                sectionSessionId: "507f1f77bcf86cd7994490a1",
                studentMemberId: studentMembershipId,
                attendanceStatus: "late",
            },
        ],
        assessments: [
            {
                _id: "507f1f77bcf86cd7994490b1",
                institutionId,
                sectionId,
                status: "published",
                maxScore: 100,
                weight: 100,
            },
        ],
        assessmentResults: [
            {
                _id: "507f1f77bcf86cd7994490b2",
                institutionId,
                sectionId,
                assessmentId: "507f1f77bcf86cd7994490b1",
                studentMemberId: studentMembershipId,
                score: 55,
            },
        ],
        decisions: [],
        notifications: [],
        academicDecisionCreateErrors: [],
        academicDecisionFindOneAndUpdateCallCount: 0,
        academicDecisionFindOneAndUpdateNullOnCalls: [],
        enrollmentFindOneAndUpdateNullOnCalls: [],
        queryLog: [],
        writeLog: [],
        ...overrides,
    };
}

function mockReadOnlyModel(t, model, modelName, records, data) {
    t.mock.method(model, "findOne", (query) => {
        data.queryLog.push({ model: modelName, method: "findOne", query });
        return createQuery(records.find((record) => matchesRecord(record, query)) || null);
    });
    t.mock.method(model, "find", (query) => {
        data.queryLog.push({ model: modelName, method: "find", query });
        return createQuery(records.filter((record) => matchesRecord(record, query)));
    });
    for (const method of [
        "create",
        "bulkWrite",
        "updateOne",
        "updateMany",
        "deleteOne",
        "deleteMany",
        "findOneAndUpdate",
        "findByIdAndUpdate",
        "findByIdAndDelete",
    ]) {
        t.mock.method(model, method, (...args) => {
            data.writeLog.push({ model: modelName, method, args });
            throw new Error(`${modelName}.${method} should not be called by academic decision phase 1`);
        });
    }
}

function mockAcademicDecisionModel(t, data) {
    t.mock.method(AcademicDecision, "findOne", (query) => {
        data.queryLog.push({ model: "AcademicDecision", method: "findOne", query });
        return createQuery(data.decisions.find((record) => matchesRecord(record, query)) || null);
    });
    t.mock.method(AcademicDecision, "find", (query) => {
        data.queryLog.push({ model: "AcademicDecision", method: "find", query });
        return createQuery(data.decisions.filter((record) => matchesRecord(record, query)));
    });
    t.mock.method(AcademicDecision, "countDocuments", async (query) => {
        data.queryLog.push({ model: "AcademicDecision", method: "countDocuments", query });
        return data.decisions.filter((record) => matchesRecord(record, query)).length;
    });
    t.mock.method(AcademicDecision, "create", async (payload) => {
        data.writeLog.push({ model: "AcademicDecision", method: "create", payload });
        if (data.academicDecisionCreateErrors.length) {
            throw data.academicDecisionCreateErrors.shift();
        }
        const record = {
            _id: payload._id || decisionId,
            ...payload,
            createdAt: payload.createdAt || new Date("2026-06-14T11:00:00.000Z"),
            updatedAt: payload.updatedAt || new Date("2026-06-14T11:00:00.000Z"),
        };
        data.decisions.push(record);
        return record;
    });
    t.mock.method(AcademicDecision, "findOneAndUpdate", (query, update) => {
        data.queryLog.push({ model: "AcademicDecision", method: "findOneAndUpdate", query });
        data.writeLog.push({ model: "AcademicDecision", method: "findOneAndUpdate", query, update });
        data.academicDecisionFindOneAndUpdateCallCount += 1;
        if (data.academicDecisionFindOneAndUpdateNullOnCalls.includes(data.academicDecisionFindOneAndUpdateCallCount)) {
            return createQuery(null);
        }
        const record = data.decisions.find((item) => matchesRecord(item, query)) || null;
        if (!record) {
            return createQuery(null);
        }
        Object.assign(record, update.$set || {});
        if (update.$push?.history) {
            record.history = [...(record.history || []), update.$push.history];
        }
        record.updatedAt = new Date("2026-06-14T12:00:00.000Z");
        return createQuery(record);
    });
}

function mockEnrollmentModel(t, data) {
    t.mock.method(Enrollment, "findOne", (query) => {
        data.queryLog.push({ model: "Enrollment", method: "findOne", query });
        return createQuery(data.enrollments.find((record) => matchesRecord(record, query)) || null);
    });
    t.mock.method(Enrollment, "find", (query) => {
        data.queryLog.push({ model: "Enrollment", method: "find", query });
        return createQuery(data.enrollments.filter((record) => matchesRecord(record, query)));
    });
    t.mock.method(Enrollment, "findOneAndUpdate", (query, update) => {
        data.queryLog.push({ model: "Enrollment", method: "findOneAndUpdate", query });
        data.writeLog.push({ model: "Enrollment", method: "findOneAndUpdate", query, update });
        const callCount = data.writeLog.filter(
            (entry) => entry.model === "Enrollment" && entry.method === "findOneAndUpdate"
        ).length;
        if (data.enrollmentFindOneAndUpdateNullOnCalls.includes(callCount)) {
            return createQuery(null);
        }
        const record = data.enrollments.find((item) => matchesRecord(item, query)) || null;
        if (!record) {
            return createQuery(null);
        }
        Object.assign(record, update.$set || {});
        record.updatedAt = new Date("2026-06-14T12:02:00.000Z");
        return createQuery(record);
    });
    for (const method of [
        "create",
        "bulkWrite",
        "updateOne",
        "updateMany",
        "deleteOne",
        "deleteMany",
        "findByIdAndUpdate",
        "findByIdAndDelete",
    ]) {
        t.mock.method(Enrollment, method, (...args) => {
            data.writeLog.push({ model: "Enrollment", method, args });
            throw new Error(`${method} should not be called by academic decision apply`);
        });
    }
}

function mockNotificationModel(t, data) {
    t.mock.method(Notification, "findOne", (query) => {
        data.queryLog.push({ model: "Notification", method: "findOne", query });
        return createQuery(data.notifications.find((record) => matchesRecord(record, query)) || null);
    });
    t.mock.method(Notification, "find", (query) => {
        data.queryLog.push({ model: "Notification", method: "find", query });
        return createQuery(data.notifications.filter((record) => matchesRecord(record, query)));
    });
    t.mock.method(Notification, "countDocuments", async (query) => {
        data.queryLog.push({ model: "Notification", method: "countDocuments", query });
        return data.notifications.filter((record) => matchesRecord(record, query)).length;
    });
    t.mock.method(Notification, "create", async (payload) => {
        data.writeLog.push({ model: "Notification", method: "create", payload });
        const existing = data.notifications.find(
            (record) =>
                normalizeId(record.institutionId) === normalizeId(payload.institutionId) &&
                normalizeId(record.recipientUserId) === normalizeId(payload.recipientUserId) &&
                record.type === payload.type &&
                normalizeId(record.data?.academicDecisionId) === normalizeId(payload.data?.academicDecisionId)
        );
        if (existing) {
            const error = new Error("duplicate key");
            error.name = "MongoServerError";
            error.code = 11000;
            throw error;
        }
        const record = {
            _id: notificationId.slice(0, -1) + String(data.notifications.length + 1),
            ...payload,
            readAt: null,
            createdAt: new Date("2026-06-14T11:01:00.000Z"),
            updatedAt: new Date("2026-06-14T11:01:00.000Z"),
        };
        data.notifications.push(record);
        return record;
    });
    t.mock.method(Notification, "findOneAndUpdate", (query, update) => {
        data.queryLog.push({ model: "Notification", method: "findOneAndUpdate", query });
        data.writeLog.push({ model: "Notification", method: "findOneAndUpdate", query, update });
        const record = data.notifications.find((item) => matchesRecord(item, query)) || null;
        if (!record) {
            return createQuery(null);
        }
        Object.assign(record, update.$set || {});
        record.updatedAt = new Date("2026-06-14T12:01:00.000Z");
        return createQuery(record);
    });
    t.mock.method(Notification, "updateMany", async (query, update) => {
        data.queryLog.push({ model: "Notification", method: "updateMany", query });
        data.writeLog.push({ model: "Notification", method: "updateMany", query, update });
        const records = data.notifications.filter((item) => matchesRecord(item, query));
        for (const record of records) {
            Object.assign(record, update.$set || {});
            record.updatedAt = new Date("2026-06-14T12:01:00.000Z");
        }
        return {
            matchedCount: records.length,
            modifiedCount: records.length,
        };
    });
}

function mockDependencies(t, overrides = {}) {
    const data = buildDataset(overrides);
    mockReadOnlyModel(t, Institution, "Institution", data.institutions, data);
    mockReadOnlyModel(t, Membership, "Membership", data.memberships, data);
    mockReadOnlyModel(t, ResponsibilityAssignment, "ResponsibilityAssignment", data.assignments, data);
    mockReadOnlyModel(t, Department, "Department", data.departments, data);
    mockReadOnlyModel(t, ClassLevel, "ClassLevel", data.classLevels, data);
    mockReadOnlyModel(t, SchoolClass, "SchoolClass", data.schoolClasses, data);
    mockReadOnlyModel(t, Subject, "Subject", data.subjects, data);
    mockReadOnlyModel(t, Section, "Section", data.sections, data);
    mockEnrollmentModel(t, data);
    mockReadOnlyModel(t, SectionSession, "SectionSession", data.sectionSessions, data);
    mockReadOnlyModel(t, AttendanceRecord, "AttendanceRecord", data.attendanceRecords, data);
    mockReadOnlyModel(t, Assessment, "Assessment", data.assessments, data);
    mockReadOnlyModel(t, AssessmentResult, "AssessmentResult", data.assessmentResults, data);
    mockAcademicDecisionModel(t, data);
    mockNotificationModel(t, data);

    t.mock.method(universityAcademicOutcomeService, "listStudentAcademicOutcomes", async () => ({
        outcomes: [{ outcomeStatus: "failed" }],
        summary: {
            cumulativeGpa: 1.4,
            totalEarnedCreditHours: 3,
            totalAttemptedCreditHours: 9,
        },
        academicStandingRules: null,
        excluded: [],
        warnings: [],
    }));

    return data;
}

function headActor(overrides = {}) {
    return {
        actorUserId: headUserId,
        actorMembership: buildMembership({
            _id: headMembershipId,
            userId: headUserId,
            role: "instructor",
            ...overrides,
        }),
    };
}

function actorFor(userId, membershipId, role = "instructor") {
    return {
        actorUserId: userId,
        actorMembership: buildMembership({
            _id: membershipId,
            userId,
            role,
        }),
    };
}

function adminActor(overrides = {}) {
    return {
        actorUserId: adminUserId,
        actorMembership: buildMembership({
            _id: adminMembershipId,
            userId: adminUserId,
            role: "admin",
            ...overrides,
        }),
    };
}

function ownerActor(overrides = {}) {
    return {
        actorUserId: ownerUserId,
        actorMembership: buildMembership({
            _id: ownerMembershipId,
            userId: ownerUserId,
            role: "admin",
            ...overrides,
        }),
    };
}

function createDropPayload(overrides = {}) {
    return {
        enrollmentId,
        studentMemberId: studentMembershipId,
        reason: "Repeated attendance and grade risk require administrative review.",
        ...overrides,
    };
}

function buildReviewNotification(overrides = {}) {
    return {
        _id: notificationId,
        institutionId,
        recipientUserId: adminUserId,
        type: "academic_decision_review_required",
        title: "Enrollment drop recommendation requires review",
        message: "A Head submitted an enrollment drop recommendation that requires administrative review.",
        data: {
            academicDecisionId: decisionId,
            studentMemberId: studentMembershipId,
            enrollmentId,
            sectionId,
        },
        createdByUserId: headUserId,
        readAt: null,
        createdAt: new Date("2026-06-14T11:01:00.000Z"),
        updatedAt: new Date("2026-06-14T11:01:00.000Z"),
        ...overrides,
    };
}

function createOpenDecisionDuplicateKeyError() {
    const error = new Error("E11000 duplicate key error collection: academicdecisions index: institutionId_1_enrollmentId_1_decisionType_1 dup key");
    error.name = "MongoServerError";
    error.code = 11000;
    error.keyPattern = {
        institutionId: 1,
        enrollmentId: 1,
        decisionType: 1,
    };
    error.keyValue = {
        institutionId,
        enrollmentId,
        decisionType: "enrollment_drop",
    };
    return error;
}

function createUnrelatedDuplicateKeyError() {
    const error = new Error("E11000 duplicate key error collection: academicdecisions index: unrelated_1 dup key");
    error.name = "MongoServerError";
    error.code = 11000;
    error.keyPattern = {
        unrelated: 1,
    };
    return error;
}

async function assertRejectsWith(promiseFactory, statusCode, message) {
    await assert.rejects(
        promiseFactory,
        (error) => {
            assert.equal(error.statusCode, statusCode);
            if (message) {
                assert.equal(error.message, message);
            }
            return true;
        }
    );
}

function assertNoUndefinedValues(value, path = "value") {
    if (value === undefined) {
        assert.fail(`${path} is undefined`);
    }

    if (Array.isArray(value)) {
        value.forEach((item, index) => assertNoUndefinedValues(item, `${path}.${index}`));
        return;
    }

    if (value && typeof value === "object" && !(value instanceof Date)) {
        for (const [key, childValue] of Object.entries(value)) {
            assertNoUndefinedValues(childValue, `${path}.${key}`);
        }
    }
}

function createResponse() {
    return {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

test("permission catalog grants Head academic decision scoped permissions only", () => {
    const { ROLE_PERMISSIONS, RESPONSIBILITY_PERMISSIONS } = require("../src/auth/permissions");
    assert.equal(ROLE_PERMISSIONS.admin.includes("academicDecision.review"), true);
    assert.equal(ROLE_PERMISSIONS.admin.includes("academicDecision.apply"), true);
    assert.equal(ROLE_PERMISSIONS.instructor.includes("academicDecision.review"), false);
    assert.equal(ROLE_PERMISSIONS.instructor.includes("academicDecision.apply"), false);
    assert.equal(ROLE_PERMISSIONS.student.includes("academicDecision.review"), false);
    assert.equal(ROLE_PERMISSIONS.student.includes("academicDecision.apply"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicDecision.read_scope"), true);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicDecision.recommend_scope"), true);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicDecision.review"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicDecision.apply"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicDecision.approve"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicDecision.reject"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("academicDecision.apply"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.head.includes("enrollment.drop"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.coordinator.includes("academicDecision.read_scope"), false);
    assert.equal(RESPONSIBILITY_PERMISSIONS.mentor.includes("academicDecision.read_scope"), false);
});

test("valid department Head recommends enrollment drop without mutating enrollment and notifies reviewers safely", async (t) => {
    const data = mockDependencies(t);

    const result = await academicDecisionService.recommendEnrollmentDrop({
        institutionId,
        ...headActor(),
        payload: createDropPayload(),
    });

    assert.equal(result.academicDecision.status, "recommended");
    assert.equal(result.academicDecision.decisionType, "enrollment_drop");
    assert.equal(result.academicDecision.studentMemberId, studentMembershipId);
    assert.equal(result.academicDecision.enrollmentId, enrollmentId);
    assert.equal(result.academicDecision.sectionId, sectionId);
    assert.equal(result.academicDecision.recommendedByUserId, headUserId);
    assert.equal(result.academicDecision.history[0].action, "recommended");
    assert.equal(result.academicDecision.evidenceSnapshot.attendanceRisk.level, "warning");
    assert.equal(result.academicDecision.evidenceSnapshot.gradeRisk.currentAverage, 55);
    assert.equal(result.academicDecision.evidenceSnapshot.passwordHash, undefined);
    assert.deepEqual(result.academicDecision.scopeSnapshot.departmentIds, [departmentId]);
    assert.equal(data.enrollments.find((item) => item._id === enrollmentId).status, "enrolled");

    const enrollmentQuery = data.queryLog.find(
        (entry) => entry.model === "Enrollment" && entry.method === "findOne" && entry.query._id === enrollmentId
    ).query;
    assert.equal(enrollmentQuery._id, enrollmentId);
    assert.equal(enrollmentQuery.institutionId, institutionId);
    assert.equal(enrollmentQuery.studentMemberId, studentMembershipId);

    const duplicatePrecheckQuery = data.queryLog.find(
        (entry) =>
            entry.model === "AcademicDecision" &&
            entry.method === "findOne" &&
            entry.query.decisionType === "enrollment_drop" &&
            entry.query.enrollmentId === enrollmentId
    ).query;
    assert.equal(duplicatePrecheckQuery.institutionId, institutionId);
    assert.equal(duplicatePrecheckQuery.isOpen, true);
    assert.equal(duplicatePrecheckQuery.status, undefined);

    const createPayload = data.writeLog.find(
        (entry) => entry.model === "AcademicDecision" && entry.method === "create"
    ).payload;
    assert.equal(createPayload.isOpen, true);

    const notificationRecipients = data.notifications
        .filter((notification) => notification.type === "academic_decision_review_required")
        .map((notification) => normalizeId(notification.recipientUserId))
        .sort();
    assert.deepEqual(notificationRecipients, [adminUserId, ownerUserId].sort());
    assert.equal(notificationRecipients.includes(inactiveAdminUserId), false);
    assert.equal(notificationRecipients.includes(crossTenantAdminUserId), false);
    assert.equal(notificationRecipients.includes(headUserId), false);
    assert.equal(data.notifications[0].message.includes("55"), false);
    assert.equal(data.notifications[0].message.includes("attendance"), false);
    assert.equal(normalizeId(data.notifications[0].data.academicDecisionId), decisionId);

    const unrelatedWrites = data.writeLog.filter((entry) =>
        ["Enrollment", "Membership", "Subject", "Section", "Assessment", "AttendanceRecord"].includes(entry.model)
    );
    assert.equal(unrelatedWrites.length, 0);
});

test("evidence snapshot validates section ids and maps trusted risk fields without undefined values", async (t) => {
    mockDependencies(t);
    await assertRejectsWith(
        () =>
            academicOversightService.buildAcademicOversightEvidenceSnapshot({
                institution: { _id: institutionId, type: "university", policies: {} },
                institutionId,
                studentMemberId: studentMembershipId,
                sectionIds: [],
            }),
        400,
        "At least one sectionId is required"
    );

    t.mock.reset();
    mockDependencies(t);
    await assertRejectsWith(
        () =>
            academicOversightService.buildAcademicOversightEvidenceSnapshot({
                institution: { _id: institutionId, type: "university", policies: {} },
                institutionId,
                studentMemberId: studentMembershipId,
                sectionIds: [sectionId, "not-an-object-id"],
            }),
        400,
        "sectionIds contains an invalid sectionId"
    );

    t.mock.reset();
    const data = mockDependencies(t);
    const snapshot = await academicOversightService.buildAcademicOversightEvidenceSnapshot({
        institution: data.institutions[0],
        institutionId,
        studentMemberId: studentMembershipId,
        sectionIds: [sectionId, sectionId],
        capturedAt: new Date("2026-06-14T13:00:00.000Z"),
    });

    assert.equal(snapshot.attendanceRisk.level, "warning");
    assert.equal(snapshot.attendanceRisk.effectiveAbsences, 1);
    assert.equal(snapshot.attendanceRisk.absentCount, 1);
    assert.equal(snapshot.attendanceRisk.lateCount, 1);
    assert.equal(snapshot.attendanceRisk.excusedCount, 0);
    assert.equal(snapshot.attendanceRisk.warnAfterAbsences, 1);
    assert.equal(snapshot.attendanceRisk.dropAfterAbsences, 2);
    assert.equal(snapshot.attendanceRisk.lateToAbsenceRatio, 2);
    assert.equal(snapshot.attendanceRisk.excusedCountsAsAbsence, false);
    assert.deepEqual(snapshot.attendanceRisk.reasons, ["attendance_warning_threshold_reached"]);
    assert.equal(snapshot.gradeRisk.level, "high");
    assert.equal(snapshot.gradeRisk.currentAverage, 55);
    assert.equal(snapshot.gradeRisk.missingResults, 0);
    assert.equal(snapshot.gradeRisk.failedAssessments, 1);
    assert.deepEqual(snapshot.gradeRisk.reasons, ["failed_published_assessments"]);
    assert.equal(snapshot.academicStanding.standing, "probation");
    assertNoUndefinedValues(snapshot);

    const sectionLookup = data.queryLog.find(
        (entry) => entry.model === "Section" && entry.method === "find" && entry.query._id?.$in
    ).query;
    assert.equal(sectionLookup.institutionId, institutionId);
    assert.deepEqual(sectionLookup._id.$in, [sectionId]);

    const membershipLookup = data.queryLog.find(
        (entry) => entry.model === "Membership" && entry.method === "findOne" && entry.query._id === studentMembershipId
    ).query;
    assert.equal(membershipLookup.institutionId, institutionId);
    assert.equal(membershipLookup.role, "student");
    assert.equal(membershipLookup.status, "active");
});

test("classLevel and institution-wide Heads can recommend within their resolved scope", async (t) => {
    mockDependencies(t, {
        assignments: [
            buildAssignment({ scopeType: "classLevel", scopeId: classLevelId }),
        ],
    });

    const classResult = await academicDecisionService.recommendEnrollmentDrop({
        institutionId,
        ...headActor(),
        payload: createDropPayload({ enrollmentId: classEnrollmentId }),
    });
    assert.equal(classResult.academicDecision.sectionId, classSectionId);
    assert.deepEqual(classResult.academicDecision.scopeSnapshot.classLevelIds, [classLevelId]);

    t.mock.reset();
    mockDependencies(t, {
        assignments: [
            buildAssignment({ scopeType: "institution", scopeId: institutionId }),
        ],
    });
    const institutionResult = await academicDecisionService.recommendEnrollmentDrop({
        institutionId,
        ...headActor(),
        payload: createDropPayload(),
    });
    assert.equal(institutionResult.academicDecision.scopeSnapshot.institutionWide, true);
});

test("non-Head actors, invalid assignments, and arbitrary stored permissions cannot recommend", async (t) => {
    const blockedActors = [
        actorFor(coordinatorUserId, coordinatorMembershipId),
        actorFor(mentorUserId, mentorMembershipId),
        actorFor(instructorUserId, instructorMembershipId),
        actorFor(studentUserId, studentMembershipId, "student"),
    ];

    for (const actor of blockedActors) {
        t.mock.reset();
        mockDependencies(t);
        await assertRejectsWith(
            () =>
                academicDecisionService.recommendEnrollmentDrop({
                    institutionId,
                    ...actor,
                    payload: createDropPayload(),
                }),
            403
        );
    }

    t.mock.reset();
    mockDependencies(t, {
        assignments: [buildAssignment({ isActive: false })],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload(),
            }),
        403,
        "Permission denied"
    );

    t.mock.reset();
    mockDependencies(t, {
        assignments: [buildAssignment({ endAt: new Date("2026-01-01T00:00:00.000Z") })],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload(),
            }),
        403,
        "Permission denied"
    );

    t.mock.reset();
    mockDependencies(t, {
        assignments: [buildAssignment({ scopeType: "department", scopeId: otherDepartmentId })],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload(),
            }),
        403,
        "Student is outside academic decision scope"
    );
});

test("unsupported Head assignment scope types fail closed for decision scope matching", async (t) => {
    const unsupportedScopeTypes = ["section", "class", "unknown"];

    for (const scopeType of unsupportedScopeTypes) {
        t.mock.reset();
        const data = mockDependencies(t);
        t.mock.method(academicOversightService, "resolveAcademicOversightStudentScope", async () => ({
            institution: data.institutions[0],
            scope: {
                institutionWide: false,
                studentMemberIds: [studentMembershipId],
                sectionIds: [sectionId],
                subjectIds: [subjectId],
                departmentIds: [],
                classLevelIds: [],
                schoolClassIds: [],
            },
            assignments: [
                buildAssignment({
                    scopeType,
                    scopeId: scopeType === "class" ? schoolClassId : sectionId,
                }),
            ],
        }));

        await assertRejectsWith(
            () =>
                academicDecisionService.recommendEnrollmentDrop({
                    institutionId,
                    ...headActor(),
                    payload: createDropPayload(),
                }),
            403,
            "Enrollment is outside academic decision scope"
        );
    }
});

test("recommendation authorizes scope arrays containing Mongoose ObjectIds", async (t) => {
    const data = mockDependencies(t);
    t.mock.method(academicOversightService, "resolveAcademicOversightStudentScope", async () => ({
        institution: data.institutions[0],
        scope: {
            institutionWide: false,
            studentMemberIds: [new mongoose.Types.ObjectId(studentMembershipId)],
            sectionIds: [new mongoose.Types.ObjectId(sectionId)],
            subjectIds: [new mongoose.Types.ObjectId(subjectId)],
            departmentIds: [new mongoose.Types.ObjectId(departmentId)],
            classLevelIds: [],
            schoolClassIds: [],
        },
        assignments: [buildAssignment()],
    }));

    const result = await academicDecisionService.recommendEnrollmentDrop({
        institutionId,
        ...headActor(),
        payload: createDropPayload(),
    });

    assert.equal(result.academicDecision.status, "recommended");
    assert.equal(result.academicDecision.sectionId, sectionId);
});

test("actor membership binding, enrollment safety, payload safety, and duplicate prevention are enforced", async (t) => {
    mockDependencies(t);
    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                actorUserId: headUserId,
                actorMembership: buildMembership({ userId: secondHeadUserId }),
                payload: createDropPayload(),
            }),
        403,
        "Institution access denied"
    );

    t.mock.reset();
    mockDependencies(t);
    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload({ status: "approved" }),
            }),
        400,
        "Unexpected field: status"
    );

    t.mock.reset();
    mockDependencies(t);
    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload({ evidenceSnapshot: { grade: "A" } }),
            }),
        400,
        "Unexpected field: evidenceSnapshot"
    );

    const dangerousFields = [
        "institutionId",
        "sectionId",
        "decisionType",
        "scopeSnapshot",
        "recommendedByUserId",
        "approvedByUserId",
        "appliedByUserId",
        "history",
        "permissions",
    ];
    for (const fieldName of dangerousFields) {
        t.mock.reset();
        mockDependencies(t);
        await assertRejectsWith(
            () =>
                academicDecisionService.recommendEnrollmentDrop({
                    institutionId,
                    ...headActor(),
                    payload: createDropPayload({ [fieldName]: fieldName === "history" ? [] : "unsafe" }),
                }),
            400,
            `Unexpected field: ${fieldName}`
        );
    }

    t.mock.reset();
    mockDependencies(t);
    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload({ reason: "   " }),
            }),
        400,
        "reason must be at least 10 characters"
    );

    t.mock.reset();
    mockDependencies(t);
    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload({ reason: "x".repeat(2001) }),
            }),
        400,
        "reason must be at most 2000 characters"
    );

    t.mock.reset();
    mockDependencies(t);
    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload({ studentMemberId: secondHeadMembershipId }),
            }),
        403,
        "Student is outside academic decision scope"
    );

    t.mock.reset();
    mockDependencies(t);
    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload({ enrollmentId: droppedEnrollmentId }),
            }),
        409,
        "Only active enrolled enrollments can be recommended for drop"
    );

    t.mock.reset();
    mockDependencies(t);
    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload({ enrollmentId: outsideEnrollmentId }),
            }),
        403,
        "Enrollment is outside academic decision scope"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision()],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload(),
            }),
        409,
        "An open enrollment drop recommendation already exists for this enrollment"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision({ status: "cancelled" })],
    });
    const allowed = await academicDecisionService.recommendEnrollmentDrop({
        institutionId,
        ...headActor(),
        payload: createDropPayload(),
    });
    assert.equal(allowed.academicDecision.status, "recommended");

    t.mock.reset();
    mockDependencies(t, {
        assignments: [buildAssignment({ scopeType: "classLevel", scopeId: classLevelId })],
        decisions: [buildDecision({ _id: approvedDecisionId, enrollmentId: classEnrollmentId, sectionId: classSectionId, status: "approved" })],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload({ enrollmentId: classEnrollmentId }),
            }),
        409,
        "An open enrollment drop recommendation already exists for this enrollment"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision({ status: "rejected" })],
    });
    const allowedAfterRejected = await academicDecisionService.recommendEnrollmentDrop({
        institutionId,
        ...headActor(),
        payload: createDropPayload(),
    });
    assert.equal(allowedAfterRejected.academicDecision.status, "recommended");

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision({ status: "applied" })],
    });
    const allowedAfterApplied = await academicDecisionService.recommendEnrollmentDrop({
        institutionId,
        ...headActor(),
        payload: createDropPayload(),
    });
    assert.equal(allowedAfterApplied.academicDecision.status, "recommended");
});

test("concurrent duplicate recommendation create is translated only for the open-decision unique index", async (t) => {
    mockDependencies(t, {
        academicDecisionCreateErrors: [createOpenDecisionDuplicateKeyError()],
    });

    await assertRejectsWith(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload(),
            }),
        409,
        "An open enrollment drop recommendation already exists for this enrollment"
    );

    t.mock.reset();
    const unrelatedError = createUnrelatedDuplicateKeyError();
    mockDependencies(t, {
        academicDecisionCreateErrors: [unrelatedError],
    });

    await assert.rejects(
        () =>
            academicDecisionService.recommendEnrollmentDrop({
                institutionId,
                ...headActor(),
                payload: createDropPayload(),
            }),
        (error) => {
            assert.equal(error, unrelatedError);
            return true;
        }
    );
});

test("listing and getting decisions stay inside current Head scope", async (t) => {
    mockDependencies(t, {
        decisions: [
            buildDecision(),
            buildDecision({
                _id: approvedDecisionId,
                enrollmentId: classEnrollmentId,
                sectionId: classSectionId,
                status: "cancelled",
            }),
        ],
    });

    const list = await academicDecisionService.listAcademicDecisions({
        institutionId,
        ...headActor(),
        query: { status: "recommended", page: "1", limit: "10" },
    });
    assert.equal(list.academicDecisions.length, 1);
    assert.equal(list.academicDecisions[0].id, decisionId);
    assert.equal(list.academicDecisions[0].history, undefined);

    const detail = await academicDecisionService.getAcademicDecisionById({
        institutionId,
        decisionId,
        ...headActor(),
    });
    assert.equal(detail.academicDecision.id, decisionId);
    assert.equal(detail.academicDecision.history.length, 1);

    await assertRejectsWith(
        () =>
            academicDecisionService.getAcademicDecisionById({
                institutionId,
                decisionId: approvedDecisionId,
                ...headActor(),
            }),
        403,
        "Academic decision is outside scope"
    );
});

test("historical decision visibility uses current authorized section scope, not active student enrollment", async (t) => {
    const data = mockDependencies(t, {
        enrollments: [
            {
                _id: enrollmentId,
                institutionId,
                sectionId,
                studentMemberId: studentMembershipId,
                status: "dropped",
            },
        ],
        decisions: [
            buildDecision({ status: "applied", isOpen: false }),
            buildDecision({
                _id: approvedDecisionId,
                enrollmentId: outsideEnrollmentId,
                sectionId: outsideSectionId,
                status: "rejected",
                isOpen: false,
            }),
        ],
    });

    const list = await academicDecisionService.listAcademicDecisions({
        institutionId,
        ...headActor(),
        query: { status: "applied", studentMemberId: studentMembershipId, page: "1", limit: "10" },
    });
    assert.equal(list.academicDecisions.length, 1);
    assert.equal(list.academicDecisions[0].id, decisionId);

    const detail = await academicDecisionService.getAcademicDecisionById({
        institutionId,
        decisionId,
        ...headActor(),
    });
    assert.equal(detail.academicDecision.id, decisionId);

    const decisionFindQuery = data.queryLog.find(
        (entry) => entry.model === "AcademicDecision" && entry.method === "find"
    ).query;
    assert.equal(decisionFindQuery.institutionId, institutionId);
    assert.deepEqual(decisionFindQuery.sectionId, { $in: [sectionId] });
    assert.equal(decisionFindQuery.studentMemberId, studentMembershipId);

    const narrowedBySection = await academicDecisionService.listAcademicDecisions({
        institutionId,
        ...headActor(),
        query: { sectionId, page: "1", limit: "10" },
    });
    assert.equal(narrowedBySection.academicDecisions.length, 1);

    const outsideSectionFilter = await academicDecisionService.listAcademicDecisions({
        institutionId,
        ...headActor(),
        query: { sectionId: outsideSectionId, page: "1", limit: "10" },
    });
    assert.equal(outsideSectionFilter.academicDecisions.length, 0);

    await assertRejectsWith(
        () =>
            academicDecisionService.getAcademicDecisionById({
                institutionId,
                decisionId: approvedDecisionId,
                ...headActor(),
            }),
        403,
        "Academic decision is outside scope"
    );
});

test("institution-wide Head can list institution decisions without active enrollment scope", async (t) => {
    const data = mockDependencies(t, {
        assignments: [buildAssignment({ scopeType: "institution", scopeId: institutionId })],
        enrollments: [],
        decisions: [
            buildDecision({ status: "rejected", isOpen: false }),
            buildDecision({
                _id: approvedDecisionId,
                enrollmentId: outsideEnrollmentId,
                sectionId: outsideSectionId,
                status: "applied",
                isOpen: false,
            }),
        ],
    });

    const list = await academicDecisionService.listAcademicDecisions({
        institutionId,
        ...headActor(),
        query: { page: "1", limit: "10" },
    });
    assert.equal(list.academicDecisions.length, 2);

    const decisionFindQuery = data.queryLog.find(
        (entry) => entry.model === "AcademicDecision" && entry.method === "find"
    ).query;
    assert.equal(decisionFindQuery.institutionId, institutionId);
    assert.equal(decisionFindQuery.sectionId, undefined);
    assert.equal(decisionFindQuery.studentMemberId, undefined);
});

test("recommending Head can cancel own recommendation only while recommended and enrollment remains unchanged", async (t) => {
    const data = mockDependencies(t, {
        decisions: [
            buildDecision(),
            buildDecision({
                _id: approvedDecisionId,
                enrollmentId: droppedEnrollmentId,
                status: "approved",
            }),
        ],
        notifications: [
            buildReviewNotification(),
            buildReviewNotification({
                _id: notificationId.slice(0, -1) + "2",
                recipientUserId: ownerUserId,
            }),
        ],
    });

    const cancelled = await academicDecisionService.cancelAcademicDecision({
        institutionId,
        decisionId,
        ...headActor(),
    });

    assert.equal(cancelled.academicDecision.status, "cancelled");
    assert.equal(cancelled.academicDecision.cancelledByUserId, headUserId);
    assert.equal(data.decisions.find((item) => item._id === decisionId).isOpen, false);
    const cancelHistoryEntry = cancelled.academicDecision.history.at(-1);
    assert.equal(cancelHistoryEntry.action, "cancelled");
    assert.equal(cancelHistoryEntry.fromStatus, "recommended");
    assert.equal(cancelHistoryEntry.toStatus, "cancelled");
    assert.equal(cancelHistoryEntry.actorUserId, headUserId);
    assert.equal(cancelHistoryEntry.note, null);
    assert.equal(cancelled.academicDecision.history.length, 2);

    const cancelWrite = data.writeLog.find(
        (entry) => entry.model === "AcademicDecision" && entry.method === "findOneAndUpdate"
    );
    assert.equal(cancelWrite.query._id, decisionId);
    assert.equal(cancelWrite.query.institutionId, institutionId);
    assert.equal(cancelWrite.query.decisionType, "enrollment_drop");
    assert.equal(cancelWrite.query.status, "recommended");
    assert.equal(cancelWrite.query.isOpen, true);
    assert.equal(cancelWrite.query.recommendedByUserId, headUserId);
    assert.equal(cancelWrite.update.$set.status, "cancelled");
    assert.equal(cancelWrite.update.$set.isOpen, false);
    assert.equal(cancelWrite.update.$set.cancelledByUserId, headUserId);
    assert.ok(cancelWrite.update.$set.cancelledAt);
    assert.equal(cancelWrite.update.$push.history.action, "cancelled");
    assert.ok(data.notifications.find((item) => item.recipientUserId === adminUserId).readAt);
    assert.ok(data.notifications.find((item) => item.recipientUserId === ownerUserId).readAt);
    assert.equal(data.decisions.length, 2);

    const newRecommendation = await academicDecisionService.recommendEnrollmentDrop({
        institutionId,
        ...headActor(),
        payload: createDropPayload(),
    });
    assert.equal(newRecommendation.academicDecision.status, "recommended");
    assert.equal(data.decisions.length, 3);
    assert.equal(data.enrollments.find((item) => item._id === enrollmentId).status, "enrolled");

    await assertRejectsWith(
        () =>
            academicDecisionService.cancelAcademicDecision({
                institutionId,
                decisionId: approvedDecisionId,
                ...headActor(),
            }),
        409,
        "Only recommended academic decisions can be cancelled"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision()],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.cancelAcademicDecision({
                institutionId,
                decisionId,
                ...actorFor(secondHeadUserId, secondHeadMembershipId),
            }),
        403,
        "Only the recommending Head can cancel this decision"
    );
});

test("active Admin can approve a recommended decision after current-data revalidation", async (t) => {
    const data = mockDependencies(t, {
        decisions: [buildDecision()],
        notifications: [
            buildReviewNotification(),
            buildReviewNotification({
                _id: notificationId.slice(0, -1) + "2",
                recipientUserId: ownerUserId,
            }),
        ],
    });

    const result = await academicDecisionService.approveAcademicDecision({
        institutionId,
        decisionId,
        ...adminActor(),
        payload: { note: "Reviewed current records and approved for later application." },
    });

    assert.equal(result.academicDecision.status, "approved");
    assert.equal(result.academicDecision.isOpen, true);
    assert.equal(result.academicDecision.approvedByUserId, adminUserId);
    assert.equal(result.academicDecision.appliedByUserId, null);
    assert.equal(result.academicDecision.history.length, 2);
    assert.equal(result.academicDecision.history[1].action, "approved");
    assert.equal(result.academicDecision.history[1].fromStatus, "recommended");
    assert.equal(result.academicDecision.history[1].toStatus, "approved");
    assert.equal(result.academicDecision.history[1].note, "Reviewed current records and approved for later application.");
    assert.equal(result.academicDecision.reviewSnapshot.enrollmentStatus, "enrolled");
    assert.equal(result.academicDecision.reviewSnapshot.evidenceChanged, false);

    const transitionWrite = data.writeLog.find(
        (entry) => entry.model === "AcademicDecision" && entry.method === "findOneAndUpdate"
    );
    assert.equal(transitionWrite.query._id, decisionId);
    assert.equal(transitionWrite.query.institutionId, institutionId);
    assert.equal(transitionWrite.query.decisionType, "enrollment_drop");
    assert.equal(transitionWrite.query.status, "recommended");
    assert.equal(transitionWrite.query.isOpen, true);
    assert.equal(transitionWrite.update.$set.status, "approved");
    assert.equal(transitionWrite.update.$set.isOpen, true);
    assert.equal(transitionWrite.update.$set.approvedByUserId, adminUserId);
    assert.equal(transitionWrite.update.$set.appliedByUserId, undefined);

    const enrollmentLookup = data.queryLog.find(
        (entry) =>
            entry.model === "Enrollment" &&
            entry.method === "findOne" &&
            entry.query._id === enrollmentId &&
            entry.query.sectionId === sectionId
    ).query;
    assert.equal(enrollmentLookup.institutionId, institutionId);
    assert.equal(enrollmentLookup.studentMemberId, studentMembershipId);

    const headNotifications = data.notifications.filter(
        (notification) => notification.type === "academic_decision_approved"
    );
    assert.equal(headNotifications.length, 1);
    assert.equal(headNotifications[0].recipientUserId, headUserId);
    assert.equal(headNotifications[0].message.includes("55"), false);
    assert.equal(headNotifications[0].message.includes("attendance"), false);
    assert.equal(normalizeId(headNotifications[0].data.academicDecisionId), decisionId);
    assert.ok(data.notifications.find((item) => item.recipientUserId === adminUserId).readAt);
    assert.ok(data.notifications.find((item) => item.recipientUserId === ownerUserId).readAt);
    const reviewResolutionWrite = data.writeLog.find(
        (entry) => entry.model === "Notification" && entry.method === "updateMany"
    );
    assert.equal(reviewResolutionWrite.query.institutionId, institutionId);
    assert.equal(reviewResolutionWrite.query.type, "academic_decision_review_required");
    assert.equal(reviewResolutionWrite.query["data.academicDecisionId"], decisionId);
    assert.equal(reviewResolutionWrite.query.readAt, null);
    assert.equal(data.enrollments.find((item) => item._id === enrollmentId).status, "enrolled");

    const unrelatedWrites = data.writeLog.filter((entry) =>
        ["Enrollment", "Membership", "Subject", "Section"].includes(entry.model)
    );
    assert.equal(unrelatedWrites.length, 0);

    await assertRejectsWith(
        () =>
            academicDecisionService.rejectAcademicDecision({
                institutionId,
                decisionId,
                ...ownerActor(),
                payload: { reason: "A second reviewer cannot reverse the completed review." },
            }),
        409,
        "Only recommended academic decisions can be reviewed"
    );
    assert.equal(data.notifications.filter((notification) => notification.type === "academic_decision_approved").length, 1);
});

test("active Owner can reject a recommended decision and notify the recommending Head", async (t) => {
    const data = mockDependencies(t, {
        decisions: [buildDecision()],
        notifications: [
            buildReviewNotification({
                recipientUserId: ownerUserId,
            }),
            buildReviewNotification({
                _id: notificationId.slice(0, -1) + "2",
                recipientUserId: adminUserId,
            }),
        ],
    });

    const result = await academicDecisionService.rejectAcademicDecision({
        institutionId,
        decisionId,
        ...ownerActor({ role: "instructor" }),
        payload: { reason: "The current record does not justify administrative approval." },
    });

    assert.equal(result.academicDecision.status, "rejected");
    assert.equal(result.academicDecision.isOpen, false);
    assert.equal(result.academicDecision.rejectedByUserId, ownerUserId);
    assert.equal(result.academicDecision.history[1].action, "rejected");
    assert.equal(result.academicDecision.history[1].note, "The current record does not justify administrative approval.");

    const transitionWrite = data.writeLog.find(
        (entry) => entry.model === "AcademicDecision" && entry.method === "findOneAndUpdate"
    );
    assert.equal(transitionWrite.query._id, decisionId);
    assert.equal(transitionWrite.query.institutionId, institutionId);
    assert.equal(transitionWrite.query.status, "recommended");
    assert.equal(transitionWrite.update.$set.status, "rejected");
    assert.equal(transitionWrite.update.$set.isOpen, false);
    assert.equal(transitionWrite.update.$set.rejectedByUserId, ownerUserId);

    const headNotifications = data.notifications.filter(
        (notification) => notification.type === "academic_decision_rejected"
    );
    assert.equal(headNotifications.length, 1);
    assert.equal(headNotifications[0].recipientUserId, headUserId);
    assert.equal(headNotifications[0].message.includes("current record"), false);
    assert.ok(data.notifications.find((item) => item.recipientUserId === ownerUserId).readAt);
    assert.ok(data.notifications.find((item) => item.recipientUserId === adminUserId).readAt);
    assert.equal(data.enrollments.find((item) => item._id === enrollmentId).status, "enrolled");
});

test("review authority is limited to active Admins and active institution Owners", async (t) => {
    mockDependencies(t, {
        decisions: [buildDecision()],
    });
    const queue = await academicDecisionService.listAcademicDecisionReviewQueue({
        institutionId,
        ...adminActor(),
        query: {},
    });
    assert.equal(queue.academicDecisions.length, 1);

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision()],
    });
    const ownerQueue = await academicDecisionService.listAcademicDecisionReviewQueue({
        institutionId,
        ...ownerActor({ role: "instructor" }),
        query: {},
    });
    assert.equal(ownerQueue.academicDecisions.length, 1);

    const blockedActors = [
        headActor(),
        actorFor(coordinatorUserId, coordinatorMembershipId),
        actorFor(mentorUserId, mentorMembershipId),
        actorFor(instructorUserId, instructorMembershipId),
        actorFor(studentUserId, studentMembershipId, "student"),
    ];
    for (const blockedActor of blockedActors) {
        t.mock.reset();
        mockDependencies(t, {
            decisions: [buildDecision()],
        });
        await assertRejectsWith(
            () =>
                academicDecisionService.listAcademicDecisionReviewQueue({
                    institutionId,
                    ...blockedActor,
                    query: {},
                }),
            403,
            "Permission denied"
        );
    }

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision()],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.listAcademicDecisionReviewQueue({
                institutionId,
                ...adminActor({ status: "suspended" }),
                query: {},
            }),
        403,
        "Institution access denied"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision()],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.listAcademicDecisionReviewQueue({
                institutionId,
                actorUserId: adminUserId,
                actorMembership: buildMembership({ _id: adminMembershipId, userId: ownerUserId, role: "admin" }),
                query: {},
            }),
        403,
        "Institution access denied"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision()],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.listAcademicDecisionReviewQueue({
                institutionId,
                actorUserId: crossTenantAdminUserId,
                actorMembership: buildMembership({
                    _id: crossTenantAdminMembershipId,
                    institutionId: otherInstitutionId,
                    userId: crossTenantAdminUserId,
                    role: "admin",
                }),
                query: {},
            }),
        403,
        "Institution access denied"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision()],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.listAcademicDecisionReviewQueue({
                institutionId,
                ...ownerActor({ status: "suspended" }),
                query: {},
            }),
        403,
        "Institution access denied"
    );
});

test("review transitions block self-review and non-recommended states", async (t) => {
    for (const status of ["approved", "rejected", "cancelled", "applied"]) {
        t.mock.reset();
        mockDependencies(t, {
            decisions: [buildDecision({ status, isOpen: ["recommended", "approved"].includes(status) })],
        });
        await assertRejectsWith(
            () =>
                academicDecisionService.approveAcademicDecision({
                    institutionId,
                    decisionId,
                    ...adminActor(),
                    payload: {},
                }),
            409,
            "Only recommended academic decisions can be reviewed"
        );
    }

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision({ recommendedByUserId: adminUserId })],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.approveAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
                payload: {},
            }),
        403,
        "Reviewers cannot review their own recommendation"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision({ recommendedByUserId: ownerUserId })],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.rejectAcademicDecision({
                institutionId,
                decisionId,
                ...ownerActor(),
                payload: { reason: "Owner recommender must cancel instead of self-reviewing." },
            }),
        403,
        "Reviewers cannot review their own recommendation"
    );
});

test("approval fails safely when current records or evidence are stale", async (t) => {
    mockDependencies(t, {
        decisions: [buildDecision()],
        enrollments: buildDataset().enrollments.map((enrollment) =>
            enrollment._id === enrollmentId ? { ...enrollment, status: "dropped" } : enrollment
        ),
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.approveAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
                payload: {},
            }),
        409,
        "Enrollment is no longer active"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision()],
        memberships: buildDataset().memberships.map((membership) =>
            membership._id === studentMembershipId ? { ...membership, status: "suspended" } : membership
        ),
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.approveAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
                payload: {},
            }),
        409,
        "Student membership is no longer active"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision()],
        sections: buildDataset().sections.filter((section) => section._id !== sectionId),
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.approveAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
                payload: {},
            }),
        409,
        "Section is no longer available"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [
            buildDecision({
                evidenceSnapshot: {
                    attendanceRisk: { level: "low" },
                    gradeRisk: { level: "low" },
                    academicStanding: { standing: "good" },
                },
            }),
        ],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.approveAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
                payload: {},
            }),
        409,
        "Academic decision evidence has materially changed"
    );
});

test("active Admin applies an approved decision by dropping only the exact enrollment", async (t) => {
    const data = mockDependencies(t, {
        decisions: [buildApprovedDecision()],
        notifications: [
            buildReviewNotification(),
            buildReviewNotification({
                _id: notificationId.slice(0, -1) + "2",
                recipientUserId: ownerUserId,
            }),
        ],
    });

    const result = await academicDecisionService.applyAcademicDecision({
        institutionId,
        decisionId,
        ...adminActor(),
    });

    assert.equal(result.academicDecision.status, "applied");
    assert.equal(result.academicDecision.decisionType, "enrollment_drop");
    assert.equal(result.academicDecision.studentMemberId, studentMembershipId);
    assert.equal(result.academicDecision.enrollmentId, enrollmentId);
    assert.equal(result.academicDecision.sectionId, sectionId);
    assert.ok(result.academicDecision.appliedAt);
    assert.equal(result.enrollment.id, enrollmentId);
    assert.equal(result.enrollment.status, "dropped");
    assert.equal(data.enrollments.find((item) => item._id === enrollmentId).status, "dropped");
    assert.equal(normalizeId(data.enrollments.find((item) => item._id === enrollmentId).droppedByAcademicDecisionId), decisionId);
    assert.equal(normalizeId(data.enrollments.find((item) => item._id === enrollmentId).droppedByUserId), adminUserId);
    assert.ok(data.enrollments.find((item) => item._id === enrollmentId).droppedAt);
    assert.equal(data.memberships.find((item) => item._id === studentMembershipId).status, "active");
    assert.equal(data.sections.find((item) => item._id === sectionId).status, "active");
    assert.equal(data.assessmentResults[0].score, 55);
    assert.equal(data.attendanceRecords.length, 2);

    const decisionWrites = data.writeLog.filter(
        (entry) => entry.model === "AcademicDecision" && entry.method === "findOneAndUpdate"
    );
    assert.equal(decisionWrites.length, 2);
    assert.equal(decisionWrites[0].query._id, decisionId);
    assert.equal(decisionWrites[0].query.institutionId, institutionId);
    assert.equal(decisionWrites[0].query.decisionType, "enrollment_drop");
    assert.equal(decisionWrites[0].query.status, "approved");
    assert.equal(decisionWrites[0].query.isOpen, true);
    assert.equal(decisionWrites[0].update.$set.status, "applying");
    assert.equal(decisionWrites[0].update.$set.isOpen, true);
    assert.equal(decisionWrites[0].update.$set.applyingByUserId, adminUserId);
    assert.ok(decisionWrites[0].update.$set.applyingAt);
    assert.equal(decisionWrites[0].update.$push.history.action, "applying");
    assert.equal(decisionWrites[0].update.$push.history.fromStatus, "approved");
    assert.equal(decisionWrites[0].update.$push.history.toStatus, "applying");
    assert.equal(decisionWrites[1].query.status, "applying");
    assert.equal(decisionWrites[1].query.isOpen, true);
    assert.equal(decisionWrites[1].update.$set.status, "applied");
    assert.equal(decisionWrites[1].update.$set.isOpen, false);
    assert.equal(decisionWrites[1].update.$set.appliedByUserId, adminUserId);
    assert.equal(decisionWrites[1].update.$push.history.action, "applied");
    assert.equal(decisionWrites[1].update.$push.history.fromStatus, "applying");
    assert.equal(decisionWrites[1].update.$push.history.toStatus, "applied");
    assert.equal(decisionWrites[1].update.$push.history.note, null);
    assert.equal(data.decisions[0].history.at(-2).action, "applying");
    assert.equal(data.decisions[0].history.at(-1).action, "applied");

    const enrollmentWrite = data.writeLog.find(
        (entry) => entry.model === "Enrollment" && entry.method === "findOneAndUpdate"
    );
    assert.equal(enrollmentWrite.query._id, enrollmentId);
    assert.equal(enrollmentWrite.query.institutionId, institutionId);
    assert.equal(enrollmentWrite.query.studentMemberId, studentMembershipId);
    assert.equal(enrollmentWrite.query.sectionId, sectionId);
    assert.equal(enrollmentWrite.query.status, "enrolled");
    assert.equal(enrollmentWrite.update.$set.status, "dropped");
    assert.equal(enrollmentWrite.update.$set.droppedByUserId, adminUserId);
    assert.equal(normalizeId(enrollmentWrite.update.$set.droppedByAcademicDecisionId), decisionId);
    assert.ok(enrollmentWrite.update.$set.droppedAt);

    const headNotifications = data.notifications.filter(
        (notification) => notification.type === "academic_decision_applied"
    );
    const studentNotifications = data.notifications.filter(
        (notification) => notification.type === "enrollment_status_changed"
    );
    assert.equal(headNotifications.length, 1);
    assert.equal(headNotifications[0].recipientUserId, headUserId);
    assert.equal(studentNotifications.length, 1);
    assert.equal(studentNotifications[0].recipientUserId, studentUserId);
    assert.equal(studentNotifications[0].message.includes("55"), false);
    assert.equal(studentNotifications[0].message.includes("GPA"), false);
    assert.equal(normalizeId(studentNotifications[0].data.academicDecisionId), decisionId);
    assert.equal(normalizeId(studentNotifications[0].data.enrollmentId), enrollmentId);

    const unrelatedWrites = data.writeLog.filter((entry) =>
        ["Membership", "Subject", "Section", "Assessment", "AttendanceRecord"].includes(entry.model)
    );
    assert.equal(unrelatedWrites.length, 0);

    const writeCountBeforeRetry = data.writeLog.length;
    const notificationCountBeforeRetry = data.notifications.length;
    const retry = await academicDecisionService.applyAcademicDecision({
        institutionId,
        decisionId,
        ...adminActor(),
    });
    assert.equal(retry.academicDecision.status, "applied");
    assert.equal(retry.enrollment.status, "dropped");
    assert.equal(data.writeLog.length, writeCountBeforeRetry);
    assert.equal(data.notifications.length, notificationCountBeforeRetry);
});

test("active Owner can apply using ownership authority without admin role", async (t) => {
    const data = mockDependencies(t, {
        decisions: [buildApprovedDecision()],
    });

    const result = await academicDecisionService.applyAcademicDecision({
        institutionId,
        decisionId,
        ...ownerActor({ role: "instructor" }),
    });

    assert.equal(result.academicDecision.status, "applied");
    assert.equal(data.enrollments.find((item) => item._id === enrollmentId).status, "dropped");
});

test("apply authority is limited to active Admins and active institution Owners", async (t) => {
    const blockedActors = [
        headActor(),
        actorFor(coordinatorUserId, coordinatorMembershipId),
        actorFor(mentorUserId, mentorMembershipId),
        actorFor(instructorUserId, instructorMembershipId),
        actorFor(studentUserId, studentMembershipId, "student"),
    ];
    for (const blockedActor of blockedActors) {
        t.mock.reset();
        mockDependencies(t, {
            decisions: [buildApprovedDecision()],
        });
        await assertRejectsWith(
            () =>
                academicDecisionService.applyAcademicDecision({
                    institutionId,
                    decisionId,
                    ...blockedActor,
                }),
            403,
            "Permission denied"
        );
    }

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildApprovedDecision()],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.applyAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor({ status: "suspended" }),
            }),
        403,
        "Institution access denied"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildApprovedDecision()],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.applyAcademicDecision({
                institutionId,
                actorUserId: adminUserId,
                actorMembership: buildMembership({ _id: adminMembershipId, userId: ownerUserId, role: "admin" }),
                decisionId,
            }),
        403,
        "Institution access denied"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildApprovedDecision()],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.applyAcademicDecision({
                institutionId,
                actorUserId: crossTenantAdminUserId,
                actorMembership: buildMembership({
                    _id: crossTenantAdminMembershipId,
                    institutionId: otherInstitutionId,
                    userId: crossTenantAdminUserId,
                    role: "admin",
                }),
                decisionId,
            }),
        403,
        "Institution access denied"
    );
});

test("apply state machine blocks non-approved and in-progress decisions", async (t) => {
    const recentApplyingAt = new Date(Date.now() - 60 * 1000);
    const blockedStatuses = [
        ["recommended", "Only approved academic decisions can be applied"],
        ["rejected", "Only approved academic decisions can be applied"],
        ["cancelled", "Only approved academic decisions can be applied"],
        ["applying", "Academic decision application is already in progress"],
    ];
    for (const [status, message] of blockedStatuses) {
        t.mock.reset();
        mockDependencies(t, {
            decisions: [
                buildDecision({
                    status,
                    isOpen: ["recommended", "approved", "applying"].includes(status),
                    applyingAt: status === "applying" ? recentApplyingAt : null,
                    applyingByUserId: status === "applying" ? adminUserId : null,
                }),
            ],
        });
        await assertRejectsWith(
            () =>
                academicDecisionService.applyAcademicDecision({
                    institutionId,
                    decisionId,
                    ...adminActor(),
                }),
            409,
            message
        );
    }

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildDecision({ status: "applying", isOpen: true, applyingByUserId: adminUserId, applyingAt: null })],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.applyAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
            }),
        409,
        "Academic decision application requires manual recovery"
    );
});

test("stale applying claim with enrolled Enrollment can be reclaimed and completed once", async (t) => {
    const staleApplyingAt = new Date(Date.now() - 11 * 60 * 1000);
    const data = mockDependencies(t, {
        decisions: [
            buildApprovedDecision({
                status: "applying",
                isOpen: true,
                applyingByUserId: ownerUserId,
                applyingAt: staleApplyingAt,
                history: [
                    ...buildApprovedDecision().history,
                    {
                        action: "applying",
                        fromStatus: "approved",
                        toStatus: "applying",
                        actorUserId: ownerUserId,
                        at: staleApplyingAt,
                        note: null,
                    },
                ],
            }),
        ],
    });

    const result = await academicDecisionService.applyAcademicDecision({
        institutionId,
        decisionId,
        ...adminActor(),
    });

    assert.equal(result.academicDecision.status, "applied");
    const decisionWrites = data.writeLog.filter(
        (entry) => entry.model === "AcademicDecision" && entry.method === "findOneAndUpdate"
    );
    assert.equal(decisionWrites.length, 2);
    assert.equal(decisionWrites[0].query.status, "applying");
    assert.equal(decisionWrites[0].query.applyingAt, staleApplyingAt);
    assert.equal(decisionWrites[0].update.$set.applyingByUserId, adminUserId);
    assert.ok(decisionWrites[0].update.$set.applyingAt);
    assert.equal(decisionWrites[0].update.$push, undefined);
    assert.equal(decisionWrites[1].update.$push.history.fromStatus, "applying");
    assert.equal(data.decisions[0].history.filter((entry) => entry.action === "applying").length, 1);
    assert.equal(data.decisions[0].history.filter((entry) => entry.action === "applied").length, 1);
});

test("apply validates exact current enrollment relationships before dropping", async (t) => {
    mockDependencies(t, {
        decisions: [buildApprovedDecision({ studentMemberId: secondHeadMembershipId })],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.applyAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
            }),
        409,
        "Enrollment is no longer valid for this decision"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildApprovedDecision({ sectionId: outsideSectionId })],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.applyAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
            }),
        409,
        "Enrollment is no longer valid for this decision"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildApprovedDecision()],
        enrollments: buildDataset().enrollments.map((enrollment) =>
            enrollment._id === enrollmentId ? { ...enrollment, status: "dropped" } : enrollment
        ),
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.applyAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
            }),
        409,
        "Enrollment is no longer active"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildApprovedDecision()],
        enrollments: buildDataset().enrollments.filter((enrollment) => enrollment._id !== enrollmentId),
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.applyAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
            }),
        409,
        "Enrollment is no longer valid for this decision"
    );
});

test("apply consistency guards avoid false applied success", async (t) => {
    const claimFailureData = mockDependencies(t, {
        decisions: [buildApprovedDecision()],
        academicDecisionFindOneAndUpdateNullOnCalls: [1],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.applyAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
            }),
        409,
        "Academic decision could not be claimed for application"
    );
    assert.equal(
        claimFailureData.writeLog.some((entry) => entry.model === "Enrollment" && entry.method === "findOneAndUpdate"),
        false
    );
    assert.equal(claimFailureData.enrollments.find((item) => item._id === enrollmentId).status, "enrolled");

    t.mock.reset();
    const enrollmentFailureData = mockDependencies(t, {
        decisions: [buildApprovedDecision()],
        enrollmentFindOneAndUpdateNullOnCalls: [1],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.applyAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
            }),
        409,
        "Enrollment could not be dropped safely"
    );
    assert.equal(enrollmentFailureData.decisions[0].status, "approved");
    assert.equal(enrollmentFailureData.decisions[0].applyingByUserId, null);
    assert.equal(enrollmentFailureData.decisions[0].applyingAt, null);
    assert.equal(enrollmentFailureData.enrollments.find((item) => item._id === enrollmentId).status, "enrolled");
    assert.equal(
        enrollmentFailureData.notifications.some((notification) => notification.type === "academic_decision_applied"),
        false
    );

    t.mock.reset();
    const finalFailureData = mockDependencies(t, {
        decisions: [buildApprovedDecision()],
        academicDecisionFindOneAndUpdateNullOnCalls: [2],
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.applyAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
            }),
        409,
        "Academic decision application requires manual recovery"
    );
    assert.equal(finalFailureData.decisions[0].status, "applying");
    assert.equal(finalFailureData.enrollments.find((item) => item._id === enrollmentId).status, "dropped");
    assert.equal(
        normalizeId(finalFailureData.enrollments.find((item) => item._id === enrollmentId).droppedByAcademicDecisionId),
        decisionId
    );
    assert.equal(finalFailureData.notifications.length, 0);
    const recovered = await academicDecisionService.applyAcademicDecision({
        institutionId,
        decisionId,
        ...adminActor(),
    });
    assert.equal(recovered.academicDecision.status, "applied");
    assert.equal(recovered.enrollment.status, "dropped");
    assert.equal(finalFailureData.decisions[0].history.filter((entry) => entry.action === "applied").length, 1);

    t.mock.reset();
    mockDependencies(t, {
        decisions: [
            buildApprovedDecision({
                status: "applying",
                isOpen: true,
                applyingByUserId: adminUserId,
                applyingAt: new Date(Date.now() - 11 * 60 * 1000),
            }),
        ],
        enrollments: buildDataset().enrollments.map((enrollment) =>
            enrollment._id === enrollmentId
                ? {
                      ...enrollment,
                      status: "dropped",
                      droppedByAcademicDecisionId: approvedDecisionId,
                  }
                : enrollment
        ),
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.applyAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
            }),
        409,
        "Academic decision application requires manual recovery"
    );

    t.mock.reset();
    mockDependencies(t, {
        decisions: [buildApprovedDecision({ status: "applied", isOpen: false, appliedByUserId: adminUserId, appliedAt: new Date() })],
        enrollments: buildDataset().enrollments.map((enrollment) =>
            enrollment._id === enrollmentId
                ? {
                      ...enrollment,
                      status: "dropped",
                      droppedByAcademicDecisionId: approvedDecisionId,
                  }
                : enrollment
        ),
    });
    await assertRejectsWith(
        () =>
            academicDecisionService.applyAcademicDecision({
                institutionId,
                decisionId,
                ...adminActor(),
            }),
        409,
        "Applied decision enrollment requires manual recovery"
    );
});

test("notification creation is idempotent and APIs are recipient scoped", async (t) => {
    const data = mockDependencies(t, {
        decisions: [buildDecision()],
    });
    await academicDecisionService.createReviewNotificationsForDecision({
        institutionId,
        institution: data.institutions[0],
        decision: data.decisions[0],
        actorUserId: headUserId,
    });
    await academicDecisionService.createReviewNotificationsForDecision({
        institutionId,
        institution: data.institutions[0],
        decision: data.decisions[0],
        actorUserId: headUserId,
    });
    assert.equal(
        data.notifications.filter((notification) => notification.type === "academic_decision_review_required").length,
        2
    );

    const ownerList = await notificationService.listMyNotifications({
        institutionId,
        actorUserId: ownerUserId,
        actorMembership: buildMembership({ _id: ownerMembershipId, userId: ownerUserId, role: "admin" }),
        query: { unreadOnly: "true" },
    });
    assert.equal(ownerList.notifications.length, 1);
    assert.equal(ownerList.notifications[0].recipientUserId, ownerUserId);

    await assertRejectsWith(
        () =>
            notificationService.markMyNotificationRead({
                institutionId,
                notificationId: normalizeId(data.notifications.find((item) => item.recipientUserId === ownerUserId)._id),
                actorUserId: adminUserId,
                actorMembership: buildMembership({ _id: adminMembershipId, userId: adminUserId, role: "admin" }),
            }),
        404,
        "Notification not found"
    );

    const marked = await notificationService.markMyNotificationRead({
        institutionId,
        notificationId: normalizeId(data.notifications.find((item) => item.recipientUserId === ownerUserId)._id),
        actorUserId: ownerUserId,
        actorMembership: buildMembership({ _id: ownerMembershipId, userId: ownerUserId, role: "admin" }),
    });
    assert.ok(marked.notification.readAt);
});

test("review notifications require active reviewer memberships and remain best-effort", async (t) => {
    const base = buildDataset();
    const data = mockDependencies(t, {
        decisions: [buildDecision()],
        memberships: base.memberships.map((membership) =>
            normalizeId(membership.userId) === ownerUserId
                ? { ...membership, status: "suspended" }
                : membership
        ),
    });

    await academicDecisionService.createReviewNotificationsForDecision({
        institutionId,
        institution: data.institutions[0],
        decision: data.decisions[0],
        actorUserId: headUserId,
    });
    assert.deepEqual(
        data.notifications.map((notification) => normalizeId(notification.recipientUserId)),
        [adminUserId]
    );

    t.mock.reset();
    const bestEffortData = mockDependencies(t);
    t.mock.method(notificationService, "createNotificationsOnce", async () => {
        throw new Error("notification store unavailable");
    });
    const errorLog = t.mock.method(console, "error", () => {});

    const result = await academicDecisionService.recommendEnrollmentDrop({
        institutionId,
        ...headActor(),
        payload: createDropPayload(),
    });

    assert.equal(result.academicDecision.status, "recommended");
    assert.equal(bestEffortData.decisions.length, 1);
    assert.equal(errorLog.mock.callCount(), 1);
});

test("controllers pass actor context and routes are wired without broad decision permissions", async (t) => {
    let receivedCreateArgs = null;
    t.mock.method(academicDecisionService, "recommendEnrollmentDrop", async (args) => {
        receivedCreateArgs = args;
        return {
            academicDecision: { id: decisionId },
        };
    });
    let receivedApproveArgs = null;
    t.mock.method(academicDecisionService, "approveAcademicDecision", async (args) => {
        receivedApproveArgs = args;
        return {
            academicDecision: { id: decisionId, status: "approved" },
        };
    });
    let receivedRejectArgs = null;
    t.mock.method(academicDecisionService, "rejectAcademicDecision", async (args) => {
        receivedRejectArgs = args;
        return {
            academicDecision: { id: decisionId, status: "rejected" },
        };
    });
    let receivedApplyArgs = null;
    t.mock.method(academicDecisionService, "applyAcademicDecision", async (args) => {
        receivedApplyArgs = args;
        return {
            academicDecision: { id: decisionId, status: "applied" },
            enrollment: { id: enrollmentId, status: "dropped" },
        };
    });
    let receivedNotificationArgs = null;
    t.mock.method(notificationService, "listMyNotifications", async (args) => {
        receivedNotificationArgs = args;
        return {
            notifications: [],
            pagination: { total: 0 },
        };
    });

    const res = createResponse();
    const membership = buildMembership();
    await academicDecisionController.recommendEnrollmentDrop(
        {
            params: { institutionId },
            user: { id: headUserId },
            membership,
            body: createDropPayload(),
        },
        res
    );
    assert.equal(res.statusCode, 201);
    assert.equal(receivedCreateArgs.actorUserId, headUserId);
    assert.equal(receivedCreateArgs.actorMembership, membership);
    assert.equal(receivedCreateArgs.payload.reason, createDropPayload().reason);

    const approveRes = createResponse();
    await academicDecisionController.approveAcademicDecision(
        {
            params: { institutionId, decisionId },
            user: { id: adminUserId },
            membership: buildMembership({ _id: adminMembershipId, userId: adminUserId, role: "admin" }),
            body: { note: "Approved for later application." },
        },
        approveRes
    );
    assert.equal(approveRes.statusCode, 200);
    assert.equal(receivedApproveArgs.actorUserId, adminUserId);
    assert.equal(receivedApproveArgs.decisionId, decisionId);
    assert.equal(receivedApproveArgs.payload.note, "Approved for later application.");

    const rejectRes = createResponse();
    await academicDecisionController.rejectAcademicDecision(
        {
            params: { institutionId, decisionId },
            user: { id: ownerUserId },
            membership: buildMembership({ _id: ownerMembershipId, userId: ownerUserId, role: "admin" }),
            body: { reason: "Rejected after administrative review." },
        },
        rejectRes
    );
    assert.equal(rejectRes.statusCode, 200);
    assert.equal(receivedRejectArgs.actorUserId, ownerUserId);
    assert.equal(receivedRejectArgs.decisionId, decisionId);
    assert.equal(receivedRejectArgs.payload.reason, "Rejected after administrative review.");

    const applyRes = createResponse();
    await academicDecisionController.applyAcademicDecision(
        {
            params: { institutionId, decisionId },
            user: { id: adminUserId },
            membership: buildMembership({ _id: adminMembershipId, userId: adminUserId, role: "admin" }),
            body: {},
        },
        applyRes
    );
    assert.equal(applyRes.statusCode, 200);
    assert.equal(receivedApplyArgs.actorUserId, adminUserId);
    assert.equal(receivedApplyArgs.decisionId, decisionId);
    assert.equal(receivedApplyArgs.actorMembership.role, "admin");

    const notificationRes = createResponse();
    await notificationController.listMyNotifications(
        {
            params: { institutionId },
            user: { id: ownerUserId },
            membership: buildMembership({ _id: ownerMembershipId, userId: ownerUserId, role: "admin" }),
            query: { unreadOnly: "true" },
        },
        notificationRes
    );
    assert.equal(notificationRes.statusCode, 200);
    assert.equal(receivedNotificationArgs.actorUserId, ownerUserId);
    assert.equal(receivedNotificationArgs.query.unreadOnly, "true");

    const decisionRoutes = institutionRoutes.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route)
        .filter((route) => String(route.path).includes("academic-decisions"));
    assert.equal(decisionRoutes.length, 8);
    const decisionRoutePaths = decisionRoutes.map((route) => `${Object.keys(route.methods).join(",")} ${route.path}`);
    assert.equal(decisionRoutePaths.includes("get /:institutionId/academic-decisions/review-queue"), true);
    assert.equal(decisionRoutePaths.includes("post /:institutionId/academic-decisions/:decisionId/approve"), true);
    assert.equal(decisionRoutePaths.includes("post /:institutionId/academic-decisions/:decisionId/reject"), true);
    assert.equal(decisionRoutePaths.includes("post /:institutionId/academic-decisions/:decisionId/apply"), true);
    for (const route of decisionRoutes) {
        const handles = route.stack.map((layer) => layer.handle);
        assert.equal(handles.some((handle) => handle.name === "authJwt"), true);
        assert.equal(handles.some((handle) => handle.name === "requireEmailVerified"), true);
        assert.equal(handles.some((handle) => handle.requiredPermission), false);
    }

    const notificationRoutes = institutionRoutes.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route)
        .filter((route) => String(route.path).includes("notifications"));
    assert.equal(notificationRoutes.length, 2);
});
