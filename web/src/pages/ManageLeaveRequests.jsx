import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, fetchLeaves, updateLeaveStatus } from "../api";
import { exportLeavesToExcel, exportLeavesToPDF } from "../utils/exportAttendance";
import "./css/ManageLeaveRequests.css";

function ManageLeaveRequests() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [filter, setFilter] = useState("pending");
  const [comments, setComments] = useState({});
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const list = await fetchLeaves();
      setRequests(list);
    } catch (err) {
      setError(err.message || "Could not load leave requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getCurrentUser()) {
      navigate("/login");
      return;
    }

    loadRequests();
  }, [navigate, loadRequests]);

  async function updateRequest(request, status) {
    if (!getCurrentUser()) {
      setError("Please log in again.");
      return;
    }

    const confirmed = window.confirm(
      `${status === "approved" ? "Approve" : "Reject"} this request?`
    );

    if (!confirmed) return;

    setBusyId(request.id);
    setError("");

    try {
      const res = await updateLeaveStatus(request.id, {
        status,
        adminComment: (comments[request.id] || "").trim(),
      });

      await loadRequests();
      if (res?.emailStatus?.sent) {
        window.alert(`✅ Request ${status} & email notification sent to ${request.employeeEmail}!`);
      }
    } catch (err) {
      setError(err.message || "Could not update this request.");
    } finally {
      setBusyId("");
    }
  }

  const filteredRequests =
    filter === "all"
      ? requests
      : requests.filter((item) => (item.status || "pending") === filter);

  function requestTypeLabel(type) {
    return type === "earlyLeave" ? "Early Leave" : "Leave";
  }

  return (
    <main className="manage-leaves-page">
      <header className="manage-leaves-topbar">
        <div className="manage-leaves-identity">
          <div className="manage-leaves-avatar">M</div>
          <div className="manage-leaves-identity-text">
            <span className="manage-leaves-name">Leave Requests</span>
            <span className="manage-leaves-pill">Admin Panel</span>
          </div>
        </div>
        <button className="manage-leaves-back-btn" onClick={() => navigate("/")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
      </header>

      <section className="manage-leaves-panel">
        <div className="manage-leaves-toolbar" style={{ flexWrap: "wrap", gap: "10px" }}>
          <label>
            Show
            <select
              className="manage-leaves-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All requests</option>
            </select>
          </label>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {filteredRequests.length > 0 && (
              <>
                <button
                  type="button"
                  className="manage-leaves-refresh"
                  onClick={() =>
                    exportLeavesToExcel(filteredRequests, `leave-requests-${filter}`)
                  }
                >
                  Excel
                </button>
                <button
                  type="button"
                  className="manage-leaves-refresh"
                  onClick={() =>
                    exportLeavesToPDF(filteredRequests, `leave-requests-${filter}`, filter)
                  }
                >
                  PDF
                </button>
              </>
            )}
            <button
              type="button"
              className="manage-leaves-refresh"
              onClick={loadRequests}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>

        {error && <p className="manage-leaves-error">{error}</p>}

        {loading ? (
          <p className="manage-leaves-empty">Loading requests...</p>
        ) : filteredRequests.length === 0 ? (
          <p className="manage-leaves-empty">No requests found for this filter.</p>
        ) : (
          <div className="manage-leaves-list">
            {filteredRequests.map((request) => (
              <article className="manage-leaves-card" key={request.id}>
                <div className="manage-leaves-card-top">
                  <div className="manage-leaves-card-user">
                    <h2>{request.employeeName || "Employee"}</h2>
                    <p>{request.employeeEmail || request.uid}</p>
                  </div>

                  <span
                    className={`manage-leaves-status manage-leaves-status-${request.status || "pending"}`}
                  >
                    {request.status || "pending"}
                  </span>
                </div>

                <div className="manage-leaves-card-details">
                  <p>
                    <strong>Type: </strong>
                    {requestTypeLabel(request.type)}
                  </p>

                  <p>
                    <strong>Date: </strong>
                    {request.type === "earlyLeave"
                      ? request.date
                      : `${request.startDate} to ${request.endDate}`}
                  </p>

                  {request.type === "earlyLeave" && (
                    <p>
                      <strong>Expected departure: </strong>
                      {request.earlyLeaveTime}
                    </p>
                  )}

                  <p>
                    <strong>Reason: </strong>
                    {request.reason}
                  </p>
                </div>

                {request.status === "pending" && (
                  <div className="manage-leaves-review-sec">
                    <label className="manage-leaves-comment">
                      Admin comment (optional)
                      <textarea
                        rows={2}
                        value={comments[request.id] || ""}
                        onChange={(e) =>
                          setComments((prev) => ({
                            ...prev,
                            [request.id]: e.target.value,
                          }))
                        }
                        placeholder="Add a note for the employee..."
                      />
                    </label>

                    <div className="manage-leaves-actions">
                      <button
                        type="button"
                        className="manage-leaves-approve"
                        disabled={busyId === request.id}
                        onClick={() => updateRequest(request, "approved")}
                      >
                        {busyId === request.id ? "Saving..." : "Approve"}
                      </button>

                      <button
                        type="button"
                        className="manage-leaves-reject"
                        disabled={busyId === request.id}
                        onClick={() => updateRequest(request, "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}

                {request.adminComment && (
                  <p className="manage-leaves-admin-note">
                    <strong>Admin comment: </strong>
                    {request.adminComment}
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

export default ManageLeaveRequests;
