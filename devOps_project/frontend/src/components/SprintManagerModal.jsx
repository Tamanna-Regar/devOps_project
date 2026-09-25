import { useState } from "react";
import { api } from "../services/api";

export default function SprintManagerModal({ sprint, onClose, onSprintSaved }) {
  const isEditing = Boolean(sprint && sprint.id);

  const [name, setName] = useState(sprint ? sprint.name : "");
  const [startDate, setStartDate] = useState(sprint ? sprint.start_date.slice(0, 10) : "");
  const [endDate, setEndDate] = useState(sprint ? sprint.end_date.slice(0, 10) : "");
  const [goal, setGoal] = useState(sprint ? sprint.goal || "" : "");
  const [status, setStatus] = useState(sprint ? sprint.status : "Planned");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Sprint name is required");
      return;
    }
    if (!startDate || !endDate) {
      setError("Both start and end dates are required");
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError("End date must be after start date");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = {
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
        goal: goal.trim(),
        status,
      };

      if (isEditing) {
        await api.updateSprint(sprint.id, payload);
      } else {
        await api.createSprint(payload);
      }

      if (onSprintSaved) onSprintSaved();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save sprint");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modalBox}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            {isEditing ? `Edit ${sprint.name}` : "🏃 Create New Sprint"}
          </h3>
          <button onClick={onClose} style={styles.closeBtn}>
            ✕
          </button>
        </div>

        {error && <div style={styles.errorAlert}>⚠ {error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Sprint Name *</label>
            <input
              type="text"
              placeholder="e.g. Sprint 1, Sprint 42"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.gridTwo}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={styles.input}
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>End Date *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={styles.input}
                required
              />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Sprint Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={styles.select}
            >
              <option value="Planned">Planned</option>
              <option value="Active">Active</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Sprint Goal</label>
            <textarea
              rows={3}
              placeholder="What is the objective or deliverable for this sprint?"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              style={styles.textarea}
            />
          </div>

          <div style={styles.btnRow}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={styles.submitBtn}>
              {loading ? "Saving..." : isEditing ? "Save Changes" : "Create Sprint"}
            </button>
          </div>
        </form>
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
    maxWidth: "480px",
    borderRadius: "12px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
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
  title: {
    margin: 0,
    fontSize: "16px",
    color: "#0f172a",
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: "18px",
    cursor: "pointer",
    color: "#64748b",
  },
  errorAlert: {
    background: "#fee2e2",
    color: "#b91c1c",
    padding: "8px 20px",
    fontSize: "12px",
    borderBottom: "1px solid #fca5a5",
  },
  form: {
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  gridTwo: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
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
  select: {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    background: "#ffffff",
    boxSizing: "border-box",
  },
  textarea: {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  btnRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "8px",
  },
  cancelBtn: {
    background: "#f1f5f9",
    border: "1px solid #cbd5e1",
    padding: "8px 14px",
    borderRadius: "6px",
    fontSize: "13px",
    cursor: "pointer",
  },
  submitBtn: {
    background: "#2563eb",
    color: "#ffffff",
    border: "none",
    padding: "8px 16px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
};
