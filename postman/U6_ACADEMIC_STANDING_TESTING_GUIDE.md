# U6 Academic Standing Postman Guide

This collection tests only the U6B/U6C API surfaces:

- university academic policy `academicStandingRules`
- single-student university academic profile `academicStanding`
- university academic standing summary/list dashboards
- instructor-scoped standing dashboards
- negative access and validation errors

It does not create full transcript fixtures automatically. Use existing fixture data or create it through the normal semester, subject, section, enrollment, assessment, and result APIs first.

## Files

- `postman/u6-academic-standing.collection.json`
- `postman/u6-academic-standing.environment.json`

## Setup Order

1. Import the collection and environment into Postman.
2. Set `baseUrl`, usually `http://localhost:3000`.
3. Fill credentials:
   - `ownerEmail`
   - `ownerPassword`
   - `instructorEmail`
   - `instructorPassword`
   - `studentEmail`
   - `studentPassword`
4. Fill fixture IDs:
   - `institutionId` for a university institution
   - `schoolInstitutionId` for the school negative check
   - `academicPolicyId` for the active university academic policy
   - `studentMembershipId` for a university student
   - `instructorMembershipId` for an instructor assigned to at least one section
   - `semesterId`
   - `departmentId`
   - `studentSearch`
5. Run `01 Auth` first. Login requests save `ownerToken`, `instructorToken`, and `studentToken`.
6. Run policy/profile/dashboard folders as needed.

## Required Fixture Data

For the best manual pass, use a university tenant with:

- an active owner/admin membership
- at least one active instructor membership
- active student memberships
- at least one active university academic policy
- semesters, departments, subjects, sections, enrollments
- published assessments with complete results for finalized/closed sections

For instructor dashboard checks, the instructor must be assigned through:

```text
Section.instructorMemberId = instructorMembershipId
```

Standing dashboard semester, department, and instructor scoping uses only:

```text
Enrollment.status = enrolled
```

Dropped enrollments should not pull students into scoped dashboard lists.

## Student With Finalized GPA

To test GPA-based standing, choose a student with at least one finalized university outcome:

- section is closed
- assessment results are published
- published assessment weights total 100
- assessment result rows have scores
- the semester has a resolvable university academic policy

Then call:

```text
GET /institutions/:institutionId/students/:studentMembershipId/academic-profile
```

Inspect:

- `academicProfile.summary.cumulativeGpa`
- `academicProfile.academicStanding.standing`
- `academicProfile.academicStanding.reasonCodes`
- `academicProfile.academicStanding.appliedBand`

## no_standing_yet

Use a valid active university student with no finalized academic outcomes. The profile should return:

```json
{
  "academicStanding": {
    "standing": "no_standing_yet",
    "reasonCodes": ["no_finalized_academic_outcomes"],
    "calculationMode": "live",
    "source": "academic_profile"
  }
}
```

## review_required

Use a student whose profile has finalized GPA data plus a blocking incomplete/excluded issue such as:

- missing published assessment result
- invalid assessment configuration
- incomplete published assessment weight total
- missing academic policy
- invalid credit hours

`section_not_closed` stays visible as an explanation, but by current decision it does not force `review_required` when the student already has finalized official GPA.

## Custom Threshold Test

Run:

```text
02 Academic Policy Standing Rules / Patch Policy - Custom Suspension Below 1.2
```

That sets:

- GPA `< 1.2` => `suspension`
- `1.2 <= GPA < 2.0` => `probation`
- `2.0 <= GPA < 2.5` => `academic_warning`
- GPA `>= 2.5` => `good_standing`

Then call the profile or dashboard for a student with cumulative GPA `1.1`. Expected:

```text
academicStanding.standing = suspension
```

Restore defaults afterward with:

```text
02 Academic Policy Standing Rules / Patch Policy - Restore Default Enabled Rules
```

## Admin Dashboard

Use owner/admin token:

```text
GET /institutions/:institutionId/academic-standing/university/summary
GET /institutions/:institutionId/academic-standing/university/students
```

Supported filters:

- `standing`
- `minGpa`
- `maxGpa`
- `semesterId`
- `departmentId`
- `search`
- `page`
- `limit`

Inspect:

- `standingSummary.totalStudents`
- `standingSummary.good_standing`
- `standingSummary.academic_warning`
- `standingSummary.probation`
- `standingSummary.suspension`
- `standingSummary.review_required`
- `standingSummary.no_standing_yet`
- `students[].academicStanding`
- `pagination`

## Instructor Dashboard

Use instructor token:

```text
GET /institutions/:institutionId/instructors/me/academic-standing/summary
GET /institutions/:institutionId/instructors/me/academic-standing/students
```

The instructor should only see students enrolled in sections where `Section.instructorMemberId` is their active membership id. The response is compact and does not expose full transcript history.

## Frontend Fields To Read

Single-student profile:

- `academicProfile.academicStanding.enabled`
- `academicProfile.academicStanding.standing`
- `academicProfile.academicStanding.allowedToContinue`
- `academicProfile.academicStanding.requiresAdvisorReview`
- `academicProfile.academicStanding.reasonCodes`
- `academicProfile.academicStanding.warnings`
- `academicProfile.academicStanding.appliedBand`
- `academicProfile.academicStanding.calculationMode`
- `academicProfile.academicStanding.source`

U5B fields should still appear on university profiles when available:

- `repeatPolicy`
- `gpaCalculation`
- `earnedCreditCalculation`

Dashboard rows:

- `studentMembershipId`
- `name`
- `email`
- `cumulativeGpa`
- `totalEarnedCreditHours`
- `totalAttemptedCreditHours`
- `academicStanding`

## Negative Checks

The collection includes requests for:

- student token cannot access institution-wide dashboard
- no token returns unauthorized
- wrong institution id is rejected
- school institution is rejected or denied by access checks

For the school-institution check to return the university-only conflict, use a token that has access to that school institution. Otherwise a `403` access denial may happen earlier, which is also acceptable for tenant safety.

## Known Limitations

- Standing is calculated live.
- There are no standing snapshots yet.
- `allowedToContinue` is display-only and is not enforced in self-enrollment.
- Graduation review, transcript locking, finalization, appeals, and manual override are deferred.
- If no finalized outcomes exist, profile standing is `no_standing_yet`.
- Large dashboards still calculate per student live; future optimization may use batch aggregation or stored term-close snapshots.
