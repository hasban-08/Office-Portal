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
  fetchPolicies,
  fetchHolidays,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
        const [emps, todayAttList, monthAttList, allLeaves, smtpInfo, activePolicies, holidayList] =
          await Promise.all([
            fetchUsers(),
            fetchAttendance({ date: todayStr }),
            fetchAttendance({ month: currentMonth }),
            fetchLeaves(),
            fetchSmtpSettings().catch(() => ({ configured: false })),
            fetchPolicies().catch(() => null),
            fetchHolidays().catch(() => []),
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
            policies: activePolicies,
            holidays: holidayList,
            isAttendanceExempt: Boolean(emp.isAttendanceExempt),
          });
          statsMap[emp.uid] = empStat;
          payrollSum += empStat.netSalary || 0;
        }

        if (!cancelled) {
          setEmpStats(statsMap);
          setTotalPayroll(payrollSum);

          const myRecToday = todayAttList.find((r) => r.uid === userData.uid) || null;
          setMyTodayRecord(myRecToday);
          setMyMonthStats(statsMap[userData.uid] || null);

          const myApproved = leavesByUid[userData.uid] || [];
          setUpcomingLeaves(
            myApproved.filter((l) => l.startDate >= todayStr || l.date >= todayStr)
          );
          const myRecs = monthAttByUid[userData.uid] || [];
          const myOnTime = myRecs.filter((r) => r.status === "on-time").length;
          setPunctualityRate(
            myRecs.length > 0 ? Math.round((myOnTime / myRecs.length) * 100) : 100
          );
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
        const [todayRecs, monthRecs, approvedLeaves, activePolicies, holidayList] = await Promise.all([
          fetchAttendance({ uid, date: todayStr }),
          fetchAttendance({ uid, month: currentMonth }),
          fetchLeaves({ uid, status: "approved" }),
          fetchPolicies().catch(() => null),
          fetchHolidays().catch(() => []),
        ]);
        if (cancelled) return;

        if (todayRecs.length > 0) {
          setMyTodayRecord(todayRecs[0]);
          setLateWarning(null);
        } else {
          const now = new Date();
          const { status, lateMinutes } = calculateAttendanceStatus(
            userData.schedule,
            now,
            activePolicies
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
          policies: activePolicies,
          holidays: holidayList,
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
          `Announcement posted & Email sent to ${emailStatus.recipientsCount || "all"} user(s)!`
        );
      } else {
        window.alert(
          `Announcement posted on Notice Board!\n\nEmail Notice: ${
            emailStatus?.reason ||
            "SMTP Email abhi set nahi hai. 'Email Settings' button par click kar ke apna Gmail aur Google App Password lagayein."
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
          `Gmail SMTP Connected! Test email aap ke inbox (${
            smtpForm.testEmail || userData.email
          }) par bhej di gayi hai.`
        );
      } else {
        window.alert(
          `Settings save ho gayin lekin test email fail hui:\n${
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
  const isBoss =
    String(userData.designation || "").toLowerCase() === "boss";
  const showAdminView = isAdmin;
  const initial = (userData.name || "U").charAt(0).toUpperCase();

  const attendanceEmployees = employees.filter((e) => !e.isAttendanceExempt);
  const totalEmps = attendanceEmployees.length || 1;
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
      {/* ── MOBILE TOP BAR (HAMBURGER) ── */}
      <div className="home-mobile-bar">
        <img
          src="/company-logo.webp"
          alt="The Nexus Group Co"
          style={{
            maxHeight: "30px",
            maxWidth: "145px",
            width: "auto",
            objectFit: "contain",
          }}
        />
        <button
          type="button"
          className="home-hamburger-btn"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* ── SIDEBAR ── */}
      <aside className={`home-sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="home-logo" style={{ padding: "4px 0" }}>
          <img
            src="/company-logo.webp"
            alt="The Nexus Group Co"
            style={{
              maxHeight: "36px",
              maxWidth: "160px",
              width: "auto",
              objectFit: "contain",
            }}
          />
          <button
            type="button"
            className="home-sidebar-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <nav className="home-nav">
          <p className="home-nav-heading">Main Menu</p>
          <button
            className="home-nav-btn active"
            onClick={() => {
              setMobileMenuOpen(false);
              navigate("/");
            }}
          >
            Dashboard
          </button>
          <button
            className="home-nav-btn"
            onClick={() => {
              setMobileMenuOpen(false);
              navigate(isAdmin ? "/daily-attendance" : "/mark-attendance");
            }}
          >
            {isAdmin ? "Check-in Sheet" : "Today's Status"}
          </button>
          <button
            className="home-nav-btn"
            onClick={() => {
              setMobileMenuOpen(false);
              navigate("/my-attendance");
            }}
          >
            My Attendance
          </button>
          <button
            className="home-nav-btn"
            onClick={() => {
              setMobileMenuOpen(false);
              navigate("/leave-request");
            }}
          >
            Leave / Early Leave
          </button>
          <button
            className="home-nav-btn"
            onClick={() => {
              setMobileMenuOpen(false);
              navigate("/profile");
            }}
          >
            My Profile
          </button>
          {isAdmin && (
            <>
              <p className="home-nav-heading" style={{ marginTop: "20px" }}>
                Admin Tools
              </p>
              <button
                className="home-nav-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate("/employee-status");
                }}
              >
                Employee Status
              </button>
              <button
                className="home-nav-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate("/company-policies");
                }}
              >
                Company Policies
              </button>
              <button
                className="home-nav-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate("/employee-attendance");
                }}
              >
                All Attendance
              </button>
              <button
                className="home-nav-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate("/manage-schedule");
                }}
              >
                Manage Schedule
              </button>
              <button
                className="home-nav-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate("/manage-salary");
                }}
              >
                Salaries & Payroll
              </button>
              <button
                className="home-nav-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate("/manage-leaves");
                }}
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
            onClick={() => {
              setMobileMenuOpen(false);
              navigate("/profile");
            }}
            title="Open My Profile"
          >
            {userData.photoURL ? (
              <img
                src={userData.photoURL}
                alt={userData.name}
                style={{
                  width: "34px",
                  height: "34px",
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
              <span
                className="home-profile-role"
                style={
                  isBoss
                    ? { color: "#fde047", fontWeight: 700, letterSpacing: "0.4px" }
                    : undefined
                }
              >
                {isBoss ? "Boss" : isAdmin ? "Admin" : "Employee"}
              </span>
            </div>
          </div>
          <button className="home-logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="home-main">
        <header className="home-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h1>
                {getGreeting()}, {userData.name?.split(" ")[0] || "User"}!
              </h1>
              {isBoss && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    background: "rgba(250, 204, 21, 0.16)",
                    border: "1px solid rgba(250, 204, 21, 0.45)",
                    color: "#fde047",
                    padding: "3px 10px",
                    borderRadius: "999px",
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                  }}
                >
                  Boss
                </span>
              )}
            </div>
            <p>{dateLabel}</p>
          </div>
          {showAdminView ? (
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
        {showAdminView && (
          <div className="home-quick-actions">
            <button
              onClick={() => navigate("/manage-leaves")}
              className="quick-btn"
            >
              Leaves
              {pendingLeavesCount > 0 && (
                <span className="quick-badge">{pendingLeavesCount}</span>
              )}
            </button>
            <button
              onClick={() => navigate("/daily-attendance")}
              className="quick-btn"
            >
              Mark Today
            </button>
            <button
              onClick={() => navigate("/manage-salary")}
              className="quick-btn"
            >
              Payroll & Slips
            </button>
            <button
              onClick={() => navigate("/employee-status")}
              className="quick-btn"
            >
              Employee Status
            </button>
            <button
              onClick={() => navigate("/company-policies")}
              className="quick-btn"
            >
              Company Policies
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
              {smtpConfigured ? "Email Connected" : "Setup Email Alerts"}
            </button>
          </div>
        )}

        {/* Dashboard Widgets Grid */}
        <div className="home-widgets-grid">
          {showAdminView ? (
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
                      <span className="dot dot-absent"></span> Pending / Absent ({absentOrPending})
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="home-widget">
                <div className="widget-header">
                  <h3>Today's Check-in Status</h3>
                  <span style={{ fontSize: "12px", color: "rgba(240,238,255,0.45)" }}>
                    {todayStr}
                  </span>
                </div>
                {myTodayRecord ? (
                  <div className="home-my-status">
                    <div className="status-circle status-success">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M20 6L9 17l-5-5"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <h4>Checked In</h4>
                    <p>Marked at {formatTime12(myTodayRecord.checkInTime)}</p>
                  </div>
                ) : (
                  <div className="home-my-status">
                    <div className="status-circle status-pending">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
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
                    <h4>Not Marked Yet</h4>
                    <p>Your admin will mark you when you arrive.</p>
                    {lateWarning && (
                      <p className="late-alert-text">
                        Late window active ({lateWarning.lateMinutes}m past grace).
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
                        background: "rgba(255,255,255,0.05)",
                        borderColor: "rgba(255,255,255,0.14)",
                      }}
                      onClick={() => setShowSmtpModal(true)}
                      title="Configure Gmail SMTP for Email Notifications"
                    >
                      Email Settings
                    </button>
                    <button className="add-notice-btn" onClick={handleAddNotice}>
                      + Post Notice
                    </button>
                  </div>
                )}
              </div>
              <div className="notice-list">
                {announcements.length === 0 ? (
                  <p className="empty-text">No announcements posted yet.</p>
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
                            background: "rgba(239, 68, 68, 0.14)",
                            border: "1px solid rgba(239, 68, 68, 0.35)",
                            color: "#f87171",
                            borderRadius: "7px",
                            padding: "4px 10px",
                            fontSize: "11.5px",
                            fontWeight: 600,
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {!showAdminView && (
              <div className="home-widget upcoming-widget">
                <div className="widget-header">
                  <h3>Punctuality & Leaves</h3>
                </div>
                <div className="punctuality-card">
                  <div className="punctuality-info">
                    <span className="punctuality-label">On-Time Punctuality</span>
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
                          {l.type === "earlyLeave" ? "Early Leave" : "Full Leave"}
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
          {!showAdminView && myMonthStats && (
            <section className="home-section">
              <div className="home-dir-header">
                <h2 className="home-section-title" style={{ margin: 0 }}>
                  Monthly Attendance, Offs & Salary Breakdown — {currentMonth}
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
                    padding: "9px 18px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Download My Salary Slip PDF
                </button>
              </div>

              <div className="home-emp-breakdown-grid">
                {/* Left Card: Salary Statement */}
                <div className="home-widget">
                  <div className="widget-header">
                    <h3>Salary & Deduction Statement</h3>
                    <span style={{ fontSize: "12px", color: "#c4b5fd", fontWeight: 600 }}>
                      {currentMonth}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div className="home-clean-row">
                      <span style={{ color: "rgba(240,238,255,0.65)" }}>Base Monthly Salary</span>
                      <strong>
                        Rs. {Math.round(Number(userData.salary) || 0).toLocaleString()}
                      </strong>
                    </div>
                    <div className="home-clean-row">
                      <span style={{ color: "rgba(240,238,255,0.65)" }}>
                        Scheduled Working Days ({currentMonth})
                      </span>
                      <strong>
                        {myMonthStats.workingDaysInMonth ?? 0} Days (Rs.{" "}
                        {Math.round(myMonthStats.perDayRate ?? 0).toLocaleString()}/day)
                      </strong>
                    </div>
                    <div className="home-clean-row">
                      <span style={{ color: "rgba(240,238,255,0.65)" }}>
                        Days Present (On-Time / Late)
                      </span>
                      <strong>
                        {myMonthStats.presentCount ?? 0} Present ({myMonthStats.onTimeCount ?? 0}{" "}
                        On-Time, {myMonthStats.lateCount ?? 0} Late)
                      </strong>
                    </div>
                    <div className="home-clean-row">
                      <span style={{ color: "rgba(240,238,255,0.65)" }}>
                        Total Salary Deduction (Katoti)
                      </span>
                      <strong
                        style={{
                          color: (myMonthStats.deduction ?? 0) > 0 ? "#f87171" : "#4ade80",
                        }}
                      >
                        {(myMonthStats.deduction ?? 0) > 0
                          ? `- Rs. ${Math.round(myMonthStats.deduction).toLocaleString()}`
                          : "Rs. 0 (No Cut)"}
                      </strong>
                    </div>
                    <div className="home-clean-row home-clean-row-highlight">
                      <span style={{ fontWeight: 700, color: "#fff" }}>
                        Net Payable Salary ({currentMonth})
                      </span>
                      <strong style={{ fontSize: "16px", color: "#fff" }}>
                        Rs. {Math.round(myMonthStats.netSalary ?? 0).toLocaleString()}
                      </strong>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "14px",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      background:
                        (myMonthStats.deduction ?? 0) > 0
                          ? "rgba(239, 68, 68, 0.1)"
                          : "rgba(74, 222, 128, 0.08)",
                      border:
                        (myMonthStats.deduction ?? 0) > 0
                          ? "1px solid rgba(239, 68, 68, 0.3)"
                          : "1px solid rgba(74, 222, 128, 0.25)",
                      fontSize: "12.5px",
                      lineHeight: 1.55,
                      color: "#f0eeff",
                    }}
                  >
                    {(myMonthStats.deduction ?? 0) > 0 ? (
                      <>
                        <strong style={{ color: "#fca5a5" }}>
                          Salary Deduction: Rs. {Math.round(myMonthStats.deduction).toLocaleString()}
                        </strong>
                        <br />
                        Aap ki Total <strong>{myMonthStats.offEquivalents} Off(s)</strong> mein se{" "}
                        <strong>{myMonthStats.freeOffsAllowed} Free Offs</strong> minus karne ke baad{" "}
                        <strong>{myMonthStats.deductibleOffs} Off(s)</strong> par Rs.{" "}
                        {Math.round(myMonthStats.perDayRate).toLocaleString()}/day ke hisab se katoti
                        hui hai.
                      </>
                    ) : (
                      <>
                        <strong style={{ color: "#86efac" }}>
                          Koi Salary Deduction Nahi Hui (Rs. 0 Cut)
                        </strong>
                        <br />
                        {(myMonthStats.offEquivalents ?? 0) > 0 ? (
                          <>
                            Aap ki <strong>{myMonthStats.lateCount} Lates</strong> se{" "}
                            <strong>{myMonthStats.offFromLates} Off(s)</strong> aur{" "}
                            <strong>{myMonthStats.absentCount} Absent</strong> se total{" "}
                            <strong>{myMonthStats.offEquivalents} Off(s)</strong> bani hain, jo
                            Company ke <strong>{myMonthStats.freeOffsAllowed} Free Offs</strong>{" "}
                            quota mein cover ho gayi hain.
                          </>
                        ) : (
                          <>Aap ki is mahine abhi tak koi Off ya Salary Deduction nahi hai.</>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Right Card: Offs Calculation & Exact Late Dates */}
                <div className="home-widget">
                  <div className="widget-header">
                    <h3>How Your Offs Are Calculated</h3>
                    <span style={{ fontSize: "12px", color: "rgba(240,238,255,0.5)" }}>
                      Policy: {myMonthStats.latesPerOff} Lates = 1 Off
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div className="home-clean-row">
                      <span>
                        1. Lates Penalty ({myMonthStats.latesPerOff} Lates = 1 Off)
                      </span>
                      <strong style={{ color: "#fde047" }}>
                        {myMonthStats.lateCount ?? 0} Lates = {myMonthStats.offFromLates ?? 0} Off(s)
                      </strong>
                    </div>

                    <div className="home-clean-row">
                      <span>2. Unapproved Absents (1 Absent = 1 Off)</span>
                      <strong
                        style={{
                          color: (myMonthStats.absentCount ?? 0) > 0 ? "#f87171" : "#f0eeff",
                        }}
                      >
                        {myMonthStats.absentCount ?? 0} Absent = {myMonthStats.absentCount ?? 0} Off(s)
                      </strong>
                    </div>

                    <div className="home-clean-row home-clean-row-highlight">
                      <span>
                        3. Total Offs ({myMonthStats.offFromLates ?? 0} Late Off +{" "}
                        {myMonthStats.absentCount ?? 0} Absent)
                      </span>
                      <strong>{myMonthStats.offEquivalents ?? 0} Total Off(s)</strong>
                    </div>

                    <div className="home-clean-row">
                      <span>
                        4. Monthly Free Offs Relief ({myMonthStats.freeOffsAllowed ?? 2} Allowed)
                      </span>
                      <strong style={{ color: "#4ade80" }}>
                        -{" "}
                        {myMonthStats.freeOffsUsed ??
                          Math.min(
                            myMonthStats.offEquivalents ?? 0,
                            myMonthStats.freeOffsAllowed ?? 2
                          )}{" "}
                        Free Off(s) Waived
                      </strong>
                    </div>

                    <div className="home-clean-row">
                      <span>5. Net Deductible Offs (Jin par Salary Kategi)</span>
                      <strong
                        style={{
                          color: (myMonthStats.deductibleOffs ?? 0) > 0 ? "#f87171" : "#4ade80",
                        }}
                      >
                        {myMonthStats.deductibleOffs ?? 0} Deductible Off(s)
                      </strong>
                    </div>
                  </div>

                  {Array.isArray(myMonthStats.lateRecords) &&
                    myMonthStats.lateRecords.length > 0 && (
                      <div
                        style={{
                          marginTop: "14px",
                          padding: "12px 14px",
                          borderRadius: "12px",
                          background: "rgba(250, 204, 21, 0.06)",
                          border: "1px solid rgba(250, 204, 21, 0.22)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "#fde047",
                            marginBottom: "8px",
                          }}
                        >
                          Jin Tareekhon Par Aap Late Aaye ({myMonthStats.lateRecords.length} Lates ={" "}
                          {myMonthStats.offFromLates} Off):
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {myMonthStats.lateRecords.map((lr) => (
                            <span
                              key={lr.date}
                              style={{
                                fontSize: "11.5px",
                                background: "rgba(0,0,0,0.35)",
                                border: "1px solid rgba(250, 204, 21, 0.28)",
                                color: "#fef08a",
                                padding: "5px 9px",
                                borderRadius: "7px",
                              }}
                            >
                              {lr.date} · {lr.time} (+{lr.lateMinutes}m)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </section>
          )}

          {/* ── ADMIN EMPLOYEE SALARIES SECTION ── */}
          {showAdminView && (
            <section className="home-section">
              <div className="home-dir-header">
                <h2 className="home-section-title" style={{ margin: 0 }}>
                  Employee Payroll Overview — {currentMonth}
                </h2>
                <button
                  type="button"
                  onClick={() => navigate("/manage-salary")}
                  style={{
                    background: "rgba(167, 139, 250, 0.14)",
                    border: "1px solid rgba(167, 139, 250, 0.35)",
                    color: "#e9d5ff",
                    borderRadius: "9px",
                    padding: "8px 14px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Open Full Payroll & Slips
                </button>
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
                                  width: "36px",
                                  height: "36px",
                                  borderRadius: "10px",
                                  objectFit: "cover",
                                }}
                              />
                            ) : (
                              <span className="home-emp-avatar">{empInitial}</span>
                            )}
                            <div>
                              <span className="home-emp-name" style={{ display: "block" }}>
                                {displayNameFor(emp)}
                              </span>
                              <small style={{ fontSize: "11px", color: "rgba(240,238,255,0.45)" }}>
                                {emp.isAttendanceExempt
                                  ? `${emp.designation || "Office Boy"} · Payroll Only`
                                  : `Base: Rs. ${Math.round(Number(emp.salary) || 0).toLocaleString()}`}
                              </small>
                            </div>
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
                              background: "rgba(167,139,250,0.14)",
                              border: "1px solid rgba(167,139,250,0.32)",
                              color: "#e9d5ff",
                              borderRadius: "8px",
                              padding: "6px 10px",
                              fontSize: "11.5px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                            title="Download PDF Salary Slip"
                          >
                            PDF Slip
                          </button>
                        </div>

                        <div className="home-emp-net">
                          <span className="home-emp-net-label">Net Payable</span>
                          <span className="home-emp-net-value">
                            Rs. {Math.round(s.netSalary ?? 0).toLocaleString()}
                          </span>
                        </div>

                        {emp.isAttendanceExempt ? (
                          <div className="home-emp-stats">
                            <div className="home-emp-stat">
                              <span className="home-emp-stat-label">CNIC</span>
                              <span className="home-emp-stat-value">
                                {emp.personalInfo?.cnic || "—"}
                              </span>
                            </div>
                            <div className="home-emp-stat">
                              <span className="home-emp-stat-label">Bank / Wallet</span>
                              <span className="home-emp-stat-value">
                                {emp.bankDetails?.providerName || emp.bankDetails?.method || "—"}
                              </span>
                            </div>
                            <div className="home-emp-stat">
                              <span className="home-emp-stat-label">Account No.</span>
                              <span className="home-emp-stat-value">
                                {emp.bankDetails?.accountNumber || "—"}
                              </span>
                            </div>
                            <div className="home-emp-stat">
                              <span className="home-emp-stat-label">Attendance</span>
                              <span className="home-emp-stat-value" style={{ color: "#4ade80" }}>
                                Exempt
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="home-emp-stats">
                            <div className="home-emp-stat">
                              <span className="home-emp-stat-label">
                                Lates ({s.latesPerOff ?? 3} = 1 Off)
                              </span>
                              <span className="home-emp-stat-value">
                                {s.lateCount ?? 0} Lates → {s.offFromLates ?? 0} Off
                              </span>
                            </div>
                            <div className="home-emp-stat">
                              <span className="home-emp-stat-label">
                                Unapproved Absent
                              </span>
                              <span className="home-emp-stat-value">
                                {s.absentCount ?? 0} Absent → {s.absentCount ?? 0} Off
                              </span>
                            </div>
                            <div className="home-emp-stat">
                              <span className="home-emp-stat-label">Total / Ded. Offs</span>
                              <span className="home-emp-stat-value">
                                {s.offEquivalents ?? 0} Total ({s.deductibleOffs ?? 0} Cut)
                              </span>
                            </div>
                            <div className="home-emp-stat">
                              <span className="home-emp-stat-label">Salary Cut</span>
                              <span
                                className="home-emp-stat-value"
                                style={{
                                  color: (s.deduction ?? 0) > 0 ? "#f87171" : "#4ade80",
                                }}
                              >
                                {(s.deduction ?? 0) > 0
                                  ? `- Rs. ${Math.round(s.deduction).toLocaleString()}`
                                  : "Rs. 0"}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ── ADMIN ALL EMPLOYEES DIRECTORY ── */}
          {showAdminView && (
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
                          <th>Employee</th>
                          <th>Role</th>
                          <th>Phone & CNIC</th>
                          <th>Bank / Wallet</th>
                          <th>Account Title & Number</th>
                          <th data-no-print>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((emp) => (
                          <tr key={emp.uid}>
                            <td>
                              <div style={{ fontWeight: 600, color: "#fff" }}>
                                {displayNameFor(emp)}
                              </div>
                              <div style={{ fontSize: "11.5px", color: "rgba(240,238,255,0.48)" }}>
                                {emp.isAttendanceExempt
                                  ? emp.designation || "Support Staff"
                                  : emp.email || "—"}
                              </div>
                            </td>
                            <td>
                              {emp.isAttendanceExempt ? (
                                <span
                                  style={{
                                    fontSize: "11.5px",
                                    background: "rgba(167, 139, 250, 0.14)",
                                    color: "#d8b4fe",
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                  }}
                                >
                                  {emp.designation || "Office Boy"}
                                </span>
                              ) : (
                                <span
                                  style={{
                                    cursor: "pointer",
                                    fontSize: "11.5px",
                                    background:
                                      emp.role === "admin"
                                        ? "rgba(109, 58, 255, 0.22)"
                                        : "rgba(255, 255, 255, 0.06)",
                                    border: "1px solid rgba(255, 255, 255, 0.12)",
                                    color: emp.role === "admin" ? "#c4b5fd" : "#e2e8f0",
                                    padding: "3px 9px",
                                    borderRadius: "6px",
                                    textTransform: "capitalize",
                                  }}
                                  title="Click to switch role (Admin / Employee)"
                                  onClick={() => handleToggleRole(emp)}
                                >
                                  {emp.role || "employee"}
                                </span>
                              )}
                            </td>
                            <td>
                              <div>{emp.personalInfo?.phone || "—"}</div>
                              <div style={{ fontSize: "11.5px", color: "rgba(240,238,255,0.48)" }}>
                                CNIC: {emp.personalInfo?.cnic || "—"}
                              </div>
                            </td>
                            <td>
                              <div style={{ textTransform: "uppercase", fontSize: "11.5px", color: "#c4b5fd" }}>
                                {emp.bankDetails?.method || "—"}
                              </div>
                              <div>{emp.bankDetails?.providerName || "—"}</div>
                            </td>
                            <td>
                              <div>{emp.bankDetails?.accountTitle || "—"}</div>
                              <div style={{ fontSize: "11.5px", color: "rgba(240,238,255,0.52)" }}>
                                {emp.bankDetails?.accountNumber || emp.bankDetails?.iban || "—"}
                              </div>
                            </td>
                            <td data-no-print>
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    emp.isAttendanceExempt
                                      ? "/manage-salary"
                                      : `/profile?uid=${emp.uid}`
                                  )
                                }
                                style={{
                                  background: "rgba(109,58,255,0.2)",
                                  border: "1px solid rgba(167,139,250,0.35)",
                                  color: "#e9d5ff",
                                  padding: "6px 12px",
                                  borderRadius: "7px",
                                  fontSize: "12px",
                                  fontWeight: 600,
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
                Setup Email Notifications (Gmail SMTP)
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
