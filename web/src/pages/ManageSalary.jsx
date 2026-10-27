import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchUsers,
  fetchAttendance,
  fetchLeaves,
  updateUserById,
} from "../api";
import {
  calculateSalaryStats,
  getLocalMonthStr,
} from "../utils/attendanceHelpers";
import {
  exportPayrollToExcel,
  exportPayrollToCSV,
  exportPayrollToPDF,
  exportEmployeeSalarySlipPDF,
} from "../utils/exportAttendance";
import "./css/ManageSalary.css";

function displayNameFor(emp) {
  if (
    emp.name &&
    emp.name.trim() &&
    emp.name.trim().toLowerCase() !== "user"
  ) {
    return emp.name;
  }

  if (emp.personalInfo?.fullName?.trim()) return emp.personalInfo.fullName;
  if (emp.fullName?.trim()) return emp.fullName;
  if (emp.email) return emp.email.split("@")[0];

  return "Employee";
}

function ManageSalary() {
  const currentMonth = getLocalMonthStr();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [employees, setEmployees] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedUid, setSelectedUid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError("");

      try {
        const [emps, allMonthAtt, allApprovedLeaves] = await Promise.all([
          fetchUsers(),
          fetchAttendance({ month: selectedMonth }),
          fetchLeaves({ status: "approved" }),
        ]);

        if (cancelled) return;

        setEmployees(emps);

        if (emps.length > 0) {
          setSelectedUid((previous) => previous || emps[0].uid);
        }

        const attByUid = {};
        allMonthAtt.forEach((r) => {
          (attByUid[r.uid] = attByUid[r.uid] || []).push(r);
        });

        const leavesByUid = {};
        allApprovedLeaves.forEach((l) => {
          (leavesByUid[l.uid] = leavesByUid[l.uid] || []).push(l);
        });

        const statsMap = {};
        for (const emp of emps) {
          statsMap[emp.uid] = calculateSalaryStats({
            records: attByUid[emp.uid] || [],
            schedule: emp.schedule,
            baseSalary: Number(emp.salary) || 0,
            month: selectedMonth,
            approvedLeaves: leavesByUid[emp.uid] || [],
          });
        }

        if (!cancelled) setStats(statsMap);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load salary information.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  const handleFieldChange = (uid, value) => {
    setEmployees((previous) =>
      previous.map((employee) =>
        employee.uid === uid
          ? { ...employee, salary: value }
          : employee
      )
    );
  };

  async function saveSalary(uid, salary) {
    const baseSalary = Number(salary);

    if (!Number.isFinite(baseSalary) || baseSalary < 0) {
      window.alert("Enter a valid non-negative salary.");
      return;
    }

    setSaving(true);

    try {
      await updateUserById(uid, { salary: baseSalary });

      setEmployees((previous) =>
        previous.map((employee) =>
          employee.uid === uid
            ? { ...employee, salary: baseSalary }
            : employee
        )
      );

      setStats((previous) => {
        const cur = previous[uid] || {};
        const wDays = cur.workingDaysInMonth || 0;
        const perDayRate = wDays > 0 ? baseSalary / wDays : 0;
        const absentDeductionGross = (cur.absentCount || 0) * perDayRate;
        const lateDeductionGross =
          ((cur.offFromLates || 0) + (cur.extremeLateCount || 0)) * perDayRate;
        const earlyLeaveDeductionGross = (cur.offFromEarlyLeaves || 0) * perDayRate;
        const freeOffCredit =
          Math.min(cur.offEquivalents || 0, cur.freeOffsAllowed || 2) * perDayRate;
        const deduction = (cur.deductibleOffs || 0) * perDayRate;

        return {
          ...previous,
          [uid]: {
            ...cur,
            baseSalary,
            perDayRate,
            absentDeductionGross,
            lateDeductionGross,
            earlyLeaveDeductionGross,
            freeOffCredit,
            deduction,
            netSalary: Math.max(baseSalary - deduction, 0),
          },
        };
      });

      window.alert("Base salary saved.");
    } catch (err) {
      window.alert(err.message || "Could not save base salary.");
    } finally {
      setSaving(false);
    }
  }

  const totalPayroll = employees.reduce(
    (sum, employee) => sum + (stats[employee.uid]?.netSalary ?? 0),
    0
  );

  function buildPayrollExportRows() {
    return employees.map((employee) => {
      const s = stats[employee.uid] || {};
      return {
        name: displayNameFor(employee),
        month: selectedMonth,
        baseSalary: Number(employee.salary) || 0,
        presentCount: s.presentCount ?? 0,
        lateCount: s.lateCount ?? 0,
        extremeLateCount: s.extremeLateCount ?? 0,
        absentCount: s.absentCount ?? 0,
        approvedLeaveCount: s.approvedLeaveCount ?? 0,
        earlyLeaveCount: s.earlyLeaveCount ?? 0,
        offEquivalents: s.offEquivalents ?? 0,
        deductibleOffs: s.deductibleOffs ?? 0,
        absentDeductionGross: s.absentDeductionGross ?? 0,
        lateDeductionGross: s.lateDeductionGross ?? 0,
        earlyLeaveDeductionGross: s.earlyLeaveDeductionGross ?? 0,
        deduction: s.deduction ?? 0,
        netSalary: s.netSalary ?? 0,
        method: employee.bankDetails?.method || "—",
        providerName: employee.bankDetails?.providerName || "—",
        accountTitle: employee.bankDetails?.accountTitle || "—",
        accountNumber: employee.bankDetails?.accountNumber || "—",
        iban: employee.bankDetails?.iban || "",
      };
    });
  }

  const selectedEmp = employees.find(
    (employee) => employee.uid === selectedUid
  );

  const selectedStats = stats[selectedUid] || {};

  return (
    <div className="salary-page">
      <header className="salary-topbar">
        <div className="salary-identity">
          <div className="salary-avatar">₨</div>

          <div className="salary-identity-text">
            <span className="salary-name">Salaries & Monthly Payroll</span>
            <span className="salary-month-pill">{selectedMonth}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            type="month"
            value={selectedMonth}
            max={currentMonth}
            onChange={(e) => setSelectedMonth(e.target.value || currentMonth)}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
              borderRadius: "8px",
              padding: "6px 10px",
              fontSize: "13px",
            }}
          />
          <button
            className="salary-back-btn"
            onClick={() => navigate("/")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </button>
        </div>
      </header>

      <section className="salary-hero">
        <div className="salary-hero-glow" />
        <p className="salary-hero-date">Payroll Statement for {selectedMonth}</p>
        <h1 className="salary-hero-title">Total Net Payroll</h1>

        <p className="salary-hero-amount">
          Rs. {Math.round(totalPayroll).toLocaleString()}
        </p>

        <p className="salary-hero-sub">
          Across {employees.length}{" "}
          {employees.length === 1 ? "person" : "people"}, based on attendance, lates, offs
          and approved leaves.
        </p>

        {employees.length > 0 && (
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap", marginTop: "14px" }}>
            <button
              className="salary-payroll-export-btn"
              onClick={() =>
                exportPayrollToPDF(
                  buildPayrollExportRows(),
                  `payroll-${selectedMonth}`,
                  selectedMonth
                )
              }
            >
              📄 Export Full Payroll PDF (with Logo)
            </button>
            <button
              className="salary-payroll-export-btn"
              onClick={() =>
                exportPayrollToExcel(
                  buildPayrollExportRows(),
                  `payroll-${selectedMonth}`
                )
              }
            >
              📊 Export Payroll Excel
            </button>
            <button
              className="salary-payroll-export-btn"
              onClick={() =>
                exportPayrollToCSV(
                  buildPayrollExportRows(),
                  `payroll-${selectedMonth}`
                )
              }
            >
              📋 Export Payroll CSV
            </button>
          </div>
        )}
      </section>

      <section className="salary-body">
        {error && <p role="alert">{error}</p>}

        {loading ? (
          <p className="salary-loading">Loading...</p>
        ) : employees.length === 0 ? (
          <p className="salary-loading">No employees found yet.</p>
        ) : (
          <>
            {/* Employee Tabs */}
            <div className="salary-emp-list">
              {employees.map((employee) => (
                <button
                  key={employee.uid}
                  className={`salary-chip ${
                    selectedUid === employee.uid ? "active" : ""
                  }`}
                  onClick={() => setSelectedUid(employee.uid)}
                >
                  <span className="salary-chip-avatar">
                    {displayNameFor(employee).charAt(0).toUpperCase()}
                  </span>
                  {displayNameFor(employee)}
                </button>
              ))}
            </div>

            {selectedEmp && (
              <div className="salary-card">
                <div className="salary-card-header" style={{ flexWrap: "wrap", gap: "12px" }}>
                  <div>
                    <span className="salary-emp-name" style={{ display: "block" }}>
                      {displayNameFor(selectedEmp)} — {selectedMonth}
                    </span>
                    <span className="salary-emp-stats">
                      Present: {selectedStats.presentCount ?? 0} (On-time: {selectedStats.onTimeCount ?? 0}) · Late:{" "}
                      {selectedStats.lateCount ?? 0} · Extreme Late:{" "}
                      {selectedStats.extremeLateCount ?? 0} · Absent (Off):{" "}
                      {selectedStats.absentCount ?? 0} · Early Leave:{" "}
                      {selectedStats.earlyLeaveCount ?? 0}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="salary-payroll-export-btn"
                    style={{ margin: 0, padding: "8px 14px", fontSize: "13px" }}
                    onClick={() =>
                      exportEmployeeSalarySlipPDF({
                        employee: selectedEmp,
                        stats: selectedStats,
                        month: selectedMonth,
                      })
                    }
                  >
                    📄 Download {displayNameFor(selectedEmp)}'s Salary Slip PDF
                  </button>
                </div>

                <div className="salary-breakdown">
                  <div className="salary-breakdown-row">
                    <span>Working days in {selectedMonth}</span>
                    <span>{selectedStats.workingDaysInMonth ?? 0} days</span>
                  </div>

                  <div className="salary-breakdown-row">
                    <span>Per-day salary rate</span>
                    <span>
                      Rs. {Math.round(selectedStats.perDayRate ?? 0).toLocaleString()} / day
                    </span>
                  </div>

                  <div className="salary-breakdown-row">
                    <span>Approved full-day leaves (No deduction)</span>
                    <span>{selectedStats.approvedLeaveCount ?? 0} day(s)</span>
                  </div>

                  <div className="salary-breakdown-row">
                    <span>
                      Unapproved Absent / Offs ({selectedStats.absentCount ?? 0} off)
                    </span>
                    <span style={{ color: "#f87171" }}>
                      - Rs. {Math.round(selectedStats.absentDeductionGross ?? 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="salary-breakdown-row">
                    <span>
                      Late & Extreme Late ({selectedStats.lateCount ?? 0} late = {selectedStats.offFromLates ?? 0} off, {selectedStats.extremeLateCount ?? 0} extreme late)
                    </span>
                    <span style={{ color: "#f87171" }}>
                      - Rs. {Math.round(selectedStats.lateDeductionGross ?? 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="salary-breakdown-row">
                    <span>
                      Early Leaves ({selectedStats.earlyLeaveCount ?? 0} early = {selectedStats.offFromEarlyLeaves ?? 0} off)
                    </span>
                    <span style={{ color: "#f87171" }}>
                      - Rs. {Math.round(selectedStats.earlyLeaveDeductionGross ?? 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="salary-breakdown-row">
                    <span>Total Off-Equivalents this month</span>
                    <span>{selectedStats.offEquivalents ?? 0} off(s)</span>
                  </div>

                  <div className="salary-breakdown-row">
                    <span>Free offs allowed per month (2 Free Offs Relief)</span>
                    <span style={{ color: "#4ade80" }}>
                      + Rs. {Math.round(selectedStats.freeOffCredit ?? 0).toLocaleString()} (2 free offs)
                    </span>
                  </div>

                  <div className="salary-breakdown-row">
                    <span>Net Deductible Offs</span>
                    <span>{selectedStats.deductibleOffs ?? 0} off(s)</span>
                  </div>

                  <div className="salary-breakdown-row" style={{ fontWeight: 700, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: "10px" }}>
                    <span>Total Salary Cut (Aapki Kati Hui Salary)</span>
                    <span style={{ color: "#f87171" }}>
                      Rs. {Math.round(selectedStats.deduction ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="salary-fields">
                  <label>
                    Base Monthly Salary (PKR)
                    <input
                      type="number"
                      min="0"
                      value={selectedEmp.salary ?? ""}
                      onChange={(event) =>
                        handleFieldChange(
                          selectedEmp.uid,
                          event.target.value
                        )
                      }
                    />
                  </label>
                </div>

                <div className="salary-net-row">
                  <span>Net Payable Salary ({selectedMonth}):</span>
                  <span className="salary-net-amount">
                    Rs. {Math.round(selectedStats.netSalary ?? 0).toLocaleString()}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    className="salary-save-btn"
                    style={{ flex: 1 }}
                    disabled={saving}
                    onClick={() =>
                      saveSalary(selectedEmp.uid, selectedEmp.salary)
                    }
                  >
                    {saving ? "Saving..." : "Save Base Salary"}
                  </button>
                  <button
                    type="button"
                    className="salary-save-btn"
                    style={{
                      flex: 1,
                      background: "rgba(167, 139, 250, 0.18)",
                      border: "1px solid rgba(167, 139, 250, 0.4)",
                    }}
                    onClick={() =>
                      exportEmployeeSalarySlipPDF({
                        employee: selectedEmp,
                        stats: selectedStats,
                        month: selectedMonth,
                      })
                    }
                  >
                    📄 Export Salary Slip PDF
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default ManageSalary;
