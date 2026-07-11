// Shared schedule/day enums (DB-5). Single source of truth for weekday lists
// used by Section/Semester models and their services + eligibility service.
const SCHEDULE_DAYS = Object.freeze([
    "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
]);
const TEACHING_DAY_LABELS = Object.freeze([
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]);

module.exports = { SCHEDULE_DAYS, TEACHING_DAY_LABELS };
