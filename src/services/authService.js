const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const Institution = require("../models/Institution");
const Membership = require("../models/Membership");
const OtpCode = require("../models/OtpCode");
const User = require("../models/User");
const { sendOtpEmail } = require("./emailService");

const DEFAULT_SALT_ROUNDS = 10;
const DEFAULT_TOKEN_EXPIRES_IN = "7d";
const DEFAULT_OTP_EXPIRES_MINUTES = 10;
const DEFAULT_OTP_MAX_ATTEMPTS = 5;
const INSTITUTION_TYPES = ["school", "university"];
const SIGNUP_OTP_PURPOSE = "signup";
const RESET_PASSWORD_OTP_PURPOSE = "reset_password";

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function toSafeUser(user) {
    return {
        id: user._id.toString(),
        email: user.email,
        status: user.status,
        isEmailVerified: user.isEmailVerified,
        mustChangePassword: Boolean(user.mustChangePassword),
    };
}

function getJwtSecret() {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw createError(500, "JWT_SECRET is not configured");
    }

    return jwtSecret;
}

function signAccessToken(userId) {
    const jwtSecret = getJwtSecret();
    const expiresIn = process.env.JWT_EXPIRES_IN || DEFAULT_TOKEN_EXPIRES_IN;

    return jwt.sign({}, jwtSecret, {
        subject: userId.toString(),
        expiresIn,
    });
}

function normalizeEmail(email) {
    if (typeof email !== "string") {
        return "";
    }

    return email.trim().toLowerCase();
}

function normalizePassword(password) {
    if (typeof password !== "string") {
        return "";
    }

    return password;
}

function normalizeInstitutionName(name) {
    if (typeof name !== "string") {
        return "";
    }

    return name.trim();
}

function normalizeInstitutionType(type) {
    if (typeof type !== "string") {
        return "";
    }

    return type.trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parsePositiveInteger(value, fallbackValue) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
    }

    return fallbackValue;
}

function generateOtpCode() {
    return String(crypto.randomInt(100000, 1000000));
}

function normalizeOtpCode(code) {
    if (typeof code !== "string") {
        return "";
    }

    return code.trim();
}

function validateCredentials({ email, password }) {
    if (!email) {
        throw createError(400, "Email is required");
    }

    if (!password) {
        throw createError(400, "Password is required");
    }
}

async function createAndSendOtp({ email, purpose, userId }) {
    const otpCode = generateOtpCode();
    const otpExpiresMinutes = parsePositiveInteger(
        process.env.OTP_EXPIRES_MINUTES,
        DEFAULT_OTP_EXPIRES_MINUTES
    );
    const expiresAt = new Date(Date.now() + otpExpiresMinutes * 60 * 1000);
    const codeHash = await bcrypt.hash(otpCode, DEFAULT_SALT_ROUNDS);

    await OtpCode.deleteMany({
        email,
        purpose,
        consumedAt: null,
    });

    const otpRecord = await OtpCode.create({
        userId: userId || null,
        email,
        purpose,
        codeHash,
        expiresAt,
    });

    try {
        await sendOtpEmail({
            to: email,
            code: otpCode,
            purpose,
            expiresInMinutes: otpExpiresMinutes,
        });
    } catch (error) {
        await OtpCode.deleteOne({ _id: otpRecord._id });
        if (error.statusCode) {
            throw error;
        }

        throw createError(500, "Failed to send OTP email");
    }
}

async function signup({ email, password, confirmPassword, institutionName, institutionType }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedPassword = normalizePassword(password);
    const normalizedConfirmPassword = normalizePassword(confirmPassword);
    const normalizedInstitutionName = normalizeInstitutionName(institutionName);
    const normalizedInstitutionType = normalizeInstitutionType(institutionType) || "university";

    validateCredentials({
        email: normalizedEmail,
        password: normalizedPassword,
    });

    if (normalizedPassword.length < 8) {
        throw createError(400, "Password must be at least 8 characters");
    }

    if (!normalizedConfirmPassword) {
        throw createError(400, "Confirm password is required");
    }

    if (normalizedPassword !== normalizedConfirmPassword) {
        throw createError(400, "Passwords do not match");
    }

    if (!normalizedInstitutionName) {
        throw createError(400, "Institution name is required");
    }

    if (!INSTITUTION_TYPES.includes(normalizedInstitutionType)) {
        throw createError(400, "Invalid institution type");
    }

    const existingUser = await User.findOne({ email: normalizedEmail }).select("_id").lean();
    if (existingUser) {
        throw createError(409, "Email is already in use");
    }

    const configuredRounds = Number(process.env.BCRYPT_SALT_ROUNDS);
    const saltRounds = Number.isInteger(configuredRounds) && configuredRounds > 0
        ? configuredRounds
        : DEFAULT_SALT_ROUNDS;

    const passwordHash = await bcrypt.hash(normalizedPassword, saltRounds);

    const user = await User.create({ email: normalizedEmail, passwordHash });

    let institution = null;
    let membership = null;
    try {
        institution = await Institution.create({
            name: normalizedInstitutionName,
            type: normalizedInstitutionType,
            ownerUserId: user._id,
        });

        membership = await Membership.create({
            userId: user._id,
            institutionId: institution._id,
            role: "admin",
            status: "active",
        });

        await createAndSendOtp({
            email: normalizedEmail,
            purpose: SIGNUP_OTP_PURPOSE,
            userId: user._id,
        });
    } catch (error) {
        if (membership?._id) {
            await Membership.deleteOne({ _id: membership._id });
        }
        if (institution?._id) {
            await Institution.deleteOne({ _id: institution._id });
        }
        await OtpCode.deleteMany({
            userId: user._id,
            purpose: SIGNUP_OTP_PURPOSE,
            consumedAt: null,
        });
        await User.deleteOne({ _id: user._id });
        throw createError(500, "Failed to create account");
    }

    return {
        accessToken: signAccessToken(user._id),
        user: toSafeUser(user),
        institution: {
            id: institution._id.toString(),
            name: institution.name,
            type: institution.type,
        },
        membership: {
            role: "admin",
            status: "active",
        },
        message: "Account created. Check your email for the OTP code.",
    };
}

async function login({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedPassword = normalizePassword(password);

    validateCredentials({
        email: normalizedEmail,
        password: normalizedPassword,
    });

    const user = await User.findOne({ email: normalizedEmail })
        .select("_id email passwordHash status isEmailVerified mustChangePassword")
        .lean();

    if (!user) {
        throw createError(401, "Invalid email or password");
    }

    if (user.status !== "active") {
        throw createError(403, "Account is not active");
    }

    if (!user.isEmailVerified) {
        throw createError(403, "Email is not verified. Check your email for the OTP code.");
    }

    const isPasswordValid = await bcrypt.compare(normalizedPassword, user.passwordHash);
    if (!isPasswordValid) {
        throw createError(401, "Invalid email or password");
    }

    return {
        accessToken: signAccessToken(user._id),
        user: toSafeUser(user),
    };
}

async function resendSignupOtp(authUser) {
    const userId = authUser?.id;
    if (!userId) {
        throw createError(401, "Unauthorized");
    }

    const user = await User.findById(userId).select("_id email status isEmailVerified mustChangePassword").lean();
    if (!user) {
        throw createError(401, "Unauthorized");
    }

    if (user.status !== "active") {
        throw createError(403, "Account is not active");
    }

    if (user.isEmailVerified) {
        throw createError(409, "Email is already verified");
    }

    await createAndSendOtp({
        email: user.email,
        purpose: SIGNUP_OTP_PURPOSE,
        userId: user._id,
    });

    return {
        message: "OTP resent. Check your email for the code.",
    };
}

async function verifySignupOtp(authUser, code) {
    const userId = authUser?.id;
    if (!userId) {
        throw createError(401, "Unauthorized");
    }

    const normalizedCode = normalizeOtpCode(code);
    if (!/^\d{6}$/.test(normalizedCode)) {
        throw createError(400, "Invalid OTP code format");
    }

    const user = await User.findById(userId).select("_id email status isEmailVerified mustChangePassword").lean();
    if (!user) {
        throw createError(401, "Unauthorized");
    }

    if (user.status !== "active") {
        throw createError(403, "Account is not active");
    }

    if (user.isEmailVerified) {
        return {
            message: "Email already verified.",
            user: toSafeUser(user),
        };
    }

    const otpRecord = await OtpCode.findOne({
        userId: user._id,
        email: user.email,
        purpose: SIGNUP_OTP_PURPOSE,
        consumedAt: null,
    })
        .sort({ createdAt: -1 })
        .lean();

    if (!otpRecord) {
        throw createError(400, "OTP not found or expired. Please resend OTP.");
    }

    if (otpRecord.expiresAt && new Date(otpRecord.expiresAt) <= new Date()) {
        await OtpCode.deleteOne({ _id: otpRecord._id });
        throw createError(400, "OTP expired. Please resend OTP.");
    }

    const maxAttempts = parsePositiveInteger(process.env.OTP_MAX_ATTEMPTS, DEFAULT_OTP_MAX_ATTEMPTS);
    if (otpRecord.attempts >= maxAttempts) {
        await OtpCode.deleteOne({ _id: otpRecord._id });
        throw createError(429, "Too many invalid OTP attempts. Please resend OTP.");
    }

    const isValidCode = await bcrypt.compare(normalizedCode, otpRecord.codeHash);
    if (!isValidCode) {
        await OtpCode.updateOne({ _id: otpRecord._id }, { $inc: { attempts: 1 } });
        throw createError(400, "Invalid OTP code");
    }

    const consumedAt = new Date();
    await Promise.all([
        User.updateOne({ _id: user._id }, { $set: { isEmailVerified: true } }),
        OtpCode.updateMany(
            {
                userId: user._id,
                purpose: SIGNUP_OTP_PURPOSE,
                consumedAt: null,
            },
            { $set: { consumedAt } }
        ),
    ]);

    return {
        message: "Email verified successfully.",
        user: {
            id: user._id.toString(),
            email: user.email,
            status: user.status,
            isEmailVerified: true,
            mustChangePassword: Boolean(user.mustChangePassword),
        },
    };
}

async function forgotPassword({ email }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        throw createError(400, "Email is required");
    }

    if (!isValidEmail(normalizedEmail)) {
        throw createError(400, "Invalid email format");
    }

    const responseMessage = "If an account exists, check your email for the reset code.";
    const user = await User.findOne({ email: normalizedEmail })
        .select("_id email status isEmailVerified mustChangePassword")
        .lean();

    if (!user || user.status !== "active" || !user.isEmailVerified) {
        return { message: responseMessage };
    }

    await createAndSendOtp({
        email: user.email,
        purpose: RESET_PASSWORD_OTP_PURPOSE,
        userId: user._id,
    });

    return {
        message: responseMessage,
    };
}

async function resetPassword({ email, code, newPassword }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = normalizeOtpCode(code);
    const normalizedNewPassword = normalizePassword(newPassword);

    if (!normalizedEmail) {
        throw createError(400, "Email is required");
    }

    if (!isValidEmail(normalizedEmail)) {
        throw createError(400, "Invalid email format");
    }

    if (!/^\d{6}$/.test(normalizedCode)) {
        throw createError(400, "Invalid OTP code format");
    }

    if (!normalizedNewPassword) {
        throw createError(400, "New password is required");
    }

    if (normalizedNewPassword.length < 8) {
        throw createError(400, "Password must be at least 8 characters");
    }

    const user = await User.findOne({ email: normalizedEmail })
        .select("_id email status isEmailVerified passwordHash mustChangePassword")
        .lean();

    if (!user || user.status !== "active" || !user.isEmailVerified) {
        throw createError(400, "Invalid or expired OTP code");
    }

    const otpRecord = await OtpCode.findOne({
        userId: user._id,
        email: user.email,
        purpose: RESET_PASSWORD_OTP_PURPOSE,
        consumedAt: null,
    })
        .sort({ createdAt: -1 })
        .lean();

    if (!otpRecord) {
        throw createError(400, "Invalid or expired OTP code");
    }

    if (otpRecord.expiresAt && new Date(otpRecord.expiresAt) <= new Date()) {
        await OtpCode.deleteOne({ _id: otpRecord._id });
        throw createError(400, "Invalid or expired OTP code");
    }

    const maxAttempts = parsePositiveInteger(process.env.OTP_MAX_ATTEMPTS, DEFAULT_OTP_MAX_ATTEMPTS);
    if (otpRecord.attempts >= maxAttempts) {
        await OtpCode.deleteOne({ _id: otpRecord._id });
        throw createError(429, "Too many invalid OTP attempts. Please request a new code.");
    }

    const isValidCode = await bcrypt.compare(normalizedCode, otpRecord.codeHash);
    if (!isValidCode) {
        await OtpCode.updateOne({ _id: otpRecord._id }, { $inc: { attempts: 1 } });
        throw createError(400, "Invalid or expired OTP code");
    }

    const isSamePassword = await bcrypt.compare(normalizedNewPassword, user.passwordHash);
    if (isSamePassword) {
        throw createError(400, "New password must be different from current password");
    }

    const configuredRounds = Number(process.env.BCRYPT_SALT_ROUNDS);
    const saltRounds = Number.isInteger(configuredRounds) && configuredRounds > 0
        ? configuredRounds
        : DEFAULT_SALT_ROUNDS;
    const newPasswordHash = await bcrypt.hash(normalizedNewPassword, saltRounds);
    const consumedAt = new Date();

    await Promise.all([
        User.updateOne({ _id: user._id }, { $set: { passwordHash: newPasswordHash } }),
        OtpCode.updateMany(
            {
                userId: user._id,
                purpose: RESET_PASSWORD_OTP_PURPOSE,
                consumedAt: null,
            },
            { $set: { consumedAt } }
        ),
    ]);

    return {
        message: "Password reset successful. You can now login.",
    };
}

module.exports = {
    signup,
    login,
    resendSignupOtp,
    verifySignupOtp,
    forgotPassword,
    resetPassword,
};
