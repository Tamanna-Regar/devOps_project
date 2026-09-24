import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, clearSession, getUser } from "../services/api";

function Dashboard() {
  const navigate = useNavigate();

  const [user] = useState(() => getUser());
  const [tasks, setTasks] = useState([]);

  // Form state for creating task
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Pending");
  const [priority, setPriority] = useState("Medium");
  const [dueDate, setDueDate] = useState("");
  const [tags, setTags] = useState("");

  // Form state for editing task
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState("Pending");
  const [editPriority, setEditPriority] = useState("Medium");
  const [editDueDate, setEditDueDate] = useState("");
  const [editTags, setEditTags] = useState("");

  // Filters, search & sorting
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  // DevOps Health probe state
  const [systemHealth, setSystemHealth] = useState({
    status: "checking",
    database: "checking",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // =========================
  // SYSTEM HEALTH CHECK
  // =========================
  const checkHealth = useCallback(async () => {
    try {
      const data = await api.getHealth();
      setSystemHealth({
        status: data.status || "healthy",
        database: data.database || "connected",
      });
    } catch {
      setSystemHealth({
        status: "degraded",
        database: "disconnected",
      });
    }
  }, []);

  // =========================
  // LOAD TASKS
  // =========================
  const loadTasks = useCallback(async () => {
    try {
      setError("");
      const params = {
        search: search.trim() || undefined,
        status: statusFilter !== "All" ? statusFilter : undefined,
        priority: priorityFilter !== "All" ? priorityFilter : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      };

      const data = await api.getMyTasks(params);
      setTasks(data.tasks || []);
    } catch (err) {
      console.error("Load tasks error:", err);
      if (err.status === 401) {
        clearSession();
        navigate("/login");
        return;
      }
      setError(err.message || "Unable to load tasks");
    }
  }, [navigate, search, statusFilter, priorityFilter, sortBy, sortOrder]);

  // Initial load
  useEffect(() => {
    if (!user || !user.email) {
      clearSession();
      navigate("/login");
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkHealth();
    loadTasks();
  }, [navigate, user, loadTasks, checkHealth]);

  // =========================
  // ADD TASK
  // =========================
  const handleAddTask = async (e) => {
    e.preventDefault();

    setMessage("");
    setError("");

    if (!title.trim()) {
      setError("Please enter a task title");
      return;
    }

    setLoading(true);

    try {
      const parsedTags = tags
        ? tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      await api.addTask({
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        due_date: dueDate || null,
        tags: parsedTags,
      });

      setMessage("Task added successfully!");

      setTitle("");
      setDescription("");
      setStatus("Pending");
      setPriority("Medium");
      setDueDate("");
      setTags("");

      await loadTasks();
    } catch (err) {
      console.error("Add task error:", err);
      setError(err.message || "Failed to add task");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // START EDIT
  // =========================
  const startEdit = (task) => {
    setEditingId(task.id);
    setEditTitle(task.title || "");
    setEditDescription(task.description || "");
    setEditStatus(task.status || "Pending");
    setEditPriority(task.priority || "Medium");
    setEditDueDate(task.due_date ? task.due_date.slice(0, 10) : "");
    setEditTags(Array.isArray(task.tags) ? task.tags.join(", ") : "");

    setMessage("");
    setError("");
  };

  // =========================
  // CANCEL EDIT
  // =========================
  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    setEditStatus("Pending");
    setEditPriority("Medium");
    setEditDueDate("");
    setEditTags("");
  };

  // =========================
  // UPDATE TASK
  // =========================
  const handleUpdateTask = async (taskId) => {
    setMessage("");
    setError("");

    if (!editTitle.trim()) {
      setError("Task title cannot be empty");
      return;
    }

    try {
      const parsedTags = editTags
        ? editTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      await api.updateTask(taskId, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        status: editStatus,
        priority: editPriority,
        due_date: editDueDate || null,
        tags: parsedTags,
      });

      setMessage("Task updated successfully!");
      cancelEdit();
      await loadTasks();
    } catch (err) {
      console.error("Update task error:", err);
      setError(err.message || "Failed to update task");
    }
  };

  // =========================
  // DELETE TASK
  // =========================
  const handleDeleteTask = async (taskId) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this task?");
    if (!confirmDelete) return;

    setMessage("");
    setError("");

    try {
      await api.deleteTask(taskId);
      setMessage("Task deleted successfully!");
      await loadTasks();
    } catch (err) {
      console.error("Delete task error:", err);
      setError(err.message || "Failed to delete task");
    }
  };

  // =========================
  // LOGOUT
  // =========================
  const logout = () => {
    clearSession();
    navigate("/login");
  };

  if (!user) {
    return (
      <div style={styles.loading}>
        <div style={styles.loadingBox}>Loading...</div>
      </div>
    );
  }

  // Statistics
  const pending = tasks.filter((task) => task.status === "Pending").length;
  const inProgress = tasks.filter((task) => task.status === "In Progress").length;
  const completed = tasks.filter((task) => task.status === "Completed").length;
  const urgentOrHigh = tasks.filter(
    (t) => t.priority === "High" || t.priority === "Urgent"
  ).length;

  const getStatusStyle = (taskStatus) => {
    if (taskStatus === "Completed") {
      return { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
    }
    if (taskStatus === "In Progress") {
      return { background: "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd" };
    }
    return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde047" };
  };

  const getPriorityStyle = (p) => {
    switch (p) {
      case "Urgent":
        return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" };
      case "High":
        return { background: "#ffedd5", color: "#9a3412", border: "1px solid #fdba74" };
      case "Low":
        return { background: "#f3f4f6", color: "#4b5563", border: "1px solid #d1d5db" };
      case "Medium":
      default:
        return { background: "#e0e7ff", color: "#3730a3", border: "1px solid #a5b4fc" };
    }
  };

  const isOverdue = (dueStr, taskStatus) => {
    if (!dueStr || taskStatus === "Completed") return false;
    const due = new Date(dueStr);
    const now = new Date();
    // Compare date parts
    return due.setHours(23, 59, 59, 999) < now.getTime();
  };

  return (
    <div style={styles.page}>
      {/* =========================
          NAVBAR
      ========================= */}
      <nav style={styles.navbar}>
        <div style={styles.logoSection}>
          <h2 style={styles.logo}>DevOps Task Manager</h2>
          <span style={styles.logoSub}>User Dashboard</span>
        </div>

        {/* DevOps Health Indicator */}
        <div style={styles.healthBadge} title="Real-time DevOps Service Probes">
          <span
            style={{
              ...styles.healthDot,
              background: systemHealth.status === "healthy" ? "#22c55e" : "#ef4444",
              boxShadow:
                systemHealth.status === "healthy"
                  ? "0 0 8px #22c55e"
                  : "0 0 8px #ef4444",
            }}
          />
          <span style={styles.healthText}>
            {systemHealth.status === "healthy"
              ? "API: Online | DB: Connected"
              : "System Degraded"}
          </span>
        </div>

        <div style={styles.navRight}>
          {/* Quick Admin Portal Switcher */}
          {user.role === "admin" && (
            <Link to="/admin" style={styles.adminSwitchBtn}>
              🛡️ Admin Portal
            </Link>
          )}

          <div style={styles.userInfo}>
            <div style={styles.userAvatar}>
              {user.name ? user.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div>
              <div style={styles.userNameRow}>
                <span style={styles.userName}>{user.name}</span>
                <span
                  style={{
                    ...styles.roleBadge,
                    background: user.role === "admin" ? "#fdf2f8" : "#f0fdf4",
                    color: user.role === "admin" ? "#be185d" : "#15803d",
                  }}
                >
                  {user.role === "admin" ? "Admin" : "User"}
                </span>
              </div>
              <div style={styles.userEmail}>{user.email}</div>
            </div>
          </div>

          <button onClick={logout} style={styles.logoutButton}>
            Logout
          </button>
        </div>
      </nav>

      {/* =========================
          MAIN CONTAINER
      ========================= */}
      <main style={styles.container}>
        {/* WELCOME BANNER */}
        <div style={styles.welcomeCard}>
          <div>
            <span style={styles.welcomeSmall}>DASHBOARD</span>
            <h1 style={styles.welcomeTitle}>Welcome, {user.name} 👋</h1>
            <p style={styles.welcomeText}>
              Manage your DevOps tasks, set priority levels, and track deadlines seamlessly.
            </p>
          </div>
          <div style={styles.welcomeIcon}>⚡</div>
        </div>

        {/* STATISTICS CARDS */}
        <div style={styles.stats}>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>📋</div>
            <div>
              <p style={styles.statLabel}>Total Tasks</p>
              <strong style={styles.statNumber}>{tasks.length}</strong>
            </div>
          </div>

          <div style={styles.statCard}>
            <div style={{ ...styles.statIcon, background: "#fff7ed" }}>⏳</div>
            <div>
              <p style={styles.statLabel}>Pending</p>
              <strong style={styles.statNumber}>{pending}</strong>
            </div>
          </div>

          <div style={styles.statCard}>
            <div style={{ ...styles.statIcon, background: "#eff6ff" }}>🔄</div>
            <div>
              <p style={styles.statLabel}>In Progress</p>
              <strong style={styles.statNumber}>{inProgress}</strong>
            </div>
          </div>

          <div style={styles.statCard}>
            <div style={{ ...styles.statIcon, background: "#f0fdf4" }}>✓</div>
            <div>
              <p style={styles.statLabel}>Completed</p>
              <strong style={styles.statNumber}>{completed}</strong>
            </div>
          </div>

          <div style={styles.statCard}>
            <div style={{ ...styles.statIcon, background: "#fef2f2" }}>🔥</div>
            <div>
              <p style={styles.statLabel}>High / Urgent</p>
              <strong style={styles.statNumber}>{urgentOrHigh}</strong>
            </div>
          </div>
        </div>

        {/* FEEDBACK MESSAGES */}
        {message && <div style={styles.success}>✓ {message}</div>}
        {error && <div style={styles.error}>⚠ {error}</div>}

        {/* ADD TASK SECTION */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Add New Task</h2>
              <p style={styles.sectionSubtitle}>
                Create a task with priority, tags, and deadline tracking.
              </p>
            </div>
            <div style={styles.sectionBadge}>NEW TASK</div>
          </div>

          <form onSubmit={handleAddTask}>
            <label style={styles.label}>Task Title *</label>
            <input
              type="text"
              placeholder="e.g., Set up Prometheus Alertmanager"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={styles.input}
              required
            />

            <label style={styles.label}>Description</label>
            <textarea
              placeholder="Describe requirements, acceptance criteria, or notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={styles.textarea}
              rows="3"
            />

            {/* Grid for Status, Priority, Due Date */}
            <div style={styles.formGrid}>
              <div>
                <label style={styles.label}>Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={styles.input}
                >
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              <div>
                <label style={styles.label}>Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  style={styles.input}
                >
                  <option value="Low">Low 🟢</option>
                  <option value="Medium">Medium 🔵</option>
                  <option value="High">High 🟠</option>
                  <option value="Urgent">Urgent 🔴</option>
                </select>
              </div>

              <div>
                <label style={styles.label}>Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>

            <label style={styles.label}>Tags (comma-separated)</label>
            <input
              type="text"
              placeholder="e.g., devops, ci-cd, docker, backend"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              style={styles.input}
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.addButton,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Adding..." : "+ Add Task"}
            </button>
          </form>
        </section>

        {/* SEARCH, FILTER & SORT CONTROLS */}
        <section style={styles.filterSection}>
          <div style={styles.searchRow}>
            <div style={styles.searchBox}>
              <span style={styles.searchIcon}>🔍</span>
              <input
                type="text"
                placeholder="Search tasks by title or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={styles.searchInput}
              />
              {search && (
                <button onClick={() => setSearch("")} style={styles.clearSearchBtn}>
                  ✕
                </button>
              )}
            </div>

            <div style={styles.sortBox}>
              <label style={styles.sortLabel}>Sort By:</label>
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split("-");
                  setSortBy(field);
                  setSortOrder(order);
                }}
                style={styles.sortSelect}
              >
                <option value="created_at-desc">Newest First</option>
                <option value="created_at-asc">Oldest First</option>
                <option value="due_date-asc">Due Date (Soonest)</option>
                <option value="due_date-desc">Due Date (Latest)</option>
                <option value="priority-desc">Priority</option>
              </select>
            </div>
          </div>

          {/* Filter Pills */}
          <div style={styles.pillsRow}>
            <div style={styles.pillGroup}>
              <span style={styles.pillGroupLabel}>Status:</span>
              {["All", "Pending", "In Progress", "Completed"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    ...styles.pillBtn,
                    background: statusFilter === s ? PINK : "#ffffff",
                    color: statusFilter === s ? "#ffffff" : "#475569",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            <div style={styles.pillGroup}>
              <span style={styles.pillGroupLabel}>Priority:</span>
              {["All", "Low", "Medium", "High", "Urgent"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  style={{
                    ...styles.pillBtn,
                    background: priorityFilter === p ? PINK_DARK : "#ffffff",
                    color: priorityFilter === p ? "#ffffff" : "#475569",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* MY TASKS LIST SECTION */}
        <section style={styles.section}>
          <div style={styles.taskTitleRow}>
            <div>
              <h2 style={styles.sectionTitle}>My Tasks</h2>
              <p style={styles.sectionSubtitle}>
                Showing {tasks.length} task{tasks.length === 1 ? "" : "s"} matching your criteria.
              </p>
            </div>
            <span style={styles.taskCount}>{tasks.length} Tasks</span>
          </div>

          {tasks.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>📋</div>
              <h3 style={styles.emptyTitle}>No tasks found</h3>
              <p style={styles.emptyText}>
                {search || statusFilter !== "All" || priorityFilter !== "All"
                  ? "Try clearing filters to see all your tasks."
                  : "Add your first task above to get started."}
              </p>
            </div>
          ) : (
            <div style={styles.taskList}>
              {tasks.map((task) => (
                <div key={task.id} style={styles.taskCard}>
                  {editingId === task.id ? (
                    /* EDIT MODE */
                    <div>
                      <div style={styles.editHeader}>
                        <div>
                          <h3 style={styles.editTitle}>Edit Task</h3>
                          <p style={styles.editSubtitle}>Update your task details.</p>
                        </div>
                        <button onClick={cancelEdit} style={styles.closeButton}>
                          ✕
                        </button>
                      </div>

                      <label style={styles.label}>Task Title</label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        style={styles.input}
                      />

                      <label style={styles.label}>Description</label>
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        style={styles.textarea}
                        rows="3"
                      />

                      <div style={styles.formGrid}>
                        <div>
                          <label style={styles.label}>Status</label>
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                            style={styles.input}
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                          </select>
                        </div>

                        <div>
                          <label style={styles.label}>Priority</label>
                          <select
                            value={editPriority}
                            onChange={(e) => setEditPriority(e.target.value)}
                            style={styles.input}
                          >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Urgent">Urgent</option>
                          </select>
                        </div>

                        <div>
                          <label style={styles.label}>Due Date</label>
                          <input
                            type="date"
                            value={editDueDate}
                            onChange={(e) => setEditDueDate(e.target.value)}
                            style={styles.input}
                          />
                        </div>
                      </div>

                      <label style={styles.label}>Tags (comma-separated)</label>
                      <input
                        type="text"
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        style={styles.input}
                      />

                      <div style={styles.editButtons}>
                        <button
                          onClick={() => handleUpdateTask(task.id)}
                          style={styles.saveButton}
                        >
                          Save Changes
                        </button>
                        <button onClick={cancelEdit} style={styles.cancelButton}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* NORMAL TASK DISPLAY */
                    <div style={styles.taskCardInner}>
                      <div style={styles.taskMainContent}>
                        <div style={styles.taskHeaderRow}>
                          <h3 style={styles.taskName}>{task.title}</h3>

                          {/* Badges Container */}
                          <div style={styles.badgesWrapper}>
                            {/* Priority Badge */}
                            <span
                              style={{
                                ...styles.badge,
                                ...getPriorityStyle(task.priority),
                              }}
                            >
                              {task.priority || "Medium"}
                            </span>

                            {/* Status Badge */}
                            <span
                              style={{
                                ...styles.badge,
                                ...getStatusStyle(task.status),
                              }}
                            >
                              {task.status}
                            </span>
                          </div>
                        </div>

                        <p style={styles.descriptionText}>
                          {task.description || "No description provided."}
                        </p>

                        {/* Metadata row: Due Date, Tags, Created */}
                        <div style={styles.metaRow}>
                          {task.due_date && (
                            <span
                              style={{
                                ...styles.dueDateBadge,
                                ...(isOverdue(task.due_date, task.status)
                                  ? styles.overdueBadge
                                  : {}),
                              }}
                            >
                              📅 Due: {task.due_date.slice(0, 10)}
                              {isOverdue(task.due_date, task.status) && " (Overdue ⚠️)"}
                            </span>
                          )}

                          {Array.isArray(task.tags) && task.tags.length > 0 && (
                            <div style={styles.tagsContainer}>
                              {task.tags.map((t, idx) => (
                                <span key={idx} style={styles.tagChip}>
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={styles.taskActions}>
                        <button
                          onClick={() => startEdit(task)}
                          style={styles.editButton}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          style={styles.deleteButton}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// =====================================================
// STYLES
// =====================================================

const PINK = "#c94f8b";
const PINK_DARK = "#7a1f4d";

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    fontFamily: "'Segoe UI', Arial, sans-serif",
    paddingBottom: "50px",
  },

  navbar: {
    background: "rgba(255,255,255,0.98)",
    padding: "14px 35px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "sticky",
    top: 0,
    zIndex: 100,
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    borderBottom: "1px solid #e2e8f0",
  },

  logoSection: {
    display: "flex",
    flexDirection: "column",
  },

  logo: {
    margin: 0,
    color: PINK_DARK,
    fontSize: "20px",
    fontWeight: "800",
    letterSpacing: "-0.5px",
  },

  logoSub: {
    color: "#94a3b8",
    fontSize: "11px",
    letterSpacing: "1px",
    textTransform: "uppercase",
  },

  healthBadge: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#f1f5f9",
    padding: "6px 14px",
    borderRadius: "20px",
    fontSize: "12px",
    color: "#334155",
    fontWeight: "500",
  },

  healthDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    display: "inline-block",
  },

  healthText: {
    fontSize: "12px",
    letterSpacing: "0.2px",
  },

  navRight: {
    display: "flex",
    alignItems: "center",
    gap: "18px",
  },

  adminSwitchBtn: {
    background: "#fdf2f8",
    color: "#be185d",
    border: "1px solid #fbcfe8",
    padding: "7px 14px",
    borderRadius: "8px",
    textDecoration: "none",
    fontSize: "12px",
    fontWeight: "700",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    transition: "all 0.2s",
  },

  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },

  userAvatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: PINK,
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "14px",
  },

  userNameRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },

  userName: {
    color: "#1e293b",
    fontWeight: "700",
    fontSize: "13px",
  },

  roleBadge: {
    fontSize: "10px",
    fontWeight: "700",
    padding: "2px 6px",
    borderRadius: "10px",
    textTransform: "uppercase",
  },

  userEmail: {
    color: "#94a3b8",
    fontSize: "11px",
  },

  logoutButton: {
    padding: "8px 16px",
    border: "none",
    borderRadius: "8px",
    background: "#fee2e2",
    color: "#b91c1c",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "12px",
    transition: "all 0.2s",
  },

  container: {
    width: "1120px",
    maxWidth: "94%",
    margin: "25px auto",
  },

  welcomeCard: {
    background: "linear-gradient(135deg, #ffffff 0%, #fdf2f8 100%)",
    borderRadius: "16px",
    padding: "24px 30px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "20px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
    border: "1px solid #fce7f3",
  },

  welcomeSmall: {
    color: PINK,
    fontSize: "11px",
    fontWeight: "800",
    letterSpacing: "1.5px",
  },

  welcomeTitle: {
    margin: "4px 0",
    color: PINK_DARK,
    fontSize: "24px",
    fontWeight: "800",
  },

  welcomeText: {
    margin: 0,
    color: "#64748b",
    fontSize: "14px",
  },

  welcomeIcon: {
    fontSize: "36px",
    background: "#ffffff",
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(201,79,139,0.15)",
  },

  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: "14px",
    marginBottom: "22px",
  },

  statCard: {
    background: "white",
    borderRadius: "12px",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    border: "1px solid #e2e8f0",
  },

  statIcon: {
    width: "42px",
    height: "42px",
    borderRadius: "10px",
    background: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px",
  },

  statLabel: {
    margin: 0,
    color: "#64748b",
    fontSize: "12px",
    fontWeight: "500",
  },

  statNumber: {
    fontSize: "22px",
    fontWeight: "800",
    color: "#0f172a",
  },

  success: {
    background: "#dcfce7",
    color: "#166534",
    padding: "12px 18px",
    borderRadius: "10px",
    marginBottom: "18px",
    fontSize: "13px",
    fontWeight: "600",
    border: "1px solid #bbf7d0",
  },

  error: {
    background: "#fee2e2",
    color: "#991b1b",
    padding: "12px 18px",
    borderRadius: "10px",
    marginBottom: "18px",
    fontSize: "13px",
    fontWeight: "600",
    border: "1px solid #fecaca",
  },

  section: {
    background: "white",
    borderRadius: "14px",
    padding: "24px 28px",
    marginBottom: "22px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
    border: "1px solid #e2e8f0",
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "18px",
    paddingBottom: "12px",
    borderBottom: "1px solid #f1f5f9",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "18px",
    fontWeight: "700",
    color: "#1e293b",
  },

  sectionSubtitle: {
    margin: "4px 0 0",
    fontSize: "13px",
    color: "#64748b",
  },

  sectionBadge: {
    background: "#fdf2f8",
    color: PINK,
    fontSize: "11px",
    fontWeight: "700",
    padding: "4px 10px",
    borderRadius: "20px",
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "14px",
  },

  label: {
    display: "block",
    margin: "10px 0 5px",
    fontSize: "12px",
    fontWeight: "600",
    color: "#334155",
  },

  input: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    boxSizing: "border-box",
    outline: "none",
  },

  textarea: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    boxSizing: "border-box",
    fontFamily: "inherit",
    outline: "none",
  },

  addButton: {
    marginTop: "16px",
    padding: "11px 24px",
    background: PINK,
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontWeight: "700",
    fontSize: "13px",
    cursor: "pointer",
    transition: "background 0.2s",
  },

  filterSection: {
    background: "white",
    borderRadius: "14px",
    padding: "18px 24px",
    marginBottom: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    border: "1px solid #e2e8f0",
  },

  searchRow: {
    display: "flex",
    gap: "16px",
    alignItems: "center",
    marginBottom: "14px",
  },

  searchBox: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    padding: "0 12px",
  },

  searchIcon: {
    fontSize: "14px",
    marginRight: "8px",
  },

  searchInput: {
    flex: 1,
    border: "none",
    background: "transparent",
    padding: "10px 0",
    fontSize: "13px",
    outline: "none",
  },

  clearSearchBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "12px",
    color: "#94a3b8",
  },

  sortBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  sortLabel: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#64748b",
  },

  sortSelect: {
    padding: "9px 12px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "12px",
    background: "#ffffff",
    outline: "none",
  },

  pillsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "20px",
    alignItems: "center",
    paddingTop: "10px",
    borderTop: "1px solid #f1f5f9",
  },

  pillGroup: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },

  pillGroupLabel: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#64748b",
    marginRight: "4px",
  },

  pillBtn: {
    border: "1px solid #cbd5e1",
    borderRadius: "16px",
    padding: "4px 12px",
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.15s",
  },

  taskTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },

  taskCount: {
    background: "#f1f5f9",
    color: "#475569",
    fontSize: "12px",
    fontWeight: "700",
    padding: "4px 12px",
    borderRadius: "20px",
  },

  empty: {
    textAlign: "center",
    padding: "40px 20px",
  },

  emptyIcon: {
    fontSize: "36px",
    marginBottom: "8px",
  },

  emptyTitle: {
    margin: "0 0 6px",
    fontSize: "16px",
    color: "#334155",
  },

  emptyText: {
    margin: 0,
    fontSize: "13px",
    color: "#94a3b8",
  },

  taskList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },

  taskCard: {
    background: "#ffffff",
    borderRadius: "10px",
    padding: "16px 18px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
    transition: "box-shadow 0.2s",
  },

  taskCardInner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
  },

  taskMainContent: {
    flex: 1,
  },

  taskHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "6px",
  },

  taskName: {
    margin: 0,
    fontSize: "15px",
    fontWeight: "700",
    color: "#0f172a",
  },

  badgesWrapper: {
    display: "flex",
    gap: "6px",
  },

  badge: {
    fontSize: "11px",
    fontWeight: "700",
    padding: "2px 8px",
    borderRadius: "6px",
    letterSpacing: "0.2px",
  },

  descriptionText: {
    margin: "4px 0 10px",
    fontSize: "13px",
    color: "#475569",
    lineHeight: "1.4",
  },

  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "10px",
  },

  dueDateBadge: {
    fontSize: "11px",
    fontWeight: "600",
    color: "#64748b",
    background: "#f1f5f9",
    padding: "3px 8px",
    borderRadius: "6px",
  },

  overdueBadge: {
    background: "#fee2e2",
    color: "#dc2626",
    fontWeight: "700",
  },

  tagsContainer: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },

  tagChip: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    color: "#0284c7",
    fontSize: "10px",
    fontWeight: "600",
    padding: "2px 7px",
    borderRadius: "4px",
  },

  taskActions: {
    display: "flex",
    gap: "8px",
  },

  editButton: {
    padding: "6px 12px",
    background: "#f8fafc",
    color: "#334155",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },

  deleteButton: {
    padding: "6px 12px",
    background: "#fee2e2",
    color: "#dc2626",
    border: "1px solid #fca5a5",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },

  editHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "14px",
  },

  editTitle: {
    margin: 0,
    fontSize: "16px",
    color: "#0f172a",
  },

  editSubtitle: {
    margin: "2px 0 0",
    fontSize: "12px",
    color: "#64748b",
  },

  closeButton: {
    background: "transparent",
    border: "none",
    fontSize: "16px",
    cursor: "pointer",
    color: "#94a3b8",
  },

  editButtons: {
    display: "flex",
    gap: "10px",
    marginTop: "16px",
  },

  saveButton: {
    padding: "8px 18px",
    background: PINK,
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },

  cancelButton: {
    padding: "8px 18px",
    background: "#f1f5f9",
    color: "#475569",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },

  loading: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f8fafc",
  },

  loadingBox: {
    background: "white",
    padding: "24px 36px",
    borderRadius: "12px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    fontWeight: "600",
    color: "#334155",
  },
};

export default Dashboard;