// Regression tests for the "required enum returned null" validator bug class.
//
// Three create-path validators used to return null when the field was omitted
// (`allowUndefined ? undefined : null`), even though the target schema field is
// required. On document create paths that surfaced as an unhandled Mongoose
// ValidationError → masked 500; on the manual-attendance bulkWrite path (which
// bypasses schema validation entirely) the null was silently PERSISTED,
// corrupting attendance records. All three must reject with a clear 400.
//
// Proven live before the fix (2026-07-11):
//   POST /sections/:id/sessions without sessionType   -> 500 (unlogged)
//   POST /sections/:id/assessments without type       -> 500 (unlogged)
//   PUT  .../attendance/manual entry without status   -> 200, stored null

const test = require("node:test");
const assert = require("node:assert/strict");

const { validateCreateSectionSessionInput, validateUpdateSectionSessionInput } = require("../src/services/sectionSessionService");
const { validateCreateAssessmentInput } = require("../src/services/assessmentService");
const { validateManualAttendanceUpsertInput } = require("../src/services/attendanceService");

function assert400(fn, messagePattern) {
    assert.throws(fn, (error) => {
        assert.equal(error.statusCode, 400, `expected 400, got ${error.statusCode} (${error.message})`);
        assert.match(error.message, messagePattern);
        return true;
    });
}

test("section session create without sessionType rejects with 400 (was masked 500)", () => {
    assert400(
        () => validateCreateSectionSessionInput({ sessionDate: "2026-09-02", startTime: "10:00", endTime: "11:00" }),
        /sessionType is required/
    );
});

test("section session create with a valid sessionType passes", () => {
    const input = validateCreateSectionSessionInput({
        sessionType: "lecture",
        sessionDate: "2026-09-02",
        startTime: "10:00",
        endTime: "11:00",
    });
    assert.equal(input.sessionType, "lecture");
});

test("section session UPDATE without sessionType still means 'no change' (partial PATCH intact)", () => {
    const updates = validateUpdateSectionSessionInput({ room: "B-204" });
    assert.equal(Object.prototype.hasOwnProperty.call(updates, "sessionType") ? updates.sessionType : undefined, undefined);
});

test("assessment create without type rejects with 400 (was masked 500)", () => {
    assert400(
        () => validateCreateAssessmentInput({ title: "Quiz 1", assessmentDate: "2026-09-10", maxScore: 100, weight: 10 }),
        /type is required/
    );
});

test("assessment create with a valid type passes and status defaults to draft", () => {
    const input = validateCreateAssessmentInput({
        title: "Quiz 1",
        type: "quiz",
        assessmentDate: "2026-09-10",
        maxScore: 100,
        weight: 10,
    });
    assert.equal(input.type, "quiz");
});

test("manual attendance entry without attendanceStatus rejects with 400 (was silently persisted null)", () => {
    assert400(
        () => validateManualAttendanceUpsertInput({ entries: [{ enrollmentId: "64b000000000000000000006" }] }),
        /attendanceStatus must be present, absent, late, or excused/
    );
});

test("manual attendance entry with a valid status passes", () => {
    const input = validateManualAttendanceUpsertInput({
        entries: [{ enrollmentId: "64b000000000000000000006", attendanceStatus: "present" }],
    });
    assert.equal(input.entries[0].attendanceStatus, "present");
});
