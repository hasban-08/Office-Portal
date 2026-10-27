import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getCurrentUser, fetchUserById } from "../api";

function ProtectedRoute({ children, adminOnly = false }) {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const fresh = await fetchUserById(currentUser.uid);
        if (!cancelled) {
          setIsAdmin(fresh?.role === "admin");
        }
      } catch (err) {
        console.error("ProtectedRoute:", err);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) return <h2 style={{ padding: 20 }}>Loading...</h2>;

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
