const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const {
  query,
  initDb,
  getDbMode,
  DEFAULT_SCHEDULE,
  mapUserRow,
  mapAttendanceRow,
  mapLeaveRow,
  mapAnnouncementRow,
} = require("./db");

const {
  getSmtpConfig,
  saveSmtpConfigToEnv,
  sendEmail,
  notifyNewAnnouncement,
  notifyAdminLeaveRequest,
  notifyEmployeeLeaveStatus,
} = require("./mailer");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "office_portal_super_secret_jwt_key_2026";

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Helper for attendance calculation (matches frontend attendanceHelpers.js)
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const GRACE_MINUTES = 20;
const EXTREME_LATE_AFTER_GRACE_MINUTES = 30;

function calculateAttendanceStatus(schedule, checkInDate = new Date()) {
  const weekdayKey = WEEKDAY_KEYS[checkInDate.getDay()];
  const expectedTime = schedule?.[weekdayKey];

  if (!expectedTime || !/^\d{1,2}:\d{2}$/.test(expectedTime)) {
    return { status: "on-time", lateMinutes: 0, weekdayKey };
  }

  const [expH, expM] = expectedTime.split(":").map(Number);
  const expectedDate = new Date(checkInDate);
  expectedDate.setHours(expH, expM, 0, 0);

  const graceDate = new Date(expectedDate.getTime() + GRACE_MINUTES * 60000);

  if (checkInDate <= graceDate) {
    return { status: "on-time", lateMinutes: 0, weekdayKey };
  }

  const lateMinutes = Math.round((checkInDate.getTime() - graceDate.getTime()) / 60000);
  const status =
    lateMinutes > EXTREME_LATE_AFTER_GRACE_MINUTES ? "extreme-late" : "late";

  return { status, lateMinutes, weekdayKey };
}

// Auth Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
}

// ---------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------
app.get("/api/health", async (req, res) => {
  try {
    const r = await query("SELECT COUNT(*) AS count FROM users");
    res.json({
      ok: true,
      dbMode: getDbMode(),
      usersCount: Number(r.rows[0]?.count || 0),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------
// SMTP EMAIL SETTINGS ROUTES (Admin)
// ---------------------------------------------------------
app.get("/api/settings/smtp", authMiddleware, async (req, res) => {
  try {
    const cfg = getSmtpConfig();
    res.json({
      configured: cfg.configured,
      smtpUser: cfg.user,
      smtpHost: cfg.host,
      smtpPort: cfg.port,
      hasPassword: Boolean(cfg.pass),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/settings/smtp", authMiddleware, async (req, res) => {
  try {
    const callerRes = await query("SELECT role, email FROM users WHERE uid = $1", [
      req.user.uid,
    ]);
    if (callerRes.rows[0]?.role !== "admin") {
      return res.status(403).json({ error: "Only Admin can update email settings." });
    }

    const { smtpUser, smtpPass, smtpHost, smtpPort, testEmail } = req.body;
    if (!smtpUser || !smtpPass) {
      return res
        .status(400)
        .json({ error: "Gmail address and 16-digit Google App Password are required." });
    }

    saveSmtpConfigToEnv({
      smtpUser,
      smtpPass,
      smtpHost: smtpHost || "smtp.gmail.com",
      smtpPort: smtpPort || 587,
    });

    const targetTestEmail = testEmail || callerRes.rows[0]?.email || smtpUser;
    const testResult = await sendEmail({
      to: [targetTestEmail],
      subject: "✅ Office Portal — Email Notifications Connected!",
      text: "Your Office Portal email notification system is now active and working.",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border-radius: 12px; background: #0f0d1d; color: #f8fafc;">
          <h2 style="margin-top: 0; color: #4ade80;">✅ Email Notifications Active!</h2>
          <p>Congratulations! Your Office Portal SMTP settings are configured properly.</p>
          <p style="font-size: 13px; color: #94a3b8;">Announcements and Leave Notifications will now be delivered automatically.</p>
        </div>
      `,
    });

    res.json({
      saved: true,
      emailStatus: testResult,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// AUTH ROUTES
// ---------------------------------------------------------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanName = String(name || "").trim() || cleanEmail.split("@")[0] || "Employee";

    if (!cleanEmail || !password || String(password).length < 6) {
      return res
        .status(400)
        .json({ error: "Valid email and password (min 6 characters) are required." });
    }

    const existing = await query("SELECT uid FROM users WHERE email = $1", [cleanEmail]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }

    const countRes = await query("SELECT COUNT(*) AS cnt FROM users");
    const isFirstUser = Number(countRes.rows[0]?.cnt || 0) === 0;
    const assignedRole =
      role === "admin" || isFirstUser ? "admin" : "employee";

    const uid = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(String(password), 10);

    const insertRes = await query(
      `INSERT INTO users (uid, name, full_name, email, password_hash, role, salary, profile_complete, schedule)
       VALUES ($1, $2, $3, $4, $5, $6, 0, FALSE, $7::jsonb)
       RETURNING *`,
      [
        uid,
        cleanName,
        cleanName,
        cleanEmail,
        passwordHash,
        assignedRole,
        JSON.stringify(DEFAULT_SCHEDULE),
      ]
    );

    const userObj = mapUserRow(insertRes.rows[0]);
    const token = jwt.sign(
      { uid: userObj.uid, email: userObj.email, role: userObj.role },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(201).json({ token, user: userObj });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: err.message || "Could not create account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const userRes = await query("SELECT * FROM users WHERE email = $1", [cleanEmail]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const row = userRes.rows[0];
    const match = await bcrypt.compare(String(password), row.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const userObj = mapUserRow(row);
    const token = jwt.sign(
      { uid: userObj.uid, email: userObj.email, role: userObj.role },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({ token, user: userObj });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message || "Login failed." });
  }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const userRes = await query("SELECT * FROM users WHERE uid = $1", [req.user.uid]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json({ user: mapUserRow(userRes.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ error: "Email is required." });
    }

    const userRes = await query("SELECT * FROM users WHERE email = $1", [cleanEmail]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "No user found with that email." });
    }

    const passToSet = newPassword && String(newPassword).length >= 6 ? String(newPassword) : "123456";
    const hash = await bcrypt.hash(passToSet, 10);
    await query("UPDATE users SET password_hash = $1 WHERE email = $2", [hash, cleanEmail]);

    res.json({
      message: newPassword
        ? "Password has been updated successfully."
        : "Password has been reset to default (123456). Please log in and update it.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// USERS & PROFILE ROUTES
// ---------------------------------------------------------
app.get("/api/users", authMiddleware, async (req, res) => {
  try {
    const r = await query("SELECT * FROM users ORDER BY created_at ASC");
    res.json({ users: r.rows.map(mapUserRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users/:uid", authMiddleware, async (req, res) => {
  try {
    const r = await query("SELECT * FROM users WHERE uid = $1", [req.params.uid]);
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user: mapUserRow(r.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/users/:uid", authMiddleware, async (req, res) => {
  try {
    const { uid } = req.params;
    const existingRes = await query("SELECT * FROM users WHERE uid = $1", [uid]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check caller role from DB
    const callerRes = await query("SELECT role FROM users WHERE uid = $1", [
      req.user.uid,
    ]);
    const isAdminCaller = callerRes.rows[0]?.role === "admin";

    const current = mapUserRow(existingRes.rows[0]);
    const body = req.body || {};

    // If profile is already completed AND caller is NOT Admin:
    // Employee can ONLY update basic info (Name, Phone, Address, Profile Picture).
    // CNIC, DOB, Bank Details, Emergency Contact, Role, Salary, Schedule are locked to Admin only!
    const isLockedForEmployee = current.profileComplete && !isAdminCaller;

    const incomingPersonal = body.personalInfo || {};
    const personalInfo = isLockedForEmployee
      ? {
          ...current.personalInfo,
          fullName:
            incomingPersonal.fullName !== undefined
              ? incomingPersonal.fullName
              : body.name || current.personalInfo.fullName,
          phone:
            incomingPersonal.phone !== undefined
              ? incomingPersonal.phone
              : current.personalInfo.phone,
          address:
            incomingPersonal.address !== undefined
              ? incomingPersonal.address
              : current.personalInfo.address,
        }
      : {
          ...current.personalInfo,
          ...incomingPersonal,
        };

    const bankDetails = isLockedForEmployee
      ? current.bankDetails
      : {
          ...current.bankDetails,
          ...(body.bankDetails || {}),
        };

    const emergencyContact = isLockedForEmployee
      ? current.emergencyContact
      : {
          ...current.emergencyContact,
          ...(body.emergencyContact || {}),
        };

    const name =
      body.name !== undefined
        ? body.name
        : personalInfo.fullName || current.name;
    const fullName = personalInfo.fullName || name || current.fullName;
    const role =
      !isLockedForEmployee && body.role !== undefined ? body.role : current.role;
    const salary =
      !isLockedForEmployee && body.salary !== undefined
        ? Number(body.salary) || 0
        : current.salary;
    const profileComplete =
      body.profileComplete !== undefined
        ? Boolean(body.profileComplete)
        : current.profileComplete;
    const photoUrl =
      body.photoURL !== undefined ? body.photoURL : current.photoURL;
    const schedule =
      !isLockedForEmployee && body.schedule !== undefined
        ? body.schedule
        : current.schedule;

    const updateRes = await query(
      `UPDATE users
       SET name = $1,
           full_name = $2,
           role = $3,
           salary = $4,
           profile_complete = $5,
           cnic = $6,
           dob = $7,
           phone = $8,
           address = $9,
           payment_method = $10,
           provider_name = $11,
           account_title = $12,
           account_number = $13,
           iban = $14,
           emergency_name = $15,
           emergency_relation = $16,
           emergency_phone = $17,
           schedule = $18::jsonb,
           photo_url = $19
       WHERE uid = $20
       RETURNING *`,
      [
        name,
        fullName,
        role,
        salary,
        profileComplete,
        personalInfo.cnic || "",
        personalInfo.dob || "",
        personalInfo.phone || "",
        personalInfo.address || "",
        bankDetails.method || "bank",
        bankDetails.providerName || "",
        bankDetails.accountTitle || "",
        bankDetails.accountNumber || "",
        bankDetails.iban || "",
        emergencyContact.name || "",
        emergencyContact.relation || "",
        emergencyContact.phone || "",
        JSON.stringify(schedule || DEFAULT_SCHEDULE),
        photoUrl || "",
        uid,
      ]
    );

    const updatedUser = mapUserRow(updateRes.rows[0]);

    // If schedule was updated by Admin, recalculate all past attendance records for this user
    if (!isLockedForEmployee && body.schedule !== undefined) {
      const attRes = await query("SELECT * FROM attendance WHERE uid = $1", [uid]);
      for (const attRow of attRes.rows) {
        const checkInDate = new Date(attRow.check_in_time);
        const { status, lateMinutes } = calculateAttendanceStatus(schedule, checkInDate);
        await query(
          "UPDATE attendance SET status = $1, late_minutes = $2 WHERE id = $3",
          [status, lateMinutes, attRow.id]
        );
      }
    }

    res.json({ user: updatedUser });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// ATTENDANCE ROUTES
// ---------------------------------------------------------
app.get("/api/attendance", authMiddleware, async (req, res) => {
  try {
    const { uid, date, month } = req.query;
    const conditions = [];
    const params = [];

    if (uid) {
      params.push(uid);
      conditions.push(`uid = $${params.length}`);
    }
    if (date) {
      params.push(date);
      conditions.push(`date = $${params.length}`);
    }
    if (month) {
      params.push(month);
      conditions.push(`month = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const r = await query(
      `SELECT * FROM attendance ${whereClause} ORDER BY date ASC, check_in_time ASC`,
      params
    );

    res.json({ records: r.rows.map(mapAttendanceRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/attendance/mark", authMiddleware, async (req, res) => {
  try {
    const { uid, date, month } = req.body;
    if (!uid || !date || !month) {
      return res.status(400).json({ error: "uid, date, and month are required." });
    }

    const id = `${uid}_${date}`;
    const existing = await query("SELECT * FROM attendance WHERE id = $1 OR (uid = $2 AND date = $3)", [
      id,
      uid,
      date,
    ]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Is employee ki attendance pehle se lagi hui hai." });
    }

    const userRes = await query("SELECT * FROM users WHERE uid = $1", [uid]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "Employee not found." });
    }
    const emp = mapUserRow(userRes.rows[0]);

    const now = new Date();
    const { status, lateMinutes } = calculateAttendanceStatus(emp.schedule, now);
    const empName = emp.fullName || emp.name || emp.email.split("@")[0] || "Employee";

    const insertRes = await query(
      `INSERT INTO attendance (id, uid, name, date, month, check_in_time, status, late_minutes, marked_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, uid, empName, date, month, now.toISOString(), status, lateMinutes, req.user.uid]
    );

    res.status(201).json({ record: mapAttendanceRow(insertRes.rows[0]) });
  } catch (err) {
    console.error("Mark attendance error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// LEAVE REQUESTS ROUTES
// ---------------------------------------------------------
app.get("/api/leaves", authMiddleware, async (req, res) => {
  try {
    const { uid, status } = req.query;
    const conditions = [];
    const params = [];

    if (uid) {
      params.push(uid);
      conditions.push(`uid = $${params.length}`);
    }
    if (status && status !== "all") {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const r = await query(
      `SELECT * FROM leave_requests ${whereClause} ORDER BY created_at DESC`,
      params
    );

    res.json({ requests: r.rows.map(mapLeaveRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/leaves", authMiddleware, async (req, res) => {
  try {
    const { type, startDate, endDate, date, earlyLeaveTime, reason } = req.body;
    const uid = req.user.uid;

    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: "Please enter a reason." });
    }

    const userRes = await query("SELECT * FROM users WHERE uid = $1", [uid]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "Employee profile not found." });
    }
    const emp = mapUserRow(userRes.rows[0]);

    const pendingRes = await query(
      "SELECT * FROM leave_requests WHERE uid = $1 AND status = 'pending'",
      [uid]
    );
    const duplicate = pendingRes.rows.some((old) => {
      if (old.type !== type) return false;
      if (type === "leave") {
        return old.start_date === startDate && old.end_date === endDate;
      }
      return old.date === date;
    });

    if (duplicate) {
      return res.status(400).json({
        error: "You already have a pending request for this date or date range.",
      });
    }

    const empName = emp.fullName || emp.name || emp.email.split("@")[0] || "Employee";
    const insertRes = await query(
      `INSERT INTO leave_requests (
        uid, employee_name, employee_email, type, start_date, end_date, date, early_leave_time, reason, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      RETURNING *`,
      [
        uid,
        empName,
        emp.email,
        type || "leave",
        type === "leave" ? startDate : null,
        type === "leave" ? endDate : null,
        type === "earlyLeave" ? date : null,
        type === "earlyLeave" ? earlyLeaveTime : null,
        String(reason).trim(),
      ]
    );

    const createdLeave = mapLeaveRow(insertRes.rows[0]);

    const adminsRes = await query("SELECT email FROM users WHERE role = 'admin'");
    const adminEmails = adminsRes.rows.map((a) => a.email).filter(Boolean);
    const emailStatus = await notifyAdminLeaveRequest({
      leave: createdLeave,
      adminEmails,
    });

    res.status(201).json({ request: createdLeave, emailStatus });
  } catch (err) {
    console.error("Create leave error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/leaves/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminComment } = req.body;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    const updateRes = await query(
      `UPDATE leave_requests
       SET status = $1,
           admin_comment = $2,
           reviewed_by = $3,
           reviewed_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, String(adminComment || "").trim(), req.user.uid, Number(id)]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: "Leave request not found." });
    }

    const updatedLeave = mapLeaveRow(updateRes.rows[0]);
    const emailStatus = await notifyEmployeeLeaveStatus({ leave: updatedLeave });

    res.json({ request: updatedLeave, emailStatus });
  } catch (err) {
    console.error("Update leave error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// ANNOUNCEMENTS ROUTES
// ---------------------------------------------------------
app.get("/api/announcements", authMiddleware, async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const r = await query(
      "SELECT * FROM announcements ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    res.json({ announcements: r.rows.map(mapAnnouncementRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/announcements", authMiddleware, async (req, res) => {
  try {
    const { message, author } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Announcement message is required." });
    }

    const cleanAuthor = String(author || "Admin").trim();
    const insertRes = await query(
      "INSERT INTO announcements (message, author) VALUES ($1, $2) RETURNING *",
      [String(message).trim(), cleanAuthor]
    );

    const createdAnn = mapAnnouncementRow(insertRes.rows[0]);

    const usersRes = await query("SELECT email FROM users");
    const employeeEmails = usersRes.rows.map((u) => u.email).filter(Boolean);
    const emailStatus = await notifyNewAnnouncement({
      message: createdAnn.message,
      author: createdAnn.author,
      employeeEmails,
    });

    res.status(201).json({ announcement: createdAnn, emailStatus });
  } catch (err) {
    console.error("Create announcement error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/announcements/:id", authMiddleware, async (req, res) => {
  try {
    const callerRes = await query("SELECT role FROM users WHERE uid = $1", [
      req.user.uid,
    ]);
    if (callerRes.rows[0]?.role !== "admin") {
      return res.status(403).json({ error: "Only Admin can delete announcements." });
    }

    const { id } = req.params;
    const delRes = await query(
      "DELETE FROM announcements WHERE id = $1 RETURNING id",
      [Number(id)]
    );

    if (delRes.rows.length === 0) {
      return res.status(404).json({ error: "Announcement not found." });
    }

    res.json({ deleted: true, id: String(id) });
  } catch (err) {
    console.error("Delete announcement error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start Server
initDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Office Portal PostgreSQL Backend running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to initialize database:", err);
    process.exit(1);
  });
