import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getCurrentUser, fetchUserById, apiLogout } from "../api";

function ProfileGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [complete, setComplete] = useState(true);
  const [deactivated, setDeactivated] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const data = await fetchUserById(currentUser.uid);
        if (!cancelled) {
          if (data && data.isActive === false) {
            setDeactivated(true);
            window.alert("Aap ka account deactivate hai! Aap portal use nahi kar sakte.");
          } else {
            setDeactivated(false);
            setComplete(!!(data && data.profileComplete && data.emergencyContact?.phone));
          }
        }
      } catch (err) {
        console.error("ProfileGate:", err);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (checking) return <h2 style={{ padding: 20 }}>Loading...</h2>;

  if (deactivated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0b0914",
          color: "#f0eeff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: "460px",
            width: "100%",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            borderRadius: "18px",
            padding: "32px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.2)",
              color: "#f87171",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              margin: "0 auto 16px",
            }}
          >
            🚫
          </div>
          <h2 style={{ margin: "0 0 10px", color: "#fca5a5" }}>
            Account Deactivated
          </h2>
          <p style={{ fontSize: "14px", color: "rgba(240,238,255,0.75)", lineHeight: 1.6 }}>
            Aap ka account Admin ki taraf se <strong>deactivate</strong> kar diya gaya hai.
            Aap ke portal ke tamam options band hain. Mazeed maloomat ke liye Admin se rabta karein.
          </p>
          <button
            type="button"
            onClick={async () => {
              await apiLogout();
              navigate("/login");
            }}
            style={{
              marginTop: "20px",
              background: "#ef4444",
              border: "none",
              color: "#fff",
              padding: "10px 24px",
              borderRadius: "10px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }

  if (!complete && location.pathname !== "/complete-profile") {
    return <Navigate to="/complete-profile" replace state={{ incomplete: true }} />;
  }

  return children;
}

export default ProfileGate;
