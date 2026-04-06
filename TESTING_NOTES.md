# Testing Notes

## General Testing Approach
- There is currently no automated test script in `package.json`.
- For now, testing is mainly manual through Postman or similar API clients.
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
  - derived university department head
  - derived school class-level coordinator
  - derived school class-level head
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
  - allow correction after attendance is `closed` for authorized instructor/admin/derived coordinator/head access
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
    - the same safely-derived university department coordinator/head path already used for section session status changes
    - the same safely-derived school class-level coordinator/head path already used for section session status changes
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
  - derived university department coordinator/head for the parent subject department only
  - derived school class-level coordinator/head for the parent section class level only
  - reject unrelated coordinators/heads from other departments or class levels
  - reject students on staff routes
- Assessment notification delivery should:
  - notify only active enrolled students in the same institution and section
  - not notify dropped or non-enrolled students
  - not notify students from another institution
  - not expose raw scores in result-published emails
  - not weaken tenant scoping or authorization if email delivery fails
  - keep status changes successful even when best-effort email delivery logs failures

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
- TODO:
  - add real sample responses when helpful
  - add attendance response examples after first manual Postman pass
