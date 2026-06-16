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
- Notes: Current contextual authorization allows admin, parent section instructor, or derived department coordinator.

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
- Decision: When a scoped academic route is tied to a school section, delegated coordinator oversight may derive through the parent school class level using `ResponsibilityAssignment.scopeType = classLevel`.
- Reason: School sections do not derive through university departments, so scoped school oversight needs its own safe academic parent scope.
- Notes: This is limited to routes that already use contextual section-derived authorization rather than broad institution-wide coordinator access.

## D029 - University Academic Policy Uses A Dedicated Institution-Level Semester-Effective Model
- Status: Confirmed
- Decision: Store university academic policy in a dedicated `InstitutionAcademicPolicy` model instead of scattering GPA, outcome, and load rules across unrelated models.
- Reason: Future GPA, academic outcomes, prerequisite eligibility, and self-enrollment rules need one tenant-scoped source of truth that can change by semester without silently rewriting old history.
- Notes: The first slice keeps this university-only, semester-effective, and resolved through one central helper. MVP uses `effectiveFromSemesterId` only; resolution moves forward until a later policy starts instead of storing `effectiveToSemesterId`.

## D030 - Historical Academic Meaning Resolves Through Policy Versions, Not Inline Thresholds
- Status: Confirmed
- Decision: Academic outcomes and future self-enrollment eligibility must resolve the policy version for the relevant semester instead of using hardcoded thresholds inline in services.
- Reason: Institutions can define different pass bands, GPA bands, and load rules, and those rules must remain stable for prior semesters.
- Notes: Draft policies are editable; resolvable policy versions must stay deterministic by start semester, and graduation credit requirements belong in a future department/program requirement model rather than `InstitutionAcademicPolicy`.

## D031 - University Self-Enrollment Finalization Is Multi-Section, While Preview Stays Per-Section
- Status: Confirmed
- Decision: Keep browse/list and detailed preview per section, but make the actual university student self-enrollment write flow a multi-section submission/finalization route.
- Reason: Real registration needs the minimum and maximum load rules evaluated against the final submitted selection, not one target section in isolation.
- Notes: The shared `Enrollment` model stays unchanged, school flows remain excluded, the final submission still reuses the shared single-enrollment create path underneath, and the near-graduation under-minimum exception stays explicitly deferred until a real graduation requirement source exists.

## D032 - School Academic Policy Is A Separate School-Only Module
- Status: Confirmed
- Decision: Add a dedicated `SchoolAcademicPolicy` module for school promotion/result rule configuration instead of trying to reuse the university academic policy model directly.
- Reason: School policy is percentage-based and promotion-oriented, while the university policy module is GPA, credit-hour, and self-enrollment oriented.
- Notes: The school module currently stores only configurable grading, aggregation, failure, and promotion rules plus resolver logic; actual school outcome calculation, report cards, and promotion writes remain future work. Until first-class academic-year and school-stage models exist, those scope ids are validated as opaque tenant-scoped ObjectId inputs rather than resolved through dedicated models.

## D033 - School Outcomes Reuse Published Assessment Results
- Status: Confirmed
- Decision: Build school outcome aggregation as a calculation-only service on top of existing `Assessment` and `AssessmentResult` data instead of creating a separate marks table.
- Reason: Assessments/results already represent section-scoped school marks, publication state, weights, max scores, and student result rows.
- Notes: The first slice calculates percentages, missing-result warnings, failed subjects, and critical failed subjects only. It does not write final promotion decisions, create report cards, or use GPA/credit-hour logic.

## D034 - School Report Cards Are Read-Only Projections First
- Status: Confirmed
- Decision: Expose school semester/yearly report cards and class promotion summaries as read-only projections over roster assignments, school outcome aggregation, and school promotion decision services.
- Reason: Admins need reviewable report-card and promotion-decision previews before any irreversible final promotion persistence or class movement exists.
- Notes: These APIs do not write final outcomes, do not update class assignments, and do not automatically promote students. Missing results remain warnings with explicit incomplete state.

## D035 - School Final Outcomes Are Explicit Confirmations, Not Class Movement
- Status: Confirmed
- Decision: Store school yearly final outcomes in a dedicated tenant-scoped `SchoolFinalOutcome` record that separates calculated decisions from final/overridden decisions.
- Reason: Admins need an auditable confirmation/override step before any future class-placement automation exists.
- Notes: Manual overrides require a reason, duplicate non-cancelled final outcomes are blocked in service logic, and finalization does not update `SchoolClass`, `ClassLevel`, roster assignments, GPA, or credit-hour data.

## D036 - University Academic Implementation Files Use University Prefixes
- Status: Confirmed
- Decision: Rename clearly university-only academic implementation files to use `university` prefixes while keeping existing API route URLs unchanged.
- Reason: School academic modules are explicitly school-prefixed and percentage-based, while the older academic policy/outcome/self-enrollment files are GPA, credit-hour, and university-registration specific.
- Notes: Shared primitives such as `Subject`, `Section`, `Enrollment`, `Assessment`, and `AssessmentResult` remain shared. `InstitutionAcademicPolicy` keeps its model name for now to avoid unsafe persistence/collection churn.

## D037 - Shared Academic Profile Facade Delegates By Institution Type
- Status: Confirmed
- Decision: Expose shared academic profile routes through one facade service that loads `Institution.type` and delegates to school or university providers.
- Reason: The platform needs one multi-tenant academic profile surface, but school and university academic meaning remains different.
- Notes: The facade must stay read-only and must not become a mixed calculation engine. School calculations stay in school report-card/outcome/final-outcome services through `buildSchoolAcademicProfile`; university GPA/credit behavior stays in `universityAcademicOutcomeService` through `buildUniversityAcademicProfile`.

## D038 - University Repeat Policy Is Admin Configurable
- Status: Confirmed
- Decision: Store university repeat behavior inside `InstitutionAcademicPolicy.repeatPolicy`.
- Reason: Institutions need configurable repeated-attempt treatment without hardcoding one global GPA, credit, prerequisite, or repeat-enrollment rule.
- Notes:
  - Default GPA repeat method is `best_attempt_only`.
  - Admin/owner can choose `all_attempts`, `latest_attempt_only`, `best_attempt_only`, or `replace_failed_with_passed`.
  - Default earned-credit method is `count_once_per_subject`; legacy repeated-pass credit summing is available through explicit `count_each_passed_attempt`.
  - Default prerequisite method is `best_passed_attempt`; `latest_attempt` is available when a university wants latest-attempt prerequisite evaluation.
  - `blockRepeatAfterFinalPass` controls whether `passed_final` blocks future self-enrollment repeats.
  - `allowGradeImprovementRepeats` controls whether `passed_improvable` can be repeated.
  - Old policies without `repeatPolicy` resolve through the new academic defaults. Explicit `repeatPolicy.enabled=false` preserves legacy GPA/credit behavior as closely as possible.
  - This is university-only and does not affect school academic policy, report-card, promotion, or final-outcome modules.

## D039 - University Academic Standing Rules Are Admin Configurable And Live-Calculated
- Status: Confirmed
- Decision: Store university GPA-based standing rules inside `InstitutionAcademicPolicy.academicStandingRules` and calculate standing live/read-only in the university academic profile.
- Reason: Universities need configurable good-standing, warning, probation, and suspension thresholds without copying school promotion/final-outcome semantics or hardcoding one GPA boundary set.
- Notes:
  - Standing statuses are university-style: `no_standing_yet`, `good_standing`, `academic_warning`, `probation`, `suspension`, and `review_required`.
  - Normal GPA bands allow only `good_standing`, `academic_warning`, `probation`, and `suspension`; `no_standing_yet` and `review_required` are system-derived.
  - Default rules are GPA >= 2.0 good standing, 1.7 to < 2.0 academic warning, 1.0 to < 1.7 probation, and < 1.0 suspension.
  - Old university policies without `academicStandingRules` resolve to the default standing rules.
  - Standing is not stored or finalized in MVP; it is calculated from the current official university academic profile summary.
  - GPA exactly at the configured GPA scale maximum matches the top standing band, even if that band explicitly uses `maxCumulativeGpaExclusive` equal to the scale maximum.
  - `section_not_closed` explanations remain visible in academic profiles, but they do not by themselves force `review_required` when the student already has finalized official GPA data.
  - `allowedToContinue` is informational only for now and does not block self-enrollment.
  - Graduation review, transcript locking, final standing snapshots, enforcement, appeals, and manual override workflow remain deferred.
  - This is university-only and does not affect school promotion, school report cards, or `SchoolFinalOutcome`.

## D040 - University Academic Standing Dashboards Are Read-Only Live Reports
- Status: Confirmed
- Decision: Expose university academic standing summary/list APIs as live read-only reports over the current official university academic profile calculations.
- Reason: Admins need an institution-wide standing dashboard, and instructors need a scoped view of their own assigned students, without introducing stored standing snapshots or enforcement.
- Notes:
  - Admin/owner institution-wide routes are guarded by current `section.manage` access and remain university-only.
  - Instructor routes are scoped through `Section.instructorMemberId` and dedupe students enrolled in multiple assigned sections.
  - Dashboard semester, department, and instructor scopes include only current `Enrollment.status = enrolled` rows; `dropped` enrollments do not pull students into scoped standing lists.
  - Dashboard standing uses the active `academicStandingRules` from the university academic policy through the existing outcome/profile standing services; GPA thresholds are not hardcoded in the report.
  - Supported MVP filters are `standing`, `minGpa`, `maxGpa`, `semesterId`, `departmentId`, `search`, `page`, and `limit`; department filtering is derived through `Subject`, not stored on `Section`.
  - `programId` filtering is deferred until a real program/degree requirement model exists.
  - Standing remains calculated live and is not stored/finalized. `allowedToContinue` remains informational only and does not affect self-enrollment.
  - Live per-student profile calculation is acceptable for the MVP dashboard with conservative pagination and bounded row-building concurrency; a batch aggregation path or denormalized/reporting store can be revisited if dashboard volume grows.

## D041 - School Promotion Dashboards Use School-Native Outcomes
- Status: Confirmed
- Decision: Expose school promotion dashboard summary/list APIs as read-only reports over school promotion/final-outcome data, not university standing.
- Reason: Schools need promotion outcome dashboards with school-native decisions while preserving separate university GPA/standing semantics.
- Notes:
  - Dashboard decisions are `promoted`, `repeat_year`, `conditional_promotion`, `manual_review`, `incomplete`, and `no_final_outcome_yet`.
  - Admin/staff institution-wide routes are guarded by current `class.manage` access and are school-only.
  - Instructor routes are scoped through `Section.instructorMemberId` and only active `Enrollment.status = enrolled` rows in policy semesters.
  - Instructor routes expose only section-owned subject/semester outcome rows under `sectionOutcomes`. They do not expose full yearly promotion decisions, final outcomes, yearly averages, `allowedToPromote`, or failed-subject summaries.
  - Instructor section dashboards reject promotion-only query filters such as `decision` and `finalized`.
  - A non-cancelled `SchoolFinalOutcome` is the official source when present. Without a final outcome, rows use live `schoolOutcomeService` + `schoolPromotionService` calculations.
  - Incomplete live yearly outcomes are counted as `incomplete`; unavailable roster/context/live calculation rows are counted as `no_final_outcome_yet`.
  - Incomplete live rows always return `allowedToPromote=false`, even if the underlying promotion decision would otherwise be promotable from partial data.
  - Dashboard warnings are normalized to safe `{ code, message, ...safe ids }` objects before being returned.
  - Transfers across different policy semesters are tolerated by using the latest resolvable active class assignment for admin yearly live calculation; ambiguous same-semester active assignments return a normalized warning row.
  - `academicYearId` remains an explicit route parameter for dashboard backward compatibility; callers can use the shared active AcademicYear resolver to discover it.
  - Dashboards are read-only and do not finalize, override, promote, place students into next-year classes, create snapshots, or add year rollover behavior.
  - Live per-student row calculation uses bounded local concurrency for MVP; year-close snapshots or batch reporting can be revisited later if dashboard volume grows.

## D042 - AcademicYear Is A First-Class Tenant Record
- Status: Confirmed
- Decision: Store academic years in a shared tenant-scoped `AcademicYear` model for both school and university institutions.
- Reason: `academicYearId` should no longer be only an opaque ObjectId invented by clients; policies, semesters, report cards, final outcomes, and dashboards need a real year record and active-year discovery.
- Notes:
  - One active academic year is allowed per institution, enforced by service checks and a partial unique index.
  - Academic year names are unique per institution through normalized-name uniqueness; the same name is allowed in different institutions.
  - `Semester.academicYearId` is optional initially for backward compatibility with existing records and tests.
  - School academic policy `appliesTo.academicYearId` validates a real, non-archived academic year.
  - School policy semester weights compare `Semester.academicYearId` to the policy year when the semester link exists, but old unlinked semesters are still accepted.
  - Existing explicit `academicYearId` routes remain stable; active-year resolution is additive.
  - Year rollover, automatic next-year placement, graduation eligibility, transcript locking, and historical snapshots remain deferred.

## D043 - Homework Is A Section-Linked Submission Workflow Separate From Assessment Results
- Status: Confirmed
- Decision: Add shared `Homework` and `HomeworkSubmission` models for section-linked homework/project workflows, with optional `Homework.assessmentId` for graded tasks.
- Reason: Schools need offline/manual tracking and universities need online PDF submission, while assessment grading already belongs in `Assessment` / `AssessmentResult`.
- Notes:
  - `Homework` stores task instructions, due date, submission mode, status, and optional assessment/session links.
  - `HomeworkSubmission` stores one current offline/manual or online-upload submission state per homework + enrollment.
  - `AssessmentResult` remains unchanged and continues to store scores/results only.
  - `assessmentId` is optional; ungraded homework can exist without an assessment.
  - Student visibility and submission are controlled through active section `Enrollment`.
  - Online upload files are stored outside public `/uploads` and are served only through protected download authorization.
  - Homework submission storage must not be exposed through `express.static`; only the protected download route may serve files after service-level authorization.
  - Student uploads do not set `markedByUserId`; that field is reserved for staff/instructor marking or review.
  - Instructor/manual marking is limited to active enrollments and `submissionMode=offline`.
  - Missing roster rows are computed from active enrollments; persisted `missing` rows exist only when staff manually records them.
  - `submissionMode` cannot change after submissions exist, to avoid mixing offline and online workflow meaning.
  - Multiple resubmission history, reminders, grading/resubmission notifications, plagiarism checks, and cloud storage are deferred.

## D044 - Homework Assigned Notifications Are Best-Effort And Enrollment-Scoped
- Status: Confirmed
- Decision: Send lightweight homework/project assignment emails only when homework becomes `assigned`.
- Reason: Students should be notified when work is actually assigned, while draft edits and later workflow changes should not spam them.
- Notes:
  - Notifications are sent after a successful homework create with `status=assigned` or after a successful `draft -> assigned` status transition.
  - Draft, closed, archived, failed transitions, same-status updates, and generic homework edits do not send assignment emails.
  - Recipients are current active enrolled section students with active same-institution student memberships and usable emails.
  - Email sending is best-effort: failures are logged and never roll back or fail the homework API.
  - Emails include homework/project title, type, section, due date when present, submission mode, and a login instruction.
  - Emails must not include private submission file paths, file keys, raw DB documents, scores, grading data, or internal audit fields.
  - Reminder, grading, resubmission, plagiarism, and notification-tracking workflows are deferred.

## D045 - Section Materials Are Separate Private Learning Resources
- Status: Confirmed
- Decision: Add a dedicated `SectionMaterial` module for section learning resources such as lecture PDFs and study PDFs, separate from `Homework`.
- Reason: Materials are consumed/downloaded by students, while homework is an assigned task/submission workflow.
- Notes:
  - `SectionMaterial` never creates `HomeworkSubmission` rows and does not use homework deadline, late, missing, returned, or submission logic.
  - V1 supports private PDF file resources only, with `sourceType=file` reserved for future expansion.
  - Material files are stored in private `storage/section-materials`, not public `/uploads`.
  - The upload middleware and service both validate PDF-only metadata; service validation also rejects unsafe generated file keys as defense-in-depth.
  - Downloads go through service-level authorization before returning a private file path to the controller.
  - Students can list/download only `published` materials for sections where they have an active `Enrollment.status = enrolled` row.
  - Staff management reuses the existing section-derived oversight pattern: admin, parent section instructor, university department coordinator, or school class-level coordinator.
  - Draft and archived materials are hidden from students; archived materials are read-only in V1.
  - Notifications, folders/categories, non-PDF files, links, video/recordings, cloud storage, and PDF magic-byte sniffing are deferred.

## D046 - Attendance Institution Policy Produces Analytics Risk Only
- Status: Confirmed
- Decision: Apply existing `Institution.policies` attendance fields to section attendance analytics as warning/drop-risk signals only.
- Reason: Attendance risk should be visible to instructors/admins without silently changing enrollment, GPA, percentages, promotion decisions, academic standing, or final outcomes.
- Notes:
  - Section analytics derives `attendancePolicySummary` from `Institution.policies` with safe defaults.
  - Per-student analytics rows include `attendanceRisk.status = good|warning|drop_risk`.
  - `effectiveAbsences = absentCount + floor(lateCount / lateToAbsenceRatio) + excusedCount` only when `excusedCountsAsAbsence=true`.
  - `drop_risk` wins over `warning`; threshold value `0` disables that threshold.
  - No `Enrollment.status` updates, auto-drop workflow, `Subject` changes, GPA/percentage changes, promotion changes, standing changes, final-outcome writes, or notifications are introduced.
  - TODO/verify: design a duplicate-aware escalation/notification workflow later if heads/admins/academic managers should be notified automatically.

## D047 - Stripe Billing For Institution Subscriptions
- Status: Confirmed
- Decision: Use Stripe Billing for platform institution subscriptions, not Stripe Connect.
- Reason: The platform sells subscriptions to institutions; it is not routing payments to connected school/university accounts in Phase 1.
- Notes:
  - Stripe Customer and Subscription identifiers live in a tenant-scoped `InstitutionBillingProfile`.
  - Stripe Customer and Subscription identifiers are protected with partial unique indexes so nullable ids remain allowed while real Stripe ids cannot be linked to multiple institutions.
  - Stripe webhooks are the source of truth for subscription status changes.
  - Stripe webhook event ids are stored in `StripeWebhookEvent` with `processing|processed|failed` status to prevent duplicate processing while allowing failed events to retry safely.
  - Checkout uses Stripe-hosted subscription Checkout Sessions and never stores card/payment data.
  - Phase 1 does not add global billing access gates, plan limits, student payments, or Stripe Connect.
  - TODO/verify: add an explicit app-access billing gate later after product rules for grace periods, trials, and failed-payment access are agreed.

## D048 - Generic Section List Uses Role-Aware Read Scope
- Status: Confirmed
- Decision: Keep `GET /institutions/:institutionId/sections` as the clean section list endpoint and guard it with `section.read`, while enforcing staff scope in `sectionService`.
- Reason: Instructors already have `section.read` and need a clean list of their assigned sections without receiving broad institution-wide section access.
- Notes:
  - Admin/manage access keeps the existing broad institution list behavior and existing filters.
  - Instructor read access ignores client-provided instructor identity for scoping and uses the authenticated membership id as `Section.instructorMemberId`.
  - If an instructor supplies another `instructorMemberId` filter, the result is an empty list rather than exposing other instructors' sections.
  - Owner access is resolved separately from admin role when the institution record is loaded.
  - Coordinator responsibility access is added only through active same-tenant scoped assignments and final section queries combine client filters with backend access conditions.
  - `GET /sections/:sectionId` uses the same read-scope enforcement as the list route.
  - Non-owner student memberships stay blocked from generic staff/admin section list/detail routes even if a responsibility row exists.
  - Scoped section detail readers do not receive creator audit metadata; owner/admin keep the existing full detail shape.
  - Student memberships remain blocked from this generic staff/admin list even though students keep `section.read` for student-facing section-linked flows.

## D049 - Responsibility Permissions Are Backend-Computed
- Status: Confirmed
- Decision: Treat `ResponsibilityAssignment.permissions` as untrusted for authorization decisions and compute effective responsibility permissions from the backend `RESPONSIBILITY_PERMISSIONS` catalog.
- Reason: Scoped responsibilities must not become a client-controlled path to broad permissions such as billing, institution, or membership management.
- Notes:
  - `head`, `coordinator`, and `mentor` remain scoped responsibilities, not `Membership.role` values.
  - `ResponsibilityAssignment` is currently keyed by `institutionId + userId`, not `membershipId`; callers must always include `institutionId` when resolving responsibility authority.
  - Active/date checks still apply to responsibility assignments.
  - Active scoped catalog:
    - `head`: `academicRisk.read_scope`, `academicProfile.read_scope`, `academicStanding.read_scope`, `academicDecision.read_scope`, and `academicDecision.recommend_scope` for dedicated academic oversight/decision services.
    - `coordinator`: `section.read_scope`, `sectionSession.read_scope`, `sectionSession.manage_scope`, `attendance.read_scope`, `attendance.manage_scope`
    - `mentor`: no active scoped permissions yet, pending student/mentor-specific service enforcement.
  - Allowed responsibility scope combinations:
    - `head`: `institution`, `department`, `classLevel`
    - `coordinator`: `department`, `classLevel`, `class`, `section`
    - `mentor`: `class`, `section`
  - `ResponsibilityAssignment` validates responsibility/scope combinations, and helper resolution ignores legacy rows with invalid combinations.
  - ResponsibilityAssignment management routes are owner/admin-only; management authority is derived from institution ownership or base `Membership.role` permissions such as `membership.manage`, not from scoped responsibility assignments.
  - Management actors must have an active same-institution membership with `status = active`; missing or non-active actor membership status fails closed.
  - ResponsibilityAssignment targets must have an active same-institution `Membership.role = instructor`; student targets are rejected because they must not receive staff scoped authority, and admin targets are rejected because admins already have broad base-role permissions.
  - Create/update management payloads do not accept raw `permissions`, tenant override ids, membership ids, audit actor ids, `userId` changes, or `responsibilityType` changes.
  - Deleting a ResponsibilityAssignment is implemented as deactivation: `isActive=false`, with `endAt` set to now when it is empty or in the future.
  - Duplicate active assignment creation for the same institution + user + responsibility type + scope is rejected; updates also check duplicate active assignments when changing scope or setting `isActive=true`; reusing the existing unique model key means a deactivated same-key row may be reactivated instead of inserting a second row.
  - Section read access for coordinator is resolved in `sectionService` into tenant-scoped `Section.find(...)` conditions derived from assigned department, class level, class, or section scopes.
  - Section-session and attendance scoped operations now check backend catalog permissions while deriving section, class, department, and class-level scope from trusted section/subject/class records.
  - Head assignments do not grant generic operational section, section-session, attendance, schedule, homework, assessment, enrollment, result, membership, billing, or material staff powers.
  - Mentor responsibility does not grant generic staff section list/detail management scope.
  - TODO/verify: do not activate `section.manage_scope`, `studentProfile.read_scope`, `attendance.excuse_manage_scope`, `academicDecision.review_scope`, `academicDecision.approve`, `academicDecision.reject`, `academicDecision.apply`, `enrollment.drop`, `enrollment.review_scope`, or `studentDropRisk.review_scope` until real service-level enforcement and tests exist.

## D050 - Head Academic Oversight Is Read-Only And Separate From Operational Endpoints
- Status: Confirmed
- Decision: Expose Head academic oversight through dedicated read-only routes instead of allowing Head to reuse coordinator/instructor operational endpoints.
- Reason: Heads need visibility into academic profile, standing, attendance risk, and grade risk without gaining session, attendance, assessment, enrollment, or decision powers.
- Notes:
  - Head effective permissions for this area are limited to academic oversight reads plus AcademicDecision Phase 1 read/recommend: `academicRisk.read_scope`, `academicProfile.read_scope`, `academicStanding.read_scope`, `academicDecision.read_scope`, and `academicDecision.recommend_scope`.
  - Head allowed scopes remain `institution`, `department`, and `classLevel`; no class or section Head scope is added.
  - The oversight resolver accepts owner/admin institution-wide access, or active same-tenant Head assignments with valid dates and backend-computed permissions.
  - Academic oversight fails closed if the middleware-provided `actorMembership.userId` does not match the authenticated actor user.
  - Multiple independent Head assignments are additive OR grants in V1. A Head assigned to Math department and Grade 10 class-level can see the union of Math-scope students and Grade 10-scope students; those two assignment rows are not reinterpreted as an implicit Math AND Grade 10 scope.
  - If product needs AND-style scopes later, represent them with an explicit combined scope model/configuration rather than deriving combined meaning from separate `ResponsibilityAssignment` rows.
  - Department Head scope first tenant-verifies assigned `Department` ids, then derives visible students through `Subject.departmentId`, same-tenant sections, and enrolled `Enrollment` rows.
  - Class-level Head scope derives through `Subject.classLevelId` and `SchoolClass.classLevelId`, then same-tenant sections and enrolled rows.
  - Optional filters can narrow the resolved student, section, subject, department, class-level, and school-class scope but cannot expand it.
  - Risk list/summary reads require `academicRisk.read_scope` and return risk-only rows; academic profile fields require `academicProfile.read_scope`, and academic standing fields require `academicStanding.read_scope`.
  - Attendance risk uses the existing `Institution.policies` attendance fields as response-only signals, but counts records only when the student has an active enrollment for the same section; no qualifying records is `unknown`.
  - Grade risk is a conservative read-only projection over published `Assessment` and `AssessmentResult` rows, limited to each student's active enrolled sections so unrelated visible-section assessments do not become false missing results; invalid published assessment configuration does not make the student `good`; TODO/verify: replace fixed grade-risk bands with institution policy-aware rules if needed.
  - `AssessmentResult.sectionId` is required and is populated from the parent assessment section in the assessment create/write flows. Duplicate result rows are DB-protected by `institutionId + assessmentId + enrollmentId`; TODO/verify whether a direct `institutionId + assessmentId + studentMemberId` unique index is needed later.
  - University standing/profile summary reuses existing university academic outcome and standing calculations where available; school standing/profile remains compact/null until a school-specific standing/profile summary is needed; unexpected calculation failures return safe null fields with `dataUnavailable=true`.
  - No write endpoints, student drops, removals, final decisions, attendance edits, grade/result edits, or enrollment changes are introduced.

## D051 - AcademicDecision Phase 1 Is Recommendation-Only
- Status: Confirmed
- Decision: Add a first-class tenant-scoped `AcademicDecision` workflow record for Head enrollment-drop recommendations, plus minimal in-app `Notification` records for administrative review.
- Reason: Heads need an auditable escalation path for risky enrollments without gaining direct operational power to drop students.
- Notes:
  - Phase 1 supports only `decisionType = enrollment_drop`.
  - A Head can create/list/get scoped recommendations and cancel their own `recommended` decision.
  - Heads cannot approve, reject, apply, update Enrollment status, deactivate Membership, remove a student from a Subject, or remove a student from the institution.
  - Head decision authority uses backend-computed `academicDecision.read_scope` and `academicDecision.recommend_scope`; raw stored `ResponsibilityAssignment.permissions` remains ignored.
  - Coordinator and Mentor responsibilities do not gain AcademicDecision access.
  - Recommendation validation is based on trusted tenant-scoped DB records: active actor membership, active Head assignment, active student membership, exact Enrollment by `_id + institutionId + studentMemberId`, exact Section by `_id + institutionId`, and Head section/student scope.
  - New recommendations start as `recommended`, set `recommendedByUserId` / `recommendedAt`, and append a history entry.
  - Duplicate open enrollment-drop recommendations are blocked by `isOpen=true` in service logic and by a partial unique model index for one open `institutionId + enrollmentId + decisionType`; `recommended`, `approved`, and `applying` are open, while rejected, cancelled, and applied history can coexist.
  - `evidenceSnapshot` and `scopeSnapshot` are server-built audit evidence only and must not become the only future authorization source.
  - Decision target identity fields and evidence/scope snapshots are immutable after creation.
  - Workflow transition validation and keeping `status` synchronized with `isOpen` remain service responsibilities; `approved` remains open until the decision reaches a terminal state such as `applied`, `cancelled`, or another closed outcome.
  - Historical list/get visibility is based on the decision's stored `sectionId` being inside the Head's current authorized section scope; the student does not need to remain actively enrolled for historical visibility.
  - Unsupported Head assignment scope types fail closed for AcademicDecision section matching; Head scope remains limited to `institution`, `department`, and `classLevel`.
  - Creating a recommendation creates in-app `academic_decision_review_required` notifications for active same-institution Admin memberships, plus the Institution owner when the owner has active same-institution membership access, deduped by user id.
  - Notification messages intentionally contain no grades, GPA, attendance counts, or private evidence; notification `data` contains only safe ids.
  - Notification identity/content is immutable after creation; only `readAt` changes. Notification creation is idempotent by `recipientUserId + academicDecisionId + type`; Phase 1 uses best-effort post-decision creation and does not claim transaction atomicity or durable retry/outbox behavior yet.
  - WebSockets, push notifications, emails, application behavior, and Enrollment mutations remain deferred. Admin/Owner approve/reject review is added separately in D052.

## D052 - AcademicDecision Phase 2 Adds Admin/Owner Review Without Application
- Status: Confirmed
- Decision: Add Admin/Owner review routes for Head enrollment-drop recommendations, limited to approving or rejecting `recommended` decisions.
- Reason: Administrative review should be auditable and explicit before any future Enrollment-changing application step exists.
- Notes:
  - Admin review authority is the explicit base-role permission `academicDecision.review`; Owner authority is checked separately with `institution.ownerUserId === actorUserId` plus an active same-institution membership.
  - Head responsibilities do not receive review/approve/reject/apply permissions. Coordinator, Mentor, normal instructor, and student memberships cannot review decisions.
  - Review transitions are dedicated service functions/routes, not a generic client-controlled status update.
  - Allowed Phase 2 transitions are `recommended -> approved` and `recommended -> rejected`; `approved`, `rejected`, `cancelled`, and `applied` cannot be reviewed again.
  - A reviewer cannot approve or reject their own recommendation, even if they are also Admin or Owner. The recommender can still use the Head cancellation flow while the decision is `recommended`.
  - Approval revalidates current trusted records for the exact decision, Enrollment, student Membership, Section, active Enrollment status, and tenant relationships. `evidenceSnapshot` remains audit evidence only.
  - If current evidence risk categories or academic-standing value differ from the original snapshot, approval returns `409`; numeric evidence drift without category drift is a TODO/verify product policy. The old recommendation may be rejected and a Head may create a new one if still needed.
  - Approval sets `status=approved`, keeps `isOpen=true`, stores approval actor/time fields, appends history, and does not set application fields or update Enrollment.
  - Rejection sets `status=rejected`, `isOpen=false`, stores rejection actor/time fields, appends history with a bounded reason, and does not update Enrollment.
  - Approval/rejection creates idempotent in-app notifications to the recommending Head with safe ids only and resolves all unread `academic_decision_review_required` notifications for that decision inside the same institution.

## D053 - AcademicDecision Phase 3 Applies One Approved Enrollment Drop
- Status: Confirmed
- Decision: Add an Admin/Owner-only apply step for approved `enrollment_drop` AcademicDecision records that drops exactly the referenced Enrollment.
- Reason: The actual Enrollment mutation should be separate from Head recommendation and Admin/Owner review, but still auditable and tenant-scoped.
- Notes:
  - Admin application authority uses explicit base-role `academicDecision.apply`; Owner authority is checked separately through `institution.ownerUserId === actorUserId` plus an active same-institution membership.
  - Head, Coordinator, Mentor, normal instructor, and student memberships cannot apply AcademicDecision records.
  - Application is exposed only through a dedicated apply route/service function, not through arbitrary status updates.
  - New application claims require `decisionType=enrollment_drop`, `status=approved`, and `isOpen=true`; recommended, rejected, cancelled, and unrelated decisions cannot be applied. Existing `applying` decisions enter the recovery path.
  - The Enrollment mutation uses the existing shared Enrollment statuses: `enrolled -> dropped`.
  - The exact Enrollment update is scoped by `_id + institutionId + studentMemberId + sectionId + status=enrolled`; the client cannot choose the target or resulting status.
  - Application does not deactivate Membership, delete Enrollment, delete attendance, delete grades/results, delete homework/submissions, delete materials, remove Subjects, or change billing.
  - The repo has no existing MongoDB transaction/session pattern, so Phase 3 uses a minimal internal `applying` status as a claim marker before changing Enrollment. The claim stores `applyingByUserId`, `applyingAt`, and an `approved -> applying` history entry.
  - Enrollment drops preserve audit linkage on the Enrollment through `droppedAt`, `droppedByUserId`, and `droppedByAcademicDecisionId`.
  - If the Enrollment update fails, the service re-reads the exact Enrollment. It reverts `applying -> approved` only when the Enrollment is verified still `enrolled`; if the Enrollment was dropped by this exact decision it finalizes, otherwise it returns a manual-recovery conflict.
  - Stale `applying` decisions can be reclaimed after the configured recovery window when the exact Enrollment is still `enrolled`. Recent `applying` claims return an in-progress conflict. Missing claim metadata fails closed unless exact Enrollment linkage proves a safe finalization path.
  - Successful application sets `status=applied`, `isOpen=false`, `appliedByUserId`, `appliedAt`, and appends one `applying -> applied` history entry. `applyingByUserId` and `applyingAt` are preserved as claim audit metadata.
  - Already-applied decisions are idempotent only when the exact Enrollment is `dropped` and linked to the same AcademicDecision; mismatches return a manual-recovery conflict without another Enrollment update, history entry, or notification.
  - Successful application sends idempotent in-app notifications to the recommending Head (`academic_decision_applied`) and the affected student (`enrollment_status_changed`) with safe navigation ids and no private evidence or review notes.
  - Existing inactive, closed, or cancelled Sections may still be used for review/application cleanup as long as the exact tenant-scoped Section record exists; no new Section status policy is introduced here.
