// Shared notification enums (DB-5). Single source of truth imported by the
// Notification model and notificationService so they can't drift.
const NOTIFICATION_TYPES = Object.freeze([
    "academic_decision_review_required",
    "academic_decision_cancelled",
    "academic_decision_approved",
    "academic_decision_rejected",
    "academic_decision_applied",
    "enrollment_status_changed",
]);

module.exports = { NOTIFICATION_TYPES };
