import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCurrentUser,
  fetchUserById,
  fetchAttendance,
  fetchLeaves,
  fetchHolidays,
  fetchPolicies,
} from "../api";
import {
  getLocalMonthStr,
  calculateSalaryStats,
} from "../utils/attendanceHelpers";
import { buildMonthRows } from "../utils/monthattendance";
import {
  exportMonthToCSV,
  exportMonthToExcel,
  exportMonthToPDF,
  printElement,
} from "../utils/exportAttendance";
import "./css/MyAttendance.css";

function kindClass(kind) {
  if (kind === "extreme-late") return "status-extreme-late";
  if (kind === "late") return "status-late";
  if (kind === "absent") return "status-absent";
  if (kind === "leave") return "status-leave";
  if (kind === "pending") return "status-pending";
  if (kind === "off") return "status-off";
  return "status-ontime";
}

function MyAttendance() {
  const currentMonth = getLocalMonthStr();
  const [userName, setUserName] = useState("");
  const [baseSalary, setBaseSalary] = useState(0);
  const [schedule, setSchedule] = useState(null);
  const [records, setRecords] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [policies, setPolicies] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError("");
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const uid = currentUser.uid;

        const [userData, attList, leaveList, holidayList, policyData] = await Promise.all([
          fetchUserById(uid),
          fetchAttendance({ uid, month: selectedMonth }),
          fetchLeaves({ uid, status: "approved" }),
          fetchHolidays().catch(() => []),
          fetchPolicies().catch(() => null),
        ]);
        if (cancelled) return;

        setUserName(userData?.name || currentUser.displayName || "");
        setBaseSalary(Number(userData?.salary) || 0);
        setSchedule(userData?.schedule || null);
        setRecords(attList);
        setLeaves(leaveList);
        setHolidays(holidayList || []);
        setPolicies(policyData);
      } catch (err) {
        if (err?.name !== "AbortError" && !cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  const { rows, summary } = loading
    ? { rows: [], summary: null }
    : buildMonthRows({ month: selectedMonth, schedule, records, leaves, holidays });

  const salaryStats = loading
    ? null
    : calculateSalaryStats({
        records,
        schedule,
        baseSalary,
        month: selectedMonth,
        approvedLeaves: leaves,
        policies,
        holidays,
      });

  const stats = summary
    ? [
        ["Present", summary.present],
        ["On time", summary.onTime],
        ["Late", summary.late],
        ["Offs from Lates", salaryStats?.offFromLates ?? 0],
        ["Absent (Off)", summary.absent],
        ["Total Offs", salaryStats?.offEquivalents ?? 0],
        ["Deductible Offs", salaryStats?.deductibleOffs ?? 0],
      ]
    : [];

  const fileName = `my-attendance-${selectedMonth}`;

  return (
    <div className="my-attendance-page">
      <header className="my-attendance-topbar">
        <div className="my-attendance-identity">
          <div className="my-attendance-avatar">
            {(userName || "U").charAt(0).toUpperCase()}
          </div>
          <div className="my-attendance-identity-text">
            <span className="my-attendance-name">
              {userName ? `${userName}'s Attendance` : "My Attendance"}
            </span>
            <span className="my-attendance-month-pill">{selectedMonth}</span>
          </div>
        </div>
        <button className="my-attendance-back-btn" onClick={() => navigate("/")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
      </header>

      <section className="my-attendance-hero">
        <div className="my-attendance-hero-glow" />
        <p className="my-attendance-hero-date">Monthly record</p>
        <h1 className="my-attendance-hero-title">Your attendance history</h1>
        <p className="my-attendance-hero-sub">
          Check-in, late, leave aur early leave, sab ek jagah.
        </p>
      </section>

      {error ? (
        <p className="my-attendance-error">Error: {error}</p>
      ) : (
        <section className="my-attendance-body">
          <div className="my-attendance-controls">
            <input
              type="month"
              className="my-attendance-month-input"
              value={selectedMonth}
              max={currentMonth}
              onChange={(e) => setSelectedMonth(e.target.value || currentMonth)}
            />
            {rows.length > 0 && (
              <div className="my-attendance-export-bar">
                <button onClick={() => exportMonthToCSV(rows, fileName)}>CSV</button>
                <button onClick={() => exportMonthToExcel(rows, fileName)}>Excel</button>
                <button onClick={() => exportMonthToPDF(rows, fileName, `${userName || "My"} attendance - ${selectedMonth}`)}>PDF</button>
                <button onClick={() => printElement("my-attendance-table")}>Print</button>
              </div>
            )}
          </div>

          {stats.length > 0 && (
            <div className="my-attendance-summary">
              {stats.map(([label, value]) => (
                <div className="my-attendance-stat" key={label}>
                  <span className="my-attendance-stat-value">{value}</span>
                  <span className="my-attendance-stat-label">{label}</span>
                </div>
              ))}
            </div>
          )}

          {salaryStats && (
            <div
              className="my-attendance-card"
              style={{
                marginBottom: "18px",
                padding: "18px 20px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                  paddingBottom: "10px",
                }}
              >
                <strong style={{ fontSize: "15px", color: "#f0eeff" }}>
                  Lates, Offs & Salary Deduction Breakdown ({selectedMonth})
                </strong>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    padding: "5px 12px",
                    borderRadius: "8px",
                    background:
                      (salaryStats.deduction ?? 0) > 0
                        ? "rgba(239, 68, 68, 0.16)"
                        : "rgba(74, 222, 128, 0.14)",
                    color: (salaryStats.deduction ?? 0) > 0 ? "#fca5a5" : "#86efac",
                    border:
                      (salaryStats.deduction ?? 0) > 0
                        ? "1px solid rgba(239, 68, 68, 0.35)"
                        : "1px solid rgba(74, 222, 128, 0.3)",
                  }}
                >
                  {(salaryStats.deduction ?? 0) > 0
                    ? `Salary Cut: - Rs. ${Math.round(salaryStats.deduction).toLocaleString()} | Net: Rs. ${Math.round(salaryStats.netSalary).toLocaleString()}`
                    : `Rs. 0 Salary Cut | Net Salary: Rs. ${Math.round(salaryStats.netSalary).toLocaleString()}`}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "10px",
                  fontSize: "12.5px",
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    padding: "10px 12px",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ color: "rgba(240,238,255,0.6)", marginBottom: "4px" }}>
                    1. Lates se Banne Wali Offs (Har {salaryStats.latesPerOff} Late = 1 Off)
                  </div>
                  <strong style={{ fontSize: "14px", color: "#fde047" }}>
                    {salaryStats.lateCount} Lates = {salaryStats.offFromLates} Off(s)
                  </strong>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    padding: "10px 12px",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ color: "rgba(240,238,255,0.6)", marginBottom: "4px" }}>
                    2. Unapproved Absents (1 Absent = 1 Off)
                  </div>
                  <strong style={{ fontSize: "14px", color: "#f0eeff" }}>
                    {salaryStats.absentCount} Absent = {salaryStats.absentCount} Off(s)
                  </strong>
                </div>

                <div
                  style={{
                    background: "rgba(167, 139, 250, 0.12)",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(167, 139, 250, 0.25)",
                  }}
                >
                  <div style={{ color: "rgba(240,238,255,0.75)", marginBottom: "4px" }}>
                    3. Total Offs & Free Offs Relief
                  </div>
                  <strong style={{ fontSize: "14px", color: "#e9d5ff" }}>
                    {salaryStats.offEquivalents} Total Off(s) ({salaryStats.freeOffsAllowed} Free Allowed)
                  </strong>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    padding: "10px 12px",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ color: "rgba(240,238,255,0.6)", marginBottom: "4px" }}>
                    4. Net Deductible Offs & Deduction
                  </div>
                  <strong
                    style={{
                      fontSize: "14px",
                      color: (salaryStats.deductibleOffs ?? 0) > 0 ? "#f87171" : "#4ade80",
                    }}
                  >
                    {salaryStats.deductibleOffs} Deductible Off(s) = Rs.{" "}
                    {Math.round(salaryStats.deduction ?? 0).toLocaleString()}
                  </strong>
                </div>
              </div>

              {Array.isArray(salaryStats.lateRecords) &&
                salaryStats.lateRecords.length > 0 && (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "rgba(250, 204, 21, 0.08)",
                      border: "1px solid rgba(250, 204, 21, 0.25)",
                      fontSize: "12px",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "#fde047", marginBottom: "6px" }}>
                      Aap in {salaryStats.lateRecords.length} tareekhon par Late aaye (Jin ki wajah se{" "}
                      {salaryStats.offFromLates} Off lagi):
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {salaryStats.lateRecords.map((lr) => (
                        <span
                          key={lr.date}
                          style={{
                            background: "rgba(0,0,0,0.35)",
                            border: "1px solid rgba(250, 204, 21, 0.3)",
                            color: "#fef08a",
                            padding: "4px 8px",
                            borderRadius: "6px",
                          }}
                        >
                          {lr.date}: {lr.time} ({lr.lateMinutes}m late)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}

          <div className="my-attendance-card">
            {loading ? (
              <p className="my-attendance-loading">Loading...</p>
            ) : rows.length === 0 ? (
              <p className="my-attendance-loading">Is mahine ka koi record nahi.</p>
            ) : (
              <div id="my-attendance-table">
                <table className="my-attendance-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Day</th>
                      <th>Check-in</th>
                      <th>Status</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.date}>
                        <td>{r.date}</td>
                        <td>{r.day}</td>
                        <td>{r.time || "—"}</td>
                        <td className={kindClass(r.kind)}>{r.label}</td>
                        <td>{r.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default MyAttendance;
