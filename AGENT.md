# Edu SaaS Backend Guide

## Project Overview
- This backend is a multi-tenant Edu System Builder for university/school SaaS.
- It lets each institution build and manage its own academic structure inside one shared platform.
- The current focus is MVP-first: simple, practical, and easy to extend without overengineering.

## Tech Stack
- Node.js
- Express
- MongoDB with Mongoose
- CommonJS (`require` / `module.exports`)
- JWT for auth
- OTP flows with email delivery
- Multer for institution logo upload

## Architecture Style
- Flow: routes -> middleware -> controller -> service -> model
- Controllers stay thin.
- Services contain business logic, validation flow, and DB queries.
- Models define schema and indexes.
- Keep changes incremental and easy to reason about.

## Multi-Tenant Rules
- All tenant-owned documents must include `institutionId`.
- Always scope tenant queries by `institutionId`.
- Never read/update/delete tenant data by `_id` alone when it belongs to an institution.
- Use the active institution context from middleware (`req.tenantId`, `req.membership`).

## Auth & Authorization Flow
- Common protected chain:
  - `authJwt`
  - `requireEmailVerified` (for business routes)
  - `institutionAccess()`
  - `requirePermission("...")`
- `authJwt`:
  - validates bearer token
  - loads the user
  - checks account status
  - attaches `req.user`
- `institutionAccess()`:
  - confirms the user has an active membership in the target institution
  - reads `institutionId` from route params or `x-institution-id`
  - attaches `req.tenantId` and `req.membership`
- `requirePermission("...")`:
  - checks role permissions first
  - then falls back to scoped `ResponsibilityAssignment` if a scope is provided

## Roles vs Responsibilities
- Role = base institution-wide access.
- ResponsibilityAssignment = scoped extra access for a specific part of the system.
- Current base roles:
  - `admin`
  - `instructor`
  - `student`
- Current scoped responsibility types:
  - `head`
  - `mentor`
  - `coordinator`
- Use roles for broad access.
- Use responsibilities only when a route is scoped (department/section/etc.).

## API Conventions
- Keep responses simple and consistent.
- Typical success shapes:
  - `{ institution: { ... } }`
  - `{ department: { ... } }`
  - `{ subject: { ... } }`
  - `{ semester: { ... } }`
  - `{ member: { ... } }`
  - `{ departments: [...] }`
  - `{ members: [...] }`
  - `{ subjects: [...] }`
  - `{ semesters: [...] }`
- Error responses use:
  - `{ "message": "..." }`
- Prefer explicit route params over hidden context when the resource is institution-owned.

## Validation / Update Patterns
- Validate input in services.
- Normalize strings before checking uniqueness.
- Build safe `$set` update objects for `PATCH`.
- Reject empty or invalid patch payloads.
- Use `returnDocument: "after"` for update queries.
- Keep uniqueness checks at two levels:
  - service-level pre-checks for clean API errors
  - DB indexes for race-condition safety

## Completed Features
- JWT authentication
- OTP flows:
  - signup email verification
  - OTP resend
  - forgot password
  - reset password
- Institution context:
  - `GET /institutions/me`
- Institution update:
  - `PATCH /institutions/:institutionId`
- Institution logo upload:
  - `POST /institutions/:institutionId/logo`
- Department management:
  - create
  - list
  - get by id
  - update/archive through `PATCH`
- Subject management:
  - create
  - list
  - get by id
  - update/archive through `PATCH`
  - delete (admin-only, archived first)
- Semester management:
  - create
  - list
  - get by id
  - update (partial)
  - delete (admin-only, guarded by status/data rule)
  - week-based response with teaching/off/exam data
- Member management:
  - create (admin-only)
  - list (admin-only)
  - get by membership id (admin-only)
  - update (admin-only)
  - update status (admin-only)
  - profile picture upload support

## Current Decisions
- Keep the codebase simple and MVP-focused.
- Business routes require verified email.
- Admins are the current builders/managers of the institution setup.
- Department and subject management are admin-only right now.
- Soft state (`active` / `archived`) is preferred before hard delete.
- Hard delete is allowed only in limited cases and should be guarded.
- Only one `active` semester is allowed per institution.
- Member data is split by responsibility:
  - `User` = auth/login identity
  - `Membership` = institution access + role + member status
  - `MemberProfile` = personal identity/profile data inside the institution
- Admin creates members directly right now:
  - no invitation flow
  - new admin-created users get `isEmailVerified = true`
  - new admin-created users get `mustChangePassword = true`
  - initial password is the member `nationalNumber` (hashed)
- Semester calendar uses exact dates internally:
  - `calendarOverrides` for off-days
  - `examDates` for exams
- Semester delete policy:
  - allow delete if semester is `archived`
  - or allow delete when semester has no linked data
  - currently linked-data guard checks `sections` collection and can be extended

## Next Build Order
1. Sections
2. Section-linked flows (enrollment/scheduling/attendance)
3. Additional semester-linked guards as new models are added

Note:
- Departments, subjects, semesters, and member management are now implemented.
- The next major domain work should move to sections.

## Member Module Flow (Current)
- Routes:
  - `POST /institutions/:institutionId/members`
  - `GET /institutions/:institutionId/members`
  - `GET /institutions/:institutionId/members/:membershipId`
  - `PATCH /institutions/:institutionId/members/:membershipId`
  - `PATCH /institutions/:institutionId/members/:membershipId/status`
- Permission:
  - all current member routes require `requirePermission("membership.manage")`
- Data split:
  - `User` stores auth fields only
  - `Membership` stores `institutionId`, `role`, `status`, `invitedBy`, `joinedAt`
  - `MemberProfile` stores personal profile fields and derived full-name fields
- Member profile fields:
  - refs: `membershipId`, `userId`, `institutionId`
  - personal fields: `firstName`, `lastName`, `fatherName`, `motherName`, `birthPlace`, `birthDate`, `gender`, `nationality`, `nationalNumber`, `mobile`, `profilePictureUrl`
  - derived fields: `fullName`, `fullNameNormalized`
- Create-member behavior:
  - admin sends `email`, `role`, and `profile`
  - if user email already exists globally, reuse the existing `User` if membership does not already exist in the same institution
  - if user email does not exist, create a new `User`
  - create `Membership`
  - create `MemberProfile`
  - send account-created email
- Member uniqueness rules:
  - one membership per `{ userId, institutionId }`
  - one `nationalNumber` per institution
  - one profile per membership
- List behavior:
  - supports `role`, `status`, `search`, `page`, `limit`
  - response shape is `{ total, members }`
  - search currently checks `fullName`, `email`, and `nationalNumber`
- Update behavior:
  - admin can update `email`, `role`, and profile fields
  - `nationalNumber` change does not reset password
  - `fullName` and `fullNameNormalized` are rebuilt when first/last name changes
- Status update behavior:
  - only `active` and `suspended` are allowed through status endpoint
- Upload behavior:
  - profile picture field name: `profilePicture`
  - create/update member routes accept:
    - raw JSON
    - `application/x-www-form-urlencoded`
    - multipart form-data
  - multipart can send:
    - top-level `email`, `role`, and `profile` JSON string
    - or `payload` as one JSON string
  - member routes also tolerate `text/plain` JSON bodies now for Postman/raw testing

## Semester Module Flow (Current)
- Routes:
  - `POST /institutions/:institutionId/semesters`
  - `GET /institutions/:institutionId/semesters`
  - `GET /institutions/:institutionId/semesters/:semesterId`
  - `PATCH /institutions/:institutionId/semesters/:semesterId`
  - `DELETE /institutions/:institutionId/semesters/:semesterId`
- Permission:
  - create/update/delete require `requirePermission("semester.manage")`
- Core semester fields:
  - `institutionId`
  - `name`
  - `startDate`, `endDate`
  - `teachingDays`
  - `calendarOverrides` (`type: "off"`)
  - `examDates` (`type: "midterm" | "final"`)
  - `weekCount`
  - `status`
  - `createdByUserId`
- Create/update helpers also accept convenience range input:
  - `holidayRange` / `holidayRanges` -> expanded to `calendarOverrides`
  - `examRange` / `examRanges` -> expanded to `examDates`
- Week response (`weeks`) is generated on read and includes:
  - `teachingDates`
  - `offDates`
  - `examDates`
  - `teachingDayCount`
  - `offDayCount`
- Teaching-day rule:
  - `offDates` remove dates from `teachingDates`
  - exam dates also block those dates from `teachingDates`

## Subject/Section Design Notes
- `Subject` = master course definition (catalog item).
- `Section` = semester-specific class offering/group.
- Students should eventually enroll in sections, not raw subjects.
- Student/instructor-facing "available courses" should be based on sections later, not on the subject catalog.

## Team Collaboration Notes
- Keep controllers thin.
- Do not put DB-heavy logic in routes.
- Prefer adding small focused endpoints instead of large generic systems.
- Keep naming consistent with existing models and services.
- Preserve current error message style when extending endpoints.
- When adding new tenant-owned models, start with `institutionId`, status, timestamps, and the right indexes.

## Postman / Testing Notes
- For JSON routes:
  - use `Content-Type: application/json`
  - use raw JSON body
- For protected routes:
  - send `Authorization: Bearer <token>`
- Institution routes usually need `:institutionId` in the URL.
- `x-institution-id` can be used as a fallback where supported by middleware.
- Logo upload uses multipart form-data:
  - field name: `logo`
- Member profile picture upload uses multipart form-data:
  - file field name: `profilePicture`
  - if sending multipart member data, use either:
    - `email`, `role`, and `profile` as JSON string
    - or `payload` as one JSON string
- If a JSON body arrives as `{}`, check the request body type first.

## Instructions for AI/Codex
- Read existing route, controller, and service patterns before adding new code.
- Follow the current architecture exactly:
  - routes -> middleware -> controller -> service -> model
- Keep changes incremental and local.
- Do not introduce advanced abstractions unless there is a clear need.
- Always scope institution-owned queries by `institutionId`.
- Keep API response shapes consistent with existing endpoints.
- Put validation and business rules in services.
- Use `requirePermission("...")` at the route layer for authorization.
- Use scoped responsibilities only when the route has a real scope to enforce.
- Prefer safe update patterns and explicit validation over magic behavior.
