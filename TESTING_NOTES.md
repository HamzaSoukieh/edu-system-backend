# Testing Notes

## General Testing Approach
- There is currently no automated test script in `package.json`.
- For now, testing is mainly manual through Postman or similar API clients.
- Focused helper/unit coverage can be run with:
  - `node --test test/university-academic-policy-foundation.test.js`
  - `node --test test/school-academic-policy.test.js`
  - `node --test test/school-outcome.test.js`
  - `node --test test/school-promotion.test.js`
  - `node --test test/school-report-card.test.js`
  - `node --test test/school-final-outcome.test.js`
  - `node --test test/school-academic-profile.test.js`
  - `node --test test/university-academic-outcome-foundation.test.js`
  - `node --test test/self-enrollment-eligibility.test.js`
  - `node --test test/self-enrollment-browse.test.js`
  - `node --test test/self-enrollment-write.test.js`
  - `node --test test/attendance.test.js`
  - `node --test test/homework.test.js`
  - `node --test test/section-material.test.js`
  - `node --test test/authorization-permission.test.js`
  - `node --test test/section-list-permission.test.js`
  - `node --test test/university-academic-policy-foundation.test.js test/school-academic-policy.test.js`
  - `node --test test/school-academic-policy.test.js test/school-outcome.test.js`
  - `node --test test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js`
  - `node --test test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js`
  - `node --test test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-academic-profile.test.js`
  - `node --test test/university-academic-policy-foundation.test.js test/university-academic-outcome-foundation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
- After backend changes, verify:
  - auth works
  - tenant scoping works
  - permission checks work
  - validation messages stay clear
  - response shape stays consistent

## Postman Basics
- For protected routes:
  - `Authorization: Bearer <token>`
- For institution routes:
  - use `/institutions/:institutionId/...`
- Default JSON testing:
  - `Content-Type: application/json`
  - raw JSON body

## AcademicYear Postman
- Focused collection:
  - `postman/academic-year.postman_collection.json`
- Safe environment template:
  - `postman/academic-year.postman_environment.json`
- Fill manually before running:
  - `baseUrl`
  - `adminEmail`
  - `adminPassword`
  - `institutionId`, or run `Get My Institution Context` after login to save the active institution
- Optional variables for integration and negative checks:
  - `semesterId`
  - `schoolAcademicPolicyId`
  - `institutionWithoutActiveAcademicYearId`
- Auth flow:
  - run `00 Auth And Context / Login Admin`
  - the test script saves `accessToken` from the `/auth/login` response
  - protected requests inherit `Authorization: Bearer {{accessToken}}`
- AcademicYear flow:
  - `Create Active Academic Year` saves `academicYearId`
  - if the created year is `active`, it also saves `activeAcademicYearId`
  - `Create Draft Academic Year` saves `draftAcademicYearId` and sets `academicYearId` for update/archive checks
  - `List Academic Years` can save the first active year as `activeAcademicYearId`
  - `Get Active Academic Year` saves `activeAcademicYearId`
  - `Archive Academic Year` saves `archivedAcademicYearId`
- Suggested manual sequence:
  - login
  - get institution context if `institutionId` is blank
  - create or list academic years
  - get active year
  - get by id
  - update a disposable draft year
  - optionally patch a semester with `academicYearId`
  - optionally patch an existing school academic policy with `appliesTo.academicYearId`
  - archive only a disposable/manual-test year
- Failure-case folder includes invalid date range, duplicate name, invalid `academicYearId`, no active year, update archived year, and second active year checks.
- Optional local DB fill:
  - local-only generated file: `postman/academic-year.local.postman_environment.json`
  - this file is ignored by git and may contain local/dev ObjectIds
  - the committed template remains safe and blank for credentials, tokens, and private data
  - if no `AcademicYear` rows exist yet, create one through Postman and the collection will save `academicYearId` / `activeAcademicYearId`

## Route Patterns To Remember
- Auth routes:
  - `/auth/...`
- Institution root routes:
  - `POST /institutions`
  - `GET /institutions/me`
- Institution-scoped business routes:
  - `/institutions/:institutionId/...`
- Current section routes:
  - `POST /institutions/:institutionId/sections`
  - `GET /institutions/:institutionId/sections`
  - `GET /institutions/:institutionId/sections/:sectionId`
  - `PATCH /institutions/:institutionId/sections/:sectionId`
  - `DELETE /institutions/:institutionId/sections/:sectionId`
- Current enrollment routes:
  - `POST /institutions/:institutionId/sections/:sectionId/enrollments`
  - `GET /institutions/:institutionId/sections/:sectionId/enrollments`
  - `GET /institutions/:institutionId/sections/:sectionId/enrollments/:enrollmentId`
  - `PATCH /institutions/:institutionId/sections/:sectionId/enrollments/:enrollmentId/status`
  - `GET /institutions/:institutionId/students/me/self-enrollment/sections`
  - `GET /institutions/:institutionId/students/me/self-enrollment/sections/:sectionId/eligibility`
  - `POST /institutions/:institutionId/students/me/self-enrollment/submissions`
- Current school structure routes:
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
- Current academic-year routes:
  - `POST /institutions/:institutionId/academic-years`
  - `GET /institutions/:institutionId/academic-years`
  - `GET /institutions/:institutionId/academic-years/active`
  - `GET /institutions/:institutionId/academic-years/:academicYearId`
  - `PATCH /institutions/:institutionId/academic-years/:academicYearId`
  - `POST /institutions/:institutionId/academic-years/:academicYearId/archive`
- Current school subject create route:
  - `POST /institutions/:institutionId/class-levels/:classLevelId/subjects`
- Current section session routes:
  - `POST /institutions/:institutionId/sections/:sectionId/sessions`
  - `POST /institutions/:institutionId/sections/:sectionId/sessions/generate`
  - `GET /institutions/:institutionId/sections/:sectionId/sessions`
  - `GET /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId`
  - `PATCH /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId`
  - `PATCH /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/status`
- Current attendance routes:
  - `POST /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/open`
  - `POST /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/qr-token`
  - `PUT /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/manual`
  - `GET /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/roster`
  - `POST /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/close`
  - `POST /institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/check-in`
  - `GET /institutions/:institutionId/sections/:sectionId/attendance/analytics`
  - `GET /institutions/:institutionId/students/me/attendance-history`
- Current assessment/result routes:
  - `POST /institutions/:institutionId/sections/:sectionId/assessments`
  - `GET /institutions/:institutionId/sections/:sectionId/assessments`
  - `GET /institutions/:institutionId/sections/:sectionId/assessments/:assessmentId`
  - `PATCH /institutions/:institutionId/sections/:sectionId/assessments/:assessmentId`
  - `PATCH /institutions/:institutionId/sections/:sectionId/assessments/:assessmentId/status`
  - `PUT /institutions/:institutionId/sections/:sectionId/assessments/:assessmentId/results`
  - `GET /institutions/:institutionId/sections/:sectionId/assessments/:assessmentId/results`
  - `GET /institutions/:institutionId/sections/:sectionId/results`
  - `GET /institutions/:institutionId/students/me/assessments`
  - `GET /institutions/:institutionId/students/me/results`
- Current homework/project routes:
  - `POST /institutions/:institutionId/sections/:sectionId/homeworks`
  - `GET /institutions/:institutionId/sections/:sectionId/homeworks`
  - `GET /institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId`
  - `PATCH /institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId`
  - `PATCH /institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/status`
  - `GET /institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/submissions`
  - `PUT /institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/enrollments/:enrollmentId/submission`
  - `PATCH /institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/submissions/:submissionId`
  - `GET /institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/submissions/:submissionId/file`
  - `GET /institutions/:institutionId/students/me/homeworks`
  - `GET /institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/submission`
  - `POST /institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/submission`
- Current section material routes:
  - `POST /institutions/:institutionId/sections/:sectionId/materials`
  - `GET /institutions/:institutionId/sections/:sectionId/materials`
  - `GET /institutions/:institutionId/sections/:sectionId/materials/:materialId`
  - `PATCH /institutions/:institutionId/sections/:sectionId/materials/:materialId`
  - `PATCH /institutions/:institutionId/sections/:sectionId/materials/:materialId/status`
  - `GET /institutions/:institutionId/sections/:sectionId/materials/:materialId/file`
  - `GET /institutions/:institutionId/students/me/materials`
- Current academic policy routes:
  - `POST /institutions/:institutionId/academic-policies`
  - `GET /institutions/:institutionId/academic-policies`
  - `GET /institutions/:institutionId/academic-policies/:policyId`
  - `PATCH /institutions/:institutionId/academic-policies/:policyId`
- Current school academic policy routes:
  - `POST /institutions/:institutionId/academic-policies/school`
  - `GET /institutions/:institutionId/academic-policies/school`
  - `GET /institutions/:institutionId/academic-policies/school/:policyId`
  - `PATCH /institutions/:institutionId/academic-policies/school/:policyId`
  - `POST /institutions/:institutionId/academic-policies/school/:policyId/archive`
- Current school report-card routes:
  - `GET /institutions/:institutionId/school-outcomes/students/:studentMembershipId/semesters/:semesterId/report-card`
  - `GET /institutions/:institutionId/school-outcomes/students/:studentMembershipId/academic-years/:academicYearId/report-card`
  - `GET /institutions/:institutionId/school-outcomes/classes/:schoolClassId/academic-years/:academicYearId/promotion-summary`
- Current school final outcome routes:
  - `POST /institutions/:institutionId/school-outcomes/students/:studentMembershipId/academic-years/:academicYearId/finalize`
  - `PATCH /institutions/:institutionId/school-outcomes/final-outcomes/:outcomeId/override`
  - `GET /institutions/:institutionId/school-outcomes/students/:studentMembershipId/academic-years/:academicYearId/final-outcome`
- Current school promotion dashboard routes:
  - `GET /institutions/:institutionId/school-outcomes/academic-years/:academicYearId/promotion-dashboard/summary`
  - `GET /institutions/:institutionId/school-outcomes/academic-years/:academicYearId/promotion-dashboard/students`
  - `GET /institutions/:institutionId/instructors/me/school-outcomes/academic-years/:academicYearId/promotion-dashboard/summary`
  - `GET /institutions/:institutionId/instructors/me/school-outcomes/academic-years/:academicYearId/promotion-dashboard/students`
- Current shared academic profile routes:
  - `GET /institutions/:institutionId/students/me/academic-profile`
  - `GET /institutions/:institutionId/students/:studentMembershipId/academic-profile`
- Current university academic standing dashboard routes:
  - `GET /institutions/:institutionId/academic-standing/university/summary`
  - `GET /institutions/:institutionId/academic-standing/university/students`
  - `GET /institutions/:institutionId/instructors/me/academic-standing/summary`
  - `GET /institutions/:institutionId/instructors/me/academic-standing/students`
- Current academic profile providers:
  - school: `buildSchoolAcademicProfile`
  - university: `buildUniversityAcademicProfile`
- Current self-enrollment preview route:
  - `GET /institutions/:institutionId/students/me/self-enrollment/sections/:sectionId/eligibility`
- Current self-enrollment submission route:
  - `POST /institutions/:institutionId/students/me/self-enrollment/submissions`

## Common Things To Verify
- Invalid ObjectId returns clean `400`
- Missing tenant ownership returns `404` or access denial as expected
- Duplicate keys return `409`
- Update endpoints reject empty payloads
- List endpoints keep response shape stable
- Detail endpoints return fuller resource shape
- Additional institution create should:
  - require authenticated verified user
  - require `name`
  - require valid `type` of `school` or `university`
  - create a new institution with the same user as `ownerUserId`
  - create an active `admin` membership for that same user in the new institution
  - keep existing memberships untouched
  - make the new institution appear in `GET /institutions/me`

## Section-Specific Checks
- Schedule day must exist in the selected semester teaching days
- Room conflict should fail when:
  - same institution
  - same semester
  - same room
  - same day
  - overlapping time
  - conflicting section status is `draft` or `active`
- Back-to-back time ranges should pass:
  - `09:00-10:30`
  - `10:30-12:00`
- Department filtering for section list should work through Subject, not direct Section fields
- School section list should support `schoolClassId` filtering
- Generic section list should allow admin/manage access to list broadly while allowing instructors to list only sections where `instructorMemberId` matches their authenticated membership
- Generic section list should not trust client-provided `instructorMemberId` for instructor scoping
- Student memberships should remain blocked from the generic staff/admin section list
- Enrollment should fail when:
  - section is `closed` or `cancelled`
  - student membership is missing
  - student membership is not `active`
  - member role is not `student`
  - section capacity is already full
- Re-enrollment should happen through enrollment status update, not by creating a second enrollment record
- School section create should:
  - require `schoolClassId`
  - reject `schoolClassId` for university institutions
  - reject inactive `SchoolClass`
  - reject inactive `Subject`
  - reject `schoolClass.classLevelId != subject.classLevelId`
  - backfill enrollments from active class assignments when section status is `draft` or `active`
  - respect remaining section capacity during backfill and skip extra assigned students once the section is full
- Section session should fail when:
  - section is missing
  - section semester is missing
  - sessionDate is outside the semester date range
  - sessionDate day is not allowed by semester teachingDays
  - startTime or endTime is not valid HH:mm
  - startTime is not before endTime
  - another session already exists with the same section + date + startTime + sessionType
- Section session generation should:
  - use the section recurring schedule as the source
  - require `schedule[].sessionType` before generating
  - stay inside the linked semester date range
  - skip dates blocked by semester off-days/exam dates
  - skip already existing section sessions instead of rewriting them
- Section session detail should include lightweight:
  - `section`
  - `subject`
- Generic section session update should fail if it tries to change:
  - `status`
  - `statusNote`
  - `statusChangedAt`
  - `statusChangedByUserId`
- Section session status endpoint should allow:
  - admin
  - parent section instructor
  - derived university department coordinator
  - derived school class-level coordinator
- Session cancellation email should target only:
  - `Enrollment.status = enrolled`
  - `Membership.status = active`
  - users with a valid email

## School Structure Checks
- Department routes should fail for `institution.type = school`
- Class-level routes should fail for `institution.type = university`
- School-class routes should fail for `institution.type = university`
- Class-level create/update should:
  - require tenant ownership by `institutionId`
  - enforce unique `code`
  - enforce unique normalized `name`
  - accept only `active` or `archived` status
- School-class create/update should:
  - require an active `ClassLevel` in the same institution
  - enforce unique `code`
  - enforce unique normalized `name`
  - reject changing `classLevelId` after create
  - support `status=active|archived|all` in list queries
- School subject create/update should:
  - require `classLevelId` for school institutions
  - reject `departmentId` for school institutions
  - reject non-null `creditHours`
  - persist `creditHours = null`
  - reject archived target `ClassLevel`
- School academic policy create/update should:
  - fail for `institution.type = university`
  - require `name`
  - require `appliesTo.academicYearId`
  - require `appliesTo.academicYearId` to reference a real non-archived same-institution `AcademicYear`
  - accept optional `appliesTo.schoolStageId`
  - accept optional `appliesTo.classLevelId`
  - require `gradingRules.gradingMode = percentage`
  - require `gradingRules.scaleMax > 0`
  - require `gradingRules.subjectPassMinPercentage` and `gradingRules.yearPassMinPercentage` within `0..scaleMax`
  - require `aggregationRules.yearCalculationMethod = weighted_semesters`
  - require non-empty `aggregationRules.semesterWeights`
  - require weighted semester total = `100`
  - reject duplicate `semesterId` values in `semesterWeights`
  - reject duplicate critical `subjectId` values in `failureRules.criticalSubjectRules`
  - require request boolean fields to be real booleans, not strings
  - reject `conditional_promotion` decisions when `allowConditionalPromotion=false`
  - reject `manual_review` decisions when `allowManualReview=false`
  - allow only `warning`, `manual_review`, or `repeat_year` as critical-subject `failAction`
  - reject `fail_semester` because school promotion decisions are year-based for now
  - reject invalid `failAction` or promotion decision enums
  - when `appliesTo.classLevelId` is provided, require critical subjects to belong to that same class level
  - when weighted semesters have `academicYearId`, require them to match `appliesTo.academicYearId`
  - old semesters without `academicYearId` should not break school policy validation
  - allow only one `active` policy per exact tenant + academicYearId + schoolStageId + classLevelId scope
- School academic policy resolver checks:
  - prefer exact class-level + stage policy over class-level no-stage policy
  - prefer class-level no-stage policy over stage-level policy
  - prefer stage-level policy over academic-year default policy
  - ignore `draft` and `archived` policies
  - keep tenant scoping by `institutionId`
  - TODO/verify: `schoolStageId` is currently a validated ObjectId because a first-class school-stage model does not yet exist
- School outcome aggregation checks:
  - calculate subject semester percentage from published `AssessmentResult` rows
  - restrict subject semester aggregation to the student's active `Enrollment.status = enrolled` section ids
  - do not include other sections of the same subject/semester when the student is not actively enrolled there
  - return `no_enrolled_subject_section` when the student has no active enrolled section for the subject/semester
  - ignore draft/unpublished assessments
  - calculate subject yearly percentage using `SchoolAcademicPolicy.aggregationRules.semesterWeights`
  - support custom semester weights
  - calculate student yearly average across class-level school subjects
  - detect failed subjects using `gradingRules.subjectPassMinPercentage`
  - detect critical failed subjects using `failureRules.criticalSubjectRules`
  - return missing-result warnings without crashing
  - return `invalid_assessment_configuration` when a published assessment has invalid `maxScore` or `weight`
  - expose `complete` and `hasMissingResults` on subject semester, subject year, and student year outcomes
  - keep incomplete outcomes from being presented as clean final pass/fail results
  - keep all queries tenant-scoped by `institutionId`
  - do not use GPA or credit hours
  - do not write final promotion decisions or final outcome records
  - TODO/verify: `AssessmentResult` currently has no independent status/published/final field; school outcome aggregation uses `Assessment.status = published` as the final visibility gate
  - TODO/verify: student yearly subject resolution currently prefers Enrollment -> Section -> Subject and falls back to active class-level subjects only when called without enrollment context
- School promotion decision checks:
  - critical subject failure returns configured `repeat_year` / fail decision
  - subject names are not hardcoded; Arabic only affects promotion when its `subjectId` is configured in policy critical-subject rules
  - failed-subject-count threshold triggers repeat/fail decision when reached
  - failed-subject-count below threshold can still promote when no other blockers exist
  - yearly average below `gradingRules.yearPassMinPercentage` returns fail decision
  - missing/incomplete required results return `manual_review` when allowed, otherwise fail decision
  - successful student returns promoted
  - decision object includes `reasonCodes`, `reasons`, and `warnings`
  - service does not depend on GPA or credit hours
- School report-card checks:
  - student semester report card resolves the student's class/class level from semester roster assignment
  - student semester report card resolves an active school policy through the semester's policy weights
  - student semester report card returns subject percentages, semester average, warnings, `complete`, and `hasMissingResults`
  - service-level access rejects actor memberships from another institution
  - service-level access rejects actor memberships without `institutionId`
  - service-level access rejects roles without `class.manage` in `ROLE_PERMISSIONS`
  - student yearly report card resolves active school policy for the academic year/class level
  - student yearly report card includes the promotion decision explanation
  - class promotion summary uses the school outcome service plus promotion decision service for assigned students
  - class promotion summary queries use the verified `ClassStudentAssignment.status` schema default (`assigned`)
  - subject lookups use the verified `Subject.status` schema default (`active`)
  - missing active school policy returns a clear `404`
  - missing assessment results remain warnings and do not present incomplete outcomes as clean final passes
  - report-card responses should not include GPA or credit-hour fields
  - routes are admin/staff-only for now through `class.manage`
  - TODO/verify: semester report-card policy resolution does not use stage fallback until a first-class school-stage source exists
  - TODO/verify: yearly student report cards currently reject multiple class assignments across policy semesters instead of guessing through transfers
  - TODO/verify: class promotion summary is unpaginated for the MVP small-roster assumption
- School final outcome checks:
  - finalization recalculates the student yearly outcome before storing
  - finalization stores the active school policy snapshot and resolution level
  - calculated decision/reasons/warnings remain separate from final decision/reasons/warnings
  - finalize without override stores the calculated decision as the final decision
  - finalize with override requires `override.finalDecision` and a non-empty `override.reason`
  - later override requires `finalDecision` and a non-empty `reason`
  - final decisions allow `promoted`, `repeat_year`, `conditional_promotion`, and `manual_review`
  - final decisions reject `warning`
  - duplicate non-cancelled final outcome creation for the same student and academic year returns `409`
  - duplicate finalized outcome creation is protected by a finalized-only unique partial index
  - get/override queries stay scoped by `institutionId`
  - actor memberships from another institution are rejected
  - actor memberships without `institutionId` are rejected
  - roles without `class.manage` are rejected
  - finalization uses the verified `ClassStudentAssignment.status` schema default (`assigned`) as the active roster status
  - cancelled final outcomes cannot be overridden
  - override does not erase calculated decision or outcome snapshot
  - finalization does not update `SchoolClass`, `ClassLevel`, or class roster assignments
  - no GPA or credit-hour fields should appear in final outcome responses
  - TODO/verify: future automatic next-year placement remains deferred and should be a separate explicit workflow
- School promotion dashboard checks:
  - admin/staff summary counts school-native decisions and finalized/live rows
  - list returns compact rows with student identity, class context, yearly summary, decision fields, completion fields, and warnings
  - non-cancelled `SchoolFinalOutcome` wins over live calculation
  - live rows use existing school outcome + promotion decision services
  - incomplete live yearly outcomes count as `incomplete`
  - incomplete live yearly rows always return `allowedToPromote=false`
  - missing class/roster/live context counts as `no_final_outcome_yet`
  - dashboard warnings are normalized to safe `{ code, message, ...safe ids }` objects
  - filters work for `decision`, `schoolClassId`, `classLevelId`, `complete`, `hasMissingResults`, `finalized`, and `search`
  - pagination works with max limit clamping
  - route requires valid `academicYearId`
  - tenant isolation excludes other-institution students
  - non-school institutions are rejected
  - inactive actor memberships, students, and unauthenticated requests are blocked from institution-wide dashboards
  - instructor dashboards use `Section.instructorMemberId` plus `Enrollment.status = enrolled`
  - instructor dashboard returns section-owned subject/semester rows, not full yearly promotion decisions or final outcomes
  - instructor list response uses `sectionOutcomes`, not `students`, because rows are student-section outcomes
  - instructor rows do not include `decision`, `finalDecision`, `calculatedDecision`, `allowedToPromote`, `yearlyAveragePercentage`, or `criticalFailedSubjects`
  - instructor section summary dedupes the `totalStudents` count even when one student appears in multiple instructor sections
  - instructor section dashboard rejects promotion-only `decision` and `finalized` query filters
  - instructor section calculation handles numeric string scores, missing scores, missing policies, missing published assessments, and invalid assessment configuration with normalized warnings
  - instructors cannot use institution-wide dashboard unless they also have an admin/staff permission role
  - transfer assignments across different semesters are tolerated by using the latest resolvable active assignment for admin yearly live calculation
  - ambiguous same-semester active assignments return a normalized warning row
  - AcademicYear is first-class elsewhere, but dashboards still take explicit `academicYearId`; year rollover, placement, finalization, and override behavior should not be added
- School academic profile provider checks:
  - returns a school-only profile shape with student, academicYear, summary, reportCards, finalOutcome, and warnings
  - requires `academicYearId`
  - rejects invalid `academicYearId`
  - rejects invalid `studentMembershipId`
  - rejects cross-tenant `studentMembershipId`
  - rejects non-student target memberships
  - rejects non-active target student memberships
  - stays admin/staff-only through `class.manage` for now
  - rejects non-school institutions
  - uses existing school yearly report-card logic as the main source
  - includes optional semester report-card data only when `semesterId` is provided
  - returns `finalOutcome: null` when the final-outcome read returns the expected `404`
  - includes sanitized final outcome summary data when finalized
  - does not expose final-outcome audit fields, actor ids, tenant ids, class ids, or policy snapshots through the profile provider
  - preserves `complete`, `hasMissingResults`, warnings, reason codes, reasons, and decision fields
  - remains read-only and must not write final outcomes, assignments, classes, assessments, or results
- Shared academic profile facade checks:
  - self route dispatches school students to the school provider
  - self route dispatches university students to the university provider
  - admin/staff target route dispatches same-institution school students to the school provider
  - admin/staff target route dispatches same-institution university students to the university provider
  - student actors cannot use the target-student route to read another student's profile
  - cross-tenant actor membership is rejected before provider dispatch
  - school `academicYearId` requirement is preserved from the school provider
  - university profiles do not require `academicYearId`
  - shared facade response is `{ academicProfile: ... }`
  - facade must not implement school calculations, university GPA logic, or finalization behavior
- Class roster create should:
  - require `semesterId`
  - require `studentMemberId`
  - require an active `SchoolClass`
  - require the target membership to be an active student in the same institution
  - create or reactivate one semester-scoped assignment row per student
  - reject duplicate active assignment creation for the same student and semester
- Class roster list should:
  - require `semesterId`
  - stay scoped to the target class and institution
  - return stable assignment status values: `assigned` or `removed`
- Class roster status update should:
  - allow only `assigned` and `removed`
  - reactivate existing shared enrollments when moving back to `assigned`
  - mark matching school enrollments as `dropped` when moving to `removed`
- School enrollment write flows should fail with a clear class-roster-managed message for:
  - `POST /sections/:sectionId/enrollments`
  - `PATCH /sections/:sectionId/enrollments/:enrollmentId/status`
- School enrollment read flows may still be used to verify synced roster state
- Roster sync checks:
  - assigning a student to a class should create `Enrollment.status = enrolled` for all matching school sections in the same class and semester where section status is `draft` or `active`
  - assigning a student to a class should skip matching school sections that are already at capacity
  - removing a student from a class should change matching school enrollments to `dropped`
  - reassigning the same student should reactivate matching dropped enrollments to `enrolled`
  - reassigning the same student should still skip a matching section if that section is now full
  - creating a new school section should backfill active assigned students in stable assignment order until capacity is reached
  - sections in `closed` or `cancelled` status should not be rewritten by roster sync

## Attendance-Specific Checks
- Opening attendance should fail when:
  - section session is missing
  - parent section is missing
  - section session is `cancelled`
  - section has no `instructorMemberId`
  - current membership is not the parent section instructor
  - attendance is already `open` or `closed`
- QR token issuing should fail when:
  - attendance is not `open`
  - current membership is not the parent section instructor
  - the section session local calendar date is not today
  - each new QR token request should invalidate the previous token immediately
- Student QR check-in should fail when:
  - current membership is not `student`
  - attendance is not `open`
  - the section session local calendar date is not today
  - QR token is missing
  - QR token is expired
  - QR token is invalid
  - student does not have active enrolled enrollment in the section
  - attendance is already recorded for that enrollment/session
  - QR check-in should classify:
      - `present` when submitted on the scheduled session date at or before the current 10-minute grace window after the later of the scheduled session start time and `attendanceOpenedAt`
      - `late` when submitted after that grace window while attendance is still open
- Simple QR regression pass:
  - attendance opened before scheduled start: before scheduled start but same day => `present`
  - attendance opened before scheduled start: within 10 minutes after scheduled start => `present`
  - attendance opened before scheduled start: after grace => `late`
  - attendance opened late after scheduled start: within 10 minutes after opening => `present`
  - attendance opened late after scheduled start: after that => `late`
  - wrong-date/future/past session => QR token issuance and QR check-in are rejected
- Manual attendance upsert should:
  - accept only enrolled enrollments from the same section
  - update existing attendance record if it already exists
  - reject duplicate `enrollmentId` values in the same payload
  - allow correction after attendance is `closed` for authorized instructor/admin/derived coordinator access
  - still block attendance edits when attendance was never opened
- Roster should:
  - use enrollments as the base
  - show `pending` when no attendance record exists yet
  - support:
    - `all`
    - `attended`
    - `not_attended`
    - `present`
    - `absent`
    - `late`
    - `excused`
    - `pending`
- Closing attendance should:
  - fail when attendance is not `open`
  - create `absent` records for enrolled students still missing attendance
  - clear current QR token hash/expiry on the section session
- Student attendance history should:
  - allow only the logged-in student membership in that institution
  - reject non-student memberships
  - return only existing `AttendanceRecord` rows for that student
  - support optional `sectionId`, `fromDate`, `toDate`, and `status` filters
  - apply date filtering against `SectionSession.sessionDate`
  - keep tenant scoping by `institutionId`
  - return lightweight nested:
    - `session`
    - `section`
    - `subject`
  - avoid unnecessary duplicate top-level ids when nested objects already provide that context
  - keep `summary` counts aligned with the exact filtered history result set
- Attendance analytics should:
  - allow:
    - admin
    - the parent section instructor
    - the same safely-derived university department coordinator path already used for section session status changes
    - the same safely-derived school class-level coordinator path already used for section session status changes
  - reject students
  - reject unrelated staff from other departments/scopes
  - include only section sessions where:
    - `attendanceState = closed`
    - `status != cancelled`
  - exclude `open`, `not_started`, and `cancelled` sessions
  - support optional `fromDate` and `toDate` filters against `SectionSession.sessionDate`
  - keep analytics strictly based on the filtered finalized `AttendanceRecord` rows
  - count `late` as attended while keeping it separate from `present`
  - keep `excused` separate from `absent`
  - return:
    - top-level `section`
    - top-level `subject`
    - top-level `range`
    - `summary.totalClosedSessions`
    - `summary.attendanceRate = attendedCount / totalCount`
    - stable `perSession` ordering by `sessionDate`, then `startTime`
    - stable `perStudent` ordering by student full name when available
  - avoid unnecessary duplicate fields in the analytics response

## Assessment / Results Checks
- Assessment create should:
  - require tenant-owned parent section
  - require at least one active enrolled student in the section
  - require `title`
  - require valid `type`
  - require numeric `maxScore > 0`
  - require numeric `weight > 0`
  - reject `weight > 100`
  - require `assessmentDate` when `sectionSessionId` is not provided
  - default `assessmentDate` from the linked section session when `sectionSessionId` is provided and `assessmentDate` is omitted
  - reject a linked `sectionSessionId` from another section or tenant
  - snapshot current active enrolled section students into `AssessmentResult` rows with null scores
- Assessment list should:
  - stay scoped to the section and institution
  - support `status=draft|announced|published|archived|all`
  - stay lightweight by default
- Assessment detail should:
  - return fuller assessment shape
  - include linked lightweight `sectionSession` summary when present
- Assessment update should:
  - allow only draft assessments
  - reject archived assessments
  - reject unknown patch fields
  - reject empty patch payloads
  - allow draft-safe edits only:
    - `title`
    - `description`
    - `type`
    - `assessmentDate`
    - `sectionSessionId`
    - `maxScore`
    - `weight`
- Assessment status update should:
  - allow `draft -> announced`
  - allow `announced -> published`
  - allow `draft -> published`
  - allow `draft -> archived`
  - allow `announced -> archived`
  - allow `published -> archived`
  - reject unpublish
  - reject publishing when any snapped result row still has null score
  - reject publishing when total published section weight would exceed `100`
  - set `publishedAt`
  - set `publishedByUserId`
  - keep publish metadata when later archiving
  - send best-effort announcement email on `draft -> announced` to:
    - `Enrollment.status = enrolled`
    - `Membership.role = student`
    - `Membership.status = active`
    - users with a valid email
  - send best-effort results-available email on `announced -> published` and `draft -> published` to the same current roster scope
  - not send email for archive transitions
- Assessment result upsert should:
  - accept only snapshot rows already created for that assessment
  - reject duplicate `enrollmentId` values in the same payload
  - reject enrollment ids from another assessment/section/tenant
  - accept partial bulk updates for only the provided rows
  - reject archived assessment writes
  - reject null score writes after an assessment is already published
  - allow nullable note values and note clearing
  - keep/update `recordedByUserId` as the last writer
- Assessment results read should:
  - return lightweight student info using the existing membership/profile/user pattern
  - keep archived assessments readable to staff
- Section results should:
  - include only published, non-archived assessments
  - exclude draft assessments
  - exclude archived assessments
  - return top-level `section`
  - return top-level `subject`
  - return `summary.publishedAssessmentCount`
  - return `summary.publishedWeightTotal`
  - return `summary.isFinalized`
  - compute each student row using:
    - `earnedWeightedScore = sum((score / maxScore) * weight)`
    - `percentage = earnedWeightedScore / applicableWeightTotal * 100`
- Student assessment visibility should:
  - allow only the logged-in student membership in that institution
  - reject non-student memberships
  - return only `announced` and `published` assessments
  - derive visibility from the student's current active `Enrollment.status = enrolled` section enrollments
  - never leak `draft` assessments
  - never leak `archived` assessments
  - stay metadata-only without `score`, `note`, `weight`, `maxScore`, or aggregate result fields
  - include lightweight `section`, `subject`, and optional `sectionSession` summaries
- Student self results should:
  - allow only the logged-in student membership in that institution
  - reject non-student memberships
  - return only published assessment data
  - never leak draft assessments
  - exclude archived assessments
  - support optional `sectionId` and `semesterId` filters
  - include the student’s own published notes
- Assessment/results authorization should allow:
  - admin
  - parent section instructor
  - derived university department coordinator for the parent subject department only
  - derived school class-level coordinator for the parent section class level only
  - reject unrelated coordinators from other departments or class levels
  - reject students on staff routes
- Assessment notification delivery should:
  - notify only active enrolled students in the same institution and section
  - not notify dropped or non-enrolled students
  - not notify students from another institution
  - not expose raw scores in result-published emails
  - not weaken tenant scoping or authorization if email delivery fails
  - keep status changes successful even when best-effort email delivery logs failures

## Academic Policy / Self-Enrollment Foundation Checks
- Academic policy create/update should:
  - allow only university institutions
  - require same-institution `effectiveFromSemesterId`
  - reject creating a second `active` policy for the same institution + `effectiveFromSemesterId`
  - reject resolvable start-semester collisions that would make semester resolution ambiguous
  - reject invalid outcome threshold gaps/overlaps
  - reject invalid GPA band gaps/overlaps and require full `0..100` coverage
  - sort GPA bands deterministically by `minPercentage`
  - reject `defaultMaxCreditHours < minimumEnrollmentCreditHours`
  - reject `overloadMaxCreditHours < defaultMaxCreditHours`
  - reject `overloadMinGpa` above the configured GPA scale
- Academic policy patch should:
  - reject empty payloads
  - allow safe draft edits
  - block dangerous academic-field edits once the policy is already used by finalized outcomes
- Subject prerequisite create/update should:
  - allow `prerequisiteSubjectIds` only for university subjects
  - deduplicate repeated ids
  - reject invalid ids
  - reject direct self-reference on update
  - reject prerequisite ids from another institution
- Self-enrollment eligibility preview should:
  - allow only active student membership in the same institution
  - reject school institutions
  - reject non-active-semester target sections
  - reject target sections outside current enrollable statuses
  - reject inactive or non-credit-hour university subjects
  - keep `{ eligibility: ... }` response style while returning stable explanation groups
  - return `isEligible=false` with blocking codes for:
    - existing section enrollment record
    - section full
    - missing prerequisites
    - prior same-subject `passed_final`
    - projected load above policy max
  - return structured explanation fields for:
    - `blockingReasons`
    - `warnings`
    - `infos`
    - `duplicateEnrollment`
    - `prerequisiteSummary`
    - `sameSubjectSummary`
    - `sectionCapacity`
    - `loadSummary`
  - keep projected load below policy `minimumEnrollmentCreditHours` as a preview warning that is deferred to final submission validation
  - keep the near-graduation under-load exception deferred until a future graduation-requirement model exists
  - use institution-configured load rules instead of hardcoded platform defaults
- Self-enrollment browse should:
  - allow only active student membership in the same institution
  - reject school institutions
  - use the institution active semester as the discovery scope
  - include only structurally valid university section candidates from that active semester
  - exclude sections whose linked subject is inactive, cross-tenant, or missing valid `creditHours`
  - keep each list row lightweight instead of embedding the full preview explanation payload
  - keep `eligibilitySummary` aligned with the shared preview rule engine when included
  - support `availableOnly=true` as a full-section filter only, not as a full academic-eligibility filter
  - keep tenant scoping by `institutionId` across sections, subjects, enrollments, and seat counts
- Self-enrollment write should:
  - allow only active student membership in the same institution
  - reject school institutions and school-linked sections
  - use `POST /students/me/self-enrollment/submissions`
  - require `sectionIds` in the JSON body
  - require `sectionIds` to be a non-empty array
  - reject invalid `sectionIds[*]`
  - deduplicate repeated section ids in the payload before final validation
  - reuse the shared eligibility engine instead of duplicating preview business rules
  - validate the whole submitted section set before creating any enrollments
  - create shared `Enrollment` rows only when the combined submitted decision is eligible
  - reject duplicate same-section enrollment attempts
  - reject duplicate same-subject selections in one submission
  - reject full sections both in submission-time validation and on the final shared create-time capacity re-check
  - evaluate `minimumEnrollmentCreditHours` against the final combined projected load, not one section in isolation
  - reject final combined projected load above the policy max/overload max
  - keep tenant scoping by `institutionId` on every section and enrollment query
  - rely on the current unique enrollment index for duplicate-row protection
  - keep the near-graduation under-minimum exception explicitly deferred until a real graduation requirement source exists
  - TODO/verify: submitted student schedule-overlap validation is deferred until a shared non-room-specific schedule helper exists
- Academic outcome foundation checks:
  - university academic policy/outcome implementation files are internally university-prefixed
  - repeated same-subject attempts should resolve through one stable best-outcome meaning for eligibility reuse
  - default `repeatPolicy.gpaCalculationMethod = best_attempt_only` should include only the best eligible finalized repeated attempt in official GPA
  - `all_attempts`, `latest_attempt_only`, `best_attempt_only`, and `replace_failed_with_passed` GPA methods should classify repeated attempts consistently
  - default `repeatPolicy.earnedCreditsMethod = count_once_per_subject` should not double-count repeated passed subject credits
  - `count_each_passed_attempt` should preserve legacy earned-credit behavior only when explicitly configured
  - repeated attempts excluded from official GPA by repeat policy should remain visible in university academic profile `subjectAttempts`
  - prerequisite checks should use `best_passed_attempt` by default and `latest_attempt` when configured
  - self-enrollment same-subject repeat checks should respect `allowGradeImprovementRepeats` and `blockRepeatAfterFinalPass`
  - default `academicStandingRules` should resolve for old university policies without the field
  - academic standing should use the active policy's GPA bands instead of hardcoded thresholds
  - university academic profiles should include live/read-only `academicStanding`
  - no finalized university outcomes should return `no_standing_yet`
  - incomplete official university profile inputs should return `review_required` when the policy requires manual review
  - disabled academic standing rules should return a disabled standing shape without enforcing self-enrollment behavior
  - GPA exactly at the GPA scale maximum should match the top academic standing band
  - `section_not_closed` explanations should not force `review_required` when finalized GPA exists
  - closed sections with missing student published scores should be excluded from finalized outcome meaning
  - closed sections with published weight totals that are not academically finalized should be excluded from finalized outcome meaning
  - cumulative GPA should stay stable at policy-sensitive numeric boundaries

## Known Debugging Notes
- If request body is unexpectedly `{}`, check content type first.
- Member create/update routes also accept multipart and some raw text JSON cases; section routes currently assume normal JSON.
- If a room conflict check behaves strangely, inspect:
  - normalized day values
  - time format
  - section status
  - semester match
- If tenant data seems missing, verify `institutionId` is present in both route and DB query.

## Sample Request Body Placeholders

### Create Section
```json
{
  "semesterId": "SEMESTER_ID",
  "subjectId": "SUBJECT_ID",
  "code": "A",
  "title": "Example Section",
  "instructorMemberId": "MEMBERSHIP_ID",
  "capacity": 40,
  "schedule": [
    {
      "sessionType": "lecture",
      "day": "monday",
      "startTime": "09:00",
      "endTime": "10:30",
      "room": "Room 201"
    }
  ],
  "status": "draft"
}
```

### Update Section
```json
{
  "title": "Updated Section Title",
  "capacity": 45,
  "status": "active"
}
```

### Create School Section
```json
{
  "semesterId": "SEMESTER_ID",
  "subjectId": "SUBJECT_ID",
  "schoolClassId": "SCHOOL_CLASS_ID",
  "code": "A",
  "title": "Grade 7 A - Math",
  "instructorMemberId": "MEMBERSHIP_ID",
  "capacity": 40,
  "schedule": [
    {
      "sessionType": "lecture",
      "day": "monday",
      "startTime": "09:00",
      "endTime": "10:30",
      "room": "Room 201"
    }
  ],
  "status": "draft"
}
```

### Create Enrollment
```json
{
  "studentMemberId": "MEMBERSHIP_ID"
}
```

### Finalize Self-Enrollment Submission
```json
{
  "sectionIds": [
    "SECTION_ID_1",
    "SECTION_ID_2"
  ]
}
```

### Create Class Level
```json
{
  "name": "Grade 7",
  "code": "G7",
  "description": "Lower secondary level",
  "status": "active"
}
```

### Create School Class
```json
{
  "classLevelId": "CLASS_LEVEL_ID",
  "name": "Grade 7 A",
  "code": "G7-A",
  "status": "active"
}
```

### Create Additional Institution
```json
{
  "name": "Second Campus School",
  "type": "school"
}
```

### Assign Student To School Class
```json
{
  "semesterId": "SEMESTER_ID",
  "studentMemberId": "MEMBERSHIP_ID"
}
```

### Update Class Assignment Status
```json
{
  "status": "removed"
}
```

### Update Enrollment Status
```json
{
  "status": "dropped"
}
```

### Create Section Session
```json
{
  "sessionType": "lecture",
  "sessionDate": "2026-03-23",
  "startTime": "09:00",
  "endTime": "10:30",
  "room": "Room 201",
  "status": "scheduled"
}
```

### Generate Section Sessions
```json
{
  "fromDate": "2026-03-23",
  "toDate": "2026-05-30"
}
```

### Update Section Session
```json
{
  "sessionDate": "2026-03-24",
  "startTime": "11:00",
  "endTime": "12:30",
  "room": "Lab 2"
}
```

### Update Section Session Status
```json
{
  "status": "cancelled",
  "note": "Instructor is unavailable today."
}
```

### Open Attendance
```json
{}
```

### Manual Attendance Upsert
```json
{
  "entries": [
    {
      "enrollmentId": "ENROLLMENT_ID",
      "attendanceStatus": "present",
      "note": null
    },
    {
      "enrollmentId": "ENROLLMENT_ID_2",
      "attendanceStatus": "excused",
      "note": "Medical excuse"
    }
  ]
}
```

### Student QR Check-In
```json
{
  "token": "RAW_QR_TOKEN"
}
```

### Close Attendance
```json
{}
```

### Create Assessment
```json
{
  "title": "Midterm 1",
  "description": "Written midterm exam",
  "type": "midterm",
  "assessmentDate": "2026-04-10",
  "maxScore": 100,
  "weight": 30
}
```

### Create Session-Linked Assessment
```json
{
  "title": "Quiz 3",
  "type": "quiz",
  "sectionSessionId": "SECTION_SESSION_ID",
  "maxScore": 20,
  "weight": 10
}
```

### Update Assessment Status
```json
{
  "status": "published"
}
```

### Upsert Assessment Results
```json
{
  "entries": [
    {
      "enrollmentId": "ENROLLMENT_ID",
      "score": 18,
      "note": "Strong work"
    },
    {
      "enrollmentId": "ENROLLMENT_ID_2",
      "score": 14,
      "note": null
    }
  ]
}
```

## Space For Session Notes
- 2026-04-27 school outcome hardening:
  - ran `node --test test/school-outcome.test.js`
  - result: 13 passing
  - ran `node --test test/school-academic-policy.test.js test/school-outcome.test.js`
  - result: 35 passing
- 2026-04-28 school promotion decision foundation:
  - ran `node --test test/school-promotion.test.js`
  - result: 9 passing
  - ran `node --test test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js`
  - result: 44 passing
- 2026-04-29 school report-card read APIs:
  - ran `node --test test/school-report-card.test.js`
  - result: 7 passing
  - ran `node --test test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js`
  - result: 52 passing
- 2026-04-29 school final outcome foundation:
  - ran `node --test test/school-final-outcome.test.js`
  - result: 12 passing
  - ran `node --test test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js`
  - result: 64 passing
- 2026-04-30 school final outcome tenant/index hardening:
  - ran `node --test test/school-final-outcome.test.js`
  - result: 15 passing
  - ran `node --test test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js`
  - result: 67 passing
- 2026-04-30 school academic hardening sweep:
  - tightened report-card service access so actor memberships must include the same `institutionId`
  - verified no separate school constants/validation files were added
  - ran `node --test test/school-report-card.test.js`
  - result: 8 passing
  - ran `node --test test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js`
  - result: 68 passing
- 2026-04-30 academic naming boundary cleanup:
  - renamed university-only academic policy/outcome/self-enrollment eligibility implementation files to use university prefixes
  - kept public academic policy and self-enrollment route URLs unchanged
  - kept `InstitutionAcademicPolicy` model name unchanged to avoid unsafe persistence/collection churn
  - ran `node --test test/university-academic-policy-foundation.test.js test/university-academic-outcome-foundation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js`
  - result: 113 passing
- 2026-05-01 internal school academic profile provider:
  - added read-only internal `buildSchoolAcademicProfile`
  - ran `node --test test/school-academic-profile.test.js`
  - result: 10 passing
  - ran `node --test test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-academic-profile.test.js`
  - result: 78 passing
- 2026-05-01 school academic profile provider hardening:
  - added active target-student membership validation
  - made optional final-outcome not-found handling independent of exact error message text
  - sanitized provider final-outcome summary to omit audit and actor/internal ids
  - ran `node --test test/school-academic-profile.test.js`
  - result: 11 passing
  - ran `node --test test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-academic-profile.test.js`
  - result: 79 passing
- 2026-05-01 internal university academic profile provider:
  - added read-only internal `buildUniversityAcademicProfile`
  - provider reuses `universityAcademicOutcomeService.listStudentAcademicOutcomes` for GPA, credits, finalized attempt status, and repeated-attempt summaries
  - provider returns an empty transcript profile with a warning when no finalized academic outcomes exist
  - provider keeps `semesterId` as a validated-but-not-applied TODO until the outcome service supports a semester-scoped source contract
  - ran `node --test test/university-academic-profile.test.js`
  - result: 9 passing
  - ran `node --test test/university-academic-policy-foundation.test.js test/university-academic-outcome-foundation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js test/university-academic-profile.test.js`
  - result: 54 passing
  - ran `node --test test/school-academic-profile.test.js`
  - result: 11 passing
- 2026-05-01 shared academic profile facade:
  - added shared read-only facade routes:
    - `GET /institutions/:institutionId/students/me/academic-profile`
    - `GET /institutions/:institutionId/students/:studentMembershipId/academic-profile`
  - added `academicProfileService` dispatcher and thin controller
  - route-level admin/staff target guard uses `membership.manage` as the safest current shared student-record permission
  - provider-level guards still enforce school `class.manage` and university `section.manage`
  - added provider self-access mode for the authenticated target student only
  - ran `node --test test/academic-profile.test.js`
  - result: 8 passing
  - ran `node --test test/school-academic-profile.test.js test/university-academic-profile.test.js test/academic-profile.test.js`
  - result: 28 passing
  - ran `node --test test/school-report-card.test.js test/school-final-outcome.test.js test/school-academic-profile.test.js test/academic-profile.test.js`
  - result: 42 passing
  - ran `node --test test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-academic-profile.test.js test/university-academic-policy-foundation.test.js test/university-academic-outcome-foundation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js test/university-academic-profile.test.js test/academic-profile.test.js`
  - result: 141 passing
- 2026-05-04 shared academic profile facade hardening:
  - aligned facade self-access and `institutionAccess()` active membership checks with `Membership` schema default status instead of hardcoded `"active"`
  - verified `accessMode` remains internal (`self` / `staff`) and providers/services reject unsupported values
  - verified school profile self access forwards `accessMode: self` into report-card and final-outcome reads
  - documented that school academic profiles require explicit `academicYearId` until a first-class `AcademicYear` / current-year resolver exists
  - ran `node --test test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/school-report-card.test.js test/school-final-outcome.test.js`
  - result: 58 passing
- 2026-05-04 academic profile excluded/incomplete explanations:
  - added top-level profile `excluded` explanation assertions for school report-card warning/completion data and university outcome-service exclusions
  - added university outcome-service checks for open section, missing finalized assessment result, and invalid credit-hour explanations without counting them in official GPA
  - ran `node --test test/school-academic-profile.test.js`
  - result: 13 passing
  - ran `node --test test/university-academic-profile.test.js`
  - result: 12 passing
  - ran `node --test test/university-academic-outcome-foundation.test.js`
  - result: 9 passing
  - ran `node --test test/academic-profile.test.js`
  - result: 9 passing
  - ran `node --test test/school-report-card.test.js`
  - result: 9 passing
  - ran `node --test test/school-promotion.test.js`
  - result: 10 passing
  - ran `node --test test/self-enrollment-eligibility.test.js`
  - result: 15 passing
  - ran `node --test test/university-academic-policy-foundation.test.js`
  - result: 11 passing
  - attempted `node --test test/university-academic-policy.test.js`, but that file does not exist in this repo
- 2026-05-04 AP5 shared academic profile test hardening:
  - added shared facade route-wiring, unsupported institution type, and missing actor-membership context checks
  - added school academic profile semester-level excluded explanation coverage
  - added university academic profile excluded-explanation dedupe/sanitization and same-institution decoration coverage
  - added university outcome-service explanation coverage for unpublished assessments, invalid published assessment configuration, incomplete published weight totals, missing academic policy, and duplicate explanation dedupe
  - small bug fix: university academic profile provider now deduplicates sanitized `excluded` explanations returned by the outcome source
  - ran `node --test test/academic-profile.test.js`
  - result: 12 passing
  - ran `node --test test/school-academic-profile.test.js`
  - result: 14 passing
  - ran `node --test test/university-academic-profile.test.js`
  - result: 14 passing
  - ran `node --test test/university-academic-outcome-foundation.test.js`
  - result: 14 passing
  - ran `node --test test/school-report-card.test.js`
  - result: 9 passing
  - ran `node --test test/school-final-outcome.test.js`
  - result: 16 passing
  - ran `node --test test/school-promotion.test.js`
  - result: 10 passing
  - ran `node --test test/school-outcome.test.js`
  - result: 13 passing
  - ran `node --test test/university-academic-policy-foundation.test.js`
  - result: 11 passing
  - ran `node --test test/self-enrollment-eligibility.test.js`
  - result: 15 passing
  - ran `node --test test/self-enrollment-browse.test.js`
  - result: 7 passing
  - ran `node --test test/self-enrollment-write.test.js`
  - result: 6 passing
  - ran `node --test test/school-academic-policy.test.js`
  - result: 22 passing
  - ran `node --test test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/university-academic-policy-foundation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 163 passing
- 2026-05-04 academic profile Postman testing artifacts:
  - added `postman/academic-profile.postman_collection.json`
  - added `postman/academic-profile.local.postman_environment.json`
  - added `postman/ACADEMIC_PROFILE_POSTMAN_GUIDE.md`
  - validated collection and environment JSON with Node
- 2026-05-04 U4 university repeated-attempt transcript display:
  - added university academic profile display metadata for repeated `subjectAttempts`
  - decorated `subjectOutcomeSummaries` with best/latest attempt fields and repeat-history booleans without changing official GPA/credit calculations
  - ran `node --test test/university-academic-profile.test.js`
  - result: 15 passing
  - ran `node --test test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/academic-profile.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 69 passing
  - ran `node --test test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/university-academic-policy-foundation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 165 passing
- 2026-05-07 U5B admin-configurable university repeatPolicy:
  - added `InstitutionAcademicPolicy.repeatPolicy` validation/defaults
  - applied repeat policy to university official GPA inclusion, earned-credit counting, prerequisites, self-enrollment same-subject repeat checks, and academic profile attempt display
  - ran `node --test test/university-academic-policy-foundation.test.js test/university-academic-outcome-foundation.test.js test/self-enrollment-eligibility.test.js test/university-academic-profile.test.js`
  - result: 70 passing
  - ran `node --test test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/university-academic-policy-foundation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 180 passing
- 2026-05-08 U6B admin-configurable university academicStandingRules:
  - added live/read-only university academic standing calculation from active academic policy rules and profile summary
  - ran `node --test test/university-academic-standing.test.js test/university-academic-policy-foundation.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js`
  - result: 67 passing
  - ran `node --test test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 196 passing
- 2026-05-10 U6B academicStandingRules edge-case hardening:
  - GPA exactly at the scale max now matches the top configured standing band
  - `section_not_closed` remains an academic-profile explanation but no longer forces `review_required` by itself when finalized GPA exists
  - ran `node --test test/university-academic-standing.test.js test/university-academic-profile.test.js test/university-academic-policy-foundation.test.js test/university-academic-outcome-foundation.test.js test/self-enrollment-eligibility.test.js`
  - result: 89 passing
  - ran `node --test test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 199 passing
- 2026-05-10 U6B academicStandingRules focused testing expansion:
  - added unit coverage for null GPA, GPA boundary buckets, disabled rules, review-required exclusions, top-band GPA 4.0, custom thresholds, and standing-rule validation failures
  - added policy validation coverage for create defaults/custom rules, partial PATCH payloads, band replacement, and invalid PATCH rules returning 400-style errors
  - added university profile coverage for default standing ranges, disabled standing output, custom active-policy threshold changes, repeatPolicy official GPA feeding standing, and full `academicStanding` response shape
  - added regressions confirming school academic profiles do not expose university-only `academicStanding`/`repeatPolicy`, and self-enrollment does not enforce `academicStandingRules.allowedToContinue`
  - ran `node --test test/university-academic-standing.test.js test/university-academic-policy-foundation.test.js test/university-academic-profile.test.js test/self-enrollment-eligibility.test.js test/school-academic-profile.test.js`
  - result: 97 passing
  - ran `node --test test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 213 passing
- 2026-05-10 U6C university academic standing list/summary APIs:
  - added live read-only university standing dashboard coverage for summary counts, compact list rows, standing/GPA/search/semester/department filters, pagination, tenant isolation, non-university rejection, unauthorized student blocking, custom threshold behavior, and instructor-assigned-section scoping/deduping
  - ran `node --test test/university-academic-standing-report.test.js`
  - result: 11 passing
  - ran `node --test test/university-academic-standing-report.test.js test/university-academic-standing.test.js test/university-academic-profile.test.js test/university-academic-policy-foundation.test.js test/self-enrollment-eligibility.test.js`
  - result: 93 passing
  - ran `node --test test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 224 passing
- 2026-05-12 U6C standing dashboard enrollment/performance hardening:
  - standing dashboard semester, department, and instructor scope helpers now include only `Enrollment.status = enrolled` rows and exclude `dropped` rows from candidate scoping
  - standing dashboard row building now uses bounded local concurrency for live per-student outcome reads
  - added focused tests for dropped-enrollment exclusion, enrolled-row inclusion, instructor scoping, standing filter/pagination preservation, and bounded concurrency
  - ran `node --test test/university-academic-standing-report.test.js`
  - result: 14 passing
  - ran `node --test test/university-academic-standing-report.test.js test/university-academic-standing.test.js test/university-academic-profile.test.js test/university-academic-policy-foundation.test.js test/self-enrollment-eligibility.test.js test/school-academic-profile.test.js`
  - result: 111 passing
  - ran `node --test test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 227 passing
- 2026-05-13 U6B/U6C real standing calculation verification:
  - added `test/university-academic-standing-calculation.test.js` with finalized university fixtures built from `Enrollment`, `Section`, `Subject`, `Assessment`, `AssessmentResult`, `Semester`, and `InstitutionAcademicPolicy` model rows
  - verified real academic profile standing results for `good_standing`, `academic_warning`, `probation`, and `suspension`
  - verified custom `academicStandingRules` thresholds, including GPA `1.1` returning `suspension` when suspension is configured below `1.2`
  - verified admin standing dashboard summary/list counts, `standing=suspension`, `minGpa/maxGpa`, and pagination using real outcome calculations
  - verified instructor standing dashboard scope includes only students in assigned enrolled sections
  - verified `no_standing_yet`, `review_required` from a missing result alongside finalized GPA, and one repeatPolicy interaction where standing uses official GPA after best-attempt repeat calculation
  - ran `node --test test/university-academic-standing-calculation.test.js`
  - result: 7 passing
  - ran `node --test test/university-academic-standing-calculation.test.js test/university-academic-standing-report.test.js test/university-academic-standing.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/university-academic-policy-foundation.test.js test/self-enrollment-eligibility.test.js`
  - result: 124 passing
  - ran `node --test test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/university-academic-standing-calculation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 234 passing
- 2026-05-15 S1 school promotion dashboard APIs:
  - added read-only school promotion dashboard tests for admin/staff summary/list counts, compact rows, pagination, final-outcome precedence, live calculation fallback, incomplete/no-final buckets, filters, tenant isolation, non-school rejection, unauthorized access, and route wiring
  - added instructor-scoped dashboard coverage using `Section.instructorMemberId` plus active `Enrollment.status = enrolled` rows with student deduping
  - ran `node --test test/school-promotion-dashboard.test.js`
  - result: 10 passing
  - ran `node --test test/school-promotion-dashboard.test.js test/school-report-card.test.js test/school-final-outcome.test.js`
  - result: 35 passing
  - ran `node --test test/university-academic-standing-report.test.js`
  - result: 14 passing
  - ran `node --test test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-promotion-dashboard.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/university-academic-standing-calculation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 244 passing
- 2026-05-16 S1 school promotion dashboard instructor-boundary hardening:
  - fixed incomplete admin live dashboard rows so `allowedToPromote=false` whenever the displayed decision is `incomplete`
  - added service-level active actor membership defense for school promotion dashboard access
  - normalized dashboard warnings from final outcomes, missing-context rows, live promotion calculations, and instructor section rows to safe `{ code, message, ...safe ids }` objects
  - changed instructor dashboard behavior to section-owned outcome rows only; instructor routes no longer expose full yearly promotion decisions, final outcomes, yearly averages, or failed-subject summaries for a student
  - instructor section rows are scoped through `Section.instructorMemberId` and active `Enrollment.status = enrolled`
  - instructor list response now uses `sectionOutcomes`; promotion-only `decision` and `finalized` filters are rejected on instructor routes
  - instructor section calculation now accepts numeric string scores and normalizes missing policy, missing published assessment, invalid assessment configuration, and missing score warnings
  - added transfer coverage: different-semester class assignments can resolve through the latest active assignment, while ambiguous same-semester active assignments return a normalized warning row
  - ran `node --test test/school-promotion-dashboard.test.js`
  - result: 15 passing
  - ran `node --test test/school-promotion-dashboard.test.js test/school-report-card.test.js test/school-final-outcome.test.js`
  - result: 40 passing
  - ran `node --test test/university-academic-standing-report.test.js`
  - result: 14 passing
  - ran `node --test test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-promotion-dashboard.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/university-academic-standing-calculation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 249 passing
- 2026-05-16 school promotion dashboard route testing support:
  - added `postman/school-promotion-dashboard.postman_collection.json`
  - added `postman/school-promotion-dashboard.postman_environment.json`
  - collection covers the four dashboard routes:
    - `GET /institutions/:institutionId/school-outcomes/academic-years/:academicYearId/promotion-dashboard/summary`
    - `GET /institutions/:institutionId/school-outcomes/academic-years/:academicYearId/promotion-dashboard/students`
    - `GET /institutions/:institutionId/instructors/me/school-outcomes/academic-years/:academicYearId/promotion-dashboard/summary`
    - `GET /institutions/:institutionId/instructors/me/school-outcomes/academic-years/:academicYearId/promotion-dashboard/students`
  - expanded `test/school-promotion-dashboard.test.js` with controller/route-envelope coverage for the four handlers, admin yearly promotion fields, instructor `sectionOutcomes`, instructor negative `decision` / `finalized` errors, and instructor `hasMissingResults` filtering
  - run focused check with `node --test test/school-promotion-dashboard.test.js`
  - result: 17 passing
  - validate Postman JSON with `node -e "JSON.parse(require('fs').readFileSync('postman/school-promotion-dashboard.postman_collection.json','utf8')); JSON.parse(require('fs').readFileSync('postman/school-promotion-dashboard.postman_environment.json','utf8'));"`
  - result: Postman JSON parsed successfully
  - ran `node --test test/school-promotion-dashboard.test.js test/school-report-card.test.js test/school-final-outcome.test.js`
  - result: 42 passing
- 2026-05-17 AcademicYear first-class module:
  - added `test/academic-year.test.js` for AcademicYear model/service/controller/routes, Semester `academicYearId` linking, and SchoolAcademicPolicy academic-year/semester validation
  - updated `test/school-academic-policy.test.js` mocks for real AcademicYear validation
  - updated school promotion dashboard Postman artifacts with AcademicYear create/list/active/get/update/archive requests and `activeAcademicYearId`
  - ran `node --test test/academic-year.test.js test/school-academic-policy.test.js`
  - result: 37 passing
  - ran `node --test test/academic-year.test.js test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-promotion-dashboard.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/university-academic-standing-calculation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 267 passing
  - after tightening the AcademicYear status index shape and adding update-path policy validation coverage, reran `node --test test/academic-year.test.js`
  - result: 16 passing
  - validated Postman JSON with `node -e "JSON.parse(require('fs').readFileSync('postman/school-promotion-dashboard.postman_collection.json','utf8')); JSON.parse(require('fs').readFileSync('postman/school-promotion-dashboard.postman_environment.json','utf8'));"`
  - result: Postman JSON parsed successfully
- 2026-05-22 AcademicYear integration hardening:
  - normalized optional Semester `academicYearId` input before storing or validating it
  - hardened SchoolAcademicPolicy semester weight reference validation for array shape, duplicate ids, tenant-scoped lookup counts, and normalized academic-year comparisons
  - added focused tests for trimmed Semester `academicYearId`, omitted/null Semester links, archived school policy AcademicYear rejection, missing weighted semester references, and missing `semesterWeights.semesterId`
  - TODO/verify: strict Semester date containment inside AcademicYear date ranges remains deferred for backward compatibility
  - ran `node --test test/academic-year.test.js test/school-academic-policy.test.js`
  - result: 41 passing
  - ran `node --test test/academic-year.test.js test/school-academic-policy.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-promotion-dashboard.test.js`
  - result: 83 passing
- 2026-05-22 AcademicYear Postman testing support:
  - added `postman/academic-year.postman_collection.json`
  - added `postman/academic-year.postman_environment.json`
  - collection covers login/context, create/list/active/get/update/archive AcademicYear flows, optional Semester and SchoolAcademicPolicy reference checks, and focused failure cases
  - generated local-only `postman/academic-year.local.postman_environment.json` from the local/dev DB with non-secret ObjectIds where available
  - added `postman/academic-year.local.postman_environment.json` to `.gitignore`
  - no reusable DB-fill helper script was committed
  - validated Postman JSON with `node -e "const fs=require('fs'); const files=['postman/academic-year.postman_collection.json','postman/academic-year.postman_environment.json']; for (const file of files) { JSON.parse(fs.readFileSync(file,'utf8')); console.log(file+' OK'); }"`
  - result: Postman JSON parsed successfully
  - validated collection variables against the environment template
  - result: no missing variables
- 2026-05-23 Homework / Project section module:
  - added shared `Homework` and `HomeworkSubmission` models
  - added section-linked homework/project service, controller, routes, private PDF upload middleware, and protected download flow
  - homework can optionally link to a same-section non-archived `Assessment`; `AssessmentResult` remains unchanged for scores/results
  - offline mode supports instructor/manual tracking for paper or in-class school submissions
  - online_upload mode supports student PDF uploads into private `storage/homework-submissions`
  - roster joins active enrollments with submissions so missing students appear without persisted missing rows
  - added focused tests in `test/homework.test.js`
  - added Postman testing artifacts:
    - `postman/homework.postman_collection.json`
    - `postman/homework.postman_environment.json`
  - validated Postman JSON with `node -e "const fs=require('fs'); for (const file of ['postman/homework.postman_collection.json','postman/homework.postman_environment.json']) { JSON.parse(fs.readFileSync(file,'utf8')); console.log(file+' OK'); }"`
  - result: Postman JSON parsed successfully
  - ran `node --test test/homework.test.js test/academic-year.test.js`
  - result: 31 passing
  - ran `node --test test/homework.test.js test/academic-year.test.js test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-promotion-dashboard.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/university-academic-standing-calculation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 283 passing
- 2026-05-29 Homework upload/manual-marking hardening:
  - student online uploads now keep `markedByUserId=null`, clear old instructor feedback on resubmission, and remove the replaced private file after a successful update
  - manual marking now rejects dropped/inactive enrollments and only runs for `submissionMode=offline`
  - homework `submissionMode` changes are blocked after tenant/section-scoped submissions exist
  - staff `status=missing` submission updates clear submitted/file metadata and remove the old private file
  - upload controller cleanup on service errors remains covered by controller tests
  - private downloads now have focused tests for unsafe `fileKey` path traversal and missing files
  - validated Homework Postman JSON with `node -e "const fs=require('fs'); for (const file of ['postman/homework.postman_collection.json','postman/homework.postman_environment.json']) { JSON.parse(fs.readFileSync(file,'utf8')); console.log(file+' OK'); }"`
  - result: Postman JSON parsed successfully
  - ran `node --test test/homework.test.js`
  - result: 20 passing
  - ran `node --test test/homework.test.js test/academic-year.test.js test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-promotion-dashboard.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/university-academic-standing-calculation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 290 passing
- 2026-05-29 Homework upload middleware/controller hardening:
  - verified homework uploads store under private `storage/homework-submissions`, generate safe disk filenames, and keep `submissionFile` as the multipart field
  - verified `storage/` and `homework-submissions/` are not exposed through `express.static`; only public `/uploads` remains static
  - added service validation rejecting empty or malformed uploaded file sizes with `400`
  - tightened controller cleanup so saved files are deleted only when they resolve inside private homework storage; cleanup failures do not hide the original service error
  - kept PDF-only middleware behavior: `.pdf`, `application/pdf`, and default 10MB size limit
  - verified download controller delegates path resolution and permission checks to `homeworkService.getHomeworkSubmissionFileAccess`
  - TODO/verify: current PDF validation uses MIME type and extension only; add magic-byte sniffing later if stricter validation becomes a requirement
  - ran `node --check src/controllers/homeworkController.js`
  - result: passed
  - ran `node --check src/services/homeworkService.js`
  - result: passed
  - ran `node --check test/homework.test.js`
  - result: passed
  - ran `node --test test/homework.test.js`
  - result: 23 passing
  - ran `node --test test/homework.test.js test/academic-year.test.js test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-promotion-dashboard.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/university-academic-standing-calculation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 293 passing
- 2026-05-29 Homework service/model placement verification:
  - verified the `HomeworkSubmission` model allows `online_upload + missing` without file metadata, still requires metadata for submitted online uploads, and clears file metadata for offline rows
  - verified staff missing-status updates delete the old private file only after the database update succeeds
  - reran syntax checks for homework service, controller, and tests
  - ran `node --check src/services/homeworkService.js`
  - result: passed
  - ran `node --check src/controllers/homeworkController.js`
  - result: passed
  - ran `node --check test/homework.test.js`
  - result: passed
  - ran `node --test test/homework.test.js`
  - result: 24 passing
  - ran `node --test test/homework.test.js test/academic-year.test.js test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-promotion-dashboard.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/university-academic-standing-calculation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 294 passing
- 2026-05-30 Homework assigned email notifications:
  - added best-effort student assignment emails for homework/project created as `assigned` and successful `draft -> assigned` status transitions
  - verified notification prep and sends happen only after successful homework database writes
  - verified draft, closed, archived, failed create, invalid/same-status transitions, and non-assignment status changes do not send assignment emails
  - verified recipients are filtered to active enrolled section students with active same-institution student memberships and usable deduplicated email addresses
  - verified email failures are logged and do not fail or roll back homework creation/status assignment
  - verified email payloads include title/type/section/dueAt/submissionMode/login instruction and do not include private file keys or private storage paths
  - ran `node --check src/services/emailService.js`
  - result: passed
  - ran `node --check src/services/homeworkService.js`
  - result: passed
  - ran `node --check test/homework.test.js`
  - result: passed
  - ran `node --test test/homework.test.js`
  - result: 28 passing
  - ran `node --test test/homework.test.js test/academic-year.test.js test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-promotion-dashboard.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/university-academic-standing-calculation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 298 passing
- 2026-05-30 Section Materials module:
  - added `SectionMaterial` model, private `storage/section-materials` PDF upload middleware, service, controller, and route wiring
  - verified materials stay separate from Homework/HomeworkSubmission and do not use homework submission/deadline/late/missing logic
  - verified upload field `materialFile`, generated private filenames, PDF extension/MIME checks, default 10MB limit, empty-file service rejection, and static privacy
  - verified staff create/list/get/update/status/download access through section-derived authorization
  - verified student list/download visibility requires active enrollment and `published` status
  - verified status transitions `draft -> published`, `draft -> archived`, `published -> archived`, and archived restore rejection
  - verified replacing files deletes the old private file only after successful DB update, while controller cleanup removes newly uploaded files after service rejection
  - verified unsafe `fileKey`, missing private file, route wiring, and download delegation behavior
  - ran `node --check src/models/SectionMaterial.js`
  - result: passed
  - ran `node --check src/middleware/uploadSectionMaterial.js`
  - result: passed
  - ran `node --check src/services/sectionMaterialService.js`
  - result: passed
  - ran `node --check src/controllers/sectionMaterialController.js`
  - result: passed
  - ran `node --check src/routes/institutionRoutes.js`
  - result: passed
  - ran `node --check test/section-material.test.js`
  - result: passed
  - ran `node --test test/section-material.test.js`
  - result: 15 passing
  - ran `node --test test/section-material.test.js test/homework.test.js`
  - result: 43 passing
  - ran `node --test test/section-material.test.js test/homework.test.js test/academic-year.test.js test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-promotion-dashboard.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/university-academic-standing-calculation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 313 passing
- 2026-05-31 Section Materials upload/download hardening:
  - added service-level PDF validation for SectionMaterial uploads so bypassing multer still rejects missing files, empty/invalid size, non-`application/pdf` MIME, non-`.pdf` original filenames, and unsafe generated file keys
  - verified controller cleanup deletes newly uploaded private files on create/update service errors, ignores cleanup unlink failures, and skips unsafe cleanup paths without hiding the original service error
  - verified download controller continues to delegate access/path resolution to `sectionMaterialService.getSectionMaterialFileAccess`
  - verified strict tenant/section scoped SectionMaterial queries for get, update, status update, download access, staff list, and student list
  - kept student response shape unchanged, including `uploadedByUserId`, to avoid a breaking change after initial module docs/tests
  - ran `node --check src/services/sectionMaterialService.js`
  - result: passed
  - ran `node --check test/section-material.test.js`
  - result: passed
  - ran `node --test test/section-material.test.js`
  - result: 17 passing
  - ran `node --test test/section-material.test.js test/homework.test.js`
  - result: 45 passing
  - ran `node --test test/section-material.test.js test/homework.test.js test/academic-year.test.js test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-promotion-dashboard.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/university-academic-standing-calculation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 315 passing
- 2026-05-31 Section Materials Postman collection:
  - added focused SectionMaterial Postman collection plus template/local environments
  - local environment mirrors the homework local IDs and uses `postman/homework-sample.pdf` as `materialPdfPath`
  - ran `node -e "JSON.parse(require('fs').readFileSync('postman/section-material.postman_collection.json','utf8')); JSON.parse(require('fs').readFileSync('postman/section-material.local.postman_environment.json','utf8')); JSON.parse(require('fs').readFileSync('postman/section-material.postman_environment.json','utf8')); console.log('section material postman JSON valid')"`
  - result: passed
- 2026-05-31 Attendance analytics institution policy risk:
  - applied existing `Institution.policies` attendance fields to section attendance analytics response only
  - added `attendancePolicySummary` to analytics and `attendanceRisk` to per-student rows
  - verified safe defaults, invalid/missing `lateToAbsenceRatio`, excused-count behavior, late-to-absence conversion, warning/drop-risk thresholds, and threshold `0` disable behavior
  - verified instructor access remains scoped, other instructors are blocked, tenant isolation is preserved, and analytics does not update `Enrollment.status` or modify `Subject`
  - notification/escalation was deferred; existing email helpers are event-specific and do not provide a safe duplicate-aware drop-risk workflow
  - ran `node --check src/services/attendanceService.js`
  - result: passed
  - ran `node --check test/attendance.test.js`
  - result: passed
  - ran `node --test test/attendance.test.js`
  - result: 5 passing
  - ran `node --test test/attendance.test.js test/section-material.test.js test/homework.test.js test/academic-year.test.js test/academic-profile.test.js test/school-academic-profile.test.js test/university-academic-profile.test.js test/university-academic-outcome-foundation.test.js test/school-academic-policy.test.js test/school-outcome.test.js test/school-promotion.test.js test/school-report-card.test.js test/school-final-outcome.test.js test/school-promotion-dashboard.test.js test/university-academic-policy-foundation.test.js test/university-academic-standing.test.js test/university-academic-standing-report.test.js test/university-academic-standing-calculation.test.js test/self-enrollment-eligibility.test.js test/self-enrollment-browse.test.js test/self-enrollment-write.test.js`
  - result: 320 passing
- 2026-05-31 Attendance Postman collection:
  - added `postman/attendance.postman_collection.json`
  - added safe template env `postman/attendance.postman_environment.json`
  - added ignored local env `postman/attendance.local.postman_environment.json` filled with the same local university IDs used by Homework Postman testing
  - collection covers auth, section session setup, open/QR/manual/roster/close attendance, student QR/history, analytics, and institution attendance policy updates
  - ran `node -e "const fs=require('fs'); for (const f of ['postman/attendance.postman_collection.json','postman/attendance.postman_environment.json','postman/attendance.local.postman_environment.json']) { JSON.parse(fs.readFileSync(f,'utf8')); console.log(f + ' OK'); }"`
  - result: passed
- 2026-05-31 Section session instructor setup permission:
  - changed section session list/create/generate/get/update routes to rely on service-level section-session authorization instead of broad `section.manage`
  - assigned section instructors can set up their own section sessions; unrelated instructors remain blocked
  - ran `node --check src/services/sectionSessionService.js`
  - result: passed
  - ran `node --check src/controllers/sectionSessionController.js`
  - result: passed
  - ran `node --check src/routes/institutionRoutes.js`
  - result: passed
  - ran `node --check test/section-session-permission.test.js`
  - result: passed
  - ran `node --test test/section-session-permission.test.js test/attendance.test.js test/section-material.test.js`
  - result: 24 passing
- 2026-05-31 Attendance local QR date override:
  - added non-production `ATTENDANCE_QR_DATE_OVERRIDE=YYYY-MM-DD` support for local QR testing against an existing teaching-day session
  - production ignores the override
  - invalid override values fall back to the real server date
  - set local ignored `.env` to `ATTENDANCE_QR_DATE_OVERRIDE=2026-06-07` for the current Postman test session
  - ran `node --check src/services/attendanceService.js`
  - result: passed
  - ran `node --check test/attendance.test.js`
  - result: passed
  - ran `node --test test/attendance.test.js`
  - result: 6 passing
- 2026-06-05 Stripe Billing Phase 1:
  - added Stripe Billing support for institution subscriptions using Checkout Sessions and webhooks
  - added `InstitutionBillingProfile` and `StripeWebhookEvent`
  - added owner/admin checkout session route, billing status route, and raw-body `/stripe/webhook`
  - installed the official `stripe` npm package; no other production dependency was added
  - local Stripe test env vars:
    - `STRIPE_SECRET_KEY=sk_test_...`
    - `STRIPE_PRICE_BASIC_MONTHLY=price_1TetMH3lPsyty9Ic5cBRcXvJ`
    - `STRIPE_WEBHOOK_SECRET=whsec_...`
    - `BILLING_SUCCESS_URL=http://localhost:3000/billing/success?session_id={CHECKOUT_SESSION_ID}`
    - `BILLING_CANCEL_URL=http://localhost:3000/billing/cancel`
  - local manual flow:
    - start the API
    - run Stripe CLI forwarding with `stripe listen --forward-to localhost:5000/stripe/webhook`
    - copy the CLI webhook secret into `STRIPE_WEBHOOK_SECRET`
    - log in as institution owner/admin
    - call `POST /institutions/:institutionId/billing/checkout-session`
    - open the returned `checkoutSession.url`
    - complete checkout with Stripe test card data
    - call `GET /institutions/:institutionId/billing/status` after webhooks arrive
  - automated tests mock Stripe API calls and do not contact Stripe
  - ran `npm install stripe --save`
  - note: npm reported existing engine warnings for MongoDB/Mongoose packages under Node `v20.15.1` and existing audit findings; no `npm audit fix` was run
  - ran `node --check src/models/InstitutionBillingProfile.js`
  - result: passed
  - ran `node --check src/models/StripeWebhookEvent.js`
  - result: passed
  - ran `node --check src/services/billingService.js`
  - result: passed
  - ran `node --check src/controllers/billingController.js`
  - result: passed
  - ran `node --check src/controllers/stripeWebhookController.js`
  - result: passed
  - ran `node --check src/app.js`
  - result: passed
  - ran `node --check src/routes/institutionRoutes.js`
  - result: passed
  - ran `node --check test/billing.test.js`
  - result: passed
  - ran `node --test test/billing.test.js`
  - result: 9 passing
  - ran `node --test test/billing.test.js test/section-material.test.js test/attendance.test.js`
  - result: 32 passing
- 2026-06-05 Stripe Billing webhook hardening:
  - kept `/stripe/webhook` before `express.json()` with raw body parsing and no auth middleware
  - added webhook event status tracking: `processing`, `processed`, `failed`
  - duplicate processed/in-flight events return success without reprocessing
  - failed webhook events store `errorMessage` and can be retried
  - added partial unique indexes for `stripeCustomerId` and `stripeSubscriptionId`
  - added subscription/customer id fallback when subscription metadata does not include `institutionId`
  - ran `node --check src/models/InstitutionBillingProfile.js`
  - result: passed
  - ran `node --check src/models/StripeWebhookEvent.js`
  - result: passed
  - ran `node --check src/services/billingService.js`
  - result: passed
  - ran `node --check test/billing.test.js`
  - result: passed
  - ran `node --test test/billing.test.js`
  - result: 12 passing
  - ran `node --test test/billing.test.js test/section-material.test.js test/attendance.test.js`
  - result: 35 passing
- 2026-06-06 Stripe Billing service hardening:
  - added stale webhook `processing` recovery after 10 minutes while keeping fresh in-flight events as duplicates
  - added duplicate Checkout Session prevention when an institution already has `active`, `trialing`, or `past_due` status with a Stripe subscription id
  - added Stripe Customer creation idempotency key `customer:create:<institutionId>`
  - verified canceled profiles and profiles without active subscriptions can still create Checkout Sessions
  - verified existing Stripe Customer ids are reused without calling `stripe.customers.create`
  - ran `node --check src/services/billingService.js`
  - result: passed
  - ran `node --check src/models/StripeWebhookEvent.js`
  - result: passed
  - ran `node --check test/billing.test.js`
  - result: passed
  - ran `node --test test/billing.test.js`
  - result: 18 passing
  - ran `node --test test/billing.test.js test/section-material.test.js test/attendance.test.js`
  - result: 41 passing
- 2026-06-05 Section list instructor read scope:
  - changed generic `GET /institutions/:institutionId/sections` to use `section.read` while enforcing service-level role-aware list scope
  - verified admin/manage access keeps broad institution section listing and existing filters
  - verified instructor access derives `instructorMemberId` from authenticated membership and cannot see another instructor's or another tenant's sections
  - verified students remain blocked from the generic staff/admin section list
  - ran `node --check src/auth/permissions.js`
  - result: passed
  - ran `node --check src/middleware/authorize.js`
  - result: passed
  - ran `node --check src/controllers/sectionController.js`
  - result: passed
  - ran `node --check src/services/sectionService.js`
  - result: passed
  - ran `node --check src/routes/institutionRoutes.js`
  - result: passed
  - ran `node --check test/section-list-permission.test.js`
  - result: passed
  - ran `node --test test/section-list-permission.test.js`
  - result: 7 passing
  - ran `node --test test/section-list-permission.test.js test/section-session-permission.test.js test/attendance.test.js test/section-material.test.js test/homework.test.js test/academic-profile.test.js test/billing.test.js test/school-promotion-dashboard.test.js`
  - result: 101 passing
- 2026-06-07 Base-role and scoped-responsibility authorization hardening:
  - added shared responsibility helpers that compute effective responsibility permissions from the backend catalog and ignore raw stored permission strings for authorization
  - verified arbitrary stored dangerous permissions such as `billing.manage`, `institution.manage`, and `membership.manage` do not grant scoped access
  - extended section list/detail service scoping for owner/admin, assigned instructors, and active coordinator responsibility scopes
  - verified client filters narrow but do not broaden scoped section access
  - verified cross-tenant, inactive, and expired responsibility assignments do not grant section list access
  - verified mentor responsibility does not grant generic staff section management scope
  - verified non-owner students remain blocked from generic staff section list/detail routes even with a coordinator responsibility row
  - verified section detail uses a scoped query and scoped readers do not receive `createdByUserId`
  - verified `ResponsibilityAssignment` authority is keyed by `institutionId + userId`, not `membershipId`
  - verified invalid `startAt` / `endAt` values do not behave like active responsibility windows
  - ran `node --check src/auth/scopedResponsibilities.js`
  - result: passed
  - ran `node --check src/middleware/authorize.js`
  - result: passed
  - ran `node --check src/services/sectionService.js`
  - result: passed
  - ran `node --check src/services/sectionSessionService.js`
  - result: passed
  - ran `node --check test/section-list-permission.test.js`
  - result: passed
  - ran `node --check test/authorization-permission.test.js`
  - result: passed
  - ran `node --test test/authorization-permission.test.js test/section-list-permission.test.js`
  - result: 27 passing
  - ran `node --test test/authorization-permission.test.js test/section-list-permission.test.js test/section-session-permission.test.js test/attendance.test.js test/section-material.test.js test/homework.test.js`
  - result: 80 passing
- 2026-06-09 Scoped responsibility catalog hardening:
  - replaced old active responsibility permissions with the currently enforced scoped catalog:
    - head: no active effective permissions until academic/report oversight service enforcement is implemented
    - coordinator: `section.read_scope`, `sectionSession.read_scope`, `sectionSession.manage_scope`, `attendance.read_scope`, `attendance.manage_scope`
    - mentor: no active effective permissions until mentor/student-focused service enforcement is implemented
  - added backend-defined allowed scope combinations for head, coordinator, and mentor
  - added model/helper protection so invalid responsibility/scope combinations are rejected on validation and ignored during effective authorization resolution
  - changed section list/detail responsibility access to use `section.read_scope` instead of a write-style section permission
  - changed section-session and attendance derived coordinator checks to use backend-computed scoped permissions while deriving section, class, department, and class-level scope from trusted DB records
  - made head non-operational for generic section, section-session, attendance, assessment, homework, and material staff paths because no dedicated academic/report oversight service is active yet
  - verified future/unwired permissions such as `academicDecision.review_scope`, `enrollment.review_scope`, `studentDropRisk.review_scope`, `academicProfile.read_scope`, `studentProfile.read_scope`, and `attendance.excuse_manage_scope` are not active
  - no responsibility create/update routes exist yet, so request-body `permissions` rejection is not applicable until scoped responsibility routes are added
  - ran `node --check src/auth/permissions.js`
  - result: passed
  - ran `node --check src/auth/scopedResponsibilities.js`
  - result: passed
  - ran `node --check src/models/ResponsibilityAssignment.js`
  - result: passed
  - ran `node --check src/services/sectionService.js`
  - result: passed
  - ran `node --check src/services/sectionSessionService.js`
  - result: passed
  - ran `node --check src/services/attendanceService.js`
  - result: passed
  - ran `node --check test/homework.test.js`
  - result: passed
  - ran `node --check test/section-material.test.js`
  - result: passed
  - ran `node --check test/attendance.test.js`
  - result: passed
  - ran `node --test test/authorization-permission.test.js test/section-list-permission.test.js test/section-session-permission.test.js test/attendance.test.js`
  - result: 43 passing
  - ran `node --test test/authorization-permission.test.js test/section-list-permission.test.js test/section-session-permission.test.js test/attendance.test.js test/section-material.test.js test/homework.test.js`
  - result: 88 passing
- TODO:
  - add real sample responses when helpful
  - add attendance response examples after first manual Postman pass
