# Prompts

## 2026-07-09 Self-Enrollment Schedule Conflict Enforcement

Add backend schedule-conflict enforcement for university student self-enrollment final submissions.

Key result:
- schedule conflict validation now reads `Section.schedule` on selected sections and same-institution active-semester enrolled sections
- overlapping same-day time ranges are blocked using `existingStart < selectedEnd && selectedStart < existingEnd`
- back-to-back sections remain allowed
- dropped enrollments do not block because only `Enrollment.status = enrolled` current records are considered
- schedule conflicts return `409`, `reasonCode: "schedule_conflict"`, and `blockingReasonCodes: ["schedule_conflict"]`
- frontend checks remain UX-only; backend validation is authoritative
- no frontend, waitlist, advisor approval, attendance, section-session redesign, or schedule generation changes were added

## 2026-06-19 Stripe Billing Postman Fixture Repair

Repair the local Stripe Billing Postman flow without weakening duplicate-subscription or upgrade eligibility checks. Use deterministic seeded credentials, create a fresh unpaid billing sandbox for checkout, and make the collection verify active Plus webhook state before requesting Plus-to-Pro upgrade.


## New Chat Starter Prompt
```text
You are working inside my existing backend repo.

Before coding:
1. Read `AGENT.md`
2. Read `PROJECT_CONTEXT.md`
3. Read `DECISIONS.md`
4. Read `API_PROGRESS.md`
5. Read `TESTING_NOTES.md`

Then inspect the relevant code paths before making changes.

Rules:
- Keep changes minimal and safe
- Keep changes scoped and easy to review
- Follow the existing architecture: routes -> middleware -> controller -> service -> model
- Keep tenant scoping by institutionId
- Keep explanations concise and practical
- Prefer a concise plan before editing many files
- Ask before adding new production dependencies
- Run relevant tests or validation steps before finishing
- If something is uncertain, add a TODO/verify note instead of guessing

Task:
[PASTE TASK HERE]
```

## 2026-06-18 Billing Seat Enforcement MemberService Tests

User asked to verify whether the Plus/Pro billing limits were actually applied to project member write paths, especially Plus blocking more than 300 active students and 30 active staff.

Key result:
- added focused `memberService` tests for direct active member creation, activation/reactivation through status changes, active role transitions, deactivation, profile-only updates, and tenant-scoped seat counts
- verified Plus allows the 300th active student and blocks the 301st
- verified Plus blocks active staff creation at 30 active admin/instructor memberships
- verified billing limit failures happen before member/user/profile/email write side effects on blocked creates
- verified no Pro-only routes, middleware, or feature restrictions were added
- command run: `node --test test/billing.test.js test/billing-seat-limits.test.js test/member-billing-limits.test.js`
- result: 65 passing

## 2026-06-18 Billing Plus-To-Pro Upgrade

User asked to add a safe immediate Stripe Billing upgrade from Plus to Pro without adding downgrades, Customer Portal, duplicate subscriptions, or Checkout Session reuse.

Key result:
- added `POST /institutions/:institutionId/billing/upgrade-to-pro`
- only active local Plus profiles with valid Stripe customer/subscription ids and active subscription status can request the upgrade
- Stripe subscription customer/subscription/metadata/mapping conflicts fail closed
- Stripe update replaces the existing Plus subscription item with the trusted Pro Price using immediate invoice proration and `pending_if_incomplete`
- the endpoint never creates a new Stripe Customer, Checkout Session, or second Subscription
- local billing profile and entitlements remain Plus until verified Stripe webhook synchronization maps the Pro Price
- failed prorated payment keeps the institution on Plus
- no downgrade path or Pro-only feature gate was added
- command run: `node --test test/billing.test.js test/billing-seat-limits.test.js test/member-billing-limits.test.js test/billing-upgrade.test.js`
- result: 107 passing

## 2026-06-18 Billing Plus-To-Pro Upgrade Hardening

User asked to harden the existing Plus-to-Pro upgrade without adding new billing features.

Key result:
- pinned Stripe API version to `2026-05-27.dahlia` for installed `stripe@22.2.0`
- update expansion now uses only `latest_invoice.confirmation_secret`
- upgrade now validates live Stripe subscription status `active`, automatic collection, no subscription schedule, one item, and quantity `1`
- local Plus billing profile must have the configured Plus Price before Stripe update is attempted
- response classification no longer treats a client secret alone as action required
- pending `requires_action` returns `payment_action_required`; pending `requires_payment_method` returns `payment_failed`; unresolved pending update returns `payment_incomplete`; no pending update returns `processing`
- idempotency key includes a trusted Stripe state marker such as latest invoice id
- raw Stripe update errors are normalized to `Stripe subscription upgrade failed`
- subscription created/updated webhooks retrieve current Stripe state before syncing, preventing stale Plus snapshots from reverting current Pro state
- deletion webhooks still apply the deletion snapshot
- no downgrade, Customer Portal, Checkout Session, new subscription, or Pro-only route was added

## 2026-05-31 Attendance Postman Pack

User asked for a Postman collection and environment variables filled with local university IDs to test attendance easily.

Delivered:
- `postman/attendance.postman_collection.json`
- `postman/attendance.postman_environment.json`
- ignored local `postman/attendance.local.postman_environment.json`

Collection covers auth, section session setup, staff attendance open/QR/manual/roster/close flows, student QR/history flows, attendance analytics, and attendance policy update requests.

## 2026-06-16 Institution Context Enrichment

User asked to enrich the existing `GET /institutions/me` response for frontend bootstrap without creating `/v1`, a second `/me`, or an `owner` role.

Key result:
- institution rows now include `membershipId`, limited `memberProfile`, base role `permissions`, separate `scopedCapabilities`, `activeSemester`, and `activeAcademicYear`
- top-level `user`, `institutions`, `activeInstitutionId`, and `onboarding` are preserved
- `role` remains `admin`, `instructor`, or `student`; ownership stays `isOwner`
- `permissions` contains only `ROLE_PERMISSIONS[membership.role]`
- scoped Head/Coordinator/Mentor grants remain separate and use backend-computed `RESPONSIBILITY_PERMISSIONS`
- stored `ResponsibilityAssignment.permissions` stays ignored
- profile fields are limited to display/contact/photo summary fields
- active semester/year are read-only summaries
- related records are batch-loaded to avoid N+1 queries for multi-institution users

## 2026-06-16 Institution Context Onboarding

User reported that active non-admin users were receiving an admin-wait onboarding step even though they already had usable institution access.

Key result:
- onboarding now returns `verify_email`, `create_or_join_institution`, `wait_for_membership_activation`, `build_academic_structure`, or `null` in that order
- active instructor and student memberships complete onboarding with `nextStep: null`
- active Head, Coordinator, and Mentor users keep their base instructor role and also complete onboarding normally
- `wait_for_membership_activation` applies only when no membership is active
- `hasAdminMembership` remains informational and is not an authorization gate
- roles, base permissions, scoped capabilities, profiles, semesters, academic years, routes, and API versioning were not changed

## 2026-06-16 Member Self Profile Endpoint

User asked to add a same-version self endpoint for authenticated users to read their own raw membership/profile in one institution without requiring `membership.manage`.

Key result:
- added `GET /institutions/:institutionId/members/me`
- route uses `authJwt`, `requireEmailVerified`, and `institutionAccess()`
- route does not require `membership.manage`
- service uses trusted `req.membership` context through the controller and never trusts a client-supplied membership id
- Membership is re-read by `_id + institutionId + userId + status=active`
- MemberProfile is read by `institutionId + membershipId`
- missing profile returns `profile: null`
- existing admin detail route `/members/:membershipId` remains protected by `membership.manage`
- `/members/me` is registered before `/members/:membershipId`

## 2026-06-17 Member Self Profile Postman

User asked for Postman support to test the new member self profile endpoint.

Key result:
- added `postman/member-self-profile.postman_collection.json`
- added `postman/member-self-profile.postman_environment.json`
- environment is prefilled with the institution and membership ids from the user's sample responses
- credentials and tokens are left blank/secret and must be filled locally
- collection covers admin/instructor login, `/institutions/me`, `/members/me`, route-order regression, unauthenticated rejection, and the existing admin member-detail permission boundary
- collection now also covers `GET /institutions/:institutionId/academic-years/active` for admin, instructor, optional student, and no-auth checks

## 2026-06-17 Active Academic Year Discovery

User asked to make the current academic year discoverable by all active institution members without creating `/v1`.

Key result:
- kept `activeAcademicYear` in `GET /institutions/me` as the frontend bootstrap/discovery source
- relaxed only `GET /institutions/:institutionId/academic-years/active` to active institution member access
- active academic-year route uses `authJwt`, `requireEmailVerified`, and `institutionAccess()` without `institution.manage`
- create/list/get-by-id/update/archive academic-year routes remain protected by `institution.manage`
- `activeAcademicYear: null` remains valid in `/institutions/me`
- the dedicated active academic-year endpoint keeps its existing `404 Active academic year not found` behavior
- active year is not inferred from active semester

## 2026-06-17 Stripe Billing Plus/Pro Plans

User asked to upgrade Stripe Billing Phase 1 from one Basic monthly plan to two six-month plans: Plus and Pro.

Key result:
- added centralized immutable billing plan catalog for `plus` and `pro`
- checkout accepts only `{ "plan": "plus" }` or `{ "plan": "pro" }`
- Stripe Price IDs are resolved only from `STRIPE_PRICE_PLUS_6_MONTH` / `STRIPE_PRICE_PRO_6_MONTH`
- webhook synchronization resolves stored plan from the actual subscription item Price ID
- billing status includes normalized safe entitlements
- Plus and Pro have identical application feature access in V1
- the only V1 differences are Stripe price and active student/staff Membership limits
- active students are active student Memberships; active staff are active admin/instructor Memberships
- hard limits are enforced on member create, activation/reactivation, and role category increases
- initial owner Membership creation remains possible before subscription
- seeded demo institutions get fake local Pro billing profiles with no real Stripe secrets or IDs
- TODO/verify: simultaneous activations can race without transactions; old Basic migration and production upgrade/downgrade/proration behavior remain deferred

## 2026-06-18 Billing Profile Model Hardening

User asked to harden only the `InstitutionBillingProfile` model for the Plus/Pro six-month billing design.

Key result:
- optional Stripe customer/subscription/price/product ids normalize to a trimmed string or `null`
- `plan` supports `plus`, `pro`, or `null`
- `billingInterval` supports `six_month` or `null`
- supported nullable subscription statuses include `paused`
- old/unknown Stripe prices may keep `plan` and `billingInterval` null
- authoritative student/staff limits remain outside the model in billing policy/config
- kept one profile per institution plus partial unique indexes for non-null Stripe customer/subscription ids
- removed redundant institution compound billing-profile indexes

## 2026-06-18 Billing Service Hardening

User asked to fix confirmed Plus/Pro billing service bugs without rebuilding billing or adding features.

Key result:
- billing owner/admin authorization now requires actor membership user, institution, and `status=active` to match exactly
- missing actor membership status fails closed
- duplicate checkout blocking now uses subscription status only: `active`, `trialing`, and `past_due`
- Stripe Price config rejects placeholders, malformed values, and duplicate Plus/Pro Price IDs before Checkout calls Stripe
- webhook plan resolution returns no plan when configured plan prices are ambiguous
- invalid internal seat categories throw instead of bypassing enforcement
- subscription and checkout-completed webhooks reconcile metadata/customer/subscription institution candidates and fail safely on conflicts
- unknown Stripe prices still store no Plus/Pro plan and grant no paid access
- checkout creation alone does not grant paid entitlements before webhook synchronization
- Plus and Pro application feature access remains identical

## 2026-05-31 Section Session Instructor Setup Permission

User reported `{"message":"Permission denied"}` while testing attendance Postman setup because instructor tokens could not access section session setup APIs.

Fix:
- session list/create/generate/get/update routes no longer require broad `section.manage`
- controllers pass actor membership into `sectionSessionService`
- service authorizes assigned section instructor/admin/coordinator using existing section-session permission logic
- unrelated instructors remain blocked

## 2026-06-09 Head Non-Operational Responsibility Design

User asked to separate Head from Coordinator in the scoped responsibility catalog.

Key result:
- Admin remains the broad base `Membership.role`
- Coordinator keeps scoped operational section/session/attendance permissions
- Head keeps allowed assignment scopes but no active operational permissions until academic/report oversight services exist
- Mentor remains without active effective permissions until mentor-specific services exist
- stored `ResponsibilityAssignment.permissions` stays non-authoritative

## 2026-06-09 ResponsibilityAssignment Owner/Admin Management

User asked for safe owner/admin management APIs for scoped `ResponsibilityAssignment` records.

Key result:
- added `POST/GET/GET by id/PATCH/DELETE /institutions/:institutionId/responsibility-assignments`
- management access is owner/admin-only through institution ownership or base `Membership.role` permissions, not responsibility assignments
- create/update payloads reject `permissions`, tenant override ids, membership ids, audit ids, and V1 identity/type changes
- target users must have active same-institution memberships, while `Membership.role` remains unchanged
- scope records are validated inside the route institution, and delete soft-deactivates the assignment
- stored assignment permissions remain omitted from responses and ignored by authorization helpers
- TODO/verify: full date-window overlap handling is deferred beyond the current duplicate-active guard

## 2026-06-10 ResponsibilityAssignment Management Hardening

User asked to harden the owner/admin management flow after review.

Key result:
- actor membership status now fails closed; missing or non-active status is rejected
- target users must be active same-institution instructors; students and admins cannot receive scoped responsibility assignments
- `Membership.role` remains unchanged when assignments are created
- create/update payload allow-lists still reject `permissions`, `role`, tenant override ids, membership ids, audit ids, and unknown authorization fields
- update duplicate checks also run when setting `isActive=true`
- activeNow list tests cover active, inactive, future, expired, and cross-tenant rows
- verified `ClassLevel` is the existing tenant-scoped model for classLevel assignment validation

## 2026-06-10 Head Academic Oversight Read Model

User asked to activate read-only Head academic oversight backed by trusted DB-derived scope resolution.

Key result:
- activated Head `academicRisk.read_scope`, `academicProfile.read_scope`, and `academicStanding.read_scope`
- added `GET /institutions/:institutionId/academic-oversight/risk-summary`
- added `GET /institutions/:institutionId/academic-oversight/students`
- added `GET /institutions/:institutionId/academic-oversight/students/:studentMemberId`
- oversight routes are separate from operational section/session/attendance/assessment/enrollment endpoints
- Head department scope derives through `Subject.departmentId -> Section -> Enrollment`
- Head classLevel scope derives through `Subject.classLevelId` and `SchoolClass.classLevelId -> Section -> Enrollment`
- attendance risk uses existing institution attendance policy fields as read-only signals
- grade risk uses published assessment/result rows as a conservative V1 read-only summary
- university standing/profile summary reuses existing university outcome and standing calculations when available
- no attendance, result, enrollment, standing, final-decision, section, subject, session, or schedule writes are added
- TODO/verify: make grade-risk bands policy-configurable if product needs institution-specific thresholds

## 2026-06-11 Head Academic Oversight Hardening

User asked to fix and harden the V1 academic oversight service.

Key result:
- grade risk now builds a trusted active-enrollment map from `institutionId + studentMemberIds + sectionIds`
- each student is evaluated only against published assessments from that student's own active enrolled sections
- dropped/inactive section enrollments do not create missing grade results
- query filters now narrow related trusted scope ids such as sections, subjects, departments, class levels, and school classes where practical
- department Head assignment ids are tenant-verified before scope derivation, matching classLevel assignment behavior
- standing/profile fallback remains client-safe with a TODO/verify note for future shared internal logging
- tests now fail fast if academic oversight calls create/update/delete methods on enrollment, attendance, assessment result, section, subject, or related mocked models

## 2026-06-11 Head Academic Oversight Additive Scope Lock

User asked to lock the V1 behavior for Heads with multiple scoped assignments.

Key result:
- multiple independent Head assignments are additive OR grants
- a Head with Math department and Grade 10 class-level assignments can see the union of Math-scope students and Grade 10-scope students
- query filters narrow the authorized union but do not reinterpret independent assignments as a department/classLevel AND
- future AND-style scopes should be represented by an explicit combined scope model/configuration, not inferred from multiple `ResponsibilityAssignment` rows
- tests cover combined additive access, department/classLevel/section filters, cross-tenant filters, and the `AssessmentResult.sectionId` query contract

## 2026-06-14 Academic Oversight And Responsibility Deactivation Hardening

User asked to harden V1 academic oversight and add a generic ResponsibilityAssignment deactivation route.

Key result:
- academic oversight now verifies `actorMembership.userId` matches the authenticated actor
- attendance risk now counts only attendance records for sections where the student currently has an active enrollment, and zero qualifying records is `unknown`
- risk list/summary rows are risk-only under `academicRisk.read_scope`
- academic profile data is gated by `academicProfile.read_scope`; academic standing data is gated by `academicStanding.read_scope`
- unexpected academic outcome/standing calculation failures return safe null fields with `dataUnavailable=true`
- invalid published assessment configuration keeps grade risk `unknown` unless valid assessment data independently establishes warning/high risk
- `PATCH /institutions/:institutionId/responsibility-assignments/:assignmentId/deactivate` soft-deactivates Head, Coordinator, or Mentor assignments without hard delete
- verified `AssessmentResult.sectionId` is required and populated by assessment writes; duplicate rows are protected by `institutionId + assessmentId + enrollmentId`, with direct assessment+student uniqueness left as TODO/verify

## 2026-06-14 AcademicDecision/Notification Model Hardening

User asked to harden only the existing AcademicDecision and Notification models before service review.

Key result:
- added controlled AcademicDecision history actions and history note length limit
- added `isOpen` plus a partial unique index for one open `institutionId + enrollmentId + decisionType`
- made AcademicDecision target identity and evidence/scope snapshots immutable
- replaced the review queue index with `{ institutionId: 1, status: 1, createdAt: -1 }`
- converted Notification decision `data` into a required `_id: false` embedded schema
- made Notification identity/content immutable while keeping `readAt` mutable
- added focused schema validation/index tests
- left services, controllers, routes, permissions, and Enrollment workflow untouched

## 2026-06-15 AcademicDecision Service Hardening

User asked to harden the existing Head-side AcademicDecision recommendation service and academic-oversight evidence snapshot helper.

Key result:
- synchronized cancellation with `status=cancelled` and `isOpen=false` in one atomic update
- switched open recommendation pre-checks to `isOpen=true`
- translated mocked partial unique open-decision duplicate-key races to HTTP 409 while preserving unrelated DB errors
- failed closed for unsupported Head scope types in decision section matching
- preserved historical list/get visibility by current authorized stored-section scope instead of current active enrollment
- required, validated, deduped, and tenant-checked evidence snapshot section ids
- verified evidence snapshot field mapping from actual attendance/grade risk return shapes
- kept recommendation notification creation best-effort/idempotent and documented durable retry/outbox as deferred
- required active same-institution membership access for owner notification inclusion
- did not add admin review/apply behavior, Enrollment mutation, controller changes, or route changes

## 2026-06-15 AcademicDecision Admin/Owner Review

User asked to add Phase 2 Admin/Owner review of Head enrollment-drop recommendations without applying Enrollment changes.

Key result:
- added Admin base-role permission `academicDecision.review`; Owner review remains a service-level owner check with active same-institution membership
- added `GET /institutions/:institutionId/academic-decisions/review-queue`
- added `POST /institutions/:institutionId/academic-decisions/:decisionId/approve`
- added `POST /institutions/:institutionId/academic-decisions/:decisionId/reject`
- approve/reject are dedicated service transitions from `recommended`, not generic status updates
- reviewers cannot approve or reject their own recommendations, even when also Admin or Owner
- approval revalidates current trusted Enrollment, student Membership, Section, active Enrollment status, tenant relationships, and material evidence freshness
- approval keeps `isOpen=true`; rejection sets `isOpen=false`; neither updates Enrollment or application fields
- approval/rejection notify the recommending Head through idempotent in-app notifications and may mark only the current reviewer's own review-required notification read

## 2026-06-15 AcademicDecision Application

User asked to add Phase 3 application of approved enrollment-drop AcademicDecision records.

Key result:
- added Admin base-role permission `academicDecision.apply`; Owner apply remains a service-level owner check with active same-institution membership
- added `POST /institutions/:institutionId/academic-decisions/:decisionId/apply`
- added an internal trusted Enrollment transition that changes exactly `_id + institutionId + studentMemberId + sectionId + status=enrolled` to `status=dropped`
- apply requires `decisionType=enrollment_drop` and `status=approved`; Head, Coordinator, Mentor, normal instructor, and student actors cannot apply
- because the repo has no transaction/session pattern, apply uses transient `applying` as a claim/recovery marker before dropping Enrollment
- successful application sets `status=applied`, `isOpen=false`, `appliedByUserId`, `appliedAt`, and one applied history entry
- already-applied decisions are idempotent when the exact Enrollment is already dropped
- application notifies the recommending Head (`academic_decision_applied`) and affected student (`enrollment_status_changed`) with safe IDs and no private evidence
- no Membership deactivation, Enrollment deletion, Subject removal, grade deletion, attendance deletion, homework deletion, material deletion, billing change, WebSocket, push, or email behavior was added

## 2026-06-16 AcademicDecision Apply Recovery Hardening

User asked to harden Phase 2/3 review and application recovery without rebuilding the module.

Key result:
- added `applying` as a controlled history action plus mutable `applyingByUserId` / `applyingAt` model fields
- normalized Head scope student/section ids before comparing Mongoose ObjectIds to request strings
- application claim now atomically writes `approved -> applying` history and claim metadata before dropping Enrollment
- Enrollment drops now record `droppedAt`, `droppedByUserId`, and `droppedByAcademicDecisionId`
- successful completion records `applying -> applied` with a fresh `appliedAt`
- stale `applying` claims can be reclaimed when the exact Enrollment is still enrolled, while unlinked dropped Enrollments fail closed for manual recovery
- approval, rejection, and cancellation resolve all stale review-required notifications for the decision in the same institution
- review recipients are active admin users plus the owner only when the owner has active institution membership access
- category-only evidence drift remains the approval-blocking rule with TODO/verify for numeric evidence policy

## 2026-06-14 AcademicDecision Phase 1

User asked to add recommendation-only AcademicDecision workflow for Head enrollment-drop recommendations and in-app Admin/Owner notifications.

Key result:
- added first-class `AcademicDecision` model with status/history/evidence/scope snapshots
- added minimal first-class in-app `Notification` module
- added Head scoped permissions `academicDecision.read_scope` and `academicDecision.recommend_scope`
- added `POST /institutions/:institutionId/academic-decisions/enrollment-drop`
- added `GET /institutions/:institutionId/academic-decisions`
- added `GET /institutions/:institutionId/academic-decisions/:decisionId`
- added `PATCH /institutions/:institutionId/academic-decisions/:decisionId/cancel`
- added `GET /institutions/:institutionId/notifications`
- added `PATCH /institutions/:institutionId/notifications/:notificationId/read`
- Head can recommend only inside trusted department/classLevel/institution Head scope and cancel only their own still-`recommended` decision
- Head cannot approve, reject, apply, drop Enrollment, deactivate Membership, or remove students
- recommendation create validates exact tenant-scoped Enrollment by `_id + institutionId + studentMemberId`
- server builds evidence and scope snapshots; client evidence/scope/status/audit/history fields are rejected
- active Admin users and the Institution owner receive safe in-app review notifications, deduped and idempotent by recipient + decision + type
- no Enrollment, Membership, Subject, Section, Assessment, AttendanceRecord, email, push, WebSocket, or Admin review/apply behavior was added

## 2026-05-31 Attendance Local QR Date Override

User could not test QR because today's date was not included in semester teaching days, while the available session was scheduled for a future teaching day.

Fix:
- added non-production `ATTENDANCE_QR_DATE_OVERRIDE=YYYY-MM-DD`
- production ignores the override
- invalid override values fall back to the real server date
- local ignored `.env` was set to `ATTENDANCE_QR_DATE_OVERRIDE=2026-06-07` for the user's current Postman session

## 2026-06-05 Stripe Billing Phase 1

User asked to add Phase 1 Stripe Billing support for institution subscriptions using Stripe Billing, not Stripe Connect.

Key requirements:
- add `InstitutionBillingProfile`
- add `StripeWebhookEvent`
- add owner/admin checkout session route
- add local billing status route
- add raw-body `/stripe/webhook`
- use env vars for all Stripe config
- do not store card/payment data
- do not add student payments, plan limits, Stripe Connect, or global access gating yet

Delivered:
- official `stripe` npm package added
- `POST /institutions/:institutionId/billing/checkout-session`
- `GET /institutions/:institutionId/billing/status`
- `POST /stripe/webhook`
- webhook event idempotency and subscription status projection updates
- focused mocked Stripe tests

## 2026-06-05 Stripe Billing Webhook Hardening

User asked to review and harden the existing Phase 1 Stripe Billing implementation without rebuilding it.

Findings:
- webhook route was already before `express.json()` and unauthenticated
- signature verification already used raw body
- event recording after successful processing left a concurrency/idempotency gap
- Stripe IDs were indexed but not uniquely protected across institutions

Fix:
- added webhook event `processing|processed|failed` status and `errorMessage`
- duplicate processed/in-flight events return `200` without reprocessing
- failed processing marks the event `failed` so Stripe retries can claim it again
- added partial unique indexes for Stripe customer/subscription ids
- added subscription/customer fallback lookup when subscription metadata lacks `institutionId`

## Codex Task Prompt
```text
Work inside this existing Node.js + Express + Mongoose backend repo.

Please:
- inspect the relevant files first
- implement the requested change in the current project style
- keep the change minimal and local
- keep the change scoped and easy to review
- do not redesign unrelated parts
- preserve tenant scoping and current response style
- prefer a concise plan before editing many files
- ask before adding new production dependencies
- run relevant tests or validation steps before finishing

After coding:
- list changed files
- explain the flow simply
- mention any verification you ran

Task:
[PASTE TASK HERE]
```

## Code Review Prompt
```text
Review the current changes in this backend repo.

Focus on:
- bugs
- multi-tenant safety issues
- authorization mistakes
- response-shape regressions
- validation gaps
- schema/index risks
- missing edge-case handling

Please give:
1. findings first, ordered by severity
2. file references
3. brief recommended fixes
```

## Minimal Safe Change Prompt
```text
I want a minimal safe change in this backend repo.

Constraints:
- keep the current architecture
- keep changes local
- keep changes scoped and easy to review
- do not introduce abstractions unless necessary
- ask before adding new production dependencies
- do not redesign unrelated files
- preserve current behavior except for the requested change
- prefer a concise plan before editing many files
- run relevant tests or validation steps before finishing

Task:
[PASTE TASK HERE]
```

## Continue-From-Context Prompt
```text
Continue work on this backend repo.

Before doing anything:
- read `AGENT.md`
- read `PROJECT_CONTEXT.md`
- read `DECISIONS.md`
- read `API_PROGRESS.md`
- read `TESTING_NOTES.md`

Then:
- summarize current module state
- list the next sensible implementation step
- complete the task below with minimal safe changes
- prefer a concise plan before editing many files
- ask before adding new production dependencies
- run relevant tests or validation steps before finishing

Task:
[PASTE TASK HERE]
```

## Compact Project Brief Template
```text
Project brief:
- Multi-tenant Edu SaaS backend
- Stack: Node.js, Express, MongoDB/Mongoose
- Architecture: routes -> middleware -> controller -> service -> model
- Institution-scoped routes live under /institutions/:institutionId/...
- User = auth only
- Membership = institution access + role only
- MemberProfile = personal info only
- One active semester per institution
- Subject stays shared
- Section stays shared for university now and school later
- Do not add departmentId directly to Section
- For university filtering, derive department through Subject
- Keep changes minimal, safe, and practical
- Prefer a concise plan before editing many files
- Ask before adding new production dependencies
- Run relevant tests or validation steps before finishing
- Keep changes scoped and easy to review

Current module:
[PASTE CURRENT MODULE HERE]

Task:
[PASTE TASK HERE]
```

## Session Close-Out Prompt
```text
Before we end this session, update:
- `PROJECT_CONTEXT.md` if the current module picture changed
- `DECISIONS.md` if a real design decision changed
- `API_PROGRESS.md` with current module status
- `TESTING_NOTES.md` if testing steps changed

Then give me:
- changed files
- what is done
- what is next
- any TODO/verify notes
```

## Next Recommended Prompt
```text
You are working inside my existing backend repo.

Before coding:
1. Read `AGENT.md`
2. Read `PROJECT_CONTEXT.md`
3. Read `DECISIONS.md`
4. Read `API_PROGRESS.md`
5. Read `TESTING_NOTES.md`
6. Read `PROMPTS.md`

Then inspect:
- universityAcademicOutcomeService
- universityAcademicProfileService
- universityAcademicPolicyService
- InstitutionAcademicPolicy model
- Enrollment, Section, Semester, Subject, Assessment, and AssessmentResult models
- university academic outcome/profile tests
- self-enrollment eligibility/browse/write tests
- existing repeated-attempt transcript display from U4

Task:
Audit current university repeat behavior and design an admin-configurable repeatPolicy for a future implementation.

Constraints:
- audit/design only unless explicitly asked to implement U5B
- do not add `repeatPolicy` fields yet
- do not change official GPA, earned credits, prerequisite behavior, or self-enrollment behavior
- document how current GPA counts finalized attempts
- identify policy choices needed for replacement/forgiveness, latest/best/all attempt treatment, transcript display, prerequisites, and migration/backfill
- keep school academic services untouched
- keep tenant scoping assumptions explicit
- update docs with TODO/verify notes instead of guessing product rules
```

## Recent Prompt - U4 University Repeated-Attempt Transcript Display
```text
Improve the university academic profile repeated-attempt transcript display without changing official GPA, earned credits, prerequisites, self-enrollment, repeatPolicy, or academic standing.

Key result:
- `subjectAttempts` expose attempt number/count, latest/best flags, previous-attempt metadata, and display labels
- `subjectOutcomeSummaries` expose decorated best/latest outcome fields, compact attempt rows, and repeat-history booleans
- `gpaCalculation` documents that current cumulative GPA still follows existing outcome-service behavior and counts all finalized attempts until repeatPolicy exists
```

## Recent Prompt - U5B Admin-Configurable University repeatPolicy
```text
Implement university-only `InstitutionAcademicPolicy.repeatPolicy` so admins can configure repeated-attempt behavior.

Key result:
- default GPA repeat behavior is `best_attempt_only`
- default earned-credit behavior is `count_once_per_subject`
- explicit legacy behavior remains available through `all_attempts` and `count_each_passed_attempt`, or `enabled=false`
- prerequisites support `best_passed_attempt` and `latest_attempt`
- self-enrollment respects `allowGradeImprovementRepeats` and `blockRepeatAfterFinalPass`
- university academic profile surfaces active repeatPolicy plus attempt-level GPA/credit inclusion flags
- school academic modules remain unchanged
```

## Recent Prompt - U6B Admin-Configurable University academicStandingRules
```text
Implement university-only `InstitutionAcademicPolicy.academicStandingRules` so admins can configure GPA-based academic standing thresholds.

Key result:
- standing statuses are university-style: `no_standing_yet`, `good_standing`, `academic_warning`, `probation`, `suspension`, and `review_required`
- old policies without `academicStandingRules` resolve to default GPA thresholds
- university academic profile includes live/read-only `academicStanding`
- `allowedToContinue` is informational only and is not enforced in self-enrollment yet
- graduation review, transcript locking, standing finalization, appeals, and manual override workflow remain deferred
- school academic modules remain unchanged
```

## Recent Prompt - U6B academicStandingRules Edge-Case Hardening
```text
Harden U6B academicStandingRules without adding new standing features.

Key result:
- GPA exactly at the GPA scale max matches the top configured standing band
- `section_not_closed` profile explanations stay visible but do not force `review_required` when finalized GPA exists
- missing result / invalid finalized inputs still force `review_required` when configured
- custom active-policy standing rules continue to flow into the university academic profile response
- self-enrollment remains unaffected by `allowedToContinue`
```

## Recent Prompt - U6B academicStandingRules Testing Expansion
```text
Add tests only for university academicStandingRules and academic profile behavior.

Key result:
- expanded unit coverage for default/missing rules, disabled rules, null GPA, review-required exclusions, GPA boundaries, GPA 4.0 top-band handling, custom thresholds, and validation failures
- expanded university academic policy validation tests for custom create input, partial PATCH input, band replacement, and invalid PATCH errors
- expanded university academic profile tests for all default standing ranges, disabled standing output, custom threshold changes, repeatPolicy official GPA feeding standing, and response shape
- added regressions showing school academic profiles do not expose university-only standing/repeat fields and self-enrollment does not enforce `allowedToContinue`
```

## Recent Prompt - U6C University Academic Standing List and Summary APIs
```text
Implement university-only read-only academic standing summary/list APIs.

Key result:
- admin/owner institution-wide routes expose standing counts and compact student rows
- instructor routes are scoped to students in sections where `Section.instructorMemberId` matches the active instructor membership
- standing remains calculated live from active `academicStandingRules`; no stored snapshots, finalization, graduation review, transcript locking, appeals, or self-enrollment enforcement are added
- filters support standing, GPA range, semester, department, search, and pagination
- program filtering is deferred until a program/degree requirement model exists
```

## Recent Prompt - U6C Standing Dashboard Enrollment/Performance Hardening
```text
Harden the university academic standing dashboard with small focused fixes.

Key result:
- semester, department, and instructor dashboard scopes include only `Enrollment.status = enrolled`
- `dropped` enrollments no longer pull students into scoped standing lists
- standing rows are still calculated live, but built with bounded local concurrency
- no stored snapshots, finalization, graduation review, transcript locking, appeals, school changes, or self-enrollment enforcement are added
```

## Recent Prompt - U6B/U6C Real Standing Calculation Verification
```text
Add automated tests and fixture data proving U6B/U6C academic standing calculations from real finalized university outcome inputs.

Key result:
- added finalized university fixtures using Enrollment, Section, Subject, Assessment, AssessmentResult, Semester, and InstitutionAcademicPolicy rows
- verified single-student academic profile standings for good_standing, academic_warning, probation, and suspension with non-null cumulative GPA
- verified admin-configured academicStandingRules thresholds are used instead of hardcoded defaults
- verified U6C admin dashboard summary/list counts, standing and GPA filters, pagination, and instructor-scoped dashboards through the real outcome calculation path
- verified no_standing_yet, review_required with incomplete finalized data, and one repeatPolicy official-GPA interaction
- no production code changes were needed
```

## Recent Prompt - S1 School Promotion Dashboard APIs
```text
Implement read-only school-only promotion dashboard APIs for admin/owner institution-wide access and instructor-scoped assigned-section access.

Key result:
- admin/staff dashboard routes expose school-native promotion summary/list data for an explicit academicYearId
- instructor dashboard routes are scoped through Section.instructorMemberId and active enrolled section rows, with student deduping
- non-cancelled SchoolFinalOutcome records win over live calculation
- rows without final outcomes use existing school outcome and promotion decision services
- dashboard decisions are promoted, repeat_year, conditional_promotion, manual_review, incomplete, and no_final_outcome_yet
- no AcademicYear model, year rollover, class placement, finalization changes, override changes, university changes, or dashboard snapshots are added
```

## Recent Prompt - S1 School Promotion Dashboard Instructor-Boundary Hardening
```text
Harden the school promotion dashboard implementation with the product boundary that admin/staff dashboards remain full yearly promotion dashboards, while instructor dashboards expose only instructor-owned section outcomes.

Key result:
- incomplete admin live rows now return `allowedToPromote=false`
- service-level access rejects inactive actor memberships when membership status is available
- dashboard warnings are normalized to safe `{ code, message, ...safe ids }` objects
- instructor dashboard rows are section-owned outcomes scoped through `Section.instructorMemberId` and active enrolled rows
- instructor routes do not expose full yearly promotion decisions, final outcomes, yearly averages, or failed-subject summaries
- transfer assignments across different semesters are tolerated for admin yearly live rows through the latest active assignment; ambiguous same-semester assignments return a normalized warning
- no AcademicYear model, year rollover, finalization changes, override changes, university changes, or dashboard snapshots are added
```

## Recent Prompt - S1 Dashboard Review Fixes
```text
Review and harden the recent school promotion dashboard and instructor section-only dashboard changes.

Key result:
- verified `getAssignmentSortKey` is declared once and transfer-aware class context receives `semesterOrderById`
- instructor section outcome score handling now coerces numeric strings before validation
- instructor section dashboard has its own strict query validator and rejects `decision` / `finalized`
- instructor list responses use `sectionOutcomes` because rows are student-section outcomes
- instructor section names fall back through `title`, `name`, then `code`
- warning normalization coverage now includes no-policy, missing published assessments, invalid assessment configuration, missing scores, live rows, final rows, and transfer ambiguity
- admin/staff dashboard remains a full promotion dashboard; instructor dashboard remains section-only
```

## Recent Prompt - School Promotion Dashboard Testing Support
```text
Create testing support for the four school promotion dashboard routes.

Key result:
- added a focused Postman collection/environment for admin full promotion summary/list and instructor section-only summary/list
- Postman admin examples cover page, limit, search, schoolClassId, classLevelId, complete, hasMissingResults, decision, and finalized query filters
- Postman instructor examples cover section-safe filters and negative `decision` / `finalized` checks returning 400
- expanded automated school dashboard tests with controller/route-envelope coverage for the four handlers, admin final/live row fields, instructor `sectionOutcomes`, and instructor hasMissingResults filtering
- no production route behavior or university modules were changed
```

## Recent Prompt - AcademicYear First-Class Module
```text
Build a small shared AcademicYear module for school and university institutions.

Key result:
- added tenant-scoped AcademicYear model/service/controller/routes under /institutions/:institutionId/academic-years
- active academic year resolver returns the single active year or "Active academic year not found"
- one active year per institution is enforced by service checks and a partial unique index
- Semester.academicYearId is optional initially for backward compatibility and validates same-institution non-archived years when provided
- SchoolAcademicPolicy now validates appliesTo.academicYearId against AcademicYear and checks semesterWeights against Semester.academicYearId when present
- existing explicit academicYearId school report-card, final-outcome, profile, and promotion dashboard routes remain stable
- no university repeat/standing/self-enrollment rewrites, year rollover, automatic placement, graduation eligibility, transcript locking, or snapshots
```

## Recent Prompt - AcademicYear Integration Hardening
```text
Audit and harden AcademicYear integration points in Semester and SchoolAcademicPolicy.

Key requirements:
- normalize optional Semester academicYearId input and preserve omitted/null backward compatibility
- validate linked AcademicYear references as same-tenant and non-archived
- harden SchoolAcademicPolicy semesterWeights lookup, duplicate handling, and academic-year comparison
- keep old semesters without academicYearId working
- do not enforce semester date containment yet unless clearly safe
- add focused tests and document any deferred TODOs
```

## Recent Prompt - AcademicYear Postman Testing Support
```text
Create focused Postman collection/environment support for manually testing the first-class AcademicYear APIs.

Key requirements:
- add login/context setup that saves accessToken from /auth/login
- cover create/list/get active/get by id/update/archive AcademicYear routes
- save academicYearId, activeAcademicYearId, and archivedAcademicYearId from responses
- include optional Semester and SchoolAcademicPolicy academicYearId integration checks
- include focused negative requests for invalid dates, duplicate names, invalid ids, no active year, archived update, and second active year
- keep committed environment files free of real secrets, tokens, production URLs, and private user data
- document manual variable fill and skip DB-assisted env generation unless it fits existing project style
```

## Recent Prompt - Homework / Project Section Module
```text
Build a shared section-linked Homework / Project module with optional Assessment integration.

Key result:
- Homework is the task/instructions/deadline/submission workflow
- HomeworkSubmission stores offline/manual status or private online upload metadata
- Assessment remains optional and AssessmentResult remains the score/result source
- offline mode supports school paper/in-class submissions marked by teachers
- online_upload mode supports student PDF uploads stored outside public /uploads
- instructor roster joins active enrollments with submissions so missing students appear without persisted missing rows
- protected download authorizes the submitting student, section instructor/admin, or existing scoped coordinator paths
```

## Recent Prompt - Homework Upload Hardening
```text
Review and harden the existing Homework / Project service and upload flow.

Key result:
- student online uploads do not set `markedByUserId`; staff-only marking remains distinct
- online resubmission clears old instructor feedback and removes the replaced private file after successful update
- manual marking requires active enrollments and only applies to `submissionMode=offline`
- `submissionMode` changes are blocked after submissions exist
- setting a submission to `missing` clears submitted/file metadata and removes old private files
- private download path safety, missing-file behavior, and virtual roster missing rows are verified by focused tests
```

## Recent Prompt - Homework Upload Middleware and Controller Hardening
```text
Review and harden the homework submission upload middleware and controller flow.

Key result:
- homework upload middleware keeps files in private `storage/homework-submissions`
- `submissionFile` remains the multipart field, with PDF extension/MIME checks and default 10MB limit
- `storage/` and `homework-submissions/` are not exposed by static middleware
- controller cleanup deletes saved private upload files when the service rejects, without hiding the original error
- service rejects missing and empty upload files
- download controller delegates file access and permission checks to the homework service
- TODO/verify: PDF magic-byte validation is deferred unless stricter file sniffing becomes required
```

## Recent Prompt - Homework Assigned Email Notifications
```text
Add best-effort student email notifications when homework/project becomes assigned.

Key result:
- notifications send only after successful homework create with status assigned or successful draft -> assigned status transition
- recipients are active enrolled section students with active same-institution student memberships and usable deduplicated emails
- email failures are logged and do not fail or roll back the homework API
- emails include title/type/section/dueAt/submissionMode/login instruction and never include private file paths or file keys
- reminders, grading, resubmission, plagiarism, and notification tracking remain deferred
```

## Recent Prompt - Section Materials Module
```text
Build a first-class SectionMaterial module for lecture PDFs / study resources.

Key result:
- SectionMaterial is separate from Homework and never creates HomeworkSubmission rows
- staff/instructors upload PDF resources through private `storage/section-materials` using multipart field `materialFile`
- downloads go through service-level permission checks and do not expose private file keys or paths
- materials may optionally link to a same-section SectionSession
- students can list/download only published materials for actively enrolled sections
- draft and archived materials are hidden from students
- status transitions are draft -> published, draft -> archived, and published -> archived; archived restore is deferred
- no notifications, folders/categories, video/link support, homework deadline/late/missing/returned logic, or new production dependencies
```

## Recent Prompt - Section Materials Upload/Download Hardening
```text
Review and harden the new SectionMaterial service/upload/download flow without rebuilding the module.

Key result:
- service-level upload validation now rejects missing files, empty/invalid size, non-PDF MIME, non-.pdf original filenames, and unsafe generated file keys even if multer is bypassed
- controller create/update cleanup deletes newly uploaded private files on service errors without hiding the original error
- cleanup refuses unsafe paths and old persisted files are deleted only after successful replacement updates
- download remains delegated to service-level permission and private path checks
- strict tenant/section scoped query tests cover material reads, updates, status updates, file access, staff lists, and student lists
- no Homework/HomeworkSubmission changes, no new production dependencies, and PDF magic-byte validation remains deferred
```

## Recent Prompt - Section Materials Postman
```text
Provide Postman collection and environment files for testing SectionMaterial APIs.

Key result:
- added a focused SectionMaterial collection with auth, staff create/list/get/update/replace/download, student list/download, and status transition checks
- added a template environment and local environment mirroring the homework local IDs
- local environment uses `postman/homework-sample.pdf` as `materialPdfPath`
```

## Recent Prompt - Attendance Analytics Institution Policy Risk
```text
Apply existing Institution.policies attendance fields to section attendance analytics.

Key result:
- no new AttendancePolicy model
- section analytics response now includes `attendancePolicySummary`
- each per-student analytics row includes `attendanceRisk` with good/warning/drop_risk status
- effective absences use absent count, floor(lateCount / lateToAbsenceRatio), and excused count only when configured
- no Enrollment auto-drop, no Subject changes, no GPA/percentage/promotion/standing/final-outcome coupling
- notification/escalation is deferred pending a safe duplicate-aware workflow
```

## Recent Prompt - AP4 Academic Profile Explanations
```text
Add structured excluded/incomplete explanations to shared academic profile responses.

Key constraints:
- keep shared facade as delegation only
- preserve school report-card, promotion, and final-outcome behavior
- preserve university GPA, credit, self-enrollment, and repeat-attempt behavior
- use existing warnings/reason-code patterns where possible
- add `excluded` explanations only for safely detectable cases
- keep all explanation queries tenant-scoped and bounded to the student's academic data
- document deferred cases with TODO/verify instead of guessing
```

## Recent Prompt - AP5 Academic Profile Test Hardening
```text
Harden tests for the shared academic profile system and fix only small bugs discovered by those tests.

Focus:
- shared facade route/service dispatch and common envelope
- self/staff accessMode as internal scenarios only
- school academicYearId requirement, report-card warnings, semester explanations, and sanitized finalOutcome
- university empty profile warnings, excluded explanations, GPA preservation, same-institution decorations, and subjectOutcomeSummaries totals
- explanation dedupe/sanitization and tenant scoping
- surrounding school report-card/final-outcome and university self-enrollment regressions
```

## Prompt 4 - School Outcome Preview API
```text
You are working inside my existing backend repo.

Before coding:
1. Read `AGENT.md`
2. Read `PROJECT_CONTEXT.md`
3. Read `DECISIONS.md`
4. Read `API_PROGRESS.md`
5. Read `TESTING_NOTES.md`
6. Read `PROMPTS.md`

Then inspect:
- `schoolOutcomeService`
- `schoolPromotionService`
- `schoolAcademicPolicyService`
- existing assessment/result authorization patterns
- school class/class-level roster flows

Task:
Add a read-only admin/staff preview endpoint for school yearly outcome and promotion decision.

Expected behavior:
- resolve the applicable active `SchoolAcademicPolicy`
- calculate the student's yearly school outcome
- resolve the promotion decision explanation
- return both outcome and decision in one response

Constraints:
- read-only
- do not write final promotion records
- do not move students between class levels
- do not create PDFs
- keep all reads tenant-scoped by `institutionId`
- do not expose writes to students
- reuse existing route/controller/service patterns
- run focused tests before finishing
```

## Prompt 3 - School Promotion Decision Service
```text
You are working inside my existing backend repo.

Before coding:
1. Read `AGENT.md`
2. Read `PROJECT_CONTEXT.md`
3. Read `DECISIONS.md`
4. Read `API_PROGRESS.md`
5. Read `TESTING_NOTES.md`
6. Read `PROMPTS.md`

Then inspect:
- `schoolOutcomeService`
- `schoolAcademicPolicyService`
- `SchoolAcademicPolicy` model
- existing academic outcome decision/explanation patterns if any
- school class/class-level roster flows only as needed for context

Task:
Build an internal school promotion decision service that uses the existing school outcome aggregation service and resolved `SchoolAcademicPolicy`.

Expected behavior:
- do not recalculate marks directly
- use `calculateSchoolStudentYearOutcome`
- evaluate year average, failed subject count, and critical failed subjects
- return an explanation-only recommendation
- keep `complete=false` outcomes from becoming clean final promotion decisions

Constraints:
- calculation/decision only
- do not write final promotion records yet
- do not create PDFs yet
- keep all reads tenant-scoped by `institutionId`
- do not add public routes unless explicitly requested
- keep changes minimal and run focused tests
```
# 2026-06-19 Separate SaaS Provider Control Plane Phase 1

User requested a separate, primarily read-only provider authority plane without changing tenant roles or permitting general tenant-data access.

Key result:
- added separate `PlatformAdmin`, backend platform permission catalog, provider middleware, and `PlatformAuditLog`
- added protected `/platform` institution list/detail/billing, failed webhook, and audit endpoints
- provider views use aggregate Membership counts, canonical billing entitlements, and local webhook-synchronized state without Stripe list fan-out
- added safe allowlisted mappers, Stripe error redaction, audited sensitive reads, and trusted one-time owner creation
- `Membership.role` remains `admin|instructor|student`; no tenant permission reuse, `institutionAccess()`, replay, reconciliation, suspension, impersonation, or provider data mutation was added
- production MFA remains documented hardening and is not claimed as implemented
# 2026-06-19 Platform Control Plane Security Hardening

Harden the existing read-only provider module without rebuilding it.

Key result:
- services independently re-read active PlatformAdmin identity and use only role-catalog permissions
- institution/billing/webhook response sections now follow their distinct platform permissions
- fixed billing routes reject query-string institution overrides
- authorized failures create sanitized best-effort failed audit records without masking original errors
- route tests prove exact permission mapping and `/platform` mounting; controller tests prove plain trusted arguments and ignore tenant/client actor fields
- no platform write routes, tenant authority reuse, or new dependencies were added

# 2026-06-20 Separate Self-Hosted Nginx Deployment

Add an additive single-server production topology using Nginx, Certbot, one backend replica, and authenticated local MongoDB while preserving the development Docker/Nodemon/Mongo/Stripe-CLI workflow.

Key result:
- only Nginx publishes production ports 80/443
- backend and MongoDB stay un-published on a private Docker network
- production Express trusts one proxy hop, exposes minimal `/health`, and does not add localhost CORS origins
- Stripe raw-body webhook ordering and all platform/tenant authorization behavior remain unchanged
- named volumes persist MongoDB, public uploads, and private files for the documented one-server/one-replica boundary
- HTTP ACME bootstrap, HTTPS activation, renewal, backups, troubleshooting, and rollback are documented
