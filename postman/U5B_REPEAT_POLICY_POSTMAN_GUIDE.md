# U5B Repeat Policy Postman Guide

Files:

- `postman/u5b-repeat-policy.postman_collection.json`
- `postman/u5b-repeat-policy-api-smoke.postman_collection.json`
- `postman/u5b-repeat-policy.local.postman_environment.json`

This collection focuses only on university U5B repeat-policy behavior. It uses the real routes in this repo for auth, university academic policies, academic profile, members, departments, subjects, sections, enrollments, assessments, and self-enrollment eligibility.

## Quick Smoke Only

If you do not want to run the full fixture collection, import `u5b-repeat-policy-api-smoke.postman_collection.json` and run only these requests:

1. `Owner/Admin Login`
2. `Get Academic Policy - repeatPolicy Present`
3. `Update Academic Policy repeatPolicy - Best Attempt Default Shape`
4. `Get Academic Profile - Repeat Metadata`
5. `Student Login`
6. `Self-Enrollment Eligibility - Repeat Policy Metadata`
7. `Self-Enrollment Eligibility - Prerequisite Method Metadata`

That smoke collection tests only the API surfaces changed by U5B:

- `GET/PATCH /institutions/:institutionId/academic-policies/:policyId`
- `GET /institutions/:institutionId/students/:studentMembershipId/academic-profile`
- `GET /institutions/:institutionId/students/me/self-enrollment/sections/:sectionId/eligibility`

It assumes you already have these IDs in the environment: `institutionId`, `academicPolicyId`, `studentMembershipId`, `repeatedSubjectId`, `repeatTargetSectionId`, and `prereqTargetSectionId`. Use the full collection only when you need to create that fixture data from scratch.

## Setup Order

1. Start the backend and set `baseUrl`.
2. Fill `ownerEmail`, `ownerPassword`, and `institutionId` for a university tenant.
3. Use a fresh `fixtureTag` for each run, such as `U5B02`, to avoid duplicate department, subject, and section codes.
4. Run `00 Auth And Context / Owner/Admin Login`.
5. Run `01 Fixture Setup - Repeated Attempts` in order.
6. Run `00 Auth And Context / Student Login` after the student member is created.
7. Run the academic profile and self-enrollment folders.

The fixture creates a failed first attempt and a later passed-final attempt for the same 3-credit subject. It also creates active target sections for same-subject repeat and prerequisite eligibility previews.

## Required Seed Data

You need an existing verified owner/admin account with an active membership in a university institution. The admin must have the permissions already required by the route layer, especially `institution.manage`, `membership.manage`, and `section.manage`.

Member creation sends account-created email through the live member flow. If local email is not configured, create the student separately or use an existing student and fill:

- `studentEmail`
- `studentPassword`
- `studentMembershipId`

Only one active semester can exist per institution. If `Create Latest Active Semester` returns `409`, either archive the current active fixture semester or fill `activeSemesterId` and `latestSemesterId` with an existing active semester.

## Policy Lock Note

The current academic policy service blocks updates to locked policy fields, including `repeatPolicy`, once the policy is used by finalized outcomes. Because of that, the policy-mode PATCH requests accept either `200` or `409` and surface the lock during manual testing.

To compare GPA modes on the same style of data, use one of these workflows:

- Set the desired `repeatPolicy` before publishing assessments and closing sections.
- Use a fresh `fixtureTag` or fresh tenant per mode.
- Create future policy versions for future semesters when testing migration-style behavior.

## What To Inspect

Academic policy responses are returned as:

```json
{ "academicPolicy": { "repeatPolicy": { "...": "..." } } }
```

Academic profile responses are returned as:

```json
{ "academicProfile": { "repeatPolicy": {}, "subjectAttempts": [], "summary": {}, "excluded": [] } }
```

Self-enrollment eligibility responses are returned as:

```json
{ "eligibility": { "blockingReasonCodes": [], "sameSubjectSummary": {}, "prerequisiteSummary": {}, "policySummary": {} } }
```

## Expected U5B Defaults

When `repeatPolicy` is omitted from policy creation, the resolved response should show:

- `enabled: true`
- `gpaCalculationMethod: "best_attempt_only"`
- `earnedCreditsMethod: "count_once_per_subject"`
- `prerequisiteMethod: "best_passed_attempt"`
- `allowGradeImprovementRepeats: true`
- `blockRepeatAfterFinalPass: true`

Old policies without `repeatPolicy` should resolve the same way through API responses.

## GPA Scenarios

Use a fixture with repeated attempts for the same subject.

- `all_attempts`: every eligible finalized attempt is included in official GPA.
- `latest_attempt_only`: only the latest eligible finalized attempt has `includedInOfficialGpa: true`; earlier attempts should show `excludedReasonCode: "repeat_policy_latest_attempt_only"`.
- `best_attempt_only`: only the best eligible finalized attempt is included; excluded attempts should show `excludedReasonCode: "repeat_policy_best_attempt_only"`.
- `replace_failed_with_passed`: earlier failed attempts are excluded after a later pass; excluded attempts should show `excludedReasonCode: "replaced_by_later_passed_attempt"`.

The fixture’s default failed-then-passed data is best for checking `best_attempt_only` and `replace_failed_with_passed`. For “latest attempt worse than earlier,” create a fresh fixture where the first attempt score is higher than the second attempt score before publishing and closing.

## Earned Credit Scenarios

With the default `count_once_per_subject`, repeated passed attempts for the same subject should not double count degree credits:

- Repeated subject attempts stay visible in `subjectAttempts`.
- Only one passed attempt should have `earnedCreditsCounted: true`.
- Duplicate passed attempts should show `earnedCreditExcludedReasonCode: "duplicate_earned_credit_subject"`.
- `summary.totalEarnedCreditHours` should count the subject once.

With `count_each_passed_attempt`, each passed finalized attempt contributes earned credits, preserving legacy behavior when explicitly configured.

For different-credit repeated attempts, create a fresh fixture and change the repeated subject’s credit hours before the later attempt if your local data model permits that scenario. U5B expects `count_once_per_subject` to use the best passed attempt’s credit hours, not a sum.

## Prerequisite Scenarios

The active self-enrollment eligibility response exposes:

- `eligibility.prerequisiteSummary.method`
- `eligibility.prerequisiteChecks[]`

Expected behavior:

- `best_passed_attempt`: a prerequisite is satisfied if any/best eligible attempt passed.
- `latest_attempt`: the latest eligible attempt controls prerequisite satisfaction.

To make the two methods diverge, create prerequisite-subject history where an earlier attempt passes and the latest attempt fails. Switch `repeatPolicy.prerequisiteMethod` before finalizing the fixture, or run a fresh fixture for each method because finalized policies are locked.

## Self-Enrollment Repeat Scenarios

Use `04 Self-Enrollment Repeat Behavior`.

For `passed_final`:

- With `blockRepeatAfterFinalPass: true`, previewing `repeatTargetSectionId` should include `same_subject_already_passed_final`.
- Details should include `sameSubjectSummary.repeatPolicy.blockRepeatAfterFinalPass: true`.
- The repeat-policy reason detail should include `repeat_blocked_after_final_pass`.
- With `blockRepeatAfterFinalPass: false`, that blocker should be absent if other enrollment rules allow the section.

For `passed_improvable`:

- Create a fresh fixture with the historical attempt score between `60` and `69.99`.
- With `allowGradeImprovementRepeats: true`, same-subject repeat should not be blocked by the repeat policy.
- With `allowGradeImprovementRepeats: false`, eligibility should include `repeat_blocked_grade_improvement_not_allowed`.

Other blockers such as capacity, duplicate section enrollment, credit load, or missing prerequisites can still make `isEligible` false. Inspect `blockingReasonCodes` rather than only `isEligible`.

## AP4 Compatibility

Run `Profile - AP4 Excluded Explanation Shape`. The response should still include `academicProfile.excluded` as an array using `reasonCode` and `message`.

Repeat-policy exclusions primarily appear on `subjectAttempts`:

- `excludedReasonCode`
- `excludedReason`
- `earnedCreditExcludedReasonCode`
- `earnedCreditExcludedReason`

AP4 incomplete/finalization explanations still depend on data setup, such as sections not closed, unpublished assessments, missing results, invalid assessment configuration, incomplete weight totals, invalid credits, or missing policy coverage.

## School Sanity

The optional school request calls the university academic-policy endpoint with `schoolInstitutionId`. A school tenant should not dispatch university academic policy behavior; expected responses are `409` for university-only support or auth errors if the actor lacks school access. This is only a quick sanity check, not a school academic test suite.

## Confirmed Routes

- `POST /auth/login`
- `GET /institutions/me`
- `POST /institutions/:institutionId/departments`
- `POST /institutions/:institutionId/semesters`
- `POST /institutions/:institutionId/members`
- `POST /institutions/:institutionId/departments/:departmentId/subjects`
- `POST /institutions/:institutionId/sections`
- `PATCH /institutions/:institutionId/sections/:sectionId`
- `POST /institutions/:institutionId/sections/:sectionId/enrollments`
- `POST /institutions/:institutionId/sections/:sectionId/assessments`
- `PUT /institutions/:institutionId/sections/:sectionId/assessments/:assessmentId/results`
- `PATCH /institutions/:institutionId/sections/:sectionId/assessments/:assessmentId/status`
- `POST /institutions/:institutionId/academic-policies`
- `GET /institutions/:institutionId/academic-policies/:policyId`
- `PATCH /institutions/:institutionId/academic-policies/:policyId`
- `GET /institutions/:institutionId/students/me/academic-profile`
- `GET /institutions/:institutionId/students/:studentMembershipId/academic-profile`
- `GET /institutions/:institutionId/students/me/self-enrollment/sections/:sectionId/eligibility`

## Assumptions

- The owner/admin and student accounts are verified and active.
- The target institution is a university.
- The same academic policy covers both fixture semesters.
- Finalized academic outcomes are produced by closed sections with published assessment weights totaling 100.
- Policy-mode comparison after finalization requires fresh fixtures or future policy versions because the current service locks used policies.
