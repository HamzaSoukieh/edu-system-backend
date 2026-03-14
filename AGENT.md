# AGENT Guide

## Purpose
- This repo is the source of truth for project flow when work continues in a new chat, account, or coding agent session.
- Before making changes, read this file plus:
  - `PROJECT_CONTEXT.md`
  - `DECISIONS.md`
  - `API_PROGRESS.md`
  - `TESTING_NOTES.md`
  - `PROMPTS.md`

## Project Overview
- Multi-tenant Edu SaaS backend for schools and universities.
- Each institution manages its own academic setup inside one shared platform.
- Current priority is MVP-first progress with simple, safe, local changes.

## Stack
- Node.js
- Express
- MongoDB with Mongoose
- CommonJS (`require` / `module.exports`)
- JWT auth
- OTP email flows
- Multer for uploads

## Architecture Rules
- Flow: `routes -> middleware -> controller -> service -> model`
- Controllers stay thin.
- Services own validation, business rules, and DB queries.
- Models own schema and indexes.
- Institution-owned data must always be scoped by `institutionId`.
- Never read/update/delete institution-owned records by `_id` alone.

## Current Data Boundaries
- `User` = auth/login identity only
- `Membership` = institution access + role only
- `MemberProfile` = personal info only
- `Subject` stays shared
- `Section` stays shared for university now and school later
- Do not add `departmentId` directly to `Section`
- For university filtering, derive department through `Subject`

## Auth / Authorization
- Usual protected chain:
  - `authJwt`
  - `requireEmailVerified`
  - `institutionAccess()`
  - `requirePermission("...")`
- Active institution context lives on:
  - `req.tenantId`
  - `req.membership`
- `ResponsibilityAssignment` exists in the codebase, but scoped business routes are still limited. Verify current usage before building on it.

## API Conventions
- Keep success responses simple:
  - `{ resource: { ... } }`
  - `{ resources: [...] }`
  - `{ message: "..." }`
- Keep error responses as:
  - `{ message: "..." }`
- Prefer explicit route params for institution-owned resources.

## Coding Style Preferences
- Keep changes minimal and local.
- Keep changes scoped and easy to review.
- Prefer explicit validation over implicit behavior.
- Normalize strings before uniqueness checks.
- Build safe `$set` objects for updates.
- Reject empty or invalid patch payloads.
- Use `returnDocument: "after"` for update queries.
- Keep naming consistent with existing services and models.

## Working Preferences
- Prefer a concise plan before editing many files.
- Ask before adding new production dependencies.
- Run relevant tests or validation steps before finishing.
- Keep changes scoped and easy to review.

## What To Avoid
- Do not split school/university into separate hard-coded systems unless there is no safe shared design.
- Do not add abstractions early.
- Do not move business logic into routes.
- Do not break the current multi-tenant scoping rules.
- Do not invent completed behavior in docs. If unsure, add `TODO/verify`.

## Safe Change Checklist
- Read the existing route/controller/service for the same module first.
- Confirm tenant scoping and ownership rules.
- Reuse current response shapes and error message style.
- If the change touches many files, give a short plan first.
- Add indexes only when they are clearly needed.
- Ask before introducing a new runtime or production dependency.
- Run the most relevant available validation before finishing.
- If code and docs disagree, trust the code first, then update docs.
- After changes, update:
  - `DECISIONS.md` if a real design decision changed
  - `API_PROGRESS.md` if module status changed
  - `TESTING_NOTES.md` if testing steps changed

## Response Style Preference
- Keep explanations concise, practical, and easy to follow.
- Prefer direct answers over long theory.
- Explain tradeoffs simply when needed.
- If something is uncertain, say so clearly.

## Current Module Focus
- Sections are the active build area.
- Current Section work in repo:
  - create
  - list
  - get by id
  - update
  - delete
  - room conflict validation
  - lightweight list response
  - fuller detail response
- Not done yet:
  - enrollment
  - school class-level support
  - scoped responsibility flows for sections
