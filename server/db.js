const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

let dbClient = null;
let dbMode = "pg";

const DEFAULT_SCHEDULE = {
  sun: "",
  mon: "10:00",
  tue: "10:00",
  wed: "10:00",
  thu: "10:00",
  fri: "10:00",
  sat: "",
};

async function getDb() {
  if (dbClient) return dbClient;

  const connStr = (process.env.DATABASE_URL || "").trim();

  if (connStr) {
    try {
      const pool = new Pool({
        connectionString: connStr,
        ssl:
          connStr.includes("localhost") || connStr.includes("127.0.0.1")
            ? false
            : { rejectUnauthorized: false },
      });
      await pool.query("SELECT 1");
      dbClient = pool;
      dbMode = "postgresql-server";
      console.log("✅ Connected to PostgreSQL Server via DATABASE_URL");
      return dbClient;
    } catch (err) {
      console.warn(
        "⚠️ Could not connect to DATABASE_URL, falling back to local persistent PostgreSQL (PGlite):",
        err.message
      );
    }
  }

  // Fallback to local persistent PostgreSQL (PGlite) stored in ./pgdata
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = path.join(__dirname, "pgdata");
  const pglite = new PGlite(dataDir);
  await pglite.waitReady;

  dbClient = {
    query: async (text, params = []) => {
      const res = await pglite.query(text, params);
      return { rows: res.rows || [], rowCount: res.affectedRows ?? (res.rows ? res.rows.length : 0) };
    },
  };
  dbMode = "pglite-local";
  console.log(`✅ Connected to local persistent PostgreSQL at ${dataDir}`);
  return dbClient;
}

async function query(text, params = []) {
  const client = await getDb();
  return client.query(text, params);
}

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Employee',
      full_name TEXT DEFAULT '',
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      salary NUMERIC(12, 2) NOT NULL DEFAULT 0,
      profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
      cnic TEXT DEFAULT '',
      dob TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      payment_method TEXT DEFAULT 'bank',
      provider_name TEXT DEFAULT '',
      account_title TEXT DEFAULT '',
      account_number TEXT DEFAULT '',
      iban TEXT DEFAULT '',
      emergency_name TEXT DEFAULT '',
      emergency_relation TEXT DEFAULT '',
      emergency_phone TEXT DEFAULT '',
      schedule JSONB NOT NULL DEFAULT '{"sun":"","mon":"10:00","tue":"10:00","wed":"10:00","thu":"10:00","fri":"10:00","sat":""}'::jsonb,
      photo_url TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      month TEXT NOT NULL,
      check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'on-time',
      late_minutes INTEGER NOT NULL DEFAULT 0,
      marked_by TEXT,
      UNIQUE(uid, date)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id SERIAL PRIMARY KEY,
      uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
      employee_name TEXT NOT NULL,
      employee_email TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'leave',
      start_date TEXT,
      end_date TEXT,
      date TEXT,
      early_leave_time TEXT,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_comment TEXT DEFAULT '',
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      message TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'Admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log(`📦 PostgreSQL tables verified/initialized (mode: ${dbMode})`);
}

function mapUserRow(row) {
  if (!row) return null;
  let schedule = row.schedule;
  if (typeof schedule === "string") {
    try {
      schedule = JSON.parse(schedule);
    } catch {
      schedule = { ...DEFAULT_SCHEDULE };
    }
  }
  return {
    uid: row.uid,
    name: row.name || row.full_name || "Employee",
    fullName: row.full_name || row.name || "",
    email: row.email,
    role: row.role || "employee",
    salary: Number(row.salary) || 0,
    profileComplete: Boolean(row.profile_complete),
    photoURL: row.photo_url || "",
    personalInfo: {
      fullName: row.full_name || row.name || "",
      cnic: row.cnic || "",
      dob: row.dob || "",
      phone: row.phone || "",
      address: row.address || "",
    },
    bankDetails: {
      method: row.payment_method || "bank",
      providerName: row.provider_name || "",
      accountTitle: row.account_title || "",
      accountNumber: row.account_number || "",
      iban: row.iban || "",
    },
    emergencyContact: {
      name: row.emergency_name || "",
      relation: row.emergency_relation || "",
      phone: row.emergency_phone || "",
    },
    schedule: schedule || { ...DEFAULT_SCHEDULE },
    createdAt: row.created_at,
  };
}

function mapAttendanceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    uid: row.uid,
    name: row.name,
    date: row.date,
    month: row.month,
    checkInTime: row.check_in_time,
    status: row.status,
    lateMinutes: Number(row.late_minutes) || 0,
    markedBy: row.marked_by,
  };
}

function mapLeaveRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    uid: row.uid,
    employeeName: row.employee_name,
    employeeEmail: row.employee_email,
    type: row.type,
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    date: row.date || null,
    earlyLeaveTime: row.early_leave_time || null,
    reason: row.reason,
    status: row.status,
    adminComment: row.admin_comment || "",
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
  };
}

function mapAnnouncementRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    message: row.message,
    author: row.author,
    createdAt: row.created_at,
  };
}

module.exports = {
  query,
  initDb,
  getDbMode: () => dbMode,
  DEFAULT_SCHEDULE,
  mapUserRow,
  mapAttendanceRow,
  mapLeaveRow,
  mapAnnouncementRow,
};
