# Project Context

## Project Summary
- Backend for a multi-tenant Edu SaaS platform.
- One shared system supports both universities and schools.
- Each institution manages its own structure and data under tenant scope.

## Business Goal
- Let an institution onboard, configure its academic structure, manage members, and run semester-based teaching workflows.
- Keep one reusable backend instead of separate school and university backends.

## Current Architecture
- Stack:
  - Node.js
  - Express
  - MongoDB / Mongoose
- App style:
  - CommonJS
  - route -> middleware -> controller -> service -> model
- Institution-scoped business routes live under:
  - `/institutions/:institutionId/...`

## Main Entities / Models
- `User`
  - auth only
- `Institution`
  - tenant root
  - type supports `school` and `university`
- `Membership`
  - institution access + role
- `MemberProfile`
  - personal/member info
- `Department`
  - current university-facing academic grouping
- `ClassLevel`
  - school academic grouping for school-side subject scope
- `SchoolClass`
  - actual school cohort such as Grade 7 A
- `ClassStudentAssignment`
  - semester-scoped school roster membership
- `Subject`
  - shared catalog item
  - university links through `departmentId`
  - school links through `classLevelId`
- `Semester`
  - semester calendar and teaching days
- `Section`
  - one offered instance of a subject in one semester
- `Enrollment`
  - one student membership linked to one section
  - status-based, tenant-scoped participation record
- `SectionSession`
  - one actual dated meeting of a section
  - foundation for future attendance and QR/barcode check-in
- `ResponsibilityAssignment`
  - scoped delegated access model
  - not yet a major active module

## Completed Modules
- Auth
  - signup
  - login
  - signup OTP verify/resend
  - forgot/reset password
- Institution
  - create additional institution after login
  - current institution context
  - update
  - logo upload
- Departments
  - create
  - list
  - get by id
  - update
  - delete
- Subjects
  - create
  - list
  - get by id
  - update
  - delete
- Semesters
  - create
  - list
  - active semester
  - get by id
  - update
  - delete
- Members
  - create
  - list
  - get by membership id
  - update
  - status update
  - profile picture upload

## Current Module In Progress
- Sections / Section-Linked Workflows
  - create
  - list
  - get by id
  - update
  - delete
  - schedule validation against semester teaching days
  - room conflict validation for overlapping same-room bookings
  - list response is lightweight
  - detail response is fuller
  - department filtering is derived through Subject
- Enrollments
  - create
  - list
  - get by id
  - status update
  - one record per institution + section + student membership
  - capacity checks use current enrolled records
- Section Sessions
  - create
  - generate many dated sessions from recurring section schedule
  - list
  - get by id
  - update
  - dedicated status update with note + metadata
  - session detail includes lightweight section + subject summaries
  - status change authorization allows admin, parent section instructor, or derived department coordinator/head
  - generated sessions do not auto-resync later if semester dates or future plans change
- Attendance
  - instructor opens attendance on a section session
  - instructor can issue rotating QR token for student check-in
  - student QR check-in is authenticated and enrollment-aware
  - QR token issuance and QR check-in only work on the scheduled local session date
  - same-day QR check-in is `present` before or within the small grace window after the later of the scheduled session start time and `attendanceOpenedAt`, and `late` after that window
  - instructor can manually upsert attendance
  - closed attendance can still be corrected manually for the same dated session by authorized staff
  - roster is enrollment-based and filterable
  - closing attendance marks remaining enrolled students absent
  - logged-in students can fetch their own attendance history from final `AttendanceRecord` data with optional `sectionId`, `fromDate`, `toDate`, and `status` filters
  - authorized staff can fetch section-level attendance analytics for finalized attendance data
  - attendance oversight reads/corrections that reuse section-session scoped authorization allow the same department-derived coordinator/head path
  - analytics include only closed, non-cancelled section sessions and use filtered finalized `AttendanceRecord` rows as the attendance-rate denominator
- Not done yet:
  - broader attendance reporting beyond section-level finalized analytics

## Next Likely Modules
- Scoped responsibility routes
- School class-level model / academic unit strategy
  - school class-level support is now being implemented with:
    - class levels
    - school classes
    - semester-scoped class roster assignments
    - school roster -> section enrollment sync

## Current Priorities
- Keep section design reusable for school later.
- Avoid hard-linking Section to university-only structure.
- Keep shared services where possible.
- Prefer minimal safe changes over broad refactors.
- Use status-only lifecycle for new school modules in MVP.

## Important Constraints
- Tenant-owned data must always be filtered by `institutionId`.
- `User`, `Membership`, and `MemberProfile` stay separate by responsibility.
- One `User` may own or belong to multiple institutions.
- Only one active semester per institution.
- Keep `Subject` shared.
- Keep `Section` shared.
- Do not store `departmentId` directly on `Section`.
- For school, store `schoolClassId` on `Section` and derive roster through class assignments plus synced enrollments.
- For university filters, derive department through `Subject`.
- Keep `Enrollment` shared.
- For school, keep `Enrollment` as backend-managed technical participation data, not student self-enrollment.
- Keep `SectionSession` shared.
- `ResponsibilityAssignment` should be used only when a route has a real scope.

## TODO / Verify
- Verify long-term academic unit design for school support before adding class-level logic.
- Verify when pagination should be added to section lists.
- Verify when section delete should become blocked by linked enrollment/attendance data.
- Verify whether `lecture` / `lab` should remain the long-term shared `sessionType` enum for school support.
- Verify whether session cancellation should later support richer notification flows beyond basic email.
- Verify whether attendance should later support coordinator/admin oversight after instructor-first flow is stable.
- Verify whether old section schedules without `schedule[].sessionType` should get a dedicated backfill path before bulk session generation is used broadly.
