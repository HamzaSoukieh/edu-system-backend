const test = require("node:test");
const assert = require("node:assert/strict");

const AcademicDecision = require("../src/models/AcademicDecision");
const Enrollment = require("../src/models/Enrollment");
const Notification = require("../src/models/Notification");

const institutionId = "507f1f77bcf86cd799459011";
const otherInstitutionId = "507f1f77bcf86cd799459012";
const studentMemberId = "507f1f77bcf86cd799459021";
const enrollmentId = "507f1f77bcf86cd799459031";
const sectionId = "507f1f77bcf86cd799459041";
const decisionId = "507f1f77bcf86cd799459051";
const actorUserId = "507f1f77bcf86cd799459061";
const recipientUserId = "507f1f77bcf86cd799459071";
const now = new Date("2026-01-01T00:00:00.000Z");

function buildAcademicDecision(overrides = {}) {
    return new AcademicDecision({
        institutionId,
        studentMemberId,
        enrollmentId,
        sectionId,
        decisionType: "enrollment_drop",
        status: "recommended",
        reason: "Attendance and academic concerns require administrative review.",
        evidenceSnapshot: {
            capturedAt: now,
            academicStanding: {
                standing: "watch",
                requiresReview: true,
            },
        },
        scopeSnapshot: {
            responsibilityType: "head",
            sectionId,
        },
        recommendedByUserId: actorUserId,
        recommendedAt: now,
        history: [
            {
                action: "recommended",
                fromStatus: null,
                toStatus: "recommended",
                actorUserId,
                at: now,
                note: null,
            },
        ],
        ...overrides,
    });
}

function buildNotification(overrides = {}) {
    return new Notification({
        institutionId,
        recipientUserId,
        type: "academic_decision_review_required",
        title: "Enrollment drop recommendation requires review",
        message: "A Head submitted an enrollment drop recommendation that requires administrative review.",
        data: {
            academicDecisionId: decisionId,
            studentMemberId,
            enrollmentId,
            sectionId,
        },
        createdByUserId: actorUserId,
        ...overrides,
    });
}

function hasIndex(model, expectedFields, predicate = () => true) {
    return model.schema.indexes().some(([fields, options]) => {
        try {
            assert.deepEqual(fields, expectedFields);
            return predicate(options || {});
        } catch {
            return false;
        }
    });
}

function countIndexesByFields(model, expectedFields) {
    return model.schema.indexes().filter(([fields]) => {
        try {
            assert.deepEqual(fields, expectedFields);
            return true;
        } catch {
            return false;
        }
    }).length;
}

test("AcademicDecision validates a recommended enrollment-drop decision", () => {
    const decision = buildAcademicDecision();

    assert.equal(decision.validateSync(), undefined);
});

test("AcademicDecision defaults isOpen to true", () => {
    const decision = buildAcademicDecision({ isOpen: undefined });

    assert.equal(decision.isOpen, true);
    assert.equal(decision.validateSync(), undefined);
});

test("AcademicDecision accepts known history actions", () => {
    const decision = buildAcademicDecision({
        history: [
            {
                action: "applying",
                fromStatus: "approved",
                toStatus: "applying",
                actorUserId,
                at: now,
                note: null,
            },
        ],
    });

    assert.equal(decision.validateSync(), undefined);
});

test("AcademicDecision rejects unknown history actions", () => {
    const decision = buildAcademicDecision({
        history: [
            {
                action: "escalated",
                fromStatus: "recommended",
                toStatus: "recommended",
                actorUserId,
                at: now,
            },
        ],
    });

    const error = decision.validateSync();

    assert.equal(error.errors["history.0.action"].kind, "enum");
});

test("AcademicDecision rejects history notes longer than 1000 characters", () => {
    const decision = buildAcademicDecision({
        history: [
            {
                action: "recommended",
                fromStatus: null,
                toStatus: "recommended",
                actorUserId,
                at: now,
                note: "a".repeat(1001),
            },
        ],
    });

    const error = decision.validateSync();

    assert.equal(error.errors["history.0.note"].kind, "maxlength");
});

test("AcademicDecision allows initial history fromStatus null with current Mongoose", () => {
    const decision = buildAcademicDecision({
        history: [
            {
                action: "recommended",
                fromStatus: null,
                toStatus: "recommended",
                actorUserId,
                at: now,
            },
        ],
    });

    assert.equal(decision.validateSync(), undefined);
});

test("AcademicDecision rejects invalid status and decision type", () => {
    const applyingStatus = buildAcademicDecision({ status: "applying" });
    const invalidStatus = buildAcademicDecision({ status: "pending" });
    const invalidType = buildAcademicDecision({ decisionType: "subject_drop" });

    assert.equal(applyingStatus.validateSync(), undefined);
    assert.equal(invalidStatus.validateSync().errors.status.kind, "enum");
    assert.equal(invalidType.validateSync().errors.decisionType.kind, "enum");
});

test("AcademicDecision has applying metadata and reviewSnapshot paths", () => {
    const decision = buildAcademicDecision({
        status: "applying",
        applyingByUserId: actorUserId,
        applyingAt: now,
        reviewSnapshot: {
            reviewedAt: now,
            evidenceChanged: false,
        },
    });

    assert.equal(decision.validateSync(), undefined);
    assert.equal(AcademicDecision.schema.path("applyingByUserId").options.ref, "User");
    assert.equal(AcademicDecision.schema.path("applyingAt").instance, "Date");
    assert.equal(AcademicDecision.schema.path("reviewSnapshot").options.immutable, undefined);
});

test("AcademicDecision requires enrollment-drop target fields", () => {
    for (const field of ["institutionId", "studentMemberId", "enrollmentId", "sectionId"]) {
        const decision = buildAcademicDecision({ [field]: undefined });
        const error = decision.validateSync();

        assert.equal(error.errors[field].kind, "required");
    }
});

test("AcademicDecision identity and snapshot fields are immutable", () => {
    for (const field of [
        "institutionId",
        "studentMemberId",
        "enrollmentId",
        "sectionId",
        "decisionType",
        "recommendedByUserId",
        "recommendedAt",
        "evidenceSnapshot",
        "scopeSnapshot",
    ]) {
        assert.equal(AcademicDecision.schema.path(field).options.immutable, true, field);
    }

    assert.notEqual(AcademicDecision.schema.path("status").options.immutable, true);
    assert.notEqual(AcademicDecision.schema.path("isOpen").options.immutable, true);
    assert.notEqual(AcademicDecision.schema.path("history").options.immutable, true);
});

test("AcademicDecision has a partial unique open-decision index", () => {
    const found = hasIndex(
        AcademicDecision,
        {
            institutionId: 1,
            enrollmentId: 1,
            decisionType: 1,
        },
        (options) => options.unique === true && assert.deepEqual(options.partialFilterExpression, { isOpen: true }) === undefined
    );

    assert.equal(found, true);
});

test("AcademicDecision review queue index is recent-first and not duplicated", () => {
    assert.equal(hasIndex(AcademicDecision, { institutionId: 1, status: 1, createdAt: -1 }), true);
    assert.equal(countIndexesByFields(AcademicDecision, { institutionId: 1, status: 1 }), 0);

    const duplicateFieldSpecs = AcademicDecision.schema.indexes()
        .map(([fields]) => JSON.stringify(fields))
        .filter((fields, index, allFields) => allFields.indexOf(fields) !== index);

    assert.deepEqual(duplicateFieldSpecs, []);
});

test("Notification validates an academic decision notification", () => {
    const notification = buildNotification();

    assert.equal(notification.validateSync(), undefined);
});

test("Notification requires data and nested decision data fields", () => {
    const missingData = buildNotification({ data: undefined });
    const missingSection = buildNotification({
        data: {
            academicDecisionId: decisionId,
            studentMemberId,
            enrollmentId,
        },
    });

    assert.equal(missingData.validateSync().errors.data.kind, "required");
    assert.equal(missingSection.validateSync().errors["data.sectionId"].kind, "required");
});

test("Notification rejects invalid type", () => {
    const studentNotification = buildNotification({ type: "enrollment_status_changed" });
    const notification = buildNotification({ type: "academic_decision_sent_by_email" });

    assert.equal(studentNotification.validateSync(), undefined);
    assert.equal(notification.validateSync().errors.type.kind, "enum");
});

test("Notification title and message length limits are enforced", () => {
    const longTitle = buildNotification({ title: "a".repeat(161) });
    const longMessage = buildNotification({ message: "b".repeat(501) });

    assert.equal(longTitle.validateSync().errors.title.kind, "maxlength");
    assert.equal(longMessage.validateSync().errors.message.kind, "maxlength");
});

test("Notification readAt defaults to null", () => {
    const notification = buildNotification();

    assert.equal(notification.readAt, null);
});

test("Notification identity and content fields are immutable while readAt stays mutable", () => {
    for (const field of [
        "institutionId",
        "recipientUserId",
        "type",
        "title",
        "message",
        "data",
        "createdByUserId",
    ]) {
        assert.equal(Notification.schema.path(field).options.immutable, true, field);
    }

    assert.notEqual(Notification.schema.path("readAt").options.immutable, true);
});

test("Notification keeps the unique decision-notification index", () => {
    const found = hasIndex(
        Notification,
        {
            institutionId: 1,
            recipientUserId: 1,
            type: 1,
            "data.academicDecisionId": 1,
        },
        (options) => options.unique === true
    );

    assert.equal(found, true);
});

test("Notification decision data uses an embedded schema without _id", () => {
    assert.equal(Notification.schema.path("data").schema.options._id, false);
});

test("Enrollment has AcademicDecision drop audit linkage fields", () => {
    const enrollment = new Enrollment({
        institutionId,
        sectionId,
        studentMemberId,
        status: "dropped",
        enrolledAt: now,
        droppedAt: now,
        droppedByUserId: actorUserId,
        droppedByAcademicDecisionId: decisionId,
        createdByUserId: actorUserId,
    });

    assert.equal(enrollment.validateSync(), undefined);
    assert.equal(Enrollment.schema.path("droppedByUserId").options.ref, "User");
    assert.equal(Enrollment.schema.path("droppedByAcademicDecisionId").options.ref, "AcademicDecision");
});
