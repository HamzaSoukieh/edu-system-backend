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
- Current implemented rules:
  - semester teaching-day validation
  - room conflict validation
  - department filtering through Subject
  - lightweight list response
  - fuller detail response
- Still missing:
  - delete
  - enrollment
  - linked attendance/scheduling flows

## Planned Next
- Section delete with safe guards
- Enrollment
- Attendance
- Section-linked scheduling rules
- Scoped responsibility routes
- School class-level support

## Endpoints / Modules To Verify
- Verify whether section list should get pagination soon.
- Verify subject scope strategy once school class-level model is introduced.
- Verify delete guards for sections after enrollment exists.
- Verify responsibility flows before exposing them as active module features.

## Notes
- Keep this file easy to update after each work session.
- If a module is partially built, list the exact completed endpoints under `In Progress`.
- If something is uncertain, add `TODO/verify` instead of guessing.
