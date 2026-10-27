import { useEffect, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import {
  getCurrentUser,
  fetchUserById,
  fetchUsers,
  updateUserById,
} from "../api";
import { getLocalDateStr } from "../utils/attendanceHelpers";
import {
  formatCnic,
  isValidCnic,
  normalizePkMobile,
  isValidIban,
  isValidDob,
} from "../utils/validators";
import "./css/CompleteProfile.css";

// Resize & compress image to compact data URL for PostgreSQL storage
function resizeImageToDataUrl(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("Invalid image file."));
      img.src = ev.target.result;
    };
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function CompleteProfile() {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === "admin";
  const [searchParams] = useSearchParams();
  const initialTargetUid = searchParams.get("uid") || currentUser?.uid;

  const [targetUid, setTargetUid] = useState(initialTargetUid);
  const [allUsers, setAllUsers] = useState([]);
  const [isAlreadyComplete, setIsAlreadyComplete] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    cnic: "",
    dob: "",
    address: "",
    phone: "",
    method: "bank",
    providerName: "",
    accountTitle: "",
    accountNumber: "",
    iban: "",
    emergencyName: "",
    emergencyRelation: "",
    emergencyPhone: "",
    photoURL: "",
    email: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromRedirect = location.state?.incomplete;

  // Once profileComplete is true, only Admin can edit sensitive fields (CNIC, DOB, Bank, Emergency Contact).
  // Employee can still update Basic fields (Profile Picture, Full Name, Phone, Address).
  const isLockedForEmployee = isAlreadyComplete && !isAdmin;

  useEffect(() => {
    if (!isAdmin) return;
    fetchUsers()
      .then((list) => setAllUsers(list))
      .catch((err) => console.error("Profile fetchUsers:", err));
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    const fetchExisting = async () => {
      if (!targetUid) return;
      setLoading(true);
      try {
        const data = await fetchUserById(targetUid);
        if (cancelled) return;
        if (data) {
          setIsAlreadyComplete(Boolean(data.profileComplete));
          setForm({
            fullName: data.personalInfo?.fullName || data.name || "",
            cnic: formatCnic(data.personalInfo?.cnic || ""),
            dob: data.personalInfo?.dob || "",
            address: data.personalInfo?.address || "",
            phone: data.personalInfo?.phone || "",
            method: data.bankDetails?.method || "bank",
            providerName: data.bankDetails?.providerName || "",
            accountTitle: data.bankDetails?.accountTitle || "",
            accountNumber: data.bankDetails?.accountNumber || "",
            iban: data.bankDetails?.iban || "",
            emergencyName: data.emergencyContact?.name || "",
            emergencyRelation: data.emergencyContact?.relation || "",
            emergencyPhone: data.emergencyContact?.phone || "",
            photoURL: data.photoURL || "",
            email: data.email || "",
          });
        }
      } catch (err) {
        console.error("Profile load error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchExisting();
    return () => {
      cancelled = true;
    };
  }, [targetUid]);

  const handleChange = (field, value) => {
    const v = field === "cnic" ? formatCnic(value) : value;
    setForm((prev) => ({ ...prev, [field]: v }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file (JPG, PNG, WEBP).");
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file, 256);
      setForm((prev) => ({ ...prev, photoURL: dataUrl }));
    } catch (err) {
      alert(err.message || "Could not process image.");
    }
  };

  const validate = () => {
    const e = {};

    // Basic fields (always validated)
    if (form.fullName.trim().length < 3) e.fullName = "Poora naam likho";
    if (!normalizePkMobile(form.phone)) e.phone = "Sahi mobile number likho (03XX-XXXXXXX)";
    if (form.address.trim().length < 10) e.address = "Poora address likho";

    // Sensitive fields (only validated if unlocked — i.e., first-time completion or Admin)
    if (!isLockedForEmployee) {
      if (!isValidCnic(form.cnic)) e.cnic = "CNIC 13 digits ka hona chahiye (XXXXX-XXXXXXX-X)";
      if (!isValidDob(form.dob)) e.dob = "Sahi date of birth select karo (kam az kam 16 saal umar)";

      if (!form.providerName.trim()) {
        e.providerName = form.method === "bank" ? "Bank ka naam likho" : "Wallet ka naam likho";
      }
      if (form.accountTitle.trim().length < 3) e.accountTitle = "Account holder ka naam likho";

      if (form.method === "bank") {
        if (form.accountNumber.replace(/\s/g, "").length < 6) {
          e.accountNumber = "Sahi account number likho";
        }
        if (form.iban.trim() && !isValidIban(form.iban)) {
          e.iban = "IBAN sahi nahi (PK + 22 characters, checksum match nahi hua)";
        }
      } else if (!normalizePkMobile(form.accountNumber)) {
        e.accountNumber = "Wallet ka sahi mobile number likho (03XX-XXXXXXX)";
      }

      if (form.emergencyName.trim().length < 3) e.emergencyName = "Emergency contact ka naam likho";
      if (!form.emergencyRelation) e.emergencyRelation = "Rishta select karo";
      const emergencyPhone = normalizePkMobile(form.emergencyPhone);
      if (!emergencyPhone) {
        e.emergencyPhone = "Sahi mobile number likho (03XX-XXXXXXX)";
      } else if (emergencyPhone === normalizePkMobile(form.phone)) {
        e.emergencyPhone = "Ye apna number nahi, kisi family member ka hona chahiye";
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        name: form.fullName.trim(),
        photoURL: form.photoURL || "",
        personalInfo: {
          fullName: form.fullName.trim(),
          cnic: form.cnic,
          dob: form.dob,
          address: form.address.trim(),
          phone: normalizePkMobile(form.phone),
        },
        profileComplete: true,
      };

      if (!isLockedForEmployee) {
        payload.bankDetails = {
          method: form.method,
          providerName: form.providerName.trim(),
          accountTitle: form.accountTitle.trim(),
          accountNumber:
            form.method === "bank"
              ? form.accountNumber.trim()
              : normalizePkMobile(form.accountNumber),
          iban:
            form.method === "bank"
              ? form.iban.replace(/\s+/g, "").toUpperCase()
              : "",
        };
        payload.emergencyContact = {
          name: form.emergencyName.trim(),
          relation: form.emergencyRelation,
          phone: normalizePkMobile(form.emergencyPhone),
        };
      }

      await updateUserById(targetUid, payload);
      setIsAlreadyComplete(true);
      alert("Profile saved successfully in PostgreSQL!");
      if (!isAlreadyComplete) {
        navigate("/");
      }
    } catch (error) {
      console.error("Profile save error:", error);
      alert(error.message || "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="cp-loading">Loading profile...</p>;

  const lockedStyle = isLockedForEmployee
    ? { opacity: 0.6, cursor: "not-allowed", background: "rgba(255,255,255,0.03)" }
    : {};

  return (
    <div className="cp-page">
      <div className="cp-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "#f0eeff",
              borderRadius: "8px",
              padding: "7px 14px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            ← Back to Dashboard
          </button>

          {isAdmin && allUsers.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "rgba(240,238,255,0.6)" }}>
                Admin — Editing Profile of:
              </span>
              <select
                value={targetUid}
                onChange={(e) => setTargetUid(e.target.value)}
                style={{
                  background: "#1a1630",
                  border: "1px solid rgba(167,139,250,0.4)",
                  color: "#fff",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "13px",
                }}
              >
                {allUsers.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.personalInfo?.fullName || u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {cameFromRedirect && !isAlreadyComplete && (
          <div className="cp-alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Please complete your profile before you can continue.
          </div>
        )}

        {isLockedForEmployee && (
          <div
            className="cp-alert"
            style={{
              background: "rgba(109, 58, 255, 0.14)",
              borderColor: "rgba(167, 139, 250, 0.35)",
              color: "#e9d5ff",
            }}
          >
            🔒 Sensitive details (CNIC, DOB, Bank Details & Emergency Contact) are locked after initial submission. You can update your Profile Picture, Name, Phone, and Address anytime. Contact Admin to modify locked fields.
          </div>
        )}

        <h1 className="cp-title">
          {isAlreadyComplete ? "My Profile" : "Complete Your Profile"}
        </h1>
        <p className="cp-sub">
          {isAlreadyComplete
            ? `Account Email: ${form.email}`
            : "We need a few details to set up your payroll and records."}
        </p>

        {/* ── PROFILE PICTURE SECTION ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            padding: "16px",
            marginBottom: "20px",
            borderRadius: "14px",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            flexWrap: "wrap",
          }}
        >
          {form.photoURL ? (
            <img
              src={form.photoURL}
              alt="Profile"
              style={{
                width: "76px",
                height: "76px",
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid #a78bfa",
              }}
            />
          ) : (
            <div
              style={{
                width: "76px",
                height: "76px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #6d3aff, #a78bfa)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "28px",
                fontWeight: 700,
              }}
            >
              {(form.fullName || "U").charAt(0).toUpperCase()}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#f0eeff" }}>
              Profile Picture (Stored in PostgreSQL)
            </span>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <label
                style={{
                  background: "rgba(109, 58, 255, 0.25)",
                  border: "1px solid rgba(167, 139, 250, 0.45)",
                  color: "#fff",
                  padding: "7px 14px",
                  borderRadius: "8px",
                  fontSize: "12.5px",
                  cursor: "pointer",
                  margin: 0,
                }}
              >
                📷 Choose Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  style={{ display: "none" }}
                />
              </label>
              {form.photoURL && (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, photoURL: "" }))}
                  style={{
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    color: "#fca5a5",
                    padding: "7px 12px",
                    borderRadius: "8px",
                    fontSize: "12.5px",
                    cursor: "pointer",
                  }}
                >
                  Remove Photo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── BASIC & PERSONAL DETAILS ── */}
        <h2 className="cp-section-title">Personal Details</h2>
        <div className="cp-fields">
          <label>
            Full Name (Editable)
            <input
              value={form.fullName}
              onChange={(e) => handleChange("fullName", e.target.value)}
            />
            {errors.fullName && <span className="cp-error">{errors.fullName}</span>}
          </label>
          <label>
            CNIC {isLockedForEmployee && "🔒 (Admin Only)"}
            <input
              inputMode="numeric"
              placeholder="XXXXX-XXXXXXX-X"
              value={form.cnic}
              disabled={isLockedForEmployee}
              style={lockedStyle}
              onChange={(e) => handleChange("cnic", e.target.value)}
            />
            {errors.cnic && <span className="cp-error">{errors.cnic}</span>}
          </label>
          <label>
            Date of Birth {isLockedForEmployee && "🔒 (Admin Only)"}
            <input
              type="date"
              min="1930-01-01"
              max={getLocalDateStr()}
              value={form.dob}
              disabled={isLockedForEmployee}
              style={lockedStyle}
              onChange={(e) => handleChange("dob", e.target.value)}
            />
            {errors.dob && <span className="cp-error">{errors.dob}</span>}
          </label>
          <label>
            Phone Number (Editable)
            <input
              inputMode="tel"
              placeholder="03XX-XXXXXXX"
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
            />
            {errors.phone && <span className="cp-error">{errors.phone}</span>}
          </label>
          <label className="cp-full-width">
            Address (Editable)
            <textarea
              value={form.address}
              onChange={(e) => handleChange("address", e.target.value)}
            />
            {errors.address && <span className="cp-error">{errors.address}</span>}
          </label>
        </div>

        {/* ── PAYMENT / BANK DETAILS ── */}
        <h2 className="cp-section-title">
          Payment & Bank Details {isLockedForEmployee && "🔒 (Admin Only)"}
        </h2>
        <div className="cp-fields">
          <label>
            Payment Method
            <select
              value={form.method}
              disabled={isLockedForEmployee}
              style={lockedStyle}
              onChange={(e) => handleChange("method", e.target.value)}
            >
              <option value="bank">Bank Transfer</option>
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">Easypaisa</option>
            </select>
          </label>
          <label>
            {form.method === "bank" ? "Bank Name" : "Wallet Name"}
            <input
              value={form.providerName}
              disabled={isLockedForEmployee}
              style={lockedStyle}
              onChange={(e) => handleChange("providerName", e.target.value)}
            />
            {errors.providerName && (
              <span className="cp-error">{errors.providerName}</span>
            )}
          </label>
          <label>
            Account Holder Name
            <input
              value={form.accountTitle}
              disabled={isLockedForEmployee}
              style={lockedStyle}
              onChange={(e) => handleChange("accountTitle", e.target.value)}
            />
            {errors.accountTitle && (
              <span className="cp-error">{errors.accountTitle}</span>
            )}
          </label>
          <label>
            {form.method === "bank" ? "Account Number" : "Wallet Mobile Number"}
            <input
              placeholder={form.method === "bank" ? "" : "03XX-XXXXXXX"}
              value={form.accountNumber}
              disabled={isLockedForEmployee}
              style={lockedStyle}
              onChange={(e) => handleChange("accountNumber", e.target.value)}
            />
            {errors.accountNumber && (
              <span className="cp-error">{errors.accountNumber}</span>
            )}
          </label>
          {form.method === "bank" && (
            <label className="cp-full-width">
              IBAN (optional)
              <input
                placeholder="PK00XXXX0000000000000000"
                value={form.iban}
                disabled={isLockedForEmployee}
                style={lockedStyle}
                onChange={(e) => handleChange("iban", e.target.value)}
              />
              {errors.iban && <span className="cp-error">{errors.iban}</span>}
            </label>
          )}
        </div>

        {/* ── EMERGENCY CONTACT ── */}
        <h2 className="cp-section-title">
          Emergency Contact {isLockedForEmployee && "🔒 (Admin Only)"}
        </h2>
        <p className="cp-note">
          Parent, sibling ya koi family member jise office zaroorat par contact kar sake.
        </p>
        <div className="cp-fields">
          <label>
            Contact Name
            <input
              value={form.emergencyName}
              disabled={isLockedForEmployee}
              style={lockedStyle}
              onChange={(e) => handleChange("emergencyName", e.target.value)}
            />
            {errors.emergencyName && (
              <span className="cp-error">{errors.emergencyName}</span>
            )}
          </label>
          <label>
            Relation
            <select
              value={form.emergencyRelation}
              disabled={isLockedForEmployee}
              style={lockedStyle}
              onChange={(e) => handleChange("emergencyRelation", e.target.value)}
            >
              <option value="">Select</option>
              <option value="Father">Father</option>
              <option value="Mother">Mother</option>
              <option value="Brother">Brother</option>
              <option value="Sister">Sister</option>
              <option value="Spouse">Spouse</option>
              <option value="Other">Other</option>
            </select>
            {errors.emergencyRelation && (
              <span className="cp-error">{errors.emergencyRelation}</span>
            )}
          </label>
          <label className="cp-full-width">
            Contact Mobile Number
            <input
              inputMode="tel"
              placeholder="03XX-XXXXXXX"
              value={form.emergencyPhone}
              disabled={isLockedForEmployee}
              style={lockedStyle}
              onChange={(e) => handleChange("emergencyPhone", e.target.value)}
            />
            {errors.emergencyPhone && (
              <span className="cp-error">{errors.emergencyPhone}</span>
            )}
          </label>
        </div>

        <button className="cp-save-btn" onClick={handleSave} disabled={saving}>
          {saving
            ? "Saving..."
            : isAlreadyComplete
              ? "Save Profile Changes"
              : "Save & Continue"}
        </button>
      </div>
    </div>
  );
}

export default CompleteProfile;
