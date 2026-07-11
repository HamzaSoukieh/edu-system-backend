// Shared section / section-session enums (DB-5). Single source of truth imported
// by the models and services so the enum definitions can never drift.
const SECTION_STATUSES = Object.freeze(["draft", "active", "closed", "cancelled"]);
const SECTION_SESSION_STATUSES = Object.freeze(["scheduled", "completed", "cancelled"]);
const SECTION_SESSION_TYPES = Object.freeze(["lecture", "lab"]);
const SECTION_SCHEDULE_SESSION_TYPES = Object.freeze(["lecture", "lab"]);
const ATTENDANCE_STATES = Object.freeze(["not_started", "open", "closed"]);

module.exports = {
    SECTION_STATUSES,
    SECTION_SESSION_STATUSES,
    SECTION_SESSION_TYPES,
    SECTION_SCHEDULE_SESSION_TYPES,
    ATTENDANCE_STATES,
};
