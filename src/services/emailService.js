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

module.exports = {
    sendOtpEmail,
};
