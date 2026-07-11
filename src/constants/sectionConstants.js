// Shared section / section-session enums (DB-5). Single source of truth imported
// by the models and services so the enum definitions can never drift.
const SECTION_STATUSES = Object.freeze(["draft", "active", "closed", "cancelled"]);
const SECTION_SESSION_STATUSES = Object.freeze(["scheduled", "completed", "cancelled"]);

module.exports = { SECTION_STATUSES, SECTION_SESSION_STATUSES };
