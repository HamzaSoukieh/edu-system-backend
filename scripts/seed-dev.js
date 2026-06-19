#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const AcademicYear = require("../src/models/AcademicYear");
const Assessment = require("../src/models/Assessment");
const AssessmentResult = require("../src/models/AssessmentResult");
const AttendanceRecord = require("../src/models/AttendanceRecord");
const ClassLevel = require("../src/models/ClassLevel");
const ClassStudentAssignment = require("../src/models/ClassStudentAssignment");
const Department = require("../src/models/Department");
const Enrollment = require("../src/models/Enrollment");
const Homework = require("../src/models/Homework");
const HomeworkSubmission = require("../src/models/HomeworkSubmission");
const Institution = require("../src/models/Institution");
const InstitutionAcademicPolicy = require("../src/models/InstitutionAcademicPolicy");
const InstitutionBillingProfile = require("../src/models/InstitutionBillingProfile");
const MemberProfile = require("../src/models/MemberProfile");
const Membership = require("../src/models/Membership");
const ResponsibilityAssignment = require("../src/models/ResponsibilityAssignment");
const SchoolAcademicPolicy = require("../src/models/SchoolAcademicPolicy");
const SchoolClass = require("../src/models/SchoolClass");
const SchoolFinalOutcome = require("../src/models/SchoolFinalOutcome");
const Section = require("../src/models/Section");
const SectionMaterial = require("../src/models/SectionMaterial");
const SectionSession = require("../src/models/SectionSession");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");
const User = require("../src/models/User");

const DEMO_PASSWORD = "Password123!";
const DEMO_INSTITUTION_NAME = "Demo University";
const DEMO_INSTITUTION_TYPE = "university";
const SCHOOL_DEMO_INSTITUTION_NAME = "Demo School";
const SCHOOL_DEMO_INSTITUTION_TYPE = "school";
const OUTPUT_FILE = path.resolve(__dirname, "seed-output", "frontend-demo-data.json");

const DEMO_USERS = [
    { key: "owner", email: "owner@example.test", role: "admin", firstName: "Olivia", lastName: "Owner" },
    { key: "admin", email: "admin@example.test", role: "admin", firstName: "Adam", lastName: "Admin" },
    { key: "instructor", email: "instructor@example.test", role: "instructor", firstName: "Iris", lastName: "Instructor" },
    { key: "coordinator", email: "coordinator@example.test", role: "instructor", firstName: "Cora", lastName: "Coordinator" },
    { key: "head", email: "head@example.test", role: "instructor", firstName: "Hassan", lastName: "Head" },
    { key: "mentor", email: "mentor@example.test", role: "instructor", firstName: "Maya", lastName: "Mentor" },
    { key: "student1", email: "student1@example.test", role: "student", firstName: "Sam", lastName: "Strong" },
    { key: "student2", email: "student2@example.test", role: "student", firstName: "Wendy", lastName: "Warning" },
    { key: "student3", email: "student3@example.test", role: "student", firstName: "Rami", lastName: "Risk" },
];

const SCHOOL_DEMO_USERS = [
    { key: "schoolOwner", email: "school.owner@example.test", role: "admin", firstName: "Nadia", lastName: "Principal", gender: "female", birthDate: "1982-03-18" },
    { key: "schoolAdmin", email: "school.admin@example.test", role: "admin", firstName: "Omar", lastName: "Registrar", gender: "male", birthDate: "1986-11-02" },
    { key: "schoolMathTeacher", email: "school.math.teacher@example.test", role: "instructor", firstName: "Lina", lastName: "Haddad", gender: "female", birthDate: "1990-04-12" },
    { key: "schoolScienceTeacher", email: "school.science.teacher@example.test", role: "instructor", firstName: "Karim", lastName: "Mansour", gender: "male", birthDate: "1989-08-25" },
    { key: "schoolStudentA", email: "school.student.aya@example.test", role: "student", firstName: "Aya", lastName: "Saleh", gender: "female", birthDate: "2013-02-10" },
    { key: "schoolStudentB", email: "school.student.yousef@example.test", role: "student", firstName: "Yousef", lastName: "Darwish", gender: "male", birthDate: "2013-07-04" },
    { key: "schoolStudentC", email: "school.student.mira@example.test", role: "student", firstName: "Mira", lastName: "Risk", gender: "female", birthDate: "2013-12-19" },
    { key: "schoolStudentD", email: "school.student.khaled@example.test", role: "student", firstName: "Khaled", lastName: "Review", gender: "male", birthDate: "2013-05-22" },
    { key: "schoolStudentE", email: "school.student.nour@example.test", role: "student", firstName: "Nour", lastName: "GradeEight", gender: "female", birthDate: "2012-09-15" },
];

const DEMO_DEPARTMENTS = [
    { key: "computerScience", code: "DEMO-CS", name: "Demo Computer Science" },
    { key: "mathematics", code: "DEMO-MATH", name: "Demo Mathematics" },
];

const DEMO_SUBJECTS = [
    {
        key: "introProgramming",
        departmentKey: "computerScience",
        code: "DEMO-CS101",
        name: "Introduction to Programming",
        creditHours: 3,
    },
    {
        key: "calculus",
        departmentKey: "mathematics",
        code: "DEMO-MATH201",
        name: "Applied Calculus",
        creditHours: 3,
    },
];

const DEMO_SECTIONS = [
    {
        key: "programmingA",
        subjectKey: "introProgramming",
        code: "DEMO-CS101-A",
        title: "Intro Programming A",
        room: "LAB-101",
        scheduleDay: "wednesday",
        startTime: "09:00",
        endTime: "10:30",
    },
    {
        key: "calculusA",
        subjectKey: "calculus",
        code: "DEMO-MATH201-A",
        title: "Applied Calculus A",
        room: "ROOM-204",
        scheduleDay: "friday",
        startTime: "11:00",
        endTime: "12:30",
    },
];

const SESSION_DATES = [
    "2026-09-02",
    "2026-09-04",
    "2026-09-07",
    "2026-09-09",
    "2026-09-11",
];

const ASSESSMENTS = [
    { key: "quiz", title: "Demo Quiz 1", type: "quiz", assessmentDate: "2026-09-09", maxScore: 100, weight: 40 },
    { key: "midterm", title: "Demo Midterm", type: "midterm", assessmentDate: "2026-09-16", maxScore: 100, weight: 60 },
];

const HOMEWORKS = [
    {
        key: "offline",
        title: "Demo Offline Worksheet",
        titleNormalized: "demo offline worksheet",
        submissionMode: "offline",
        dueAt: "2026-09-10T23:59:00.000Z",
    },
    {
        key: "online",
        title: "Demo Online PDF Upload",
        titleNormalized: "demo online pdf upload",
        submissionMode: "online_upload",
        dueAt: "2026-09-12T23:59:00.000Z",
    },
];

const MATERIALS = [
    { title: "Demo Published Lecture PDF", titleNormalized: "demo published lecture pdf", status: "published" },
    { title: "Demo Draft Study Notes", titleNormalized: "demo draft study notes", status: "draft" },
    { title: "Demo Archived Reference", titleNormalized: "demo archived reference", status: "archived" },
];

const SCHOOL_CLASS_LEVELS = [
    { key: "grade7", code: "DEMO-G7", name: "Demo Grade 7", description: "Lower secondary demo class level." },
    { key: "grade8", code: "DEMO-G8", name: "Demo Grade 8", description: "Upper demo class level for cross-level UI states." },
];

const SCHOOL_CLASSES = [
    { key: "grade7A", classLevelKey: "grade7", code: "DEMO-G7A", name: "Demo Grade 7 A" },
    { key: "grade8A", classLevelKey: "grade8", code: "DEMO-G8A", name: "Demo Grade 8 A" },
];

const SCHOOL_SUBJECTS = [
    { key: "grade7Arabic", classLevelKey: "grade7", code: "DEMO-G7-ARB", name: "Arabic Language" },
    { key: "grade7Math", classLevelKey: "grade7", code: "DEMO-G7-MATH", name: "Mathematics" },
    { key: "grade7Science", classLevelKey: "grade7", code: "DEMO-G7-SCI", name: "General Science" },
    { key: "grade7SocialStudies", classLevelKey: "grade7", code: "DEMO-G7-SOC", name: "Social Studies" },
    { key: "grade8Math", classLevelKey: "grade8", code: "DEMO-G8-MATH", name: "Mathematics 8" },
];

const SCHOOL_SECTIONS = [
    {
        key: "grade7ArabicA",
        classKey: "grade7A",
        subjectKey: "grade7Arabic",
        instructorKey: "schoolScienceTeacher",
        code: "DEMO-G7-ARB-A",
        title: "Grade 7 Arabic A",
        room: "G7-201",
        scheduleDay: "sunday",
        startTime: "08:00",
        endTime: "08:45",
    },
    {
        key: "grade7MathA",
        classKey: "grade7A",
        subjectKey: "grade7Math",
        instructorKey: "schoolMathTeacher",
        code: "DEMO-G7-MATH-A",
        title: "Grade 7 Mathematics A",
        room: "G7-202",
        scheduleDay: "monday",
        startTime: "09:00",
        endTime: "09:45",
    },
    {
        key: "grade7ScienceA",
        classKey: "grade7A",
        subjectKey: "grade7Science",
        instructorKey: "schoolScienceTeacher",
        code: "DEMO-G7-SCI-A",
        title: "Grade 7 Science A",
        room: "LAB-S1",
        scheduleDay: "wednesday",
        startTime: "10:00",
        endTime: "10:45",
    },
    {
        key: "grade7SocialA",
        classKey: "grade7A",
        subjectKey: "grade7SocialStudies",
        instructorKey: "schoolScienceTeacher",
        code: "DEMO-G7-SOC-A",
        title: "Grade 7 Social Studies A",
        room: "G7-203",
        scheduleDay: "thursday",
        startTime: "11:00",
        endTime: "11:45",
    },
    {
        key: "grade8MathA",
        classKey: "grade8A",
        subjectKey: "grade8Math",
        instructorKey: "schoolMathTeacher",
        code: "DEMO-G8-MATH-A",
        title: "Grade 8 Mathematics A",
        room: "G8-101",
        scheduleDay: "tuesday",
        startTime: "09:00",
        endTime: "09:45",
    },
];

const SCHOOL_CLASS_ASSIGNMENTS = [
    { studentKey: "schoolStudentA", classKey: "grade7A" },
    { studentKey: "schoolStudentB", classKey: "grade7A" },
    { studentKey: "schoolStudentC", classKey: "grade7A" },
    { studentKey: "schoolStudentD", classKey: "grade7A" },
    { studentKey: "schoolStudentE", classKey: "grade8A" },
];

const SCHOOL_SESSION_DATES_BY_SECTION = {
    grade7MathA: ["2026-05-04", "2026-05-11", "2026-05-18", "2026-05-25"],
    grade7ScienceA: ["2026-05-06", "2026-05-13"],
};

const SCHOOL_ASSESSMENTS = [
    { key: "g7ArabicReading", sectionKey: "grade7ArabicA", title: "Reading Comprehension", type: "quiz", assessmentDate: "2026-05-10", maxScore: 100, weight: 100 },
    { key: "g7MathQuiz", sectionKey: "grade7MathA", title: "Fractions Quiz", type: "quiz", assessmentDate: "2026-05-18", maxScore: 100, weight: 40 },
    { key: "g7MathTerm", sectionKey: "grade7MathA", title: "Mathematics Term Test", type: "midterm", assessmentDate: "2026-06-01", maxScore: 100, weight: 60 },
    { key: "g7ScienceLab", sectionKey: "grade7ScienceA", title: "Lab Skills Check", type: "practical", assessmentDate: "2026-05-20", maxScore: 100, weight: 100 },
    { key: "g7SocialProject", sectionKey: "grade7SocialA", title: "Community Project", type: "project", assessmentDate: "2026-05-27", maxScore: 100, weight: 100 },
    { key: "g8MathQuiz", sectionKey: "grade8MathA", title: "Linear Equations Quiz", type: "quiz", assessmentDate: "2026-05-19", maxScore: 100, weight: 100 },
];

const SCHOOL_ASSESSMENT_SCORES = {
    g7ArabicReading: { schoolStudentA: 88, schoolStudentB: 82, schoolStudentC: 63, schoolStudentD: 80 },
    g7MathQuiz: { schoolStudentA: 94, schoolStudentB: 76, schoolStudentC: 42, schoolStudentD: 70 },
    g7MathTerm: { schoolStudentA: 92, schoolStudentB: 70, schoolStudentC: 38, schoolStudentD: 65 },
    g7ScienceLab: { schoolStudentA: 90, schoolStudentB: 74, schoolStudentC: 52, schoolStudentD: null },
    g7SocialProject: { schoolStudentA: 91, schoolStudentB: 78, schoolStudentC: 58, schoolStudentD: 72 },
    g8MathQuiz: { schoolStudentE: 81 },
};

const SCHOOL_HOMEWORKS = [
    {
        key: "g7MathOffline",
        sectionKey: "grade7MathA",
        title: "Fractions Practice Sheet",
        titleNormalized: "fractions practice sheet",
        submissionMode: "offline",
        dueAt: "2026-05-22T14:00:00.000Z",
    },
    {
        key: "g7ScienceOnline",
        sectionKey: "grade7ScienceA",
        title: "Plant Cell Observation PDF",
        titleNormalized: "plant cell observation pdf",
        submissionMode: "online_upload",
        dueAt: "2026-05-24T20:00:00.000Z",
    },
];

const SCHOOL_MATERIALS = [
    { sectionKey: "grade7MathA", title: "Fractions Lesson Notes", titleNormalized: "fractions lesson notes", materialType: "note_pdf", status: "published" },
    { sectionKey: "grade7ScienceA", title: "Plant Cell Lab Guide", titleNormalized: "plant cell lab guide", materialType: "lecture_pdf", status: "published" },
    { sectionKey: "grade7MathA", title: "Extension Problems Draft", titleNormalized: "extension problems draft", materialType: "resource_pdf", status: "draft" },
];

const TENANT_MODELS = [
    AcademicYear,
    Assessment,
    AssessmentResult,
    AttendanceRecord,
    ClassLevel,
    ClassStudentAssignment,
    Department,
    Enrollment,
    Homework,
    HomeworkSubmission,
    InstitutionAcademicPolicy,
    InstitutionBillingProfile,
    MemberProfile,
    Membership,
    ResponsibilityAssignment,
    SchoolAcademicPolicy,
    SchoolClass,
    SchoolFinalOutcome,
    Section,
    SectionMaterial,
    SectionSession,
    Semester,
    Subject,
];

function normalizeEmail(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeName(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeNameKey(value) {
    return normalizeName(value).toLowerCase();
}

function dateOnly(value) {
    return new Date(`${value}T00:00:00.000Z`);
}

function idOf(record) {
    return record?._id ? record._id.toString() : "";
}

function getDatabaseNameFromUri(uri) {
    if (!uri || typeof uri !== "string") {
        return "";
    }

    try {
        const parsed = new URL(uri);
        return decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] || "");
    } catch (_error) {
        const withoutQuery = uri.split("?")[0];
        const slashIndex = withoutQuery.lastIndexOf("/");
        return slashIndex >= 0 ? withoutQuery.slice(slashIndex + 1) : "";
    }
}

function looksLikeLocalDatabaseName(databaseName) {
    const name = normalizeNameKey(databaseName);
    if (!name) {
        return false;
    }

    return (
        name.includes("local") ||
        name.includes("dev") ||
        name.includes("test") ||
        name.includes("demo") ||
        name.includes("seed") ||
        name === "edu-system" ||
        name === "edu-saas-local"
    );
}

function assertNotProduction() {
    if (normalizeNameKey(process.env.NODE_ENV) === "production") {
        throw new Error("Refusing to run dev seed when NODE_ENV=production.");
    }
}

function parseArgs(argv) {
    return {
        reset: argv.includes("--reset"),
    };
}

function getSaltRounds() {
    const configuredRounds = Number(process.env.BCRYPT_SALT_ROUNDS);
    return Number.isInteger(configuredRounds) && configuredRounds > 0 ? configuredRounds : 10;
}

async function upsertOne(Model, filter, set, setOnInsert = {}) {
    const update = { $set: set };
    if (Object.keys(setOnInsert).length) {
        update.$setOnInsert = setOnInsert;
    }

    return Model.findOneAndUpdate(
        filter,
        update,
        {
            upsert: true,
            returnDocument: "after",
            runValidators: true,
            setDefaultsOnInsert: true,
        }
    );
}

async function seedUsers(demoUsers = DEMO_USERS) {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, getSaltRounds());
    const usersByKey = new Map();

    for (const demoUser of demoUsers) {
        const user = await upsertOne(
            User,
            { email: normalizeEmail(demoUser.email) },
            {
                passwordHash,
                isEmailVerified: true,
                mustChangePassword: false,
                status: "active",
            }
        );

        usersByKey.set(demoUser.key, user);
    }

    return usersByKey;
}

async function seedInstitution(ownerUser) {
    const institution = await upsertOne(
        Institution,
        {
            name: DEMO_INSTITUTION_NAME,
            type: DEMO_INSTITUTION_TYPE,
        },
        {
            ownerUserId: ownerUser._id,
            status: "active",
            policies: {
                warnAfterAbsences: 3,
                dropAfterAbsences: 5,
                lateToAbsenceRatio: 3,
                excusedCountsAsAbsence: false,
            },
        }
    );

    return institution;
}

async function seedSchoolInstitution(ownerUser) {
    const institution = await upsertOne(
        Institution,
        {
            name: SCHOOL_DEMO_INSTITUTION_NAME,
            type: SCHOOL_DEMO_INSTITUTION_TYPE,
        },
        {
            ownerUserId: ownerUser._id,
            status: "active",
            policies: {
                warnAfterAbsences: 2,
                dropAfterAbsences: 4,
                lateToAbsenceRatio: 3,
                excusedCountsAsAbsence: false,
            },
        }
    );

    return institution;
}

async function seedMemberships({ institution, usersByKey, demoUsers = DEMO_USERS, ownerKey = "owner" }) {
    const membershipsByKey = new Map();
    const profilesByKey = new Map();

    for (const demoUser of demoUsers) {
        const user = usersByKey.get(demoUser.key);
        const membership = await upsertOne(
            Membership,
            {
                userId: user._id,
                institutionId: institution._id,
            },
            {
                role: demoUser.role,
                status: "active",
                invitedBy: usersByKey.get(ownerKey)._id,
            }
        );

        const fullName = `${demoUser.firstName} ${demoUser.lastName}`;
        const profile = await upsertOne(
            MemberProfile,
            {
                membershipId: membership._id,
                institutionId: institution._id,
            },
            {
                userId: user._id,
                firstName: demoUser.firstName,
                lastName: demoUser.lastName,
                fatherName: "Demo",
                motherName: "Example",
                birthPlace: "Demo City",
                birthDate: dateOnly(demoUser.birthDate || (demoUser.role === "student" ? "2004-01-15" : "1988-05-20")),
                gender: demoUser.gender || (demoUser.key === "student2" ? "female" : "male"),
                nationality: "Demo",
                nationalNumber: `DEMO-${demoUser.key.toUpperCase()}-001`,
                mobile: "+10000000000",
                profilePictureUrl: null,
                fullName,
                fullNameNormalized: normalizeNameKey(fullName),
            }
        );

        membershipsByKey.set(demoUser.key, membership);
        profilesByKey.set(demoUser.key, profile);
    }

    return { membershipsByKey, profilesByKey };
}

async function seedAcademicCalendar({ institution, ownerUserId }) {
    const academicYear = await upsertOne(
        AcademicYear,
        {
            institutionId: institution._id,
            nameNormalized: "demo academic year 2026-2027",
        },
        {
            name: "Demo Academic Year 2026-2027",
            startDate: dateOnly("2026-09-01"),
            endDate: dateOnly("2027-06-30"),
            status: "active",
            createdByUserId: ownerUserId,
            archivedAt: null,
        }
    );

    const semester = await upsertOne(
        Semester,
        {
            institutionId: institution._id,
            name: "Demo Fall 2026",
        },
        {
            academicYearId: academicYear._id,
            startDate: dateOnly("2026-09-01"),
            endDate: dateOnly("2026-12-20"),
            teachingDays: ["Monday", "Wednesday", "Friday"],
            calendarOverrides: [],
            examDates: [],
            weekCount: 16,
            status: "active",
            createdByUserId: ownerUserId,
        }
    );

    return { academicYear, semester };
}

async function seedDepartments({ institution, ownerUserId }) {
    const departmentsByKey = new Map();
    for (const departmentInput of DEMO_DEPARTMENTS) {
        const department = await upsertOne(
            Department,
            {
                institutionId: institution._id,
                code: departmentInput.code,
            },
            {
                name: departmentInput.name,
                nameNormalized: normalizeNameKey(departmentInput.name),
                code: departmentInput.code,
                description: "Local demo department for frontend testing.",
                status: "active",
                createdByUserId: ownerUserId,
            }
        );
        departmentsByKey.set(departmentInput.key, department);
    }
    return departmentsByKey;
}

async function seedSubjects({ institution, ownerUserId, departmentsByKey }) {
    const subjectsByKey = new Map();
    for (const subjectInput of DEMO_SUBJECTS) {
        const subject = await upsertOne(
            Subject,
            {
                institutionId: institution._id,
                code: subjectInput.code,
            },
            {
                departmentId: departmentsByKey.get(subjectInput.departmentKey)._id,
                classLevelId: null,
                name: subjectInput.name,
                nameNormalized: normalizeNameKey(subjectInput.name),
                code: subjectInput.code,
                creditHours: subjectInput.creditHours,
                prerequisiteSubjectIds: [],
                status: "active",
                createdByUserId: ownerUserId,
            }
        );
        subjectsByKey.set(subjectInput.key, subject);
    }
    return subjectsByKey;
}

async function seedSections({ institution, ownerUserId, semester, subjectsByKey, instructorMembership }) {
    const sectionsByKey = new Map();
    for (const sectionInput of DEMO_SECTIONS) {
        const section = await upsertOne(
            Section,
            {
                institutionId: institution._id,
                semesterId: semester._id,
                subjectId: subjectsByKey.get(sectionInput.subjectKey)._id,
                code: sectionInput.code,
            },
            {
                schoolClassId: null,
                title: sectionInput.title,
                instructorMemberId: instructorMembership._id,
                capacity: 30,
                schedule: [
                    {
                        sessionType: "lecture",
                        day: sectionInput.scheduleDay,
                        startTime: sectionInput.startTime,
                        endTime: sectionInput.endTime,
                        room: sectionInput.room,
                    },
                ],
                status: "active",
                createdByUserId: ownerUserId,
            }
        );
        sectionsByKey.set(sectionInput.key, section);
    }
    return sectionsByKey;
}

async function seedEnrollments({ institution, ownerUserId, sectionsByKey, membershipsByKey }) {
    const enrollmentsBySectionKey = new Map();
    const studentKeys = ["student1", "student2", "student3"];

    for (const [sectionKey, section] of sectionsByKey.entries()) {
        const enrollmentsByStudentKey = new Map();
        for (const studentKey of studentKeys) {
            const enrollment = await upsertOne(
                Enrollment,
                {
                    institutionId: institution._id,
                    sectionId: section._id,
                    studentMemberId: membershipsByKey.get(studentKey)._id,
                },
                {
                    status: "enrolled",
                    enrolledAt: dateOnly("2026-09-01"),
                    createdByUserId: ownerUserId,
                }
            );
            enrollmentsByStudentKey.set(studentKey, enrollment);
        }
        enrollmentsBySectionKey.set(sectionKey, enrollmentsByStudentKey);
    }

    return enrollmentsBySectionKey;
}

async function seedSessionsAndAttendance({ institution, ownerUserId, sectionsByKey, enrollmentsBySectionKey, membershipsByKey }) {
    const section = sectionsByKey.get("programmingA");
    const sessions = [];

    for (const [index, sessionDate] of SESSION_DATES.entries()) {
        const session = await upsertOne(
            SectionSession,
            {
                institutionId: institution._id,
                sectionId: section._id,
                sessionDate: dateOnly(sessionDate),
                startTime: "09:00",
                sessionType: "lecture",
            },
            {
                endTime: "10:30",
                room: "LAB-101",
                status: "completed",
                statusNote: "Seeded completed session",
                statusChangedAt: new Date(`${sessionDate}T10:45:00.000Z`),
                statusChangedByUserId: ownerUserId,
                attendanceState: "closed",
                attendanceOpenedAt: new Date(`${sessionDate}T08:55:00.000Z`),
                attendanceClosedAt: new Date(`${sessionDate}T10:45:00.000Z`),
                attendanceOpenedByUserId: ownerUserId,
                currentQrTokenHash: null,
                currentQrTokenExpiresAt: null,
                createdByUserId: ownerUserId,
            }
        );
        sessions.push(session);

        const statusesByStudent = {
            student1: "present",
            student2: index < 3 ? "absent" : "present",
            student3: "absent",
        };

        for (const studentKey of Object.keys(statusesByStudent)) {
            const enrollment = enrollmentsBySectionKey.get("programmingA").get(studentKey);
            await upsertOne(
                AttendanceRecord,
                {
                    institutionId: institution._id,
                    sectionSessionId: session._id,
                    enrollmentId: enrollment._id,
                },
                {
                    sectionId: section._id,
                    studentMemberId: membershipsByKey.get(studentKey)._id,
                    attendanceStatus: statusesByStudent[studentKey],
                    source: "manual",
                    checkedInAt: statusesByStudent[studentKey] === "present" ? new Date(`${sessionDate}T09:05:00.000Z`) : null,
                    note: "Seeded attendance demo",
                    recordedByUserId: ownerUserId,
                }
            );
        }
    }

    return sessions;
}

async function seedAssessments({ institution, ownerUserId, sectionsByKey, sessions, enrollmentsBySectionKey, membershipsByKey }) {
    const section = sectionsByKey.get("programmingA");
    const assessmentsByKey = new Map();
    const scores = {
        quiz: { student1: 95, student2: 72, student3: 45 },
        midterm: { student1: 90, student2: 64, student3: null },
    };

    for (const [index, assessmentInput] of ASSESSMENTS.entries()) {
        const assessment = await upsertOne(
            Assessment,
            {
                institutionId: institution._id,
                sectionId: section._id,
                title: assessmentInput.title,
            },
            {
                sectionSessionId: sessions[index]?._id || null,
                description: "Seeded published assessment for frontend grade views.",
                type: assessmentInput.type,
                assessmentDate: dateOnly(assessmentInput.assessmentDate),
                maxScore: assessmentInput.maxScore,
                weight: assessmentInput.weight,
                status: "published",
                publishedAt: new Date(`${assessmentInput.assessmentDate}T12:00:00.000Z`),
                publishedByUserId: ownerUserId,
                createdByUserId: ownerUserId,
            }
        );
        assessmentsByKey.set(assessmentInput.key, assessment);

        for (const studentKey of ["student1", "student2", "student3"]) {
            const enrollment = enrollmentsBySectionKey.get("programmingA").get(studentKey);
            await upsertOne(
                AssessmentResult,
                {
                    institutionId: institution._id,
                    assessmentId: assessment._id,
                    enrollmentId: enrollment._id,
                },
                {
                    sectionId: section._id,
                    studentMemberId: membershipsByKey.get(studentKey)._id,
                    score: scores[assessmentInput.key][studentKey],
                    note: scores[assessmentInput.key][studentKey] === null ? "Missing seeded result" : "Seeded result",
                    recordedByUserId: ownerUserId,
                }
            );
        }
    }

    return assessmentsByKey;
}

async function seedHomeworks({ institution, ownerUserId, sectionsByKey, sessions, enrollmentsBySectionKey, membershipsByKey }) {
    const section = sectionsByKey.get("programmingA");
    const homeworksByKey = new Map();

    for (const homeworkInput of HOMEWORKS) {
        const homework = await upsertOne(
            Homework,
            {
                institutionId: institution._id,
                sectionId: section._id,
                titleNormalized: homeworkInput.titleNormalized,
            },
            {
                sectionSessionId: sessions[0]?._id || null,
                assessmentId: null,
                title: homeworkInput.title,
                instructions: "Seeded homework for local frontend workflow testing.",
                type: "homework",
                dueAt: new Date(homeworkInput.dueAt),
                submissionMode: homeworkInput.submissionMode,
                allowLate: true,
                status: "assigned",
                createdByUserId: ownerUserId,
                archivedAt: null,
            }
        );
        homeworksByKey.set(homeworkInput.key, homework);
    }

    const offlineHomework = homeworksByKey.get("offline");
    const onlineHomework = homeworksByKey.get("online");
    const offlineSubmissions = [
        { studentKey: "student1", status: "submitted", submittedAt: "2026-09-09T15:00:00.000Z" },
        { studentKey: "student2", status: "late", submittedAt: "2026-09-11T08:30:00.000Z" },
        { studentKey: "student3", status: "missing", submittedAt: null },
    ];

    for (const submissionInput of offlineSubmissions) {
        const enrollment = enrollmentsBySectionKey.get("programmingA").get(submissionInput.studentKey);
        await upsertOne(
            HomeworkSubmission,
            {
                institutionId: institution._id,
                homeworkId: offlineHomework._id,
                enrollmentId: enrollment._id,
            },
            {
                sectionId: section._id,
                studentMemberId: membershipsByKey.get(submissionInput.studentKey)._id,
                submissionMethod: "offline",
                fileKey: null,
                originalFilename: null,
                mimeType: null,
                sizeBytes: null,
                submittedAt: submissionInput.submittedAt ? new Date(submissionInput.submittedAt) : null,
                status: submissionInput.status,
                studentNote: "",
                instructorFeedback: "Seeded offline submission state.",
                markedByUserId: ownerUserId,
            }
        );
    }

    const returnedEnrollment = enrollmentsBySectionKey.get("programmingA").get("student1");
    await upsertOne(
        HomeworkSubmission,
        {
            institutionId: institution._id,
            homeworkId: onlineHomework._id,
            enrollmentId: returnedEnrollment._id,
        },
        {
            sectionId: section._id,
            studentMemberId: membershipsByKey.get("student1")._id,
            submissionMethod: "online_upload",
            fileKey: "demo-online-upload-student1.pdf",
            originalFilename: "demo-online-upload-student1.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12345,
            submittedAt: new Date("2026-09-12T20:30:00.000Z"),
            status: "returned",
            studentNote: "Seeded online upload metadata only.",
            instructorFeedback: "Please revise the second answer.",
            markedByUserId: ownerUserId,
        }
    );

    return homeworksByKey;
}

async function seedMaterials({ institution, ownerUserId, sectionsByKey, sessions }) {
    const section = sectionsByKey.get("programmingA");
    const materials = [];
    for (const materialInput of MATERIALS) {
        const material = await upsertOne(
            SectionMaterial,
            {
                institutionId: institution._id,
                sectionId: section._id,
                titleNormalized: materialInput.titleNormalized,
            },
            {
                sectionSessionId: sessions[0]?._id || null,
                title: materialInput.title,
                description: "Seeded private material metadata. No public upload URL is created.",
                materialType: "lecture_pdf",
                sourceType: "file",
                fileKey: `${materialInput.titleNormalized.replace(/\s+/g, "-")}.pdf`,
                originalFilename: `${materialInput.titleNormalized.replace(/\s+/g, "-")}.pdf`,
                mimeType: "application/pdf",
                sizeBytes: 45678,
                status: materialInput.status,
                uploadedByUserId: ownerUserId,
                publishedAt: materialInput.status === "published" ? new Date("2026-09-02T12:00:00.000Z") : null,
                archivedAt: materialInput.status === "archived" ? new Date("2026-09-20T12:00:00.000Z") : null,
            }
        );
        materials.push(material);
    }
    return materials;
}

async function seedResponsibilities({ institution, usersByKey, departmentsByKey, sectionsByKey }) {
    const inputs = [
        {
            key: "headDepartment",
            userKey: "head",
            responsibilityType: "head",
            scopeType: "department",
            scopeId: departmentsByKey.get("computerScience")._id,
        },
        {
            key: "coordinatorDepartment",
            userKey: "coordinator",
            responsibilityType: "coordinator",
            scopeType: "department",
            scopeId: departmentsByKey.get("computerScience")._id,
        },
        {
            key: "mentorSection",
            userKey: "mentor",
            responsibilityType: "mentor",
            scopeType: "section",
            scopeId: sectionsByKey.get("programmingA")._id,
        },
    ];
    const assignmentsByKey = new Map();

    for (const input of inputs) {
        const assignment = await upsertOne(
            ResponsibilityAssignment,
            {
                institutionId: institution._id,
                userId: usersByKey.get(input.userKey)._id,
                responsibilityType: input.responsibilityType,
                scopeType: input.scopeType,
                scopeId: input.scopeId,
            },
            {
                permissions: [],
                startAt: null,
                endAt: null,
                isActive: true,
            }
        );
        assignmentsByKey.set(input.key, assignment);
    }

    return assignmentsByKey;
}

async function seedBillingProfile({ institution }) {
    const suffix = idOf(institution).slice(-8) || normalizeNameKey(institution.name).replace(/[^a-z0-9]+/g, "_");

    return upsertOne(
        InstitutionBillingProfile,
        {
            institutionId: institution._id,
        },
        {
            stripeCustomerId: `cus_demo_local_${suffix}`,
            stripeSubscriptionId: `sub_demo_local_${suffix}`,
            stripePriceId: "price_demo_local_pro_6_month",
            plan: "pro",
            billingInterval: "six_month",
            stripeProductId: "prod_demo_local_pro",
            status: "trialing",
            currentPeriodStart: new Date("2026-04-01T00:00:00.000Z"),
            currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
            cancelAtPeriodEnd: false,
            trialEnd: new Date("2026-09-15T00:00:00.000Z"),
        }
    );
}

async function seedUniversityPolicy({ institution, ownerUserId, semester }) {
    return upsertOne(
        InstitutionAcademicPolicy,
        {
            institutionId: institution._id,
            effectiveFromSemesterId: semester._id,
            status: "active",
        },
        {
            name: "Demo University Academic Policy",
            minimumEnrollmentCreditHours: 3,
            defaultMaxCreditHours: 18,
            overloadMinGpa: 3.2,
            overloadMaxCreditHours: 21,
            outcomeThresholds: {
                failedMaxPercentage: 49,
                improvableMinPercentage: 50,
                improvableMaxPercentage: 59,
                finalPassMinPercentage: 60,
            },
            gpaBands: [
                { minPercentage: 0, maxPercentage: 49, gradePoint: 0 },
                { minPercentage: 50, maxPercentage: 59, gradePoint: 1 },
                { minPercentage: 60, maxPercentage: 69, gradePoint: 2 },
                { minPercentage: 70, maxPercentage: 79, gradePoint: 3 },
                { minPercentage: 80, maxPercentage: 100, gradePoint: 4 },
            ],
            repeatPolicy: {
                enabled: true,
                gpaCalculationMethod: "best_attempt_only",
                earnedCreditsMethod: "count_once_per_subject",
                prerequisiteMethod: "best_passed_attempt",
                allowGradeImprovementRepeats: true,
                blockRepeatAfterFinalPass: true,
            },
            academicStandingRules: {
                enabled: true,
                bands: [
                    {
                        standing: "good_standing",
                        minCumulativeGpa: 2,
                        allowedToContinue: true,
                        requiresAdvisorReview: false,
                    },
                    {
                        standing: "academic_warning",
                        minCumulativeGpa: 1.7,
                        maxCumulativeGpaExclusive: 2,
                        allowedToContinue: true,
                        requiresAdvisorReview: false,
                    },
                    {
                        standing: "probation",
                        minCumulativeGpa: 1,
                        maxCumulativeGpaExclusive: 1.7,
                        allowedToContinue: true,
                        requiresAdvisorReview: true,
                    },
                    {
                        standing: "suspension",
                        maxCumulativeGpaExclusive: 1,
                        allowedToContinue: false,
                        requiresAdvisorReview: true,
                    },
                ],
                requireManualReviewIfIncompleteProfile: true,
                noOutcomeStanding: "no_standing_yet",
                allowManualReview: true,
            },
            createdByUserId: ownerUserId,
            updatedByUserId: ownerUserId,
        }
    );
}

async function seedSchoolAcademicCalendar({ institution, ownerUserId }) {
    const academicYear = await upsertOne(
        AcademicYear,
        {
            institutionId: institution._id,
            nameNormalized: "demo school academic year 2025-2026",
        },
        {
            name: "Demo School Academic Year 2025-2026",
            startDate: dateOnly("2025-09-01"),
            endDate: dateOnly("2026-06-30"),
            status: "active",
            createdByUserId: ownerUserId,
            archivedAt: null,
        }
    );

    const semester = await upsertOne(
        Semester,
        {
            institutionId: institution._id,
            name: "Demo School Spring 2026",
        },
        {
            academicYearId: academicYear._id,
            startDate: dateOnly("2026-02-01"),
            endDate: dateOnly("2026-06-30"),
            teachingDays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
            calendarOverrides: [
                { date: dateOnly("2026-04-12"), type: "off", reason: "Seeded school holiday" },
            ],
            examDates: [
                { date: dateOnly("2026-06-01"), type: "midterm", reason: "Seeded term assessment week" },
            ],
            weekCount: 18,
            status: "active",
            createdByUserId: ownerUserId,
        }
    );

    return { academicYear, semester };
}

async function seedSchoolClassLevels({ institution, ownerUserId }) {
    const classLevelsByKey = new Map();
    for (const classLevelInput of SCHOOL_CLASS_LEVELS) {
        const classLevel = await upsertOne(
            ClassLevel,
            {
                institutionId: institution._id,
                code: classLevelInput.code,
            },
            {
                name: classLevelInput.name,
                nameNormalized: normalizeNameKey(classLevelInput.name),
                code: classLevelInput.code,
                description: classLevelInput.description,
                status: "active",
                createdByUserId: ownerUserId,
            }
        );
        classLevelsByKey.set(classLevelInput.key, classLevel);
    }
    return classLevelsByKey;
}

async function seedSchoolClasses({ institution, ownerUserId, classLevelsByKey }) {
    const schoolClassesByKey = new Map();
    for (const schoolClassInput of SCHOOL_CLASSES) {
        const schoolClass = await upsertOne(
            SchoolClass,
            {
                institutionId: institution._id,
                code: schoolClassInput.code,
            },
            {
                classLevelId: classLevelsByKey.get(schoolClassInput.classLevelKey)._id,
                name: schoolClassInput.name,
                nameNormalized: normalizeNameKey(schoolClassInput.name),
                code: schoolClassInput.code,
                status: "active",
                createdByUserId: ownerUserId,
            }
        );
        schoolClassesByKey.set(schoolClassInput.key, schoolClass);
    }
    return schoolClassesByKey;
}

async function seedSchoolSubjects({ institution, ownerUserId, classLevelsByKey }) {
    const subjectsByKey = new Map();
    for (const subjectInput of SCHOOL_SUBJECTS) {
        const subject = await upsertOne(
            Subject,
            {
                institutionId: institution._id,
                code: subjectInput.code,
            },
            {
                departmentId: null,
                classLevelId: classLevelsByKey.get(subjectInput.classLevelKey)._id,
                name: subjectInput.name,
                nameNormalized: normalizeNameKey(subjectInput.name),
                code: subjectInput.code,
                creditHours: null,
                prerequisiteSubjectIds: [],
                status: "active",
                createdByUserId: ownerUserId,
            }
        );
        subjectsByKey.set(subjectInput.key, subject);
    }
    return subjectsByKey;
}

async function seedSchoolSections({ institution, ownerUserId, semester, subjectsByKey, schoolClassesByKey, membershipsByKey }) {
    const sectionsByKey = new Map();
    for (const sectionInput of SCHOOL_SECTIONS) {
        const section = await upsertOne(
            Section,
            {
                institutionId: institution._id,
                semesterId: semester._id,
                subjectId: subjectsByKey.get(sectionInput.subjectKey)._id,
                code: sectionInput.code,
            },
            {
                schoolClassId: schoolClassesByKey.get(sectionInput.classKey)._id,
                title: sectionInput.title,
                instructorMemberId: membershipsByKey.get(sectionInput.instructorKey)._id,
                capacity: 28,
                schedule: [
                    {
                        sessionType: "lecture",
                        day: sectionInput.scheduleDay,
                        startTime: sectionInput.startTime,
                        endTime: sectionInput.endTime,
                        room: sectionInput.room,
                    },
                ],
                status: "active",
                createdByUserId: ownerUserId,
            }
        );
        sectionsByKey.set(sectionInput.key, section);
    }
    return sectionsByKey;
}

async function seedSchoolClassAssignments({ institution, ownerUserId, semester, schoolClassesByKey, membershipsByKey }) {
    const classAssignmentsByStudentKey = new Map();
    for (const assignmentInput of SCHOOL_CLASS_ASSIGNMENTS) {
        const assignment = await upsertOne(
            ClassStudentAssignment,
            {
                institutionId: institution._id,
                semesterId: semester._id,
                studentMemberId: membershipsByKey.get(assignmentInput.studentKey)._id,
            },
            {
                classId: schoolClassesByKey.get(assignmentInput.classKey)._id,
                status: "assigned",
                createdByUserId: ownerUserId,
            }
        );
        classAssignmentsByStudentKey.set(assignmentInput.studentKey, assignment);
    }
    return classAssignmentsByStudentKey;
}

function getSchoolStudentKeysForSection(sectionInput) {
    return SCHOOL_CLASS_ASSIGNMENTS
        .filter((assignment) => assignment.classKey === sectionInput.classKey)
        .map((assignment) => assignment.studentKey);
}

async function seedSchoolEnrollments({ institution, ownerUserId, sectionsByKey, membershipsByKey }) {
    const enrollmentsBySectionKey = new Map();
    for (const sectionInput of SCHOOL_SECTIONS) {
        const section = sectionsByKey.get(sectionInput.key);
        const enrollmentsByStudentKey = new Map();
        for (const studentKey of getSchoolStudentKeysForSection(sectionInput)) {
            const enrollment = await upsertOne(
                Enrollment,
                {
                    institutionId: institution._id,
                    sectionId: section._id,
                    studentMemberId: membershipsByKey.get(studentKey)._id,
                },
                {
                    status: "enrolled",
                    enrolledAt: dateOnly("2026-02-01"),
                    droppedAt: null,
                    droppedByUserId: null,
                    droppedByAcademicDecisionId: null,
                    createdByUserId: ownerUserId,
                }
            );
            enrollmentsByStudentKey.set(studentKey, enrollment);
        }
        enrollmentsBySectionKey.set(sectionInput.key, enrollmentsByStudentKey);
    }
    return enrollmentsBySectionKey;
}

async function seedSchoolSessionsAndAttendance({ institution, ownerUserId, sectionsByKey, enrollmentsBySectionKey, membershipsByKey }) {
    const sessionsBySectionKey = new Map();
    for (const [sectionKey, sessionDates] of Object.entries(SCHOOL_SESSION_DATES_BY_SECTION)) {
        const sectionInput = SCHOOL_SECTIONS.find((input) => input.key === sectionKey);
        const section = sectionsByKey.get(sectionKey);
        const sessions = [];

        for (const [index, sessionDate] of sessionDates.entries()) {
            const session = await upsertOne(
                SectionSession,
                {
                    institutionId: institution._id,
                    sectionId: section._id,
                    sessionDate: dateOnly(sessionDate),
                    startTime: sectionInput.startTime,
                    sessionType: "lecture",
                },
                {
                    endTime: sectionInput.endTime,
                    room: sectionInput.room,
                    status: "completed",
                    statusNote: "Seeded school completed class session",
                    statusChangedAt: new Date(`${sessionDate}T11:00:00.000Z`),
                    statusChangedByUserId: ownerUserId,
                    attendanceState: "closed",
                    attendanceOpenedAt: new Date(`${sessionDate}T08:55:00.000Z`),
                    attendanceClosedAt: new Date(`${sessionDate}T11:00:00.000Z`),
                    attendanceOpenedByUserId: ownerUserId,
                    currentQrTokenHash: null,
                    currentQrTokenExpiresAt: null,
                    createdByUserId: ownerUserId,
                }
            );
            sessions.push(session);

            const statusesByStudent = {
                schoolStudentA: "present",
                schoolStudentB: index === 1 ? "late" : "present",
                schoolStudentC: index < 3 ? "absent" : "late",
                schoolStudentD: index === 2 ? "excused" : "present",
            };

            for (const [studentKey, attendanceStatus] of Object.entries(statusesByStudent)) {
                const enrollment = enrollmentsBySectionKey.get(sectionKey)?.get(studentKey);
                if (!enrollment) {
                    continue;
                }

                await upsertOne(
                    AttendanceRecord,
                    {
                        institutionId: institution._id,
                        sectionSessionId: session._id,
                        enrollmentId: enrollment._id,
                    },
                    {
                        sectionId: section._id,
                        studentMemberId: membershipsByKey.get(studentKey)._id,
                        attendanceStatus,
                        source: "manual",
                        checkedInAt: attendanceStatus === "present" || attendanceStatus === "late"
                            ? new Date(`${sessionDate}T09:05:00.000Z`)
                            : null,
                        note: "Seeded school attendance demo",
                        recordedByUserId: ownerUserId,
                    }
                );
            }
        }

        sessionsBySectionKey.set(sectionKey, sessions);
    }

    return sessionsBySectionKey;
}

function findFirstSchoolSessionForSection(sessionsBySectionKey, sectionKey) {
    return sessionsBySectionKey.get(sectionKey)?.[0] || null;
}

async function seedSchoolAssessments({ institution, ownerUserId, sectionsByKey, sessionsBySectionKey, enrollmentsBySectionKey, membershipsByKey }) {
    const assessmentsByKey = new Map();
    for (const assessmentInput of SCHOOL_ASSESSMENTS) {
        const section = sectionsByKey.get(assessmentInput.sectionKey);
        const assessment = await upsertOne(
            Assessment,
            {
                institutionId: institution._id,
                sectionId: section._id,
                title: assessmentInput.title,
            },
            {
                sectionSessionId: findFirstSchoolSessionForSection(sessionsBySectionKey, assessmentInput.sectionKey)?._id || null,
                description: "Seeded school published assessment for report-card and dashboard demos.",
                type: assessmentInput.type,
                assessmentDate: dateOnly(assessmentInput.assessmentDate),
                maxScore: assessmentInput.maxScore,
                weight: assessmentInput.weight,
                status: "published",
                publishedAt: new Date(`${assessmentInput.assessmentDate}T12:00:00.000Z`),
                publishedByUserId: ownerUserId,
                createdByUserId: ownerUserId,
            }
        );
        assessmentsByKey.set(assessmentInput.key, assessment);

        const scores = SCHOOL_ASSESSMENT_SCORES[assessmentInput.key] || {};
        for (const [studentKey, score] of Object.entries(scores)) {
            const enrollment = enrollmentsBySectionKey.get(assessmentInput.sectionKey)?.get(studentKey);
            if (!enrollment) {
                continue;
            }

            await upsertOne(
                AssessmentResult,
                {
                    institutionId: institution._id,
                    assessmentId: assessment._id,
                    enrollmentId: enrollment._id,
                },
                {
                    sectionId: section._id,
                    studentMemberId: membershipsByKey.get(studentKey)._id,
                    score,
                    note: score === null ? "Seeded missing school result" : "Seeded school result",
                    recordedByUserId: ownerUserId,
                }
            );
        }
    }
    return assessmentsByKey;
}

async function seedSchoolHomeworks({ institution, ownerUserId, sectionsByKey, sessionsBySectionKey, enrollmentsBySectionKey, membershipsByKey }) {
    const homeworksByKey = new Map();
    for (const homeworkInput of SCHOOL_HOMEWORKS) {
        const section = sectionsByKey.get(homeworkInput.sectionKey);
        const homework = await upsertOne(
            Homework,
            {
                institutionId: institution._id,
                sectionId: section._id,
                titleNormalized: homeworkInput.titleNormalized,
            },
            {
                sectionSessionId: findFirstSchoolSessionForSection(sessionsBySectionKey, homeworkInput.sectionKey)?._id || null,
                assessmentId: null,
                title: homeworkInput.title,
                instructions: "Seeded school homework for classroom workflow testing.",
                type: "homework",
                dueAt: new Date(homeworkInput.dueAt),
                submissionMode: homeworkInput.submissionMode,
                allowLate: true,
                status: "assigned",
                createdByUserId: ownerUserId,
                archivedAt: null,
            }
        );
        homeworksByKey.set(homeworkInput.key, homework);
    }

    const offlineHomework = homeworksByKey.get("g7MathOffline");
    const offlineSubmissions = [
        { studentKey: "schoolStudentA", status: "submitted", submittedAt: "2026-05-21T13:30:00.000Z" },
        { studentKey: "schoolStudentB", status: "submitted", submittedAt: "2026-05-22T12:20:00.000Z" },
        { studentKey: "schoolStudentC", status: "missing", submittedAt: null },
        { studentKey: "schoolStudentD", status: "late", submittedAt: "2026-05-23T09:15:00.000Z" },
    ];

    for (const submissionInput of offlineSubmissions) {
        const enrollment = enrollmentsBySectionKey.get("grade7MathA").get(submissionInput.studentKey);
        await upsertOne(
            HomeworkSubmission,
            {
                institutionId: institution._id,
                homeworkId: offlineHomework._id,
                enrollmentId: enrollment._id,
            },
            {
                sectionId: sectionsByKey.get("grade7MathA")._id,
                studentMemberId: membershipsByKey.get(submissionInput.studentKey)._id,
                submissionMethod: "offline",
                fileKey: null,
                originalFilename: null,
                mimeType: null,
                sizeBytes: null,
                submittedAt: submissionInput.submittedAt ? new Date(submissionInput.submittedAt) : null,
                status: submissionInput.status,
                studentNote: "",
                instructorFeedback: "Seeded school offline submission state.",
                markedByUserId: ownerUserId,
            }
        );
    }

    const onlineHomework = homeworksByKey.get("g7ScienceOnline");
    const onlineEnrollment = enrollmentsBySectionKey.get("grade7ScienceA").get("schoolStudentA");
    await upsertOne(
        HomeworkSubmission,
        {
            institutionId: institution._id,
            homeworkId: onlineHomework._id,
            enrollmentId: onlineEnrollment._id,
        },
        {
            sectionId: sectionsByKey.get("grade7ScienceA")._id,
            studentMemberId: membershipsByKey.get("schoolStudentA")._id,
            submissionMethod: "online_upload",
            fileKey: "demo-school-plant-cell-aya.pdf",
            originalFilename: "demo-school-plant-cell-aya.pdf",
            mimeType: "application/pdf",
            sizeBytes: 18432,
            submittedAt: new Date("2026-05-23T18:00:00.000Z"),
            status: "submitted",
            studentNote: "Seeded school upload metadata only.",
            instructorFeedback: "",
            markedByUserId: null,
        }
    );

    return homeworksByKey;
}

async function seedSchoolMaterials({ institution, ownerUserId, sectionsByKey, sessionsBySectionKey }) {
    const materials = [];
    for (const materialInput of SCHOOL_MATERIALS) {
        const section = sectionsByKey.get(materialInput.sectionKey);
        const fileSlug = materialInput.titleNormalized.replace(/\s+/g, "-");
        const material = await upsertOne(
            SectionMaterial,
            {
                institutionId: institution._id,
                sectionId: section._id,
                titleNormalized: materialInput.titleNormalized,
            },
            {
                sectionSessionId: findFirstSchoolSessionForSection(sessionsBySectionKey, materialInput.sectionKey)?._id || null,
                title: materialInput.title,
                description: "Seeded private school material metadata. No public upload URL is created.",
                materialType: materialInput.materialType,
                sourceType: "file",
                fileKey: `${fileSlug}.pdf`,
                originalFilename: `${fileSlug}.pdf`,
                mimeType: "application/pdf",
                sizeBytes: 32768,
                status: materialInput.status,
                uploadedByUserId: ownerUserId,
                publishedAt: materialInput.status === "published" ? new Date("2026-05-06T12:00:00.000Z") : null,
                archivedAt: materialInput.status === "archived" ? new Date("2026-06-01T12:00:00.000Z") : null,
            }
        );
        materials.push(material);
    }
    return materials;
}

async function seedSchoolAcademicPolicy({ institution, ownerUserId, academicYear, semester, classLevelsByKey, subjectsByKey }) {
    return upsertOne(
        SchoolAcademicPolicy,
        {
            institutionId: institution._id,
            status: "active",
            "appliesTo.academicYearId": academicYear._id,
            "appliesTo.classLevelId": classLevelsByKey.get("grade7")._id,
        },
        {
            name: "Demo Grade 7 Promotion Policy",
            appliesTo: {
                academicYearId: academicYear._id,
                schoolStageId: null,
                classLevelId: classLevelsByKey.get("grade7")._id,
            },
            gradingRules: {
                gradingMode: "percentage",
                scaleMax: 100,
                subjectPassMinPercentage: 50,
                yearPassMinPercentage: 60,
            },
            aggregationRules: {
                yearCalculationMethod: "weighted_semesters",
                semesterWeights: [{ semesterId: semester._id, weight: 100 }],
            },
            failureRules: {
                failIfAnyCriticalSubjectFailed: true,
                criticalSubjectRules: [
                    {
                        subjectId: subjectsByKey.get("grade7Math")._id,
                        failAction: "repeat_year",
                    },
                ],
                failIfFailedSubjectCountAtLeast: 2,
                countCriticalSubjectsInFailedSubjectTotal: true,
            },
            promotionRules: {
                enabled: true,
                passDecision: "promoted",
                failDecision: "repeat_year",
                allowConditionalPromotion: true,
                allowManualReview: true,
            },
            audit: {
                createdBy: ownerUserId,
                updatedBy: ownerUserId,
            },
        }
    );
}

async function seedSchoolResponsibilities({ institution, usersByKey, classLevelsByKey }) {
    const inputs = [
        {
            key: "grade7Coordinator",
            userKey: "schoolMathTeacher",
            responsibilityType: "coordinator",
            scopeType: "classLevel",
            scopeId: classLevelsByKey.get("grade7")._id,
        },
    ];
    const assignmentsByKey = new Map();

    for (const input of inputs) {
        const assignment = await upsertOne(
            ResponsibilityAssignment,
            {
                institutionId: institution._id,
                userId: usersByKey.get(input.userKey)._id,
                responsibilityType: input.responsibilityType,
                scopeType: input.scopeType,
                scopeId: input.scopeId,
            },
            {
                permissions: [],
                startAt: null,
                endAt: null,
                isActive: true,
            }
        );
        assignmentsByKey.set(input.key, assignment);
    }

    return assignmentsByKey;
}

async function seedSchoolFinalOutcomes({ institution, ownerUserId, academicYear, schoolClassesByKey, classLevelsByKey, membershipsByKey, policy }) {
    const grade7Class = schoolClassesByKey.get("grade7A");
    const grade7Level = classLevelsByKey.get("grade7");
    const finalOutcomeInputs = [
        {
            studentKey: "schoolStudentA",
            yearlyAveragePercentage: 90.9,
            failedSubjectCount: 0,
            criticalFailedSubjects: [],
            complete: true,
            hasMissingResults: false,
            missingResults: [],
            calculatedDecision: "promoted",
            calculatedReasonCodes: [],
            calculatedReasons: [{ code: "YEAR_REQUIREMENTS_MET", message: "Seeded student meets promotion requirements." }],
        },
        {
            studentKey: "schoolStudentC",
            yearlyAveragePercentage: 53.2,
            failedSubjectCount: 1,
            criticalFailedSubjects: [
                {
                    subjectId: idOf(policy.failureRules.criticalSubjectRules[0].subjectId),
                    subjectName: "Mathematics",
                    percentage: 39.6,
                },
            ],
            complete: true,
            hasMissingResults: false,
            missingResults: [],
            calculatedDecision: "repeat_year",
            calculatedReasonCodes: ["CRITICAL_SUBJECT_FAILED", "YEAR_AVERAGE_BELOW_MINIMUM"],
            calculatedReasons: [
                { code: "CRITICAL_SUBJECT_FAILED", message: "Seeded critical mathematics result is below the pass threshold." },
                { code: "YEAR_AVERAGE_BELOW_MINIMUM", message: "Seeded yearly average is below the promotion threshold." },
            ],
        },
    ];
    const finalOutcomesByStudentKey = new Map();

    for (const input of finalOutcomeInputs) {
        const now = new Date("2026-06-15T12:00:00.000Z");
        const outcome = await upsertOne(
            SchoolFinalOutcome,
            {
                institutionId: institution._id,
                academicYearId: academicYear._id,
                studentMembershipId: membershipsByKey.get(input.studentKey)._id,
                status: "finalized",
            },
            {
                classLevelId: grade7Level._id,
                schoolClassId: grade7Class._id,
                policy: {
                    policyId: policy._id,
                    policyName: policy.name,
                    resolutionLevel: "class_level",
                },
                outcomeSnapshot: {
                    yearlyAveragePercentage: input.yearlyAveragePercentage,
                    failedSubjectCount: input.failedSubjectCount,
                    criticalFailedSubjects: input.criticalFailedSubjects,
                    complete: input.complete,
                    hasMissingResults: input.hasMissingResults,
                    missingResults: input.missingResults,
                },
                calculatedDecision: input.calculatedDecision,
                calculatedReasons: input.calculatedReasons,
                calculatedReasonCodes: input.calculatedReasonCodes,
                calculatedWarnings: [],
                finalDecision: input.calculatedDecision,
                finalReasons: input.calculatedReasons,
                finalReasonCodes: input.calculatedReasonCodes,
                finalWarnings: [],
                override: {
                    isOverridden: false,
                    overriddenBy: null,
                    overriddenAt: null,
                    reason: null,
                },
                finalizedBy: ownerUserId,
                finalizedAt: now,
                audit: {
                    createdBy: ownerUserId,
                    updatedBy: ownerUserId,
                },
            }
        );
        finalOutcomesByStudentKey.set(input.studentKey, outcome);
    }

    return finalOutcomesByStudentKey;
}

async function resetSeededData() {
    const demoEmails = [...DEMO_USERS, ...SCHOOL_DEMO_USERS].map((user) => user.email);
    const demoUsers = await User.find({ email: { $in: demoEmails } }).select("_id email").lean();
    const demoUserIds = demoUsers.map((user) => user._id);
    const institution = await Institution.findOne({
        name: DEMO_INSTITUTION_NAME,
        type: DEMO_INSTITUTION_TYPE,
    }).select("_id").lean();

    if (institution) {
        const institutionId = institution._id;
        const demoMemberships = await Membership.find({
            institutionId,
            userId: { $in: demoUserIds },
        }).select("_id userId").lean();
        const membershipIds = demoMemberships.map((membership) => membership._id);
        const studentMembershipIds = demoMemberships
            .filter((membership) => {
                const user = demoUsers.find((item) => item._id.toString() === membership.userId.toString());
                return ["student1@example.test", "student2@example.test", "student3@example.test"].includes(user?.email);
            })
            .map((membership) => membership._id);

        const sections = await Section.find({
            institutionId,
            code: { $in: DEMO_SECTIONS.map((section) => section.code) },
        }).select("_id").lean();
        const sectionIds = sections.map((section) => section._id);
        const sessions = await SectionSession.find({
            institutionId,
            sectionId: { $in: sectionIds },
            sessionDate: { $in: SESSION_DATES.map(dateOnly) },
            sessionType: "lecture",
        }).select("_id").lean();
        const sessionIds = sessions.map((session) => session._id);
        const assessments = await Assessment.find({
            institutionId,
            sectionId: { $in: sectionIds },
            title: { $in: ASSESSMENTS.map((assessment) => assessment.title) },
        }).select("_id").lean();
        const assessmentIds = assessments.map((assessment) => assessment._id);
        const homeworks = await Homework.find({
            institutionId,
            sectionId: { $in: sectionIds },
            titleNormalized: { $in: HOMEWORKS.map((homework) => homework.titleNormalized) },
        }).select("_id").lean();
        const homeworkIds = homeworks.map((homework) => homework._id);
        const semester = await Semester.findOne({ institutionId, name: "Demo Fall 2026" }).select("_id").lean();

        await HomeworkSubmission.deleteMany({ institutionId, homeworkId: { $in: homeworkIds } });
        await Homework.deleteMany({ institutionId, _id: { $in: homeworkIds } });
        await SectionMaterial.deleteMany({
            institutionId,
            sectionId: { $in: sectionIds },
            titleNormalized: { $in: MATERIALS.map((material) => material.titleNormalized) },
        });
        await AssessmentResult.deleteMany({ institutionId, assessmentId: { $in: assessmentIds } });
        await Assessment.deleteMany({ institutionId, _id: { $in: assessmentIds } });
        await AttendanceRecord.deleteMany({ institutionId, sectionSessionId: { $in: sessionIds } });
        await SectionSession.deleteMany({ institutionId, _id: { $in: sessionIds } });
        await Enrollment.deleteMany({
            institutionId,
            sectionId: { $in: sectionIds },
            studentMemberId: { $in: studentMembershipIds },
        });
        await ResponsibilityAssignment.deleteMany({
            institutionId,
            userId: { $in: demoUserIds },
            responsibilityType: { $in: ["head", "coordinator", "mentor"] },
        });
        await Section.deleteMany({ institutionId, _id: { $in: sectionIds } });
        await InstitutionAcademicPolicy.deleteMany({
            institutionId,
            name: "Demo University Academic Policy",
            ...(semester ? { effectiveFromSemesterId: semester._id } : {}),
        });
        await Subject.deleteMany({
            institutionId,
            code: { $in: DEMO_SUBJECTS.map((subject) => subject.code) },
        });
        await Department.deleteMany({
            institutionId,
            code: { $in: DEMO_DEPARTMENTS.map((department) => department.code) },
        });
        await Semester.deleteMany({ institutionId, name: "Demo Fall 2026" });
        await AcademicYear.deleteMany({
            institutionId,
            nameNormalized: "demo academic year 2026-2027",
        });
        await InstitutionBillingProfile.deleteMany({
            institutionId,
            stripePriceId: "price_demo_local_pro_6_month",
        });
        await MemberProfile.deleteMany({ institutionId, membershipId: { $in: membershipIds } });
        await Membership.deleteMany({ institutionId, _id: { $in: membershipIds } });

        const remainingTenantRecordCount = await countInstitutionOwnedRecords(institutionId);
        if (remainingTenantRecordCount === 0) {
            await Institution.deleteOne({ _id: institutionId });
        }
    }

    const schoolInstitution = await Institution.findOne({
        name: SCHOOL_DEMO_INSTITUTION_NAME,
        type: SCHOOL_DEMO_INSTITUTION_TYPE,
    }).select("_id").lean();

    if (schoolInstitution) {
        const institutionId = schoolInstitution._id;
        const schoolUserEmails = SCHOOL_DEMO_USERS.map((user) => user.email);
        const schoolDemoUsers = demoUsers.filter((user) => schoolUserEmails.includes(user.email));
        const schoolDemoUserIds = schoolDemoUsers.map((user) => user._id);
        const schoolMemberships = await Membership.find({
            institutionId,
            userId: { $in: schoolDemoUserIds },
        }).select("_id userId").lean();
        const membershipIds = schoolMemberships.map((membership) => membership._id);
        const studentMembershipIds = schoolMemberships
            .filter((membership) => {
                const user = schoolDemoUsers.find((item) => item._id.toString() === membership.userId.toString());
                return user?.email?.startsWith("school.student.");
            })
            .map((membership) => membership._id);

        const classLevels = await ClassLevel.find({
            institutionId,
            code: { $in: SCHOOL_CLASS_LEVELS.map((classLevel) => classLevel.code) },
        }).select("_id").lean();
        const classLevelIds = classLevels.map((classLevel) => classLevel._id);
        const schoolClasses = await SchoolClass.find({
            institutionId,
            code: { $in: SCHOOL_CLASSES.map((schoolClass) => schoolClass.code) },
        }).select("_id").lean();
        const schoolClassIds = schoolClasses.map((schoolClass) => schoolClass._id);
        const sections = await Section.find({
            institutionId,
            code: { $in: SCHOOL_SECTIONS.map((section) => section.code) },
        }).select("_id").lean();
        const sectionIds = sections.map((section) => section._id);
        const sessions = await SectionSession.find({
            institutionId,
            sectionId: { $in: sectionIds },
        }).select("_id").lean();
        const sessionIds = sessions.map((session) => session._id);
        const assessments = await Assessment.find({
            institutionId,
            sectionId: { $in: sectionIds },
            title: { $in: SCHOOL_ASSESSMENTS.map((assessment) => assessment.title) },
        }).select("_id").lean();
        const assessmentIds = assessments.map((assessment) => assessment._id);
        const homeworks = await Homework.find({
            institutionId,
            sectionId: { $in: sectionIds },
            titleNormalized: { $in: SCHOOL_HOMEWORKS.map((homework) => homework.titleNormalized) },
        }).select("_id").lean();
        const homeworkIds = homeworks.map((homework) => homework._id);
        const semester = await Semester.findOne({ institutionId, name: "Demo School Spring 2026" }).select("_id").lean();
        const academicYear = await AcademicYear.findOne({
            institutionId,
            nameNormalized: "demo school academic year 2025-2026",
        }).select("_id").lean();

        await HomeworkSubmission.deleteMany({ institutionId, homeworkId: { $in: homeworkIds } });
        await Homework.deleteMany({ institutionId, _id: { $in: homeworkIds } });
        await SectionMaterial.deleteMany({
            institutionId,
            sectionId: { $in: sectionIds },
            titleNormalized: { $in: SCHOOL_MATERIALS.map((material) => material.titleNormalized) },
        });
        await AssessmentResult.deleteMany({ institutionId, assessmentId: { $in: assessmentIds } });
        await Assessment.deleteMany({ institutionId, _id: { $in: assessmentIds } });
        await AttendanceRecord.deleteMany({ institutionId, sectionSessionId: { $in: sessionIds } });
        await SectionSession.deleteMany({ institutionId, _id: { $in: sessionIds } });
        await Enrollment.deleteMany({
            institutionId,
            sectionId: { $in: sectionIds },
            studentMemberId: { $in: studentMembershipIds },
        });
        await SchoolFinalOutcome.deleteMany({
            institutionId,
            ...(academicYear ? { academicYearId: academicYear._id } : {}),
            studentMembershipId: { $in: studentMembershipIds },
        });
        await ClassStudentAssignment.deleteMany({
            institutionId,
            ...(semester ? { semesterId: semester._id } : {}),
            studentMemberId: { $in: studentMembershipIds },
        });
        await ResponsibilityAssignment.deleteMany({
            institutionId,
            userId: { $in: schoolDemoUserIds },
            responsibilityType: { $in: ["head", "coordinator", "mentor"] },
        });
        await Section.deleteMany({ institutionId, _id: { $in: sectionIds } });
        await SchoolAcademicPolicy.deleteMany({
            institutionId,
            name: "Demo Grade 7 Promotion Policy",
            ...(academicYear ? { "appliesTo.academicYearId": academicYear._id } : {}),
        });
        await Subject.deleteMany({
            institutionId,
            code: { $in: SCHOOL_SUBJECTS.map((subject) => subject.code) },
        });
        await SchoolClass.deleteMany({ institutionId, _id: { $in: schoolClassIds } });
        await ClassLevel.deleteMany({ institutionId, _id: { $in: classLevelIds } });
        await Semester.deleteMany({ institutionId, name: "Demo School Spring 2026" });
        await AcademicYear.deleteMany({
            institutionId,
            nameNormalized: "demo school academic year 2025-2026",
        });
        await InstitutionBillingProfile.deleteMany({
            institutionId,
            stripePriceId: "price_demo_local_pro_6_month",
        });
        await MemberProfile.deleteMany({ institutionId, membershipId: { $in: membershipIds } });
        await Membership.deleteMany({ institutionId, _id: { $in: membershipIds } });

        const remainingTenantRecordCount = await countInstitutionOwnedRecords(institutionId);
        if (remainingTenantRecordCount === 0) {
            await Institution.deleteOne({ _id: institutionId });
        }
    }

    for (const user of demoUsers) {
        const remainingMembershipCount = await Membership.countDocuments({ userId: user._id });
        if (remainingMembershipCount === 0) {
            await User.deleteOne({ _id: user._id, email: user.email });
        }
    }
}

async function countInstitutionOwnedRecords(institutionId) {
    let total = 0;
    for (const Model of TENANT_MODELS) {
        total += await Model.countDocuments({ institutionId });
    }
    return total;
}

function buildFrontendSummary({
    institution,
    academicYear,
    semester,
    departmentsByKey,
    subjectsByKey,
    sectionsByKey,
    membershipsByKey,
    enrollmentsBySectionKey,
    sessions,
    assessmentsByKey,
    homeworksByKey,
    materials,
    assignmentsByKey,
    billingProfile,
    academicPolicy,
    schoolSummary = null,
}) {
    const accounts = DEMO_USERS.map((user) => ({
        email: user.email,
        baseRole: user.role,
        responsibility:
            user.key === "head"
                ? "head"
                : user.key === "coordinator"
                  ? "coordinator"
                  : user.key === "mentor"
                    ? "mentor"
                    : null,
        membershipId: idOf(membershipsByKey.get(user.key)),
    }));
    const studentKeys = ["student1", "student2", "student3"];

    return {
        generatedAt: new Date().toISOString(),
        apiBaseUrl: process.env.VITE_API_BASE_URL || "http://localhost:5000",
        institution: {
            id: idOf(institution),
            name: institution.name,
            type: institution.type,
        },
        accounts,
        roleNames: ["admin", "instructor", "student"],
        academicYearId: idOf(academicYear),
        semesterId: idOf(semester),
        departmentIds: Object.fromEntries([...departmentsByKey.entries()].map(([key, value]) => [key, idOf(value)])),
        classLevelIds: {},
        schoolClassIds: {},
        subjectIds: Object.fromEntries([...subjectsByKey.entries()].map(([key, value]) => [key, idOf(value)])),
        sectionIds: Object.fromEntries([...sectionsByKey.entries()].map(([key, value]) => [key, idOf(value)])),
        sampleStudentIds: Object.fromEntries(studentKeys.map((key) => [key, idOf(membershipsByKey.get(key))])),
        enrollmentIds: Object.fromEntries(
            [...enrollmentsBySectionKey.entries()].map(([sectionKey, byStudent]) => [
                sectionKey,
                Object.fromEntries([...byStudent.entries()].map(([studentKey, enrollment]) => [studentKey, idOf(enrollment)])),
            ])
        ),
        sectionSessionIds: sessions.map(idOf),
        assessmentIds: Object.fromEntries([...assessmentsByKey.entries()].map(([key, value]) => [key, idOf(value)])),
        homeworkIds: Object.fromEntries([...homeworksByKey.entries()].map(([key, value]) => [key, idOf(value)])),
        materialIds: materials.map(idOf),
        responsibilityAssignmentIds: Object.fromEntries(
            [...assignmentsByKey.entries()].map(([key, value]) => [key, idOf(value)])
        ),
        billingProfileId: idOf(billingProfile),
        academicPolicyId: idOf(academicPolicy),
        usefulRoutes: buildUsefulRoutes(idOf(institution), Object.fromEntries([...sectionsByKey.entries()].map(([key, value]) => [key, idOf(value)])), {
            student1: idOf(membershipsByKey.get("student1")),
        }),
        school: schoolSummary,
    };
}

function buildSchoolFrontendSummary({
    institution,
    academicYear,
    semester,
    classLevelsByKey,
    schoolClassesByKey,
    subjectsByKey,
    sectionsByKey,
    membershipsByKey,
    classAssignmentsByStudentKey,
    enrollmentsBySectionKey,
    sessionsBySectionKey,
    assessmentsByKey,
    homeworksByKey,
    materials,
    schoolPolicy,
    finalOutcomesByStudentKey,
    assignmentsByKey,
    billingProfile,
}) {
    const accounts = SCHOOL_DEMO_USERS.map((user) => ({
        email: user.email,
        baseRole: user.role,
        responsibility: user.key === "schoolMathTeacher" ? "coordinator" : null,
        membershipId: idOf(membershipsByKey.get(user.key)),
    }));
    const studentKeys = SCHOOL_DEMO_USERS.filter((user) => user.role === "student").map((user) => user.key);
    const sectionIds = Object.fromEntries([...sectionsByKey.entries()].map(([key, value]) => [key, idOf(value)]));
    const studentIds = Object.fromEntries(studentKeys.map((key) => [key, idOf(membershipsByKey.get(key))]));

    return {
        institution: {
            id: idOf(institution),
            name: institution.name,
            type: institution.type,
        },
        accounts,
        academicYearId: idOf(academicYear),
        activeSemesterId: idOf(semester),
        classLevelIds: Object.fromEntries([...classLevelsByKey.entries()].map(([key, value]) => [key, idOf(value)])),
        schoolClassIds: Object.fromEntries([...schoolClassesByKey.entries()].map(([key, value]) => [key, idOf(value)])),
        subjectIds: Object.fromEntries([...subjectsByKey.entries()].map(([key, value]) => [key, idOf(value)])),
        sectionIds,
        sampleStudentIds: studentIds,
        classAssignmentIds: Object.fromEntries([...classAssignmentsByStudentKey.entries()].map(([key, value]) => [key, idOf(value)])),
        enrollmentIds: Object.fromEntries(
            [...enrollmentsBySectionKey.entries()].map(([sectionKey, byStudent]) => [
                sectionKey,
                Object.fromEntries([...byStudent.entries()].map(([studentKey, enrollment]) => [studentKey, idOf(enrollment)])),
            ])
        ),
        sectionSessionIds: Object.fromEntries(
            [...sessionsBySectionKey.entries()].map(([sectionKey, sessions]) => [sectionKey, sessions.map(idOf)])
        ),
        assessmentIds: Object.fromEntries([...assessmentsByKey.entries()].map(([key, value]) => [key, idOf(value)])),
        homeworkIds: Object.fromEntries([...homeworksByKey.entries()].map(([key, value]) => [key, idOf(value)])),
        materialIds: materials.map(idOf),
        schoolAcademicPolicyId: idOf(schoolPolicy),
        schoolFinalOutcomeIds: Object.fromEntries([...finalOutcomesByStudentKey.entries()].map(([key, value]) => [key, idOf(value)])),
        responsibilityAssignmentIds: Object.fromEntries(
            [...assignmentsByKey.entries()].map(([key, value]) => [key, idOf(value)])
        ),
        billingProfileId: idOf(billingProfile),
        usefulRoutes: buildSchoolUsefulRoutes(idOf(institution), sectionIds, studentIds, {
            academicYearId: idOf(academicYear),
            semesterId: idOf(semester),
            schoolClassId: idOf(schoolClassesByKey.get("grade7A")),
        }),
        demoNotes: {
            promotedStudentKey: "schoolStudentA",
            atRiskStudentKey: "schoolStudentC",
            incompleteStudentKey: "schoolStudentD",
            gradeEightStudentKey: "schoolStudentE",
        },
    };
}

function buildUsefulRoutes(institutionId, sectionIds, studentIds) {
    return [
        "/auth/login",
        "/institutions/me",
        `/institutions/${institutionId}/sections`,
        `/institutions/${institutionId}/sections/${sectionIds.programmingA}`,
        `/institutions/${institutionId}/sections/${sectionIds.programmingA}/sessions`,
        `/institutions/${institutionId}/sections/${sectionIds.programmingA}/attendance/analytics`,
        `/institutions/${institutionId}/sections/${sectionIds.programmingA}/assessments`,
        `/institutions/${institutionId}/sections/${sectionIds.programmingA}/results`,
        `/institutions/${institutionId}/sections/${sectionIds.programmingA}/homeworks`,
        `/institutions/${institutionId}/sections/${sectionIds.programmingA}/materials`,
        `/institutions/${institutionId}/academic-oversight/risk-summary`,
        `/institutions/${institutionId}/academic-oversight/students/${studentIds.student1}`,
        `/institutions/${institutionId}/billing/status`,
        `/institutions/${institutionId}/students/me/attendance-history`,
        `/institutions/${institutionId}/students/me/homeworks`,
        `/institutions/${institutionId}/students/me/materials`,
        `/institutions/${institutionId}/students/me/assessments`,
        `/institutions/${institutionId}/students/me/results`,
    ];
}

function buildSchoolUsefulRoutes(institutionId, sectionIds, studentIds, context) {
    return [
        "/auth/login",
        "/institutions/me",
        `/institutions/${institutionId}/academic-years/active`,
        `/institutions/${institutionId}/class-levels`,
        `/institutions/${institutionId}/classes`,
        `/institutions/${institutionId}/classes/${context.schoolClassId}/students`,
        `/institutions/${institutionId}/sections`,
        `/institutions/${institutionId}/sections/${sectionIds.grade7MathA}`,
        `/institutions/${institutionId}/sections/${sectionIds.grade7MathA}/sessions`,
        `/institutions/${institutionId}/sections/${sectionIds.grade7MathA}/attendance/analytics`,
        `/institutions/${institutionId}/sections/${sectionIds.grade7MathA}/assessments`,
        `/institutions/${institutionId}/sections/${sectionIds.grade7MathA}/results`,
        `/institutions/${institutionId}/sections/${sectionIds.grade7MathA}/homeworks`,
        `/institutions/${institutionId}/sections/${sectionIds.grade7MathA}/materials`,
        `/institutions/${institutionId}/school-outcomes/students/${studentIds.schoolStudentA}/semesters/${context.semesterId}/report-card`,
        `/institutions/${institutionId}/school-outcomes/students/${studentIds.schoolStudentA}/academic-years/${context.academicYearId}/report-card`,
        `/institutions/${institutionId}/school-outcomes/classes/${context.schoolClassId}/academic-years/${context.academicYearId}/promotion-summary`,
        `/institutions/${institutionId}/school-outcomes/academic-years/${context.academicYearId}/promotion-dashboard/summary`,
        `/institutions/${institutionId}/school-outcomes/academic-years/${context.academicYearId}/promotion-dashboard/students`,
        `/institutions/${institutionId}/instructors/me/school-outcomes/academic-years/${context.academicYearId}/promotion-dashboard/students`,
        `/institutions/${institutionId}/students/me/academic-profile?academicYearId=${context.academicYearId}`,
    ];
}

async function writeFrontendSummary(summary) {
    await fs.promises.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
    await fs.promises.writeFile(OUTPUT_FILE, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function printSummary(summary) {
    console.log("\nDev seed complete.\n");
    console.log(`Institution: ${summary.institution.name} (${summary.institution.id})`);
    console.log(`Output: ${path.relative(process.cwd(), OUTPUT_FILE)}`);
    console.log("\nDemo logins:");
    for (const account of summary.accounts) {
        const responsibility = account.responsibility ? `, ${account.responsibility}` : "";
        console.log(`- ${account.email} / ${DEMO_PASSWORD} (${account.baseRole}${responsibility})`);
    }
    console.log("\nMain sections:");
    for (const [key, value] of Object.entries(summary.sectionIds)) {
        console.log(`- ${key}: ${value}`);
    }
    if (summary.school?.institution?.id) {
        console.log(`\nSchool institution: ${summary.school.institution.name} (${summary.school.institution.id})`);
        console.log("School sections:");
        for (const [key, value] of Object.entries(summary.school.sectionIds || {})) {
            console.log(`- ${key}: ${value}`);
        }
    }
    console.log("\nUseful routes:");
    for (const route of summary.usefulRoutes.slice(0, 10)) {
        console.log(`- ${route}`);
    }
    if (summary.school?.usefulRoutes?.length) {
        console.log("\nSchool useful routes:");
        for (const route of summary.school.usefulRoutes.slice(0, 10)) {
            console.log(`- ${route}`);
        }
    }
}

async function seedDemoData() {
    const usersByKey = await seedUsers();
    const institution = await seedInstitution(usersByKey.get("owner"));
    const { membershipsByKey } = await seedMemberships({ institution, usersByKey });
    const { academicYear, semester } = await seedAcademicCalendar({
        institution,
        ownerUserId: usersByKey.get("owner")._id,
    });
    const departmentsByKey = await seedDepartments({ institution, ownerUserId: usersByKey.get("owner")._id });
    const subjectsByKey = await seedSubjects({ institution, ownerUserId: usersByKey.get("owner")._id, departmentsByKey });
    const sectionsByKey = await seedSections({
        institution,
        ownerUserId: usersByKey.get("owner")._id,
        semester,
        subjectsByKey,
        instructorMembership: membershipsByKey.get("instructor"),
    });
    const enrollmentsBySectionKey = await seedEnrollments({
        institution,
        ownerUserId: usersByKey.get("owner")._id,
        sectionsByKey,
        membershipsByKey,
    });
    const sessions = await seedSessionsAndAttendance({
        institution,
        ownerUserId: usersByKey.get("owner")._id,
        sectionsByKey,
        enrollmentsBySectionKey,
        membershipsByKey,
    });
    const assessmentsByKey = await seedAssessments({
        institution,
        ownerUserId: usersByKey.get("owner")._id,
        sectionsByKey,
        sessions,
        enrollmentsBySectionKey,
        membershipsByKey,
    });
    const homeworksByKey = await seedHomeworks({
        institution,
        ownerUserId: usersByKey.get("owner")._id,
        sectionsByKey,
        sessions,
        enrollmentsBySectionKey,
        membershipsByKey,
    });
    const materials = await seedMaterials({
        institution,
        ownerUserId: usersByKey.get("owner")._id,
        sectionsByKey,
        sessions,
    });
    const assignmentsByKey = await seedResponsibilities({
        institution,
        usersByKey,
        departmentsByKey,
        sectionsByKey,
    });
    const billingProfile = await seedBillingProfile({ institution });
    const academicPolicy = await seedUniversityPolicy({
        institution,
        ownerUserId: usersByKey.get("owner")._id,
        semester,
    });

    const schoolUsersByKey = await seedUsers(SCHOOL_DEMO_USERS);
    const schoolInstitution = await seedSchoolInstitution(schoolUsersByKey.get("schoolOwner"));
    const { membershipsByKey: schoolMembershipsByKey } = await seedMemberships({
        institution: schoolInstitution,
        usersByKey: schoolUsersByKey,
        demoUsers: SCHOOL_DEMO_USERS,
        ownerKey: "schoolOwner",
    });
    const { academicYear: schoolAcademicYear, semester: schoolSemester } = await seedSchoolAcademicCalendar({
        institution: schoolInstitution,
        ownerUserId: schoolUsersByKey.get("schoolOwner")._id,
    });
    const classLevelsByKey = await seedSchoolClassLevels({
        institution: schoolInstitution,
        ownerUserId: schoolUsersByKey.get("schoolOwner")._id,
    });
    const schoolClassesByKey = await seedSchoolClasses({
        institution: schoolInstitution,
        ownerUserId: schoolUsersByKey.get("schoolOwner")._id,
        classLevelsByKey,
    });
    const schoolSubjectsByKey = await seedSchoolSubjects({
        institution: schoolInstitution,
        ownerUserId: schoolUsersByKey.get("schoolOwner")._id,
        classLevelsByKey,
    });
    const schoolSectionsByKey = await seedSchoolSections({
        institution: schoolInstitution,
        ownerUserId: schoolUsersByKey.get("schoolOwner")._id,
        semester: schoolSemester,
        subjectsByKey: schoolSubjectsByKey,
        schoolClassesByKey,
        membershipsByKey: schoolMembershipsByKey,
    });
    const classAssignmentsByStudentKey = await seedSchoolClassAssignments({
        institution: schoolInstitution,
        ownerUserId: schoolUsersByKey.get("schoolOwner")._id,
        semester: schoolSemester,
        schoolClassesByKey,
        membershipsByKey: schoolMembershipsByKey,
    });
    const schoolEnrollmentsBySectionKey = await seedSchoolEnrollments({
        institution: schoolInstitution,
        ownerUserId: schoolUsersByKey.get("schoolOwner")._id,
        sectionsByKey: schoolSectionsByKey,
        membershipsByKey: schoolMembershipsByKey,
    });
    const schoolSessionsBySectionKey = await seedSchoolSessionsAndAttendance({
        institution: schoolInstitution,
        ownerUserId: schoolUsersByKey.get("schoolOwner")._id,
        sectionsByKey: schoolSectionsByKey,
        enrollmentsBySectionKey: schoolEnrollmentsBySectionKey,
        membershipsByKey: schoolMembershipsByKey,
    });
    const schoolAssessmentsByKey = await seedSchoolAssessments({
        institution: schoolInstitution,
        ownerUserId: schoolUsersByKey.get("schoolOwner")._id,
        sectionsByKey: schoolSectionsByKey,
        sessionsBySectionKey: schoolSessionsBySectionKey,
        enrollmentsBySectionKey: schoolEnrollmentsBySectionKey,
        membershipsByKey: schoolMembershipsByKey,
    });
    const schoolHomeworksByKey = await seedSchoolHomeworks({
        institution: schoolInstitution,
        ownerUserId: schoolUsersByKey.get("schoolOwner")._id,
        sectionsByKey: schoolSectionsByKey,
        sessionsBySectionKey: schoolSessionsBySectionKey,
        enrollmentsBySectionKey: schoolEnrollmentsBySectionKey,
        membershipsByKey: schoolMembershipsByKey,
    });
    const schoolMaterials = await seedSchoolMaterials({
        institution: schoolInstitution,
        ownerUserId: schoolUsersByKey.get("schoolOwner")._id,
        sectionsByKey: schoolSectionsByKey,
        sessionsBySectionKey: schoolSessionsBySectionKey,
    });
    const schoolPolicy = await seedSchoolAcademicPolicy({
        institution: schoolInstitution,
        ownerUserId: schoolUsersByKey.get("schoolOwner")._id,
        academicYear: schoolAcademicYear,
        semester: schoolSemester,
        classLevelsByKey,
        subjectsByKey: schoolSubjectsByKey,
    });
    const schoolAssignmentsByKey = await seedSchoolResponsibilities({
        institution: schoolInstitution,
        usersByKey: schoolUsersByKey,
        classLevelsByKey,
    });
    const finalOutcomesByStudentKey = await seedSchoolFinalOutcomes({
        institution: schoolInstitution,
        ownerUserId: schoolUsersByKey.get("schoolOwner")._id,
        academicYear: schoolAcademicYear,
        schoolClassesByKey,
        classLevelsByKey,
        membershipsByKey: schoolMembershipsByKey,
        policy: schoolPolicy,
    });
    const schoolBillingProfile = await seedBillingProfile({ institution: schoolInstitution });

    const schoolSummary = buildSchoolFrontendSummary({
        institution: schoolInstitution,
        academicYear: schoolAcademicYear,
        semester: schoolSemester,
        classLevelsByKey,
        schoolClassesByKey,
        subjectsByKey: schoolSubjectsByKey,
        sectionsByKey: schoolSectionsByKey,
        membershipsByKey: schoolMembershipsByKey,
        classAssignmentsByStudentKey,
        enrollmentsBySectionKey: schoolEnrollmentsBySectionKey,
        sessionsBySectionKey: schoolSessionsBySectionKey,
        assessmentsByKey: schoolAssessmentsByKey,
        homeworksByKey: schoolHomeworksByKey,
        materials: schoolMaterials,
        schoolPolicy,
        finalOutcomesByStudentKey,
        assignmentsByKey: schoolAssignmentsByKey,
        billingProfile: schoolBillingProfile,
    });

    const summary = buildFrontendSummary({
        institution,
        academicYear,
        semester,
        departmentsByKey,
        subjectsByKey,
        sectionsByKey,
        membershipsByKey,
        enrollmentsBySectionKey,
        sessions,
        assessmentsByKey,
        homeworksByKey,
        materials,
        assignmentsByKey,
        billingProfile,
        academicPolicy,
        schoolSummary,
    });

    await writeFrontendSummary(summary);
    return summary;
}

async function main() {
    assertNotProduction();

    const options = parseArgs(process.argv.slice(2));
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        throw new Error("MONGO_URI is not configured. Set it in .env or your shell before running this seed.");
    }

    const databaseName = getDatabaseNameFromUri(mongoUri);
    const looksLocal = looksLikeLocalDatabaseName(databaseName);
    if (!looksLocal) {
        console.warn(
            `Warning: database name "${databaseName || "(unknown)"}" does not look local/dev/test/demo.`
        );
    }

    if (options.reset && !looksLocal) {
        throw new Error("Refusing --reset because the database name does not look local/dev/test/demo.");
    }

    await mongoose.connect(mongoUri);
    try {
        if (options.reset) {
            await resetSeededData();
        }

        const summary = await seedDemoData();
        printSummary(summary);
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    main().catch(async (error) => {
        console.error(error.message);
        try {
            await mongoose.disconnect();
        } catch (_disconnectError) {
            // Ignore disconnect errors while reporting the original failure.
        }
        process.exitCode = 1;
    });
}

module.exports = {
    DEMO_PASSWORD,
    buildSchoolUsefulRoutes,
    buildUsefulRoutes,
    getDatabaseNameFromUri,
    looksLikeLocalDatabaseName,
    normalizeEmail,
    normalizeName,
    normalizeNameKey,
    parseArgs,
};
