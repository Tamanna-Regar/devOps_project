import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleForgotPassword = async (e) => {
    e.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const data = await api.forgotPassword({
        email: email.trim().toLowerCase(),
      });

      setMessage(
        data.message ||
          "If this email is registered, password reset instructions have been sent."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* LEFT PANEL */}
        <div style={styles.leftPanel}>
          <div style={styles.diagonalShapeBack}></div>
          <div style={styles.diagonalShapeFront}></div>

          <Link to="/login" style={styles.leftPanelLabel}>
            LOGIN
          </Link>

          <span style={styles.signInLabel}>FORGOT PASSWORD</span>
        </div>

        {/* RIGHT PANEL */}
        <div style={styles.rightPanel}>
          {/* Lock Icon */}
          <div style={styles.avatar}>
            <svg
              viewBox="0 0 24 24"
              width="30"
              height="30"
              fill="#ffffff"
            >
              <path d="M6 10V8a6 6 0 1 1 12 0v2h1a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a1 1 0 0 1 1-1h1Zm2 0h8V8a4 4 0 1 0-8 0v2Z" />
            </svg>
          </div>

          <h1 style={styles.title}>FORGOT PASSWORD</h1>

          <p style={styles.description}>
            Enter your registered email address and we will help you reset
            your password.
          </p>

          {/* ERROR */}
          {error && <div style={styles.error}>{error}</div>}

          {/* SUCCESS */}
          {message && <div style={styles.success}>{message}</div>}

          <form onSubmit={handleForgotPassword} style={styles.form}>
            <div style={styles.inputRow}>
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="#b03a6b"
              >
                <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5-8-5V6l8 5 8-5v2Z" />
              </svg>

              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={styles.input}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.button,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "SENDING..." : "RESET PASSWORD"}
            </button>
          </form>

          <p style={styles.loginText}>
            Remember your password?{" "}
            <Link to="/login" style={styles.link}>
              Back to Login
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
    width: "620px",
    maxWidth: "92%",
    minHeight: "390px",
    display: "flex",
    background: "#ffffff",
    borderRadius: "10px",
    overflow: "hidden",
    boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
  },

  leftPanel: {
    position: "relative",
    width: "42%",
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

  leftPanelLabel: {
    position: "relative",
    zIndex: 2,
    marginLeft: "24px",
    marginBottom: "14px",
    background: "#ffffff",
    color: PINK_DARK,
    fontWeight: "bold",
    fontSize: "13px",
    letterSpacing: "1px",
    padding: "8px 18px",
    borderRadius: "20px 0 0 20px",
    textDecoration: "none",
  },

  signInLabel: {
    position: "relative",
    zIndex: 2,
    marginLeft: "24px",
    color: "#ffffff",
    fontWeight: "600",
    fontSize: "13px",
    letterSpacing: "1px",
  },

  rightPanel: {
    width: "58%",
    padding: "36px 32px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },

  avatar: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: PINK,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "10px",
  },

  title: {
    margin: "0 0 10px 0",
    fontSize: "20px",
    letterSpacing: "1px",
    color: PINK_DARK,
    fontWeight: "bold",
    textAlign: "center",
  },

  description: {
    fontSize: "12px",
    color: "#64748b",
    textAlign: "center",
    lineHeight: "1.6",
    margin: "0 0 20px 0",
    maxWidth: "300px",
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
    marginBottom: "20px",
  },

  input: {
    flex: 1,
    border: "none",
    outline: "none",
    fontSize: "14px",
    color: "#333",
    background: "transparent",
  },

  button: {
    width: "100%",
    padding: "11px 20px",
    border: "none",
    borderRadius: "20px",
    background: PINK,
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: "bold",
    letterSpacing: "1px",
    cursor: "pointer",
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
    marginTop: "22px",
    fontSize: "13px",
    color: "#64748b",
  },

  link: {
    color: PINK,
    textDecoration: "none",
    fontWeight: "bold",
  },
};

export default ForgotPassword;