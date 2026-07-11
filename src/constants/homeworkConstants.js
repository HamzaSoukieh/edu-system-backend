// Shared homework enums (DB-5). Single source of truth imported by the Homework
// and HomeworkSubmission models and homeworkService so they can't drift.
const HOMEWORK_STATUSES = Object.freeze(["draft", "assigned", "closed", "archived"]);
const HOMEWORK_TYPES = Object.freeze(["homework", "project"]);
const HOMEWORK_SUBMISSION_STATUSES = Object.freeze(["submitted", "late", "missing", "returned"]);

module.exports = { HOMEWORK_STATUSES, HOMEWORK_TYPES, HOMEWORK_SUBMISSION_STATUSES };
