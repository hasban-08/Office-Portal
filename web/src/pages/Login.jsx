import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiLogin, apiResetPassword } from "../api";
import "./css/Login.css";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginAs, setLoginAs] = useState("employee");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [show, setShow] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiLogin({ email, password, loginAs });
      navigate("/");
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      const res = await apiResetPassword({
        email: resetEmail,
        newPassword: newPassword || undefined,
      });
      alert(res.message || "Password updated.");
      setShow(false);
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <div className="login-container">
      <h1 className="login-title">Login</h1>

      <form className="login-form" onSubmit={handleLogin}>
        <input
          className="login-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <br /><br />

        <input
          className="login-input"
          type="password"
          placeholder="Password"
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
            marginBottom: "18px",
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
            Login As (Portal Access)
          </label>
          <select
            className="login-input"
            value={loginAs}
            onChange={(e) => setLoginAs(e.target.value)}
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

        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>

      <p
        className="login-forgot"
        style={{ color: "#a78bfa", cursor: "pointer" }}
        onClick={() => setShow(true)}
      >
        Forgot Password?
      </p>

      <p
        className="login-forgot"
        style={{ color: "#a78bfa", cursor: "pointer" }}
        onClick={() => navigate("/signup")}
      >
        Don't have an account? Signup
      </p>

      <Modal className="login-modal" show={show} onHide={() => setShow(false)}>
        <Modal.Header className="modal-header-custom" closeButton>
          <Modal.Title className="modal-title-custom">Reset Password</Modal.Title>
        </Modal.Header>

        <Modal.Body className="modal-body-custom">
          <input
            type="email"
            placeholder="Enter your email"
            className="form-control modal-input mb-3"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Enter new password (min 6 chars)"
            className="form-control modal-input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Modal.Body>

        <Modal.Footer className="modal-footer-custom">
          <Button variant="secondary" onClick={() => setShow(false)}>
            Close
          </Button>

          <Button variant="primary" onClick={handleReset}>
            Update Password
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default Login;
