const mongoose = require("mongoose");

const SECTION_MATERIAL_TYPES = ["lecture_pdf", "note_pdf", "resource_pdf"];
const SECTION_MATERIAL_SOURCE_TYPES = ["file"];
const SECTION_MATERIAL_STATUSES = ["draft", "published", "archived"];

const sectionMaterialSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            index: true,
        },
        sectionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Section",
            required: true,
            index: true,
        },
        sectionSessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SectionSession",
            default: null,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        titleNormalized: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
        materialType: {
            type: String,
            enum: SECTION_MATERIAL_TYPES,
            required: true,
            index: true,
        },
        sourceType: {
            type: String,
            enum: SECTION_MATERIAL_SOURCE_TYPES,
            default: "file",
            required: true,
        },
        fileKey: {
            type: String,
            trim: true,
            default: null,
        },
        originalFilename: {
            type: String,
            trim: true,
            default: null,
        },
        mimeType: {
            type: String,
            trim: true,
            default: null,
        },
        sizeBytes: {
            type: Number,
            default: null,
            min: 0,
        },
        status: {
            type: String,
            enum: SECTION_MATERIAL_STATUSES,
            default: "draft",
            required: true,
            index: true,
        },
        uploadedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        publishedAt: {
            type: Date,
            default: null,
        },
        archivedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

sectionMaterialSchema.index({ institutionId: 1, sectionId: 1, status: 1 });
sectionMaterialSchema.index({ institutionId: 1, sectionId: 1, sectionSessionId: 1 });
sectionMaterialSchema.index({ institutionId: 1, sectionId: 1, titleNormalized: 1 });
sectionMaterialSchema.index({ institutionId: 1, uploadedByUserId: 1 });

sectionMaterialSchema.pre("validate", function requireFileMetadata() {
    if (this.sourceType !== "file") {
        return;
    }

    if (!this.fileKey || !this.originalFilename || !this.mimeType || this.sizeBytes === null) {
        throw new Error("File section materials require file metadata");
    }
});

module.exports = mongoose.model("SectionMaterial", sectionMaterialSchema);
