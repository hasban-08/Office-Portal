import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { onPortalAuthStateChanged } from "./api";

import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Home from "./pages/Home";

import MarkAttendance from "./pages/MarkAttendance";
import MyAttendance from "./pages/MyAttendance";
import AdminAttendance from "./pages/AdminAttendance";
import ManageSalary from "./pages/ManageSalary";
import DailyAttendance from "./pages/DailyAttendance";
import ManageSchedule from "./pages/ManageSchedule";
import CompleteProfile from "./pages/CompleteProfile";

import ProtectedRoute from "./components/ProtectedRoutes";
import ProfileGate from "./components/ProfileGate";

import LeaveRequest from "./pages/LeaveRequest";
import ManageLeaveRequests from "./pages/ManageLeaveRequests";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onPortalAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) return <h2>Loading...</h2>;

  return (
    <BrowserRouter>
      <Routes>
        {user ? (
          <>
            <Route path="/complete-profile" element={<CompleteProfile />} />
            <Route path="/profile" element={<ProfileGate><CompleteProfile /></ProfileGate>} />

            <Route path="/" element={<ProfileGate><Home /></ProfileGate>} />

            <Route path="/mark-attendance" element={<ProfileGate><MarkAttendance /></ProfileGate>} />
            <Route path="/my-attendance" element={<ProfileGate><MyAttendance /></ProfileGate>} />

            <Route
              path="/employee-attendance"
              element={
                <ProfileGate>
                  <ProtectedRoute adminOnly>
                    <AdminAttendance />
                  </ProtectedRoute>
                </ProfileGate>
              }
            />
            <Route
              path="/manage-schedule"
              element={
                <ProfileGate>
                  <ProtectedRoute adminOnly>
                    <ManageSchedule />
                  </ProtectedRoute>
                </ProfileGate>
              }
            />
            <Route
              path="/manage-salary"
              element={
                <ProfileGate>
                  <ProtectedRoute adminOnly>
                    <ManageSalary />
                  </ProtectedRoute>
                </ProfileGate>
              }
            />
            <Route
              path="/daily-attendance"
              element={
                <ProfileGate>
                  <ProtectedRoute adminOnly>
                    <DailyAttendance />
                  </ProtectedRoute>
                </ProfileGate>
              }
            />

            <Route
              path="/leave-request"
              element={
                <ProtectedRoute>
                  <ProfileGate>
                    <LeaveRequest />
                  </ProfileGate>
                </ProtectedRoute>
              }
            />

            <Route
              path="/manage-leaves"
              element={
                <ProtectedRoute adminOnly>
                  <ProfileGate>
                    <ManageLeaveRequests />
                  </ProfileGate>
                </ProtectedRoute>
              }
            />

            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/home" element={<Navigate to="/login" replace />} />
            <Route path="/profile" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
