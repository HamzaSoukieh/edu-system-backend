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
- Sections
  - create
  - list
  - get by id
  - update
  - schedule validation against semester teaching days
  - room conflict validation for overlapping same-room bookings
  - list response is lightweight
  - detail response is fuller
- Not done yet:
  - delete
  - enrollment
  - attendance/scheduling flows tied to section participation

## Next Likely Modules
- Section delete
- Enrollment
- Attendance
- Section-linked scheduling
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
- `ResponsibilityAssignment` should be used only when a route has a real scope.

## TODO / Verify
- Verify long-term academic unit design for school support before adding class-level logic.
- Verify when pagination should be added to section lists.
- Verify when section delete should become blocked by linked enrollment/attendance data.
