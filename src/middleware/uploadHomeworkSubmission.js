const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadDir = path.join(__dirname, "..", "..", "storage", "homework-submissions");
const allowedMimeTypes = new Set(["application/pdf"]);
const allowedExtensions = new Set([".pdf"]);

function ensureUploadDir() {
    fs.mkdirSync(uploadDir, { recursive: true });
}

function getMaxHomeworkSubmissionSizeBytes() {
    const maxSizeMb = Number(process.env.MAX_HOMEWORK_SUBMISSION_SIZE_MB);
    if (Number.isFinite(maxSizeMb) && maxSizeMb > 0) {
        return Math.floor(maxSizeMb * 1024 * 1024);
    }

    return 10 * 1024 * 1024;
}

function createInvalidTypeError() {
    const error = new Error("Only PDF files are allowed");
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
        const safeExtension = allowedExtensions.has(extension) ? extension : ".pdf";
        const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExtension}`;
        cb(null, uniqueName);
    },
});

const uploader = multer({
    storage,
    limits: {
        fileSize: getMaxHomeworkSubmissionSizeBytes(),
    },
    fileFilter: (_req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(extension)) {
            return cb(createInvalidTypeError());
        }

        return cb(null, true);
    },
});

function uploadHomeworkSubmission(req, res, next) {
    uploader.single("submissionFile")(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error instanceof multer.MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                const maxMb = Math.round(getMaxHomeworkSubmissionSizeBytes() / (1024 * 1024));
                return res.status(400).json({ message: `Homework submission file size exceeds ${maxMb}MB limit` });
            }

            return res.status(400).json({ message: error.message });
        }

        if (Number.isInteger(error.statusCode)) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        return next(error);
    });
}

module.exports = uploadHomeworkSubmission;
