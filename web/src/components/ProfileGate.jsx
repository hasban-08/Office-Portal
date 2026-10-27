import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser, fetchUserById } from "../api";

function ProfileGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [complete, setComplete] = useState(true);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const data = await fetchUserById(currentUser.uid);
        if (!cancelled) {
          setComplete(!!(data && data.profileComplete && data.emergencyContact?.phone));
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

  if (!complete && location.pathname !== "/complete-profile") {
    return <Navigate to="/complete-profile" replace state={{ incomplete: true }} />;
  }

  return children;
}

export default ProfileGate;
