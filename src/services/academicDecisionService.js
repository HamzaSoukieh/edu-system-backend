const mongoose = require("mongoose");
const AcademicDecision = require("../models/AcademicDecision");
const Enrollment = require("../models/Enrollment");
const Institution = require("../models/Institution");
const Membership = require("../models/Membership");
const SchoolClass = require("../models/SchoolClass");
const Section = require("../models/Section");
const Subject = require("../models/Subject");
const { ROLE_PERMISSIONS } = require("../auth/permissions");
const academicOversightService = require("./academicOversightService");
const enrollmentService = require("./enrollmentService");
const notificationService = require("./notificationService");

const DECISION_TYPE_ENROLLMENT_DROP = "enrollment_drop";
const DECISION_TYPES = [DECISION_TYPE_ENROLLMENT_DROP];
const DECISION_STATUSES = ["recommended", "approved", "applying", "rejected", "applied", "cancelled"];
const ACTIVE_MEMBERSHIP_STATUS = "active";
const ACTIVE_ENROLLMENT_STATUS = "enrolled";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const STALE_DECISION_APPLICATION_MS = 10 * 60 * 1000;
const CREATE_ENROLLMENT_DROP_FIELDS = ["enrollmentId", "studentMemberId", "reason"];
const APPROVE_DECISION_FIELDS = ["note"];
const REJECT_DECISION_FIELDS = ["reason"];
const REVIEW_SELECT_FIELDS = "_id institutionId studentMemberId enrollmentId sectionId decisionType status isOpen reason evidenceSnapshot scopeSnapshot reviewSnapshot recommendedByUserId approvedByUserId rejectedByUserId appliedByUserId applyingByUserId cancelledByUserId recommendedAt approvedAt rejectedAt appliedAt applyingAt cancelledAt history createdAt updatedAt";

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeId(value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || null;
    }

    if (typeof value.toString === "function") {
        const normalized = value.toString().trim();
        return normalized || null;
    }

    return null;
}

function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeLowerString(value) {
    return normalizeString(value).toLowerCase();
}

function isValidObjectId(value) {
    const normalized = normalizeId(value);
    return Boolean(normalized) && mongoose.Types.ObjectId.isValid(normalized);
}

function validateObjectId(value, fieldName) {
    const normalized = normalizeId(value);
    if (!normalized || !isValidObjectId(normalized)) {
        throw createError(400, `${fieldName} is invalid`);
    }

    return normalized;
}

function parsePositiveInteger(rawValue, fallback, min, max) {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < min) {
        return fallback;
    }

    return max !== undefined && parsed > max ? max : parsed;
}

function uniqueIds(values) {
    return [...new Set(values.map(normalizeId).filter(Boolean))];
}

function isOpenEnrollmentDropDuplicateKeyError(error) {
    if (!error || error.code !== 11000) {
        return false;
    }

    const keyPattern = error.keyPattern || {};
    const hasOpenDecisionKey =
        keyPattern.institutionId === 1 &&
        keyPattern.enrollmentId === 1 &&
        keyPattern.decisionType === 1;
    const indexName = typeof error.index === "string" ? error.index : "";
    const message = typeof error.message === "string" ? error.message : "";

    return (
        hasOpenDecisionKey ||
        indexName.includes("institutionId_1_enrollmentId_1_decisionType_1") ||
        message.includes("institutionId_1_enrollmentId_1_decisionType_1")
    );
}

function ensureActiveActorMembership({ institutionId, actorUserId, actorMembership }) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (normalizeId(actorMembership.institutionId) !== normalizeId(institutionId)) {
        throw createError(403, "Institution access denied");
    }

    if (normalizeId(actorMembership.userId) !== normalizeId(actorUserId)) {
        throw createError(403, "Institution access denied");
    }

    if (actorMembership.status !== ACTIVE_MEMBERSHIP_STATUS) {
        throw createError(403, "Institution access denied");
    }
}

function validateCreateEnrollmentDropInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const unknownFields = Object.keys(payload).filter((field) => !CREATE_ENROLLMENT_DROP_FIELDS.includes(field));
    if (unknownFields.length) {
        throw createError(400, `Unexpected field: ${unknownFields[0]}`);
    }

    const reason = normalizeString(payload.reason);
    if (reason.length < 10) {
        throw createError(400, "reason must be at least 10 characters");
    }
    if (reason.length > 2000) {
        throw createError(400, "reason must be at most 2000 characters");
    }

    return {
        enrollmentId: validateObjectId(payload.enrollmentId, "enrollmentId"),
        studentMemberId: validateObjectId(payload.studentMemberId, "studentMemberId"),
        reason,
    };
}

function validateApprovePayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const unknownFields = Object.keys(payload).filter((field) => !APPROVE_DECISION_FIELDS.includes(field));
    if (unknownFields.length) {
        throw createError(400, `Unexpected field: ${unknownFields[0]}`);
    }

    const note = payload.note === undefined || payload.note === null ? null : normalizeString(payload.note);
    if (note !== null && note.length > 1000) {
        throw createError(400, "note must be at most 1000 characters");
    }

    return { note: note || null };
}

function validateRejectPayload(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const unknownFields = Object.keys(payload).filter((field) => !REJECT_DECISION_FIELDS.includes(field));
    if (unknownFields.length) {
        throw createError(400, `Unexpected field: ${unknownFields[0]}`);
    }

    const reason = normalizeString(payload.reason);
    if (reason.length < 10) {
        throw createError(400, "reason must be at least 10 characters");
    }
    if (reason.length > 1000) {
        throw createError(400, "reason must be at most 1000 characters");
    }

    return { reason };
}

function validateListQuery(query = {}) {
    const status = normalizeLowerString(query.status);
    if (status && !DECISION_STATUSES.includes(status)) {
        throw createError(400, `status must be one of: ${DECISION_STATUSES.join(", ")}`);
    }

    const decisionType = normalizeLowerString(query.decisionType);
    if (decisionType && !DECISION_TYPES.includes(decisionType)) {
        throw createError(400, `decisionType must be one of: ${DECISION_TYPES.join(", ")}`);
    }

    return {
        status: status || null,
        decisionType: decisionType || null,
        studentMemberId: query.studentMemberId
            ? validateObjectId(query.studentMemberId, "studentMemberId")
            : null,
        sectionId: query.sectionId ? validateObjectId(query.sectionId, "sectionId") : null,
        recommendedByUserId: query.recommendedByUserId
            ? validateObjectId(query.recommendedByUserId, "recommendedByUserId")
            : null,
        page: parsePositiveInteger(query.page, DEFAULT_PAGE, 1),
        limit: parsePositiveInteger(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
    };
}

function toHistoryResponse(entry) {
    return {
        action: entry.action,
        fromStatus: entry.fromStatus || null,
        toStatus: entry.toStatus,
        actorUserId: normalizeId(entry.actorUserId),
        at: entry.at,
        note: entry.note || null,
    };
}

function toAcademicDecisionResponse(decision, { includeHistory = true } = {}) {
    const response = {
        id: normalizeId(decision._id),
        institutionId: normalizeId(decision.institutionId),
        studentMemberId: normalizeId(decision.studentMemberId),
        enrollmentId: normalizeId(decision.enrollmentId),
        sectionId: normalizeId(decision.sectionId),
        decisionType: decision.decisionType,
        status: decision.status,
        isOpen: decision.isOpen,
        reason: decision.reason,
        evidenceSnapshot: decision.evidenceSnapshot || {},
        scopeSnapshot: decision.scopeSnapshot || {},
        reviewSnapshot: decision.reviewSnapshot || null,
        recommendedByUserId: normalizeId(decision.recommendedByUserId),
        approvedByUserId: normalizeId(decision.approvedByUserId),
        rejectedByUserId: normalizeId(decision.rejectedByUserId),
        appliedByUserId: normalizeId(decision.appliedByUserId),
        applyingByUserId: normalizeId(decision.applyingByUserId),
        cancelledByUserId: normalizeId(decision.cancelledByUserId),
        recommendedAt: decision.recommendedAt || null,
        approvedAt: decision.approvedAt || null,
        rejectedAt: decision.rejectedAt || null,
        appliedAt: decision.appliedAt || null,
        applyingAt: decision.applyingAt || null,
        cancelledAt: decision.cancelledAt || null,
        createdAt: decision.createdAt,
        updatedAt: decision.updatedAt,
    };

    if (includeHistory) {
        response.history = Array.isArray(decision.history) ? decision.history.map(toHistoryResponse) : [];
    }

    return response;
}

async function resolveHeadDecisionScope({
    institutionId,
    actorUserId,
    actorMembership,
    permission,
}) {
    ensureActiveActorMembership({
        institutionId,
        actorUserId,
        actorMembership,
    });

    if (actorMembership.role !== "instructor") {
        throw createError(403, "Permission denied");
    }

    return academicOversightService.resolveAcademicOversightStudentScope({
        institutionId,
        actorUserId,
        actorMembership,
        permission,
        allowInstitutionRoleAccess: false,
        includeAssignments: true,
    });
}

async function resolveReviewAuthority({
    institutionId,
    actorUserId,
    actorMembership,
    permission = "academicDecision.review",
}) {
    ensureActiveActorMembership({
        institutionId,
        actorUserId,
        actorMembership,
    });

    const institution = await Institution.findOne({
        _id: institutionId,
    })
        .select("_id ownerUserId type policies")
        .lean();
    if (!institution) {
        throw createError(404, "Institution not found");
    }

    const isOwner = normalizeId(institution.ownerUserId) === normalizeId(actorUserId);
    const rolePermissions = ROLE_PERMISSIONS[actorMembership.role] || [];
    const hasPermission = rolePermissions.includes(permission);
    if (!isOwner && !hasPermission) {
        throw createError(403, "Permission denied");
    }

    return {
        institution,
        isOwner,
        hasPermission,
    };
}

function assignmentMatchesSection({ assignment, institutionId, section, subject, schoolClass }) {
    if (!assignment) {
        return false;
    }

    if (assignment.scopeType === "institution") {
        return normalizeId(assignment.scopeId) === normalizeId(institutionId);
    }

    if (assignment.scopeType === "department") {
        return normalizeId(subject?.departmentId) === normalizeId(assignment.scopeId);
    }

    if (assignment.scopeType === "classLevel") {
        return (
            normalizeId(subject?.classLevelId) === normalizeId(assignment.scopeId) ||
            normalizeId(schoolClass?.classLevelId) === normalizeId(assignment.scopeId)
        );
    }

    return false;
}

function buildScopeSnapshot({ institutionId, sectionId, assignments, section, subject, schoolClass }) {
    const matchedAssignments = (assignments || []).filter((assignment) =>
        assignmentMatchesSection({
            assignment,
            institutionId,
            section,
            subject,
            schoolClass,
        })
    );

    return {
        responsibilityType: "head",
        matchedAssignmentIds: uniqueIds(matchedAssignments.map((assignment) => assignment._id)),
        institutionWide: matchedAssignments.some((assignment) => assignment.scopeType === "institution"),
        departmentIds: uniqueIds(
            matchedAssignments
                .filter((assignment) => assignment.scopeType === "department")
                .map((assignment) => assignment.scopeId)
        ),
        classLevelIds: uniqueIds(
            matchedAssignments
                .filter((assignment) => assignment.scopeType === "classLevel")
                .map((assignment) => assignment.scopeId)
        ),
        sectionId: normalizeId(sectionId),
    };
}

async function loadEnrollmentDropContext({
    institutionId,
    enrollmentId,
    studentMemberId,
    scope,
    assignments,
}) {
    const authorizedStudentMemberIds = uniqueIds(scope.studentMemberIds || []);
    const authorizedSectionIds = uniqueIds(scope.sectionIds || []);

    if (!authorizedStudentMemberIds.includes(studentMemberId)) {
        throw createError(403, "Student is outside academic decision scope");
    }

    const [studentMembership, enrollment] = await Promise.all([
        Membership.findOne({
            _id: studentMemberId,
            institutionId,
            role: "student",
            status: ACTIVE_MEMBERSHIP_STATUS,
        })
            .select("_id institutionId userId role status")
            .lean(),
        Enrollment.findOne({
            _id: enrollmentId,
            institutionId,
            studentMemberId,
        })
            .select("_id institutionId sectionId studentMemberId status")
            .lean(),
    ]);

    if (!studentMembership) {
        throw createError(404, "Student member not found");
    }

    if (!enrollment) {
        throw createError(404, "Enrollment not found");
    }

    if (enrollment.status !== ACTIVE_ENROLLMENT_STATUS) {
        throw createError(409, "Only active enrolled enrollments can be recommended for drop");
    }

    const sectionId = normalizeId(enrollment.sectionId);
    if (!scope.institutionWide && !authorizedSectionIds.includes(sectionId)) {
        throw createError(403, "Enrollment is outside academic decision scope");
    }

    const section = await Section.findOne({
        _id: sectionId,
        institutionId,
    })
        .select("_id institutionId subjectId schoolClassId status")
        .lean();
    if (!section) {
        throw createError(404, "Section not found");
    }

    if (!scope.institutionWide && !authorizedSectionIds.includes(normalizeId(section._id))) {
        throw createError(403, "Enrollment is outside academic decision scope");
    }

    const [subject, schoolClass] = await Promise.all([
        Subject.findOne({
            _id: section.subjectId,
            institutionId,
        })
            .select("_id institutionId departmentId classLevelId")
            .lean(),
        section.schoolClassId
            ? SchoolClass.findOne({
                  _id: section.schoolClassId,
                  institutionId,
              })
                  .select("_id institutionId classLevelId")
                  .lean()
            : Promise.resolve(null),
    ]);
    if (!subject) {
        throw createError(404, "Subject not found");
    }

    const scopeSnapshot = buildScopeSnapshot({
        institutionId,
        sectionId: section._id,
        assignments,
        section,
        subject,
        schoolClass,
    });
    if (!scopeSnapshot.matchedAssignmentIds.length) {
        throw createError(403, "Enrollment is outside academic decision scope");
    }

    return {
        enrollment,
        section,
        subject,
        schoolClass,
        scopeSnapshot,
    };
}

async function ensureNoOpenEnrollmentDropRecommendation({ institutionId, enrollmentId }) {
    const existing = await AcademicDecision.findOne({
        institutionId,
        enrollmentId,
        decisionType: DECISION_TYPE_ENROLLMENT_DROP,
        isOpen: true,
    })
        .select("_id status isOpen")
        .lean();

    if (existing) {
        throw createError(409, "An open enrollment drop recommendation already exists for this enrollment");
    }
}

async function resolveAcademicDecisionReviewerUserIds({ institutionId, institution }) {
    const adminMemberships = await Membership.find({
        institutionId,
        role: "admin",
        status: ACTIVE_MEMBERSHIP_STATUS,
    })
        .select("_id userId institutionId role status")
        .lean();

    const activeAdminUserIds = uniqueIds(adminMemberships.map((membership) => membership.userId));
    const ownerUserId = normalizeId(institution?.ownerUserId);
    let ownerHasActiveAccess = false;
    if (ownerUserId) {
        const ownerMembership = await Membership.findOne({
            institutionId,
            userId: ownerUserId,
            status: ACTIVE_MEMBERSHIP_STATUS,
        })
            .select("_id userId institutionId role status")
            .lean();
        ownerHasActiveAccess = Boolean(ownerMembership);
    }

    return uniqueIds([
        ...activeAdminUserIds,
        ownerHasActiveAccess ? ownerUserId : null,
    ]);
}

async function createReviewNotificationsForDecision({
    institutionId,
    institution,
    decision,
    actorUserId,
    notificationType = "academic_decision_review_required",
    title = "Enrollment drop recommendation requires review",
    message = "A Head submitted an enrollment drop recommendation that requires administrative review.",
}) {
    const recipientUserIds = await resolveAcademicDecisionReviewerUserIds({
        institutionId,
        institution,
    });
    if (!recipientUserIds.length) {
        return {
            recipientUserIds: [],
            notifications: [],
        };
    }

    const notificationItems = recipientUserIds.map((recipientUserId) => ({
        institutionId,
        recipientUserId,
        type: notificationType,
        title,
        message,
        data: {
            academicDecisionId: decision._id,
            studentMemberId: decision.studentMemberId,
            enrollmentId: decision.enrollmentId,
            sectionId: decision.sectionId,
        },
        createdByUserId: actorUserId,
    }));

    const notificationResults = await notificationService.createNotificationsOnce(notificationItems);
    return {
        recipientUserIds,
        notifications: notificationResults.map((result) => result.notification),
    };
}

async function notifyDecisionRecommender({
    institutionId,
    decision,
    actorUserId,
    notificationType,
    title,
    message,
}) {
    const result = await notificationService.createNotificationOnce({
        institutionId,
        recipientUserId: decision.recommendedByUserId,
        type: notificationType,
        title,
        message,
        data: {
            academicDecisionId: decision._id,
            studentMemberId: decision.studentMemberId,
            enrollmentId: decision.enrollmentId,
            sectionId: decision.sectionId,
        },
        createdByUserId: actorUserId,
    });

    return result.notification;
}

async function markReviewerNotificationRead({
    institutionId,
    decisionId,
    actorUserId,
}) {
    return notificationService.markDecisionNotificationReadForRecipient({
        institutionId,
        recipientUserId: actorUserId,
        academicDecisionId: decisionId,
        type: "academic_decision_review_required",
    });
}

async function resolveReviewRequiredNotifications({ institutionId, decisionId }) {
    return notificationService.markDecisionReviewNotificationsRead({
        institutionId,
        academicDecisionId: decisionId,
    });
}

function normalizeEvidenceLevel(value) {
    return normalizeLowerString(value || "");
}

// TODO/verify: V1 approval blocks only risk-category drift, not every numeric evidence change.
function hasRiskCategoryChanged(previousSnapshot = {}, currentSnapshot = {}) {
    return (
        normalizeEvidenceLevel(previousSnapshot.attendanceRisk?.level) !==
            normalizeEvidenceLevel(currentSnapshot.attendanceRisk?.level) ||
        normalizeEvidenceLevel(previousSnapshot.gradeRisk?.level) !==
            normalizeEvidenceLevel(currentSnapshot.gradeRisk?.level) ||
        normalizeLowerString(previousSnapshot.academicStanding?.standing) !==
            normalizeLowerString(currentSnapshot.academicStanding?.standing)
    );
}

async function validateCurrentApprovalContext({
    institution,
    institutionId,
    decision,
    reviewedAt,
}) {
    const [enrollment, studentMembership, section] = await Promise.all([
        Enrollment.findOne({
            _id: decision.enrollmentId,
            institutionId,
            studentMemberId: decision.studentMemberId,
            sectionId: decision.sectionId,
        })
            .select("_id institutionId sectionId studentMemberId status")
            .lean(),
        Membership.findOne({
            _id: decision.studentMemberId,
            institutionId,
            role: "student",
            status: ACTIVE_MEMBERSHIP_STATUS,
        })
            .select("_id institutionId userId role status")
            .lean(),
        Section.findOne({
            _id: decision.sectionId,
            institutionId,
        })
            .select("_id institutionId subjectId schoolClassId status")
            .lean(),
    ]);

    if (!enrollment) {
        throw createError(409, "Enrollment is no longer valid for this decision");
    }
    if (enrollment.status !== ACTIVE_ENROLLMENT_STATUS) {
        throw createError(409, "Enrollment is no longer active");
    }
    if (!studentMembership) {
        throw createError(409, "Student membership is no longer active");
    }
    if (!section) {
        throw createError(409, "Section is no longer available");
    }

    const currentEvidence = await academicOversightService.buildAcademicOversightEvidenceSnapshot({
        institution,
        institutionId,
        studentMemberId: normalizeId(decision.studentMemberId),
        sectionIds: [normalizeId(decision.sectionId)],
        capturedAt: reviewedAt,
    });
    const evidenceChanged = hasRiskCategoryChanged(decision.evidenceSnapshot, currentEvidence);
    if (evidenceChanged) {
        throw createError(409, "Academic decision evidence has materially changed");
    }

    return {
        reviewSnapshot: {
            reviewedAt,
            enrollmentStatus: enrollment.status,
            currentAttendanceRisk: currentEvidence.attendanceRisk || null,
            currentGradeRisk: currentEvidence.gradeRisk || null,
            currentAcademicStanding: currentEvidence.academicStanding || null,
            evidenceChanged: false,
        },
    };
}

function assertReviewableDecision({ decision, actorUserId }) {
    if (!decision) {
        throw createError(404, "Academic decision not found");
    }
    if (decision.decisionType !== DECISION_TYPE_ENROLLMENT_DROP) {
        throw createError(409, "Only enrollment drop decisions can be reviewed");
    }
    if (decision.status !== "recommended" || decision.isOpen !== true) {
        throw createError(409, "Only recommended academic decisions can be reviewed");
    }
    if (normalizeId(decision.recommendedByUserId) === normalizeId(actorUserId)) {
        throw createError(403, "Reviewers cannot review their own recommendation");
    }
}

function toAppliedDecisionResponse(decision) {
    return {
        id: normalizeId(decision._id),
        decisionType: decision.decisionType,
        status: decision.status,
        studentMemberId: normalizeId(decision.studentMemberId),
        enrollmentId: normalizeId(decision.enrollmentId),
        sectionId: normalizeId(decision.sectionId),
        recommendedAt: decision.recommendedAt || null,
        approvedAt: decision.approvedAt || null,
        appliedAt: decision.appliedAt || null,
    };
}

function toCompactEnrollmentResponse(enrollment) {
    return {
        id: normalizeId(enrollment._id || enrollment.id),
        sectionId: normalizeId(enrollment.sectionId),
        studentMemberId: normalizeId(enrollment.studentMemberId),
        status: enrollment.status,
    };
}

function assertApplicableDecision(decision) {
    if (!decision) {
        throw createError(404, "Academic decision not found");
    }
    if (decision.decisionType !== DECISION_TYPE_ENROLLMENT_DROP) {
        throw createError(409, "Only enrollment drop decisions can be applied");
    }
    if (decision.status === "applied") {
        return;
    }
    if (decision.status === "applying") {
        return;
    }
    if (decision.status !== "approved") {
        throw createError(409, "Only approved academic decisions can be applied");
    }
}

async function validateCurrentApplyContext({ institutionId, decision }) {
    const [enrollment, studentMembership, section] = await Promise.all([
        Enrollment.findOne({
            _id: decision.enrollmentId,
            institutionId,
            studentMemberId: decision.studentMemberId,
            sectionId: decision.sectionId,
        })
            .select("_id institutionId sectionId studentMemberId status droppedAt droppedByUserId droppedByAcademicDecisionId")
            .lean(),
        Membership.findOne({
            _id: decision.studentMemberId,
            institutionId,
            role: "student",
            status: ACTIVE_MEMBERSHIP_STATUS,
        })
            .select("_id institutionId userId role status")
            .lean(),
        Section.findOne({
            _id: decision.sectionId,
            institutionId,
        })
            .select("_id institutionId subjectId schoolClassId status")
            .lean(),
    ]);

    if (!enrollment) {
        throw createError(409, "Enrollment is no longer valid for this decision");
    }
    if (enrollment.status !== ACTIVE_ENROLLMENT_STATUS) {
        throw createError(409, "Enrollment is no longer active");
    }
    if (!studentMembership) {
        throw createError(409, "Student membership is no longer active");
    }
    if (!section) {
        throw createError(409, "Section is no longer available");
    }

    return {
        enrollment,
        studentMembership,
        section,
    };
}

async function notifyAppliedDecisionRecipients({
    institutionId,
    decision,
    studentMembership,
    actorUserId,
}) {
    const notifications = [];
    const headNotification = await notificationService.createNotificationOnce({
        institutionId,
        recipientUserId: decision.recommendedByUserId,
        type: "academic_decision_applied",
        title: "Enrollment drop decision applied",
        message: "The approved enrollment drop decision was applied.",
        data: {
            academicDecisionId: decision._id,
            studentMemberId: decision.studentMemberId,
            enrollmentId: decision.enrollmentId,
            sectionId: decision.sectionId,
        },
        createdByUserId: actorUserId,
    });
    notifications.push(headNotification.notification);

    const studentUserId = normalizeId(studentMembership?.userId);
    if (studentUserId) {
        const studentNotification = await notificationService.createNotificationOnce({
            institutionId,
            recipientUserId: studentUserId,
            type: "enrollment_status_changed",
            title: "Enrollment status updated",
            message: "Your enrollment in a section has been updated. Contact your institution if you need more information.",
            data: {
                academicDecisionId: decision._id,
                studentMemberId: decision.studentMemberId,
                enrollmentId: decision.enrollmentId,
                sectionId: decision.sectionId,
            },
            createdByUserId: actorUserId,
        });
        notifications.push(studentNotification.notification);
    }

    return notifications;
}

function enrollmentWasDroppedByDecision(enrollment, decisionId) {
    return normalizeId(enrollment?.droppedByAcademicDecisionId) === normalizeId(decisionId);
}

function isApplyingClaimStale(decision, now = new Date()) {
    if (!decision?.applyingAt) {
        return null;
    }

    const applyingAtMs = new Date(decision.applyingAt).getTime();
    if (!Number.isFinite(applyingAtMs)) {
        return null;
    }

    return now.getTime() - applyingAtMs >= STALE_DECISION_APPLICATION_MS;
}

async function loadApplicationEnrollment({ institutionId, decision }) {
    return Enrollment.findOne({
        _id: decision.enrollmentId,
        institutionId,
        studentMemberId: decision.studentMemberId,
        sectionId: decision.sectionId,
    })
        .select("_id institutionId sectionId studentMemberId status droppedAt droppedByUserId droppedByAcademicDecisionId")
        .lean();
}

async function revertApplicationClaimIfEnrollmentStillEnrolled({
    institutionId,
    decision,
    applyingAt,
}) {
    const revertedDecision = await AcademicDecision.findOneAndUpdate(
        {
            _id: decision._id,
            institutionId,
            decisionType: DECISION_TYPE_ENROLLMENT_DROP,
            status: "applying",
            isOpen: true,
            applyingAt,
        },
        {
            $set: {
                status: "approved",
                isOpen: true,
                applyingByUserId: null,
                applyingAt: null,
            },
        },
        { returnDocument: "after", runValidators: true }
    )
        .select(REVIEW_SELECT_FIELDS)
        .lean();

    return revertedDecision;
}

async function finalizeAppliedDecision({
    institutionId,
    decisionId,
    actorUserId,
    studentMembership,
    enrollment,
}) {
    const appliedAt = new Date();
    const appliedDecision = await AcademicDecision.findOneAndUpdate(
        {
            _id: decisionId,
            institutionId,
            decisionType: DECISION_TYPE_ENROLLMENT_DROP,
            status: "applying",
            isOpen: true,
        },
        {
            $set: {
                status: "applied",
                isOpen: false,
                appliedByUserId: actorUserId,
                appliedAt,
            },
            $push: {
                history: {
                    action: "applied",
                    fromStatus: "applying",
                    toStatus: "applied",
                    actorUserId,
                    at: appliedAt,
                    note: null,
                },
            },
        },
        { returnDocument: "after", runValidators: true }
    )
        .select(REVIEW_SELECT_FIELDS)
        .lean();

    if (!appliedDecision) {
        throw createError(409, "Academic decision application requires manual recovery");
    }

    try {
        await notifyAppliedDecisionRecipients({
            institutionId,
            decision: appliedDecision,
            studentMembership,
            actorUserId,
        });
    } catch (error) {
        console.error("Failed to create academic decision applied notifications", {
            academicDecisionId: normalizeId(appliedDecision._id),
            institutionId,
            error: error.message,
        });
    }

    return {
        academicDecision: toAppliedDecisionResponse(appliedDecision),
        enrollment: toCompactEnrollmentResponse(enrollment),
    };
}

async function recommendEnrollmentDrop({
    institutionId,
    enrollmentId,
    studentMemberId,
    actorUserId,
    actorMembership,
    payload,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const input = validateCreateEnrollmentDropInput({
        ...(payload || {}),
        enrollmentId: enrollmentId || payload?.enrollmentId,
        studentMemberId: studentMemberId || payload?.studentMemberId,
    });
    const { institution, scope, assignments } = await resolveHeadDecisionScope({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
        permission: "academicDecision.recommend_scope",
    });

    const context = await loadEnrollmentDropContext({
        institutionId: normalizedInstitutionId,
        enrollmentId: input.enrollmentId,
        studentMemberId: input.studentMemberId,
        scope,
        assignments,
    });
    await ensureNoOpenEnrollmentDropRecommendation({
        institutionId: normalizedInstitutionId,
        enrollmentId: input.enrollmentId,
    });

    const now = new Date();
    const evidenceSnapshot = await academicOversightService.buildAcademicOversightEvidenceSnapshot({
        institution,
        institutionId: normalizedInstitutionId,
        studentMemberId: input.studentMemberId,
        sectionIds: [normalizeId(context.section._id)],
        capturedAt: now,
    });

    let decision;
    try {
        decision = await AcademicDecision.create({
            institutionId: normalizedInstitutionId,
            studentMemberId: input.studentMemberId,
            enrollmentId: input.enrollmentId,
            sectionId: context.section._id,
            decisionType: DECISION_TYPE_ENROLLMENT_DROP,
            status: "recommended",
            isOpen: true,
            reason: input.reason,
            evidenceSnapshot,
            scopeSnapshot: context.scopeSnapshot,
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
        });
    } catch (error) {
        if (isOpenEnrollmentDropDuplicateKeyError(error)) {
            throw createError(409, "An open enrollment drop recommendation already exists for this enrollment");
        }

        throw error;
    }

    try {
        await createReviewNotificationsForDecision({
            institutionId: normalizedInstitutionId,
            institution,
            decision,
            actorUserId,
        });
    } catch (error) {
        // TODO/verify: route this to a shared internal logger if/when the repo adds one.
        console.error("Failed to create academic decision review notifications", {
            academicDecisionId: normalizeId(decision._id),
            institutionId: normalizedInstitutionId,
            error: error.message,
        });
    }

    return {
        academicDecision: toAcademicDecisionResponse(decision),
    };
}

function buildScopedDecisionQuery({ institutionId, scope, filters = {} }) {
    const authorizedSectionIds = uniqueIds(scope.sectionIds || []);
    if (!scope.institutionWide && !authorizedSectionIds.length) {
        return null;
    }

    const query = {
        institutionId,
    };
    if (!scope.institutionWide) {
        query.sectionId = { $in: authorizedSectionIds };
    }
    if (filters.status) {
        query.status = filters.status;
    }
    if (filters.decisionType) {
        query.decisionType = filters.decisionType;
    }
    if (filters.studentMemberId) {
        query.studentMemberId = filters.studentMemberId;
    }
    if (filters.sectionId) {
        if (!scope.institutionWide && !authorizedSectionIds.includes(filters.sectionId)) {
            return null;
        }
        query.sectionId = filters.sectionId;
    }
    if (filters.recommendedByUserId) {
        query.recommendedByUserId = filters.recommendedByUserId;
    }

    return query;
}

async function listAcademicDecisions({
    institutionId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const filters = validateListQuery(query);
    const { scope } = await resolveHeadDecisionScope({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
        permission: "academicDecision.read_scope",
    });
    const decisionQuery = buildScopedDecisionQuery({
        institutionId: normalizedInstitutionId,
        scope,
        filters,
    });
    if (!decisionQuery) {
        return {
            academicDecisions: [],
            pagination: {
                page: filters.page,
                limit: filters.limit,
                total: 0,
                totalPages: 0,
            },
        };
    }

    const [total, decisions] = await Promise.all([
        AcademicDecision.countDocuments(decisionQuery),
        AcademicDecision.find(decisionQuery)
            .select("-history")
            .sort({ recommendedAt: -1, createdAt: -1, _id: -1 })
            .skip((filters.page - 1) * filters.limit)
            .limit(filters.limit)
            .lean(),
    ]);

    return {
        academicDecisions: decisions.map((decision) =>
            toAcademicDecisionResponse(decision, { includeHistory: false })
        ),
        pagination: {
            page: filters.page,
            limit: filters.limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / filters.limit),
        },
    };
}

async function listAcademicDecisionReviewQueue({
    institutionId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    await resolveReviewAuthority({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });
    const filters = validateListQuery(query);
    const decisionQuery = {
        institutionId: normalizedInstitutionId,
        decisionType: filters.decisionType || DECISION_TYPE_ENROLLMENT_DROP,
        status: filters.status || "recommended",
    };
    if (filters.studentMemberId) {
        decisionQuery.studentMemberId = filters.studentMemberId;
    }
    if (filters.sectionId) {
        decisionQuery.sectionId = filters.sectionId;
    }
    if (filters.recommendedByUserId) {
        decisionQuery.recommendedByUserId = filters.recommendedByUserId;
    }

    const [total, decisions] = await Promise.all([
        AcademicDecision.countDocuments(decisionQuery),
        AcademicDecision.find(decisionQuery)
            .select("-history")
            .sort({ createdAt: -1, _id: -1 })
            .skip((filters.page - 1) * filters.limit)
            .limit(filters.limit)
            .lean(),
    ]);

    return {
        academicDecisions: decisions.map((decision) =>
            toAcademicDecisionResponse(decision, { includeHistory: false })
        ),
        pagination: {
            page: filters.page,
            limit: filters.limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / filters.limit),
        },
    };
}

async function getAcademicDecisionById({
    institutionId,
    decisionId,
    actorUserId,
    actorMembership,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedDecisionId = validateObjectId(decisionId, "decisionId");

    let reviewAuthority = null;
    try {
        reviewAuthority = await resolveReviewAuthority({
            institutionId: normalizedInstitutionId,
            actorUserId,
            actorMembership,
        });
    } catch (error) {
        if (error.statusCode !== 403 || error.message !== "Permission denied") {
            throw error;
        }
    }

    const decision = await AcademicDecision.findOne({
        _id: normalizedDecisionId,
        institutionId: normalizedInstitutionId,
    })
        .select(REVIEW_SELECT_FIELDS)
        .lean();

    if (!decision) {
        throw createError(404, "Academic decision not found");
    }

    if (reviewAuthority) {
        try {
            await markReviewerNotificationRead({
                institutionId: normalizedInstitutionId,
                decisionId: normalizedDecisionId,
                actorUserId,
            });
        } catch (error) {
            console.error("Failed to mark academic decision review notification read", {
                academicDecisionId: normalizedDecisionId,
                institutionId: normalizedInstitutionId,
                error: error.message,
            });
        }

        return {
            academicDecision: toAcademicDecisionResponse(decision),
        };
    }

    const { scope } = await resolveHeadDecisionScope({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
        permission: "academicDecision.read_scope",
    });
    const authorizedSectionIds = uniqueIds(scope.sectionIds || []);
    if (!scope.institutionWide && !authorizedSectionIds.includes(normalizeId(decision.sectionId))) {
        throw createError(403, "Academic decision is outside scope");
    }

    return {
        academicDecision: toAcademicDecisionResponse(decision),
    };
}

async function approveAcademicDecision({
    institutionId,
    decisionId,
    actorUserId,
    actorMembership,
    payload = {},
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedDecisionId = validateObjectId(decisionId, "decisionId");
    const input = validateApprovePayload(payload);
    const { institution } = await resolveReviewAuthority({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });

    const existingDecision = await AcademicDecision.findOne({
        _id: normalizedDecisionId,
        institutionId: normalizedInstitutionId,
    })
        .select(REVIEW_SELECT_FIELDS)
        .lean();
    assertReviewableDecision({ decision: existingDecision, actorUserId });

    const now = new Date();
    const { reviewSnapshot } = await validateCurrentApprovalContext({
        institution,
        institutionId: normalizedInstitutionId,
        decision: existingDecision,
        reviewedAt: now,
    });

    const decision = await AcademicDecision.findOneAndUpdate(
        {
            _id: normalizedDecisionId,
            institutionId: normalizedInstitutionId,
            decisionType: DECISION_TYPE_ENROLLMENT_DROP,
            status: "recommended",
            isOpen: true,
        },
        {
            $set: {
                status: "approved",
                isOpen: true,
                approvedByUserId: actorUserId,
                approvedAt: now,
                reviewSnapshot,
            },
            $push: {
                history: {
                    action: "approved",
                    fromStatus: "recommended",
                    toStatus: "approved",
                    actorUserId,
                    at: now,
                    note: input.note,
                },
            },
        },
        { returnDocument: "after", runValidators: true }
    )
        .select(REVIEW_SELECT_FIELDS)
        .lean();

    if (!decision) {
        throw createError(409, "Academic decision could not be approved");
    }

    try {
        await notifyDecisionRecommender({
            institutionId: normalizedInstitutionId,
            decision,
            actorUserId,
            notificationType: "academic_decision_approved",
            title: "Enrollment drop recommendation approved",
            message: "Your enrollment drop recommendation was approved and is awaiting application.",
        });
    } catch (error) {
        console.error("Failed to create academic decision approval notification", {
            academicDecisionId: normalizeId(decision._id),
            institutionId: normalizedInstitutionId,
            error: error.message,
        });
    }

    try {
        await markReviewerNotificationRead({
            institutionId: normalizedInstitutionId,
            decisionId: normalizedDecisionId,
            actorUserId,
        });
    } catch (error) {
        console.error("Failed to mark academic decision review notification read", {
            academicDecisionId: normalizedDecisionId,
            institutionId: normalizedInstitutionId,
            error: error.message,
        });
    }

    try {
        await resolveReviewRequiredNotifications({
            institutionId: normalizedInstitutionId,
            decisionId: normalizedDecisionId,
        });
    } catch (error) {
        console.error("Failed to resolve academic decision review notifications", {
            academicDecisionId: normalizedDecisionId,
            institutionId: normalizedInstitutionId,
            error: error.message,
        });
    }

    return {
        academicDecision: toAcademicDecisionResponse(decision),
    };
}

async function rejectAcademicDecision({
    institutionId,
    decisionId,
    actorUserId,
    actorMembership,
    payload = {},
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedDecisionId = validateObjectId(decisionId, "decisionId");
    const input = validateRejectPayload(payload);
    await resolveReviewAuthority({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
    });

    const existingDecision = await AcademicDecision.findOne({
        _id: normalizedDecisionId,
        institutionId: normalizedInstitutionId,
    })
        .select(REVIEW_SELECT_FIELDS)
        .lean();
    assertReviewableDecision({ decision: existingDecision, actorUserId });

    const now = new Date();
    const decision = await AcademicDecision.findOneAndUpdate(
        {
            _id: normalizedDecisionId,
            institutionId: normalizedInstitutionId,
            decisionType: DECISION_TYPE_ENROLLMENT_DROP,
            status: "recommended",
            isOpen: true,
        },
        {
            $set: {
                status: "rejected",
                isOpen: false,
                rejectedByUserId: actorUserId,
                rejectedAt: now,
            },
            $push: {
                history: {
                    action: "rejected",
                    fromStatus: "recommended",
                    toStatus: "rejected",
                    actorUserId,
                    at: now,
                    note: input.reason,
                },
            },
        },
        { returnDocument: "after", runValidators: true }
    )
        .select(REVIEW_SELECT_FIELDS)
        .lean();

    if (!decision) {
        throw createError(409, "Academic decision could not be rejected");
    }

    try {
        await notifyDecisionRecommender({
            institutionId: normalizedInstitutionId,
            decision,
            actorUserId,
            notificationType: "academic_decision_rejected",
            title: "Enrollment drop recommendation rejected",
            message: "Your enrollment drop recommendation was rejected.",
        });
    } catch (error) {
        console.error("Failed to create academic decision rejection notification", {
            academicDecisionId: normalizeId(decision._id),
            institutionId: normalizedInstitutionId,
            error: error.message,
        });
    }

    try {
        await markReviewerNotificationRead({
            institutionId: normalizedInstitutionId,
            decisionId: normalizedDecisionId,
            actorUserId,
        });
    } catch (error) {
        console.error("Failed to mark academic decision review notification read", {
            academicDecisionId: normalizedDecisionId,
            institutionId: normalizedInstitutionId,
            error: error.message,
        });
    }

    try {
        await resolveReviewRequiredNotifications({
            institutionId: normalizedInstitutionId,
            decisionId: normalizedDecisionId,
        });
    } catch (error) {
        console.error("Failed to resolve academic decision review notifications", {
            academicDecisionId: normalizedDecisionId,
            institutionId: normalizedInstitutionId,
            error: error.message,
        });
    }

    return {
        academicDecision: toAcademicDecisionResponse(decision),
    };
}

async function applyAcademicDecision({
    institutionId,
    decisionId,
    actorUserId,
    actorMembership,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedDecisionId = validateObjectId(decisionId, "decisionId");
    await resolveReviewAuthority({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
        permission: "academicDecision.apply",
    });

    const existingDecision = await AcademicDecision.findOne({
        _id: normalizedDecisionId,
        institutionId: normalizedInstitutionId,
    })
        .select(REVIEW_SELECT_FIELDS)
        .lean();
    assertApplicableDecision(existingDecision);

    if (existingDecision.status === "applied") {
        const enrollment = await loadApplicationEnrollment({
            institutionId: normalizedInstitutionId,
            decision: existingDecision,
        });
        if (
            !enrollment ||
            enrollment.status !== "dropped" ||
            !enrollmentWasDroppedByDecision(enrollment, normalizedDecisionId)
        ) {
            throw createError(409, "Applied decision enrollment requires manual recovery");
        }

        return {
            academicDecision: toAppliedDecisionResponse(existingDecision),
            enrollment: toCompactEnrollmentResponse(enrollment),
        };
    }

    let claimedDecision = null;
    let currentContext = null;

    if (existingDecision.status === "applying") {
        const enrollment = await loadApplicationEnrollment({
            institutionId: normalizedInstitutionId,
            decision: existingDecision,
        });

        if (!existingDecision.applyingAt) {
            throw createError(409, "Academic decision application requires manual recovery");
        }

        if (!enrollment) {
            throw createError(409, "Academic decision application requires manual recovery");
        }

        if (enrollment.status === "dropped") {
            if (!enrollmentWasDroppedByDecision(enrollment, normalizedDecisionId)) {
                throw createError(409, "Academic decision application requires manual recovery");
            }

            const studentMembership = await Membership.findOne({
                _id: existingDecision.studentMemberId,
                institutionId: normalizedInstitutionId,
                role: "student",
                status: ACTIVE_MEMBERSHIP_STATUS,
            })
                .select("_id institutionId userId role status")
                .lean();
            if (!studentMembership) {
                throw createError(409, "Student membership is no longer active");
            }

            return finalizeAppliedDecision({
                institutionId: normalizedInstitutionId,
                decisionId: normalizedDecisionId,
                actorUserId,
                studentMembership,
                enrollment,
            });
        }

        if (enrollment.status !== ACTIVE_ENROLLMENT_STATUS) {
            throw createError(409, "Academic decision application requires manual recovery");
        }

        const claimIsStale = isApplyingClaimStale(existingDecision);
        if (claimIsStale !== true) {
            throw createError(409, "Academic decision application is already in progress");
        }

        const newApplyingAt = new Date();
        claimedDecision = await AcademicDecision.findOneAndUpdate(
            {
                _id: normalizedDecisionId,
                institutionId: normalizedInstitutionId,
                decisionType: DECISION_TYPE_ENROLLMENT_DROP,
                status: "applying",
                isOpen: true,
                applyingAt: existingDecision.applyingAt,
            },
            {
                $set: {
                    applyingByUserId: actorUserId,
                    applyingAt: newApplyingAt,
                },
            },
            { returnDocument: "after", runValidators: true }
        )
            .select(REVIEW_SELECT_FIELDS)
            .lean();

        if (!claimedDecision) {
            throw createError(409, "Academic decision application is already in progress");
        }

        currentContext = await validateCurrentApplyContext({
            institutionId: normalizedInstitutionId,
            decision: claimedDecision,
        });
    } else {
        currentContext = await validateCurrentApplyContext({
            institutionId: normalizedInstitutionId,
            decision: existingDecision,
        });

        const applyingAt = new Date();
        claimedDecision = await AcademicDecision.findOneAndUpdate(
            {
                _id: normalizedDecisionId,
                institutionId: normalizedInstitutionId,
                decisionType: DECISION_TYPE_ENROLLMENT_DROP,
                status: "approved",
                isOpen: true,
            },
            {
                $set: {
                    status: "applying",
                    isOpen: true,
                    applyingByUserId: actorUserId,
                    applyingAt,
                },
                $push: {
                    history: {
                        action: "applying",
                        fromStatus: "approved",
                        toStatus: "applying",
                        actorUserId,
                        at: applyingAt,
                        note: null,
                    },
                },
            },
            { returnDocument: "after", runValidators: true }
        )
            .select(REVIEW_SELECT_FIELDS)
            .lean();

        if (!claimedDecision) {
            throw createError(409, "Academic decision could not be claimed for application");
        }
    }

    let droppedEnrollment;
    try {
        const enrollmentResult = await enrollmentService.dropEnrollmentForAcademicDecision({
            institutionId: normalizedInstitutionId,
            enrollmentId: claimedDecision.enrollmentId,
            studentMemberId: claimedDecision.studentMemberId,
            sectionId: claimedDecision.sectionId,
            academicDecisionId: claimedDecision._id,
            actorUserId,
        });
        droppedEnrollment = enrollmentResult.enrollment;
    } catch (error) {
        const enrollmentAfterError = await loadApplicationEnrollment({
            institutionId: normalizedInstitutionId,
            decision: claimedDecision,
        });

        if (enrollmentAfterError?.status === ACTIVE_ENROLLMENT_STATUS) {
            try {
                await revertApplicationClaimIfEnrollmentStillEnrolled({
                    institutionId: normalizedInstitutionId,
                    decision: claimedDecision,
                    applyingAt: claimedDecision.applyingAt,
                });
            } catch (revertError) {
                console.error("Failed to revert academic decision application claim", {
                    academicDecisionId: normalizedDecisionId,
                    institutionId: normalizedInstitutionId,
                    error: revertError.message,
                });
            }

            throw error;
        }

        if (enrollmentAfterError?.status === "dropped") {
            if (!enrollmentWasDroppedByDecision(enrollmentAfterError, normalizedDecisionId)) {
                throw createError(409, "Academic decision application requires manual recovery");
            }

            return finalizeAppliedDecision({
                institutionId: normalizedInstitutionId,
                decisionId: normalizedDecisionId,
                actorUserId,
                studentMembership: currentContext.studentMembership,
                enrollment: enrollmentAfterError,
            });
        }

        throw createError(409, "Academic decision application requires manual recovery");
    }

    return finalizeAppliedDecision({
        institutionId: normalizedInstitutionId,
        decisionId: normalizedDecisionId,
        actorUserId,
        studentMembership: currentContext.studentMembership,
        enrollment: droppedEnrollment,
    });
}

async function cancelAcademicDecision({
    institutionId,
    decisionId,
    actorUserId,
    actorMembership,
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const normalizedDecisionId = validateObjectId(decisionId, "decisionId");
    const { scope, institution } = await resolveHeadDecisionScope({
        institutionId: normalizedInstitutionId,
        actorUserId,
        actorMembership,
        permission: "academicDecision.recommend_scope",
    });
    const existingDecision = await AcademicDecision.findOne({
        _id: normalizedDecisionId,
        institutionId: normalizedInstitutionId,
    })
        .select("_id institutionId studentMemberId enrollmentId sectionId decisionType status isOpen recommendedByUserId")
        .lean();

    if (!existingDecision) {
        throw createError(404, "Academic decision not found");
    }

    const authorizedSectionIds = uniqueIds(scope.sectionIds || []);
    if (!scope.institutionWide && !authorizedSectionIds.includes(normalizeId(existingDecision.sectionId))) {
        throw createError(403, "Academic decision is outside scope");
    }

    if (existingDecision.status !== "recommended") {
        throw createError(409, "Only recommended academic decisions can be cancelled");
    }

    if (normalizeId(existingDecision.recommendedByUserId) !== normalizeId(actorUserId)) {
        throw createError(403, "Only the recommending Head can cancel this decision");
    }

    const now = new Date();
    const decision = await AcademicDecision.findOneAndUpdate(
        {
            _id: normalizedDecisionId,
            institutionId: normalizedInstitutionId,
            decisionType: DECISION_TYPE_ENROLLMENT_DROP,
            status: "recommended",
            isOpen: true,
            recommendedByUserId: actorUserId,
        },
        {
            $set: {
                status: "cancelled",
                isOpen: false,
                cancelledByUserId: actorUserId,
                cancelledAt: now,
            },
            $push: {
                history: {
                    action: "cancelled",
                    fromStatus: "recommended",
                    toStatus: "cancelled",
                    actorUserId,
                    at: now,
                    note: null,
                },
            },
        },
        { returnDocument: "after", runValidators: true }
    )
        .select(REVIEW_SELECT_FIELDS)
        .lean();

    if (!decision) {
        throw createError(409, "Academic decision could not be cancelled");
    }

    try {
        await createReviewNotificationsForDecision({
            institutionId: normalizedInstitutionId,
            institution,
            decision,
            actorUserId,
            notificationType: "academic_decision_cancelled",
            title: "Enrollment drop recommendation was cancelled",
            message: "A Head cancelled an enrollment drop recommendation.",
        });
    } catch (error) {
        console.error("Failed to create academic decision cancellation notifications", {
            academicDecisionId: normalizeId(decision._id),
            institutionId: normalizedInstitutionId,
            error: error.message,
        });
    }

    try {
        await resolveReviewRequiredNotifications({
            institutionId: normalizedInstitutionId,
            decisionId: normalizedDecisionId,
        });
    } catch (error) {
        console.error("Failed to resolve academic decision review notifications", {
            academicDecisionId: normalizedDecisionId,
            institutionId: normalizedInstitutionId,
            error: error.message,
        });
    }

    return {
        academicDecision: toAcademicDecisionResponse(decision),
    };
}

module.exports = {
    recommendEnrollmentDrop,
    listAcademicDecisions,
    listAcademicDecisionReviewQueue,
    getAcademicDecisionById,
    approveAcademicDecision,
    rejectAcademicDecision,
    applyAcademicDecision,
    cancelAcademicDecision,
    createReviewNotificationsForDecision,
    toAcademicDecisionResponse,
};
