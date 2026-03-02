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
  - `{ departments: [...] }`
  - `{ subjects: [...] }`
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

## Current Decisions
- Keep the codebase simple and MVP-focused.
- Business routes require verified email.
- Admins are the current builders/managers of the institution setup.
- Department and subject management are admin-only right now.
- Soft state (`active` / `archived`) is preferred before hard delete.
- Hard delete is allowed only in limited cases and should be guarded.

## Next Build Order
1. Departments
2. Subjects
3. Semesters
4. Sections

Note:
- Departments and subjects are already started.
- The next major domain work should move toward semesters and sections.

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
