const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadDir = path.join(__dirname, "..", "..", "uploads", "institution-logos");
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function ensureUploadDir() {
    fs.mkdirSync(uploadDir, { recursive: true });
}

function getMaxLogoSizeBytes() {
    const maxLogoSizeMb = Number(process.env.MAX_LOGO_SIZE_MB);
    if (Number.isFinite(maxLogoSizeMb) && maxLogoSizeMb > 0) {
        return Math.floor(maxLogoSizeMb * 1024 * 1024);
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
        fileSize: getMaxLogoSizeBytes(),
    },
    fileFilter: (_req, file, cb) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            return cb(createInvalidTypeError());
        }

        return cb(null, true);
    },
});

function uploadInstitutionLogo(req, res, next) {
    uploader.single("logo")(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error instanceof multer.MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                const maxMb = Math.round(getMaxLogoSizeBytes() / (1024 * 1024));
                return res.status(400).json({ message: `Logo size exceeds ${maxMb}MB limit` });
            }

            return res.status(400).json({ message: error.message });
        }

        if (Number.isInteger(error.statusCode)) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        return next(error);
    });
}

module.exports = uploadInstitutionLogo;
