const mongoose = require("mongoose");
const Enrollment = require("../models/Enrollment");
const Institution = require("../models/Institution");
const Membership = require("../models/Membership");
const MemberProfile = require("../models/MemberProfile");
const User = require("../models/User");
const Section = require("../models/Section");
const ClassStudentAssignment = require("../models/ClassStudentAssignment");
const Subject = require("../models/Subject");
const Semester = require("../models/Semester");
const {
    resolveAcademicPolicyForSemester,
} = require("./universityAcademicPolicyService");
const { listStudentAcademicOutcomes } = require("./universityAcademicOutcomeService");
const { recordAuditLog } = require("./auditService");
const {
    SELF_ENROLLMENT_REASON_MESSAGES,
    resolveSelfEnrollmentSubmissionEligibility,
    resolveSelfEnrollmentEligibility,
    toSelfEnrollmentEligibilitySummary,
} = require("./universitySelfEnrollmentEligibilityService");

const ENROLLMENT_STATUSES = ["enrolled", "dropped"];
const ENROLLABLE_SECTION_STATUSES = ["draft", "active"];
const STUDENT_MEMBER_ROLES = ["student"];
const ENROLLMENT_SELECT_FIELDS =
    "_id sectionId studentMemberId status enrolledAt droppedAt droppedByUserId droppedByAcademicDecisionId createdByUserId createdAt updatedAt";

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeString(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function normalizeLowerString(value) {
    return normalizeString(value).toLowerCase();
}

function normalizeId(value) {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || null;
    }

    if (typeof value.toString === "function") {
        const asString = value.toString().trim();
        return asString || null;
    }

    return null;
}

function isValidObjectId(value) {
    return Boolean(normalizeId(value)) && mongoose.Types.ObjectId.isValid(value);
}

function isDuplicateKeyError(error) {
    return Boolean(error) && error.name === "MongoServerError" && error.code === 11000;
}

function validateEnrollmentStatus(rawValue, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : "enrolled";
    }

    const status = normalizeLowerString(rawValue);
    if (!ENROLLMENT_STATUSES.includes(status)) {
        throw createError(400, "status must be enrolled or dropped");
    }

    return status;
}

function validateCreateEnrollmentInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (!payload.studentMemberId || !isValidObjectId(payload.studentMemberId)) {
        throw createError(400, "Invalid studentMemberId");
    }

    return {
        studentMemberId: payload.studentMemberId,
    };
}

function validateSelfEnrollmentSubmissionInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (!Array.isArray(payload.sectionIds) || payload.sectionIds.length === 0) {
        throw createError(400, "sectionIds must be a non-empty array");
    }

    const sectionIds = [];
    const seenSectionIds = new Set();
    for (let index = 0; index < payload.sectionIds.length; index += 1) {
        const sectionId = normalizeId(payload.sectionIds[index]);
        if (!sectionId || !isValidObjectId(sectionId)) {
            throw createError(400, `sectionIds[${index}] is invalid`);
        }

        if (seenSectionIds.has(sectionId)) {
            continue;
        }

        seenSectionIds.add(sectionId);
        sectionIds.push(sectionId);
    }

    return {
        sectionIds,
    };
}

function validateUpdateEnrollmentStatusInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (payload.status === undefined) {
        throw createError(400, "status is required");
    }

    return {
        status: validateEnrollmentStatus(payload.status),
    };
}

function parseOptionalBooleanQuery(rawValue, fieldName) {
    if (rawValue === undefined) {
        return false;
    }

    const normalizedValue = normalizeLowerString(rawValue);
    if (!normalizedValue) {
        return false;
    }

    if (normalizedValue === "true") {
        return true;
    }

    if (normalizedValue === "false") {
        return false;
    }

    throw createError(400, `${fieldName} must be true or false`);
}

function validateSelfEnrollmentBrowseQuery(query = {}) {
    return {
        availableOnly: parseOptionalBooleanQuery(query.availableOnly, "availableOnly"),
    };
}

function toEnrollmentResponse(enrollment) {
    return {
        id: enrollment._id.toString(),
        sectionId: enrollment.sectionId.toString(),
        studentMemberId: enrollment.studentMemberId.toString(),
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
        createdAt: enrollment.createdAt,
        updatedAt: enrollment.updatedAt,
    };
}

function toEnrollmentListItem(enrollment) {
    return {
        id: enrollment._id.toString(),
        sectionId: enrollment.sectionId.toString(),
        studentMemberId: enrollment.studentMemberId.toString(),
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
        updatedAt: enrollment.updatedAt,
    };
}

function ensureSectionAllowsEnrollment(section) {
    if (!ENROLLABLE_SECTION_STATUSES.includes(section.status)) {
        throw createError(409, "Only draft or active sections can accept enrollments");
    }
}

async function loadInstitutionRecord(institutionId) {
    return Institution.findOne({ _id: institutionId }).select("_id type").lean();
}

async function loadSectionRecord({ institutionId, sectionId }) {
    return Section.findOne({
        _id: sectionId,
        institutionId,
    })
        .select("_id institutionId semesterId subjectId schoolClassId status capacity")
        .lean();
}

async function loadSectionRecordsByIds({ institutionId, sectionIds = [] }) {
    const sections = await Section.find({
        institutionId,
        _id: { $in: sectionIds },
    })
        .select("_id institutionId semesterId subjectId schoolClassId code title capacity schedule status")
        .lean();

    if (sections.length !== sectionIds.length) {
        throw createError(404, "One or more sections were not found");
    }

    const sectionById = new Map(sections.map((section) => [section._id.toString(), section]));
    return sectionIds.map((sectionId) => sectionById.get(sectionId)).filter(Boolean);
}

async function loadActiveSemesterRecord({ institutionId }) {
    return Semester.findOne({
        institutionId,
        status: "active",
    })
        .select("_id institutionId name startDate endDate status")
        .sort({ startDate: -1, createdAt: -1 })
        .lean();
}

async function loadSubjectRecord({ institutionId, subjectId }) {
    return Subject.findOne({
        _id: subjectId,
        institutionId,
    })
        .select("_id institutionId code name creditHours prerequisiteSubjectIds status")
        .lean();
}

async function ensureStudentMemberCanBeEnrolled({ institutionId, studentMemberId }) {
    const membership = await Membership.findOne({
        _id: studentMemberId,
        institutionId,
    })
        .select("_id role status")
        .lean();

    if (!membership) {
        throw createError(404, "Student member not found");
    }

    if (membership.status !== "active") {
        throw createError(400, "Student member must be active");
    }

    if (!STUDENT_MEMBER_ROLES.includes(membership.role)) {
        throw createError(400, "Student member must have student role");
    }

    return membership;
}

async function countEnrolledSectionSeats({ institutionId, sectionId, excludedEnrollmentId = null }) {
    const enrollmentQuery = {
        institutionId,
        sectionId,
        status: "enrolled",
    };

    if (excludedEnrollmentId) {
        enrollmentQuery._id = { $ne: excludedEnrollmentId };
    }

    return Enrollment.countDocuments(enrollmentQuery);
}

async function ensureSectionHasCapacity({ institutionId, sectionId, capacity, excludedEnrollmentId = null }) {
    if (!Number.isInteger(capacity) || capacity < 1) {
        return;
    }

    const enrolledCount = await countEnrolledSectionSeats({
        institutionId,
        sectionId,
        excludedEnrollmentId,
    });
    if (enrolledCount >= capacity) {
        throw createError(409, "Section capacity is full");
    }
}

function mapDuplicateEnrollmentError(error) {
    if (!isDuplicateKeyError(error)) {
        return null;
    }

    if (
        error.keyPattern &&
        error.keyPattern.institutionId &&
        error.keyPattern.sectionId &&
        error.keyPattern.studentMemberId
    ) {
        return createError(409, "Enrollment already exists for this student in this section");
    }

    return createError(409, "Enrollment already exists");
}

function ensureActiveStudentSelfEnrollmentActor({ actorMembership, actionDescription }) {
    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (actorMembership.role !== "student") {
        throw createError(403, `Only students can ${actionDescription}`);
    }

    if (actorMembership.status !== undefined && actorMembership.status !== "active") {
        throw createError(403, `Only active students can ${actionDescription}`);
    }
}

function createSelfEnrollmentWriteConflict(code, blockingReasonCodes = null) {
    const error = createError(
        409,
        SELF_ENROLLMENT_REASON_MESSAGES[code] || "Student is not eligible for self-enrollment."
    );
    error.reasonCode = code;

    if (Array.isArray(blockingReasonCodes) && blockingReasonCodes.length) {
        error.blockingReasonCodes = [...blockingReasonCodes];
    }

    return error;
}

function createSelfEnrollmentBlockedError(decision) {
    const blockingReasonCodes = Array.isArray(decision?.blockingReasonCodes)
        ? decision.blockingReasonCodes
        : [];
    const firstBlockingReasonCode = blockingReasonCodes[0] || null;

    return createSelfEnrollmentWriteConflict(
        firstBlockingReasonCode,
        blockingReasonCodes
    );
}

function mapSelfEnrollmentWriteDriftError(error) {
    if (!error || error.statusCode !== 409) {
        return null;
    }

    if (error.message === "Section capacity is full") {
        return createSelfEnrollmentWriteConflict("section_full", ["section_full"]);
    }

    if (error.message === "Student is already enrolled in this section") {
        return createSelfEnrollmentWriteConflict(
            "already_enrolled_in_section",
            ["already_enrolled_in_section"]
        );
    }

    if (
        error.message === "Enrollment already exists for this student in this section" ||
        error.message ===
            "Enrollment already exists for this student in this section. Use status update to re-enroll"
    ) {
        return createSelfEnrollmentWriteConflict(
            "existing_section_enrollment_record",
            ["existing_section_enrollment_record"]
        );
    }

    return null;
}

async function syncSchoolSectionEnrollmentsForAssignment({
    institutionId,
    semesterId,
    schoolClassId,
    studentMemberId,
    nextStatus,
    createdByUserId,
}) {
    const matchingSections = await Section.find({
        institutionId,
        semesterId,
        schoolClassId,
        status: { $in: ENROLLABLE_SECTION_STATUSES },
    })
        .select("_id capacity")
        .lean();

    if (!matchingSections.length) {
        return;
    }

    const sectionIds = matchingSections.map((section) => section._id);

    if (nextStatus === "removed") {
        await Enrollment.updateMany(
            {
                institutionId,
                sectionId: { $in: sectionIds },
                studentMemberId,
                status: "enrolled",
            },
            { $set: { status: "dropped" } }
        );
        return;
    }

    const existingEnrollments = await Enrollment.find({
        institutionId,
        sectionId: { $in: sectionIds },
        studentMemberId,
    })
        .select("_id sectionId status")
        .lean();

    const existingEnrollmentBySectionId = new Map(
        existingEnrollments.map((enrollment) => [enrollment.sectionId.toString(), enrollment])
    );

    const operations = [];
    for (const section of matchingSections) {
        const existingEnrollment = existingEnrollmentBySectionId.get(section._id.toString()) || null;
        if (existingEnrollment?.status === "enrolled") {
            continue;
        }

        try {
            await ensureSectionHasCapacity({
                institutionId,
                sectionId: section._id,
                capacity: section.capacity,
                excludedEnrollmentId: existingEnrollment?._id || null,
            });
        } catch (error) {
            if (error?.statusCode === 409 && error.message === "Section capacity is full") {
                continue;
            }

            throw error;
        }

        operations.push({
            updateOne: {
                filter: {
                    institutionId,
                    sectionId: section._id,
                    studentMemberId,
                },
                update: {
                    $set: {
                        status: "enrolled",
                    },
                    $setOnInsert: {
                        institutionId,
                        sectionId: section._id,
                        studentMemberId,
                        enrolledAt: new Date(),
                        createdByUserId,
                    },
                },
                upsert: true,
            },
        });
    }

    if (operations.length) {
        await Enrollment.bulkWrite(operations, { ordered: true });
    }
}

async function backfillSchoolSectionEnrollments({ institutionId, section, createdByUserId }) {
    if (!section?.schoolClassId || !ENROLLABLE_SECTION_STATUSES.includes(section.status)) {
        return;
    }

    const assignments = await ClassStudentAssignment.find({
        institutionId,
        classId: section.schoolClassId,
        semesterId: section.semesterId,
        status: "assigned",
    })
        .select("studentMemberId createdAt")
        .sort({ createdAt: 1, _id: 1 })
        .lean();

    if (!assignments.length) {
        return;
    }

    const studentMemberIds = assignments.map((assignment) => assignment.studentMemberId);
    const existingEnrollments = await Enrollment.find({
        institutionId,
        sectionId: section._id,
        studentMemberId: { $in: studentMemberIds },
    })
        .select("_id studentMemberId status")
        .lean();

    const existingEnrollmentByStudentMemberId = new Map(
        existingEnrollments.map((enrollment) => [enrollment.studentMemberId.toString(), enrollment])
    );

    let remainingSeats = null;
    if (Number.isInteger(section.capacity) && section.capacity >= 1) {
        const enrolledCount = await countEnrolledSectionSeats({
            institutionId,
            sectionId: section._id,
        });
        remainingSeats = Math.max(section.capacity - enrolledCount, 0);
    }

    const operations = [];
    for (const assignment of assignments) {
        const existingEnrollment =
            existingEnrollmentByStudentMemberId.get(assignment.studentMemberId.toString()) || null;

        if (existingEnrollment?.status === "enrolled") {
            continue;
        }

        if (remainingSeats !== null) {
            if (remainingSeats < 1) {
                break;
            }

            remainingSeats -= 1;
        }

        operations.push({
            updateOne: {
                filter: {
                    institutionId,
                    sectionId: section._id,
                    studentMemberId: assignment.studentMemberId,
                },
                update: {
                    $set: {
                        status: "enrolled",
                    },
                    $setOnInsert: {
                        institutionId,
                        sectionId: section._id,
                        studentMemberId: assignment.studentMemberId,
                        enrolledAt: new Date(),
                        createdByUserId,
                    },
                },
                upsert: true,
            },
        });
    }

    if (operations.length) {
        await Enrollment.bulkWrite(operations, { ordered: true });
    }
}

async function createEnrollment({ institutionId, sectionId, createdByUserId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!createdByUserId || !isValidObjectId(createdByUserId)) {
        throw createError(401, "Unauthorized");
    }

    const input = validateCreateEnrollmentInput(payload);

    const [institution, section] = await Promise.all([
        loadInstitutionRecord(institutionId),
        loadSectionRecord({ institutionId, sectionId }),
    ]);

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (!section) {
        throw createError(404, "Section not found");
    }

    if (institution.type === "school") {
        throw createError(409, "School section enrollments are managed through class roster");
    }

    ensureSectionAllowsEnrollment(section);
    await ensureStudentMemberCanBeEnrolled({
        institutionId,
        studentMemberId: input.studentMemberId,
    });

    const existingEnrollment = await Enrollment.findOne({
        institutionId,
        sectionId,
        studentMemberId: input.studentMemberId,
    })
        .select("_id status")
        .lean();

    if (existingEnrollment) {
        if (existingEnrollment.status === "enrolled") {
            throw createError(409, "Student is already enrolled in this section");
        }

        throw createError(
            409,
            "Enrollment already exists for this student in this section. Use status update to re-enroll"
        );
    }

    await ensureSectionHasCapacity({
        institutionId,
        sectionId,
        capacity: section.capacity,
    });

    let enrollment;
    try {
        enrollment = await Enrollment.create({
            institutionId,
            sectionId,
            studentMemberId: input.studentMemberId,
            status: "enrolled",
            createdByUserId,
        });
    } catch (error) {
        const mappedDuplicateError = mapDuplicateEnrollmentError(error);
        if (mappedDuplicateError) {
            throw mappedDuplicateError;
        }

        throw error;
    }

    return {
        enrollment: toEnrollmentResponse(enrollment),
    };
}

async function listEnrollments({ institutionId, sectionId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    const section = await loadSectionRecord({ institutionId, sectionId });
    if (!section) {
        throw createError(404, "Section not found");
    }

    const enrollments = await Enrollment.find({
        institutionId,
        sectionId,
    })
        .select(ENROLLMENT_SELECT_FIELDS)
        .sort({ enrolledAt: -1, createdAt: -1, _id: -1 })
        .lean();

    // Enrich each row with a { fullName, email } student summary so roster views
    // don't have to resolve studentMemberId -> member separately (mirrors the
    // attendance roster / assessment result shapes).
    const studentMemberIds = [...new Set(enrollments.map((e) => e.studentMemberId?.toString()).filter(Boolean))];
    const studentSummaryById = await buildEnrollmentStudentSummaries({ institutionId, studentMemberIds });

    return {
        enrollments: enrollments.map((enrollment) => ({
            ...toEnrollmentListItem(enrollment),
            student: studentSummaryById.get(enrollment.studentMemberId?.toString()) || { fullName: null, email: null },
        })),
    };
}

// Resolve Membership._id -> { fullName, email } for a set of student members.
async function buildEnrollmentStudentSummaries({ institutionId, studentMemberIds }) {
    const summaryById = new Map();
    if (!studentMemberIds.length) {
        return summaryById;
    }

    const [memberships, profiles] = await Promise.all([
        Membership.find({ _id: { $in: studentMemberIds }, institutionId }).select("_id userId").lean(),
        MemberProfile.find({ membershipId: { $in: studentMemberIds }, institutionId }).select("membershipId fullName").lean(),
    ]);

    const userIdByMembershipId = new Map(memberships.map((m) => [m._id.toString(), m.userId?.toString() || null]));
    const fullNameByMembershipId = new Map(profiles.map((p) => [p.membershipId.toString(), p.fullName || null]));

    const userIds = [...new Set([...userIdByMembershipId.values()].filter(Boolean))];
    const users = userIds.length
        ? await User.find({ _id: { $in: userIds } }).select("_id email").lean()
        : [];
    const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email || null]));

    for (const membershipId of studentMemberIds) {
        const userId = userIdByMembershipId.get(membershipId);
        summaryById.set(membershipId, {
            fullName: fullNameByMembershipId.get(membershipId) || null,
            email: userId ? emailByUserId.get(userId) || null : null,
        });
    }

    return summaryById;
}

async function getEnrollmentById({ institutionId, sectionId, enrollmentId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!enrollmentId || !isValidObjectId(enrollmentId)) {
        throw createError(400, "Invalid enrollment id");
    }

    const enrollment = await Enrollment.findOne({
        _id: enrollmentId,
        institutionId,
        sectionId,
    })
        .select(ENROLLMENT_SELECT_FIELDS)
        .lean();

    if (!enrollment) {
        throw createError(404, "Enrollment not found");
    }

    return {
        enrollment: toEnrollmentResponse(enrollment),
    };
}

async function updateEnrollmentStatus({ institutionId, sectionId, enrollmentId, payload, actorUserId = null }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!enrollmentId || !isValidObjectId(enrollmentId)) {
        throw createError(400, "Invalid enrollment id");
    }

    const [institution, enrollment] = await Promise.all([
        loadInstitutionRecord(institutionId),
        Enrollment.findOne({
            _id: enrollmentId,
            institutionId,
            sectionId,
        })
            .select("_id sectionId studentMemberId status")
            .lean(),
    ]);

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (!enrollment) {
        throw createError(404, "Enrollment not found");
    }

    if (institution.type === "school") {
        throw createError(409, "School section enrollments are managed through class roster");
    }

    const { status } = validateUpdateEnrollmentStatusInput(payload);

    if (status === "enrolled") {
        const section = await loadSectionRecord({ institutionId, sectionId });
        if (!section) {
            throw createError(404, "Section not found");
        }

        ensureSectionAllowsEnrollment(section);
        await ensureStudentMemberCanBeEnrolled({
            institutionId,
            studentMemberId: enrollment.studentMemberId,
        });
        await ensureSectionHasCapacity({
            institutionId,
            sectionId,
            capacity: section.capacity,
            excludedEnrollmentId: enrollmentId,
        });
    }

    const updates = { status };
    if (status === "enrolled") {
        updates.droppedAt = null;
        updates.droppedByUserId = null;
        updates.droppedByAcademicDecisionId = null;
    }

    const updatedEnrollment = await Enrollment.findOneAndUpdate(
        {
            _id: enrollmentId,
            institutionId,
            sectionId,
        },
        { $set: updates },
        { returnDocument: "after", runValidators: true }
    )
        .select(ENROLLMENT_SELECT_FIELDS)
        .lean();

    if (!updatedEnrollment) {
        throw createError(404, "Enrollment not found");
    }

    // SEC-15: an enrollment status change (drop/re-enroll) is a sensitive
    // academic mutation — audit it.
    if (enrollment.status !== status) {
        await recordAuditLog({
            institutionId,
            actorUserId,
            action: "enrollment.status.changed",
            entityType: "Enrollment",
            entityId: enrollmentId,
            metadata: { from: enrollment.status, to: status, sectionId: String(sectionId) },
        });
    }

    return {
        enrollment: toEnrollmentResponse(updatedEnrollment),
    };
}

async function dropEnrollmentForAcademicDecision({
    institutionId,
    enrollmentId,
    studentMemberId,
    sectionId,
    academicDecisionId,
    actorUserId,
}) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }
    if (!enrollmentId || !isValidObjectId(enrollmentId)) {
        throw createError(400, "Invalid enrollment id");
    }
    if (!studentMemberId || !isValidObjectId(studentMemberId)) {
        throw createError(400, "Invalid studentMemberId");
    }
    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }
    if (!academicDecisionId || !isValidObjectId(academicDecisionId)) {
        throw createError(400, "Invalid academicDecisionId");
    }
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    const droppedAt = new Date();
    const updatedEnrollment = await Enrollment.findOneAndUpdate(
        {
            _id: enrollmentId,
            institutionId,
            studentMemberId,
            sectionId,
            status: "enrolled",
        },
        {
            $set: {
                status: "dropped",
                droppedAt,
                droppedByUserId: actorUserId,
                droppedByAcademicDecisionId: academicDecisionId,
            },
        },
        { returnDocument: "after", runValidators: true }
    )
        .select(ENROLLMENT_SELECT_FIELDS)
        .lean();

    if (!updatedEnrollment) {
        throw createError(409, "Enrollment could not be dropped safely");
    }

    return {
        enrollment: toEnrollmentResponse(updatedEnrollment),
    };
}

async function loadCurrentActiveSemesterEnrollmentLoad({
    institutionId,
    studentMemberId,
    activeSemesterId,
    excludedSectionId = null,
    excludedSectionIds = [],
}) {
    const normalizedExcludedSectionIds = [...new Set(
        [excludedSectionId, ...excludedSectionIds].map((sectionId) => normalizeId(sectionId)).filter(Boolean)
    )];
    const currentEnrollmentQuery = {
        institutionId,
        studentMemberId,
        status: "enrolled",
    };
    if (normalizedExcludedSectionIds.length) {
        currentEnrollmentQuery.sectionId = { $nin: normalizedExcludedSectionIds };
    }

    const currentEnrollments = await Enrollment.find(currentEnrollmentQuery)
        .select("_id sectionId")
        .lean();

    if (!currentEnrollments.length) {
        return {
            currentActiveSemesterSections: [],
            currentActiveSemesterSubjects: [],
        };
    }

    const currentActiveSemesterSections = await Section.find({
        institutionId,
        _id: { $in: currentEnrollments.map((enrollment) => enrollment.sectionId) },
        semesterId: activeSemesterId,
        status: { $in: ENROLLABLE_SECTION_STATUSES },
    })
        .select("_id subjectId code title schedule")
        .lean();

    // Self-enrollment registration load intentionally keeps only unique active-semester
    // subject ids here, and only from sections still in the current enrollable statuses.
    // This is narrower than any future transcript or broader academic-load concept.
    const currentLoadSubjectIds = [...new Set(
        currentActiveSemesterSections
            .map((currentSection) => normalizeId(currentSection.subjectId))
            .filter(Boolean)
    )];
    if (!currentLoadSubjectIds.length) {
        return {
            currentActiveSemesterSections,
            currentActiveSemesterSubjects: [],
        };
    }

    const currentActiveSemesterSubjects = await Subject.find({
        _id: { $in: currentLoadSubjectIds },
        institutionId,
    })
        .select("_id creditHours")
        .lean();

    return {
        currentActiveSemesterSections,
        currentActiveSemesterSubjects,
    };
}

async function loadSelfEnrollmentEligibilityContext({
    institutionId,
    activeSemester,
    section,
    subject,
    studentMembership,
}) {
    const prerequisiteSubjectIds = Array.isArray(subject.prerequisiteSubjectIds)
        ? subject.prerequisiteSubjectIds.map((subjectId) => normalizeId(subjectId)).filter(Boolean)
        : [];

    const [existingSectionEnrollment, currentSectionSeatCount, academicOutcomeSummary, prerequisiteSubjects, activeLoad] =
        await Promise.all([
            Enrollment.findOne({
                institutionId,
                sectionId: section._id,
                studentMemberId: studentMembership._id,
            })
                .select("_id status")
                .lean(),
            countEnrolledSectionSeats({
                institutionId,
                sectionId: section._id,
            }),
            listStudentAcademicOutcomes({
                institutionId,
                studentMemberId: studentMembership._id,
            }),
            prerequisiteSubjectIds.length
                ? Subject.find({
                      _id: { $in: prerequisiteSubjectIds },
                      institutionId,
                  })
                      .select("_id code name")
                      .lean()
                : Promise.resolve([]),
            loadCurrentActiveSemesterEnrollmentLoad({
                institutionId,
                studentMemberId: studentMembership._id,
                activeSemesterId: activeSemester._id,
                excludedSectionId: section._id,
            }),
        ]);

    return {
        studentMembership,
        activeSemester,
        targetSection: section,
        targetSubject: subject,
        existingSectionEnrollment,
        currentSectionSeatCount,
        academicOutcomeSummary,
        prerequisiteSubjects,
        currentActiveSemesterSections: activeLoad.currentActiveSemesterSections,
        currentActiveSemesterSubjects: activeLoad.currentActiveSemesterSubjects,
    };
}

async function resolveSelfEnrollmentTargetDecision({
    institutionId,
    sectionId,
    actorUserId,
    actorMembership,
    actorActionDescription,
    modeLabel,
    enforceMinimumEnrollment = true,
    enforceMaxAllowedCreditHours = true,
}) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!sectionId || !isValidObjectId(sectionId)) {
        throw createError(400, "Invalid section id");
    }

    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    ensureActiveStudentSelfEnrollmentActor({
        actorMembership,
        actionDescription: actorActionDescription,
    });

    const [institution, section] = await Promise.all([
        loadInstitutionRecord(institutionId),
        loadSectionRecord({ institutionId, sectionId }),
    ]);

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (institution.type !== "university") {
        throw createError(409, `Student self-enrollment ${modeLabel} is only supported for university institutions`);
    }

    if (!section) {
        throw createError(404, "Section not found");
    }

    if (section.schoolClassId) {
        throw createError(409, `Student self-enrollment ${modeLabel} is only supported for university sections`);
    }

    const subject = await loadSubjectRecord({
        institutionId,
        subjectId: section.subjectId,
    });
    const [activeSemester, policy] = await Promise.all([
        loadActiveSemesterRecord({ institutionId }),
        resolveAcademicPolicyForSemester({
            institutionId,
            semesterId: section.semesterId,
        }),
    ]);

    const decisionContext = await loadSelfEnrollmentEligibilityContext({
        institutionId,
        activeSemester,
        section,
        subject,
        studentMembership: actorMembership,
    });
    const eligibility = resolveSelfEnrollmentEligibility({
        ...decisionContext,
        policy,
        enforceMinimumEnrollment,
        enforceMaxAllowedCreditHours,
    });

    return {
        eligibility,
    };
}

async function resolveSelfEnrollmentSubmissionDecision({
    institutionId,
    actorUserId,
    actorMembership,
    payload,
}) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    ensureActiveStudentSelfEnrollmentActor({
        actorMembership,
        actionDescription: "finalize self-enrollment submission",
    });

    const input = validateSelfEnrollmentSubmissionInput(payload);
    const [institution, activeSemester] = await Promise.all([
        loadInstitutionRecord(institutionId),
        loadActiveSemesterRecord({ institutionId }),
    ]);

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (institution.type !== "university") {
        throw createError(409, "Student self-enrollment submissions are only supported for university institutions");
    }

    if (!activeSemester) {
        throw createError(404, "Active semester not found");
    }

    const [policy, sections] = await Promise.all([
        resolveAcademicPolicyForSemester({
            institutionId,
            semesterId: activeSemester._id,
        }),
        loadSectionRecordsByIds({
            institutionId,
            sectionIds: input.sectionIds,
        }),
    ]);

    if (sections.some((section) => section.schoolClassId)) {
        throw createError(409, "Student self-enrollment submissions are only supported for university sections");
    }

    const subjectIds = [...new Set(sections.map((section) => normalizeId(section.subjectId)).filter(Boolean))];
    const sectionsById = new Map(sections.map((section) => [section._id.toString(), section]));
    const subjects = subjectIds.length
        ? await Subject.find({
              institutionId,
              _id: { $in: subjectIds },
          })
              .select("_id institutionId code name creditHours prerequisiteSubjectIds status")
              .lean()
        : [];
    const subjectById = new Map(subjects.map((subject) => [subject._id.toString(), subject]));
    const selectedSectionIds = sections.map((section) => section._id);
    const allPrerequisiteSubjectIds = [...new Set(
        subjects.flatMap((subject) =>
            Array.isArray(subject?.prerequisiteSubjectIds)
                ? subject.prerequisiteSubjectIds.map((subjectId) => normalizeId(subjectId)).filter(Boolean)
                : []
        )
    )];

    const [
        existingSectionEnrollments,
        currentSectionSeatCounts,
        academicOutcomeSummary,
        prerequisiteSubjects,
        currentActiveSemesterLoad,
    ] = await Promise.all([
        Enrollment.find({
            institutionId,
            studentMemberId: actorMembership._id,
            sectionId: { $in: selectedSectionIds },
        })
            .select("_id sectionId status")
            .lean(),
        Enrollment.aggregate([
            {
                $match: {
                    institutionId: new mongoose.Types.ObjectId(institutionId),
                    sectionId: { $in: selectedSectionIds },
                    status: "enrolled",
                },
            },
            {
                $group: {
                    _id: "$sectionId",
                    enrolledSeatCount: { $sum: 1 },
                },
            },
        ]),
        listStudentAcademicOutcomes({
            institutionId,
            studentMemberId: actorMembership._id,
        }),
        allPrerequisiteSubjectIds.length
            ? Subject.find({
                  institutionId,
                  _id: { $in: allPrerequisiteSubjectIds },
              })
                  .select("_id code name")
                  .lean()
            : Promise.resolve([]),
        loadCurrentActiveSemesterEnrollmentLoad({
            institutionId,
            studentMemberId: actorMembership._id,
            activeSemesterId: activeSemester._id,
            excludedSectionIds: input.sectionIds,
        }),
    ]);

    const existingSectionEnrollmentBySectionId = new Map(
        existingSectionEnrollments.map((enrollment) => [enrollment.sectionId.toString(), enrollment])
    );
    const currentSectionSeatCountBySectionId = new Map(
        currentSectionSeatCounts.map((seatCount) => [seatCount._id.toString(), Number(seatCount.enrolledSeatCount) || 0])
    );
    const prerequisiteSubjectById = new Map(
        prerequisiteSubjects.map((subject) => [subject._id.toString(), subject])
    );

    const selections = input.sectionIds.map((sectionId) => {
        const section = sectionsById.get(sectionId) || null;
        const subject = subjectById.get(normalizeId(section?.subjectId)) || null;
        const prerequisiteSubjectIds = Array.isArray(subject?.prerequisiteSubjectIds)
            ? subject.prerequisiteSubjectIds.map((subjectId) => normalizeId(subjectId)).filter(Boolean)
            : [];

        return {
            targetSection: section,
            targetSubject: subject,
            existingSectionEnrollment: existingSectionEnrollmentBySectionId.get(sectionId) || null,
            currentSectionSeatCount: currentSectionSeatCountBySectionId.get(sectionId) || 0,
            prerequisiteSubjects: prerequisiteSubjectIds
                .map((prerequisiteSubjectId) => prerequisiteSubjectById.get(prerequisiteSubjectId) || null)
                .filter(Boolean),
        };
    });

    const submissionDecision = resolveSelfEnrollmentSubmissionEligibility({
        studentMembership: actorMembership,
        activeSemester,
        policy,
        academicOutcomeSummary,
        currentActiveSemesterSections: currentActiveSemesterLoad.currentActiveSemesterSections,
        currentActiveSemesterSubjects: currentActiveSemesterLoad.currentActiveSemesterSubjects,
        selections,
    });

    return {
        input,
        submissionDecision,
    };
}

function buildSelfEnrollmentBrowseSubjectSummary(subject) {
    if (!subject) {
        return null;
    }

    return {
        id: subject._id.toString(),
        code: subject.code,
        name: subject.name,
    };
}

function buildSelfEnrollmentBrowseSemesterSummary(activeSemester) {
    if (!activeSemester) {
        return null;
    }

    return {
        id: activeSemester._id.toString(),
        name: activeSemester.name,
        status: activeSemester.status,
        isActive: activeSemester.status === "active",
    };
}

function isSelfEnrollmentBrowseSubjectEligible(subject) {
    return Boolean(subject) && subject.status === "active" && Number.isInteger(subject.creditHours) && subject.creditHours >= 1;
}

function resolveSelfEnrollmentBrowseCandidates({
    institutionId,
    activeSemester,
    sections = [],
    subjectById = new Map(),
}) {
    const normalizedInstitutionId = normalizeId(institutionId);
    const normalizedActiveSemesterId = normalizeId(activeSemester?._id);

    return sections
        .map((section) => {
            const sectionInstitutionId = normalizeId(section?.institutionId);
            const sectionSemesterId = normalizeId(section?.semesterId);
            const subject = subjectById.get(normalizeId(section?.subjectId)) || null;

            if (!section || sectionInstitutionId !== normalizedInstitutionId) {
                return null;
            }

            if (section.schoolClassId || sectionSemesterId !== normalizedActiveSemesterId) {
                return null;
            }

            if (!ENROLLABLE_SECTION_STATUSES.includes(section.status)) {
                return null;
            }

            if (!subject || normalizeId(subject.institutionId) !== normalizedInstitutionId) {
                return null;
            }

            if (!isSelfEnrollmentBrowseSubjectEligible(subject)) {
                return null;
            }

            return {
                section,
                subject,
            };
        })
        .filter(Boolean);
}

function toSelfEnrollmentBrowseSectionListItem({
    section,
    subject,
    activeSemester,
    eligibility,
}) {
    return {
        id: section._id.toString(),
        semesterId: section.semesterId.toString(),
        subjectId: section.subjectId.toString(),
        code: section.code,
        title: section.title || null,
        creditHours: subject.creditHours,
        capacity: section.capacity ?? null,
        remainingSeatCount: eligibility?.capacitySummary?.remainingSeatCount ?? null,
        status: section.status,
        updatedAt: section.updatedAt,
        semester: buildSelfEnrollmentBrowseSemesterSummary(activeSemester),
        subject: buildSelfEnrollmentBrowseSubjectSummary(subject),
        eligibilitySummary: toSelfEnrollmentEligibilitySummary(eligibility),
    };
}

function filterSelfEnrollmentBrowseSectionList({
    sections = [],
    availableOnly = false,
}) {
    if (!availableOnly) {
        return sections;
    }

    return sections.filter((section) => {
        if (!section || typeof section !== "object") {
            return false;
        }

        return section.remainingSeatCount === null || section.remainingSeatCount > 0;
    });
}

async function listMySelfEnrollmentSections({
    institutionId,
    actorUserId,
    actorMembership,
    query = {},
}) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    ensureActiveStudentSelfEnrollmentActor({
        actorMembership,
        actionDescription: "list self-enrollment sections",
    });
    const filters = validateSelfEnrollmentBrowseQuery(query);

    const [institution, activeSemester] = await Promise.all([
        loadInstitutionRecord(institutionId),
        loadActiveSemesterRecord({ institutionId }),
    ]);

    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (institution.type !== "university") {
        throw createError(409, "Student self-enrollment browse is only supported for university institutions");
    }

    if (!activeSemester) {
        throw createError(404, "Active semester not found");
    }

    const policy = await resolveAcademicPolicyForSemester({
        institutionId,
        semesterId: activeSemester._id,
    });

    // TODO/verify: add pagination and optional discovery filters if active-semester
    // self-enrollment section volume becomes large enough to need them.
    const sections = await Section.find({
        institutionId,
        semesterId: activeSemester._id,
        schoolClassId: null,
        status: { $in: ENROLLABLE_SECTION_STATUSES },
    })
        .select("_id institutionId semesterId subjectId schoolClassId code title capacity status createdAt updatedAt")
        .sort({ createdAt: -1, _id: -1 })
        .lean();

    if (!sections.length) {
        return {
            sections: [],
        };
    }

    const subjectIds = [...new Set(sections.map((section) => normalizeId(section.subjectId)).filter(Boolean))];
    const subjects = subjectIds.length
        ? await Subject.find({
              institutionId,
              _id: { $in: subjectIds },
          })
              .select("_id institutionId code name creditHours prerequisiteSubjectIds status")
              .lean()
        : [];
    const subjectById = new Map(subjects.map((subject) => [subject._id.toString(), subject]));
    const candidateSections = resolveSelfEnrollmentBrowseCandidates({
        institutionId,
        activeSemester,
        sections,
        subjectById,
    });

    if (!candidateSections.length) {
        return {
            sections: [],
        };
    }

    const candidateSectionIds = candidateSections.map(({ section }) => section._id);
    const allPrerequisiteSubjectIds = [...new Set(
        candidateSections.flatMap(({ subject }) =>
            Array.isArray(subject.prerequisiteSubjectIds)
                ? subject.prerequisiteSubjectIds.map((subjectId) => normalizeId(subjectId)).filter(Boolean)
                : []
        )
    )];

    const [
        existingSectionEnrollments,
        currentSectionSeatCounts,
        academicOutcomeSummary,
        prerequisiteSubjects,
        currentActiveSemesterLoad,
    ] = await Promise.all([
        Enrollment.find({
            institutionId,
            studentMemberId: actorMembership._id,
            sectionId: { $in: candidateSectionIds },
        })
            .select("_id sectionId status")
            .lean(),
        Enrollment.aggregate([
            {
                $match: {
                    institutionId: new mongoose.Types.ObjectId(institutionId),
                    sectionId: { $in: candidateSectionIds },
                    status: "enrolled",
                },
            },
            {
                $group: {
                    _id: "$sectionId",
                    enrolledSeatCount: { $sum: 1 },
                },
            },
        ]),
        listStudentAcademicOutcomes({
            institutionId,
            studentMemberId: actorMembership._id,
        }),
        allPrerequisiteSubjectIds.length
            ? Subject.find({
                  institutionId,
                  _id: { $in: allPrerequisiteSubjectIds },
              })
                  .select("_id code name")
                  .lean()
            : Promise.resolve([]),
        loadCurrentActiveSemesterEnrollmentLoad({
            institutionId,
            studentMemberId: actorMembership._id,
            activeSemesterId: activeSemester._id,
            excludedSectionId: null,
        }),
    ]);

    const existingSectionEnrollmentBySectionId = new Map(
        existingSectionEnrollments.map((enrollment) => [enrollment.sectionId.toString(), enrollment])
    );
    const currentSectionSeatCountBySectionId = new Map(
        currentSectionSeatCounts.map((seatCount) => [seatCount._id.toString(), Number(seatCount.enrolledSeatCount) || 0])
    );
    const prerequisiteSubjectById = new Map(
        prerequisiteSubjects.map((subject) => [subject._id.toString(), subject])
    );

    const sectionListItems = candidateSections.map(({ section, subject }) => {
            const sectionId = section._id.toString();
            const existingSectionEnrollment = existingSectionEnrollmentBySectionId.get(sectionId) || null;
            const currentActiveSemesterSectionsForDecision = existingSectionEnrollment
                ? currentActiveSemesterLoad.currentActiveSemesterSections.filter(
                      (currentSection) => normalizeId(currentSection._id) !== sectionId
                  )
                : currentActiveSemesterLoad.currentActiveSemesterSections;
            const rowPrerequisiteSubjectIds = Array.isArray(subject.prerequisiteSubjectIds)
                ? subject.prerequisiteSubjectIds.map((subjectId) => normalizeId(subjectId)).filter(Boolean)
                : [];
            const decision = resolveSelfEnrollmentEligibility({
                studentMembership: actorMembership,
                activeSemester,
                targetSection: section,
                targetSubject: subject,
                policy,
                existingSectionEnrollment,
                currentSectionSeatCount: currentSectionSeatCountBySectionId.get(sectionId) || 0,
                academicOutcomeSummary,
                prerequisiteSubjects: rowPrerequisiteSubjectIds
                    .map((subjectId) => prerequisiteSubjectById.get(subjectId) || null)
                    .filter(Boolean),
                currentActiveSemesterSections: currentActiveSemesterSectionsForDecision,
                currentActiveSemesterSubjects: currentActiveSemesterLoad.currentActiveSemesterSubjects,
                enforceMinimumEnrollment: false,
            });

            return toSelfEnrollmentBrowseSectionListItem({
                section,
                subject,
                activeSemester,
                eligibility: decision,
            });
        });

    return {
        sections: filterSelfEnrollmentBrowseSectionList({
            sections: sectionListItems,
            availableOnly: filters.availableOnly,
        }),
    };
}

async function getSelfEnrollmentEligibility({
    institutionId,
    sectionId,
    actorUserId,
    actorMembership,
}) {
    const { eligibility } = await resolveSelfEnrollmentTargetDecision({
        institutionId,
        sectionId,
        actorUserId,
        actorMembership,
        actorActionDescription: "preview self-enrollment eligibility",
        modeLabel: "eligibility",
        enforceMinimumEnrollment: false,
    });

    return {
        eligibility,
    };
}

async function createMySelfEnrollmentSubmission({
    institutionId,
    actorUserId,
    actorMembership,
    payload,
}) {
    const { input, submissionDecision } = await resolveSelfEnrollmentSubmissionDecision({
        institutionId,
        actorUserId,
        actorMembership,
        payload,
    });

    if (!submissionDecision.isEligible) {
        throw createSelfEnrollmentBlockedError(submissionDecision);
    }

    const createdEnrollments = [];

    // TODO/verify: this finalization path prevalidates the whole submission first,
    // then creates enrollments sequentially through the shared create flow.
    // Strict all-or-nothing atomicity and stronger last-seat guarantees would need
    // transaction support plus a stronger seat-reservation/counter strategy.
    for (const sectionId of input.sectionIds) {
        try {
            const result = await createEnrollment({
                institutionId,
                sectionId,
                createdByUserId: actorUserId,
                payload: {
                    studentMemberId: actorMembership._id,
                },
            });
            createdEnrollments.push(result.enrollment);
        } catch (error) {
            const mappedWriteError = mapSelfEnrollmentWriteDriftError(error) || error;
            if (createdEnrollments.length && mappedWriteError?.statusCode === 409) {
                const partialWriteError = createError(
                    409,
                    "Self-enrollment submission could not be finalized safely after creating some enrollments"
                );
                partialWriteError.reasonCode = mappedWriteError.reasonCode || null;
                if (Array.isArray(mappedWriteError.blockingReasonCodes)) {
                    partialWriteError.blockingReasonCodes = [...mappedWriteError.blockingReasonCodes];
                }
                partialWriteError.partialEnrollmentIds = createdEnrollments.map((enrollment) => enrollment.id);
                throw partialWriteError;
            }

            throw mappedWriteError;
        }
    }

    return {
        enrollments: createdEnrollments,
        submission: {
            sectionIds: [...input.sectionIds],
            loadSummary: submissionDecision.loadSummary,
        },
    };
}

module.exports = {
    validateCreateEnrollmentInput,
    validateUpdateEnrollmentStatusInput,
    toEnrollmentResponse,
    toEnrollmentListItem,
    syncSchoolSectionEnrollmentsForAssignment,
    backfillSchoolSectionEnrollments,
    createEnrollment,
    listEnrollments,
    getEnrollmentById,
    updateEnrollmentStatus,
    dropEnrollmentForAcademicDecision,
    validateSelfEnrollmentBrowseQuery,
    validateSelfEnrollmentSubmissionInput,
    resolveSelfEnrollmentBrowseCandidates,
    filterSelfEnrollmentBrowseSectionList,
    toSelfEnrollmentBrowseSectionListItem,
    listMySelfEnrollmentSections,
    getSelfEnrollmentEligibility,
    createMySelfEnrollmentSubmission,
};
