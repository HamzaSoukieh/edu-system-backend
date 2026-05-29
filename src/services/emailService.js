const nodemailer = require("nodemailer");

let transporter;

function createConfigError(message) {
    const error = new Error(message);
    error.statusCode = 500;
    return error;
}

function getTransporter() {
    if (transporter) {
        return transporter;
    }

    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailAppPassword) {
        throw createConfigError("GMAIL_USER and GMAIL_APP_PASSWORD are required for email sending");
    }

    transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: gmailUser,
            pass: gmailAppPassword,
        },
    });

    return transporter;
}

function getOtpSubject(purpose) {
    if (purpose === "signup") {
        return "Verify your email";
    }

    if (purpose === "reset_password") {
        return "Reset your password";
    }

    return "Your verification code";
}

function getOtpHeadline(purpose) {
    if (purpose === "signup") {
        return "Email Verification";
    }

    if (purpose === "reset_password") {
        return "Reset Password";
    }

    return "Verification Code";
}

function getOtpDescription(purpose) {
    if (purpose === "signup") {
        return "Use this code to verify your email and activate your account.";
    }

    if (purpose === "reset_password") {
        return "Use this code to reset your password.";
    }

    return "Use this code to continue.";
}

function buildOtpHtml({ code, purpose, expiresInMinutes }) {
    const headline = getOtpHeadline(purpose);
    const description = getOtpDescription(purpose);

    return `
<div style="margin:0;padding:24px;background:#f4f6fb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe2ee;border-radius:12px;overflow:hidden;">
    <div style="background:#0f172a;color:#ffffff;padding:18px 24px;">
      <h1 style="margin:0;font-size:20px;line-height:1.3;">${headline}</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.6;">${description}</p>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">This OTP expires in ${expiresInMinutes} minutes.</p>
      <div style="margin:0 0 18px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:14px;text-align:center;">
        <span style="font-size:30px;letter-spacing:8px;font-weight:700;color:#1e293b;">${code}</span>
      </div>
      <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">If you did not request this, ignore this email.</p>
    </div>
  </div>
</div>`;
}

function buildMemberAccountCreatedText({ isNewUser, email, initialPasswordHint }) {
    if (isNewUser) {
        return [
            "Your account has been created by your institution admin.",
            `Login email: ${email}`,
            `Initial password: ${initialPasswordHint}`,
            "For your security, please change your password after first login.",
        ].join("\n");
    }

    return [
        "You were added to an institution by an admin.",
        `Login email: ${email}`,
        "Use your existing account password to login.",
        "If you cannot login, contact your institution admin.",
    ].join("\n");
}

function buildMemberAccountCreatedHtml({ isNewUser, email, initialPasswordHint }) {
    const passwordBlock = isNewUser
        ? `<p style="margin:0 0 12px;color:#475569;font-size:14px;line-height:1.6;">Initial password: <strong>${initialPasswordHint}</strong></p>
           <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">For your security, please change your password after first login.</p>`
        : `<p style="margin:0 0 12px;color:#475569;font-size:14px;line-height:1.6;">Use your existing account password to login.</p>
           <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">If you cannot login, contact your institution admin.</p>`;

    return `
<div style="margin:0;padding:24px;background:#f4f6fb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe2ee;border-radius:12px;overflow:hidden;">
    <div style="background:#0f172a;color:#ffffff;padding:18px 24px;">
      <h1 style="margin:0;font-size:20px;line-height:1.3;">Your account has been created</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.6;">An institution admin created your account.</p>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">Login email: <strong>${email}</strong></p>
      ${passwordBlock}
    </div>
  </div>
</div>`;
}

function buildSectionSessionStatusUpdatedText({
    subjectName,
    subjectCode,
    sectionCode,
    sectionTitle,
    sessionDate,
    startTime,
    endTime,
    room,
    status,
    note,
}) {
    const sectionLabel = [sectionCode, sectionTitle].filter(Boolean).join(" - ");
    const lines = [
        "A section session status has been updated.",
        `Subject: ${subjectName}${subjectCode ? ` (${subjectCode})` : ""}`,
        `Section: ${sectionLabel || sectionCode || "N/A"}`,
        `Session date: ${sessionDate}`,
        `Time: ${startTime} - ${endTime}`,
        `Status: ${status}`,
    ];

    if (room) {
        lines.push(`Room: ${room}`);
    }

    if (note) {
        lines.push(`Note: ${note}`);
    }

    return lines.join("\n");
}

function buildSectionSessionStatusUpdatedHtml({
    subjectName,
    subjectCode,
    sectionCode,
    sectionTitle,
    sessionDate,
    startTime,
    endTime,
    room,
    status,
    note,
}) {
    const sectionLabel = [sectionCode, sectionTitle].filter(Boolean).join(" - ");
    const roomBlock = room
        ? `<p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Room: <strong>${room}</strong></p>`
        : "";
    const noteBlock = note
        ? `<div style="margin-top:16px;padding:14px;background:#f8fafc;border:1px solid #dbe2ee;border-radius:10px;">
             <p style="margin:0 0 6px;color:#0f172a;font-size:14px;font-weight:600;">Note</p>
             <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">${note}</p>
           </div>`
        : "";

    return `
<div style="margin:0;padding:24px;background:#f4f6fb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe2ee;border-radius:12px;overflow:hidden;">
    <div style="background:#0f172a;color:#ffffff;padding:18px 24px;">
      <h1 style="margin:0;font-size:20px;line-height:1.3;">Section Session Update</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.6;">A section session status has been updated.</p>
      <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Subject: <strong>${subjectName}${subjectCode ? ` (${subjectCode})` : ""}</strong></p>
      <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Section: <strong>${sectionLabel || sectionCode || "N/A"}</strong></p>
      <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Session date: <strong>${sessionDate}</strong></p>
      <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Time: <strong>${startTime} - ${endTime}</strong></p>
      ${roomBlock}
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">Status: <strong>${status}</strong></p>
      ${noteBlock}
    </div>
  </div>
</div>`;
}

function buildAssessmentSectionLabel({ sectionCode, sectionTitle }) {
    return [sectionCode, sectionTitle].filter(Boolean).join(" - ") || sectionCode || "N/A";
}

function buildAssessmentAnnouncementText({
    subjectName,
    subjectCode,
    sectionCode,
    sectionTitle,
    assessmentTitle,
    assessmentType,
    assessmentDate,
}) {
    const sectionLabel = buildAssessmentSectionLabel({ sectionCode, sectionTitle });

    return [
        `A new assessment has been announced in ${sectionLabel}.`,
        `Subject: ${subjectName}${subjectCode ? ` (${subjectCode})` : ""}`,
        `Assessment: ${assessmentTitle}`,
        `Type: ${assessmentType}`,
        `Date: ${assessmentDate}`,
    ].join("\n");
}

function buildAssessmentAnnouncementHtml({
    subjectName,
    subjectCode,
    sectionCode,
    sectionTitle,
    assessmentTitle,
    assessmentType,
    assessmentDate,
}) {
    const sectionLabel = buildAssessmentSectionLabel({ sectionCode, sectionTitle });

    return `
<div style="margin:0;padding:24px;background:#f4f6fb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe2ee;border-radius:12px;overflow:hidden;">
    <div style="background:#0f172a;color:#ffffff;padding:18px 24px;">
      <h1 style="margin:0;font-size:20px;line-height:1.3;">Assessment Announced</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.6;">A new assessment has been announced in <strong>${sectionLabel}</strong>.</p>
      <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Subject: <strong>${subjectName}${subjectCode ? ` (${subjectCode})` : ""}</strong></p>
      <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Assessment: <strong>${assessmentTitle}</strong></p>
      <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Type: <strong>${assessmentType}</strong></p>
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">Date: <strong>${assessmentDate}</strong></p>
    </div>
  </div>
</div>`;
}

function buildAssessmentResultsPublishedText({
    subjectName,
    subjectCode,
    sectionCode,
    sectionTitle,
    assessmentTitle,
    assessmentType,
    assessmentDate,
}) {
    const sectionLabel = buildAssessmentSectionLabel({ sectionCode, sectionTitle });

    return [
        `Results for ${assessmentTitle} are now available in ${sectionLabel}.`,
        `Subject: ${subjectName}${subjectCode ? ` (${subjectCode})` : ""}`,
        `Assessment type: ${assessmentType}`,
        `Assessment date: ${assessmentDate}`,
        "Check your student results to view your published result.",
    ].join("\n");
}

function buildAssessmentResultsPublishedHtml({
    subjectName,
    subjectCode,
    sectionCode,
    sectionTitle,
    assessmentTitle,
    assessmentType,
    assessmentDate,
}) {
    const sectionLabel = buildAssessmentSectionLabel({ sectionCode, sectionTitle });

    return `
<div style="margin:0;padding:24px;background:#f4f6fb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe2ee;border-radius:12px;overflow:hidden;">
    <div style="background:#0f172a;color:#ffffff;padding:18px 24px;">
      <h1 style="margin:0;font-size:20px;line-height:1.3;">Assessment Results Published</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.6;">Results for <strong>${assessmentTitle}</strong> are now available in <strong>${sectionLabel}</strong>.</p>
      <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Subject: <strong>${subjectName}${subjectCode ? ` (${subjectCode})` : ""}</strong></p>
      <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Assessment type: <strong>${assessmentType}</strong></p>
      <p style="margin:0 0 14px;color:#475569;font-size:14px;line-height:1.6;">Assessment date: <strong>${assessmentDate}</strong></p>
      <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">Check your student results to view your published result.</p>
    </div>
  </div>
</div>`;
}

function buildHomeworkSectionLabel({ sectionCode, sectionTitle }) {
    return [sectionCode, sectionTitle].filter(Boolean).join(" - ") || sectionCode || "N/A";
}

function buildHomeworkAssignedText({
    subjectName,
    subjectCode,
    sectionCode,
    sectionTitle,
    homeworkTitle,
    homeworkType,
    dueAt,
    submissionMode,
}) {
    const sectionLabel = buildHomeworkSectionLabel({ sectionCode, sectionTitle });
    const lines = [
        `A new ${homeworkType} has been assigned in ${sectionLabel}.`,
        `Subject: ${subjectName}${subjectCode ? ` (${subjectCode})` : ""}`,
        `Title: ${homeworkTitle}`,
        `Submission mode: ${submissionMode}`,
    ];

    if (dueAt) {
        lines.push(`Due: ${dueAt}`);
    }

    lines.push("Log in to view the details and submit if required.");
    return lines.join("\n");
}

function buildHomeworkAssignedHtml({
    subjectName,
    subjectCode,
    sectionCode,
    sectionTitle,
    homeworkTitle,
    homeworkType,
    dueAt,
    submissionMode,
}) {
    const sectionLabel = buildHomeworkSectionLabel({ sectionCode, sectionTitle });
    const dueAtBlock = dueAt
        ? `<p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Due: <strong>${dueAt}</strong></p>`
        : "";

    return `
<div style="margin:0;padding:24px;background:#f4f6fb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe2ee;border-radius:12px;overflow:hidden;">
    <div style="background:#0f172a;color:#ffffff;padding:18px 24px;">
      <h1 style="margin:0;font-size:20px;line-height:1.3;">${homeworkType === "project" ? "Project Assigned" : "Homework Assigned"}</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.6;">A new ${homeworkType} has been assigned in <strong>${sectionLabel}</strong>.</p>
      <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Subject: <strong>${subjectName}${subjectCode ? ` (${subjectCode})` : ""}</strong></p>
      <p style="margin:0 0 10px;color:#475569;font-size:14px;line-height:1.6;">Title: <strong>${homeworkTitle}</strong></p>
      ${dueAtBlock}
      <p style="margin:0 0 14px;color:#475569;font-size:14px;line-height:1.6;">Submission mode: <strong>${submissionMode}</strong></p>
      <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">Log in to view the details and submit if required.</p>
    </div>
  </div>
</div>`;
}

async function sendOtpEmail({ to, code, purpose, expiresInMinutes }) {
    const mailTransporter = getTransporter();
    const from = process.env.EMAIL_FROM || process.env.GMAIL_USER;
    const subject = getOtpSubject(purpose);
    const text = `Your OTP code is ${code}. It expires in ${expiresInMinutes} minutes.`;
    const html = buildOtpHtml({
        code,
        purpose,
        expiresInMinutes,
    });

    await mailTransporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
    });
}

async function sendMemberAccountCreatedEmail({ to, email, initialPasswordHint, isNewUser }) {
    const mailTransporter = getTransporter();
    const from = process.env.EMAIL_FROM || process.env.GMAIL_USER;
    const subject = "Your account has been created";
    const text = buildMemberAccountCreatedText({
        isNewUser,
        email,
        initialPasswordHint,
    });
    const html = buildMemberAccountCreatedHtml({
        isNewUser,
        email,
        initialPasswordHint,
    });

    await mailTransporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
    });
}

async function sendSectionSessionStatusUpdatedEmail({
    to,
    subjectName,
    subjectCode,
    sectionCode,
    sectionTitle,
    sessionDate,
    startTime,
    endTime,
    room,
    status,
    note,
}) {
    const mailTransporter = getTransporter();
    const from = process.env.EMAIL_FROM || process.env.GMAIL_USER;
    const subject = `Section session ${status}`;
    const text = buildSectionSessionStatusUpdatedText({
        subjectName,
        subjectCode,
        sectionCode,
        sectionTitle,
        sessionDate,
        startTime,
        endTime,
        room,
        status,
        note,
    });
    const html = buildSectionSessionStatusUpdatedHtml({
        subjectName,
        subjectCode,
        sectionCode,
        sectionTitle,
        sessionDate,
        startTime,
        endTime,
        room,
        status,
        note,
    });

    await mailTransporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
    });
}

async function sendAssessmentAnnouncedEmail({
    to,
    subjectName,
    subjectCode,
    sectionCode,
    sectionTitle,
    assessmentTitle,
    assessmentType,
    assessmentDate,
}) {
    const mailTransporter = getTransporter();
    const from = process.env.EMAIL_FROM || process.env.GMAIL_USER;
    const subject = "New assessment announced";
    const text = buildAssessmentAnnouncementText({
        subjectName,
        subjectCode,
        sectionCode,
        sectionTitle,
        assessmentTitle,
        assessmentType,
        assessmentDate,
    });
    const html = buildAssessmentAnnouncementHtml({
        subjectName,
        subjectCode,
        sectionCode,
        sectionTitle,
        assessmentTitle,
        assessmentType,
        assessmentDate,
    });

    await mailTransporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
    });
}

async function sendAssessmentResultsPublishedEmail({
    to,
    subjectName,
    subjectCode,
    sectionCode,
    sectionTitle,
    assessmentTitle,
    assessmentType,
    assessmentDate,
}) {
    const mailTransporter = getTransporter();
    const from = process.env.EMAIL_FROM || process.env.GMAIL_USER;
    const subject = "Assessment results available";
    const text = buildAssessmentResultsPublishedText({
        subjectName,
        subjectCode,
        sectionCode,
        sectionTitle,
        assessmentTitle,
        assessmentType,
        assessmentDate,
    });
    const html = buildAssessmentResultsPublishedHtml({
        subjectName,
        subjectCode,
        sectionCode,
        sectionTitle,
        assessmentTitle,
        assessmentType,
        assessmentDate,
    });

    await mailTransporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
    });
}

async function sendHomeworkAssignedEmail({
    to,
    subjectName,
    subjectCode,
    sectionCode,
    sectionTitle,
    homeworkTitle,
    homeworkType,
    dueAt,
    submissionMode,
}) {
    const mailTransporter = getTransporter();
    const from = process.env.EMAIL_FROM || process.env.GMAIL_USER;
    const subject = homeworkType === "project" ? "New project assigned" : "New homework assigned";
    const text = buildHomeworkAssignedText({
        subjectName,
        subjectCode,
        sectionCode,
        sectionTitle,
        homeworkTitle,
        homeworkType,
        dueAt,
        submissionMode,
    });
    const html = buildHomeworkAssignedHtml({
        subjectName,
        subjectCode,
        sectionCode,
        sectionTitle,
        homeworkTitle,
        homeworkType,
        dueAt,
        submissionMode,
    });

    await mailTransporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
    });
}

module.exports = {
    sendOtpEmail,
    sendMemberAccountCreatedEmail,
    sendSectionSessionStatusUpdatedEmail,
    sendAssessmentAnnouncedEmail,
    sendAssessmentResultsPublishedEmail,
    sendHomeworkAssignedEmail,
};
