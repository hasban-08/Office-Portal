import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, fetchLeaves, createLeaveRequest } from "../api";
import { getLocalDateStr } from "../utils/attendanceHelpers";
import "./css/LeaveRequest.css";

function LeaveRequest() {
  const navigate = useNavigate();
  const user = getCurrentUser();

  const [requestType, setRequestType] = useState("leave");
  const [startDate, setStartDate] = useState(getLocalDateStr());
  const [endDate, setEndDate] = useState(getLocalDateStr());
  const [earlyLeaveTime, setEarlyLeaveTime] = useState("");
  const [reason, setReason] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    let cancelled = false;

    async function loadPage() {
      try {
        const rows = await fetchLeaves({ uid: user.uid });
        if (!cancelled) setRequests(rows);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load requests.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPage();

    return () => {
      cancelled = true;
    };
  }, [user, navigate]);

  async function refreshRequests() {
    if (!user) return;
    const rows = await fetchLeaves({ uid: user.uid });
    setRequests(rows);
  }

  async function handleProcessRequest(event) {
    event.preventDefault();
    setError("");

    if (!user) {
      setError("Please log in again.");
      return;
    }

    if (!reason.trim()) {
      setError("Please enter a reason.");
      return;
    }

    if (requestType === "leave") {
      if (!startDate || !endDate || endDate < startDate) {
        setError("Please select valid leave dates.");
        return;
      }
    } else {
      if (!startDate || !earlyLeaveTime) {
        setError("Please select the date and early departure time.");
        return;
      }
    }

    setIsProcessing(true);

    try {
      const payload = {
        type: requestType,
        reason: reason.trim(),
      };

      if (requestType === "leave") {
        payload.startDate = startDate;
        payload.endDate = endDate;
      } else {
        payload.date = startDate;
        payload.earlyLeaveTime = earlyLeaveTime;
      }

      const res = await createLeaveRequest(payload);

      setReason("");
      setEarlyLeaveTime("");
      await refreshRequests();

      if (res?.emailStatus?.sent) {
        window.alert(
          "✅ Request sent! Admin has been notified via email and will review your request."
        );
      } else {
        window.alert(
          "Request saved! It is waiting for admin approval."
        );
      }
    } catch (err) {
      setError(err.message || "Could not process your request.");
    } finally {
      setIsProcessing(false);
    }
  }

  function formatRequestType(type) {
    return type === "earlyLeave" ? "Early Leave" : "Leave";
  }

  return (
    <main className="leave-req-page">
      <header className="leave-req-topbar">
        <div className="leave-req-identity">
          <div className="leave-req-avatar">L</div>
          <div className="leave-req-identity-text">
            <span className="leave-req-name">Leave & Early Leave</span>
            <span className="leave-req-pill">Employee Portal</span>
          </div>
        </div>
        <button className="leave-req-back-btn" onClick={() => navigate("/")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
      </header>

      <section className="leave-req-panel">
        <h2>New Request</h2>

        <form onSubmit={handleProcessRequest} className="leave-req-form">
          <label>
            Request Type
            <select
              value={requestType}
              onChange={(event) => setRequestType(event.target.value)}
            >
              <option value="leave">Leave</option>
              <option value="earlyLeave">Early Leave</option>
            </select>
          </label>

          <label>
            {requestType === "leave" ? "Start Date" : "Date"}
            <input
              type="date"
              value={startDate}
              min={getLocalDateStr()}
              onChange={(event) => {
                setStartDate(event.target.value);

                if (endDate < event.target.value) {
                  setEndDate(event.target.value);
                }
              }}
              required
            />
          </label>

          {requestType === "leave" ? (
            <label>
              End Date
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </label>
          ) : (
            <label>
              Expected Departure Time
              <input
                type="time"
                value={earlyLeaveTime}
                onChange={(event) => setEarlyLeaveTime(event.target.value)}
                required
              />
            </label>
          )}

          <label>
            Reason
            <textarea
              rows={4}
              maxLength={1000}
              placeholder={
                requestType === "leave"
                  ? "Explain why you need leave..."
                  : "Explain why you need to leave early..."
              }
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </label>

          {error && <p className="leave-req-error">{error}</p>}

          <button className="leave-req-send-btn" disabled={isProcessing}>
            {isProcessing ? "Processing..." : "Send Request"}
          </button>
        </form>
      </section>

      <section className="leave-req-panel">
        <h2>My Requests</h2>

        {loading ? (
          <p className="leave-req-empty">Loading requests...</p>
        ) : requests.length === 0 ? (
          <p className="leave-req-empty">You have not added any requests yet.</p>
        ) : (
          <div className="leave-req-list">
            {requests.map((item) => (
              <article className="leave-req-card" key={item.id}>
                <div className="leave-req-card-heading">
                  <strong>{formatRequestType(item.type)}</strong>
                  <span
                    className={`leave-req-status leave-req-status-${item.status || "pending"}`}
                  >
                    {item.status || "pending"}
                  </span>
                </div>

                <p>
                  <strong>Date: </strong>
                  {item.type === "earlyLeave"
                    ? item.date
                    : `${item.startDate} to ${item.endDate}`}
                </p>

                {item.type === "earlyLeave" && (
                  <p>
                    <strong>Departure: </strong>
                    {item.earlyLeaveTime}
                  </p>
                )}

                <p>
                  <strong>Reason: </strong>
                  {item.reason}
                </p>

                {item.adminComment && (
                  <p>
                    <strong>Admin comment: </strong>
                    {item.adminComment}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default LeaveRequest;
