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

## Common Things To Verify
- Invalid ObjectId returns clean `400`
- Missing tenant ownership returns `404` or access denial as expected
- Duplicate keys return `409`
- Update endpoints reject empty payloads
- List endpoints keep response shape stable
- Detail endpoints return fuller resource shape

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
- Enrollment should fail when:
  - section is `closed` or `cancelled`
  - student membership is missing
  - student membership is not `active`
  - member role is not `student`
  - section capacity is already full
- Re-enrollment should happen through enrollment status update, not by creating a second enrollment record
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
  - derived department coordinator
  - derived department head
- Session cancellation email should target only:
  - `Enrollment.status = enrolled`
  - `Membership.status = active`
  - users with a valid email

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
    - the same safely-derived department coordinator/head path already used for section session status changes
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

### Create Enrollment
```json
{
  "studentMemberId": "MEMBERSHIP_ID"
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

## Space For Session Notes
- TODO:
  - add real sample responses when helpful
  - add attendance response examples after first manual Postman pass
