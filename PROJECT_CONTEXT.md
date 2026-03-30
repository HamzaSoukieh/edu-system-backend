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
- `Subject`
  - shared catalog item
  - university currently links through `departmentId`
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
  - status change authorization allows admin, parent section instructor, or derived department coordinator
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
- Not done yet:
  - attendance analytics / reporting
  - student attendance self-view/history

## Next Likely Modules
- Attendance analytics / reporting
- Student attendance self-view/history
- Scoped responsibility routes
- School class-level model / academic unit strategy

## Current Priorities
- Keep section design reusable for school later.
- Avoid hard-linking Section to university-only structure.
- Keep shared services where possible.
- Prefer minimal safe changes over broad refactors.

## Important Constraints
- Tenant-owned data must always be filtered by `institutionId`.
- `User`, `Membership`, and `MemberProfile` stay separate by responsibility.
- Only one active semester per institution.
- Keep `Subject` shared.
- Keep `Section` shared.
- Do not store `departmentId` directly on `Section`.
- For university filters, derive department through `Subject`.
- Keep `Enrollment` shared.
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
