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
      await apiSignup({
        name: username.trim(),
        email: email.trim(),
        password,
        role,
      });

      alert("Account Created Successfully! Please complete your profile.");
      navigate("/complete-profile");
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
        <select
          className="signup-input"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{ cursor: "pointer" }}
        >
          <option value="employee">Role: Employee</option>
          <option value="admin">Role: Admin</option>
        </select>
        <br />
        <p
          className="login-forgot"
          style={{ color: "blue", cursor: "pointer", marginTop: "10px" }}
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
