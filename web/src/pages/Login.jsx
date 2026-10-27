import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiLogin, apiResetPassword } from "../api";
import "./css/Login.css";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [show, setShow] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiLogin({ email, password });
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

        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>

      <p
        className="login-forgot"
        style={{ color: "blue", cursor: "pointer" }}
        onClick={() => setShow(true)}
      >
        Forgot Password?
      </p>

      <p
        className="login-forgot"
        style={{ color: "blue", cursor: "pointer" }}
        onClick={() => navigate("/")}
      >
        Don't have an account?
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
