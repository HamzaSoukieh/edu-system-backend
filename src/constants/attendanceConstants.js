// Shared attendance enums (DB-5). Single source of truth imported by both the
// AttendanceRecord model and attendanceService so the two can never drift.
const ATTENDANCE_STATUSES = Object.freeze(["present", "absent", "late", "excused"]);
const ATTENDANCE_SOURCES = Object.freeze(["manual", "qr"]);

module.exports = { ATTENDANCE_STATUSES, ATTENDANCE_SOURCES };
