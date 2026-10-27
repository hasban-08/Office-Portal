import { useNavigate } from "react-router-dom";
import { apiLogout } from "../api";
import "./ComponentsCss/Header.css";

function Header() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await apiLogout();
    navigate("/login");
  };

  return (
    <nav className="header-navbar">
      <div className="header-inner">
        <div className="header-brand" onClick={() => navigate("/")}>
          <svg
            className="header-brand-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 20a6 6 0 0 0-12 0" />
            <circle cx="12" cy="10" r="4" />
            <circle cx="12" cy="12" r="10" />
          </svg>
          <span>Office Portal</span>
        </div>

        <div className="header-nav">
          <div className="header-nav-item" onClick={() => navigate("/")}>
            <span className="header-nav-label">Dashboard</span>
          </div>
          <div className="header-nav-item" onClick={() => navigate("/profile")}>
            <span className="header-nav-label">Profile</span>
          </div>
        </div>

        <button className="header-logout-btn" onClick={handleLogout}>
          <span className="header-logout-label">Logout</span>
        </button>
      </div>
    </nav>
  );
}

export default Header;
