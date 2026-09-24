import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, clearSession } from "../services/api";
import "./AdminDashboard.css";

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("tasks"); // "tasks" | "users" | "health"

  // Tasks state
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [editingTask, setEditingTask] = useState(null);

  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    status: "Pending",
    priority: "Medium",
    due_date: "",
  });

  // Users state
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  // DevOps Health state
  const [healthData, setHealthData] = useState({
    status: "checking",
    database: "checking",
  });

  const [message, setMessage] = useState("");

  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => {
      setMessage("");
    }, 2500);
  };

  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await api.getAllTasks();
      setTasks(data.tasks || []);
    } catch (error) {
      console.error("Load Tasks Error:", error);
      showMessage(error.message || "Unable to load tasks");
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const data = await api.getAllUsers();
      setUsers(data.users || []);
    } catch (error) {
      console.error("Load Users Error:", error);
      showMessage(error.message || "Unable to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadHealth = async () => {
    try {
      const data = await api.getHealth();
      setHealthData({
        status: data.status || "healthy",
        database: data.database || "connected",
      });
    } catch {
      setHealthData({
        status: "unhealthy",
        database: "disconnected",
      });
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTasks();
    loadUsers();
    loadHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEditModal = (task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title || "",
      description: task.description || "",
      status: task.status || "Pending",
      priority: task.priority || "Medium",
      due_date: task.due_date ? task.due_date.slice(0, 10) : "",
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingTask) return;

    try {
      const data = await api.updateTask(editingTask.id, {
        ...editForm,
        due_date: editForm.due_date || null,
      });

      setTasks((prev) =>
        prev.map((task) => (task.id === editingTask.id ? data.task : task))
      );

      setEditingTask(null);
      showMessage("Task updated successfully");
    } catch (error) {
      console.error("Update Error:", error);
      showMessage(error.message || "Failed to update task");
    }
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm("Are you sure you want to delete this task?");
    if (!confirmed) return;

    try {
      await api.deleteTask(id);
      setTasks((prev) => prev.filter((task) => task.id !== id));
      showMessage("Task deleted successfully");
    } catch (error) {
      console.error("Delete Error:", error);
      showMessage(error.message || "Failed to delete task");
    }
  };

  const handleToggleUserRole = async (userId, currentRole) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    const confirmed = window.confirm(`Change role to '${newRole}'?`);
    if (!confirmed) return;

    try {
      await api.updateUserRole(userId, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      showMessage(`User role updated to ${newRole}`);
    } catch (error) {
      console.error("Update Role Error:", error);
      showMessage(error.message || "Failed to update role");
    }
  };

  const handleDeleteUser = async (userId) => {
    const confirmed = window.confirm(
      "Are you sure you want to permanently delete this user? All their tasks will remain."
    );
    if (!confirmed) return;

    try {
      await api.deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      showMessage("User deleted successfully");
    } catch (error) {
      console.error("Delete User Error:", error);
      showMessage(error.message || "Failed to delete user");
    }
  };

  const logout = () => {
    clearSession();
    navigate("/login");
  };

  const total = tasks.length;
  const pending = tasks.filter((task) => task.status === "Pending").length;
  const progress = tasks.filter((task) => task.status === "In Progress").length;
  const completed = tasks.filter((task) => task.status === "Completed").length;
  const urgentTasks = tasks.filter(
    (t) => t.priority === "Urgent" || t.priority === "High"
  ).length;

  const filteredTasks = tasks.filter((task) => {
    const searchText = search.toLowerCase().trim();

    const matchesSearch =
      task.title?.toLowerCase().includes(searchText) ||
      task.description?.toLowerCase().includes(searchText) ||
      task.email?.toLowerCase().includes(searchText);

    const matchesStatus =
      statusFilter === "All" || task.status === statusFilter;

    const matchesPriority =
      priorityFilter === "All" || (task.priority || "Medium") === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase().trim();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  const getStatusClass = (status) => {
    if (status === "In Progress") return "progress";
    if (status === "Completed") return "completed";
    return "pending";
  };

  return (
    <div className="admin-layout">
      {/* SIDEBAR */}
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">D</div>
          <div className="brand-text">
            <h2>DevTask</h2>
            <span>Admin Portal</span>
          </div>
        </div>

        <div className="sidebar-divider"></div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === "tasks" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("tasks")}
          >
            <span className="nav-icon">📋</span> All Tasks ({total})
          </button>

          <button
            className={`nav-item ${activeTab === "users" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("users")}
          >
            <span className="nav-icon">👥</span> Manage Users ({users.length})
          </button>

          <button
            className={`nav-item ${activeTab === "health" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setActiveTab("health");
              loadHealth();
            }}
          >
            <span className="nav-icon">🩺</span> DevOps & Health
          </button>

          <button
            className="nav-item"
            type="button"
            onClick={() => {
              loadTasks();
              loadUsers();
              loadHealth();
            }}
          >
            <span className="nav-icon">🔄</span> Refresh All
          </button>

          <Link to="/dashboard" className="nav-item user-portal-link">
            <span className="nav-icon">👤</span> My User Dashboard
          </Link>
        </nav>

        <div className="sidebar-bottom">
          <div className="admin-profile">
            <div className="profile-avatar">A</div>
            <div className="profile-info">
              <strong>Administrator</strong>
              <span>System Admin</span>
            </div>
          </div>
          <button className="logout-button" type="button" onClick={logout}>
            <span>🚪</span> Logout
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="admin-main">
        <header className="admin-header">
          <div className="page-heading">
            <span className="heading-label">ADMIN DASHBOARD</span>
            <h1>Welcome back, Administrator 👋</h1>
            <p>Manage system tasks, monitor progress, and administer user roles.</p>
          </div>
          <button
            className="refresh-button"
            type="button"
            onClick={() => {
              if (activeTab === "tasks") loadTasks();
              else if (activeTab === "users") loadUsers();
              else loadHealth();
            }}
          >
            <span>↻</span> Refresh
          </button>
        </header>

        {message && (
          <div className="notification">
            <span>✓</span> {message}
          </div>
        )}

        {/* STATS CARDS */}
        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-top">
              <div>
                <span className="stat-title">Total Tasks</span>
                <span className="stat-number">{total}</span>
              </div>
              <div className="stat-icon">📋</div>
            </div>
            <div className="stat-footer">All tasks in system</div>
          </div>

          <div className="stat-card pending">
            <div className="stat-card-top">
              <div>
                <span className="stat-title">Pending</span>
                <span className="stat-number">{pending}</span>
              </div>
              <div className="stat-icon">⏳</div>
            </div>
            <div className="stat-footer">Awaiting action</div>
          </div>

          <div className="stat-card progress">
            <div className="stat-card-top">
              <div>
                <span className="stat-title">In Progress</span>
                <span className="stat-number">{progress}</span>
              </div>
              <div className="stat-icon">⚡</div>
            </div>
            <div className="stat-footer">Actively being worked on</div>
          </div>

          <div className="stat-card completed">
            <div className="stat-card-top">
              <div>
                <span className="stat-title">Completed</span>
                <span className="stat-number">{completed}</span>
              </div>
              <div className="stat-icon">✓</div>
            </div>
            <div className="stat-footer">Successfully finished</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-top">
              <div>
                <span className="stat-title">High / Urgent</span>
                <span className="stat-number">{urgentTasks}</span>
              </div>
              <div className="stat-icon">🔥</div>
            </div>
            <div className="stat-footer">Priority focus tasks</div>
          </div>
        </section>

        {/* TAB 1: ALL TASKS */}
        {activeTab === "tasks" && (
          <section className="tasks-card">
            <div className="tasks-header">
              <div>
                <span className="section-label">TASK MANAGEMENT</span>
                <h2>All User Tasks</h2>
                <p>View, search, edit and manage tasks created by users across the system.</p>
              </div>
              <div className="task-count">{filteredTasks.length} Tasks</div>
            </div>

            {/* CONTROLS */}
            <div className="task-controls">
              <div className="search-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search by task, user or description..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    className="clear-search"
                    onClick={() => setSearch("")}
                  >
                    ×
                  </button>
                )}
              </div>

              <select
                className="status-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Status</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>

              <select
                className="status-select"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="All">All Priority</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>

            {/* TABLE */}
            {loading ? (
              <div className="table-loading">
                <div className="loading-spinner"></div>
                <h3>Loading tasks...</h3>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="no-tasks">
                <div className="no-tasks-icon">📋</div>
                <h3>No tasks found</h3>
                <p>No tasks match your current search or filter.</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Priority</th>
                      <th>User</th>
                      <th>Due Date</th>
                      <th>Description</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((task) => (
                      <tr key={task.id}>
                        <td>
                          <div className="task-info">
                            <div className="task-avatar">✓</div>
                            <div className="task-details">
                              <strong>{task.title}</strong>
                              <span>ID: {task.id ? task.id.slice(-6) : "N/A"}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span
                            className={`priority-badge priority-${(
                              task.priority || "Medium"
                            ).toLowerCase()}`}
                          >
                            {task.priority || "Medium"}
                          </span>
                        </td>

                        <td>
                          <div className="user-info">
                            <div className="user-avatar">
                              {task.email?.charAt(0)?.toUpperCase() || "U"}
                            </div>
                            <span>{task.email || "Unknown"}</span>
                          </div>
                        </td>

                        <td className="due-date-cell">
                          {task.due_date ? task.due_date.slice(0, 10) : "—"}
                        </td>

                        <td>
                          <div className="description-cell">
                            {task.description || "No description"}
                          </div>
                        </td>

                        <td>
                          <span className={`status-badge ${getStatusClass(task.status)}`}>
                            <span className="status-dot">●</span>
                            {task.status || "Pending"}
                          </span>
                        </td>

                        <td>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="edit-button"
                              onClick={() => openEditModal(task)}
                              title="Edit Task"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="delete-button"
                              onClick={() => handleDelete(task.id)}
                              title="Delete Task"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 2: USER ADMINISTRATION */}
        {activeTab === "users" && (
          <section className="tasks-card">
            <div className="tasks-header">
              <div>
                <span className="section-label">USER ADMINISTRATION</span>
                <h2>Registered Users</h2>
                <p>View registered accounts, modify roles (Admin/User), or remove users.</p>
              </div>
              <div className="task-count">{filteredUsers.length} Users</div>
            </div>

            {/* CONTROLS */}
            <div className="task-controls">
              <div className="search-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search by name, email or role..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
                {userSearch && (
                  <button
                    type="button"
                    className="clear-search"
                    onClick={() => setUserSearch("")}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* USERS TABLE */}
            {loadingUsers ? (
              <div className="table-loading">
                <div className="loading-spinner"></div>
                <h3>Loading users...</h3>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="no-tasks">
                <div className="no-tasks-icon">👥</div>
                <h3>No users found</h3>
                <p>No registered users match your search criteria.</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Current Role</th>
                      <th>Registered On</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="task-info">
                            <div className="user-avatar">
                              {u.name?.charAt(0)?.toUpperCase() || "U"}
                            </div>
                            <div className="task-details">
                              <strong>{u.name || "Unnamed"}</strong>
                              <span>ID: {u.id ? u.id.slice(-6) : "N/A"}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span>{u.email}</span>
                        </td>

                        <td>
                          <span
                            className={`status-badge ${
                              u.role === "admin" ? "completed" : "pending"
                            }`}
                          >
                            <span className="status-dot">●</span>
                            {u.role === "admin" ? "Admin 🛡️" : "User 👤"}
                          </span>
                        </td>

                        <td>
                          <span style={{ fontSize: "12px", color: "var(--text-light)" }}>
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                          </span>
                        </td>

                        <td>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="edit-button"
                              onClick={() => handleToggleUserRole(u.id, u.role)}
                              title={
                                u.role === "admin"
                                  ? "Demote to User"
                                  : "Promote to Admin"
                              }
                            >
                              {u.role === "admin" ? "Demote ⬇" : "Make Admin ⬆"}
                            </button>
                            <button
                              type="button"
                              className="delete-button"
                              onClick={() => handleDeleteUser(u.id)}
                              title="Delete User Account"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 3: DEVOPS HEALTH & OBSERVABILITY */}
        {activeTab === "health" && (
          <section className="tasks-card">
            <div className="tasks-header">
              <div>
                <span className="section-label">OBSERVABILITY & MONITORING</span>
                <h2>DevOps System Status & Probes</h2>
                <p>Real-time application health probes, database connection, and Prometheus scrape metrics.</p>
              </div>
              <button className="refresh-button" type="button" onClick={loadHealth}>
                <span>↻</span> Refresh Probes
              </button>
            </div>

            <div className="health-grid">
              <div className="health-card">
                <div className="health-card-header">
                  <span
                    className="health-indicator-dot"
                    style={{
                      background:
                        healthData.status === "healthy" ? "#16a34a" : "#dc2626",
                    }}
                  />
                  <strong>FastAPI Backend</strong>
                </div>
                <div className="health-card-body">
                  Status: <b>{healthData.status}</b>
                  <br />
                  Container port: <b>8000</b>
                </div>
                <div className="health-card-footer">
                  Probe: <code>GET /health/live</code>
                </div>
              </div>

              <div className="health-card">
                <div className="health-card-header">
                  <span
                    className="health-indicator-dot"
                    style={{
                      background:
                        healthData.database === "connected"
                          ? "#16a34a"
                          : "#dc2626",
                    }}
                  />
                  <strong>MongoDB Database</strong>
                </div>
                <div className="health-card-body">
                  Database: <b>{healthData.database}</b>
                  <br />
                  Pool status: Active &amp; ping verified
                </div>
                <div className="health-card-footer">
                  Probe: <code>GET /health/ready</code>
                </div>
              </div>

              <div className="health-card">
                <div className="health-card-header">
                  <span style={{ fontSize: "16px" }}>📊</span>
                  <strong>Prometheus Metrics</strong>
                </div>
                <div className="health-card-body">
                  Application metrics instrumentation is live for scrape targets.
                </div>
                <div className="health-card-footer">
                  Scrape Endpoint: <code>GET /metrics</code>
                </div>
              </div>

              <div className="health-card">
                <div className="health-card-header">
                  <span style={{ fontSize: "16px" }}>📖</span>
                  <strong>OpenAPI Documentation</strong>
                </div>
                <div className="health-card-body">
                  Interactive API documentation and schema specifications.
                </div>
                <div className="health-card-footer">
                  Endpoints: <code>/docs</code> &amp; <code>/redoc</code>
                </div>
              </div>
            </div>
          </section>
        )}

        <footer className="dashboard-footer">
          <span>© 2026 DevTask System. All rights reserved.</span>
          <span>DevOps Admin Portal v2.5</span>
        </footer>
      </main>

      {/* EDIT TASK MODAL */}
      {editingTask && (
        <div className="modal-overlay" onClick={() => setEditingTask(null)}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-label">TASK MANAGEMENT</span>
                <h2>Edit Task</h2>
                <p>Update task information</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setEditingTask(null)}
              >
                ×
              </button>
            </div>

            <form className="edit-form" onSubmit={handleUpdate}>
              <label>
                Task Title
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm({ ...editForm, title: e.target.value })
                  }
                  required
                />
              </label>

              <label>
                Description
                <textarea
                  rows="3"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                />
              </label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <label>
                  Status
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm({ ...editForm, status: e.target.value })
                    }
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </label>

                <label>
                  Priority
                  <select
                    value={editForm.priority}
                    onChange={(e) =>
                      setEditForm({ ...editForm, priority: e.target.value })
                    }
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </label>
              </div>

              <label>
                Due Date
                <input
                  type="date"
                  value={editForm.due_date}
                  onChange={(e) =>
                    setEditForm({ ...editForm, due_date: e.target.value })
                  }
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => setEditingTask(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="save-button">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}