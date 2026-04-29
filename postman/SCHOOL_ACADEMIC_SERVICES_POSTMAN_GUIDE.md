# School Academic Services Postman Guide

This guide explains how to run:

- `postman/school-academic-services.postman_collection.json`
- `postman/school-academic-services.postman_environment.json`

The collection uses only routes currently wired in:

- `src/routes/authRoutes.js`
- `src/routes/institutionRoutes.js`

## Before You Start

1. Start the backend:

```powershell
npm start
```

2. Import both Postman files:

- Collection: `school-academic-services.postman_collection.json`
- Environment: `school-academic-services.postman_environment.json`

3. Select the `School Academic Services Local` environment.

4. Fill these variables manually before running:

- `baseUrl`: defaults to `http://localhost:5000`
- `adminEmail`: an existing verified admin user email
- `adminPassword`: that admin user password

The collection will auto-save most IDs after successful responses.

## Important Current Repo Realities

- School academic policy is separate from university academic policy.
- Schools do not use credit hours.
- Schools do not use GPA as the main result model.
- Schools do not use student self-enrollment.
- School marks/results reuse `Assessment` and `AssessmentResult`.
- `AssessmentResult` has no separate publish/final status route; published visibility is controlled by `Assessment.status = "published"`.
- There is no `AcademicYear` model/route yet. Postman generates an ObjectId-like `academicYearId` and reuses it in policy, report-card, and final-outcome requests.
- There is no `SchoolStage` model/route yet. The sample policy uses `schoolStageId: null`.
- Final outcome finalization does not move students to next class level.

## Exact Run Order

Run the folders in this order for a clean happy-path flow:

1. `00 Auth`
2. `01 Institution And Members`
3. `02 School Setup`
4. `03 Sections And Roster Sync`
5. `04 School Academic Policy`
6. `05 Assessments And Results`
7. `06 Report Cards And Promotion Summary`
8. `08 School Final Outcomes`

The `07 Optional Promotion Rule Scenarios` folder mutates scores. Run it only when you specifically want to test failure scenarios.

## Variables Auto-Saved

The collection saves these from API responses where possible:

- `authToken`
- `studentAuthToken`
- `institutionId`
- `adminUserId`
- `staffUserId`
- `staffMembershipId`
- `studentUserId`
- `studentMembershipId`
- `academicYearId`
- `semesterOneId`
- `semesterTwoId`
- `classLevelId`
- `schoolClassId`
- `subjectArabicId`
- `subjectMathId`
- `subjectScienceId`
- all six section ids
- all six enrollment ids
- assessment ids
- assessment result ids for the first subject-level examples
- `schoolAcademicPolicyId`
- `schoolFinalOutcomeId`

`adminMembershipId` is included in the environment because it is useful, but the current `/institutions/me` response does not expose membership ids. If you need it, use `GET /institutions/:institutionId/members` and copy it manually.

## Auth And Permissions

All protected routes use:

```http
Authorization: Bearer {{authToken}}
```

Current route permissions:

- School academic policy routes require `institution.manage`.
- School setup routes require `class.manage`, `semester.manage`, `subject.manage`, or `section.manage`.
- Report-card and final-outcome routes require `class.manage`.
- The current role enum is `admin`, `instructor`, `student`.
- In `src/auth/permissions.js`, only `admin` has `class.manage`.

So for report cards and final outcomes, use an admin token unless the permission model changes.

## Academic Year ID

There is no `AcademicYear` model yet. The collection pre-request script generates a valid 24-character ObjectId-like value if `academicYearId` is blank.

Use the same `academicYearId` consistently for:

- `SchoolAcademicPolicy.appliesTo.academicYearId`
- yearly report card URL
- class promotion summary URL
- final outcome URL

If you want to rerun finalization without duplicate conflicts, generate a new `academicYearId` or use a new student.

## Data Setup Notes

The collection creates:

- one school institution
- one instructor member
- one student member
- one class level
- one school class
- two semesters
- three school subjects: Arabic, Math, Science
- six sections: each subject in each semester
- two class student assignments, one per semester

Class assignment syncs backend-managed `Enrollment` rows into matching school sections. Assessment creation requires those enrollment rows to exist.

## Assessment And Result Order

For each section:

1. Create an assessment.
2. Upsert the student score through:

```http
PUT /institutions/:institutionId/sections/:sectionId/assessments/:assessmentId/results
```

3. Publish the assessment through:

```http
PATCH /institutions/:institutionId/sections/:sectionId/assessments/:assessmentId/status
```

Published assessments are the source for school outcome/report-card calculations.

## Included Test Scenarios

### Happy Path

Run through folder `06 Report Cards And Promotion Summary` after all six assessments are published.

Expected:

- yearly report card returns `complete: true`
- promotion decision should be `promoted`
- class promotion summary includes the student decision

### Missing Result Path

In folder `05 Assessments And Results`, run:

- publish Arabic and Math
- run `Missing Result Scenario - Yearly Report Before Science Published`

Expected:

- `complete: false`
- `hasMissingResults: true`
- warnings explain the missing Science published result
- decision should be safe, usually `manual_review` when policy allows manual review

### Critical Subject Failure

Run optional requests:

- `Critical Subject Failure - Lower Arabic Scores`
- `Critical Subject Failure - Lower Arabic Scores S2`
- `Critical Subject Failure - Yearly Report`

Expected:

- Arabic fails only because `subjectArabicId` is configured in policy
- no backend logic hardcodes the name Arabic
- decision should follow the critical subject fail action, currently `repeat_year`

### Failed Subject Count Threshold

Run optional lower-score requests for Arabic, Math, and Science, then:

- `Failed Subject Count Threshold - Yearly Report`

Expected:

- failed subject count reaches threshold `3`
- decision should follow `promotionRules.failDecision`

### Yearly Average Below Minimum

Run:

- `Year Average Below Minimum - Restore Arabic Passing S1`
- `Year Average Below Minimum - Restore Arabic Passing S2`
- leave Math and Science low
- `Year Average Below Minimum - Yearly Report`

Expected:

- Arabic is passing, so critical-subject failure is isolated away
- year average is below policy minimum
- decision includes yearly-average explanation

### Final Outcome

Run:

- `Finalize Without Override`
- `Get Final Outcome`
- `Duplicate Finalize Should Fail`
- `Override Without Reason Should Fail`
- `Override With Reason`

Expected:

- finalization stores calculated and final decisions separately
- duplicate finalize returns `409`
- override without reason returns `400`
- override with reason succeeds

`Alternate Finalize With Override` is included, but run it instead of `Finalize Without Override` on a fresh student/year. If a final outcome already exists, it should return `409`.

### Student Blocked From Staff Route

Run:

- `Login Student For Negative Access Test`
- `Student Token Blocked From Yearly Report Card`

Expected:

- `403`
- student role does not have `class.manage`

### Tenant Isolation Smoke

Fill `otherInstitutionId` manually, then run:

- `Tenant Isolation Smoke - Wrong Institution`

Expected:

- `403` or `404`
- never another tenant's report-card data

## Common Errors

### `No active school academic policy found`

The yearly report-card/finalization flow could not resolve an active `SchoolAcademicPolicy` for:

- `institutionId`
- `academicYearId`
- `classLevelId`

Check that `academicYearId`, `semesterWeights`, and `classLevelId` match the generated data.

### `no_enrolled_subject_section`

The student is not actively enrolled in the subject section for that semester.

Usually this means:

- class assignment was not created
- section was created after assignment but backfill did not occur as expected
- enrollment status is not `enrolled`

### `missing_assessment_result` or missing-result warnings

The service found a subject/semester but no published usable assessment result.

Check:

- assessment was created after enrollment existed
- score was upserted
- assessment was published

### `Permission denied`

The token's membership role does not have the required permission.

For report-card/final-outcome routes, use an admin token in the current repo.

### `A non-cancelled school final outcome already exists...`

Final outcome already exists for:

- institution
- academic year
- student membership

Use a new generated `academicYearId`, a different student, or a future cancellation/recompute workflow when implemented.

## Routes Not Implemented Or Not Wired

These are intentionally not included as real requests:

- No public standalone school outcome calculation routes.
- No standalone school promotion decision route.
- No `AcademicYear` create/list route.
- No `SchoolStage` create/list route.
- No AssessmentResult publish/finalize route.
- No parent/student report-card read route.
- No final outcome cancellation/recompute route yet.
- No automatic next-year class placement route.

## If You Reuse Existing Data

If you skip create requests and use existing records, manually fill:

- `institutionId`
- `studentMembershipId`
- `academicYearId`
- `semesterOneId`
- `semesterTwoId`
- `classLevelId`
- `schoolClassId`
- subject ids
- section ids
- enrollment ids
- assessment ids
- `schoolAcademicPolicyId`

Make sure the records belong to the same institution. Tenant scoping is strict.
