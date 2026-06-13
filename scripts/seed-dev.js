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
const Section = require("../src/models/Section");
const SectionMaterial = require("../src/models/SectionMaterial");
const SectionSession = require("../src/models/SectionSession");
const Semester = require("../src/models/Semester");
const Subject = require("../src/models/Subject");
const User = require("../src/models/User");

const DEMO_PASSWORD = "Password123!";
const DEMO_INSTITUTION_NAME = "Demo University";
const DEMO_INSTITUTION_TYPE = "university";
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

const TENANT_MODELS = [
    AcademicYear,
    Assessment,
    AssessmentResult,
    AttendanceRecord,
    Department,
    Enrollment,
    Homework,
    HomeworkSubmission,
    InstitutionAcademicPolicy,
    InstitutionBillingProfile,
    MemberProfile,
    Membership,
    ResponsibilityAssignment,
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

async function seedUsers() {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, getSaltRounds());
    const usersByKey = new Map();

    for (const demoUser of DEMO_USERS) {
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

async function seedMemberships({ institution, usersByKey }) {
    const membershipsByKey = new Map();
    const profilesByKey = new Map();

    for (const demoUser of DEMO_USERS) {
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
                invitedBy: usersByKey.get("owner")._id,
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
                birthDate: dateOnly(demoUser.role === "student" ? "2004-01-15" : "1988-05-20"),
                gender: demoUser.key === "student2" ? "female" : "male",
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
    return upsertOne(
        InstitutionBillingProfile,
        {
            institutionId: institution._id,
        },
        {
            stripeCustomerId: "cus_demo_local",
            stripeSubscriptionId: "sub_demo_local",
            stripePriceId: "price_demo_local",
            status: "trialing",
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

async function resetSeededData() {
    const demoEmails = DEMO_USERS.map((user) => user.email);
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
            stripeCustomerId: "cus_demo_local",
            stripeSubscriptionId: "sub_demo_local",
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
    console.log("\nUseful routes:");
    for (const route of summary.usefulRoutes.slice(0, 10)) {
        console.log(`- ${route}`);
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
    getDatabaseNameFromUri,
    looksLikeLocalDatabaseName,
    normalizeEmail,
    normalizeName,
    normalizeNameKey,
    parseArgs,
};
