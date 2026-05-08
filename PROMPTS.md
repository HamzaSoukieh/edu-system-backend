# Prompts

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
