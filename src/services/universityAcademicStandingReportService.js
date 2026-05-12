const mongoose = require("mongoose");
const Department = require("../models/Department");
const Enrollment = require("../models/Enrollment");
const Institution = require("../models/Institution");
const MemberProfile = require("../models/MemberProfile");
const Membership = require("../models/Membership");
const Section = require("../models/Section");
const Semester = require("../models/Semester");
const Subject = require("../models/Subject");
const User = require("../models/User");
const { ROLE_PERMISSIONS } = require("../auth/permissions");
const universityAcademicOutcomeService = require("./universityAcademicOutcomeService");
const {
    resolveAcademicStanding,
    resolveAcademicStandingRules,
} = require("./universityAcademicStandingService");

const ACTIVE_MEMBERSHIP_STATUS = Membership.schema.path("status").defaultValue;
const ACTIVE_ENROLLMENT_STATUS = Enrollment.schema.path("status").defaultValue;
const UNIVERSITY_STANDING_REPORT_PERMISSION = "section.manage";
const STANDING_ROW_CONCURRENCY_LIMIT = 5;
const STANDING_FILTER_VALUES = [
    "good_standing",
    "academic_warning",
    "probation",
    "suspension",
    "review_required",
    "no_standing_yet",
];

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

function parseOptionalGpa(rawValue, fieldName) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
        return null;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 4) {
        throw createError(400, `${fieldName} must be a number between 0 and 4`);
    }

    return parsed;
}

function validateStandingReportQuery(query = {}) {
    const standing = normalizeLowerString(query.standing);
    if (standing && !STANDING_FILTER_VALUES.includes(standing)) {
        throw createError(400, `standing must be one of: ${STANDING_FILTER_VALUES.join(", ")}`);
    }

    const minGpa = parseOptionalGpa(query.minGpa, "minGpa");
    const maxGpa = parseOptionalGpa(query.maxGpa, "maxGpa");
    if (minGpa !== null && maxGpa !== null && maxGpa < minGpa) {
        throw createError(400, "maxGpa must be greater than or equal to minGpa");
    }

    return {
        standing: standing || null,
        minGpa,
        maxGpa,
        semesterId:
            query.semesterId === undefined ? null : validateObjectId(query.semesterId, "semesterId"),
        departmentId:
            query.departmentId === undefined ? null : validateObjectId(query.departmentId, "departmentId"),
        search: normalizeLowerString(query.search),
        page: parsePositiveInteger(query.page, 1, 1),
        limit: parsePositiveInteger(query.limit, 25, 1, 50),
    };
}

function hasRolePermission(role, permission) {
    return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

function ensureActorMembership({ institutionId, actorUserId, actorMembership }) {
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    if (!actorMembership || !actorMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (normalizeId(actorMembership.institutionId) !== normalizeId(institutionId)) {
        throw createError(403, "Institution access denied");
    }
}

function ensureInstitutionStandingAccess(context) {
    ensureActorMembership(context);

    if (!hasRolePermission(context.actorMembership.role, UNIVERSITY_STANDING_REPORT_PERMISSION)) {
        throw createError(403, "Permission denied");
    }
}

function ensureInstructorStandingAccess(context) {
    ensureActorMembership(context);

    if (context.actorMembership.role !== "instructor") {
        throw createError(403, "Only instructors can access their academic standing dashboard");
    }
}

async function ensureUniversityInstitution(institutionId) {
    const institution = await Institution.findOne({ _id: institutionId }).select("_id type").lean();
    if (!institution) {
        throw createError(404, "Institution not found");
    }

    if (institution.type !== "university") {
        throw createError(409, "Academic standing dashboard is only supported for university institutions");
    }

    return institution;
}

async function resolveSemesterScopedStudentIds({ institutionId, semesterId }) {
    if (!semesterId) {
        return null;
    }

    const semester = await Semester.findOne({ _id: semesterId, institutionId }).select("_id").lean();
    if (!semester) {
        throw createError(404, "Semester not found");
    }

    const sections = await Section.find({ institutionId, semesterId }).select("_id").lean();
    if (!sections.length) {
        return new Set();
    }

    const enrollments = await Enrollment.find({
        institutionId,
        sectionId: { $in: sections.map((section) => section._id) },
        status: ACTIVE_ENROLLMENT_STATUS,
    })
        .select("studentMemberId")
        .lean();

    return new Set(enrollments.map((enrollment) => normalizeId(enrollment.studentMemberId)).filter(Boolean));
}

async function resolveDepartmentScopedStudentIds({ institutionId, departmentId }) {
    if (!departmentId) {
        return null;
    }

    const department = await Department.findOne({ _id: departmentId, institutionId }).select("_id").lean();
    if (!department) {
        throw createError(404, "Department not found");
    }

    const subjects = await Subject.find({ institutionId, departmentId }).select("_id").lean();
    if (!subjects.length) {
        return new Set();
    }

    const sections = await Section.find({
        institutionId,
        subjectId: { $in: subjects.map((subject) => subject._id) },
    })
        .select("_id")
        .lean();
    if (!sections.length) {
        return new Set();
    }

    const enrollments = await Enrollment.find({
        institutionId,
        sectionId: { $in: sections.map((section) => section._id) },
        status: ACTIVE_ENROLLMENT_STATUS,
    })
        .select("studentMemberId")
        .lean();

    return new Set(enrollments.map((enrollment) => normalizeId(enrollment.studentMemberId)).filter(Boolean));
}

async function resolveInstructorScopedStudentIds({ institutionId, instructorMembershipId }) {
    const sections = await Section.find({
        institutionId,
        instructorMemberId: instructorMembershipId,
    })
        .select("_id")
        .lean();
    if (!sections.length) {
        return new Set();
    }

    const enrollments = await Enrollment.find({
        institutionId,
        sectionId: { $in: sections.map((section) => section._id) },
        status: ACTIVE_ENROLLMENT_STATUS,
    })
        .select("studentMemberId")
        .lean();

    return new Set(enrollments.map((enrollment) => normalizeId(enrollment.studentMemberId)).filter(Boolean));
}

function intersectStudentIdSets(...sets) {
    const realSets = sets.filter((set) => set instanceof Set);
    if (!realSets.length) {
        return null;
    }

    const [firstSet, ...remainingSets] = realSets;
    return new Set([...firstSet].filter((studentId) => remainingSets.every((set) => set.has(studentId))));
}

function buildProfileMaps({ profiles = [], users = [] }) {
    return {
        profileByMembershipId: new Map(
            profiles.map((profile) => [normalizeId(profile.membershipId), profile]).filter(([id]) => Boolean(id))
        ),
        userById: new Map(users.map((user) => [normalizeId(user._id), user]).filter(([id]) => Boolean(id))),
    };
}

function studentMatchesSearch({ membership, profile, user, search }) {
    if (!search) {
        return true;
    }

    const fullName = (profile?.fullName || "").toLowerCase();
    const email = (user?.email || "").toLowerCase();
    return fullName.includes(search) || email.includes(search);
}

function buildProfileSummary(outcomeResult = {}) {
    const summary = outcomeResult.summary || {};
    return {
        cumulativeGpa: summary.cumulativeGpa ?? null,
        totalEarnedCreditHours: summary.earnedCreditHours ?? 0,
        totalAttemptedCreditHours: summary.attemptedCreditHours ?? 0,
    };
}

function buildCompactAcademicStanding(academicStanding) {
    return {
        enabled: academicStanding.enabled,
        standing: academicStanding.standing,
        allowedToContinue: academicStanding.allowedToContinue,
        requiresAdvisorReview: academicStanding.requiresAdvisorReview,
        reasonCodes: academicStanding.reasonCodes,
        warnings: academicStanding.warnings,
        appliedBand: academicStanding.appliedBand,
        calculationMode: academicStanding.calculationMode,
        source: academicStanding.source,
    };
}

function createStandingSummary() {
    return {
        totalStudents: 0,
        good_standing: 0,
        academic_warning: 0,
        probation: 0,
        suspension: 0,
        review_required: 0,
        no_standing_yet: 0,
    };
}

function applyReportFilters(student, filters) {
    const standing = student.academicStanding?.standing || null;
    const cumulativeGpa = student.cumulativeGpa;

    if (filters.standing && standing !== filters.standing) {
        return false;
    }

    if (filters.minGpa !== null && (!Number.isFinite(cumulativeGpa) || cumulativeGpa < filters.minGpa)) {
        return false;
    }

    if (filters.maxGpa !== null && (!Number.isFinite(cumulativeGpa) || cumulativeGpa > filters.maxGpa)) {
        return false;
    }

    return true;
}

function sortStandingRows(left, right) {
    const leftName = (left.name || left.email || left.studentMembershipId || "").toLowerCase();
    const rightName = (right.name || right.email || right.studentMembershipId || "").toLowerCase();
    return leftName.localeCompare(rightName) || left.studentMembershipId.localeCompare(right.studentMembershipId);
}

async function loadCandidateStudentMemberships({ institutionId, filters, scopedStudentIds = null }) {
    if (scopedStudentIds instanceof Set && !scopedStudentIds.size) {
        return [];
    }

    const membershipQuery = {
        institutionId,
        role: "student",
        status: ACTIVE_MEMBERSHIP_STATUS,
    };

    if (scopedStudentIds instanceof Set) {
        membershipQuery._id = { $in: [...scopedStudentIds] };
    }

    const memberships = await Membership.find(membershipQuery)
        .select("_id institutionId userId role status joinedAt")
        .lean();
    if (!memberships.length) {
        return [];
    }

    const [profiles, users] = await Promise.all([
        MemberProfile.find({
            institutionId,
            membershipId: { $in: memberships.map((membership) => membership._id) },
        })
            .select("_id membershipId fullName fullNameNormalized")
            .lean(),
        User.find({
            _id: { $in: memberships.map((membership) => membership.userId) },
        })
            .select("_id email")
            .lean(),
    ]);
    const { profileByMembershipId, userById } = buildProfileMaps({ profiles, users });

    return memberships
        .map((membership) => ({
            membership,
            profile: profileByMembershipId.get(normalizeId(membership._id)) || null,
            user: userById.get(normalizeId(membership.userId)) || null,
        }))
        .filter((student) =>
            studentMatchesSearch({
                ...student,
                search: filters.search,
            })
        );
}

async function buildStudentStandingRow({ institutionId, student }) {
    const studentMembershipId = normalizeId(student.membership._id);
    const outcomeResult = await universityAcademicOutcomeService.listStudentAcademicOutcomes({
        institutionId,
        studentMemberId: studentMembershipId,
    });
    const summary = buildProfileSummary(outcomeResult);
    const academicStanding = resolveAcademicStanding({
        academicStandingRules: resolveAcademicStandingRules(outcomeResult),
        summary,
        outcomes: outcomeResult.outcomes || [],
        excluded: outcomeResult.excluded || [],
        warnings: outcomeResult.warnings || [],
    });

    return {
        studentMembershipId,
        name: student.profile?.fullName || null,
        email: student.user?.email || null,
        cumulativeGpa: summary.cumulativeGpa,
        totalEarnedCreditHours: summary.totalEarnedCreditHours,
        totalAttemptedCreditHours: summary.totalAttemptedCreditHours,
        academicStanding: buildCompactAcademicStanding(academicStanding),
    };
}

async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }

    const workerCount = Math.min(Math.max(limit, 1), items.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}

async function buildStandingReport({
    institutionId,
    actorUserId,
    actorMembership,
    query = {},
    scope = "institution",
}) {
    const normalizedInstitutionId = validateObjectId(institutionId, "institutionId");
    const filters = validateStandingReportQuery(query);

    if (scope === "instructor") {
        ensureInstructorStandingAccess({
            institutionId: normalizedInstitutionId,
            actorUserId,
            actorMembership,
        });
    } else {
        ensureInstitutionStandingAccess({
            institutionId: normalizedInstitutionId,
            actorUserId,
            actorMembership,
        });
    }

    await ensureUniversityInstitution(normalizedInstitutionId);

    const scopedStudentIds = intersectStudentIdSets(
        scope === "instructor"
            ? await resolveInstructorScopedStudentIds({
                  institutionId: normalizedInstitutionId,
                  instructorMembershipId: normalizeId(actorMembership._id),
              })
            : null,
        await resolveSemesterScopedStudentIds({
            institutionId: normalizedInstitutionId,
            semesterId: filters.semesterId,
        }),
        await resolveDepartmentScopedStudentIds({
            institutionId: normalizedInstitutionId,
            departmentId: filters.departmentId,
        })
    );
    const candidateStudents = await loadCandidateStudentMemberships({
        institutionId: normalizedInstitutionId,
        filters,
        scopedStudentIds,
    });

    // Standing dashboards are calculated live; larger tenants may later need batch outcome aggregation
    // or term-close standing snapshots if this per-student read path becomes too expensive.
    const candidateRows = await mapWithConcurrency(
        candidateStudents,
        STANDING_ROW_CONCURRENCY_LIMIT,
        (student) => buildStudentStandingRow({
            institutionId: normalizedInstitutionId,
            student,
        })
    );

    const rows = [];
    for (const row of candidateRows) {
        if (applyReportFilters(row, filters)) {
            rows.push(row);
        }
    }

    rows.sort(sortStandingRows);

    const standingSummary = createStandingSummary();
    standingSummary.totalStudents = rows.length;
    for (const row of rows) {
        const standing = row.academicStanding?.standing;
        if (Object.prototype.hasOwnProperty.call(standingSummary, standing)) {
            standingSummary[standing] += 1;
        }
    }

    const offset = (filters.page - 1) * filters.limit;
    const paginatedRows = rows.slice(offset, offset + filters.limit);
    const totalPages = rows.length === 0 ? 0 : Math.ceil(rows.length / filters.limit);

    return {
        standingSummary,
        students: paginatedRows,
        pagination: {
            page: filters.page,
            limit: filters.limit,
            total: rows.length,
            totalPages,
        },
    };
}

async function summarizeUniversityAcademicStandings(args) {
    const report = await buildStandingReport(args);
    return {
        standingSummary: report.standingSummary,
    };
}

async function listUniversityAcademicStandingStudents(args) {
    return buildStandingReport(args);
}

async function summarizeMyUniversityAcademicStandings(args) {
    const report = await buildStandingReport({
        ...args,
        scope: "instructor",
    });
    return {
        standingSummary: report.standingSummary,
    };
}

async function listMyUniversityAcademicStandingStudents(args) {
    return buildStandingReport({
        ...args,
        scope: "instructor",
    });
}

module.exports = {
    STANDING_FILTER_VALUES,
    listMyUniversityAcademicStandingStudents,
    listUniversityAcademicStandingStudents,
    summarizeMyUniversityAcademicStandings,
    summarizeUniversityAcademicStandings,
    validateStandingReportQuery,
};
