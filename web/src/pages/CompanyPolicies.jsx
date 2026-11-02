import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchPolicies,
  updatePolicies,
  getCachedPolicies,
  DEFAULT_POLICIES,
} from "../api";
import "./css/ManageSchedule.css";

function CompanyPolicies() {
  const [form, setForm] = useState(() => getCachedPolicies());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const policy = await fetchPolicies();
        if (!cancelled && policy) {
          setForm(policy);
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
        latesPerOff: Math.max(1, Number(form.latesPerOff) || 1),
        extremeLatesPerOff: Math.max(1, Number(form.extremeLatesPerOff) || 1),
        earlyLeavesPerOff: Math.max(1, Number(form.earlyLeavesPerOff) || 1),
        freeOffsPerMonth: Math.max(0, Number(form.freeOffsPerMonth) || 0),
      });
      setForm(updated);
      window.alert(
        "✅ Company Policies save ho gayi hain! Ab poora portal aur salary calculations nayi policies par chalengi."
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

  return (
    <div className="sched-page">
      <header className="sched-topbar">
        <div className="sched-identity">
          <div className="sched-avatar">P</div>
          <div className="sched-identity-text">
            <span className="sched-name">Company Policies</span>
            <span className="sched-role-pill">Admin Control</span>
          </div>
        </div>
        <button className="sched-back-btn" onClick={() => navigate("/")}>
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
      </header>

      <section className="sched-hero">
        <div className="sched-hero-glow" />
        <p className="sched-hero-date">Dynamic Attendance & Payroll Rules</p>
        <h1 className="sched-hero-title">Company Policies</h1>
        <p className="sched-hero-sub">
          Yahan se aap Lates, Extreme Lates, Early Leaves, Grace Period aur Monthly Free Offs ke rules khud set kar sakte hain — code chhedne ki zaroorat nahi!
        </p>
      </section>

      <section className="sched-body">
        <div
          className="sched-card"
          style={{ maxWidth: "780px", margin: "0 auto", width: "100%" }}
        >
          <div className="sched-card-header">
            <span className="sched-card-title">
              Configure Attendance & Salary Deduction Rules
            </span>
            <span className="sched-card-hint">
              Saved directly in PostgreSQL Database
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
                  📋 Current Active Rules Summary:
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
                    • <strong>{form.latesPerOff} Lates</strong> = 1 Off
                  </div>
                  <div>
                    • <strong>{form.extremeLatesPerOff} Extreme Late(s)</strong> = 1 Off
                  </div>
                  <div>
                    • <strong>{form.earlyLeavesPerOff} Early Leaves</strong> = 1 Off
                  </div>
                  <div>
                    • <strong>{form.freeOffsPerMonth} Free Off(s)</strong> Allowed / Month
                  </div>
                  <div>
                    • Grace Period: <strong>{form.graceMinutes} mins</strong>
                  </div>
                  <div>
                    • Extreme Late: <strong>&gt; {Number(form.graceMinutes) + Number(form.extremeLateAfterGraceMinutes)} mins</strong> after shift start
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
                    Kitni Lates par 1 Off ho? (Lates = 1 Off)
                  </label>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "rgba(240,238,255,0.55)",
                      margin: "0 0 10px",
                    }}
                  >
                    Maslan agar aap 4 likhenge to 4 Lates par 1 Off count hoga.
                  </p>
                  <input
                    type="number"
                    min="1"
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
                    Kitni Extreme Lates par 1 Off ho?
                  </label>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "rgba(240,238,255,0.55)",
                      margin: "0 0 10px",
                    }}
                  >
                    Default 1 hai (1 Extreme Late = 1 Off). Aap 2 ya 3 bhi kar sakte hain.
                  </p>
                  <input
                    type="number"
                    min="1"
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
                    Kitni Early Leaves par 1 Off ho?
                  </label>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "rgba(240,238,255,0.55)",
                      margin: "0 0 10px",
                    }}
                  >
                    Default 2 hai (2 Approved Early Leaves = 1 Off).
                  </p>
                  <input
                    type="number"
                    min="1"
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
                  {saving ? "Saving Policies..." : "💾 Save Company Policies"}
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
