import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../services/api";

function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user"); // "user" | "admin"
  const [adminSecret, setAdminSecret] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const payload = {
        name,
        email,
        password,
        role,
      };

      if (role === "admin") {
        if (!adminSecret.trim()) {
          throw new Error("Admin registration secret key is required for admin role.");
        }
        payload.admin_secret = adminSecret.trim();
      }

      await api.register(payload);

      setSuccess("Registration successful! Redirecting to login...");

      setName("");
      setEmail("");
      setPassword("");
      setAdminSecret("");
      setRole("user");

      setTimeout(() => {
        navigate("/login");
      }, 1200);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Left diagonal pink panel */}
        <div style={styles.leftPanel}>
          <div style={styles.diagonalShapeBack}></div>
          <div style={styles.diagonalShapeFront}></div>
          <Link to="/login" style={styles.loginLabel}>
            LOGIN
          </Link>
          <span style={styles.signInLabel}>SIGN IN</span>
        </div>

        {/* Right form panel */}
        <div style={styles.rightPanel}>
          <div style={styles.avatar}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="#ffffff">
              <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.24-8 5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1c0-2.76-3.6-5-8-5Z" />
            </svg>
          </div>

          <h1 style={styles.title}>CREATE ACCOUNT</h1>
          <p style={styles.subtitle}>Register for DevOps Task Manager</p>

          {error && <div style={styles.error}>{error}</div>}
          {success && <div style={styles.success}>{success}</div>}

          <form onSubmit={handleRegister} style={styles.form}>
            <div style={styles.inputRow}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#b03a6b">
                <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.24-8 5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1c0-2.76-3.6-5-8-5Z" />
              </svg>
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={styles.input}
              />
            </div>

            <div style={styles.inputRow}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#b03a6b">
                <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v.01L12 12l8-5.99V6l-8 6-8-6Z" />
              </svg>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={styles.input}
              />
            </div>

            <div style={styles.inputRow}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#b03a6b">
                <path d="M6 10V8a6 6 0 1 1 12 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h8V8a4 4 0 1 0-8 0v2Z" />
              </svg>
              <input
                type="password"
                placeholder="Password (min 8 chars, letter + number)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                style={styles.input}
              />
            </div>

            <div style={styles.inputRow}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#b03a6b">
                <path d="M12 2 2 7l10 5 10-5-10-5Zm0 7L2 14l10 5 10-5-10-5Z" />
              </svg>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={styles.select}
              >
                <option value="user">Register as User</option>
                <option value="admin">Register as Admin</option>
              </select>
            </div>

            {role === "admin" && (
              <div style={styles.inputRow}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="#b03a6b">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2Zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2Z" />
                </svg>
                <input
                  type="password"
                  placeholder="Admin Secret Passcode"
                  value={adminSecret}
                  onChange={(e) => setAdminSecret(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>
            )}

            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? "Creating Account..." : "REGISTER"}
            </button>
          </form>

          <p style={styles.loginText}>
            Already have an account?{" "}
            <Link to="/login" style={styles.link}>
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const PINK = "#c94f8b";
const PINK_DARK = "#7a1f4d";
const PINK_LIGHT = "#e691b9";

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: PINK_DARK,
    fontFamily: "'Segoe UI', Arial, sans-serif",
    padding: "20px",
    boxSizing: "border-box",
  },

  card: {
    width: "660px",
    maxWidth: "94%",
    minHeight: "420px",
    display: "flex",
    background: "#ffffff",
    borderRadius: "10px",
    overflow: "hidden",
    boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
  },

  leftPanel: {
    position: "relative",
    width: "38%",
    background: PINK,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    paddingTop: "40px",
  },

  diagonalShapeBack: {
    position: "absolute",
    top: 0,
    left: "-30%",
    width: "140%",
    height: "60%",
    background: PINK_LIGHT,
    transform: "rotate(-18deg)",
    transformOrigin: "top left",
  },

  diagonalShapeFront: {
    position: "absolute",
    bottom: "-10%",
    left: "-30%",
    width: "140%",
    height: "55%",
    background: PINK_DARK,
    opacity: 0.25,
    transform: "rotate(14deg)",
  },

  loginLabel: {
    position: "relative",
    zIndex: 2,
    marginLeft: "24px",
    marginBottom: "14px",
    color: "#ffffff",
    fontWeight: "600",
    fontSize: "13px",
    letterSpacing: "1px",
    textDecoration: "none",
  },

  signInLabel: {
    position: "relative",
    zIndex: 2,
    marginLeft: "24px",
    background: "#ffffff",
    color: PINK_DARK,
    fontWeight: "bold",
    fontSize: "13px",
    letterSpacing: "1px",
    padding: "8px 18px",
    borderRadius: "20px 0 0 20px",
  },

  rightPanel: {
    width: "62%",
    padding: "32px 32px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },

  avatar: {
    width: "52px",
    height: "52px",
    borderRadius: "50%",
    background: PINK,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "10px",
  },

  title: {
    margin: "0 0 4px 0",
    fontSize: "18px",
    letterSpacing: "1px",
    color: PINK_DARK,
    fontWeight: "bold",
    textAlign: "center",
  },

  subtitle: {
    margin: "0 0 18px 0",
    fontSize: "12px",
    color: "#94a3b8",
    textAlign: "center",
  },

  form: {
    width: "100%",
  },

  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    borderBottom: "1px solid #e2c3d4",
    padding: "8px 2px",
    marginBottom: "16px",
  },

  input: {
    flex: 1,
    border: "none",
    outline: "none",
    fontSize: "14px",
    color: "#333",
    background: "transparent",
  },

  select: {
    flex: 1,
    border: "none",
    outline: "none",
    fontSize: "14px",
    color: "#333",
    background: "transparent",
    padding: "2px 0",
  },

  button: {
    width: "100%",
    padding: "12px",
    border: "none",
    borderRadius: "20px",
    background: PINK,
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: "bold",
    letterSpacing: "1px",
    cursor: "pointer",
    marginTop: "6px",
  },

  error: {
    width: "100%",
    background: "#fee2e2",
    color: "#b91c1c",
    padding: "10px",
    borderRadius: "8px",
    marginBottom: "16px",
    textAlign: "center",
    fontSize: "13px",
    boxSizing: "border-box",
  },

  success: {
    width: "100%",
    background: "#dcfce7",
    color: "#166534",
    padding: "10px",
    borderRadius: "8px",
    marginBottom: "16px",
    textAlign: "center",
    fontSize: "13px",
    boxSizing: "border-box",
  },

  loginText: {
    marginTop: "18px",
    fontSize: "13px",
    color: "#64748b",
  },

  link: {
    color: PINK,
    textDecoration: "none",
    fontWeight: "bold",
  },
};

export default Register;