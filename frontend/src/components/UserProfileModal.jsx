import { useState } from "react";
import { api, saveSession } from "../services/api";

export default function UserProfileModal({ user, onClose, onUserUpdated }) {
  const [activeTab, setActiveTab] = useState("profile"); // profile | password
  const [name, setName] = useState(user.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name cannot be empty");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await api.updateProfile({ name: name.trim() });
      if (res.user) {
        saveSession(localStorage.getItem("token"), res.user);
        if (onUserUpdated) onUserUpdated(res.user);
      }
      setSuccess("Profile display name updated successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      setError("Please enter your current password");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await api.updatePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSuccess("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalBox}>
        {/* HEADER */}
        <div style={styles.header}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={styles.avatarCircle}>
              {(user.name || "U")[0].toUpperCase()}
            </div>
            <div>
              <h3 style={styles.headerTitle}>{user.name}</h3>
              <span style={styles.headerSub}>{user.email}</span>
            </div>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            ✕
          </button>
        </div>

        {/* TABS */}
        <div style={styles.tabsRow}>
          <button
            onClick={() => {
              setActiveTab("profile");
              setError("");
              setSuccess("");
            }}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "profile" ? styles.tabBtnActive : {}),
            }}
          >
            👤 Profile Settings
          </button>
          <button
            onClick={() => {
              setActiveTab("password");
              setError("");
              setSuccess("");
            }}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "password" ? styles.tabBtnActive : {}),
            }}
          >
            🔒 Security & Password
          </button>
        </div>

        {/* FEEDBACK */}
        {error && <div style={styles.alertError}>⚠ {error}</div>}
        {success && <div style={styles.alertSuccess}>✓ {success}</div>}

        {/* CONTENT */}
        <div style={styles.body}>
          {activeTab === "profile" && (
            <form onSubmit={handleUpdateProfile} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Email Address (Read-only)</label>
                <input
                  type="text"
                  value={user.email}
                  disabled
                  style={{ ...styles.input, background: "#f1f5f9", cursor: "not-allowed" }}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Account Role</label>
                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    borderRadius: "14px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    background: user.role === "admin" ? "#fdf2f8" : "#f0fdf4",
                    color: user.role === "admin" ? "#be185d" : "#15803d",
                  }}
                >
                  {user.role === "admin" ? "🛡️ System Administrator" : "👤 Standard User"}
                </span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Display Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.buttonRow}>
                <button
                  type="submit"
                  disabled={loading}
                  style={styles.primaryBtn}
                >
                  {loading ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </form>
          )}

          {activeTab === "password" && (
            <form onSubmit={handleUpdatePassword} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Current Password *</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>New Password * (Min 8 chars, 1 letter, 1 number)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Confirm New Password *</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.buttonRow}>
                <button
                  type="submit"
                  disabled={loading}
                  style={styles.primaryBtn}
                >
                  {loading ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(15, 23, 42, 0.65)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "20px",
  },
  modalBox: {
    background: "#ffffff",
    width: "100%",
    maxWidth: "500px",
    borderRadius: "12px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
  },
  avatarCircle: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    background: "#2563eb",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    fontWeight: "bold",
  },
  headerTitle: {
    margin: 0,
    fontSize: "16px",
    color: "#0f172a",
  },
  headerSub: {
    fontSize: "12px",
    color: "#64748b",
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: "18px",
    cursor: "pointer",
    color: "#64748b",
  },
  tabsRow: {
    display: "flex",
    borderBottom: "1px solid #e2e8f0",
    padding: "0 16px",
  },
  tabBtn: {
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: "600",
    color: "#64748b",
    cursor: "pointer",
  },
  tabBtnActive: {
    color: "#2563eb",
    borderBottomColor: "#2563eb",
  },
  body: {
    padding: "20px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#475569",
  },
  input: {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    boxSizing: "border-box",
  },
  buttonRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "8px",
  },
  primaryBtn: {
    background: "#2563eb",
    color: "#ffffff",
    border: "none",
    padding: "9px 18px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  alertError: {
    background: "#fee2e2",
    color: "#b91c1c",
    padding: "8px 20px",
    fontSize: "12px",
    borderBottom: "1px solid #fca5a5",
  },
  alertSuccess: {
    background: "#dcfce7",
    color: "#15803d",
    padding: "8px 20px",
    fontSize: "12px",
    borderBottom: "1px solid #86efac",
  },
};
