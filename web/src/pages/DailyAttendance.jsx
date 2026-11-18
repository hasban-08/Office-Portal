import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCurrentUser,
  fetchUsers,
  fetchAttendance,
  fetchLeaves,
  fetchHolidays,
  createHoliday,
  deleteHoliday,
  markEmployeeAttendance,
  editEmployeeAttendanceTime,
} from "../api";
import {
  exportDailyToExcel,
  exportDailyToCSV,
  exportDailyToPDF,
  printElement,
} from "../utils/exportAttendance";
import {
  formatTime12,
  statusLabel,
  getWeekdayKey,
  isScheduledWorkday,
  getLocalDateStr,
  getLocalMonthStr,
  calculateAttendanceStatus,
  resolveRecordWithSchedule,
  getApprovedLeaveDates,
  getActiveHolidayMap,
} from "../utils/attendanceHelpers";
import "./css/DailyAttendance.css";
import { formatHM12 } from "../utils/monthattendance";

function displayNameFor(emp) {
  if (emp.name && emp.name.trim() && emp.name.trim().toLowerCase() !== "user") {
    return emp.name;
  }
  if (emp.email) return emp.email.split("@")[0];
  return "Employee";
}

function statusClass(kind) {
  if (kind === "extreme-late") return "daily-s-extreme";
  if (kind === "late") return "daily-s-late";
  if (kind === "absent") return "daily-s-absent";
  if (kind === "pending") return "daily-s-pending";
  if (kind === "leave") return "daily-s-leave";
  if (kind === "off") return "daily-s-off";
  return "daily-s-ontime";
}

function DailyAttendance() {
  const todayStr = getLocalDateStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [employees, setEmployees] = useState([]);
  const [attByUid, setAttByUid] = useState({});
  const [leavesByUid, setLeavesByUid] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState(null);
  const [error, setError] = useState("");
  const [editModal, setEditModal] = useState(null); // { uid, name, time }
  const [editSaving, setEditSaving] = useState(false);
  const navigate = useNavigate();

  const currentUser = getCurrentUser();
  const myUid = currentUser?.uid;
  const isToday = selectedDate === todayStr;
  const isPastOrToday = selectedDate <= todayStr;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [usersList, attList, leaveList, holidayList] = await Promise.all([
          fetchUsers(),
          fetchAttendance({ date: selectedDate }),
          fetchLeaves({ status: "approved" }),
          fetchHolidays().catch(() => []),
        ]);
        if (cancelled) return;

        setEmployees((usersList || []).filter((u) => !u.isAttendanceExempt));
        setHolidays(holidayList || []);

        const att = {};
        attList.forEach((r) => {
          att[r.uid] = r;
        });
        setAttByUid(att);

        const leaves = {};
        leaveList.forEach((data) => {
          (leaves[data.uid] = leaves[data.uid] || []).push(data);
        });
        setLeavesByUid(leaves);
      } catch (err) {
        if (err?.name !== "AbortError" && !cancelled) {
          setError(err.message || "Could not load attendance.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const markAttendance = async (emp) => {
    if (!isToday) return;
    setBusyUid(emp.uid);

    try {
      const dateStr = getLocalDateStr();
      if (attByUid[emp.uid]) {
        window.alert("Is employee ki attendance pehle se lagi hui hai.");
        return;
      }

      const record = await markEmployeeAttendance({
        uid: emp.uid,
        date: dateStr,
        month: getLocalMonthStr(),
      });

      setAttByUid((prev) => ({
        ...prev,
        [emp.uid]: record,
      }));
    } catch (err) {
      window.alert(err.message || "Attendance nahi lagi.");
    } finally {
      setBusyUid(null);
    }
  };

  const selectedDateObj = new Date(selectedDate + "T00:00:00");
  const weekdayKey = getWeekdayKey(selectedDateObj);
  const holidayMap = getActiveHolidayMap(holidays);
  const selectedHolidayReason = holidayMap.get(selectedDate);
  const now = new Date();

  const handleToggleDateOff = async () => {
    if (selectedHolidayReason) {
      if (!window.confirm(`Remove official off for ${selectedDate}?`)) return;
      try {
        await deleteHoliday(selectedDate);
        const list = await fetchHolidays();
        setHolidays(list);
      } catch (err) {
        window.alert(err.message);
      }
    } else {
      const reason = window.prompt(
        `Declare Official Off for all employees on ${selectedDate}.\nChutti ki wajah (reason) likhein:`
      );
      if (!reason || !reason.trim()) return;
      try {
        await createHoliday({ date: selectedDate, reason: reason.trim() });
        const list = await fetchHolidays();
        setHolidays(list);
        window.alert(`Official Off declared for ${selectedDate}: ${reason.trim()}`);
      } catch (err) {
        window.alert(err.message);
      }
    }
  };

  const openEditTimeModal = (row) => {
    if (row.isEdited) {
      window.alert("Is din ki attendance pehle hi 1 dafa edit ho chuki hai. Dobara edit nahi ho sakti.");
      return;
    }
    let defaultTime = "10:00";
    if (row.rawCheckInTime) {
      const d = new Date(row.rawCheckInTime);
      if (!isNaN(d.getTime())) {
        const pkt = new Date(d.getTime() + 5 * 60 * 60 * 1000);
        const hh = String(pkt.getUTCHours()).padStart(2, "0");
        const mm = String(pkt.getUTCMinutes()).padStart(2, "0");
        defaultTime = `${hh}:${mm}`;
      }
    } else if (row.emp?.schedule?.[weekdayKey]) {
      defaultTime = row.emp.schedule[weekdayKey];
    }
    setEditModal({
      uid: row.uid,
      name: row.name,
      time: defaultTime,
    });
  };

  const handleSaveEditTime = async (e) => {
    e.preventDefault();
    if (!editModal || !editModal.time) return;
    setEditSaving(true);
    try {
      const updatedRecord = await editEmployeeAttendanceTime({
        uid: editModal.uid,
        date: selectedDate,
        time: editModal.time,
      });
      setAttByUid((prev) => ({
        ...prev,
        [editModal.uid]: updatedRecord,
      }));
      setEditModal(null);
    } catch (err) {
      window.alert(err.message || "Attendance time edit nahi ho saka.");
    } finally {
      setEditSaving(false);
    }
  };

  const rows = employees.map((emp) => {
    const rawRecord = attByUid[emp.uid];
    const record = rawRecord ? resolveRecordWithSchedule(rawRecord, emp.schedule) : null;
    const isScheduled = isScheduledWorkday(emp.schedule, selectedDateObj);
    const onLeave = getApprovedLeaveDates(emp.schedule, leavesByUid[emp.uid] || []).has(selectedDate);

    const base = {
      emp,
      uid: emp.uid,
      name: displayNameFor(emp),
      emergency: emp.emergencyContact || null,
      isMe: emp.uid === myUid,
      checkedIn: false,
      time: null,
      rawCheckInTime: null,
      isEdited: false,
      editedBy: "",
      early:
        (leavesByUid[emp.uid] || []).find(
          (l) => l.type === "earlyLeave" && l.date === selectedDate
        ) || null,
    };

    if (record) {
      return {
        ...base,
        checkedIn: true,
        time: formatTime12(record.checkInTime),
        rawCheckInTime: record.checkInTime,
        isEdited: Boolean(record.isEdited),
        editedBy: record.editedBy || "",
        displayStatus: statusLabel(record),
        statusKind: record.status,
      };
    }

    if (selectedHolidayReason) {
      return {
        ...base,
        displayStatus: `Official Off (${selectedHolidayReason})`,
        statusKind: "off",
      };
    }

    if (onLeave) {
      return { ...base, displayStatus: "On leave", statusKind: "leave" };
    }

    if (selectedDate > todayStr) {
      return {
        ...base,
        displayStatus: isScheduled ? "Upcoming" : weekdayKey === "sun" ? "Sunday Off" : "Day off",
        statusKind: "off",
      };
    }

    if (!isScheduled) {
      return {
        ...base,
        displayStatus: weekdayKey === "sun" ? "Sunday Off" : "Day off",
        statusKind: "off",
      };
    }

    if (isToday) {
      const st = calculateAttendanceStatus(emp.schedule, now);
      if (st.status === "on-time") {
        return { ...base, displayStatus: "Not checked in yet", statusKind: "pending" };
      }
      return {
        ...base,
        displayStatus: `Not in yet (${st.lateMinutes} min past grace)`,
        statusKind: st.status === "extreme-late" ? "extreme-late" : "late",
      };
    }

    return { ...base, displayStatus: "Absent", statusKind: "absent" };
  });

  const me = rows.find((r) => r.isMe);
  const others = rows.filter((r) => !r.isMe);
  const myCheckedIn = !!me?.checkedIn;

  const showContact = (r) =>
    !r.checkedIn &&
    ["absent", "late", "extreme-late"].includes(r.statusKind) &&
    r.emergency?.phone;

  const exportRows = rows.map((r) => ({
    name: r.name,
    displayStatus: r.displayStatus,
    time: r.time,
  }));

  return (
    <div className="daily-page">
      <header className="daily-topbar">
        <div className="daily-identity">
          <div className="daily-avatar">D</div>
          <div className="daily-identity-text">
            <span className="daily-name">Daily Attendance</span>
            <span className="daily-pill">Admin check-in</span>
          </div>
        </div>
        <button className="daily-back-btn" onClick={() => navigate("/")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
      </header>

      <section className="daily-hero">
        <div className="daily-hero-glow" />
        <p className="daily-hero-date">{isToday ? "Today" : selectedDate}</p>
        <h1 className="daily-hero-title">Mark and review attendance</h1>
        <p className="daily-hero-sub">
          Pehle apna check-in karo, phir har employee ko aate hi mark karo. Agar ghalti se mark karna bhool gaye ya time theek karna ho to 1 dafa Edit Time use karein.
        </p>
      </section>

      <section className="daily-body">
        {me && (
          <div className="daily-me-card">
            <div>
              <p className="daily-me-label">Your check-in ({selectedDate})</p>
              <p className={`daily-me-status ${statusClass(me.statusKind)}`}>
                {me.checkedIn
                  ? `${me.displayStatus} · ${me.time}`
                  : isToday
                    ? "Not checked in yet"
                    : me.displayStatus}
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              {isToday && !me.checkedIn && (
                <button
                  className="daily-checkin-btn"
                  disabled={busyUid === me.uid}
                  onClick={() => markAttendance(me.emp)}
                >
                  {busyUid === me.uid ? "Saving..." : "Check in"}
                </button>
              )}
              {isPastOrToday && (
                me.isEdited ? (
                  <span
                    style={{
                      fontSize: "11.5px",
                      color: "rgba(240,238,255,0.5)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      padding: "6px 10px",
                      borderRadius: "8px",
                    }}
                  >
                    Edited (1/1)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openEditTimeModal(me)}
                    style={{
                      background: "rgba(167, 139, 250, 0.16)",
                      border: "1px solid rgba(167, 139, 250, 0.4)",
                      color: "#e9d5ff",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Edit Time (1x)
                  </button>
                )
              )}
            </div>
          </div>
        )}

        <div className="daily-controls" style={{ flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="date"
              className="daily-date-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || todayStr)}
            />
            <button
              type="button"
              onClick={handleToggleDateOff}
              style={{
                background: selectedHolidayReason
                  ? "rgba(239, 68, 68, 0.18)"
                  : "rgba(109, 58, 255, 0.22)",
                border: selectedHolidayReason
                  ? "1px solid rgba(239, 68, 68, 0.45)"
                  : "1px solid rgba(167, 139, 250, 0.45)",
                color: selectedHolidayReason ? "#fca5a5" : "#e9d5ff",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {selectedHolidayReason
                ? `Cancel Official Off (${selectedHolidayReason})`
                : `Declare Official Off for ${selectedDate}`}
            </button>
          </div>
          {rows.length > 0 && (
            <div className="daily-export-bar">
              <button onClick={() => exportDailyToCSV(exportRows, `daily-attendance-${selectedDate}`)}>CSV</button>
              <button onClick={() => exportDailyToExcel(exportRows, `daily-attendance-${selectedDate}`)}>Excel</button>
              <button onClick={() => exportDailyToPDF(exportRows, `daily-attendance-${selectedDate}`, selectedDate)}>PDF</button>
              <button onClick={() => printElement("daily-attendance-table")}>Print</button>
            </div>
          )}
        </div>

        {isToday && me && !myCheckedIn && (
          <p className="daily-hint">Employees ke buttons tab chalenge jab tum apna check-in kar loge.</p>
        )}
        {!isToday && (
          <p className="daily-hint">
            Agar kisi employee ki attendance lagana bhool gaye thay to "Edit Time" se sirf 1 dafa attendance time set/edit kar sakte hain.
          </p>
        )}

        {error && <p className="daily-error">Error: {error}</p>}

        <div className="daily-card">
          {loading ? (
            <p className="daily-loading">Loading...</p>
          ) : others.length === 0 ? (
            <p className="daily-loading">Koi aur user nahi mila.</p>
          ) : (
            <div id="daily-attendance-table" className="daily-scroll">
              <table className="daily-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Status</th>
                    <th>Check-in Time</th>
                    <th>Emergency Contact</th>
                    {isPastOrToday && <th data-no-print>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {others.map((r) => (
                    <tr key={r.uid}>
                      <td>{r.name}</td>
                      <td className={statusClass(r.statusKind)}>
                        {r.displayStatus}
                        {r.early && (
                          <small className="daily-early-note">
                            Early leave {formatHM12(r.early.earlyLeaveTime)}
                          </small>
                        )}
                      </td>
                      <td>{r.time || "—"}</td>
                      <td>
                        {showContact(r) ? (
                          <a className="daily-contact-link" href={`tel:${r.emergency.phone}`}>
                            {r.emergency.name} ({r.emergency.relation}) · {r.emergency.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      {isPastOrToday && (
                        <td data-no-print>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                            {isToday && !r.checkedIn && (
                              <button
                                className="daily-checkin-btn small"
                                disabled={!myCheckedIn || busyUid === r.uid}
                                title={!myCheckedIn ? "Pehle apna check-in karo" : ""}
                                onClick={() => markAttendance(r.emp)}
                              >
                                {busyUid === r.uid ? "Saving..." : "Check in"}
                              </button>
                            )}
                            {r.isEdited ? (
                              <span
                                style={{
                                  fontSize: "11.5px",
                                  color: "rgba(240,238,255,0.5)",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  padding: "4px 9px",
                                  borderRadius: "6px",
                                }}
                              >
                                Edited (1/1)
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openEditTimeModal(r)}
                                style={{
                                  background: "rgba(167, 139, 250, 0.16)",
                                  border: "1px solid rgba(167, 139, 250, 0.38)",
                                  color: "#e9d5ff",
                                  padding: "5px 10px",
                                  borderRadius: "7px",
                                  fontSize: "11.5px",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Edit Time
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {editModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.72)",
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
              maxWidth: "420px",
              width: "100%",
              padding: "24px",
              color: "#f0eeff",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "18px" }}>
              Edit Check-in Time (One-Time Only)
            </h3>
            <p style={{ fontSize: "12.5px", color: "rgba(240, 238, 255, 0.68)", lineHeight: 1.5, margin: "0 0 14px" }}>
              Employee: <strong>{editModal.name}</strong> · Date: <strong>{selectedDate}</strong>
              <br />
              Note: Attendance time sirf <strong>1 dafa</strong> edit ho sakti hai.
            </p>
            <form onSubmit={handleSaveEditTime} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <label style={{ fontSize: "12.5px", display: "flex", flexDirection: "column", gap: "6px" }}>
                Select Check-in Time
                <input
                  type="time"
                  value={editModal.time}
                  onChange={(e) => setEditModal((prev) => ({ ...prev, time: e.target.value }))}
                  required
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    color: "#fff",
                    fontSize: "14px",
                  }}
                />
              </label>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => setEditModal(null)}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "none",
                    color: "#fff",
                    padding: "9px 14px",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  style={{
                    background: "linear-gradient(135deg, #6d3aff, #a78bfa)",
                    border: "none",
                    color: "#fff",
                    padding: "9px 16px",
                    borderRadius: "8px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {editSaving ? "Saving..." : "Save Time (1x Only)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default DailyAttendance;
