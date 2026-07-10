const bcrypt = require("bcrypt");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Membership = require("../models/Membership");
const MemberProfile = require("../models/MemberProfile");
const User = require("../models/User");
const { assertMembershipSeatTransitionAllowed } = require("./billingEntitlementService");
const { sendMemberAccountCreatedEmail, sendMemberInviteEmail } = require("./emailService");
const { createAccountSetupToken } = require("./authService");

function memberSetupDevFields(rawToken) {
    // Expose the setup token in the API response only outside production, to support
    // local dev and tests. Production never returns it (it is emailed as a link).
    if (process.env.NODE_ENV === "production" || !rawToken) {
        return {};
    }
    return { devSetupToken: rawToken };
}

const DEFAULT_SALT_ROUNDS = 10;
const MEMBER_ROLES = ["admin", "instructor", "student"];
const MEMBER_STATUSES = ["active", "suspended"];
const MANAGEABLE_MEMBER_STATUSES = ["active", "suspended"];
const GENDERS = ["male", "female"];

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

function normalizeEmail(value) {
    return normalizeLowerString(value);
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidObjectId(value) {
    return Boolean(value) && mongoose.Types.ObjectId.isValid(value);
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

function isDuplicateKeyError(error) {
    return Boolean(error) && error.name === "MongoServerError" && error.code === 11000;
}

function formatDateOnly(value) {
    return value.toISOString().slice(0, 10);
}

function parseDateOnly(rawValue, fieldName) {
    if (rawValue instanceof Date) {
        if (Number.isNaN(rawValue.getTime())) {
            throw createError(400, `${fieldName} must be a valid date`);
        }

        return new Date(`${formatDateOnly(rawValue)}T00:00:00.000Z`);
    }

    const value = normalizeString(rawValue);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw createError(400, `${fieldName} must be in YYYY-MM-DD format`);
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || formatDateOnly(parsed) !== value) {
        throw createError(400, `${fieldName} must be a valid date`);
    }

    return parsed;
}

function normalizeRequiredString(rawValue, fieldName, maxLength) {
    const value = normalizeString(rawValue);
    if (!value) {
        throw createError(400, `${fieldName} is required`);
    }

    if (value.length > maxLength) {
        throw createError(400, `${fieldName} must be at most ${maxLength} characters`);
    }

    return value;
}

function normalizeOptionalString(rawValue, fieldName, maxLength) {
    if (rawValue === undefined || rawValue === null) {
        return null;
    }

    const value = normalizeString(rawValue);
    if (!value) {
        return null;
    }

    if (value.length > maxLength) {
        throw createError(400, `${fieldName} must be at most ${maxLength} characters`);
    }

    return value;
}

function normalizeStrictNullableString(rawValue, fieldName, maxLength) {
    if (rawValue === undefined) {
        return undefined;
    }

    if (rawValue === null) {
        return null;
    }

    const value = normalizeString(rawValue);
    if (!value) {
        throw createError(400, `${fieldName} must be a non-empty string`);
    }

    if (value.length > maxLength) {
        throw createError(400, `${fieldName} must be at most ${maxLength} characters`);
    }

    return value;
}

function normalizeGender(rawValue, fieldName, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : null;
    }

    if (rawValue === null) {
        return null;
    }

    const gender = normalizeLowerString(rawValue);
    if (!GENDERS.includes(gender)) {
        throw createError(400, `${fieldName} must be male or female`);
    }

    return gender;
}

function normalizeBirthDate(rawValue, fieldName, { allowUndefined = false } = {}) {
    if (rawValue === undefined) {
        return allowUndefined ? undefined : null;
    }

    if (rawValue === null) {
        return null;
    }

    return parseDateOnly(rawValue, fieldName);
}

function buildFullName(firstName, lastName) {
    const fullName = `${firstName} ${lastName}`.trim();
    return {
        fullName,
        fullNameNormalized: fullName.toLowerCase(),
    };
}

function validateRole(rawValue, fieldName = "role") {
    const role = normalizeLowerString(rawValue);
    if (!MEMBER_ROLES.includes(role)) {
        throw createError(400, `${fieldName} must be admin, instructor, or student`);
    }

    return role;
}

function validateFilterStatus(rawValue) {
    const status = normalizeLowerString(rawValue);
    if (!status) {
        return "";
    }

    if (!MEMBER_STATUSES.includes(status)) {
        throw createError(400, "status must be active or suspended");
    }

    return status;
}

function validateManageableStatus(rawValue) {
    const status = normalizeLowerString(rawValue);
    if (!MANAGEABLE_MEMBER_STATUSES.includes(status)) {
        throw createError(400, "status must be active or suspended");
    }

    return status;
}

function parsePositiveInteger(rawValue, fallback, min, max) {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed)) {
        return fallback;
    }

    if (parsed < min) {
        return fallback;
    }

    if (max !== undefined && parsed > max) {
        return max;
    }

    return parsed;
}

function validateProfileInput(rawValue, { isUpdate = false, existingProfile = null } = {}) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw createError(400, "profile must be an object");
    }

    const updates = {};
    const firstNameField = "profile.firstName";
    const lastNameField = "profile.lastName";
    const nationalNumberField = "profile.nationalNumber";

    if (!isUpdate || rawValue.firstName !== undefined) {
        updates.firstName = normalizeRequiredString(rawValue.firstName, firstNameField, 80);
    }

    if (!isUpdate || rawValue.lastName !== undefined) {
        updates.lastName = normalizeRequiredString(rawValue.lastName, lastNameField, 80);
    }

    if (!isUpdate || rawValue.fatherName !== undefined) {
        updates.fatherName = normalizeOptionalString(rawValue.fatherName, "profile.fatherName", 80);
    }

    if (!isUpdate || rawValue.motherName !== undefined) {
        updates.motherName = normalizeOptionalString(rawValue.motherName, "profile.motherName", 80);
    }

    if (!isUpdate || rawValue.birthPlace !== undefined) {
        updates.birthPlace = normalizeOptionalString(rawValue.birthPlace, "profile.birthPlace", 120);
    }

    if (!isUpdate || rawValue.birthDate !== undefined) {
        updates.birthDate = normalizeBirthDate(rawValue.birthDate, "profile.birthDate", { allowUndefined: isUpdate });
    }

    if (!isUpdate || rawValue.gender !== undefined) {
        updates.gender = normalizeGender(rawValue.gender, "profile.gender", { allowUndefined: isUpdate });
    }

    if (!isUpdate || rawValue.nationality !== undefined) {
        updates.nationality = normalizeOptionalString(rawValue.nationality, "profile.nationality", 80);
    }

    if (!isUpdate || rawValue.mobile !== undefined) {
        updates.mobile = normalizeOptionalString(rawValue.mobile, "profile.mobile", 30);
    }

    if (!isUpdate || rawValue.nationalNumber !== undefined) {
        updates.nationalNumber = normalizeRequiredString(rawValue.nationalNumber, nationalNumberField, 40);
    }

    if (!isUpdate || rawValue.profilePictureUrl !== undefined) {
        const value = normalizeStrictNullableString(
            rawValue.profilePictureUrl,
            "profile.profilePictureUrl",
            500
        );
        updates.profilePictureUrl = value === undefined ? null : value;
    }

    if (isUpdate && Object.keys(updates).length === 0) {
        return updates;
    }

    const shouldRebuildFullName =
        !isUpdate || updates.firstName !== undefined || updates.lastName !== undefined;

    let fullName = null;
    let fullNameNormalized = null;
    if (shouldRebuildFullName) {
        const nextFirstName =
            updates.firstName !== undefined
                ? updates.firstName
                : normalizeRequiredString(existingProfile?.firstName, firstNameField, 80);
        const nextLastName =
            updates.lastName !== undefined
                ? updates.lastName
                : normalizeRequiredString(existingProfile?.lastName, lastNameField, 80);
        const fullNameValues = buildFullName(nextFirstName, nextLastName);
        fullName = fullNameValues.fullName;
        fullNameNormalized = fullNameValues.fullNameNormalized;
        updates.fullName = fullName;
        updates.fullNameNormalized = fullNameNormalized;
    }

    if (isUpdate) {
        return updates;
    }

    return {
        firstName: updates.firstName,
        lastName: updates.lastName,
        fatherName: updates.fatherName,
        motherName: updates.motherName,
        birthPlace: updates.birthPlace,
        birthDate: updates.birthDate,
        gender: updates.gender,
        nationality: updates.nationality,
        nationalNumber: updates.nationalNumber,
        mobile: updates.mobile,
        profilePictureUrl: updates.profilePictureUrl,
        fullName: fullName || updates.fullName,
        fullNameNormalized: fullNameNormalized || updates.fullNameNormalized,
    };
}

function validateCreateMemberInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const email = normalizeEmail(payload.email);
    if (!email) {
        throw createError(400, "email is required");
    }

    if (!isValidEmail(email)) {
        throw createError(400, "Invalid email format");
    }

    const role = validateRole(payload.role);
    const profile = validateProfileInput(payload.profile, { isUpdate: false });

    return {
        email,
        role,
        profile,
    };
}

function validateUpdateMemberInput(payload, existingProfile) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    const updates = {};

    if (payload.email !== undefined) {
        const email = normalizeEmail(payload.email);
        if (!email) {
            throw createError(400, "email must be a non-empty string");
        }

        if (!isValidEmail(email)) {
            throw createError(400, "Invalid email format");
        }

        updates.email = email;
    }

    if (payload.role !== undefined) {
        updates.role = validateRole(payload.role);
    }

    if (payload.profile !== undefined) {
        updates.profile = validateProfileInput(payload.profile, {
            isUpdate: true,
            existingProfile,
        });

        if (!Object.keys(updates.profile).length) {
            delete updates.profile;
        }
    }

    if (!Object.keys(updates).length) {
        throw createError(400, "No valid fields to update");
    }

    return updates;
}

function validateUpdateMemberStatusInput(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError(400, "Invalid request body");
    }

    if (payload.status === undefined) {
        throw createError(400, "status is required");
    }

    return {
        status: validateManageableStatus(payload.status),
    };
}

function validateListMembersInput(query = {}) {
    const role = query.role === undefined ? "" : validateRole(query.role, "role");
    const status = validateFilterStatus(query.status);
    const search = normalizeLowerString(query.search);
    const page = parsePositiveInteger(query.page, 1, 1);
    const limit = parsePositiveInteger(query.limit, 20, 1, 100);

    return {
        role,
        status,
        search,
        page,
        limit,
    };
}

function toMemberProfileSummary(profile) {
    return {
        firstName: profile?.firstName || null,
        lastName: profile?.lastName || null,
        fullName: profile?.fullName || null,
        nationalNumber: profile?.nationalNumber || null,
        mobile: profile?.mobile || null,
        profilePictureUrl: profile?.profilePictureUrl || null,
    };
}

function toMemberProfileDetails(profile) {
    if (!profile) {
        return null;
    }

    return {
        firstName: profile.firstName,
        lastName: profile.lastName,
        fatherName: profile.fatherName,
        motherName: profile.motherName,
        birthPlace: profile.birthPlace,
        birthDate: profile.birthDate ? formatDateOnly(new Date(profile.birthDate)) : null,
        gender: profile.gender,
        nationality: profile.nationality,
        nationalNumber: profile.nationalNumber,
        mobile: profile.mobile,
        profilePictureUrl: profile.profilePictureUrl,
        fullName: profile.fullName,
    };
}

function getUserInfoFromMembership(membership) {
    const user = membership.userId;
    if (!user || typeof user !== "object") {
        return {
            userId: membership.userId?.toString() || null,
            email: null,
        };
    }

    return {
        userId: user._id?.toString() || user.id || null,
        email: user.email || null,
    };
}

function toMemberListResponse({ membership, profile }) {
    const userInfo = getUserInfoFromMembership(membership);

    return {
        id: membership._id.toString(),
        userId: userInfo.userId,
        institutionId: membership.institutionId.toString(),
        role: membership.role,
        status: membership.status,
        email: userInfo.email,
        joinedAt: membership.joinedAt,
        profile: toMemberProfileSummary(profile),
    };
}

function toMemberDetailsResponse({ membership, profile }) {
    const userInfo = getUserInfoFromMembership(membership);

    return {
        id: membership._id.toString(),
        userId: userInfo.userId,
        institutionId: membership.institutionId.toString(),
        role: membership.role,
        status: membership.status,
        email: userInfo.email,
        joinedAt: membership.joinedAt,
        profile: toMemberProfileDetails(profile),
    };
}

async function loadMemberRecord({ institutionId, membershipId }) {
    const membership = await Membership.findOne({
        _id: membershipId,
        institutionId,
    })
        .select("_id userId institutionId role status joinedAt invitedBy createdAt updatedAt")
        .populate({
            path: "userId",
            select: "_id email status isEmailVerified",
        })
        .lean();

    if (!membership) {
        return null;
    }

    if (!membership.userId || typeof membership.userId !== "object" || !membership.userId._id) {
        throw createError(404, "Member user not found");
    }

    const profile = await MemberProfile.findOne({
        membershipId: membership._id,
        institutionId,
    }).lean();

    if (!profile) {
        throw createError(404, "Member profile not found");
    }

    return { membership, profile };
}

function mapDuplicateCreateError(error) {
    if (!isDuplicateKeyError(error)) {
        return null;
    }

    if (error.keyPattern && error.keyPattern.email) {
        return createError(409, "Email is already in use");
    }

    if (error.keyPattern && error.keyPattern.userId && error.keyPattern.institutionId) {
        return createError(409, "User already has membership in this institution");
    }

    if (error.keyPattern && error.keyPattern.membershipId) {
        return createError(409, "Member profile already exists for this membership");
    }

    if (error.keyPattern && error.keyPattern.nationalNumber && error.keyPattern.institutionId) {
        return createError(409, "nationalNumber already exists in this institution");
    }

    return createError(409, "Member already exists");
}

function mapDuplicateUpdateError(error) {
    if (!isDuplicateKeyError(error)) {
        return null;
    }

    if (error.keyPattern && error.keyPattern.email) {
        return createError(409, "Email is already in use");
    }

    if (error.keyPattern && error.keyPattern.nationalNumber && error.keyPattern.institutionId) {
        return createError(409, "nationalNumber already exists in this institution");
    }

    return createError(409, "Member update conflicts with existing data");
}

async function createMember({ institutionId, createdByUserId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!createdByUserId || !isValidObjectId(createdByUserId)) {
        throw createError(401, "Unauthorized");
    }

    const { email, role, profile } = validateCreateMemberInput(payload);

    const conflictingProfile = await MemberProfile.findOne({
        institutionId,
        nationalNumber: profile.nationalNumber,
    })
        .select("_id")
        .lean();
    if (conflictingProfile) {
        throw createError(409, "nationalNumber already exists in this institution");
    }

    let existingUser = await User.findOne({ email })
        .select("_id email status isEmailVerified mustChangePassword")
        .lean();

    if (existingUser && existingUser.status !== "active") {
        throw createError(400, "Existing user account is not active");
    }

    if (existingUser) {
        const existingMembership = await Membership.findOne({
            userId: existingUser._id,
            institutionId,
        })
            .select("_id")
            .lean();

        if (existingMembership) {
            throw createError(409, "User already has membership in this institution");
        }
    }

    await assertMembershipSeatTransitionAllowed({
        institutionId,
        sourceMembership: null,
        destinationMembership: {
            role,
            status: "active",
        },
    });

    const configuredRounds = Number(process.env.BCRYPT_SALT_ROUNDS);
    const saltRounds =
        Number.isInteger(configuredRounds) && configuredRounds > 0 ? configuredRounds : DEFAULT_SALT_ROUNDS;

    let createdUser = null;
    if (!existingUser) {
        // Never derive the initial credential from PII (SEC-17/D-006). Create the account
        // with a random, unusable password; the member sets their own via a one-time
        // setup link (emailed below). mustChangePassword gates them until they do.
        const unusablePassword = crypto.randomBytes(32).toString("hex");
        const passwordHash = await bcrypt.hash(unusablePassword, saltRounds);
        createdUser = await User.create({
            email,
            passwordHash,
            isEmailVerified: true,
            mustChangePassword: true,
            status: "active",
        });

        existingUser = {
            _id: createdUser._id,
            email: createdUser.email,
            status: createdUser.status,
            isEmailVerified: createdUser.isEmailVerified,
            mustChangePassword: createdUser.mustChangePassword,
        };
    }

    let createdMembership = null;
    let createdProfile = null;
    let memberSetupToken = null;

    try {
        await assertMembershipSeatTransitionAllowed({
            institutionId,
            sourceMembership: null,
            destinationMembership: {
                role,
                status: "active",
            },
        });

        createdMembership = await Membership.create({
            userId: existingUser._id,
            institutionId,
            role,
            status: "active",
            invitedBy: createdByUserId,
        });

        createdProfile = await MemberProfile.create({
            membershipId: createdMembership._id,
            userId: existingUser._id,
            institutionId,
            firstName: profile.firstName,
            lastName: profile.lastName,
            fatherName: profile.fatherName,
            motherName: profile.motherName,
            birthPlace: profile.birthPlace,
            birthDate: profile.birthDate,
            gender: profile.gender,
            nationality: profile.nationality,
            nationalNumber: profile.nationalNumber,
            mobile: profile.mobile,
            profilePictureUrl: profile.profilePictureUrl,
            fullName: profile.fullName,
            fullNameNormalized: profile.fullNameNormalized,
        });

        if (createdUser) {
            // New account: send a secure one-time setup link (no password in the email).
            const setup = await createAccountSetupToken({
                userId: createdUser._id,
                institutionId,
            });
            memberSetupToken = setup.rawToken;
            await sendMemberInviteEmail({
                to: email,
                email,
                setupUrl: setup.setupUrl,
                expiresInHours: setup.expiresInHours,
            });
        } else {
            // Existing user added to another institution: they already have a password.
            await sendMemberAccountCreatedEmail({
                to: email,
                email,
                initialPasswordHint: null,
                isNewUser: false,
            });
        }
    } catch (error) {
        if (createdProfile?._id) {
            await MemberProfile.deleteOne({ _id: createdProfile._id });
        }

        if (createdMembership?._id) {
            await Membership.deleteOne({ _id: createdMembership._id });
        }

        if (createdUser?._id) {
            await User.deleteOne({ _id: createdUser._id });
        }

        const mappedDuplicateError = mapDuplicateCreateError(error);
        if (mappedDuplicateError) {
            throw mappedDuplicateError;
        }

        if (error.statusCode) {
            throw error;
        }

        throw createError(500, "Failed to create member");
    }

    const memberRecord = await loadMemberRecord({
        institutionId,
        membershipId: createdMembership._id,
    });

    return {
        member: toMemberDetailsResponse(memberRecord),
        ...memberSetupDevFields(memberSetupToken),
    };
}

async function listMembers({ institutionId, query }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const { role, status, search, page, limit } = validateListMembersInput(query);

    const membershipQuery = { institutionId };
    if (role) {
        membershipQuery.role = role;
    }
    if (status) {
        membershipQuery.status = status;
    }

    const memberships = await Membership.find(membershipQuery)
        .select("_id userId institutionId role status joinedAt createdAt updatedAt")
        .sort({ joinedAt: -1, createdAt: -1 })
        .populate({
            path: "userId",
            select: "_id email status isEmailVerified",
        })
        .lean();

    if (!memberships.length) {
        return {
            total: 0,
            members: [],
        };
    }

    const membershipIds = memberships.map((membership) => membership._id);
    const profiles = await MemberProfile.find({
        institutionId,
        membershipId: { $in: membershipIds },
    })
        .select(
            "_id membershipId firstName lastName fullName fullNameNormalized nationalNumber mobile profilePictureUrl"
        )
        .lean();

    const profileByMembershipId = new Map(
        profiles.map((profile) => [profile.membershipId.toString(), profile])
    );

    let members = memberships.map((membership) =>
        toMemberListResponse({
            membership,
            profile: profileByMembershipId.get(membership._id.toString()) || null,
        })
    );

    if (search) {
        members = members.filter((member) => {
            const fullName = (member.profile.fullName || "").toLowerCase();
            const email = (member.email || "").toLowerCase();
            const nationalNumber = member.profile.nationalNumber || "";

            return (
                fullName.includes(search) ||
                email.includes(search) ||
                nationalNumber.includes(search)
            );
        });
    }

    const total = members.length;
    const offset = (page - 1) * limit;
    const paginatedMembers = members.slice(offset, offset + limit);

    return {
        total,
        members: paginatedMembers,
    };
}

async function getMemberById({ institutionId, membershipId }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!membershipId || !isValidObjectId(membershipId)) {
        throw createError(400, "Invalid membership id");
    }

    const memberRecord = await loadMemberRecord({
        institutionId,
        membershipId,
    });

    if (!memberRecord) {
        throw createError(404, "Member not found");
    }

    return {
        member: toMemberDetailsResponse(memberRecord),
    };
}

async function getMyMemberProfile({ institutionId, actorUser, actorMembership }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    const actorUserId = normalizeId(actorUser?.id || actorUser?._id);
    if (!actorUserId || !isValidObjectId(actorUserId)) {
        throw createError(401, "Unauthorized");
    }

    const actorMembershipId = normalizeId(actorMembership?._id);
    const actorMembershipUserId = normalizeId(actorMembership?.userId);
    const actorMembershipInstitutionId = normalizeId(actorMembership?.institutionId);

    if (!actorMembershipId || !isValidObjectId(actorMembershipId)) {
        throw createError(403, "Institution access denied");
    }

    if (
        actorMembershipUserId !== actorUserId ||
        actorMembershipInstitutionId !== normalizeId(institutionId) ||
        actorMembership.status !== "active"
    ) {
        throw createError(403, "Institution access denied");
    }

    const membership = await Membership.findOne({
        _id: actorMembershipId,
        institutionId,
        userId: actorUserId,
        status: "active",
    })
        .select("_id userId institutionId role status joinedAt")
        .populate({
            path: "userId",
            select: "_id email status isEmailVerified",
        })
        .lean();

    if (!membership) {
        throw createError(403, "Institution access denied");
    }

    if (!membership.userId || typeof membership.userId !== "object" || !membership.userId._id) {
        throw createError(404, "Member user not found");
    }

    const profile = await MemberProfile.findOne({
        institutionId,
        membershipId: membership._id,
    })
        .select(
            "firstName lastName fatherName motherName birthPlace birthDate gender nationality nationalNumber mobile profilePictureUrl fullName"
        )
        .lean();

    return {
        member: toMemberDetailsResponse({ membership, profile }),
    };
}

async function updateMember({ institutionId, membershipId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!membershipId || !isValidObjectId(membershipId)) {
        throw createError(400, "Invalid membership id");
    }

    const memberRecord = await loadMemberRecord({
        institutionId,
        membershipId,
    });

    if (!memberRecord) {
        throw createError(404, "Member not found");
    }

    const updates = validateUpdateMemberInput(payload, memberRecord.profile);
    const membershipUserInfo = getUserInfoFromMembership(memberRecord.membership);
    const userId = membershipUserInfo.userId;

    if (updates.email && updates.email !== membershipUserInfo.email) {
        const emailMatch = await User.findOne({
            email: updates.email,
            _id: { $ne: userId },
        })
            .select("_id")
            .lean();
        if (emailMatch) {
            throw createError(409, "Email is already in use");
        }
    }

    if (
        updates.profile &&
        updates.profile.nationalNumber &&
        updates.profile.nationalNumber !== memberRecord.profile.nationalNumber
    ) {
        const nationalNumberMatch = await MemberProfile.findOne({
            institutionId,
            nationalNumber: updates.profile.nationalNumber,
            _id: { $ne: memberRecord.profile._id },
        })
            .select("_id")
            .lean();
        if (nationalNumberMatch) {
            throw createError(409, "nationalNumber already exists in this institution");
        }
    }

    try {
        if (updates.email && updates.email !== membershipUserInfo.email) {
            await User.updateOne(
                { _id: userId },
                { $set: { email: updates.email } }
            );
        }

        if (updates.role && updates.role !== memberRecord.membership.role) {
            await assertMembershipSeatTransitionAllowed({
                institutionId,
                sourceMembership: memberRecord.membership,
                destinationMembership: {
                    ...memberRecord.membership,
                    role: updates.role,
                },
            });

            await Membership.updateOne(
                {
                    _id: membershipId,
                    institutionId,
                },
                { $set: { role: updates.role } }
            );
        }

        if (updates.profile && Object.keys(updates.profile).length) {
            await MemberProfile.updateOne(
                {
                    _id: memberRecord.profile._id,
                    institutionId,
                },
                { $set: updates.profile }
            );
        }
    } catch (error) {
        const mappedDuplicateError = mapDuplicateUpdateError(error);
        if (mappedDuplicateError) {
            throw mappedDuplicateError;
        }

        throw error;
    }

    const updatedMemberRecord = await loadMemberRecord({
        institutionId,
        membershipId,
    });

    if (!updatedMemberRecord) {
        throw createError(404, "Member not found");
    }

    return {
        member: toMemberDetailsResponse(updatedMemberRecord),
    };
}

async function updateMemberStatus({ institutionId, membershipId, payload }) {
    if (!institutionId || !isValidObjectId(institutionId)) {
        throw createError(400, "Invalid institution context");
    }

    if (!membershipId || !isValidObjectId(membershipId)) {
        throw createError(400, "Invalid membership id");
    }

    const { status } = validateUpdateMemberStatusInput(payload);

    const existingMembership = await Membership.findOne({
        _id: membershipId,
        institutionId,
    })
        .select("_id institutionId role status")
        .lean();

    if (!existingMembership) {
        throw createError(404, "Member not found");
    }

    await assertMembershipSeatTransitionAllowed({
        institutionId,
        sourceMembership: existingMembership,
        destinationMembership: {
            ...existingMembership,
            status,
        },
    });

    const membership = await Membership.findOneAndUpdate(
        {
            _id: membershipId,
            institutionId,
        },
        { $set: { status } },
        { returnDocument: "after", runValidators: true }
    )
        .select("_id")
        .lean();

    if (!membership) {
        throw createError(404, "Member not found");
    }

    const memberRecord = await loadMemberRecord({
        institutionId,
        membershipId,
    });

    if (!memberRecord) {
        throw createError(404, "Member not found");
    }

    return {
        member: toMemberDetailsResponse(memberRecord),
    };
}

module.exports = {
    createMember,
    listMembers,
    getMemberById,
    getMyMemberProfile,
    updateMember,
    updateMemberStatus,
};
