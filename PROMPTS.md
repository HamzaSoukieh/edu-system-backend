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
- Follow the existing architecture: routes -> middleware -> controller -> service -> model
- Keep tenant scoping by institutionId
- Keep explanations concise and practical
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
- do not redesign unrelated parts
- preserve tenant scoping and current response style

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
- do not introduce abstractions unless necessary
- do not redesign unrelated files
- preserve current behavior except for the requested change

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

Current module:
[PASTE CURRENT MODULE HERE]

Task:
[PASTE TASK HERE]
```

## Session Close-Out Prompt
```text
Before we end this session, update:
- `DECISIONS.md` if a real design decision changed
- `API_PROGRESS.md` with current module status
- `TESTING_NOTES.md` if testing steps changed

Then give me:
- changed files
- what is done
- what is next
- any TODO/verify notes
```
