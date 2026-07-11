// Shared assessment enums (DB-5). Single source of truth imported by the
// Assessment model and assessmentService so the enum definitions can never drift.
const ASSESSMENT_STATUSES = Object.freeze(["draft", "announced", "published", "archived"]);
const ASSESSMENT_TYPES = Object.freeze([
    "quiz",
    "assignment",
    "midterm",
    "final",
    "project",
    "practical",
    "oral",
    "other",
]);

module.exports = { ASSESSMENT_STATUSES, ASSESSMENT_TYPES };
