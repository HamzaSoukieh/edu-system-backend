# Responsibility Assignments Postman Guide

This pack manually tests the owner/admin management flow for scoped `ResponsibilityAssignment` records.

## Files

- `postman/responsibility-assignments.postman_collection.json`
- `postman/responsibility-assignments.local.postman_environment.json`
- `postman/responsibility-assignments-light.postman_collection.json`
- `postman/responsibility-assignments-light.local.postman_environment.json`
- `scripts/printResponsibilityPostmanIds.js`

## Import

1. Open Postman.
2. Import `postman/responsibility-assignments.postman_collection.json`.
3. Import `postman/responsibility-assignments.local.postman_environment.json`.
4. Select the `Edu SaaS Responsibility Assignments Local` environment.

## Fill Environment Values

The environment intentionally stores no real JWTs, passwords, database URLs, Stripe keys, Gmail secrets, or other secrets.

Set:

- `baseUrl`, usually `http://localhost:5000`
- `adminToken`, `ownerToken`, `instructorToken`, `studentToken`, or login credentials for the optional auth requests
- `institutionId`, `otherInstitutionId`
- `targetInstructorUserId`, `targetStudentUserId`, `targetAdminUserId`, `inactiveInstructorUserId`, `crossTenantInstructorUserId`
- `departmentId`, `otherDepartmentId`, `classLevelId`, `schoolClassId`, `sectionId`, `otherInstitutionSectionId`

No seed files with stable local IDs were found. The local environment files were filled from the current local database where matching records existed. To refresh useful local IDs from your own database, run:

```powershell
node scripts\printResponsibilityPostmanIds.js
```

The helper uses `MONGO_URI`, only reads data, and prints a JSON block you can paste into the Postman environment.

The light local environment was filled from the current local database for the IDs that were available. Missing local fixtures remain blank: `inactiveInstructorUserId`, `otherDepartmentId`, `classLevelId`, and `schoolClassId`.

## Light Smoke Pack

Use `postman/responsibility-assignments-light.postman_collection.json` when you only want to try the new management behavior quickly. It uses the DB-filled light environment and covers:

- Create Head department, Coordinator section, and Mentor section assignments.
- List and get assignment responses without exposing `permissions`.
- Block student/admin targets.
- Block payload `permissions`.
- Block duplicate active assignment.
- Block cross-tenant section scope.
- Deactivate an assignment and verify `activeNow=true` excludes it.

The light create requests accept `201` or `409`, then a filtered list request saves existing assignment IDs. This makes the pack easier to rerun against the same local database.

## Tokens

If you know local credentials, fill the optional `adminEmail`, `adminPassword`, `ownerEmail`, `ownerPassword`, `instructorEmail`, `instructorPassword`, `studentEmail`, and `studentPassword` values, then run the `Auth / Tokens` folder.

If credentials are not available, paste valid JWTs manually into:

- `adminToken`
- `ownerToken`
- `instructorToken`
- `studentToken`

The collection uses `Bearer {{adminToken}}` by default. Instructor, student, missing-token, and invalid-token requests override auth locally.

## Recommended Run Order

1. `Auth / Tokens`, if using login credentials.
2. `Setup / Health`.
3. `Create Valid Assignments`.
4. `List / Get Assignments`.
5. `Update / Deactivate Assignments`.
6. Negative test folders.
7. `Regression / Design Checks`.

Use a fresh local database or unique target/scope combinations for clean full-folder runs. Re-running create requests against existing active assignments may correctly return `409`.

## Expected Results

Successful management requests should return `200` or `201` with assignment data and no `permissions` field.

Negative requests should fail as designed:

- Non-admin instructor and student actors: `403`
- Missing or invalid token: `401`
- Student/admin/inactive/cross-tenant targets: `400`
- Dangerous payload fields such as `permissions`, `institutionId`, `membershipId`, `userId`, `responsibilityType`, and `role`: `400`
- Invalid responsibility/scope combinations: `400`
- Cross-tenant scope IDs: `404`
- Duplicate active assignment: `409`

## Duplicate Active Assignment

Request `50 Create Duplicate Active Assignment Is Rejected` repeats the head department create payload from request `01`. Run request `01` first, then request `50`; the second request should return `409`.

## activeNow

Requests `12` and `13` list `activeNow=true` and `activeNow=false`.

Request `19` deactivates the coordinator section assignment, saves its id into `inactiveAssignmentId`, and request `51` verifies that id is not returned by `activeNow=true`.

## Design Protections Covered

- Admin management comes from `Membership.role` permissions.
- Scoped Head, Coordinator, and Mentor assignments do not grant assignment-management authority.
- Head remains non-operational for section/session/attendance permissions.
- Coordinator remains the scoped operational role.
- Mentor remains staff/student-support scoped and does not receive generic operational permissions.
- Student and admin targets are blocked from receiving scoped Head/Coordinator/Mentor assignments.
- `ResponsibilityAssignment.permissions` is blocked in create/update payloads and omitted from management responses.

## TODO / Verify

- Fill IDs from your actual local/dev database using the helper or known fixtures.
- Confirm optional login credentials for each actor; no credentials are stored in this repo.
- For repeated manual runs, deactivate or delete test data, or choose new target/scope combinations, before expecting create requests to return `201`.
