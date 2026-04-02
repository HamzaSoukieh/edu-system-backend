const mongoose = require("mongoose");

const schoolClassSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
            required: true,
            index: true,
        },
        classLevelId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassLevel",
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        nameNormalized: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        code: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        status: {
            type: String,
            enum: ["active", "archived"],
            default: "active",
            index: true,
        },
        createdByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

schoolClassSchema.index({ institutionId: 1, code: 1 }, { unique: true });
schoolClassSchema.index({ institutionId: 1, classLevelId: 1, nameNormalized: 1 }, { unique: true });
schoolClassSchema.index({ institutionId: 1, classLevelId: 1, status: 1 });

module.exports = mongoose.model("SchoolClass", schoolClassSchema);
