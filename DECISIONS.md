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
- Decision: Keep one shared `Section` model and service for university now and school later.
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
