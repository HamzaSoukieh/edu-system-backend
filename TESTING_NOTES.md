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

## Space For Session Notes
- TODO:
  - add real sample responses when helpful
  - add enrollment test notes after module starts
