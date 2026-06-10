#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const ClassLevel = require("../src/models/ClassLevel");
const Department = require("../src/models/Department");
const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");
const SchoolClass = require("../src/models/SchoolClass");
const Section = require("../src/models/Section");

function idOf(record) {
    return record?._id ? record._id.toString() : "";
}

async function findOne(model, query, sort = { createdAt: 1, _id: 1 }) {
    return model.findOne(query).sort(sort).select("_id userId institutionId role status ownerUserId name").lean();
}

async function main() {
    if (!process.env.MONGO_URI) {
        console.error("MONGO_URI is not configured. Set it in .env or your shell before running this helper.");
        process.exitCode = 1;
        return;
    }

    await mongoose.connect(process.env.MONGO_URI);

    try {
        const institution = await findOne(Institution, { status: "active" });
        const institutionId = idOf(institution);
        const otherInstitution = institutionId
            ? await findOne(Institution, { _id: { $ne: institutionId }, status: "active" })
            : null;
        const otherInstitutionId = idOf(otherInstitution);

        const adminMembership = institutionId
            ? await findOne(Membership, { institutionId, role: "admin", status: "active" })
            : null;
        const instructorMembership = institutionId
            ? await findOne(Membership, { institutionId, role: "instructor", status: "active" })
            : null;
        const studentMembership = institutionId
            ? await findOne(Membership, { institutionId, role: "student", status: "active" })
            : null;
        const inactiveInstructorMembership = institutionId
            ? await findOne(Membership, { institutionId, role: "instructor", status: { $ne: "active" } })
            : null;
        const crossTenantInstructorMembership = otherInstitutionId
            ? await findOne(Membership, {
                institutionId: otherInstitutionId,
                role: "instructor",
                status: "active",
            })
            : null;

        const department = institutionId ? await findOne(Department, { institutionId }) : null;
        const otherDepartment = otherInstitutionId ? await findOne(Department, { institutionId: otherInstitutionId }) : null;
        const classLevel = institutionId ? await findOne(ClassLevel, { institutionId }) : null;
        const schoolClass = institutionId ? await findOne(SchoolClass, { institutionId }) : null;
        const section = institutionId ? await findOne(Section, { institutionId }) : null;
        const otherInstitutionSection = otherInstitutionId
            ? await findOne(Section, { institutionId: otherInstitutionId })
            : null;

        const output = {
            baseUrl: "http://localhost:5000",
            adminToken: "",
            ownerToken: "",
            instructorToken: "",
            studentToken: "",
            institutionId,
            otherInstitutionId,
            targetInstructorUserId: idOf(instructorMembership?.userId ? { _id: instructorMembership.userId } : null),
            targetStudentUserId: idOf(studentMembership?.userId ? { _id: studentMembership.userId } : null),
            targetAdminUserId: idOf(adminMembership?.userId ? { _id: adminMembership.userId } : null),
            inactiveInstructorUserId: idOf(
                inactiveInstructorMembership?.userId ? { _id: inactiveInstructorMembership.userId } : null
            ),
            crossTenantInstructorUserId: idOf(
                crossTenantInstructorMembership?.userId ? { _id: crossTenantInstructorMembership.userId } : null
            ),
            departmentId: idOf(department),
            otherDepartmentId: idOf(otherDepartment),
            classLevelId: idOf(classLevel),
            schoolClassId: idOf(schoolClass),
            sectionId: idOf(section),
            otherInstitutionSectionId: idOf(otherInstitutionSection),
        };

        console.log(JSON.stringify(output, null, 2));
    } finally {
        await mongoose.disconnect();
    }
}

main().catch(async (error) => {
    console.error(error.message);
    try {
        await mongoose.disconnect();
    } catch (_) {
        // Ignore disconnect errors while reporting the original failure.
    }
    process.exitCode = 1;
});
