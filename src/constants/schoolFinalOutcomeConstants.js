// Shared school-final-outcome enums (DB-5). Single source of truth imported by
// the SchoolFinalOutcome model and schoolFinalOutcomeService so they can't drift.
const SCHOOL_FINAL_OUTCOME_STATUSES = Object.freeze(["draft", "finalized", "cancelled"]);

module.exports = { SCHOOL_FINAL_OUTCOME_STATUSES };
