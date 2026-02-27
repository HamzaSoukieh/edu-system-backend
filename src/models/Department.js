const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
    {
        institutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Institution",
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
        description: {
            type: String,
            trim: true,
            default: null,
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

departmentSchema.index({ institutionId: 1, code: 1 }, { unique: true });
departmentSchema.index({ institutionId: 1, nameNormalized: 1 }, { unique: true });
departmentSchema.index({ institutionId: 1, name: 1 });

module.exports = mongoose.model("Department", departmentSchema);
