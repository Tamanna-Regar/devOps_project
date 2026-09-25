
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, saveSession } from "../services/api";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const data = await api.login({
        email: email.trim().toLowerCase(),
        password: password,
      });

      if (!data.access_token) {
        throw new Error(
          "Login successful but authentication token was not received."
        );
      }

      saveSession(data.access_token, data.user);

      if (data.user?.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    } catch (error) {
      console.error("Login Error:", error);
      setError(error.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* =====================================================
            LEFT PANEL
        ===================================================== */}

        <div style={styles.leftPanel}>

          <div style={styles.diagonalShapeBack}></div>

          <div style={styles.diagonalShapeFront}></div>

          <span style={styles.leftPanelLabel}>
            LOGIN
          </span>

          <Link
            to="/register"
            style={styles.signInLabel}
          >
            SIGN IN
          </Link>

        </div>

        {/* =====================================================
            RIGHT LOGIN FORM
        ===================================================== */}

        <div style={styles.rightPanel}>

          <div style={styles.avatar}>
            <svg
              viewBox="0 0 24 24"
              width="30"
              height="30"
              fill="#ffffff"
            >
              <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.24-8 5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1c0-2.76-3.6-5-8-5Z" />
            </svg>
          </div>

          <h1 style={styles.title}>
            LOGIN
          </h1>

          {/* ERROR */}

          {error && (
            <div style={styles.error}>
              {error}
            </div>
          )}

          <form
            onSubmit={handleLogin}
            style={styles.form}
          >

            {/* EMAIL */}

            <div style={styles.inputRow}>

              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="#b03a6b"
              >
                <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.24-8 5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1c0-2.76-3.6-5-8-5Z" />
              </svg>

              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                required
                style={styles.input}
              />

            </div>

            {/* PASSWORD */}

            <div style={styles.inputRow}>

              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="#b03a6b"
              >
                <path d="M6 10V8a6 6 0 1 1 12 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h8V8a4 4 0 1 0-8 0v2Z" />
              </svg>

              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                required
                style={styles.input}
              />

            </div>

            {/* BUTTON ROW */}

            <div style={styles.rowBetween}>

              <Link
                to="/forgot-password"
                style={styles.forgotLink}
              >
                Forgot Password?
              </Link>

              <button
                type="submit"
                disabled={loading}
                style={{
                  ...styles.button,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading
                    ? "not-allowed"
                    : "pointer",
                }}
              >
                {loading ? "LOGIN..." : "LOGIN"}
              </button>

            </div>

          </form>

          {/* SOCIAL LOGIN */}

          <div style={styles.socialRow}>

            <span style={styles.socialLabel}>
              Or Login With
            </span>

            <div style={styles.socialIcons}>

              <span style={styles.socialIcon}>
                G
              </span>

              <span
                style={{
                  ...styles.socialIcon,
                  background: "#3b5998",
                }}
              >
                f
              </span>

            </div>

          </div>

          {/* REGISTER */}

          <p style={styles.registerText}>
            Don't have an account?{" "}

            <Link
              to="/register"
              style={styles.link}
            >
              Create Account
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
    minHeight: "360px",
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
  },

  signInLabel: {
    position: "relative",
    zIndex: 2,
    marginLeft: "24px",
    color: "#ffffff",
    fontWeight: "600",
    fontSize: "13px",
    letterSpacing: "1px",
    textDecoration: "none",
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
    margin: "0 0 20px 0",
    fontSize: "20px",
    letterSpacing: "1px",
    color: PINK_DARK,
    fontWeight: "bold",
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
    marginBottom: "18px",
  },

  input: {
    flex: 1,
    border: "none",
    outline: "none",
    fontSize: "14px",
    color: "#333",
    background: "transparent",
  },

  rowBetween: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "6px",
  },

  forgotLink: {
    fontSize: "12px",
    color: PINK,
    textDecoration: "none",
  },

  button: {
    padding: "10px 26px",
    border: "none",
    borderRadius: "20px",
    background: PINK,
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: "bold",
    letterSpacing: "1px",
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

  socialRow: {
    marginTop: "26px",
    textAlign: "center",
  },

  socialLabel: {
    fontSize: "12px",
    color: "#94a3b8",
    display: "block",
    marginBottom: "10px",
  },

  socialIcons: {
    display: "flex",
    gap: "10px",
    justifyContent: "center",
  },

  socialIcon: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    background: "#db4437",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  registerText: {
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

export default Login;