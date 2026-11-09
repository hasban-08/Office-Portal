import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchUsers,
  fetchAttendance,
  fetchLeaves,
  fetchPolicies,
  fetchHolidays,
  updateUserById,
  createPayrollStaff,
  deleteUserById,
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
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingStaffUid, setEditingStaffUid] = useState(null);
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffForm, setStaffForm] = useState({
    name: "",
    designation: "Office Boy",
    cnic: "",
    phone: "",
    salary: "",
    method: "bank",
    providerName: "",
    accountTitle: "",
    accountNumber: "",
    iban: "",
  });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      setError("");

      try {
        const [emps, allMonthAtt, allApprovedLeaves, activePolicies, holidayList] = await Promise.all([
          fetchUsers(),
          fetchAttendance({ month: selectedMonth }),
          fetchLeaves({ status: "approved" }),
          fetchPolicies().catch(() => null),
          fetchHolidays().catch(() => []),
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
            policies: activePolicies,
            holidays: holidayList,
            isAttendanceExempt: Boolean(emp.isAttendanceExempt),
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
        if (cur.isAttendanceExempt) {
          return {
            ...previous,
            [uid]: {
              ...cur,
              baseSalary,
              deduction: 0,
              netSalary: Math.max(baseSalary, 0),
            },
          };
        }
        const wDays = cur.workingDaysInMonth || 0;
        const perDayRate = wDays > 0 ? baseSalary / wDays : 0;
        const absentDeductionGross = (cur.absentCount || 0) * perDayRate;
        const lateDeductionGross =
          ((cur.offFromLates || 0) + (cur.offFromExtremeLates || 0)) * perDayRate;
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

  const openAddStaffModal = () => {
    setEditingStaffUid(null);
    setStaffForm({
      name: "",
      designation: "Office Boy",
      cnic: "",
      phone: "",
      salary: "",
      method: "bank",
      providerName: "",
      accountTitle: "",
      accountNumber: "",
      iban: "",
    });
    setShowStaffModal(true);
  };

  const openEditStaffModal = (emp) => {
    setEditingStaffUid(emp.uid);
    setStaffForm({
      name: displayNameFor(emp),
      designation: emp.designation || "Office Boy",
      cnic: emp.personalInfo?.cnic || "",
      phone: emp.personalInfo?.phone || "",
      salary: emp.salary ?? "",
      method: emp.bankDetails?.method || "bank",
      providerName: emp.bankDetails?.providerName || "",
      accountTitle: emp.bankDetails?.accountTitle || "",
      accountNumber: emp.bankDetails?.accountNumber || "",
      iban: emp.bankDetails?.iban || "",
    });
    setShowStaffModal(true);
  };

  const handleSavePayrollStaff = async (e) => {
    e.preventDefault();
    if (!staffForm.name.trim()) {
      window.alert("Name likhna zaroori hai.");
      return;
    }
    setStaffSaving(true);
    try {
      const baseSalary = Number(staffForm.salary) || 0;
      if (editingStaffUid) {
        const updated = await updateUserById(editingStaffUid, {
          name: staffForm.name.trim(),
          designation: staffForm.designation.trim() || "Office Boy",
          isAttendanceExempt: true,
          salary: baseSalary,
          personalInfo: {
            fullName: staffForm.name.trim(),
            cnic: staffForm.cnic.trim(),
            phone: staffForm.phone.trim(),
          },
          bankDetails: {
            method: staffForm.method || "bank",
            providerName: staffForm.providerName.trim(),
            accountTitle: staffForm.accountTitle.trim(),
            accountNumber: staffForm.accountNumber.trim(),
            iban: staffForm.iban.trim(),
          },
        });
        setEmployees((prev) => prev.map((u) => (u.uid === editingStaffUid ? updated : u)));
        setStats((prev) => ({
          ...prev,
          [editingStaffUid]: calculateSalaryStats({
            records: [],
            schedule: updated.schedule,
            baseSalary,
            month: selectedMonth,
            isAttendanceExempt: true,
          }),
        }));
      } else {
        const created = await createPayrollStaff({
          name: staffForm.name.trim(),
          designation: staffForm.designation.trim() || "Office Boy",
          cnic: staffForm.cnic.trim(),
          phone: staffForm.phone.trim(),
          salary: baseSalary,
          bankDetails: {
            method: staffForm.method || "bank",
            providerName: staffForm.providerName.trim(),
            accountTitle: staffForm.accountTitle.trim(),
            accountNumber: staffForm.accountNumber.trim(),
            iban: staffForm.iban.trim(),
          },
        });
        setEmployees((prev) => [...prev, created]);
        setStats((prev) => ({
          ...prev,
          [created.uid]: calculateSalaryStats({
            records: [],
            schedule: created.schedule,
            baseSalary,
            month: selectedMonth,
            isAttendanceExempt: true,
          }),
        }));
        setSelectedUid(created.uid);
      }
      setShowStaffModal(false);
    } catch (err) {
      window.alert(err.message || "Could not save support staff details.");
    } finally {
      setStaffSaving(false);
    }
  };

  const handleDeleteStaff = async (emp) => {
    if (!window.confirm(`Remove ${displayNameFor(emp)} from Payroll?`)) return;
    try {
      await deleteUserById(emp.uid);
      const nextList = employees.filter((u) => u.uid !== emp.uid);
      setEmployees(nextList);
      setSelectedUid(nextList[0]?.uid || null);
    } catch (err) {
      window.alert(err.message || "Could not remove staff member.");
    }
  };

  function buildPayrollExportRows() {
    return employees.map((employee) => {
      const s = stats[employee.uid] || {};
      const isExempt = Boolean(employee.isAttendanceExempt);
      return {
        name: isExempt
          ? `${displayNameFor(employee)} (${employee.designation || "Office Boy"})`
          : displayNameFor(employee),
        cnic: employee.personalInfo?.cnic || "—",
        isAttendanceExempt: isExempt,
        month: selectedMonth,
        baseSalary: Number(employee.salary) || 0,
        presentCount: isExempt ? "Exempt" : (s.presentCount ?? 0),
        lateCount: isExempt ? "—" : (s.lateCount ?? 0),
        extremeLateCount: isExempt ? "—" : (s.extremeLateCount ?? 0),
        absentCount: isExempt ? "—" : (s.absentCount ?? 0),
        approvedLeaveCount: isExempt ? "—" : (s.approvedLeaveCount ?? 0),
        earlyLeaveCount: isExempt ? "—" : (s.earlyLeaveCount ?? 0),
        offEquivalents: isExempt ? 0 : (s.offEquivalents ?? 0),
        deductibleOffs: isExempt ? 0 : (s.deductibleOffs ?? 0),
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
          <div className="salary-avatar">S</div>

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

        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap", marginTop: "14px" }}>
          <button
            type="button"
            className="salary-payroll-export-btn"
            style={{
              background: "linear-gradient(135deg, #6d3aff, #a78bfa)",
              border: "none",
              color: "#fff",
            }}
            onClick={openAddStaffModal}
          >
            + Add Office Boy / Support Staff (Payroll Only)
          </button>
          {employees.length > 0 && (
            <>
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
                Export Full Payroll PDF
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
                Export Payroll Excel
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
                Export Payroll CSV
              </button>
            </>
          )}
        </div>
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
                  {employee.isAttendanceExempt && (
                    <span
                      style={{
                        fontSize: "10.5px",
                        background: "rgba(167, 139, 250, 0.22)",
                        color: "#e9d5ff",
                        padding: "2px 6px",
                        borderRadius: "6px",
                        marginLeft: "4px",
                      }}
                    >
                      {employee.designation || "Office Boy"}
                    </span>
                  )}
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
                    {selectedEmp.isAttendanceExempt ? (
                      <span className="salary-emp-stats" style={{ color: "#c4b5fd" }}>
                        {selectedEmp.designation || "Office Boy"} · Payroll-Only Staff (Attendance Exempt)
                      </span>
                    ) : (
                      <span className="salary-emp-stats">
                        Present: {selectedStats.presentCount ?? 0} (On-time: {selectedStats.onTimeCount ?? 0}) · Late:{" "}
                        {selectedStats.lateCount ?? 0} · Extreme Late:{" "}
                        {selectedStats.extremeLateCount ?? 0} · Absent (Off):{" "}
                        {selectedStats.absentCount ?? 0} · Early Leave:{" "}
                        {selectedStats.earlyLeaveCount ?? 0}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {selectedEmp.isAttendanceExempt && (
                      <>
                        <button
                          type="button"
                          className="salary-payroll-export-btn"
                          style={{ margin: 0, padding: "8px 12px", fontSize: "12.5px" }}
                          onClick={() => openEditStaffModal(selectedEmp)}
                        >
                          Edit CNIC & Bank Details
                        </button>
                        <button
                          type="button"
                          className="salary-payroll-export-btn"
                          style={{
                            margin: 0,
                            padding: "8px 12px",
                            fontSize: "12.5px",
                            background: "rgba(239, 68, 68, 0.16)",
                            borderColor: "rgba(239, 68, 68, 0.4)",
                            color: "#fca5a5",
                          }}
                          onClick={() => handleDeleteStaff(selectedEmp)}
                        >
                          Remove
                        </button>
                      </>
                    )}
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
                      Download {displayNameFor(selectedEmp)}'s Salary Slip PDF
                    </button>
                  </div>
                </div>

                {selectedEmp.isAttendanceExempt ? (
                  <div className="salary-breakdown">
                    <div className="salary-breakdown-row">
                      <span>Role / Designation</span>
                      <span>{selectedEmp.designation || "Office Boy"} (Support Staff)</span>
                    </div>
                    <div className="salary-breakdown-row">
                      <span>CNIC Number</span>
                      <span>{selectedEmp.personalInfo?.cnic || "—"}</span>
                    </div>
                    <div className="salary-breakdown-row">
                      <span>Phone Number</span>
                      <span>{selectedEmp.personalInfo?.phone || "—"}</span>
                    </div>
                    <div className="salary-breakdown-row">
                      <span>Payment Method</span>
                      <span style={{ textTransform: "uppercase" }}>
                        {selectedEmp.bankDetails?.method || "Bank"}
                      </span>
                    </div>
                    <div className="salary-breakdown-row">
                      <span>Bank / Wallet Name</span>
                      <span>{selectedEmp.bankDetails?.providerName || "—"}</span>
                    </div>
                    <div className="salary-breakdown-row">
                      <span>Account Title</span>
                      <span>{selectedEmp.bankDetails?.accountTitle || "—"}</span>
                    </div>
                    <div className="salary-breakdown-row">
                      <span>Account Number / Wallet No.</span>
                      <span>{selectedEmp.bankDetails?.accountNumber || "—"}</span>
                    </div>
                    {selectedEmp.bankDetails?.iban && (
                      <div className="salary-breakdown-row">
                        <span>IBAN</span>
                        <span>{selectedEmp.bankDetails.iban}</span>
                      </div>
                    )}
                    <div className="salary-breakdown-row">
                      <span>Attendance & Check-in Tracking</span>
                      <span style={{ color: "#4ade80" }}>
                        Exempt (Fixed Monthly Payroll — Rs. 0 Deduction)
                      </span>
                    </div>
                  </div>
                ) : (
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
                        Late & Extreme Late ({selectedStats.lateCount ?? 0} late = {selectedStats.offFromLates ?? 0} off, {selectedStats.extremeLateCount ?? 0} extreme late = {selectedStats.offFromExtremeLates ?? 0} off)
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
                      <span>Free offs allowed per month ({selectedStats.freeOffsAllowed ?? 2} Free Offs Relief)</span>
                      <span style={{ color: "#4ade80" }}>
                        + Rs. {Math.round(selectedStats.freeOffCredit ?? 0).toLocaleString()} ({selectedStats.freeOffsAllowed ?? 2} free offs)
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
                )}

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
                    Export Salary Slip PDF
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {showStaffModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.74)",
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
              border: "1px solid rgba(167, 139, 250, 0.38)",
              borderRadius: "16px",
              maxWidth: "520px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
              color: "#f0eeff",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "6px", fontSize: "18px" }}>
              {editingStaffUid
                ? "Edit Support Staff / Office Boy Details"
                : "Add Office Boy / Support Staff (Payroll Only)"}
            </h3>
            <p style={{ fontSize: "12.5px", color: "rgba(240, 238, 255, 0.65)", lineHeight: 1.5, margin: "0 0 16px" }}>
              In staff members ki daily attendance record nahi hoti — inka Name, CNIC, Salary aur Bank/Wallet details seedha Payroll aur Salary Slip mein aayengi.
            </p>
            <form onSubmit={handleSavePayrollStaff} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={{ fontSize: "12.5px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  Full Name *
                  <input
                    type="text"
                    placeholder="e.g. Muhammad Ali"
                    value={staffForm.name}
                    onChange={(e) => setStaffForm((p) => ({ ...p, name: e.target.value }))}
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
                  Designation
                  <input
                    type="text"
                    placeholder="Office Boy"
                    value={staffForm.designation}
                    onChange={(e) => setStaffForm((p) => ({ ...p, designation: e.target.value }))}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      color: "#fff",
                    }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={{ fontSize: "12.5px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  CNIC Number
                  <input
                    type="text"
                    placeholder="42101-1234567-1"
                    value={staffForm.cnic}
                    onChange={(e) => setStaffForm((p) => ({ ...p, cnic: e.target.value }))}
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
                  Phone Number
                  <input
                    type="text"
                    placeholder="0300-1234567"
                    value={staffForm.phone}
                    onChange={(e) => setStaffForm((p) => ({ ...p, phone: e.target.value }))}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      color: "#fff",
                    }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={{ fontSize: "12.5px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  Monthly Salary (PKR) *
                  <input
                    type="number"
                    min="0"
                    placeholder="25000"
                    value={staffForm.salary}
                    onChange={(e) => setStaffForm((p) => ({ ...p, salary: e.target.value }))}
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
                  Payment Method
                  <select
                    value={staffForm.method}
                    onChange={(e) => setStaffForm((p) => ({ ...p, method: e.target.value }))}
                    style={{
                      background: "#1f1938",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      color: "#fff",
                    }}
                  >
                    <option value="bank">Bank Account</option>
                    <option value="easypaisa">Easypaisa</option>
                    <option value="jazzcash">JazzCash</option>
                    <option value="sadapay">SadaPay / NayaPay</option>
                    <option value="cash">Cash</option>
                  </select>
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={{ fontSize: "12.5px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  Bank / Wallet Name
                  <input
                    type="text"
                    placeholder="e.g. Meezan Bank / Easypaisa"
                    value={staffForm.providerName}
                    onChange={(e) => setStaffForm((p) => ({ ...p, providerName: e.target.value }))}
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
                  Account Title
                  <input
                    type="text"
                    placeholder="Account Holder Name"
                    value={staffForm.accountTitle}
                    onChange={(e) => setStaffForm((p) => ({ ...p, accountTitle: e.target.value }))}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      color: "#fff",
                    }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label style={{ fontSize: "12.5px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  Account Number / Wallet No.
                  <input
                    type="text"
                    placeholder="Account or Mobile Wallet Number"
                    value={staffForm.accountNumber}
                    onChange={(e) => setStaffForm((p) => ({ ...p, accountNumber: e.target.value }))}
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
                  IBAN (Optional)
                  <input
                    type="text"
                    placeholder="PK00..."
                    value={staffForm.iban}
                    onChange={(e) => setStaffForm((p) => ({ ...p, iban: e.target.value }))}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: "8px",
                      padding: "9px 12px",
                      color: "#fff",
                    }}
                  />
                </label>
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setShowStaffModal(false)}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "none",
                    color: "#fff",
                    padding: "9px 16px",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={staffSaving}
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
                  {staffSaving ? "Saving..." : editingStaffUid ? "Save Details" : "Add to Payroll"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManageSalary;
