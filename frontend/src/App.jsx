import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [backendStatus, setBackendStatus] = useState("Checking...");
  const [message, setMessage] = useState("Connecting to backend...");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/")
      .then((response) => response.json())
      .then((data) => {
        setMessage(data.message);
      })
      .catch(() => {
        setMessage("Backend connection failed");
      });

    fetch("http://127.0.0.1:8000/health")
      .then((response) => response.json())
      .then((data) => {
        setBackendStatus(data.status);
      })
      .catch(() => {
        setBackendStatus("unhealthy");
      });
  }, []);

  return (
    <div className="app">
      <div className="container">
        <h1>🚀 My First DevOps Project</h1>

        <p className="subtitle">
          Automated CI/CD Pipeline for Full-Stack Web Application
        </p>

        <div className="status-card">
          <h2>Backend Status</h2>

          <p>{message}</p>

          <div
            className={
              backendStatus === "healthy"
                ? "status healthy"
                : "status unhealthy"
            }
          >
            ● {backendStatus}
          </div>
        </div>

        <div className="tech-section">
          <h2>Technologies</h2>

          <div className="technologies">
            <div>React</div>
            <div>FastAPI</div>
            <div>Docker</div>
            <div>GitHub Actions</div>
            <div>MongoDB</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;