const EMAIL_QUEUE_NAME = "email";

const EMAIL_JOB_TYPES = Object.freeze({
    HOMEWORK_ASSIGNED: "homework-assigned",
    ASSESSMENT_ANNOUNCEMENT: "assessment-announcement",
    ASSESSMENT_RESULT: "assessment-result",
    SESSION_CANCELLED: "session-cancelled",
});

module.exports = {
    EMAIL_QUEUE_NAME,
    EMAIL_JOB_TYPES,
};
