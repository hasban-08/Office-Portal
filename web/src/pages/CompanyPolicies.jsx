import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchPolicies,
  updatePolicies,
  getCachedPolicies,
  DEFAULT_POLICIES,
  fetchHolidays,
  createHoliday,
  deleteHoliday,
} from "../api";
import { getLocalDateStr } from "../utils/attendanceHelpers";
import "./css/ManageSchedule.css";

function CompanyPolicies() {
  const [form, setForm] = useState(() => getCachedPolicies());
  const [holidays, setHolidays] = useState([]);
  const [holidayDate, setHolidayDate] = useState(getLocalDateStr());
  const [holidayReason, setHolidayReason] = useState("");
  const [holidayBusy, setHolidayBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [policy, holidayList] = await Promise.all([
          fetchPolicies(),
          fetchHolidays().catch(() => []),
        ]);
        if (!cancelled) {
          if (policy) setForm(policy);
          setHolidays(holidayList || []);
        }
      } catch (err) {
        console.error("Failed to fetch policies:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updatePolicies({
        companyName: String(form.companyName || "The Nexus Group Co").trim(),
        graceMinutes: Math.max(0, Number(form.graceMinutes) || 0),
        extremeLateAfterGraceMinutes: Math.max(
          0,
          Number(form.extremeLateAfterGraceMinutes) || 0
        ),
        latesPerOff: Math.max(0, Number(form.latesPerOff) || 0),
        extremeLatesPerOff: Math.max(0, Number(form.extremeLatesPerOff) || 0),
        earlyLeavesPerOff: Math.max(0, Number(form.earlyLeavesPerOff) || 0),
        freeOffsPerMonth: Math.max(0, Number(form.freeOffsPerMonth) || 0),
      });
      setForm(updated);
      window.alert(
        "Company Policies save ho gayi hain! Ab poora portal aur salary calculations nayi policies par chalengi."
      );
    } catch (err) {
      window.alert(err.message || "Could not update company policies.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (!window.confirm("Reset policies to standard defaults?")) return;
    setForm({ ...DEFAULT_POLICIES });
  };

  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!holidayDate || !holidayReason.trim()) {
      window.alert("Date select karein aur chutti ki wajah (reason) likhein.");
      return;
    }
    setHolidayBusy(true);
    try {
      await createHoliday({
        date: holidayDate,
        reason: holidayReason.trim(),
      });
      const updatedList = await fetchHolidays();
      setHolidays(updatedList);
      setHolidayReason("");
      window.alert(
        `Official Off (${holidayDate}) save ho gayi hai aur sab employees ke Notice Board par wajah ke sath lag gayi hai.`
      );
    } catch (err) {
      window.alert(err.message || "Could not declare official off.");
    } finally {
      setHolidayBusy(false);
    }
  };

  const handleRemoveHoliday = async (date) => {
    if (!window.confirm(`Remove official off for ${date}?`)) return;
    setHolidayBusy(true);
    try {
      await deleteHoliday(date);
      const updatedList = await fetchHolidays();
      setHolidays(updatedList);
    } catch (err) {
      window.alert(err.message || "Could not remove official off.");
    } finally {
      setHolidayBusy(false);
    }
  };

  return (
    <div className="sched-page">
      <header className="sched-topbar">
        <div className="sched-identity">
          <div className="sched-avatar">P</div>
          <div className="sched-identity-text">
            <span className="sched-name">Company Policies & Official Offs</span>
            <span className="sched-role-pill">Admin Control</span>
          </div>
        </div>
        <button className="sched-back-btn" onClick={() => navigate("/")}>
          Back
        </button>
      </header>

      <section className="sched-hero">
        <div className="sched-hero-glow" />
        <p className="sched-hero-date">Dynamic Attendance, Payroll & Holidays</p>
        <h1 className="sched-hero-title">Company Policies</h1>
        <p className="sched-hero-sub">
          Yahan se aap Lates, Extreme Lates, Early Leaves, Grace Period aur Sab Employees ki Official Chutti (Off Day) set kar sakte hain.
        </p>
      </section>

      <section className="sched-body">
        {/* ── OFFICIAL HOLIDAY / ADMIN DECLARED OFF FOR ALL EMPLOYEES ── */}
        <div
          className="sched-card"
          style={{
            maxWidth: "780px",
            margin: "0 auto 24px",
            width: "100%",
          }}
        >
          <div className="sched-card-header">
            <span className="sched-card-title">
              Declare Official Off / Chutti for All Employees
            </span>
            <span className="sched-card-hint">
              Sunday is already Weekly Off for everyone
            </span>
          </div>

          <div style={{ padding: "20px" }}>
            <p
              style={{
                fontSize: "13px",
                color: "rgba(240,238,255,0.65)",
                marginTop: 0,
                marginBottom: "16px",
              }}
            >
              Agar kisi din sab employees ki chutti deni ho (maslan kal ya kisi bhi tarikh ko), to yahan Date aur Wajah (Reason) likh kar save kar dein. Us din kisi ki Absent nahi lagegi aur Notice Board + Attendance sheet par wajah ke sath Official Off show hoga.
            </p>

            <form
              onSubmit={handleAddHoliday}
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr auto",
                gap: "12px",
                alignItems: "end",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "#f0eeff",
                    marginBottom: "6px",
                  }}
                >
                  Off Date
                </label>
                <input
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(167,139,250,0.4)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    color: "#fff",
                    fontSize: "13.5px",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "#f0eeff",
                    marginBottom: "6px",
                  }}
                >
                  Chutti ki Wajah (Reason)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Public Holiday, Rainy Day, Eid Holiday..."
                  value={holidayReason}
                  onChange={(e) => setHolidayReason(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(167,139,250,0.4)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    color: "#fff",
                    fontSize: "13.5px",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={holidayBusy}
                style={{
                  background: "linear-gradient(135deg, #6d3aff, #a78bfa)",
                  border: "none",
                  color: "#fff",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  fontSize: "13.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                  height: "41px",
                }}
              >
                {holidayBusy ? "Saving..." : "Declare Off"}
              </button>
            </form>

            {holidays.length > 0 && (
              <div style={{ marginTop: "18px" }}>
                <div
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "#c4b5fd",
                    marginBottom: "8px",
                  }}
                >
                  Declared Official Off Days:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {holidays.map((h) => (
                    <div
                      key={h.date}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        padding: "10px 14px",
                      }}
                    >
                      <div>
                        <strong style={{ color: "#f0eeff", fontSize: "13.5px" }}>
                          {h.date}
                        </strong>
                        <span
                          style={{
                            color: "rgba(240,238,255,0.75)",
                            fontSize: "13px",
                            marginLeft: "10px",
                          }}
                        >
                          — {h.reason}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={holidayBusy}
                        onClick={() => handleRemoveHoliday(h.date)}
                        style={{
                          background: "rgba(239, 68, 68, 0.16)",
                          border: "1px solid rgba(239, 68, 68, 0.4)",
                          color: "#fca5a5",
                          padding: "5px 12px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── ATTENDANCE & SALARY DEDUCTION POLICIES ── */}
        <div
          className="sched-card"
          style={{ maxWidth: "780px", margin: "0 auto", width: "100%" }}
        >
          <div className="sched-card-header">
            <span className="sched-card-title">
              Configure Attendance & Salary Deduction Rules
            </span>
            <span className="sched-card-hint">
              Set 0 to disable off counting on any metric
            </span>
          </div>

          {loading ? (
            <p className="sched-empty">Loading company policies...</p>
          ) : (
            <form onSubmit={handleSave} style={{ padding: "20px" }}>
              {/* Live Summary Banner */}
              <div
                style={{
                  background: "rgba(109, 58, 255, 0.12)",
                  border: "1px solid rgba(167, 139, 250, 0.35)",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "22px",
                  color: "#f0eeff",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "14px",
                    marginBottom: "8px",
                    color: "#c4b5fd",
                  }}
                >
                  Current Active Rules Summary:
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                    gap: "8px",
                    fontSize: "13px",
                  }}
                >
                  <div>
                    • Lates:{" "}
                    <strong>
                      {Number(form.latesPerOff) > 0
                        ? `${form.latesPerOff} Lates = 1 Off`
                        : "No Off Counted (0)"}
                    </strong>
                  </div>
                  <div>
                    • Extreme Lates:{" "}
                    <strong>
                      {Number(form.extremeLatesPerOff) > 0
                        ? `${form.extremeLatesPerOff} Extreme Late = 1 Off`
                        : "No Off Counted (0)"}
                    </strong>
                  </div>
                  <div>
                    • Early Leaves:{" "}
                    <strong>
                      {Number(form.earlyLeavesPerOff) > 0
                        ? `${form.earlyLeavesPerOff} Early Leaves = 1 Off`
                        : "No Off Counted (0)"}
                    </strong>
                  </div>
                  <div>
                    • Free Offs:{" "}
                    <strong>{form.freeOffsPerMonth} Free Off(s) / Month</strong>
                  </div>
                  <div>
                    • Grace Period: <strong>{form.graceMinutes} mins</strong>
                  </div>
                  <div>
                    • Weekly Off: <strong>Sunday Off</strong>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "18px",
                }}
              >
                {/* Lates Per Off */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    padding: "16px",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontWeight: 600,
                      fontSize: "14px",
                      color: "#f0eeff",
                      marginBottom: "6px",
                    }}
                  >
                    Kitni Lates par 1 Off ho? (0 = No Off)
                  </label>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "rgba(240,238,255,0.55)",
                      margin: "0 0 10px",
                    }}
                  >
                    Maslan 3 ya 4 likhenge to utni Lates par 1 Off count hoga. (0 = Koi Off nahi).
                  </p>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.latesPerOff}
                    onChange={(e) => handleChange("latesPerOff", e.target.value)}
                    required
                    style={{
                      width: "100%",
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(167,139,250,0.4)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#fff",
                      fontSize: "15px",
                      fontWeight: 600,
                    }}
                  />
                </div>

                {/* Extreme Lates Per Off */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    padding: "16px",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontWeight: 600,
                      fontSize: "14px",
                      color: "#f0eeff",
                      marginBottom: "6px",
                    }}
                  >
                    Kitni Extreme Lates par 1 Off ho? (Default: 0)
                  </label>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "rgba(240,238,255,0.55)",
                      margin: "0 0 10px",
                    }}
                  >
                    0 ka matlab Extreme Late par koi Off count nahi hoga. Agar chahiye to 1 ya 2 likh dein.
                  </p>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.extremeLatesPerOff}
                    onChange={(e) =>
                      handleChange("extremeLatesPerOff", e.target.value)
                    }
                    required
                    style={{
                      width: "100%",
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(167,139,250,0.4)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#fff",
                      fontSize: "15px",
                      fontWeight: 600,
                    }}
                  />
                </div>

                {/* Early Leaves Per Off */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    padding: "16px",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontWeight: 600,
                      fontSize: "14px",
                      color: "#f0eeff",
                      marginBottom: "6px",
                    }}
                  >
                    Kitni Early Leaves par 1 Off ho? (Default: 0)
                  </label>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "rgba(240,238,255,0.55)",
                      margin: "0 0 10px",
                    }}
                  >
                    0 ka matlab Early Leave par koi Off count nahi hoga. Agar chahiye to 2 ya 3 likh dein.
                  </p>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.earlyLeavesPerOff}
                    onChange={(e) =>
                      handleChange("earlyLeavesPerOff", e.target.value)
                    }
                    required
                    style={{
                      width: "100%",
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(167,139,250,0.4)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#fff",
                      fontSize: "15px",
                      fontWeight: 600,
                    }}
                  />
                </div>

                {/* Free Offs Per Month */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    padding: "16px",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontWeight: 600,
                      fontSize: "14px",
                      color: "#f0eeff",
                      marginBottom: "6px",
                    }}
                  >
                    Mahine mein kitni Free Offs allowed hain?
                  </label>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "rgba(240,238,255,0.55)",
                      margin: "0 0 10px",
                    }}
                  >
                    Default 2 Free Offs/month hai jin par salary deduct nahi hoti.
                  </p>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.freeOffsPerMonth}
                    onChange={(e) =>
                      handleChange("freeOffsPerMonth", e.target.value)
                    }
                    required
                    style={{
                      width: "100%",
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(167,139,250,0.4)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#fff",
                      fontSize: "15px",
                      fontWeight: 600,
                    }}
                  />
                </div>

                {/* Grace Period Minutes */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    padding: "16px",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontWeight: 600,
                      fontSize: "14px",
                      color: "#f0eeff",
                      marginBottom: "6px",
                    }}
                  >
                    Grace Period (Minutes)
                  </label>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "rgba(240,238,255,0.55)",
                      margin: "0 0 10px",
                    }}
                  >
                    Shift time ke baad kitne minutes tak On-Time maana jaye (Default: 20m).
                  </p>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.graceMinutes}
                    onChange={(e) => handleChange("graceMinutes", e.target.value)}
                    required
                    style={{
                      width: "100%",
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(167,139,250,0.4)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#fff",
                      fontSize: "15px",
                      fontWeight: 600,
                    }}
                  />
                </div>

                {/* Extreme Late Window Minutes */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "12px",
                    padding: "16px",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      fontWeight: 600,
                      fontSize: "14px",
                      color: "#f0eeff",
                      marginBottom: "6px",
                    }}
                  >
                    Grace ke kitne minutes baad Extreme Late ho?
                  </label>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "rgba(240,238,255,0.55)",
                      margin: "0 0 10px",
                    }}
                  >
                    Default: 30m after grace (yani total 50m late hone par Extreme Late).
                  </p>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.extremeLateAfterGraceMinutes}
                    onChange={(e) =>
                      handleChange(
                        "extremeLateAfterGraceMinutes",
                        e.target.value
                      )
                    }
                    required
                    style={{
                      width: "100%",
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(167,139,250,0.4)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#fff",
                      fontSize: "15px",
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

              {/* Company Name for Reports */}
              <div
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  padding: "16px",
                  marginTop: "18px",
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontWeight: 600,
                    fontSize: "14px",
                    color: "#f0eeff",
                    marginBottom: "6px",
                  }}
                >
                  Company Name (Shown on PDF, Excel & Print Reports)
                </label>
                <input
                  type="text"
                  value={form.companyName || ""}
                  onChange={(e) => handleChange("companyName", e.target.value)}
                  placeholder="The Nexus Group Co"
                  style={{
                    width: "100%",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(167,139,250,0.4)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    color: "#fff",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "flex-end",
                  marginTop: "22px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    color: "#f0eeff",
                    padding: "10px 18px",
                    borderRadius: "10px",
                    fontSize: "13.5px",
                    cursor: "pointer",
                  }}
                >
                  Reset to Default
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: "linear-gradient(135deg, #6d3aff, #a78bfa)",
                    border: "none",
                    color: "#fff",
                    padding: "10px 24px",
                    borderRadius: "10px",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {saving ? "Saving Policies..." : "Save Company Policies"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

export default CompanyPolicies;
