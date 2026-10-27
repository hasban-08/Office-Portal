import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, updateUserById, apiLogout } from "../api";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import "./css/Profile.css";

function Profile() {
  const user = getCurrentUser();
  const navigate = useNavigate();

  const [show, setShow] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [photo, setPhoto] = useState(user?.photoURL || "");

  const handleLogout = async () => {
    await apiLogout();
    navigate("/login");
  };

  const handleSave = async () => {
    try {
      await updateUserById(user.uid, {
        name: name || user.name,
        photoURL: photo || user.photoURL,
      });
      alert("Profile Updated");
      setShow(false);
      window.location.reload();
    } catch (error) {
      alert(error.message);
    }
  };

  if (!user) return null;

  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">My Profile</h1>

      <div className="profile-card">
        {user.photoURL ? (
          <img
            className="profile-avatar"
            src={user.photoURL}
            alt="Profile"
            width="100"
            height="100"
            style={{ borderRadius: "50%" }}
          />
        ) : (
          <div className="profile-avatar-placeholder">
            {(user.name || "U").charAt(0).toUpperCase()}
          </div>
        )}

        <h2 className="profile-welcome">Welcome Back</h2>
        <p className="profile-name">{user.name}</p>
        <p className="profile-email">{user.email}</p>

        <div className="dashboard-actions">
          <Button variant="secondary" onClick={() => navigate("/")}>
            Back to Dashboard
          </Button>
          <Button variant="primary" onClick={() => setShow(true)}>
            Update Profile
          </Button>
          <Button variant="info" onClick={() => navigate("/complete-profile")}>
            Edit Payroll / Bank Info
          </Button>
          <Button variant="danger" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Update Profile</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <input
            type="text"
            className="form-control mb-3"
            placeholder="New Username"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="text"
            className="form-control"
            placeholder="Profile Image URL"
            value={photo}
            onChange={(e) => setPhoto(e.target.value)}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>
            Close
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save Changes
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default Profile;
