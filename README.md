# Office Portal (React + Node/Express + PostgreSQL)

Complete HR, Attendance, Custom Schedule, Leave Management, and Monthly Payroll Portal migrated from Firebase to **PostgreSQL + Express REST API**.

---

## 📁 Project Structure
* **`server/`** — Node.js + Express + PostgreSQL Backend (`index.js`, `db.js`, `mailer.js`)
* **`web/`** — React Frontend (`src/api.js`, `src/pages/`, `src/utils/exportAttendance.js`)

---

## 🚀 1. Local Setup (Backend + Frontend)

### Step A: Start the PostgreSQL Backend (`server`)
```bash
cd server
npm install
npm start
```
* Server runs on **`http://localhost:5000`**.
* **PostgreSQL Modes (`server/.env`):**
  1. **Zero-Config Local PostgreSQL (Default):** If `DATABASE_URL` is left empty in `server/.env`, the server automatically starts a persistent local PostgreSQL instance stored in `server/pgdata` and creates all 4 tables (`users`, `attendance`, `leave_requests`, `announcements`).
  2. **Local PostgreSQL 18 / pgAdmin or Cloud PostgreSQL (Neon / Supabase / Render):** Paste your connection string in `server/.env`:
     ```env
     DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/office_portal
     ```
     On startup, `server/db.js` automatically runs `CREATE TABLE IF NOT EXISTS` for all required tables.

### Step B: Start the React Frontend (`web`)
Open a second terminal:
```bash
cd web
npm install
npm start
```
* Frontend opens at **`http://localhost:3000`**.

---

## 📧 2. Email Notifications Setup (`server/.env`)
To enable real email notifications when:
* **Admin posts an Announcement** (emails all employees)
* **Employee submits a Leave / Early Leave Request** (emails Admin)
* **Admin Approves / Rejects a Leave Request** (emails the Employee)

Add your Gmail address and a 16-character **Google App Password** in `server/.env`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
SMTP_FROM="Office Portal <your.email@gmail.com>"
ADMIN_NOTIFICATION_EMAIL=admin@yourdomain.com
```

---

## 🌐 3. Live Deployment Guide (Database + Backend + Frontend)

1. **Cloud PostgreSQL (Free on [Neon.tech](https://neon.tech) or [Supabase](https://supabase.com)):**
   * Create a new PostgreSQL project and copy the `postgresql://...` connection string.
2. **Backend API (Free on [Render.com](https://render.com) or Railway):**
   * Connect your GitHub repository, set Root Directory to `server`, Build Command to `npm install`, Start Command to `npm start`.
   * Add Environment Variables: `DATABASE_URL`, `JWT_SECRET`, `SMTP_USER`, `SMTP_PASS`.
   * Copy your live backend URL (e.g. `https://office-portal-api.onrender.com`).
3. **Frontend Web App (Free on [Vercel.com](https://vercel.com) or Netlify):**
   * Import your repository, set Root Directory to `web`.
   * Add Environment Variable:
     * `REACT_APP_API_URL` = `https://office-portal-api.onrender.com/api`
   * Deploy! `web/vercel.json` is already configured for React Router SPA routes.
