# API Progress

## Completed

### Auth
- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/password/forgot`
- `POST /auth/password/reset`
- `POST /auth/otp/verify`
- `POST /auth/otp/resend`

### Institution
- `POST /institutions`
- `GET /institutions/me`
- `PATCH /institutions/:institutionId`
- `POST /institutions/:institutionId/logo`

### Departments
- `POST /institutions/:institutionId/departments`
- `GET /institutions/:institutionId/departments`
- `GET /institutions/:institutionId/departments/:departmentId`
- `PATCH /institutions/:institutionId/departments/:departmentId`
- `DELETE /institutions/:institutionId/departments/:departmentId`

### Subjects
- `POST /institutions/:institutionId/departments/:departmentId/subjects`
- `POST /institutions/:institutionId/class-levels/:classLevelId/subjects`
- `GET /institutions/:institutionId/subjects`
- `GET /institutions/:institutionId/subjects/:subjectId`
- `PATCH /institutions/:institutionId/subjects/:subjectId`
- `DELETE /institutions/:institutionId/subjects/:subjectId`

### Semesters
- `POST /institutions/:institutionId/semesters`
- `GET /institutions/:institutionId/semesters`
- `GET /institutions/:institutionId/semesters/active`
- `GET /institutions/:institutionId/semesters/:semesterId`
- `PATCH /institutions/:institutionId/semesters/:semesterId`
- `DELETE /institutions/:institutionId/semesters/:semesterId`

### Members
- `POST /institutions/:institutionId/members`
- `GET /institutions/:institutionId/members`
- `GET /institutions/:institutionId/members/:membershipId`
- `PATCH /institutions/:institutionId/members/:membershipId`
- `PATCH /institutions/:institutionId/members/:membershipId/status`

## In Progress

### Sections
- `POST /institutions/:institutionId/sections`
- `GET /institutions/:institutionId/sections`
- `GET /institutions/:institutionId/sections/:sectionId`
- `PATCH /institutions/:institutionId/sections/:sectionId`
- `DELETE /institutions/:institutionId/sections/:sectionId`
- Current implemented rules:
  - semester teaching-day validation
  - room conflict validation
  - department filtering through Subject
  - lightweight list response
  - fuller detail response
- Still missing:
  - broader linked grading/reporting flows

### Enrollments
- `POST /institutions/:institutionId/sections/:sectionId/enrollments`
- `GET /institutions/:institutionId/sections/:sectionId/enrollments`
- `GET /institutions/:institutionId/sections/:sectionId/enrollments/:enrollmentId`
- `PATCH /institutions/:institutionId/sections/:sectionId/enrollments/:enrollmentId/status`
- Current implemented rules:
  - student-only enrollment records through `Membership`
  - section and student must belong to the same institution
  - section must be `draft` or `active` to accept enrollment
  - capacity validation against current `enrolled` records
  - one enrollment record per institution + section + studentMemberId
- Still missing:
  - student self-service enrollment
  - delete/withdraw flow
  - attendance / grading linkage

### Section Sessions
- `POST /institutions/:institutionId/sections/:sectionId/sessions`
- `POST /institutions/:institutionId/sections/:sectionId/sessions/generate`
- `GET /institutions/:institutionId/sections/:sectionId/sessions`
- `GET /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId`
- `PATCH /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId`
- `PATCH /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/status`
- Current implemented rules:
  - one dated meeting per section occurrence
  - sessionType supports `lecture` and `lab`
  - sessionDate must stay within the section semester range
  - sessionDate day must be allowed by semester teachingDays
  - duplicate protection on section + date + startTime + sessionType
  - recurring section schedule can generate many dated section sessions across the linked semester range
  - generation skips semester off-days/exam dates and skips already existing sessions instead of rewriting them
  - session detail now includes lightweight `section` and `subject` summaries
  - list response stays lightweight without section/subject summaries
  - dedicated status endpoint updates only session status fields and metadata
  - generic session update should not be used for status changes
  - status-change authorization allows:
    - admin
    - the parent section instructor
    - department coordinator/head derived through `Section -> Subject -> Department`
  - cancellation emails go only to students who are both:
    - currently enrolled in the section
    - active in the same institution
- Still missing:
  - delete/cancel policy beyond status updates
  - TODO/verify for legacy sections whose schedule rows do not yet include `sessionType`

### Attendance
- `POST /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/open`
- `POST /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/qr-token`
- `PUT /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/manual`
- `GET /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/roster`
- `POST /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/close`
- `POST /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/check-in`
- `GET /institutions/:institutionId/sections/:sectionId/attendance/analytics`
- `GET /institutions/:institutionId/students/me/attendance-history`
- Current implemented rules:
  - attendance is anchored to `SectionSession`
  - only the parent section instructor can manage attendance in this step
  - attendance uses one record per enrollment per section session
  - QR flow stores only token hash + expiry in DB
  - QR tokens expire after 20 seconds and old tokens are not kept valid
  - each QR token call replaces the previous token and can be repeated while attendance stays open
  - QR token issuance and student QR check-in are only available on the scheduled local session date
  - student QR check-in requires active student membership + active enrolled enrollment
  - same-day QR check-in is `present` before or within the 10-minute grace window after the later of the scheduled section session start time and `attendanceOpenedAt`, and `late` after that window
  - QR check-in remains blocked after attendance is closed
  - manual attendance can still correct a closed dated session for authorized instructor/admin/derived coordinator/head access
  - scoped attendance oversight paths that reuse section-session authorization also allow the matching department `head`
  - roster is enrollment-based and supports:
    - `all`
    - `attended`
    - `not_attended`
    - `present`
    - `absent`
    - `late`
    - `excused`
    - `pending`
  - closing attendance creates `absent` records for still-missing enrolled students
  - logged-in students can fetch only their own tenant-scoped attendance history from existing `AttendanceRecord` rows
  - attendance history supports optional `sectionId`, `fromDate`, `toDate`, and `status` filters
  - attendance history response stays record-first and includes lightweight nested `session`, `section`, and `subject` summaries plus a filtered summary count block
  - section-level attendance analytics are available to:
    - admin
    - the parent section instructor
    - derived department coordinator/head through the same safe scoped oversight path already used for section session status changes
  - students cannot access attendance analytics
  - attendance analytics include only section sessions that are both:
    - `attendanceState = closed`
    - `status != cancelled`
  - attendance analytics support optional `fromDate` and `toDate` filters against `SectionSession.sessionDate`
  - attendance analytics remain finalized-record-based for MVP:
    - `late` counts as attended
    - `late` remains separate from `present`
    - `excused` remains separate from `absent`
    - `attendanceRate = attendedCount / totalCount`
    - `totalCount` uses only the filtered finalized `AttendanceRecord` rows tied to eligible section sessions
- Still missing:
  - broader attendance reporting beyond section-level finalized analytics
  - broader attendance oversight flows beyond the current safe scoped read/correction paths

### School Structure
- `POST /institutions/:institutionId/class-levels`
- `GET /institutions/:institutionId/class-levels`
- `GET /institutions/:institutionId/class-levels/:classLevelId`
- `PATCH /institutions/:institutionId/class-levels/:classLevelId`
- `POST /institutions/:institutionId/classes`
- `GET /institutions/:institutionId/classes`
- `GET /institutions/:institutionId/classes/:classId`
- `PATCH /institutions/:institutionId/classes/:classId`
- `POST /institutions/:institutionId/classes/:classId/students`
- `GET /institutions/:institutionId/classes/:classId/students`
- `GET /institutions/:institutionId/classes/:classId/students/:assignmentId`
- `PATCH /institutions/:institutionId/classes/:classId/students/:assignmentId/status`
- Current implemented rules:
  - `ClassLevel` and `SchoolClass` are school-only and use status-based lifecycle with no delete routes
  - class roster membership is semester-scoped through `ClassStudentAssignment`
  - one roster row exists per institution + semester + student
  - school class assignment create/reactivation syncs shared `Enrollment` rows into matching school sections
  - school class assignment create/reactivation skips sections that are already at capacity
  - assignment removal marks matching school enrollments as `dropped`
  - school section creation backfills enrollments from active class assignments for the same class and semester, up to remaining section capacity
- Still missing:
  - broader class transfer/history policy beyond the current single-row-per-student-per-semester approach

### Latest Review Note - 2026-03-21
- `SectionSession` now stores:
  - `statusNote`
  - `statusChangedAt`
  - `statusChangedByUserId`
- `GET /sessions/:sectionSessionId` was enriched to include:
  - `section: { id, code, title }`
  - `subject: { id, name, code }`
- `PATCH /sessions/:sectionSessionId/status` is the only path that should change session status.
- Generic session update should not be used for status changes, because the dedicated status flow is what handles:
  - fine-grained instructor/coordinator/head/admin authorization
  - status metadata
  - student cancellation email notification
- Notification recipients are selected from:
  - `Enrollment.status = enrolled`
  - plus `Membership.status = active`
  - plus users with a valid email

## Planned Next
- Scoped responsibility routes

## Endpoints / Modules To Verify
- Verify whether section list should get pagination soon.
- Verify delete guards for sections after enrollment exists.
- Verify whether `lecture` / `lab` should stay the long-term shared `sessionType` enum for school support.
- Verify responsibility flows before exposing them as active module features.
- Verify whether attendance should later allow coordinator/admin review after instructor-first flow.

## Notes
- Keep this file easy to update after each work session.
- If a module is partially built, list the exact completed endpoints under `In Progress`.
- If something is uncertain, add `TODO/verify` instead of guessing.
