const Assessment = require("../models/Assessment");
const AssessmentResult = require("../models/AssessmentResult");
const Enrollment = require("../models/Enrollment");
const Homework = require("../models/Homework");
const Membership = require("../models/Membership");
const Section = require("../models/Section");
const SectionSession = require("../models/SectionSession");
const Subject = require("../models/Subject");
const User = require("../models/User");
const emailService = require("../services/emailService");
const { sanitizeEmailJobPayload } = require("../queues/emailQueue");
const { EMAIL_JOB_TYPES } = require("../queues/emailQueueNames");

function formatDateOnly(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

async function loadRecipientContext({ institutionId, recipientMembershipId, sectionId }) {
    const membership = await Membership.findOne({
        _id: recipientMembershipId,
        institutionId,
        role: "student",
        status: "active",
    }).select("_id userId").lean();
    if (!membership) return null;

    const enrollment = await Enrollment.findOne({
        institutionId,
        sectionId,
        studentMemberId: recipientMembershipId,
        status: "enrolled",
    }).select("_id studentMemberId").lean();
    if (!enrollment) return null;

    const user = await User.findOne({
        _id: membership.userId,
        status: "active",
        email: { $exists: true, $nin: [null, ""] },
    }).select("_id email").lean();
    if (!user) return null;

    return { membership, enrollment, user };
}

async function loadSectionContext({ institutionId, sectionId, allowedStatuses = ["active"] }) {
    const section = await Section.findOne({
        _id: sectionId,
        institutionId,
        status: { $in: allowedStatuses },
    }).select("_id subjectId code title status").lean();
    if (!section) return null;

    const subject = await Subject.findOne({
        _id: section.subjectId,
        institutionId,
        status: "active",
    }).select("_id name code").lean();
    return subject ? { section, subject } : null;
}

async function processHomeworkAssigned(data) {
    const homework = await Homework.findOne({
        _id: data.entityId,
        institutionId: data.institutionId,
        status: "assigned",
    }).select("_id sectionId title type dueAt submissionMode status").lean();
    if (!homework) return { skipped: true, reason: "invalid_homework" };

    const [sectionContext, recipient] = await Promise.all([
        loadSectionContext({
            institutionId: data.institutionId,
            sectionId: homework.sectionId,
            allowedStatuses: ["active"],
        }),
        loadRecipientContext({
            institutionId: data.institutionId,
            recipientMembershipId: data.recipientMembershipId,
            sectionId: homework.sectionId,
        }),
    ]);
    if (!sectionContext || !recipient) return { skipped: true, reason: "invalid_recipient_scope" };

    await emailService.sendHomeworkAssignedEmail({
        to: recipient.user.email,
        subjectName: sectionContext.subject.name,
        subjectCode: sectionContext.subject.code,
        sectionCode: sectionContext.section.code,
        sectionTitle: sectionContext.section.title || null,
        homeworkTitle: homework.title,
        homeworkType: homework.type,
        dueAt: homework.dueAt ? new Date(homework.dueAt).toISOString() : null,
        submissionMode: homework.submissionMode,
    });
    return { sent: true };
}

async function processAssessment(data, isResult) {
    let assessmentId = data.entityId;
    let resultSectionId = null;
    if (isResult) {
        const result = await AssessmentResult.findOne({
            _id: data.entityId,
            institutionId: data.institutionId,
            studentMemberId: data.recipientMembershipId,
        }).select("_id assessmentId sectionId").lean();
        if (!result) return { skipped: true, reason: "invalid_assessment_result" };
        assessmentId = result.assessmentId;
        resultSectionId = result.sectionId;
    }

    const assessment = await Assessment.findOne({
        _id: assessmentId,
        institutionId: data.institutionId,
        ...(resultSectionId ? { sectionId: resultSectionId } : {}),
        status: isResult ? "published" : "announced",
    }).select("_id sectionId title type assessmentDate status").lean();
    if (!assessment) return { skipped: true, reason: "invalid_assessment" };

    const assessmentDate = formatDateOnly(assessment.assessmentDate);
    if (!assessmentDate) return { skipped: true, reason: "invalid_assessment_date" };

    const [sectionContext, recipient] = await Promise.all([
        loadSectionContext({
            institutionId: data.institutionId,
            sectionId: assessment.sectionId,
            // TODO/verify: announcement email is active-section only; result emails allow closed sections
            // so students can still receive final published results after the section closes.
            allowedStatuses: isResult ? ["active", "closed"] : ["active"],
        }),
        loadRecipientContext({
            institutionId: data.institutionId,
            recipientMembershipId: data.recipientMembershipId,
            sectionId: assessment.sectionId,
        }),
    ]);
    if (!sectionContext || !recipient) return { skipped: true, reason: "invalid_recipient_scope" };

    const send = isResult
        ? emailService.sendAssessmentResultsPublishedEmail
        : emailService.sendAssessmentAnnouncedEmail;
    await send({
        to: recipient.user.email,
        subjectName: sectionContext.subject.name,
        subjectCode: sectionContext.subject.code,
        sectionCode: sectionContext.section.code,
        sectionTitle: sectionContext.section.title || null,
        assessmentTitle: assessment.title,
        assessmentType: assessment.type,
        assessmentDate,
    });
    return { sent: true };
}

async function processSessionCancelled(data) {
    const session = await SectionSession.findOne({
        _id: data.entityId,
        institutionId: data.institutionId,
        status: "cancelled",
    }).select("_id sectionId sessionDate startTime endTime room status statusNote").lean();
    if (!session) return { skipped: true, reason: "invalid_session" };

    const sessionDate = formatDateOnly(session.sessionDate);
    if (!sessionDate) return { skipped: true, reason: "invalid_session_date" };

    const [sectionContext, recipient] = await Promise.all([
        loadSectionContext({
            institutionId: data.institutionId,
            sectionId: session.sectionId,
            // TODO/verify: cancellation emails currently allow closed sections because sessions can be
            // corrected/cancelled after scheduling; revisit if product wants active-section only.
            allowedStatuses: ["active", "closed"],
        }),
        loadRecipientContext({
            institutionId: data.institutionId,
            recipientMembershipId: data.recipientMembershipId,
            sectionId: session.sectionId,
        }),
    ]);
    if (!sectionContext || !recipient) return { skipped: true, reason: "invalid_recipient_scope" };

    await emailService.sendSectionSessionStatusUpdatedEmail({
        to: recipient.user.email,
        subjectName: sectionContext.subject.name,
        subjectCode: sectionContext.subject.code,
        sectionCode: sectionContext.section.code,
        sectionTitle: sectionContext.section.title || null,
        sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        room: session.room || null,
        status: session.status,
        note: session.statusNote || null,
    });
    return { sent: true };
}

async function processEmailJob(job) {
    let data;
    try {
        data = sanitizeEmailJobPayload(job?.data);
    } catch (error) {
        return { skipped: true, reason: "invalid_payload" };
    }

    // TODO/verify: deterministic BullMQ jobId reduces duplicate queued jobs, but true idempotent
    // delivery needs a MongoDB EmailOutbox/EmailDeliveryLog later. Duplicate sends can still happen
    // if SMTP succeeds and the worker crashes before BullMQ marks the job complete.
    switch (data.emailType) {
        case EMAIL_JOB_TYPES.HOMEWORK_ASSIGNED:
            return processHomeworkAssigned(data);
        case EMAIL_JOB_TYPES.ASSESSMENT_ANNOUNCEMENT:
            return processAssessment(data, false);
        case EMAIL_JOB_TYPES.ASSESSMENT_RESULT:
            return processAssessment(data, true);
        case EMAIL_JOB_TYPES.SESSION_CANCELLED:
            return processSessionCancelled(data);
        default:
            return { skipped: true, reason: "unsupported_type" };
    }
}

module.exports = { processEmailJob };
