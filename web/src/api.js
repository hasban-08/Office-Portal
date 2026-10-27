const API_BASE =
  process.env.REACT_APP_API_URL ||
  `http://${window.location.hostname || "localhost"}:5000/api`;

const TOKEN_KEY = "office_portal_token";
const USER_KEY = "office_portal_user";

let currentUser = null;
try {
  const saved = localStorage.getItem(USER_KEY);
  if (saved) currentUser = JSON.parse(saved);
} catch {
  currentUser = null;
}

const listeners = new Set();

function notifyListeners() {
  listeners.forEach((cb) => {
    try {
      cb(currentUser);
    } catch (e) {
      console.error(e);
    }
  });
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser() {
  return currentUser;
}

export function setAuthSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) {
    const normalized = {
      ...user,
      displayName: user.fullName || user.name || "Employee",
      emailVerified: true,
    };
    currentUser = normalized;
    localStorage.setItem(USER_KEY, JSON.stringify(normalized));
  }
  notifyListeners();
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  currentUser = null;
  notifyListeners();
}

export function onPortalAuthStateChanged(callback) {
  listeners.add(callback);
  const token = getToken();
  if (!token) {
    clearAuthSession();
    callback(null);
  } else {
    if (currentUser) callback(currentUser);
    apiRequest("/auth/me")
      .then((data) => {
        if (data?.user) {
          setAuthSession(token, data.user);
        } else {
          clearAuthSession();
        }
      })
      .catch(() => {
        if (!currentUser) callback(null);
      });
  }
  return () => listeners.delete(callback);
}

export async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login") {
      clearAuthSession();
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// -----------------------------------------
// Auth API
// -----------------------------------------
export async function apiSignup({ name, email, password, role }) {
  const data = await apiRequest("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password, role }),
  });
  setAuthSession(data.token, data.user);
  return data;
}

export async function apiLogin({ email, password }) {
  const data = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAuthSession(data.token, data.user);
  return data;
}

export async function apiLogout() {
  clearAuthSession();
}

export async function apiResetPassword({ email, newPassword }) {
  return apiRequest("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, newPassword }),
  });
}

// -----------------------------------------
// Users & Profile API
// -----------------------------------------
export async function fetchUsers() {
  const data = await apiRequest("/users");
  return data.users || [];
}

export async function fetchUserById(uid) {
  const data = await apiRequest(`/users/${uid}`);
  return data.user || null;
}

export async function updateUserById(uid, payload) {
  const data = await apiRequest(`/users/${uid}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (currentUser && currentUser.uid === uid && data.user) {
    setAuthSession(getToken(), data.user);
  }
  return data.user;
}

// -----------------------------------------
// Attendance API
// -----------------------------------------
export async function fetchAttendance(params = {}) {
  const qs = new URLSearchParams();
  if (params.uid) qs.set("uid", params.uid);
  if (params.date) qs.set("date", params.date);
  if (params.month) qs.set("month", params.month);
  const queryStr = qs.toString() ? `?${qs.toString()}` : "";
  const data = await apiRequest(`/attendance${queryStr}`);
  return data.records || [];
}

export async function markEmployeeAttendance({ uid, date, month }) {
  const data = await apiRequest("/attendance/mark", {
    method: "POST",
    body: JSON.stringify({ uid, date, month }),
  });
  return data.record;
}

// -----------------------------------------
// Leave Requests API
// -----------------------------------------
export async function fetchLeaves(params = {}) {
  const qs = new URLSearchParams();
  if (params.uid) qs.set("uid", params.uid);
  if (params.status) qs.set("status", params.status);
  const queryStr = qs.toString() ? `?${qs.toString()}` : "";
  const data = await apiRequest(`/leaves${queryStr}`);
  return data.requests || [];
}

export async function createLeaveRequest(payload) {
  const data = await apiRequest("/leaves", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data;
}

export async function updateLeaveStatus(id, { status, adminComment }) {
  const data = await apiRequest(`/leaves/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status, adminComment }),
  });
  return data;
}

// -----------------------------------------
// Announcements API
// -----------------------------------------
export async function fetchAnnouncements(limit = 4) {
  const data = await apiRequest(`/announcements?limit=${limit}`);
  return data.announcements || [];
}

export async function createAnnouncement({ message, author }) {
  const data = await apiRequest("/announcements", {
    method: "POST",
    body: JSON.stringify({ message, author }),
  });
  return data;
}

export async function deleteAnnouncement(id) {
  return apiRequest(`/announcements/${id}`, {
    method: "DELETE",
  });
}

// -----------------------------------------
// SMTP Settings API (Admin)
// -----------------------------------------
export async function fetchSmtpSettings() {
  return apiRequest("/settings/smtp");
}

export async function saveSmtpSettings(payload) {
  return apiRequest("/settings/smtp", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
