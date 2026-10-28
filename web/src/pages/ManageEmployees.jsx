import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, fetchUsers, updateUserById } from "../api";
import "./css/ManageSchedule.css";

function displayNameFor(emp) {
  if (emp.name && emp.name.trim() && emp.name.trim().toLowerCase() !== "user") {
    return emp.name;
  }
  if (emp.personalInfo?.fullName?.trim()) return emp.personalInfo.fullName;
  if (emp.email) return emp.email.split("@")[0];
  return "Employee";
}

function ManageEmployees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState(null);
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const list = await fetchUsers();
        setEmployees(list);
      } catch (err) {
        window.alert(err.message || "Could not load employees.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleToggleAdmin = async (emp) => {
    if (emp.uid === currentUser?.uid) {
      window.alert("Aap apna khud ka Admin role nahi hata sakte.");
      return;
    }
    const nextRole = emp.role === "admin" ? "employee" : "admin";
    const confirmMsg =
      nextRole === "admin"
        ? `Make ${displayNameFor(emp)} an Admin?`
        : `Remove Admin rights from ${displayNameFor(emp)} and set as Employee?`;

    if (!window.confirm(confirmMsg)) return;

    setBusyUid(emp.uid);
    try {
      const updated = await updateUserById(emp.uid, { role: nextRole });
      setEmployees((prev) =>
        prev.map((e) => (e.uid === emp.uid ? updated : e))
      );
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusyUid(null);
    }
  };

  const handleToggleActive = async (emp) => {
    if (emp.uid === currentUser?.uid) {
      window.alert("Aap apna khud ka account deactivate nahi kar sakte.");
      return;
    }
    const currentlyActive = emp.isActive !== false;
    const nextActive = !currentlyActive;
    const confirmMsg = nextActive
      ? `Activate ${displayNameFor(emp)}'s portal account?`
      : `Deactivate ${displayNameFor(emp)}'s portal account? Unka portal foran band ho jayega.`;

    if (!window.confirm(confirmMsg)) return;

    setBusyUid(emp.uid);
    try {
      const updated = await updateUserById(emp.uid, { isActive: nextActive });
      setEmployees((prev) =>
        prev.map((e) => (e.uid === emp.uid ? updated : e))
      );
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="sched-page">
      <header className="sched-topbar">
        <div className="sched-identity">
          <div className="sched-avatar">M</div>
          <div className="sched-identity-text">
            <span className="sched-name">Manage All Employees</span>
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
        <p className="sched-hero-date">Roles & Access Control</p>
        <h1 className="sched-hero-title">Manage All Employees</h1>
        <p className="sched-hero-sub">
          Kisi bhi employee ko Admin banayein, uski details edit karein, ya uska portal Deactivate / Activate karein.
        </p>
      </section>

      <section className="sched-body">
        <div className="sched-card" style={{ maxWidth: "860px", margin: "0 auto", width: "100%" }}>
          <div className="sched-card-header">
            <span className="sched-card-title">
              All Registered Employees ({employees.length})
            </span>
            <span className="sched-card-hint">
              Actions apply immediately
            </span>
          </div>

          {loading ? (
            <p className="sched-empty">Loading employees...</p>
          ) : employees.length === 0 ? (
            <p className="sched-empty">No employees found.</p>
          ) : (
            <div className="sched-days">
              {employees.map((emp) => {
                const name = displayNameFor(emp);
                const isAdminRole = emp.role === "admin";
                const isActive = emp.isActive !== false;
                const isMe = emp.uid === currentUser?.uid;

                return (
                  <div
                    className="sched-day-row"
                    key={emp.uid}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "12px",
                      padding: "14px 16px",
                      opacity: isActive ? 1 : 0.65,
                    }}
                  >
                    {/* Employee Name + Avatar + Badges */}
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {emp.photoURL ? (
                        <img
                          src={emp.photoURL}
                          alt={name}
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "50%",
                            objectFit: "cover",
                            border: "1.5px solid #a78bfa",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #6d3aff, #a78bfa)",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: "15px",
                          }}
                        >
                          {name.charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, fontSize: "15px", color: "#f0eeff" }}>
                            {name} {isMe && "(You)"}
                          </span>

                          <span
                            style={{
                              fontSize: "11px",
                              padding: "2px 8px",
                              borderRadius: "999px",
                              fontWeight: 600,
                              background: isAdminRole
                                ? "rgba(167, 139, 250, 0.22)"
                                : "rgba(255, 255, 255, 0.08)",
                              color: isAdminRole ? "#c4b5fd" : "rgba(240,238,255,0.7)",
                              border: isAdminRole
                                ? "1px solid rgba(167, 139, 250, 0.4)"
                                : "1px solid rgba(255,255,255,0.12)",
                            }}
                          >
                            {isAdminRole ? "Admin" : "Employee"}
                          </span>

                          <span
                            style={{
                              fontSize: "11px",
                              padding: "2px 8px",
                              borderRadius: "999px",
                              fontWeight: 600,
                              background: isActive
                                ? "rgba(34, 197, 94, 0.16)"
                                : "rgba(239, 68, 68, 0.2)",
                              color: isActive ? "#4ade80" : "#f87171",
                              border: isActive
                                ? "1px solid rgba(34, 197, 94, 0.35)"
                                : "1px solid rgba(239, 68, 68, 0.4)",
                            }}
                          >
                            {isActive ? "Active" : "Deactivated"}
                          </span>
                        </div>
                        <small style={{ color: "rgba(240,238,255,0.5)", fontSize: "12px" }}>
                          {emp.email}
                        </small>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/profile?uid=${emp.uid}`)}
                        style={{
                          background: "rgba(255, 255, 255, 0.07)",
                          border: "1px solid rgba(255, 255, 255, 0.16)",
                          color: "#f0eeff",
                          padding: "7px 12px",
                          borderRadius: "8px",
                          fontSize: "12.5px",
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        Edit Profile
                      </button>

                      {!isMe && (
                        <>
                          <button
                            type="button"
                            disabled={busyUid === emp.uid}
                            onClick={() => handleToggleAdmin(emp)}
                            style={{
                              background: isAdminRole
                                ? "rgba(251, 191, 36, 0.15)"
                                : "linear-gradient(135deg, #6d3aff, #8b5cf6)",
                              border: isAdminRole
                                ? "1px solid rgba(251, 191, 36, 0.4)"
                                : "none",
                              color: isAdminRole ? "#fde68a" : "#fff",
                              padding: "7px 14px",
                              borderRadius: "8px",
                              fontSize: "12.5px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {isAdminRole ? "Remove Admin" : "Make Admin"}
                          </button>

                          <button
                            type="button"
                            disabled={busyUid === emp.uid}
                            onClick={() => handleToggleActive(emp)}
                            style={{
                              background: isActive
                                ? "rgba(239, 68, 68, 0.18)"
                                : "rgba(34, 197, 94, 0.2)",
                              border: isActive
                                ? "1px solid rgba(239, 68, 68, 0.45)"
                                : "1px solid rgba(34, 197, 94, 0.45)",
                              color: isActive ? "#fca5a5" : "#86efac",
                              padding: "7px 14px",
                              borderRadius: "8px",
                              fontSize: "12.5px",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {isActive ? "Deactivate" : "Activate"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default ManageEmployees;
