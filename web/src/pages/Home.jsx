import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCurrentUser,
  fetchUserById,
  fetchUsers,
  fetchAttendance,
  fetchLeaves,
  fetchAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  updateUserById,
  fetchSmtpSettings,
  saveSmtpSettings,
  apiLogout,
} from "../api";
import {
  calculateSalaryStats,
  getLocalMonthStr,
  getLocalDateStr,
  calculateAttendanceStatus,
  formatTime12,
} from "../utils/attendanceHelpers";
import {
  exportDirectoryToCSV,
  exportDirectoryToExcel,
  exportDirectoryToPDF,
  exportEmployeeSalarySlipPDF,
  printElement,
} from "../utils/exportAttendance";
import "./css/Home.css";

function displayNameFor(emp) {
  if (emp.name && emp.name.trim() && emp.name.trim().toLowerCase() !== "user") {
    return emp.name;
  }
  if (emp.personalInfo?.fullName?.trim()) return emp.personalInfo.fullName;
  if (emp.email) return emp.email.split("@")[0];
  return "Employee";
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function Home() {
  const [userData, setUserData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [employees, setEmployees] = useState([]);
  const [empStats, setEmpStats] = useState({});
  const [empLoading, setEmpLoading] = useState(true);

  // Dashboard Widgets State
  const [todayAtt, setTodayAtt] = useState([]);
  const [myTodayRecord, setMyTodayRecord] = useState(null);
  const [myMonthStats, setMyMonthStats] = useState(null);
  const [lateWarning, setLateWarning] = useState(null);
  const [pendingLeavesCount, setPendingLeavesCount] = useState(0);
  const [announcements, setAnnouncements] = useState([]);
  const [upcomingLeaves, setUpcomingLeaves] = useState([]);
  const [todayLeavesCount, setTodayLeavesCount] = useState(0);

  // SMTP Modal State (Admin)
  const [showSmtpModal, setShowSmtpModal] = useState(false);
  const [smtpForm, setSmtpForm] = useState({
    smtpUser: "",
    smtpPass: "",
    testEmail: "",
  });
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);

  // New features state
  const [totalPayroll, setTotalPayroll] = useState(0);
  const [punctualityRate, setPunctualityRate] = useState(100);

  const navigate = useNavigate();
  const currentMonth = getLocalMonthStr();
  const todayStr = getLocalDateStr();
  const today = new Date();

  const dateLabel = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  useEffect(() => {
    let cancelled = false;
    const fetchUserAndNotices = async () => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) return;

        const [freshUser, annList] = await Promise.all([
          fetchUserById(currentUser.uid),
          fetchAnnouncements(4),
        ]);
        if (cancelled) return;

        if (freshUser) {
          setUserData(freshUser);
        }
        setAnnouncements(annList);
      } catch (err) {
        if (err?.name !== "AbortError" && !cancelled) {
          setLoadError(err.message || "Could not load dashboard.");
        }
      }
    };
    fetchUserAndNotices();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!userData || userData.role !== "admin") return;
    let cancelled = false;

    const fetchAdminData = async () => {
      setEmpLoading(true);
      try {
        const [emps, todayAttList, monthAttList, allLeaves, smtpInfo] =
          await Promise.all([
            fetchUsers(),
            fetchAttendance({ date: todayStr }),
            fetchAttendance({ month: currentMonth }),
            fetchLeaves(),
            fetchSmtpSettings().catch(() => ({ configured: false })),
          ]);
        if (cancelled) return;

        setEmployees(emps);
        setTodayAtt(todayAttList);
        setSmtpConfigured(Boolean(smtpInfo?.configured));
        setSmtpForm((prev) => ({
          ...prev,
          smtpUser: smtpInfo?.smtpUser || "",
          testEmail: userData.email || "",
        }));

        let pCount = 0;
        let tLeaves = 0;
        const leavesByUid = {};

        allLeaves.forEach((data) => {
          if (data.status === "pending") pCount++;
          if (data.status === "approved") {
            (leavesByUid[data.uid] = leavesByUid[data.uid] || []).push(data);
            if (
              data.type === "leave" &&
              data.startDate <= todayStr &&
              data.endDate >= todayStr
            ) {
              tLeaves++;
            } else if (data.type === "earlyLeave" && data.date === todayStr) {
              tLeaves++;
            }
          }
        });

        setPendingLeavesCount(pCount);
        setTodayLeavesCount(tLeaves);

        const monthAttByUid = {};
        monthAttList.forEach((r) => {
          (monthAttByUid[r.uid] = monthAttByUid[r.uid] || []).push(r);
        });

        const statsMap = {};
        let payrollSum = 0;
        for (const emp of emps) {
          const empStat = calculateSalaryStats({
            records: monthAttByUid[emp.uid] || [],
            schedule: emp.schedule,
            baseSalary: Number(emp.salary) || 0,
            month: currentMonth,
            approvedLeaves: leavesByUid[emp.uid] || [],
          });
          statsMap[emp.uid] = empStat;
          payrollSum += empStat.netSalary || 0;
        }

        if (!cancelled) {
          setEmpStats(statsMap);
          setTotalPayroll(payrollSum);
        }
      } catch (err) {
        if (err?.name !== "AbortError") console.error("Home admin fetch:", err);
      } finally {
        if (!cancelled) setEmpLoading(false);
      }
    };
    fetchAdminData();
    return () => {
      cancelled = true;
    };
  }, [userData, currentMonth, todayStr]);

  useEffect(() => {
    if (!userData || userData.role === "admin") return;
    let cancelled = false;

    const fetchEmployeeStatus = async () => {
      try {
        const uid = userData.uid;
        const [todayRecs, monthRecs, approvedLeaves] = await Promise.all([
          fetchAttendance({ uid, date: todayStr }),
          fetchAttendance({ uid, month: currentMonth }),
          fetchLeaves({ uid, status: "approved" }),
        ]);
        if (cancelled) return;

        if (todayRecs.length > 0) {
          setMyTodayRecord(todayRecs[0]);
          setLateWarning(null);
        } else {
          const now = new Date();
          const { status, lateMinutes } = calculateAttendanceStatus(
            userData.schedule,
            now
          );
          if (status === "extreme-late") setLateWarning({ lateMinutes });
          else setLateWarning(null);
        }

        const up = approvedLeaves.filter(
          (l) => l.startDate >= todayStr || l.date >= todayStr
        );
        setUpcomingLeaves(up);

        let onTimeCount = 0;
        const totalCount = monthRecs.length;
        monthRecs.forEach((r) => {
          if (r.status === "on-time") onTimeCount++;
        });
        const punctuality =
          totalCount > 0 ? Math.round((onTimeCount / totalCount) * 100) : 100;
        setPunctualityRate(punctuality);

        const computedStats = calculateSalaryStats({
          records: monthRecs,
          schedule: userData.schedule,
          baseSalary: Number(userData.salary) || 0,
          month: currentMonth,
          approvedLeaves,
        });
        setMyMonthStats(computedStats);
      } catch (err) {
        if (err?.name !== "AbortError") console.error("Home emp fetch:", err);
      }
    };
    fetchEmployeeStatus();
    return () => {
      cancelled = true;
    };
  }, [userData, todayStr, currentMonth]);

  const handleAddNotice = async () => {
    const msg = window.prompt(
      "Enter announcement message for the team (All employees will also be notified via Email):"
    );
    if (!msg || !msg.trim()) return;
    try {
      const res = await createAnnouncement({
        message: msg.trim(),
        author: userData.name || "Admin",
      });
      const created = res.announcement || res;
      const emailStatus = res.emailStatus;
      setAnnouncements((prev) => [created, ...prev]);

      if (emailStatus?.sent) {
        window.alert(
          `✅ Announcement posted & Email sent to ${emailStatus.recipientsCount || "all"} user(s)!`
        );
      } else {
        window.alert(
          `📢 Announcement posted on Notice Board!\n\n⚠️ Email Notice: ${
            emailStatus?.reason ||
            "SMTP Email abhi set nahi hai. '⚙️ Email Settings' button par click kar ke apna Gmail aur Google App Password lagayein."
          }`
        );
        if (!smtpConfigured) {
          setShowSmtpModal(true);
        }
      }
    } catch (err) {
      window.alert("Error posting announcement: " + err.message);
    }
  };

  const handleDeleteNotice = async (annId) => {
    if (!window.confirm("Delete this announcement?")) return;
    try {
      await deleteAnnouncement(annId);
      setAnnouncements((prev) => prev.filter((a) => String(a.id) !== String(annId)));
    } catch (err) {
      window.alert("Error deleting announcement: " + err.message);
    }
  };

  const handleSaveSmtp = async (e) => {
    e.preventDefault();
    if (!smtpForm.smtpUser.trim() || !smtpForm.smtpPass.trim()) {
      window.alert("Apna Gmail address aur 16-digit Google App Password dono likhein.");
      return;
    }
    setSmtpSaving(true);
    try {
      const res = await saveSmtpSettings({
        smtpUser: smtpForm.smtpUser.trim(),
        smtpPass: smtpForm.smtpPass.trim(),
        testEmail: smtpForm.testEmail.trim() || userData.email,
      });
      if (res.emailStatus?.sent) {
        setSmtpConfigured(true);
        setShowSmtpModal(false);
        window.alert(
          `✅ Gmail SMTP Connected! Test email aap ke inbox (${
            smtpForm.testEmail || userData.email
          }) par bhej di gayi hai.`
        );
      } else {
        window.alert(
          `⚠️ Settings save ho gayin lekin test email fail hui:\n${
            res.emailStatus?.reason || res.emailStatus?.error || "Check your Google App Password"
          }\n\nNote: Gmail ka aam password nahi chalta, Google Account -> Security -> 2-Step Verification -> App Passwords se 16-character App Password bana kar dalein.`
        );
      }
    } catch (err) {
      window.alert("Error saving SMTP: " + err.message);
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleToggleRole = async (emp) => {
    const nextRole = emp.role === "admin" ? "employee" : "admin";
    if (
      !window.confirm(
        `Change ${displayNameFor(emp)}'s role to ${nextRole.toUpperCase()}?`
      )
    ) {
      return;
    }
    try {
      const updated = await updateUserById(emp.uid, { role: nextRole });
      setEmployees((prev) =>
        prev.map((e) => (e.uid === emp.uid ? updated : e))
      );
    } catch (err) {
      window.alert(err.message);
    }
  };

  const handleLogout = async () => {
    await apiLogout();
    navigate("/login");
  };

  if (!userData) {
    return (
      <div
        className="home-layout"
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        <p style={{ color: "rgba(240, 238, 255, 0.5)" }}>
          {loadError || "Loading dashboard..."}
        </p>
      </div>
    );
  }

  const isAdmin = userData.role === "admin";
  const initial = (userData.name || "U").charAt(0).toUpperCase();

  const totalEmps = employees.length || 1;
  const onTimeCount = todayAtt.filter((r) => r.status === "on-time").length;
  const lateCount = todayAtt.filter(
    (r) => r.status === "late" || r.status === "extreme-late"
  ).length;
  const leaveCount = todayLeavesCount;
  const absentOrPending = Math.max(
    totalEmps - (onTimeCount + lateCount + leaveCount),
    0
  );

  const pOnTime = (onTimeCount / totalEmps) * 100;
  const pLate = (lateCount / totalEmps) * 100;
  const pLeave = (leaveCount / totalEmps) * 100;

  return (
    <div className="home-layout">
      {/* ── SIDEBAR ── */}
      <aside className="home-sidebar">
        <div className="home-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Portal
        </div>
        <nav className="home-nav">
          <p className="home-nav-heading">Main Menu</p>
          <button className="home-nav-btn active" onClick={() => navigate("/")}>
            Dashboard
          </button>
          <button
            className="home-nav-btn"
            onClick={() =>
              navigate(isAdmin ? "/daily-attendance" : "/mark-attendance")
            }
          >
            {isAdmin ? "Check-in Sheet" : "Today's Status"}
          </button>
          <button
            className="home-nav-btn"
            onClick={() => navigate("/my-attendance")}
          >
            My Attendance
          </button>
          <button
            className="home-nav-btn"
            onClick={() => navigate("/leave-request")}
          >
            Leave / Early Leave
          </button>
          <button
            className="home-nav-btn"
            onClick={() => navigate("/profile")}
          >
            My Profile
          </button>
          {isAdmin && (
            <>
              <p className="home-nav-heading" style={{ marginTop: "24px" }}>
                Admin Tools
              </p>
              <button
                className="home-nav-btn"
                onClick={() => navigate("/employee-attendance")}
              >
                All Attendance
              </button>
              <button
                className="home-nav-btn"
                onClick={() => navigate("/manage-schedule")}
              >
                Manage Schedule
              </button>
              <button
                className="home-nav-btn"
                onClick={() => navigate("/manage-salary")}
              >
                Salaries & Payroll
              </button>
              <button
                className="home-nav-btn"
                onClick={() => navigate("/manage-leaves")}
              >
                Leave Approvals
              </button>
            </>
          )}
        </nav>
        <div className="home-profile-sec">
          <div
            className="home-profile-info"
            style={{ cursor: "pointer" }}
            onClick={() => navigate("/profile")}
            title="Open My Profile"
          >
            {userData.photoURL ? (
              <img
                src={userData.photoURL}
                alt={userData.name}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "1.5px solid #a78bfa",
                }}
              />
            ) : (
              <div className="home-profile-avatar">{initial}</div>
            )}
            <div className="home-profile-text">
              <span className="home-profile-name">{userData.name}</span>
              <span className="home-profile-role">
                {isAdmin ? "Admin" : "Employee"}
              </span>
            </div>
          </div>
          <button className="home-logout-btn" onClick={handleLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Log out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="home-main">
        <header className="home-header">
          <div>
            <h1>
              {getGreeting()}, {userData.name?.split(" ")[0] || "User"}!
            </h1>
            <p>{dateLabel}</p>
          </div>
          {isAdmin ? (
            <div className="home-header-stat">
              <span className="stat-label">Estimated Payroll ({currentMonth})</span>
              <span className="stat-value">
                Rs. {Math.round(totalPayroll).toLocaleString()}
              </span>
            </div>
          ) : (
            myMonthStats && (
              <div className="home-header-stat">
                <span className="stat-label">My Net Salary ({currentMonth})</span>
                <span className="stat-value">
                  Rs. {Math.round(myMonthStats.netSalary ?? 0).toLocaleString()}
                </span>
              </div>
            )
          )}
        </header>

        {/* Quick Actions (Admin Only) */}
        {isAdmin && (
          <div className="home-quick-actions">
            <button
              onClick={() => navigate("/manage-leaves")}
              className="quick-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 12l2 2 4-4M5 4h14v16H5z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Leaves
              {pendingLeavesCount > 0 && (
                <span className="quick-badge">{pendingLeavesCount}</span>
              )}
            </button>
            <button
              onClick={() => navigate("/daily-attendance")}
              className="quick-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M12 7v5l3 3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Mark Today
            </button>
            <button
              onClick={() => navigate("/manage-salary")}
              className="quick-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect
                  x="2"
                  y="6"
                  width="20"
                  height="12"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="2"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
              Payroll & Slips
            </button>
            <button
              onClick={() => setShowSmtpModal(true)}
              className="quick-btn"
              style={{
                borderColor: smtpConfigured
                  ? "rgba(74, 222, 128, 0.4)"
                  : "rgba(251, 191, 36, 0.45)",
              }}
            >
              📧 {smtpConfigured ? "Email Connected" : "Setup Email Alerts"}
            </button>
          </div>
        )}

        {/* Dashboard Widgets Grid */}
        <div className="home-widgets-grid">
          {isAdmin ? (
            <div className="home-widget chart-widget">
              <h3>Today's Overview</h3>
              <div className="chart-container">
                <div
                  className="donut-chart"
                  style={{
                    background: `conic-gradient(
                      #a78bfa 0% ${pOnTime}%, 
                      #6d3aff ${pOnTime}% ${pOnTime + pLate}%, 
                      rgba(255,255,255,0.3) ${pOnTime + pLate}% ${pOnTime + pLate + pLeave}%, 
                      rgba(255,255,255,0.05) ${pOnTime + pLate + pLeave}% 100%
                    )`,
                  }}
                >
                  <div className="donut-inner">
                    <span>{todayAtt.length}</span>
                    <small>Marked</small>
                  </div>
                </div>
                <div className="chart-legend">
                  <div className="legend-item">
                    <span className="dot dot-ontime"></span> On Time ({onTimeCount})
                  </div>
                  <div className="legend-item">
                    <span className="dot dot-late"></span> Late ({lateCount})
                  </div>
                  <div className="legend-item">
                    <span className="dot dot-leave"></span> On Leave ({leaveCount})
                  </div>
                  <div className="legend-item">
                    <span className="dot dot-absent"></span> Pending/Absent (
                    {absentOrPending})
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="home-widget">
              <h3>Your Today's Status</h3>
              {myTodayRecord ? (
                <div className="home-my-status">
                  <div className="status-circle status-success">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M20 6L9 17l-5-5"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h4>You're checked in</h4>
                  <p>Marked at {formatTime12(myTodayRecord.checkInTime)}</p>
                </div>
              ) : (
                <div className="home-my-status">
                  <div className="status-circle status-pending">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <path
                        d="M12 7v5l3 3"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <h4>Not marked yet</h4>
                  <p>Your admin will mark you when you arrive.</p>
                  {lateWarning && (
                    <p className="late-alert-text">
                      Extreme late window active ({lateWarning.lateMinutes}m past
                      grace).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="home-widget notice-widget">
            <div className="widget-header">
              <h3>Notice Board</h3>
              {isAdmin && (
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    className="add-notice-btn"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      borderColor: "rgba(255,255,255,0.15)",
                    }}
                    onClick={() => setShowSmtpModal(true)}
                    title="Configure Gmail SMTP for Email Notifications"
                  >
                    ⚙️ Email
                  </button>
                  <button className="add-notice-btn" onClick={handleAddNotice}>
                    + Add
                  </button>
                </div>
              )}
            </div>
            <div className="notice-list">
              {announcements.length === 0 ? (
                <p className="empty-text">No announcements yet.</p>
              ) : (
                announcements.map((ann, i) => (
                  <div
                    className="notice-card"
                    key={ann.id || i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", gap: "10px", flex: 1 }}>
                      <div className="notice-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                      <div className="notice-content">
                        <p>{ann.message}</p>
                        <small>
                          By {ann.author} ·{" "}
                          {ann.createdAt
                            ? new Date(ann.createdAt).toLocaleDateString()
                            : "Just now"}
                        </small>
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteNotice(ann.id)}
                        title="Delete announcement"
                        style={{
                          background: "rgba(239, 68, 68, 0.16)",
                          border: "1px solid rgba(239, 68, 68, 0.4)",
                          color: "#f87171",
                          borderRadius: "7px",
                          width: "30px",
                          height: "30px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {!isAdmin && (
            <div className="home-widget upcoming-widget">
              <div className="widget-header">
                <h3>Punctuality & Leaves</h3>
              </div>
              <div className="punctuality-card">
                <div className="punctuality-info">
                  <span className="punctuality-label">Month's Score</span>
                  <span className="punctuality-value">{punctualityRate}%</span>
                </div>
                <div className="punctuality-bar">
                  <div
                    className="punctuality-fill"
                    style={{ width: `${punctualityRate}%` }}
                  ></div>
                </div>
              </div>
              <h4 className="upcoming-title">Upcoming Approved Leaves</h4>
              <div className="upcoming-list">
                {upcomingLeaves.length === 0 ? (
                  <p className="empty-text">No upcoming leaves.</p>
                ) : (
                  upcomingLeaves.map((l, i) => (
                    <div className="upcoming-card" key={i}>
                      <span className="upcoming-type">
                        {l.type === "earlyLeave" ? "Early Leave" : "Leave"}
                      </span>
                      <span className="upcoming-date">
                        {l.type === "earlyLeave"
                          ? l.date
                          : `${l.startDate} to ${l.endDate}`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── EMPLOYEE MONTHLY SALARY, LATES, OFFS & DEDUCTION DASHBOARD SECTION ── */}
        {!isAdmin && myMonthStats && (
          <section className="home-section" style={{ marginBottom: "40px" }}>
            <div className="home-dir-header" style={{ marginBottom: "16px" }}>
              <h2 className="home-section-title" style={{ margin: 0 }}>
                My Monthly Attendance & Salary Summary — {currentMonth}
              </h2>
              <button
                onClick={() =>
                  exportEmployeeSalarySlipPDF({
                    employee: userData,
                    stats: myMonthStats,
                    month: currentMonth,
                  })
                }
                style={{
                  background: "linear-gradient(135deg, #6d3aff, #a78bfa)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  padding: "9px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                📄 Download My Salary Slip PDF (with Logo)
              </button>
            </div>

            <div className="home-emp-grid">
              <div className="home-emp-card">
                <div className="home-emp-header">
                  <span className="home-emp-avatar">₨</span>
                  <span className="home-emp-name">Salary Calculation</span>
                </div>
                <div className="home-emp-net">
                  <span className="home-emp-net-label">Net Salary ({currentMonth})</span>
                  <span className="home-emp-net-value">
                    Rs. {Math.round(myMonthStats.netSalary ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="home-emp-stats">
                  <div className="home-emp-stat">
                    <span className="home-emp-stat-label">Base Salary</span>
                    <span className="home-emp-stat-value">
                      Rs. {Math.round(Number(userData.salary) || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="home-emp-stat">
                    <span className="home-emp-stat-label">Total Salary Cut</span>
                    <span className="home-emp-stat-value" style={{ color: "#f87171" }}>
                      - Rs. {Math.round(myMonthStats.deduction ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="home-emp-stat">
                    <span className="home-emp-stat-label">Per-Day Rate</span>
                    <span className="home-emp-stat-value">
                      Rs. {Math.round(myMonthStats.perDayRate ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="home-emp-stat">
                    <span className="home-emp-stat-label">Working Days</span>
                    <span className="home-emp-stat-value">
                      {myMonthStats.workingDaysInMonth ?? 0} days
                    </span>
                  </div>
                </div>
              </div>

              <div className="home-emp-card">
                <div className="home-emp-header">
                  <span className="home-emp-avatar">📅</span>
                  <span className="home-emp-name">Lates & Offs Record</span>
                </div>
                <div className="home-emp-net">
                  <span className="home-emp-net-label">
                    Total Off-Equivalents (2 Free Offs Allowed)
                  </span>
                  <span className="home-emp-net-value">
                    {myMonthStats.offEquivalents ?? 0} Offs ({myMonthStats.deductibleOffs ?? 0} Deductible)
                  </span>
                </div>
                <div className="home-emp-stats">
                  <div className="home-emp-stat">
                    <span className="home-emp-stat-label">Present / On-Time</span>
                    <span className="home-emp-stat-value">
                      {myMonthStats.presentCount ?? 0} / {myMonthStats.onTimeCount ?? 0}
                    </span>
                  </div>
                  <div className="home-emp-stat">
                    <span className="home-emp-stat-label">Lates (3 = 1 Off)</span>
                    <span className="home-emp-stat-value">
                      {myMonthStats.lateCount ?? 0} ({myMonthStats.offFromLates ?? 0} Off)
                    </span>
                  </div>
                  <div className="home-emp-stat">
                    <span className="home-emp-stat-label">Extreme Lates</span>
                    <span className="home-emp-stat-value">
                      {myMonthStats.extremeLateCount ?? 0} ({myMonthStats.extremeLateCount ?? 0} Off)
                    </span>
                  </div>
                  <div className="home-emp-stat">
                    <span className="home-emp-stat-label">Absents / Early Leave</span>
                    <span className="home-emp-stat-value">
                      {myMonthStats.absentCount ?? 0} / {myMonthStats.earlyLeaveCount ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── ADMIN EMPLOYEE SALARIES SECTION ── */}
        {isAdmin && (
          <section className="home-section" style={{ marginBottom: "40px" }}>
            <h2 className="home-section-title">
              Employee Salaries — {currentMonth}
            </h2>
            {empLoading ? (
              <p style={{ fontSize: "13px", color: "rgba(240,238,255,0.5)" }}>
                Loading...
              </p>
            ) : employees.length === 0 ? (
              <p style={{ fontSize: "13px", color: "rgba(240,238,255,0.5)" }}>
                No employees found yet.
              </p>
            ) : (
              <div className="home-emp-grid">
                {employees.map((emp) => {
                  const s = empStats[emp.uid] || {};
                  const empInitial = displayNameFor(emp)
                    .charAt(0)
                    .toUpperCase();
                  return (
                    <div className="home-emp-card" key={emp.uid}>
                      <div className="home-emp-header" style={{ justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          {emp.photoURL ? (
                            <img
                              src={emp.photoURL}
                              alt={displayNameFor(emp)}
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <span className="home-emp-avatar">{empInitial}</span>
                          )}
                          <span className="home-emp-name">
                            {displayNameFor(emp)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            exportEmployeeSalarySlipPDF({
                              employee: emp,
                              stats: s,
                              month: currentMonth,
                            })
                          }
                          style={{
                            background: "rgba(167,139,250,0.16)",
                            border: "1px solid rgba(167,139,250,0.35)",
                            color: "#e9d5ff",
                            borderRadius: "6px",
                            padding: "4px 8px",
                            fontSize: "11px",
                            cursor: "pointer",
                          }}
                          title="Download PDF Salary Slip"
                        >
                          PDF Slip
                        </button>
                      </div>
                      <div className="home-emp-net">
                        <span className="home-emp-net-label">Net Salary</span>
                        <span className="home-emp-net-value">
                          Rs. {Math.round(s.netSalary ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="home-emp-stats">
                        <div className="home-emp-stat">
                          <span className="home-emp-stat-label">Base</span>
                          <span className="home-emp-stat-value">
                            Rs. {Number(emp.salary) || 0}
                          </span>
                        </div>
                        <div className="home-emp-stat">
                          <span className="home-emp-stat-label">Deducted</span>
                          <span className="home-emp-stat-value">
                            Rs. {(s.deduction ?? 0).toFixed(0)}
                          </span>
                        </div>
                        <div className="home-emp-stat">
                          <span className="home-emp-stat-label">
                            Late/Absent
                          </span>
                          <span className="home-emp-stat-value">
                            {s.lateCount ?? 0} / {s.absentCount ?? 0}
                          </span>
                        </div>
                        <div className="home-emp-stat">
                          <span className="home-emp-stat-label">Offs</span>
                          <span className="home-emp-stat-value">
                            {s.offEquivalents ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── ADMIN ALL EMPLOYEES DIRECTORY ── */}
        {isAdmin && (
          <section className="home-section">
            <div className="home-dir-header">
              <h2 className="home-section-title" style={{ margin: 0 }}>
                All Employees Directory
              </h2>
              {employees.length > 0 && (
                <div className="home-export-bar">
                  <button
                    onClick={() =>
                      exportDirectoryToCSV(employees, "employee-directory")
                    }
                  >
                    CSV
                  </button>
                  <button
                    onClick={() =>
                      exportDirectoryToExcel(employees, "employee-directory")
                    }
                  >
                    Excel
                  </button>
                  <button
                    onClick={() =>
                      exportDirectoryToPDF(employees, "employee-directory")
                    }
                  >
                    PDF
                  </button>
                  <button
                    onClick={() => printElement("employee-directory-table")}
                  >
                    Print
                  </button>
                </div>
              )}
            </div>
            {empLoading ? (
              <p style={{ fontSize: "13px", color: "rgba(240,238,255,0.5)" }}>
                Loading...
              </p>
            ) : employees.length === 0 ? (
              <p style={{ fontSize: "13px", color: "rgba(240,238,255,0.5)" }}>
                No employees found yet.
              </p>
            ) : (
              <div className="home-dir-card">
                <div id="employee-directory-table" className="home-dir-scroll">
                  <table className="home-dir-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Phone</th>
                        <th>CNIC</th>
                        <th>DOB</th>
                        <th>Address</th>
                        <th>Payment</th>
                        <th>Bank</th>
                        <th>Acc Title</th>
                        <th>Acc Number</th>
                        <th data-no-print>Admin Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp) => (
                        <tr key={emp.uid}>
                          <td>{displayNameFor(emp)}</td>
                          <td>{emp.email || "—"}</td>
                          <td>
                            <span
                              style={{
                                cursor: "pointer",
                                textDecoration: "underline",
                                color:
                                  emp.role === "admin" ? "#a78bfa" : "inherit",
                              }}
                              title="Click to switch role (Admin / Employee)"
                              onClick={() => handleToggleRole(emp)}
                            >
                              {emp.role || "employee"}
                            </span>
                          </td>
                          <td>{emp.personalInfo?.phone || "—"}</td>
                          <td>{emp.personalInfo?.cnic || "—"}</td>
                          <td>{emp.personalInfo?.dob || "—"}</td>
                          <td>{emp.personalInfo?.address || "—"}</td>
                          <td>{emp.bankDetails?.method || "—"}</td>
                          <td>{emp.bankDetails?.providerName || "—"}</td>
                          <td>{emp.bankDetails?.accountTitle || "—"}</td>
                          <td>{emp.bankDetails?.accountNumber || "—"}</td>
                          <td data-no-print>
                            <button
                              type="button"
                              onClick={() => navigate(`/profile?uid=${emp.uid}`)}
                              style={{
                                background: "rgba(109,58,255,0.22)",
                                border: "1px solid rgba(167,139,250,0.4)",
                                color: "#e9d5ff",
                                padding: "4px 10px",
                                borderRadius: "6px",
                                fontSize: "11.5px",
                                cursor: "pointer",
                              }}
                            >
                              Edit Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── ADMIN EMAIL / SMTP SETTINGS MODAL ── */}
        {showSmtpModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.72)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "16px",
            }}
          >
            <div
              style={{
                background: "#161229",
                border: "1px solid rgba(167,139,250,0.35)",
                borderRadius: "16px",
                maxWidth: "460px",
                width: "100%",
                padding: "24px",
                color: "#f0eeff",
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "18px" }}>
                📧 Setup Email Notifications (Gmail SMTP)
              </h3>
              <p style={{ fontSize: "12.5px", color: "rgba(240,238,255,0.65)", lineHeight: 1.5 }}>
                Announcement aur Leave Requests ki real emails bhejne ke liye apna{" "}
                <strong>Gmail Address</strong> aur{" "}
                <strong>16-Digit Google App Password</strong> (Google Account ➔ Security ➔ 2-Step Verification ➔ App Passwords) dalein:
              </p>

              <form onSubmit={handleSaveSmtp} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "14px" }}>
                <label style={{ fontSize: "12.5px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  Sender Gmail Address (SMTP_USER)
                  <input
                    type="email"
                    placeholder="your.email@gmail.com"
                    value={smtpForm.smtpUser}
                    onChange={(e) =>
                      setSmtpForm((prev) => ({ ...prev, smtpUser: e.target.value }))
                    }
                    required
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      color: "#fff",
                    }}
                  />
                </label>

                <label style={{ fontSize: "12.5px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  16-Digit Google App Password (SMTP_PASS)
                  <input
                    type="password"
                    placeholder="xxxx xxxx xxxx xxxx"
                    value={smtpForm.smtpPass}
                    onChange={(e) =>
                      setSmtpForm((prev) => ({ ...prev, smtpPass: e.target.value }))
                    }
                    required
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      color: "#fff",
                    }}
                  />
                </label>

                <label style={{ fontSize: "12.5px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  Send Test Email To
                  <input
                    type="email"
                    placeholder="recipient@gmail.com"
                    value={smtpForm.testEmail}
                    onChange={(e) =>
                      setSmtpForm((prev) => ({ ...prev, testEmail: e.target.value }))
                    }
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      color: "#fff",
                    }}
                  />
                </label>

                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setShowSmtpModal(false)}
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "none",
                      color: "#fff",
                      padding: "9px 16px",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={smtpSaving}
                    style={{
                      background: "linear-gradient(135deg, #6d3aff, #a78bfa)",
                      border: "none",
                      color: "#fff",
                      padding: "9px 18px",
                      borderRadius: "8px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {smtpSaving ? "Testing & Saving..." : "Save & Send Test Email"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Home;
