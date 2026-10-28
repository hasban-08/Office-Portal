const path = require("path");
const { query, initDb } = require("./db");

async function migrateLocalToNeon() {
  try {
    await initDb();
    const { PGlite } = await import("@electric-sql/pglite");
    const dataDir = path.join(__dirname, "pgdata");
    const localDb = new PGlite(dataDir);
    await localDb.waitReady;

    // 1. Migrate Users
    const localUsers = await localDb.query("SELECT * FROM users");
    console.log(`Found ${localUsers.rows.length} local user(s) in pgdata...`);

    for (const r of localUsers.rows) {
      // If email already exists on Neon, update its profile data from local; otherwise insert!
      const existingByEmail = await query("SELECT uid FROM users WHERE email = $1", [r.email]);
      if (existingByEmail.rows.length > 0) {
        const neonUid = existingByEmail.rows[0].uid;
        await query(
          `UPDATE users SET
             name = $1, full_name = $2, role = $3, salary = $4, profile_complete = $5,
             cnic = $6, dob = $7, phone = $8, address = $9,
             payment_method = $10, provider_name = $11, account_title = $12, account_number = $13, iban = $14,
             emergency_name = $15, emergency_relation = $16, emergency_phone = $17,
             schedule = $18::jsonb, photo_url = $19
           WHERE uid = $20`,
          [
            r.name,
            r.full_name,
            r.role,
            r.salary,
            r.profile_complete,
            r.cnic,
            r.dob,
            r.phone,
            r.address,
            r.payment_method,
            r.provider_name,
            r.account_title,
            r.account_number,
            r.iban,
            r.emergency_name,
            r.emergency_relation,
            r.emergency_phone,
            typeof r.schedule === "string" ? r.schedule : JSON.stringify(r.schedule),
            r.photo_url || "",
            neonUid,
          ]
        );
        console.log(`✅ Updated existing Neon user ${r.email} with local profile data!`);
      } else {
        await query(
          `INSERT INTO users (
             uid, name, full_name, email, password_hash, role, salary, profile_complete,
             cnic, dob, phone, address, payment_method, provider_name, account_title, account_number, iban,
             emergency_name, emergency_relation, emergency_phone, schedule, photo_url, created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,$23)
           ON CONFLICT (uid) DO NOTHING`,
          [
            r.uid,
            r.name,
            r.full_name,
            r.email,
            r.password_hash,
            r.role,
            r.salary,
            r.profile_complete,
            r.cnic,
            r.dob,
            r.phone,
            r.address,
            r.payment_method,
            r.provider_name,
            r.account_title,
            r.account_number,
            r.iban,
            r.emergency_name,
            r.emergency_relation,
            r.emergency_phone,
            typeof r.schedule === "string" ? r.schedule : JSON.stringify(r.schedule),
            r.photo_url || "",
            r.created_at,
          ]
        );
        console.log(`✅ Inserted local user ${r.email} into Neon!`);
      }
    }

    // Map emails -> neon uids for attendance/leaves
    const neonUsersRes = await query("SELECT uid, email FROM users");
    const uidMap = {};
    for (const lu of localUsers.rows) {
      const match = neonUsersRes.rows.find((nu) => nu.email === lu.email);
      if (match) uidMap[lu.uid] = match.uid;
    }

    // 2. Migrate Attendance
    const localAtt = await localDb.query("SELECT * FROM attendance");
    for (const a of localAtt.rows) {
      const targetUid = uidMap[a.uid] || a.uid;
      const newId = `${targetUid}_${a.date}`;
      await query(
        `INSERT INTO attendance (id, uid, name, date, month, check_in_time, status, late_minutes, marked_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (uid, date) DO NOTHING`,
        [
          newId,
          targetUid,
          a.name,
          a.date,
          a.month,
          a.check_in_time,
          a.status,
          a.late_minutes,
          uidMap[a.marked_by] || a.marked_by,
        ]
      );
    }
    console.log(`✅ Migrated ${localAtt.rows.length} attendance record(s) to Neon!`);

    // 3. Migrate Leave Requests
    const localLeaves = await localDb.query("SELECT * FROM leave_requests");
    for (const l of localLeaves.rows) {
      const targetUid = uidMap[l.uid] || l.uid;
      await query(
        `INSERT INTO leave_requests (
           uid, employee_name, employee_email, type, start_date, end_date, date, early_leave_time,
           reason, status, admin_comment, reviewed_by, reviewed_at, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          targetUid,
          l.employee_name,
          l.employee_email,
          l.type,
          l.start_date,
          l.end_date,
          l.date,
          l.early_leave_time,
          l.reason,
          l.status,
          l.admin_comment,
          uidMap[l.reviewed_by] || l.reviewed_by,
          l.reviewed_at,
          l.created_at,
        ]
      );
    }
    console.log(`✅ Migrated ${localLeaves.rows.length} leave request(s) to Neon!`);

    // 4. Migrate Announcements
    const localAnn = await localDb.query("SELECT * FROM announcements");
    for (const ann of localAnn.rows) {
      await query(
        `INSERT INTO announcements (message, author, created_at) VALUES ($1,$2,$3)`,
        [ann.message, ann.author, ann.created_at]
      );
    }
    console.log(`✅ Migrated ${localAnn.rows.length} announcement(s) to Neon!`);

    process.exit(0);
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  }
}

migrateLocalToNeon();
