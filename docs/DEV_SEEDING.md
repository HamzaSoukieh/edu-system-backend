# Local Dev Seeding

This repo includes a local-only seed script for realistic frontend testing through the backend API.

The seed script does not create a frontend database. The frontend must call backend API endpoints and must never connect directly to MongoDB.

## Run With Docker

```bash
docker compose exec backend npm run seed:dev
```

Reset only the demo records created by this script, then seed again:

```bash
docker compose exec backend npm run seed:dev:reset
```

## Run Locally

```bash
npm run seed:dev
```

The script uses `MONGO_URI`, matching the backend server connection config.

It refuses to run when `NODE_ENV=production`. With `--reset`, it also refuses database names that do not look local/dev/test/demo. The Docker example database name `edu-system` is allowed as a local development name.

## Demo Accounts

All demo accounts use:

```text
Password123!
```

Accounts:

```text
owner@example.test
admin@example.test
instructor@example.test
coordinator@example.test
head@example.test
mentor@example.test
student1@example.test
student2@example.test
student3@example.test
```

Base roles:

- `owner@example.test`: admin membership and institution owner
- `admin@example.test`: admin membership
- `instructor@example.test`: instructor membership and assigned section instructor
- `coordinator@example.test`: instructor membership plus scoped coordinator responsibility
- `head@example.test`: instructor membership plus scoped head responsibility
- `mentor@example.test`: instructor membership plus scoped mentor responsibility
- `student1@example.test`, `student2@example.test`, `student3@example.test`: student memberships

## Data Created

The script creates one `Demo University` tenant with:

- Attendance policy thresholds on `Institution.policies`
- Verified demo auth users with bcrypt password hashes
- Active memberships and member profiles
- Academic year and active semester
- Two departments
- Two university subjects
- Two active sections
- Active enrollments for three demo students
- Closed section sessions and attendance records:
  - `student1`: good attendance
  - `student2`: warning-level absences
  - `student3`: high/drop-risk absences
- Published assessments and assessment results:
  - strong student
  - warning-average student
  - failing/missing-risk student
- Assigned offline and online-upload homework records
- Homework submissions covering `submitted`, `late`, `missing`, and `returned`
- Section material metadata for `published`, `draft`, and `archived`
- Scoped responsibility assignments for Head, Coordinator, and Mentor
- A local fake billing profile with obviously fake Stripe IDs
- A university academic policy for local academic standing/self-enrollment reads

No real Stripe calls, Gmail calls, JWT creation, real secrets, or real user data are used.

## Frontend Usage

Frontend should call the backend API only.

Example frontend `.env`:

```text
VITE_API_BASE_URL=http://localhost:5000
```

After seeding, the script writes:

```text
scripts/seed-output/frontend-demo-data.json
```

That file contains safe IDs and emails for local frontend setup. It does not contain password hashes, JWTs, real secrets, or private storage paths.

Do not put MongoDB credentials in frontend code or frontend environment files.
