const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadDir = path.join(__dirname, "..", "..", "uploads", "member-profiles");
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function ensureUploadDir() {
    fs.mkdirSync(uploadDir, { recursive: true });
}

function getMaxProfilePictureSizeBytes() {
    const maxProfilePictureSizeMb = Number(process.env.MAX_PROFILE_PICTURE_SIZE_MB);
    if (Number.isFinite(maxProfilePictureSizeMb) && maxProfilePictureSizeMb > 0) {
        return Math.floor(maxProfilePictureSizeMb * 1024 * 1024);
    }

    return 2 * 1024 * 1024;
}

function createInvalidTypeError() {
    const error = new Error("Only JPG, PNG, and WEBP images are allowed");
    error.statusCode = 400;
    return error;
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        try {
            ensureUploadDir();
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (_req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const safeExtension = allowedExtensions.has(extension) ? extension : "";
        const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExtension}`;
        cb(null, uniqueName);
    },
});

const uploader = multer({
    storage,
    limits: {
        fileSize: getMaxProfilePictureSizeBytes(),
    },
    fileFilter: (_req, file, cb) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            return cb(createInvalidTypeError());
        }

        return cb(null, true);
    },
});

function uploadMemberProfilePicture(req, res, next) {
    uploader.single("profilePicture")(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error instanceof multer.MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                const maxMb = Math.round(getMaxProfilePictureSizeBytes() / (1024 * 1024));
                return res.status(400).json({ message: `Profile picture size exceeds ${maxMb}MB limit` });
            }

            return res.status(400).json({ message: error.message });
        }

        if (Number.isInteger(error.statusCode)) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        return next(error);
    });
}

module.exports = uploadMemberProfilePicture;
