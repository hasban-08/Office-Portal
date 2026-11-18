import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiSignup } from "../api";
import "./css/Signup.css";

function Signup() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("employee");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) {
      alert("Please fill in all fields.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiSignup({
        name: username.trim(),
        email: email.trim(),
        password,
        role,
      });

      if (res?.user?.role === "admin" || role === "admin") {
        navigate("/");
      } else {
        alert("Account Created Successfully! Please complete your profile.");
        navigate("/complete-profile");
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="signup-container">
      <h1 className="signup-title">Signup</h1>

      <form className="signup-form" onSubmit={handleSignup}>
        <input
          className="signup-input"
          type="text"
          placeholder="Full Name / Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <br /><br />
        <input
          className="signup-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <br /><br />
        <input
          className="signup-input"
          type="password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <br /><br />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            textAlign: "left",
            marginBottom: "10px",
          }}
        >
          <label
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "rgba(240, 238, 255, 0.7)",
              letterSpacing: "0.3px",
            }}
          >
            Sign Up As (Portal Role)
          </label>
          <select
            className="signup-input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{
              margin: 0,
              cursor: "pointer",
              background: "#161229",
              color: "#f0eeff",
            }}
          >
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
            <option value="boss">Boss (Full Portal Access)</option>
          </select>
        </div>
        <p
          className="login-forgot"
          style={{ color: "#a78bfa", cursor: "pointer", marginTop: "10px" }}
          onClick={() => navigate("/login")}
        >
          Already have an account? Login
        </p>
        <button className="signup-btn" type="submit" disabled={submitting}>
          {submitting ? "Creating Account..." : "Signup"}
        </button>
      </form>
    </div>
  );
}

export default Signup;
