// Shared enrollment enums (DB-5). Single source of truth imported by both the
// Enrollment model and enrollmentService so the two can never drift. Follows the
// billingConstants precedent for shared, frozen enum arrays.
const ENROLLMENT_STATUSES = Object.freeze(["enrolled", "dropped"]);

module.exports = { ENROLLMENT_STATUSES };
