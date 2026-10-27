const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

function getSmtpConfig() {
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "").trim();
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const from =
    (process.env.SMTP_FROM || "").trim() ||
    (user ? `"Office Portal" <${user}>` : "Office Portal <no-reply@officeportal.com>");

  return {
    configured: Boolean(user && pass),
    user,
    pass,
    host,
    port,
    from,
  };
}

function setSmtpConfigInMemory({ smtpUser, smtpPass, smtpHost = "smtp.gmail.com", smtpPort = 587 }) {
  process.env.SMTP_USER = String(smtpUser || "").trim();
  process.env.SMTP_PASS = String(smtpPass || "").replace(/\s+/g, "").trim();
  process.env.SMTP_HOST = String(smtpHost || "smtp.gmail.com").trim();
  process.env.SMTP_PORT = String(smtpPort || 587).trim();
  process.env.SMTP_FROM = `"Office Portal" <${process.env.SMTP_USER}>`;
}

function saveSmtpConfigToEnv({ smtpUser, smtpPass, smtpHost = "smtp.gmail.com", smtpPort = 587 }) {
  setSmtpConfigInMemory({ smtpUser, smtpPass, smtpHost, smtpPort });

  try {
    const envPath = path.join(__dirname, ".env");
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

    const upsert = (key, val) => {
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${val}`);
      } else {
        content += `\n${key}=${val}`;
      }
    };

    upsert("SMTP_HOST", process.env.SMTP_HOST);
    upsert("SMTP_PORT", process.env.SMTP_PORT);
    upsert("SMTP_USER", process.env.SMTP_USER);
    upsert("SMTP_PASS", process.env.SMTP_PASS);
    upsert("SMTP_FROM", process.env.SMTP_FROM);

    fs.writeFileSync(envPath, content.trim() + "\n", "utf8");
  } catch (err) {
    console.warn("Could not write SMTP settings to .env file:", err.message);
  }
}

function getTransporter() {
  const cfg = getSmtpConfig();
  if (!cfg.configured) return null;

  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

async function sendEmail({ to, subject, html, text }) {
  const recipients = [
    ...new Set((Array.isArray(to) ? to : [to]).map((e) => String(e || "").trim()).filter(Boolean)),
  ];
  if (recipients.length === 0) {
    return { sent: false, reason: "No recipient email addresses found." };
  }

  const cfg = getSmtpConfig();
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`📧 [Email Not Sent - SMTP_USER / SMTP_PASS not set in server/.env]`);
    console.log(`   To: ${recipients.join(", ")} | Subject: ${subject}`);
    return {
      sent: false,
      configured: false,
      reason:
        "Email settings (SMTP_USER & SMTP_PASS) abhi configure nahi hain. Admin Dashboard se 'Email Settings' mein apna Gmail aur Google App Password lagayein.",
    };
  }

  try {
    await transporter.sendMail({
      from: cfg.from,
      to: recipients.join(", "),
      subject,
      text: text || "",
      html,
    });
    console.log(`✅ Email sent to: ${recipients.join(", ")} | Subject: ${subject}`);
    return { sent: true, configured: true, recipientsCount: recipients.length };
  } catch (err) {
    console.error("⚠️ Email send error:", err.message);
    return {
      sent: false,
      configured: true,
      error: err.message,
      reason: `SMTP Error: ${err.message}`,
    };
  }
}

async function notifyNewAnnouncement({ message, author, employeeEmails = [] }) {
  const subject = `📢 New Office Announcement from ${author}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #0f0d1d; color: #f8fafc;">
      <h2 style="margin-top: 0; color: #a78bfa;">📢 Office Portal Announcement</h2>
      <p style="font-size: 15px; line-height: 1.6; background: #1a1630; padding: 16px; border-radius: 8px; border-left: 4px solid #6d3aff;">
        ${message}
      </p>
      <p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">
        Posted by <strong>${author}</strong> · Office Portal
      </p>
    </div>
  `;
  return sendEmail({
    to: employeeEmails,
    subject,
    text: `New Announcement (${author}): ${message}`,
    html,
  });
}

async function notifyAdminLeaveRequest({ leave, adminEmails = [] }) {
  const extraAdmin = (process.env.ADMIN_NOTIFICATION_EMAIL || "").trim();
  const targets = [...new Set([...adminEmails, ...(extraAdmin ? [extraAdmin] : [])])];
  const isEarly = leave.type === "earlyLeave";
  const typeLabel = isEarly ? "Early Leave" : "Full Leave";
  const dateInfo = isEarly
    ? `${leave.date} (Departure: ${leave.earlyLeaveTime})`
    : `${leave.startDate} to ${leave.endDate}`;

  const subject = `📝 New ${typeLabel} Request — ${leave.employeeName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #0f0d1d; color: #f8fafc;">
      <h2 style="margin-top: 0; color: #a78bfa;">New ${typeLabel} Request</h2>
      <p><strong>Employee:</strong> ${leave.employeeName} (${leave.employeeEmail})</p>
      <p><strong>Type:</strong> ${typeLabel}</p>
      <p><strong>Date:</strong> ${dateInfo}</p>
      <p><strong>Reason:</strong> ${leave.reason}</p>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 20px;">
        Log in to the Office Portal Admin Panel to approve or reject this request.
      </p>
    </div>
  `;
  return sendEmail({
    to: targets,
    subject,
    text: `${leave.employeeName} requested ${typeLabel} for ${dateInfo}. Reason: ${leave.reason}`,
    html,
  });
}

async function notifyEmployeeLeaveStatus({ leave }) {
  if (!leave?.employeeEmail) return { sent: false, reason: "No employee email" };
  const isEarly = leave.type === "earlyLeave";
  const typeLabel = isEarly ? "Early Leave" : "Leave";
  const statusUpper = String(leave.status || "").toUpperCase();
  const badgeColor = leave.status === "approved" ? "#22c55e" : "#ef4444";

  const subject = `🔔 Your ${typeLabel} Request was ${statusUpper}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #0f0d1d; color: #f8fafc;">
      <h2 style="margin-top: 0; color: ${badgeColor};">${typeLabel} Request ${statusUpper}</h2>
      <p>Hi <strong>${leave.employeeName}</strong>,</p>
      <p>Your ${typeLabel.toLowerCase()} request for <strong>${
        isEarly ? leave.date : `${leave.startDate} to ${leave.endDate}`
      }</strong> has been <strong>${leave.status}</strong> by the admin.</p>
      ${
        leave.adminComment
          ? `<p style="background: #1a1630; padding: 12px; border-radius: 8px;"><strong>Admin Note:</strong> ${leave.adminComment}</p>`
          : ""
      }
    </div>
  `;
  return sendEmail({
    to: [leave.employeeEmail],
    subject,
    text: `Your ${typeLabel} request has been ${leave.status}. ${leave.adminComment ? "Note: " + leave.adminComment : ""}`,
    html,
  });
}

module.exports = {
  getSmtpConfig,
  saveSmtpConfigToEnv,
  sendEmail,
  notifyNewAnnouncement,
  notifyAdminLeaveRequest,
  notifyEmployeeLeaveStatus,
};
