# Decisions

## D001 - One Shared Backend For School And University
- Status: Confirmed
- Decision: Keep one multi-tenant backend that supports both institution types.
- Reason: Avoid parallel systems and duplicated logic.
- Notes: Prefer shared services with institution-type-specific validation where needed.

## D002 - Keep Architecture Simple
- Status: Confirmed
- Decision: Use `routes -> middleware -> controller -> service -> model`.
- Reason: Clear responsibilities and easier maintenance.
- Notes: Controllers stay thin; services hold business rules.

## D003 - Tenant Scope Is Mandatory
- Status: Confirmed
- Decision: Scope tenant-owned data by `institutionId` in queries and mutations.
- Reason: Multi-tenant safety.
- Notes: Use `req.tenantId` and `req.membership` from middleware.

## D004 - User / Membership / MemberProfile Split
- Status: Confirmed
- Decision:
  - `User` = auth only
  - `Membership` = institution access + role
  - `MemberProfile` = personal info
- Reason: Keeps identity, tenant access, and personal data separated cleanly.
- Notes: Keep this split stable unless there is a strong migration reason.

## D005 - One Active Semester Per Institution
- Status: Confirmed
- Decision: Only one semester may be `active` for a given institution.
- Reason: Simplifies current scheduling and active-context rules.
- Notes: Enforced in the semester module and schema/index logic.

## D006 - Subject Stays Shared
- Status: Confirmed
- Decision: Keep one shared `Subject` model.
- Reason: Course catalog logic should stay reusable across institution types.
- Notes: `creditHours` remains part of Subject academically; university requires it, school can omit it.

## D007 - Section Stays Shared
- Status: Confirmed
- Decision: Keep one shared `Section` model and service for both university and school.
- Reason: Section is the semester offering concept in both flows.
- Notes: Avoid separate school/university section systems.

## D008 - Do Not Store departmentId On Section
- Status: Confirmed
- Decision: `Section` should not have a direct `departmentId`.
- Reason: Keeps Section reusable for future school support.
- Notes: For university filtering, derive department through `Subject`.

## D009 - Section Read Shapes Split
- Status: Confirmed
- Decision:
  - list response = lightweight summary
  - detail/get-by-id response = fuller shape
- Reason: Lists should stay lighter and easier to consume.
- Notes: `createSection` and `updateSection` still return the fuller detail response.

## D010 - Room Conflict Validation Lives In Service Logic
- Status: Confirmed
- Decision: Prevent room conflicts in `Section` service logic, not by DB unique index.
- Reason: Overlap logic depends on schedule arrays and time ranges.
- Notes: Compare same institution + same semester + same room + same day + overlapping time, only for room-reserving statuses like `draft` and `active`.

## D011 - Minimal Safe Change Preference
- Status: Confirmed
- Decision: Prefer incremental changes over broad redesigns.
- Reason: Reduces regression risk and keeps momentum.
- Notes: When future school support needs a wider refactor, document it first.

## D012 - Responsibilities Are Scoped, Not Default Onboarding
- Status: Confirmed
- Decision: Base access comes from role; scoped delegated access belongs in `ResponsibilityAssignment`.
- Reason: Keeps onboarding simpler and permissions more explicit.
- Notes: Responsibility routes/workflows are still mostly pending.

## D013 - Enrollment Stays Shared And Status-Based
- Status: Confirmed
- Decision: Keep one shared `Enrollment` model for both institution types, with one record per institution + section + student membership.
- Reason: Enrollment is a cross-cutting participation concept that should stay reusable.
- Notes: Reactivation happens through status updates instead of creating duplicate enrollment records.

## D014 - SectionSession Is The Attendance Foundation
- Status: Confirmed
- Decision: Use `SectionSession` for actual dated meetings, while `Section.schedule` remains the recurring template.
- Reason: Attendance and QR/barcode check-in need a real meeting/session concept, not only a recurring section schedule.
- Notes: Keep `SectionSession` shared for school and university later.

## D015 - Section Session Status Changes Use A Dedicated Endpoint
- Status: Confirmed
- Decision: Session status changes must go through a dedicated status route and service flow.
- Reason: Status changes need note/metadata handling, contextual authorization, and optional student notification.
- Notes: Current contextual authorization allows admin, parent section instructor, or derived department coordinator/head.

## D016 - Attendance Is Anchored To SectionSession
- Status: Confirmed
- Decision: Use `SectionSession` as the attendance anchor, with one `AttendanceRecord` per enrollment per section session.
- Reason: Attendance belongs to one actual dated meeting, not only the recurring section template.
- Notes: Closing attendance fills in missing enrolled students as `absent`.

## D017 - First Attendance Flow Is Instructor-Managed With Rotating QR Token
- Status: Confirmed
- Decision: The first attendance workflow is managed only by the parent section instructor, with manual attendance plus authenticated QR check-in using a short-lived hashed token.
- Reason: This keeps the first release simple while still supporting both manual and student QR attendance.
- Notes: Only the current QR token hash + expiry are stored; old QR tokens are not kept valid. QR check-in is classified as `present` or `late` from a small grace window anchored to the later of the scheduled session start time and `attendanceOpenedAt`.

## D018 - Recurring Schedule Generates Dated SectionSession Records Without Auto-Resync
- Status: Confirmed
- Decision: Generate `SectionSession` records from the section recurring schedule across the linked semester range, but do not auto-delete or auto-regenerate future sessions later when semester dates or plans change.
- Reason: This keeps attendance anchored to real dated meetings while avoiding unsafe background rewrites of already planned sessions.
- Notes: Generation skips dates already blocked by semester off-days/exam dates and skips already existing section sessions.

## D019 - Closed Attendance Can Be Corrected Without Reopen
- Status: Confirmed
- Decision: Keep QR check-in open-only, but allow manual attendance correction after close for the same dated session through authorized staff correction flow.
- Reason: This is simpler and safer for MVP than adding attendance reopen while still allowing real correction cases like `absent -> excused`.
- Notes: Closed-session correction currently uses the manual attendance path and updates existing attendance records in place without deleting them.

## D020 - School Uses ClassLevel Plus SchoolClass
- Status: Confirmed
- Decision: For school institutions, use `ClassLevel` as the academic grouping for subjects and `SchoolClass` as the actual student cohort.
- Reason: This keeps the department concept university-only while modeling school grouping and roster concepts separately.
- Notes: `SchoolClass` stays stable across semesters; semester membership lives in `ClassStudentAssignment`.

## D021 - School Enrollment Stays Backend-Managed
- Status: Confirmed
- Decision: Keep the shared `Enrollment` model for school, but manage it only through school class roster sync instead of direct school enrollment writes.
- Reason: Attendance, analytics, and section-session flows already rely on enrollment records and should stay shared.
- Notes: School enrollment create/status-change endpoints are blocked; read flows can remain available.

## D022 - New School Modules Are Status-Only In MVP
- Status: Confirmed
- Decision: Do not add delete endpoints for `ClassLevel`, `SchoolClass`, or `ClassStudentAssignment` in the MVP.
- Reason: Status-only lifecycle is safer while roster sync, linked sections, and attendance history are still settling.
- Notes: Use `active|archived` for class levels/classes and `assigned|removed` for class roster records.

## D023 - One User Can Belong To Multiple Institutions
- Status: Confirmed
- Decision: Keep auth user identity separate from institution membership so the same `User` can create and belong to multiple institutions.
- Reason: A single account may need to manage both university and school tenants without creating a second login.
- Notes: Ownership stays on `Institution.ownerUserId`, while operational access still comes from a normal `admin|instructor|student` membership in each institution.

## D024 - Assessments Stay Shared And Section-Scoped
- Status: Confirmed
- Decision: Keep one shared assessments/results flow for both universities and schools, anchored to `Section` with optional `sectionSessionId`.
- Reason: Graded work belongs to one section offering in both institution types, and some assessments need an optional real dated-session link without splitting the model.
- Notes: Avoid separate school/university assessment systems.

## D025 - Assessment Results Snapshot Current Enrollments
- Status: Confirmed
- Decision: Creating an assessment snapshots the current active section enrollments into `AssessmentResult` rows and does not auto-resync later if enrollments or school class assignments change.
- Reason: Results should preserve the roster context that existed when the assessment was created and avoid unsafe historical rewrites.
- Notes: School assessments naturally rely on the shared enrollment rows that were already synced from class rosters.

## D026 - Announced And Published Assessments Have Separate Student Purposes
- Status: Confirmed
- Decision: Staff manage `draft|announced|published|archived` assessments, student metadata visibility uses `announced|published`, and only `published` assessments expose actual results or affect weighted section result aggregation.
- Reason: Students need upcoming assessment visibility without leaking draft grading data or blurring announcement and result-release moments.
- Notes: `announced` is metadata-only for students, `published` remains the result-release state, and V1 stays numeric-only without GPA, transcript, letter-grade, or pass/fail policy.

## D028 - Assessment Lifecycle Emails Are Best-Effort And Enrollment-Scoped
- Status: Confirmed
- Decision: On `draft -> announced`, send a lightweight announcement email to currently active enrolled section students; on `draft|announced -> published`, send a lightweight results-available email to that same current roster scope.
- Reason: Students should know when an assessment becomes visible and when results become available, without introducing a queue system or exposing scores in email.
- Notes: Notification sending is best-effort after a successful status change, uses the existing email helper pattern, and never blocks a valid status transition if delivery fails.

## D027 - School Section Oversight Can Derive Through ClassLevel
- Status: Confirmed
- Decision: When a scoped academic route is tied to a school section, delegated coordinator/head oversight may derive through the parent school class level using `ResponsibilityAssignment.scopeType = classLevel`.
- Reason: School sections do not derive through university departments, so scoped school oversight needs its own safe academic parent scope.
- Notes: This is limited to routes that already use contextual section-derived authorization rather than broad institution-wide coordinator/head access.
