import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, clearSession, getUser } from "../services/api";
import { WORK_ITEM_TEMPLATES } from "../utils/templates";
import WorkItemModal from "../components/WorkItemModal";
import UserProfileModal from "../components/UserProfileModal";
import SprintManagerModal from "../components/SprintManagerModal";

const PINK = "#c94f8b";
const PINK_DARK = "#7a1f4d";

function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(() => getUser());
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);

  // Active view: "kanban" (Boards) | "list" (Backlog & Bulk) | "sprints" (Sprints & Burndown) | "pipelines" (CI/CD) | "queries" (Filters & Query Engine)
  const [activeView, setActiveView] = useState("kanban");

  // Form state for creating task
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Pending");
  const [priority, setPriority] = useState("Medium");
  const [itemType, setItemType] = useState("Task");
  const [assignedTo, setAssignedTo] = useState("");
  const [createSprintId, setCreateSprintId] = useState("");
  const [storyPoints, setStoryPoints] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [tags, setTags] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Template & AI Assistant in Create Form
  const [selectedCreateTemplate, setSelectedCreateTemplate] = useState("");
  const [showCreateAiBox, setShowCreateAiBox] = useState(false);
  const [createAiPrompt, setCreateAiPrompt] = useState("");
  const [generatingCreateAi, setGeneratingCreateAi] = useState(false);

  // Queries Engine state
  const [queriesList, setQueriesList] = useState({ system_queries: [], custom_queries: [] });
  const [selectedQuery, setSelectedQuery] = useState(null);
  const [queryFilter, setQueryFilter] = useState({
    item_type: "All",
    status: "All",
    priority: "All",
    assigned_to: "",
    sprint_id: "",
    search: "",
  });
  const [queryResults, setQueryResults] = useState([]);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [loadingQueryRun, setLoadingQueryRun] = useState(false);
  const [showSaveQueryModal, setShowSaveQueryModal] = useState(false);
  const [newQueryName, setNewQueryName] = useState("");
  const [savingQuery, setSavingQuery] = useState(false);
  const [loadingSampleData, setLoadingSampleData] = useState(false);

  // Filters, search & sorting
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [itemTypeFilter, setItemTypeFilter] = useState("All");
  const [sprintFilter, setSprintFilter] = useState("All");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  // Selected Sprint for Sprints View
  const [selectedSprintId, setSelectedSprintId] = useState("");
  const [sprintBurndown, setSprintBurndown] = useState(null);

  // Modals state
  const [selectedWorkItem, setSelectedWorkItem] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [editingSprint, setEditingSprint] = useState(null);

  // Bulk actions state (Multi-select)
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPriority, setBulkPriority] = useState("");
  const [bulkSprintId, setBulkSprintId] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Pipelines state
  const [pipelineRuns, setPipelineRuns] = useState([]);
  const [triggeringPipeline, setTriggeringPipeline] = useState(false);

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
        item_type: itemTypeFilter !== "All" ? itemTypeFilter : undefined,
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
  }, [navigate, search, statusFilter, priorityFilter, itemTypeFilter, sortBy, sortOrder]);

  // =========================
  // LOAD SPRINTS
  // =========================
  const loadSprints = useCallback(async () => {
    try {
      const res = await api.getSprints();
      const list = res.sprints || [];
      setSprints(list);
      if (list.length > 0) {
        setSelectedSprintId((prev) => {
          if (prev && list.some((s) => s.id === prev)) return prev;
          const active = list.find((s) => s.status === "Active");
          return active ? active.id : list[0].id;
        });
      }
    } catch (err) {
      console.error("Sprint load error:", err);
    }
  }, []);

  // =========================
  // LOAD SPRINT BURNDOWN
  // =========================
  const loadSprintBurndown = useCallback(async (sId) => {
    if (!sId) {
      setSprintBurndown(null);
      return;
    }
    try {
      const res = await api.getSprintBurndown(sId);
      setSprintBurndown(res.burndown || null);
    } catch (err) {
      console.error("Burndown error:", err);
      setSprintBurndown(null);
    }
  }, []);

  // =========================
  // LOAD TEAM & TAGS
  // =========================
  const loadTeamAndTags = useCallback(async () => {
    try {
      const [teamRes, tagsRes] = await Promise.all([
        api.getTeamMembers().catch(() => ({ members: [] })),
        api.getTags().catch(() => ({ tags: [] })),
      ]);
      setTeamMembers(teamRes.members || []);
      setAvailableTags(tagsRes.tags || []);
    } catch (err) {
      console.error("Meta load error:", err);
    }
  }, []);

  // =========================
  // LOAD PIPELINES
  // =========================
  const loadPipelineRuns = useCallback(async () => {
    try {
      const res = await api.getPipelineRuns();
      setPipelineRuns(res.runs || []);
    } catch (err) {
      console.error("Pipeline load error:", err);
    }
  }, []);

  // =========================
  // LOAD QUERIES
  // =========================
  const loadQueries = useCallback(async () => {
    setLoadingQueries(true);
    try {
      const data = await api.getQueries();
      setQueriesList({
        system_queries: data.system_queries || [],
        custom_queries: data.custom_queries || [],
      });
    } catch (err) {
      console.error("Load queries error:", err);
    } finally {
      setLoadingQueries(false);
    }
  }, []);

  // Handle Load Sample / Demo DevOps Data
  const handleLoadSampleData = async () => {
    setLoadingSampleData(true);
    setError("");
    setMessage("");
    try {
      const res = await api.seedDemoData();
      setMessage(`🌱 ${res.message || "Sample Azure DevOps data loaded successfully!"}`);
      await Promise.all([
        loadTasks(),
        loadSprints(),
        loadQueries(),
      ]);
      if (selectedSprintId) loadSprintBurndown(selectedSprintId);
      setTimeout(() => setMessage(""), 4000);
    } catch (err) {
      setError(err.message || "Failed to load sample data");
    } finally {
      setLoadingSampleData(false);
    }
  };

  // Initial Load
  useEffect(() => {
    if (!user || !user.email) {
      clearSession();
      navigate("/login");
      return;
    }

    checkHealth();
    loadTasks();
    loadSprints();
    loadTeamAndTags();
    loadPipelineRuns();
    loadQueries();
  }, [navigate, user, loadTasks, checkHealth, loadSprints, loadTeamAndTags, loadPipelineRuns, loadQueries]);

  // Load burndown whenever selectedSprintId changes
  useEffect(() => {
    if (selectedSprintId) {
      loadSprintBurndown(selectedSprintId);
    }
  }, [selectedSprintId, loadSprintBurndown]);

  // Work Item Template Preset Handler
  const handleApplyCreateTemplate = (tmplId) => {
    setSelectedCreateTemplate(tmplId);
    if (!tmplId) return;
    const tmpl = WORK_ITEM_TEMPLATES.find((t) => t.id === tmplId);
    if (!tmpl) return;

    if (description.trim() && !window.confirm(`Replace current description with "${tmpl.name}" template?`)) {
      return;
    }
    setDescription(tmpl.templateText);
    if (tmpl.defaultItemType) setItemType(tmpl.defaultItemType);
    if (tmpl.defaultPriority) setPriority(tmpl.defaultPriority);
    if (tmpl.defaultStoryPoints && (storyPoints === "" || storyPoints === null)) {
      setStoryPoints(String(tmpl.defaultStoryPoints));
    }
    if (tmpl.defaultTags && !tags.trim()) {
      setTags(tmpl.defaultTags.join(", "));
    }
    setMessage(`Applied "${tmpl.name}" template.`);
    setTimeout(() => setMessage(""), 3000);
  };

  // AI Work Item Assistant in Create Form
  const handleAiGenerateCreateWorkItem = async () => {
    if (!createAiPrompt.trim()) {
      setError("Please describe the work item requirements for the AI Assistant.");
      return;
    }
    setGeneratingCreateAi(true);
    setError("");
    try {
      const res = await api.aiGenerateWorkItem({
        prompt: createAiPrompt.trim(),
        item_type: itemType || "Task",
        context: description ? description.slice(0, 500) : undefined,
      });

      if (res.title) setTitle(res.title);
      if (res.item_type) setItemType(res.item_type);

      let fullDesc = res.description || "";
      if (Array.isArray(res.acceptance_criteria) && res.acceptance_criteria.length > 0) {
        fullDesc += "\n\n### Acceptance Criteria\n" + res.acceptance_criteria.map((ac) => `- [ ] ${ac}`).join("\n");
      }
      setDescription(fullDesc);

      if (res.story_points !== undefined && res.story_points !== null) {
        setStoryPoints(String(res.story_points));
      }
      if (res.priority) setPriority(res.priority);
      if (Array.isArray(res.tags) && res.tags.length > 0) {
        const existingTags = tags ? tags.split(",").map((t) => t.trim()) : [];
        const merged = Array.from(new Set([...existingTags, ...res.tags])).filter(Boolean);
        setTags(merged.join(", "));
      }

      setMessage("✨ AI generated work item specification! Review and save.");
      setShowCreateAiBox(false);
      setCreateAiPrompt("");
      setTimeout(() => setMessage(""), 4000);
    } catch (err) {
      setError(err.message || "Failed to generate work item with AI");
    } finally {
      setGeneratingCreateAi(false);
    }
  };

  // Run System or Saved Custom Query
  const handleRunSystemOrSavedQuery = async (queryItem) => {
    setSelectedQuery(queryItem);
    setLoadingQueryRun(true);
    setError("");
    try {
      const payload = {
        name: queryItem.name || queryItem.id,
        filter: queryItem.filter || {},
      };
      const res = await api.runQuery(payload);
      setQueryResults(res.items || []);
    } catch (err) {
      setError(err.message || "Failed to execute query");
    } finally {
      setLoadingQueryRun(false);
    }
  };

  // Run Ad-hoc Query from Filter Builder
  const handleRunAdhocQuery = async () => {
    setLoadingQueryRun(true);
    setError("");
    try {
      const filterPayload = {};
      if (queryFilter.item_type && queryFilter.item_type !== "All") filterPayload.item_type = queryFilter.item_type;
      if (queryFilter.status && queryFilter.status !== "All") filterPayload.status = queryFilter.status;
      if (queryFilter.priority && queryFilter.priority !== "All") filterPayload.priority = queryFilter.priority;
      if (queryFilter.assigned_to) filterPayload.assigned_to = queryFilter.assigned_to;
      if (queryFilter.sprint_id) filterPayload.sprint_id = queryFilter.sprint_id;
      if (queryFilter.search?.trim()) filterPayload.search = queryFilter.search.trim();

      const payload = {
        name: "Ad-hoc Filter Query",
        filter: filterPayload,
      };
      setSelectedQuery({ id: "custom_adhoc", name: "Custom Filter Query", filter: filterPayload });
      const res = await api.runQuery(payload);
      setQueryResults(res.items || []);
    } catch (err) {
      setError(err.message || "Failed to run custom query");
    } finally {
      setLoadingQueryRun(false);
    }
  };

  // Save Custom Query to Database
  const handleSaveCustomQuery = async () => {
    if (!newQueryName.trim()) {
      setError("Please provide a name for this custom query");
      return;
    }
    setSavingQuery(true);
    try {
      const filterPayload = {};
      if (queryFilter.item_type && queryFilter.item_type !== "All") filterPayload.item_type = queryFilter.item_type;
      if (queryFilter.status && queryFilter.status !== "All") filterPayload.status = queryFilter.status;
      if (queryFilter.priority && queryFilter.priority !== "All") filterPayload.priority = queryFilter.priority;
      if (queryFilter.assigned_to) filterPayload.assigned_to = queryFilter.assigned_to;
      if (queryFilter.sprint_id) filterPayload.sprint_id = queryFilter.sprint_id;
      if (queryFilter.search?.trim()) filterPayload.search = queryFilter.search.trim();

      await api.createQuery({
        name: newQueryName.trim(),
        description: `Custom filter created by ${user.name || user.email}`,
        filter: filterPayload,
      });

      setMessage(`Query "${newQueryName.trim()}" saved successfully!`);
      setShowSaveQueryModal(false);
      setNewQueryName("");
      await loadQueries();
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to save query");
    } finally {
      setSavingQuery(false);
    }
  };

  // Delete Custom Query
  const handleDeleteCustomQuery = async (queryId, queryName) => {
    if (!window.confirm(`Are you sure you want to delete query "${queryName}"?`)) return;
    try {
      await api.deleteQuery(queryId);
      setMessage(`Query "${queryName}" deleted.`);
      if (selectedQuery?.id === queryId) {
        setSelectedQuery(null);
        setQueryResults([]);
      }
      await loadQueries();
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to delete query");
    }
  };

  // Export Results as CSV
  const handleExportQueryResultsCsv = () => {
    if (!queryResults.length) return;
    const headers = ["ID", "Type", "Title", "Status", "Priority", "Assignee", "Sprint", "Story Points", "Created At"];
    const rows = queryResults.map((item) => [
      item.id || "",
      item.item_type || "Task",
      `"${(item.title || "").replace(/"/g, '""')}"`,
      item.status || "",
      item.priority || "",
      item.assigned_to || "Unassigned",
      item.sprint_name || item.sprint_id || "",
      item.story_points ?? "",
      item.created_at || "",
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `devops_query_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // =========================
  // ADD TASK
  // =========================
  const handleAddTask = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!title.trim()) {
      setError("Please enter a title");
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
        item_type: itemType,
        assigned_to: assignedTo || null,
        sprint_id: createSprintId || null,
        story_points: storyPoints !== "" ? Number(storyPoints) : null,
        due_date: dueDate || null,
        tags: parsedTags,
      });

      setMessage(`${itemType} created successfully!`);
      setTitle("");
      setDescription("");
      setStatus("Pending");
      setPriority("Medium");
      setItemType("Task");
      setAssignedTo("");
      setCreateSprintId("");
      setStoryPoints("");
      setDueDate("");
      setTags("");
      setShowAddForm(false);

      await loadTasks();
      if (selectedSprintId) loadSprintBurndown(selectedSprintId);
    } catch (err) {
      console.error("Add task error:", err);
      setError(err.message || "Failed to add work item");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // QUICK MOVE (KANBAN STATUS CHANGE)
  // =========================
  const handleQuickMove = async (taskId, newStatus) => {
    try {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
      await api.updateTask(taskId, { status: newStatus });
      setMessage(`Moved to ${newStatus}`);
      setTimeout(() => setMessage(""), 2500);
      if (selectedSprintId) loadSprintBurndown(selectedSprintId);
    } catch (err) {
      console.error("Move error:", err);
      setError(err.message || "Failed to move work item");
      loadTasks();
    }
  };

  // =========================
  // DELETE TASK
  // =========================
  const handleDeleteTask = async (taskId) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this work item?");
    if (!confirmDelete) return;

    setMessage("");
    setError("");

    try {
      await api.deleteTask(taskId);
      setMessage("Item deleted successfully!");
      await loadTasks();
      if (selectedSprintId) loadSprintBurndown(selectedSprintId);
    } catch (err) {
      console.error("Delete task error:", err);
      setError(err.message || "Failed to delete item");
    }
  };

  // =========================
  // BULK UPDATE TASKS
  // =========================
  const handleBulkUpdate = async () => {
    if (selectedTaskIds.length === 0) return;
    if (!bulkStatus && !bulkPriority && !bulkSprintId && !bulkAssignee) {
      setError("Please choose at least one field to bulk update");
      return;
    }

    setBulkUpdating(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        task_ids: selectedTaskIds,
        status: bulkStatus || null,
        priority: bulkPriority || null,
        sprint_id: bulkSprintId !== "" ? (bulkSprintId === "__backlog__" ? null : bulkSprintId) : null,
        assigned_to: bulkAssignee !== "" ? (bulkAssignee === "__unassigned__" ? null : bulkAssignee) : null,
      };

      const res = await api.bulkUpdateTasks(payload);
      setMessage(`Bulk update applied: ${res.updated_count || selectedTaskIds.length} items updated!`);
      setSelectedTaskIds([]);
      setBulkStatus("");
      setBulkPriority("");
      setBulkSprintId("");
      setBulkAssignee("");
      await loadTasks();
      if (selectedSprintId) loadSprintBurndown(selectedSprintId);
      setTimeout(() => setMessage(""), 3500);
    } catch (err) {
      setError(err.message || "Failed to bulk update items");
    } finally {
      setBulkUpdating(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedTaskIds.length === tasks.length) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(tasks.map((t) => t.id));
    }
  };

  const toggleTaskSelection = (taskId) => {
    if (selectedTaskIds.includes(taskId)) {
      setSelectedTaskIds(selectedTaskIds.filter((id) => id !== taskId));
    } else {
      setSelectedTaskIds([...selectedTaskIds, taskId]);
    }
  };

  // =========================
  // TRIGGER PIPELINE
  // =========================
  const handleTriggerPipeline = async () => {
    try {
      setTriggeringPipeline(true);
      const res = await api.triggerPipeline();
      if (res.run) {
        setPipelineRuns((prev) => [res.run, ...prev]);
        setMessage("DevOps Pipeline triggered successfully! 🚀");
        setTimeout(() => setMessage(""), 3500);
      }
    } catch (err) {
      setError(err.message || "Failed to trigger pipeline");
    } finally {
      setTriggeringPipeline(false);
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

  // Work Item Type styling helper (Azure DevOps style)
  const getItemTypeConfig = (type) => {
    switch (type) {
      case "Bug":
        return { label: "Bug", icon: "🐛", color: "#dc2626", bg: "#fee2e2", border: "#fca5a5" };
      case "Feature":
        return { label: "Feature", icon: "💡", color: "#7c3aed", bg: "#f3e8ff", border: "#d8b4fe" };
      case "Epic":
        return { label: "Epic", icon: "👑", color: "#ea580c", bg: "#ffedd5", border: "#fed7aa" };
      case "Story":
      case "User Story":
        return { label: "Story", icon: "📖", color: "#0d9488", bg: "#ccfbf1", border: "#99f6e4" };
      case "Issue":
        return { label: "Issue", icon: "⚠️", color: "#ca8a04", bg: "#fef9c3", border: "#fde047" };
      case "Task":
      default:
        return { label: "Task", icon: "📋", color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" };
    }
  };

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
    return due.setHours(23, 59, 59, 999) < now.getTime();
  };

  // Filter tasks by active sprint filter
  const displayedTasks = tasks.filter((t) => {
    if (sprintFilter === "All") return true;
    if (sprintFilter === "None") return !t.sprint_id;
    return t.sprint_id === sprintFilter;
  });

  const todoTasks = displayedTasks.filter((t) => t.status === "Pending");
  const progressTasks = displayedTasks.filter((t) => t.status === "In Progress");
  const doneTasks = displayedTasks.filter((t) => t.status === "Completed");

  // Current selected sprint object
  const activeSprintObj = sprints.find((s) => s.id === selectedSprintId) || null;
  const sprintTasks = tasks.filter((t) => t.sprint_id === selectedSprintId);
  const unassignedBacklogTasks = tasks.filter((t) => !t.sprint_id);

  return (
    <div style={styles.page}>
      {/* =========================
          NAVBAR (Azure DevOps Top Bar)
      ========================= */}
      <nav style={styles.navbar}>
        <div style={styles.logoSection}>
          <div style={styles.logoRow}>
            <span style={styles.azureIcon}>🔷</span>
            <h2 style={styles.logo}>DevOps Hub</h2>
          </div>
          <span style={styles.logoSub}>Azure DevOps Inspired Workspace</span>
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
          {user.role === "admin" && (
            <Link to="/admin" style={styles.adminSwitchBtn}>
              🛡️ Admin Portal
            </Link>
          )}

          {/* User Profile Pill - Clickable to open Profile Modal */}
          <div
            onClick={() => setShowProfileModal(true)}
            style={styles.userInfo}
            title="Click to manage profile and password settings"
          >
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
            <span style={styles.welcomeSmall}>DEVSECOPS PROJECT MANAGEMENT</span>
            <h1 style={styles.welcomeTitle}>Welcome, {user.name} 👋</h1>
            <p style={styles.welcomeText}>
              Azure Boards Kanban flow, Sprints & Burndown Analytics, Work Item Tracking, and CI/CD Pipelines.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={handleLoadSampleData}
              disabled={loadingSampleData}
              style={styles.sampleDataBtn}
              title="Populate workspace with realistic Azure DevOps Epics, Stories, Bugs, Sprints & Queries"
            >
              {loadingSampleData ? "🌱 Loading..." : "🌱 Load Sample Data"}
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={styles.headerActionBtn}
            >
              {showAddForm ? "✕ Close Form" : "+ New Work Item"}
            </button>
          </div>
        </div>

        {/* AZURE NAVIGATION TABS */}
        <div style={styles.viewTabsBar}>
          <button
            onClick={() => setActiveView("kanban")}
            style={{
              ...styles.viewTabBtn,
              ...(activeView === "kanban" ? styles.viewTabBtnActive : {}),
            }}
          >
            📋 Boards (Kanban)
            <span style={styles.tabBadge}>{tasks.length}</span>
          </button>

          <button
            onClick={() => setActiveView("list")}
            style={{
              ...styles.viewTabBtn,
              ...(activeView === "list" ? styles.viewTabBtnActive : {}),
            }}
          >
            📑 Backlog (Work Items)
            {selectedTaskIds.length > 0 && (
              <span style={{ ...styles.tabBadge, background: "#fce7f3", color: PINK_DARK }}>
                {selectedTaskIds.length} selected
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveView("sprints")}
            style={{
              ...styles.viewTabBtn,
              ...(activeView === "sprints" ? styles.viewTabBtnActive : {}),
            }}
          >
            🏃 Sprints & Burndown
            <span style={{ ...styles.tabBadge, background: "#e0f2fe", color: "#0369a1" }}>
              {sprints.length} Sprints
            </span>
          </button>

          <button
            onClick={() => setActiveView("pipelines")}
            style={{
              ...styles.viewTabBtn,
              ...(activeView === "pipelines" ? styles.viewTabBtnActive : {}),
            }}
          >
            🚀 Pipelines (CI/CD)
            <span style={{ ...styles.tabBadge, background: "#dcfce7", color: "#166534" }}>
              {pipelineRuns.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveView("queries");
              loadQueries();
              if (!selectedQuery && queriesList.system_queries?.length > 0) {
                handleRunSystemOrSavedQuery(queriesList.system_queries[0]);
              }
            }}
            style={{
              ...styles.viewTabBtn,
              ...(activeView === "queries" ? styles.viewTabBtnActive : {}),
            }}
          >
            🔍 Queries
            <span style={{ ...styles.tabBadge, background: "#fef3c7", color: "#b45309" }}>
              Filters
            </span>
          </button>
        </div>

        {/* FEEDBACK MESSAGES */}
        {message && <div style={styles.success}>✓ {message}</div>}
        {error && <div style={styles.error}>⚠ {error}</div>}

        {/* =========================================================
            ADD WORK ITEM FORM (ACCORDION)
        ========================================================= */}
        {showAddForm && (
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Create Work Item</h2>
                <p style={styles.sectionSubtitle}>
                  Add an Azure DevOps item (Task, Bug, Feature, Epic, User Story, Issue) with sprint and assignee.
                </p>
              </div>
              <div style={styles.sectionBadge}>NEW WORK ITEM</div>
            </div>

            <form onSubmit={handleAddTask}>
              {/* TEMPLATES & AI ASSISTANT ACTION BAR */}
              <div style={styles.createFormTopActions}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "#475569" }}>📋 Templates:</span>
                  <select
                    value={selectedCreateTemplate}
                    onChange={(e) => handleApplyCreateTemplate(e.target.value)}
                    style={styles.templatePicker}
                    title="Load pre-built Azure DevOps item template"
                  >
                    <option value="">Select Work Item Template...</option>
                    {WORK_ITEM_TEMPLATES.map((tmpl) => (
                      <option key={tmpl.id} value={tmpl.id}>
                        {tmpl.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCreateAiBox(!showCreateAiBox)}
                  style={styles.aiAssistHeaderBtn}
                >
                  ✨ AI Work Item Assistant
                </button>
              </div>

              {/* AI ASSISTANT EXPANDABLE CARD */}
              {showCreateAiBox && (
                <div style={styles.createAiCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "16px" }}>✨</span>
                      <strong style={{ fontSize: "13px", color: "#4338ca" }}>
                        Azure DevOps AI Assistant (Gemini)
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateAiBox(false)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: "14px" }}
                    >
                      ✕
                    </button>
                  </div>
                  <p style={{ fontSize: "12px", color: "#475569", margin: "6px 0 10px 0" }}>
                    Describe your feature, user story, or bug in natural language. AI will generate title, structured description, acceptance criteria, story points estimate, priority, and tags.
                  </p>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      placeholder="e.g., OAuth2 login with Google and GitHub with JWT refresh token rotation and rate limiting"
                      value={createAiPrompt}
                      onChange={(e) => setCreateAiPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAiGenerateCreateWorkItem())}
                      style={styles.aiPromptInput}
                    />
                    <button
                      type="button"
                      onClick={handleAiGenerateCreateWorkItem}
                      disabled={generatingCreateAi}
                      style={styles.aiGenerateBtn}
                    >
                      {generatingCreateAi ? "Generating..." : "Generate ✨"}
                    </button>
                  </div>
                </div>
              )}

              <div style={styles.formGridFour}>
                <div>
                  <label style={styles.label}>Item Type *</label>
                  <select
                    value={itemType}
                    onChange={(e) => setItemType(e.target.value)}
                    style={styles.input}
                  >
                    <option value="Task">📋 Task</option>
                    <option value="Bug">🐛 Bug</option>
                    <option value="Feature">💡 Feature</option>
                    <option value="Epic">👑 Epic</option>
                    <option value="User Story">📖 User Story</option>
                    <option value="Issue">⚠️ Issue</option>
                  </select>
                </div>

                <div>
                  <label style={styles.label}>Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    style={styles.input}
                  >
                    <option value="Pending">📌 Pending (To Do)</option>
                    <option value="In Progress">⚡ In Progress</option>
                    <option value="Completed">✅ Completed (Done)</option>
                  </select>
                </div>

                <div>
                  <label style={styles.label}>Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    style={styles.input}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">🔥 Urgent</option>
                  </select>
                </div>

                <div>
                  <label style={styles.label}>Assignee (Team Member)</label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    style={styles.input}
                  >
                    <option value="">👤 Unassigned</option>
                    {teamMembers.map((m) => (
                      <option key={m.id || m.email} value={m.email}>
                        👤 {m.name} ({m.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={styles.formGridThree}>
                <div>
                  <label style={styles.label}>Sprint</label>
                  <select
                    value={createSprintId}
                    onChange={(e) => setCreateSprintId(e.target.value)}
                    style={styles.input}
                  >
                    <option value="">📁 Backlog (No Sprint)</option>
                    {sprints.map((s) => (
                      <option key={s.id} value={s.id}>
                        🏃 {s.name} ({s.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={styles.label}>Story Points (Estimate)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="e.g., 1, 3, 5, 8"
                    value={storyPoints}
                    onChange={(e) => setStoryPoints(e.target.value)}
                    style={styles.input}
                  />
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

              <div style={{ marginTop: "12px" }}>
                <label style={styles.label}>Title *</label>
                <input
                  type="text"
                  placeholder="e.g., Implement Docker multistage build or Fix OAuth token expiration"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>

              <div style={{ marginTop: "12px" }}>
                <label style={styles.label}>Description</label>
                <textarea
                  placeholder="Detailed task description, acceptance criteria, or repro steps..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={styles.textarea}
                  rows="3"
                />
              </div>

              <div style={{ marginTop: "12px" }}>
                <label style={styles.label}>Tags (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g., devops, ci-cd, docker, terraform"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  style={styles.input}
                />
                {availableTags.length > 0 && (
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Suggested:</span>
                    {availableTags.slice(0, 8).map((tg) => (
                      <button
                        type="button"
                        key={tg}
                        onClick={() => {
                          const current = tags ? tags.split(",").map((t) => t.trim()) : [];
                          if (!current.includes(tg)) {
                            setTags(tags ? `${tags}, ${tg}` : tg);
                          }
                        }}
                        style={styles.suggestTagBtn}
                      >
                        +{tg}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    ...styles.addButton,
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? "Creating..." : "+ Save Work Item"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {/* =========================================================
            VIEW 1: BOARDS (KANBAN VIEW)
        ========================================================= */}
        {activeView === "kanban" && (
          <div>
            <div style={styles.boardTopBar}>
              <div style={styles.boardStatsPills}>
                <div style={styles.boardStatPill}>
                  <span style={{ color: "#d97706", fontWeight: "bold" }}>● To Do:</span>{" "}
                  {todoTasks.length}
                </div>
                <div style={styles.boardStatPill}>
                  <span style={{ color: "#2563eb", fontWeight: "bold" }}>● In Progress:</span>{" "}
                  {progressTasks.length}
                </div>
                <div style={styles.boardStatPill}>
                  <span style={{ color: "#16a34a", fontWeight: "bold" }}>● Done:</span>{" "}
                  {doneTasks.length}
                </div>
              </div>

              {/* Sprint Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label style={styles.boardFilterLabel}>Sprint:</label>
                <select
                  value={sprintFilter}
                  onChange={(e) => setSprintFilter(e.target.value)}
                  style={styles.sortSelect}
                >
                  <option value="All">All Sprints</option>
                  <option value="None">Backlog (No Sprint)</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      🏃 {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Type Filter */}
              <div style={styles.boardFilterGroup}>
                <span style={styles.boardFilterLabel}>Type:</span>
                {["All", "Task", "Bug", "Feature", "Epic", "User Story"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setItemTypeFilter(type)}
                    style={{
                      ...styles.typeFilterBtn,
                      background: itemTypeFilter === type ? PINK : "#ffffff",
                      color: itemTypeFilter === type ? "#ffffff" : "#475569",
                      borderColor: itemTypeFilter === type ? PINK : "#cbd5e1",
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* 3-COLUMN KANBAN BOARD */}
            <div style={styles.kanbanGrid}>
              {/* TO DO */}
              <div style={styles.kanbanColumn}>
                <div style={{ ...styles.kanbanColHeader, borderTopColor: "#f59e0b" }}>
                  <div style={styles.colTitleRow}>
                    <span style={styles.colTitle}>📌 To Do</span>
                    <span style={styles.colCountBadge}>{todoTasks.length}</span>
                  </div>
                </div>

                <div style={styles.colBody}>
                  {todoTasks.length === 0 ? (
                    <div style={styles.colEmpty}>No items in To Do</div>
                  ) : (
                    todoTasks.map((task) => (
                      <KanbanCard
                        key={task.id}
                        task={task}
                        getItemTypeConfig={getItemTypeConfig}
                        getPriorityStyle={getPriorityStyle}
                        isOverdue={isOverdue}
                        onQuickMove={handleQuickMove}
                        onCardClick={() => setSelectedWorkItem(task)}
                        onDelete={handleDeleteTask}
                        currentColumn="todo"
                      />
                    ))
                  )}
                </div>
              </div>

              {/* IN PROGRESS */}
              <div style={styles.kanbanColumn}>
                <div style={{ ...styles.kanbanColHeader, borderTopColor: "#3b82f6" }}>
                  <div style={styles.colTitleRow}>
                    <span style={styles.colTitle}>⚡ In Progress</span>
                    <span style={styles.colCountBadge}>{progressTasks.length}</span>
                  </div>
                </div>

                <div style={styles.colBody}>
                  {progressTasks.length === 0 ? (
                    <div style={styles.colEmpty}>No active items</div>
                  ) : (
                    progressTasks.map((task) => (
                      <KanbanCard
                        key={task.id}
                        task={task}
                        getItemTypeConfig={getItemTypeConfig}
                        getPriorityStyle={getPriorityStyle}
                        isOverdue={isOverdue}
                        onQuickMove={handleQuickMove}
                        onCardClick={() => setSelectedWorkItem(task)}
                        onDelete={handleDeleteTask}
                        currentColumn="progress"
                      />
                    ))
                  )}
                </div>
              </div>

              {/* DONE */}
              <div style={styles.kanbanColumn}>
                <div style={{ ...styles.kanbanColHeader, borderTopColor: "#10b981" }}>
                  <div style={styles.colTitleRow}>
                    <span style={styles.colTitle}>✅ Done</span>
                    <span style={styles.colCountBadge}>{doneTasks.length}</span>
                  </div>
                </div>

                <div style={styles.colBody}>
                  {doneTasks.length === 0 ? (
                    <div style={styles.colEmpty}>No completed items</div>
                  ) : (
                    doneTasks.map((task) => (
                      <KanbanCard
                        key={task.id}
                        task={task}
                        getItemTypeConfig={getItemTypeConfig}
                        getPriorityStyle={getPriorityStyle}
                        isOverdue={isOverdue}
                        onQuickMove={handleQuickMove}
                        onCardClick={() => setSelectedWorkItem(task)}
                        onDelete={handleDeleteTask}
                        currentColumn="done"
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            VIEW 2: BACKLOG & BULK ACTIONS
        ========================================================= */}
        {activeView === "list" && (
          <div>
            {/* BULK ACTIONS FLOATING TOOLBAR */}
            {selectedTaskIds.length > 0 && (
              <div style={styles.bulkToolbar}>
                <div style={styles.bulkCount}>
                  <span>☑ {selectedTaskIds.length} item{selectedTaskIds.length > 1 ? "s" : ""} selected</span>
                  <button onClick={() => setSelectedTaskIds([])} style={styles.bulkClearBtn}>
                    Deselect All
                  </button>
                </div>

                <div style={styles.bulkControls}>
                  <select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value)}
                    style={styles.bulkSelect}
                  >
                    <option value="">Set Status...</option>
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>

                  <select
                    value={bulkPriority}
                    onChange={(e) => setBulkPriority(e.target.value)}
                    style={styles.bulkSelect}
                  >
                    <option value="">Set Priority...</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>

                  <select
                    value={bulkSprintId}
                    onChange={(e) => setBulkSprintId(e.target.value)}
                    style={styles.bulkSelect}
                  >
                    <option value="">Assign Sprint...</option>
                    <option value="__backlog__">Move to Backlog (None)</option>
                    {sprints.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={bulkAssignee}
                    onChange={(e) => setBulkAssignee(e.target.value)}
                    style={styles.bulkSelect}
                  >
                    <option value="">Assign Team Member...</option>
                    <option value="__unassigned__">Unassign</option>
                    {teamMembers.map((m) => (
                      <option key={m.id || m.email} value={m.email}>
                        {m.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={handleBulkUpdate}
                    disabled={bulkUpdating}
                    style={styles.bulkApplyBtn}
                  >
                    {bulkUpdating ? "Updating..." : "Apply Bulk Update"}
                  </button>
                </div>
              </div>
            )}

            {/* SEARCH & FILTERS */}
            <section style={styles.filterSection}>
              <div style={styles.searchRow}>
                <div style={styles.searchBox}>
                  <span style={styles.searchIcon}>🔍</span>
                  <input
                    type="text"
                    placeholder="Search work items by title, description or tag..."
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
                  <span style={styles.pillGroupLabel}>Type:</span>
                  {["All", "Task", "Bug", "Feature", "Epic", "User Story"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setItemTypeFilter(t)}
                      style={{
                        ...styles.pillBtn,
                        background: itemTypeFilter === t ? PINK : "#ffffff",
                        color: itemTypeFilter === t ? "#ffffff" : "#475569",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>

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

            {/* BACKLOG TABLE LIST */}
            <section style={styles.section}>
              <div style={styles.taskTitleRow}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <input
                    type="checkbox"
                    checked={tasks.length > 0 && selectedTaskIds.length === tasks.length}
                    onChange={toggleSelectAll}
                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                    title="Select all items for bulk action"
                  />
                  <div>
                    <h2 style={styles.sectionTitle}>Backlog Items</h2>
                    <p style={styles.sectionSubtitle}>
                      Click any row to open the complete Azure DevOps details dialog.
                    </p>
                  </div>
                </div>
                <span style={styles.taskCount}>{tasks.length} Items</span>
              </div>

              {tasks.length === 0 ? (
                <div style={styles.empty}>
                  <div style={styles.emptyIcon}>📋</div>
                  <h3 style={styles.emptyTitle}>No items found</h3>
                  <p style={styles.emptyText}>
                    {search || statusFilter !== "All" || priorityFilter !== "All" || itemTypeFilter !== "All"
                      ? "Try clearing filters to see all your tasks."
                      : "Add your first work item above to get started."}
                  </p>
                </div>
              ) : (
                <div style={styles.taskList}>
                  {tasks.map((task) => {
                    const typeCfg = getItemTypeConfig(task.item_type || "Task");
                    const isSelected = selectedTaskIds.includes(task.id);
                    const sprintObj = sprints.find((s) => s.id === task.sprint_id);

                    return (
                      <div
                        key={task.id}
                        style={{
                          ...styles.taskCard,
                          background: isSelected ? "#fdf2f8" : "#ffffff",
                          borderColor: isSelected ? PINK : "#e2e8f0",
                        }}
                      >
                        <div style={styles.taskCardInner}>
                          {/* Selection Checkbox */}
                          <div style={{ padding: "0 10px 0 2px" }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleTaskSelection(task.id)}
                              style={{ cursor: "pointer", width: "16px", height: "16px" }}
                            />
                          </div>

                          {/* Clickable Content */}
                          <div
                            onClick={() => setSelectedWorkItem(task)}
                            style={{ ...styles.taskMainContent, cursor: "pointer" }}
                          >
                            <div style={styles.taskHeaderRow}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span
                                  style={{
                                    ...styles.itemTypeBadge,
                                    background: typeCfg.bg,
                                    color: typeCfg.color,
                                    borderColor: typeCfg.border,
                                  }}
                                >
                                  {typeCfg.icon} {typeCfg.label}
                                </span>
                                <span style={styles.itemIdTag}>#{task.id.slice(-6).toUpperCase()}</span>
                                <h3 style={styles.taskName}>{task.title}</h3>
                              </div>

                              <div style={styles.badgesWrapper}>
                                {task.story_points !== null && task.story_points !== undefined && (
                                  <span style={styles.pointsBadge}>
                                    ⚡ {task.story_points} pts
                                  </span>
                                )}
                                {sprintObj && (
                                  <span style={styles.sprintBadge}>
                                    🏃 {sprintObj.name}
                                  </span>
                                )}
                                <span
                                  style={{
                                    ...styles.badge,
                                    ...getPriorityStyle(task.priority),
                                  }}
                                >
                                  {task.priority || "Medium"}
                                </span>
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

                            <div style={styles.metaRow}>
                              {task.assigned_to && (
                                <span style={styles.assigneeBadge}>
                                  👤 {task.assigned_to}
                                </span>
                              )}
                              {task.due_date && (
                                <span
                                  style={{
                                    ...styles.dueDateBadge,
                                    ...(isOverdue(task.due_date, task.status)
                                      ? styles.overdueBadge
                                      : {}),
                                  }}
                                >
                                  📅 {task.due_date.slice(0, 10)}
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

                          {/* Quick Delete */}
                          <div style={styles.taskActions}>
                            <button
                              onClick={() => setSelectedWorkItem(task)}
                              style={styles.editButton}
                            >
                              Open Details
                            </button>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              style={styles.deleteButton}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* =========================================================
            VIEW 3: SPRINTS & BURNDOWN ANALYTICS
        ========================================================= */}
        {activeView === "sprints" && (
          <div>
            {/* SPRINT SELECTOR & CONTROLS */}
            <div style={styles.sprintControlsBar}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <span style={{ fontWeight: "700", color: "#1e293b", fontSize: "14px" }}>
                  Active Sprint:
                </span>
                <select
                  value={selectedSprintId}
                  onChange={(e) => setSelectedSprintId(e.target.value)}
                  style={styles.sprintSelectDropdown}
                >
                  {sprints.length === 0 && <option value="">No Sprints created yet</option>}
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      🏃 {s.name} ({s.status}) - {s.start_date.slice(0, 10)} to {s.end_date.slice(0, 10)}
                    </option>
                  ))}
                </select>

                {activeSprintObj && (
                  <button
                    onClick={() => {
                      setEditingSprint(activeSprintObj);
                      setShowSprintModal(true);
                    }}
                    style={styles.editSprintBtn}
                  >
                    ✏️ Edit Sprint
                  </button>
                )}
              </div>

              <button
                onClick={() => {
                  setEditingSprint(null);
                  setShowSprintModal(true);
                }}
                style={styles.headerActionBtn}
              >
                + New Sprint
              </button>
            </div>

            {/* SPRINT BURNDOWN & VELOCITY CARD */}
            {activeSprintObj && sprintBurndown && (
              <div style={styles.burndownCard}>
                <div style={styles.burndownHeader}>
                  <div>
                    <h3 style={styles.burndownTitle}>
                      {activeSprintObj.name} • Velocity & Burndown Analytics
                    </h3>
                    <p style={styles.burndownGoal}>
                      🎯 <strong>Goal:</strong> {activeSprintObj.goal || "Deliver sprint work items on time"}
                    </p>
                  </div>
                  <div style={styles.burndownPercent}>
                    <span style={styles.percentNumber}>
                      {sprintBurndown.completion_percentage}%
                    </span>
                    <span style={styles.percentLabel}>Completed</span>
                  </div>
                </div>

                {/* PROGRESS BAR */}
                <div style={styles.progressBarTrack}>
                  <div
                    style={{
                      ...styles.progressBarFill,
                      width: `${Math.min(100, sprintBurndown.completion_percentage || 0)}%`,
                    }}
                  />
                </div>

                {/* METRICS GRID */}
                <div style={styles.burndownMetricsGrid}>
                  <div style={styles.burnStatBox}>
                    <span style={styles.burnStatVal}>{sprintBurndown.total_story_points}</span>
                    <span style={styles.burnStatLbl}>Total Story Points</span>
                  </div>
                  <div style={styles.burnStatBox}>
                    <span style={{ ...styles.burnStatVal, color: "#16a34a" }}>
                      {sprintBurndown.completed_story_points}
                    </span>
                    <span style={styles.burnStatLbl}>Completed Points</span>
                  </div>
                  <div style={styles.burnStatBox}>
                    <span style={{ ...styles.burnStatVal, color: "#d97706" }}>
                      {sprintBurndown.remaining_story_points}
                    </span>
                    <span style={styles.burnStatLbl}>Remaining Points</span>
                  </div>
                  <div style={styles.burnStatBox}>
                    <span style={styles.burnStatVal}>{sprintBurndown.total_items}</span>
                    <span style={styles.burnStatLbl}>Work Items</span>
                  </div>
                  <div style={styles.burnStatBox}>
                    <span style={{ ...styles.burnStatVal, color: "#2563eb" }}>
                      {sprintBurndown.in_progress_items}
                    </span>
                    <span style={styles.burnStatLbl}>In Progress</span>
                  </div>
                </div>

                {/* ITEM TYPES DISTRIBUTION */}
                {sprintBurndown.item_type_breakdown && (
                  <div style={styles.typeDistributionRow}>
                    <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "600" }}>
                      Breakdown:
                    </span>
                    {Object.entries(sprintBurndown.item_type_breakdown).map(([typ, cnt]) => {
                      const cfg = getItemTypeConfig(typ);
                      return (
                        <span
                          key={typ}
                          style={{
                            ...styles.typeDistPill,
                            background: cfg.bg,
                            color: cfg.color,
                            borderColor: cfg.border,
                          }}
                        >
                          {cfg.icon} {typ}: {cnt}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SPRINT KANBAN COLUMNS */}
            <div style={{ marginTop: "24px" }}>
              <h3 style={{ fontSize: "16px", color: "#1e293b", margin: "0 0 14px" }}>
                Sprint Work Items ({sprintTasks.length})
              </h3>
              <div style={styles.kanbanGrid}>
                {/* SPRINT TO DO */}
                <div style={styles.kanbanColumn}>
                  <div style={{ ...styles.kanbanColHeader, borderTopColor: "#f59e0b" }}>
                    <div style={styles.colTitleRow}>
                      <span style={styles.colTitle}>📌 To Do</span>
                      <span style={styles.colCountBadge}>
                        {sprintTasks.filter((t) => t.status === "Pending").length}
                      </span>
                    </div>
                  </div>
                  <div style={styles.colBody}>
                    {sprintTasks.filter((t) => t.status === "Pending").map((task) => (
                      <KanbanCard
                        key={task.id}
                        task={task}
                        getItemTypeConfig={getItemTypeConfig}
                        getPriorityStyle={getPriorityStyle}
                        isOverdue={isOverdue}
                        onQuickMove={handleQuickMove}
                        onCardClick={() => setSelectedWorkItem(task)}
                        onDelete={handleDeleteTask}
                        currentColumn="todo"
                      />
                    ))}
                  </div>
                </div>

                {/* SPRINT IN PROGRESS */}
                <div style={styles.kanbanColumn}>
                  <div style={{ ...styles.kanbanColHeader, borderTopColor: "#3b82f6" }}>
                    <div style={styles.colTitleRow}>
                      <span style={styles.colTitle}>⚡ In Progress</span>
                      <span style={styles.colCountBadge}>
                        {sprintTasks.filter((t) => t.status === "In Progress").length}
                      </span>
                    </div>
                  </div>
                  <div style={styles.colBody}>
                    {sprintTasks.filter((t) => t.status === "In Progress").map((task) => (
                      <KanbanCard
                        key={task.id}
                        task={task}
                        getItemTypeConfig={getItemTypeConfig}
                        getPriorityStyle={getPriorityStyle}
                        isOverdue={isOverdue}
                        onQuickMove={handleQuickMove}
                        onCardClick={() => setSelectedWorkItem(task)}
                        onDelete={handleDeleteTask}
                        currentColumn="progress"
                      />
                    ))}
                  </div>
                </div>

                {/* SPRINT DONE */}
                <div style={styles.kanbanColumn}>
                  <div style={{ ...styles.kanbanColHeader, borderTopColor: "#10b981" }}>
                    <div style={styles.colTitleRow}>
                      <span style={styles.colTitle}>✅ Done</span>
                      <span style={styles.colCountBadge}>
                        {sprintTasks.filter((t) => t.status === "Completed").length}
                      </span>
                    </div>
                  </div>
                  <div style={styles.colBody}>
                    {sprintTasks.filter((t) => t.status === "Completed").map((task) => (
                      <KanbanCard
                        key={task.id}
                        task={task}
                        getItemTypeConfig={getItemTypeConfig}
                        getPriorityStyle={getPriorityStyle}
                        isOverdue={isOverdue}
                        onQuickMove={handleQuickMove}
                        onCardClick={() => setSelectedWorkItem(task)}
                        onDelete={handleDeleteTask}
                        currentColumn="done"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* UNASSIGNED BACKLOG DRAWER */}
            {unassignedBacklogTasks.length > 0 && selectedSprintId && (
              <div style={styles.unassignedDrawer}>
                <h4 style={styles.unassignedTitle}>
                  📁 Unassigned Backlog Items ({unassignedBacklogTasks.length})
                </h4>
                <p style={styles.unassignedSub}>
                  Quickly pull items from your backlog into {activeSprintObj ? activeSprintObj.name : "the sprint"}.
                </p>
                <div style={styles.unassignedList}>
                  {unassignedBacklogTasks.slice(0, 10).map((bTask) => (
                    <div key={bTask.id} style={styles.unassignedItem}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span>📋</span>
                        <span style={styles.unassignedItemTitle}>{bTask.title}</span>
                      </div>
                      <button
                        onClick={async () => {
                          await api.assignTaskToSprint(bTask.id, selectedSprintId);
                          setMessage(`Moved "${bTask.title}" to ${activeSprintObj?.name}`);
                          await loadTasks();
                          loadSprintBurndown(selectedSprintId);
                        }}
                        style={styles.pullIntoSprintBtn}
                      >
                        + Add to Sprint
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            VIEW 4: PIPELINES (CI/CD)
        ========================================================= */}
        {activeView === "pipelines" && (
          <div>
            <div style={styles.pipelineHeader}>
              <div>
                <h2 style={styles.sectionTitle}>DevSecOps CI/CD Pipelines</h2>
                <p style={styles.sectionSubtitle}>
                  Automated Security Scans (Bandit, Trivy), Testing, Docker Containerization & EC2 Deployment.
                </p>
              </div>
              <button
                onClick={handleTriggerPipeline}
                disabled={triggeringPipeline}
                style={{
                  ...styles.triggerPipelineBtn,
                  opacity: triggeringPipeline ? 0.7 : 1,
                }}
              >
                {triggeringPipeline ? "⏳ Triggering..." : "⚡ Run Pipeline"}
              </button>
            </div>

            <div style={styles.pipelineRunsList}>
              {pipelineRuns.map((run) => (
                <div key={run.run_number} style={styles.pipelineRunCard}>
                  <div style={styles.runCardHeader}>
                    <div style={styles.runInfoCol}>
                      <div style={styles.runTitleRow}>
                        <span style={styles.runStatusDot}>●</span>
                        <h3 style={styles.runName}>#{run.run_number} - {run.name}</h3>
                        <span style={styles.runStatusBadge}>{run.status}</span>
                      </div>
                      <p style={styles.runCommitMsg}>"{run.commit_message}"</p>
                      <div style={styles.runDetailsMeta}>
                        <span>🌿 Branch: <code>{run.branch}</code></span>
                        <span>🏷 Commit: <code>{run.commit}</code></span>
                        <span>👤 Triggered by: {run.triggered_by}</span>
                        <span>⏱ Duration: {run.duration}</span>
                      </div>
                    </div>
                  </div>

                  <div style={styles.stagesContainer}>
                    <div style={styles.stagesTrack}>
                      {run.stages?.map((stage, idx) => (
                        <div key={idx} style={styles.stageItem}>
                          <div style={styles.stageIconWrap}>
                            <span style={styles.stageCheck}>✓</span>
                          </div>
                          <span style={styles.stageName}>{stage.name}</span>
                          <span style={styles.stageDuration}>{stage.duration}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================
            VIEW 5: QUERIES (AZURE DEVOPS QUERY ENGINE)
        ========================================================= */}
        {activeView === "queries" && (
          <div>
            <div style={styles.queriesHero}>
              <div>
                <h2 style={styles.sectionTitle}>Work Item Queries & Filters</h2>
                <p style={styles.sectionSubtitle}>
                  Search, filter, and track work items with system presets and custom user queries.
                </p>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  onClick={() => setShowSaveQueryModal(true)}
                  style={styles.saveQueryModalBtn}
                >
                  💾 Save Current Filter
                </button>
                {queryResults.length > 0 && (
                  <button
                    onClick={handleExportQueryResultsCsv}
                    style={styles.exportCsvBtn}
                  >
                    📥 Export CSV ({queryResults.length})
                  </button>
                )}
              </div>
            </div>

            <div style={styles.queriesLayout}>
              {/* QUERIES LEFT SIDEBAR */}
              <div style={styles.queriesSidebar}>
                <div style={styles.queryGroupHeader}>System Queries</div>
                <div style={styles.queryList}>
                  {queriesList.system_queries?.map((sq) => {
                    const isSelected = selectedQuery?.id === sq.id;
                    return (
                      <button
                        key={sq.id}
                        onClick={() => handleRunSystemOrSavedQuery(sq)}
                        style={{
                          ...styles.queryItemBtn,
                          ...(isSelected ? styles.queryItemBtnActive : {}),
                        }}
                      >
                        <span style={styles.queryItemIcon}>
                          {sq.id === "assigned_to_me"
                            ? "👤"
                            : sq.id === "active_bugs"
                            ? "🐛"
                            : sq.id === "urgent_unresolved"
                            ? "🔥"
                            : "📁"}
                        </span>
                        <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                          <div style={styles.queryItemName}>{sq.name}</div>
                          <div style={styles.queryItemDesc}>{sq.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ ...styles.queryGroupHeader, marginTop: "18px" }}>
                  <span>Custom Queries</span>
                  <span style={styles.queryCountBadge}>
                    {queriesList.custom_queries?.length || 0}
                  </span>
                </div>

                <div style={styles.queryList}>
                  {(!queriesList.custom_queries || queriesList.custom_queries.length === 0) ? (
                    <div style={styles.noCustomQueries}>
                      No custom queries saved yet. Build a filter and click "Save Current Filter".
                    </div>
                  ) : (
                    queriesList.custom_queries.map((cq) => {
                      const isSelected = selectedQuery?.id === cq.id;
                      return (
                        <div
                          key={cq.id}
                          style={{
                            ...styles.customQueryRow,
                            ...(isSelected ? styles.customQueryRowActive : {}),
                          }}
                        >
                          <button
                            onClick={() => handleRunSystemOrSavedQuery(cq)}
                            style={styles.customQueryBtn}
                          >
                            <span style={styles.queryItemIcon}>🔍</span>
                            <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                              <div style={styles.queryItemName}>{cq.name}</div>
                              <div style={styles.queryItemMeta}>
                                By {cq.created_by?.split("@")[0] || "User"}
                              </div>
                            </div>
                          </button>
                          <button
                            onClick={() => handleDeleteCustomQuery(cq.id, cq.name)}
                            style={styles.deleteQueryBtn}
                            title="Delete this query"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* QUERIES MAIN CONTENT: FILTER BUILDER & RESULTS */}
              <div style={styles.queriesMainArea}>
                {/* FILTER BUILDER PANEL */}
                <div style={styles.filterBuilderCard}>
                  <div style={styles.filterBuilderHeader}>
                    <strong style={{ fontSize: "13px", color: "#1e293b" }}>
                      Query Filter Criteria
                    </strong>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>
                      Active: {selectedQuery ? selectedQuery.name : "Custom Query"}
                    </span>
                  </div>

                  <div style={styles.filterControlsGrid}>
                    <div>
                      <label style={styles.filterFieldLabel}>Item Type</label>
                      <select
                        value={queryFilter.item_type}
                        onChange={(e) =>
                          setQueryFilter({ ...queryFilter, item_type: e.target.value })
                        }
                        style={styles.filterSelect}
                      >
                        <option value="All">All Types</option>
                        <option value="Task">Task</option>
                        <option value="Bug">Bug</option>
                        <option value="Feature">Feature</option>
                        <option value="Epic">Epic</option>
                        <option value="User Story">User Story</option>
                        <option value="Issue">Issue</option>
                      </select>
                    </div>

                    <div>
                      <label style={styles.filterFieldLabel}>Status</label>
                      <select
                        value={queryFilter.status}
                        onChange={(e) =>
                          setQueryFilter({ ...queryFilter, status: e.target.value })
                        }
                        style={styles.filterSelect}
                      >
                        <option value="All">All Statuses</option>
                        <option value="Pending">Pending (To Do)</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>

                    <div>
                      <label style={styles.filterFieldLabel}>Priority</label>
                      <select
                        value={queryFilter.priority}
                        onChange={(e) =>
                          setQueryFilter({ ...queryFilter, priority: e.target.value })
                        }
                        style={styles.filterSelect}
                      >
                        <option value="All">All Priorities</option>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                      </select>
                    </div>

                    <div>
                      <label style={styles.filterFieldLabel}>Assignee</label>
                      <select
                        value={queryFilter.assigned_to}
                        onChange={(e) =>
                          setQueryFilter({ ...queryFilter, assigned_to: e.target.value })
                        }
                        style={styles.filterSelect}
                      >
                        <option value="">Any Assignee</option>
                        <option value="me">Assigned to Me ({user.email})</option>
                        <option value="unassigned">Unassigned</option>
                        {teamMembers.map((m) => (
                          <option key={m.id || m.email} value={m.email}>
                            {m.name} ({m.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={styles.filterFieldLabel}>Sprint</label>
                      <select
                        value={queryFilter.sprint_id}
                        onChange={(e) =>
                          setQueryFilter({ ...queryFilter, sprint_id: e.target.value })
                        }
                        style={styles.filterSelect}
                      >
                        <option value="">Any Sprint</option>
                        <option value="none">Backlog (No Sprint)</option>
                        {sprints.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.status})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={styles.filterFieldLabel}>Keyword / Search</label>
                      <input
                        type="text"
                        placeholder="Search title, desc..."
                        value={queryFilter.search}
                        onChange={(e) =>
                          setQueryFilter({ ...queryFilter, search: e.target.value })
                        }
                        onKeyDown={(e) => e.key === "Enter" && handleRunAdhocQuery()}
                        style={styles.filterInput}
                      />
                    </div>
                  </div>

                  <div style={styles.filterActionsRow}>
                    <button
                      onClick={handleRunAdhocQuery}
                      disabled={loadingQueryRun}
                      style={styles.runQueryBtn}
                    >
                      {loadingQueryRun ? "Running..." : "▶ Run Query"}
                    </button>
                    <button
                      onClick={() =>
                        setQueryFilter({
                          item_type: "All",
                          status: "All",
                          priority: "All",
                          assigned_to: "",
                          sprint_id: "",
                          search: "",
                        })
                      }
                      style={styles.resetQueryBtn}
                    >
                      ↺ Reset Filter
                    </button>
                  </div>
                </div>

                {/* QUERY RESULTS TABLE */}
                <div style={styles.queryResultsContainer}>
                  <div style={styles.resultsHeaderRow}>
                    <h3 style={styles.resultsTitle}>
                      Query Results{" "}
                      <span style={styles.resultsBadge}>{queryResults.length} items</span>
                    </h3>
                    {selectedQuery && (
                      <span style={styles.selectedQueryIndicator}>
                        Loaded: <strong>{selectedQuery.name}</strong>
                      </span>
                    )}
                  </div>

                  {loadingQueryRun ? (
                    <div style={styles.loadingQueryBox}>⚡ Executing query on work items...</div>
                  ) : queryResults.length === 0 ? (
                    <div style={styles.noResultsBox}>
                      <span style={{ fontSize: "32px" }}>🔍</span>
                      <p style={{ margin: "8px 0 4px 0", fontWeight: "600", color: "#334155" }}>
                        No work items match this query
                      </p>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        Select a system query from the sidebar or adjust your filter parameters and click Run Query.
                      </span>
                    </div>
                  ) : (
                    <div style={styles.tableResponsive}>
                      <table style={styles.queryTable}>
                        <thead>
                          <tr>
                            <th style={styles.qth}>ID</th>
                            <th style={styles.qth}>Type</th>
                            <th style={styles.qth}>Title</th>
                            <th style={styles.qth}>Status</th>
                            <th style={styles.qth}>Priority</th>
                            <th style={styles.qth}>Assignee</th>
                            <th style={styles.qth}>Sprint</th>
                            <th style={styles.qth}>Points</th>
                            <th style={styles.qth}>Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {queryResults.map((item) => {
                            const typeCfg = getItemTypeConfig(item.item_type || "Task");
                            return (
                              <tr
                                key={item.id}
                                onClick={() => setSelectedWorkItem(item)}
                                style={styles.queryTableRow}
                                title="Click to view work item details, hierarchy, comments & files"
                              >
                                <td style={styles.qtdId}>#{item.id.slice(-6).toUpperCase()}</td>
                                <td style={styles.qtd}>
                                  <span
                                    style={{
                                      ...styles.itemTypeBadge,
                                      background: typeCfg.bg,
                                      color: typeCfg.color,
                                      borderColor: typeCfg.border,
                                      fontSize: "11px",
                                      padding: "2px 8px",
                                    }}
                                  >
                                    {typeCfg.icon} {typeCfg.label}
                                  </span>
                                </td>
                                <td style={styles.qtdTitle}>
                                  <strong>{item.title}</strong>
                                </td>
                                <td style={styles.qtd}>
                                  <span
                                    style={{
                                      ...styles.statusBadge,
                                      ...getStatusStyle(item.status),
                                      fontSize: "11px",
                                    }}
                                  >
                                    {item.status}
                                  </span>
                                </td>
                                <td style={styles.qtd}>
                                  <span
                                    style={{
                                      ...styles.badge,
                                      ...getPriorityStyle(item.priority),
                                      fontSize: "11px",
                                    }}
                                  >
                                    {item.priority || "Medium"}
                                  </span>
                                </td>
                                <td style={styles.qtd}>
                                  {item.assigned_to ? (
                                    <span style={{ fontSize: "12px", color: "#334155" }}>
                                      👤 {item.assigned_to.split("@")[0]}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>Unassigned</span>
                                  )}
                                </td>
                                <td style={styles.qtd}>
                                  {item.sprint_id ? (
                                    <span style={styles.sprintTag}>
                                      🏃 {sprints.find((s) => s.id === item.sprint_id)?.name || "Sprint"}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>Backlog</span>
                                  )}
                                </td>
                                <td style={styles.qtd}>
                                  {item.story_points !== undefined && item.story_points !== null ? (
                                    <span style={styles.ptsPill}>{item.story_points} pts</span>
                                  ) : (
                                    "-"
                                  )}
                                </td>
                                <td style={styles.qtdMeta}>
                                  {item.created_at ? item.created_at.slice(0, 10) : "-"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* =========================
          MODALS
      ========================= */}
      {selectedWorkItem && (
        <WorkItemModal
          task={selectedWorkItem}
          teamMembers={teamMembers}
          sprints={sprints}
          allTasks={tasks}
          onClose={() => setSelectedWorkItem(null)}
          onTaskUpdated={async () => {
            await loadTasks();
            if (selectedSprintId) loadSprintBurndown(selectedSprintId);
          }}
        />
      )}

      {showProfileModal && (
        <UserProfileModal
          user={user}
          onClose={() => setShowProfileModal(false)}
          onUserUpdated={(updatedUser) => {
            setUser(updatedUser);
            setShowProfileModal(false);
          }}
        />
      )}

      {showSprintModal && (
        <SprintManagerModal
          sprint={editingSprint}
          onClose={() => {
            setShowSprintModal(false);
            setEditingSprint(null);
          }}
          onSprintSaved={async () => {
            await loadSprints();
            if (selectedSprintId) loadSprintBurndown(selectedSprintId);
          }}
        />
      )}

      {/* SAVE CUSTOM QUERY MODAL DIALOG */}
      {showSaveQueryModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalDialog}>
            <div style={styles.dialogHeader}>
              <h3 style={{ margin: 0, fontSize: "16px", color: "#1e293b" }}>💾 Save Custom Query</h3>
              <button
                onClick={() => setShowSaveQueryModal(false)}
                style={{ background: "none", border: "none", fontSize: "16px", cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "8px 0 14px 0" }}>
              Save your current filter criteria so you and your team can re-run it anytime from the Queries sidebar.
            </p>
            <div style={{ marginBottom: "14px" }}>
              <label style={styles.filterFieldLabel}>Query Name *</label>
              <input
                type="text"
                placeholder="e.g., Critical Sprint Bugs or Unassigned Backend Tasks"
                value={newQueryName}
                onChange={(e) => setNewQueryName(e.target.value)}
                style={styles.modalInput}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                onClick={() => setShowSaveQueryModal(false)}
                style={styles.cancelModalBtn}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomQuery}
                disabled={savingQuery || !newQueryName.trim()}
                style={styles.confirmSaveBtn}
              >
                {savingQuery ? "Saving..." : "Save Query"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================
// KANBAN CARD COMPONENT (Azure Boards Style)
// =====================================================
function KanbanCard({
  task,
  getItemTypeConfig,
  getPriorityStyle,
  isOverdue,
  onQuickMove,
  onCardClick,
  onDelete,
  currentColumn,
}) {
  const typeCfg = getItemTypeConfig(task.item_type || "Task");

  return (
    <div style={styles.kanbanCard}>
      {/* Top row: Type + ID + Priority */}
      <div style={styles.kCardTopRow} onClick={onCardClick}>
        <span
          style={{
            ...styles.itemTypeBadge,
            background: typeCfg.bg,
            color: typeCfg.color,
            borderColor: typeCfg.border,
          }}
        >
          {typeCfg.icon} {typeCfg.label}
        </span>

        <span style={styles.itemIdTag}>#{task.id.slice(-6).toUpperCase()}</span>

        <span
          style={{
            ...styles.badge,
            ...getPriorityStyle(task.priority),
          }}
        >
          {task.priority || "Medium"}
        </span>
      </div>

      {/* Title */}
      <h4 style={styles.kCardTitle} onClick={onCardClick}>
        {task.title}
      </h4>

      {/* Description Snippet */}
      {task.description && (
        <p style={styles.kCardDesc} onClick={onCardClick}>
          {task.description}
        </p>
      )}

      {/* Due date, Assignee & Tags */}
      <div style={styles.kCardMeta} onClick={onCardClick}>
        {task.assigned_to && (
          <span style={styles.assigneeAvatarPill}>
            👤 {task.assigned_to.split("@")[0]}
          </span>
        )}

        {task.story_points !== null && task.story_points !== undefined && (
          <span style={styles.pointsBadgeMini}>
            ⚡ {task.story_points}
          </span>
        )}

        {task.due_date && (
          <span
            style={{
              ...styles.dueDateBadge,
              fontSize: "10px",
              ...(isOverdue(task.due_date, task.status) ? styles.overdueBadge : {}),
            }}
          >
            📅 {task.due_date.slice(0, 10)}
          </span>
        )}

        {Array.isArray(task.tags) && task.tags.slice(0, 2).map((t, idx) => (
          <span key={idx} style={styles.tagChip}>
            #{t}
          </span>
        ))}
      </div>

      {/* Action / Movement Buttons */}
      <div style={styles.kCardActions}>
        <div style={styles.kMoveBtns}>
          {currentColumn === "todo" && (
            <button
              onClick={() => onQuickMove(task.id, "In Progress")}
              style={styles.kMoveBtnActive}
              title="Move to In Progress"
            >
              ➔ Start
            </button>
          )}

          {currentColumn === "progress" && (
            <>
              <button
                onClick={() => onQuickMove(task.id, "Pending")}
                style={styles.kMoveBtnSecondary}
                title="Move back to To Do"
              >
                ⬅ To Do
              </button>
              <button
                onClick={() => onQuickMove(task.id, "Completed")}
                style={styles.kMoveBtnSuccess}
                title="Mark Completed"
              >
                ✔ Done
              </button>
            </>
          )}

          {currentColumn === "done" && (
            <button
              onClick={() => onQuickMove(task.id, "In Progress")}
              style={styles.kMoveBtnSecondary}
              title="Reopen task"
            >
              ↺ Reopen
            </button>
          )}
        </div>

        <div style={styles.kMiniActions}>
          <button
            onClick={onCardClick}
            style={styles.kMiniBtn}
            title="Open Details & Discussions"
          >
            🔍
          </button>
          <button
            onClick={() => onDelete(task.id)}
            style={{ ...styles.kMiniBtn, color: "#dc2626" }}
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    paddingBottom: "60px",
  },
  loading: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
  },
  loadingBox: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#64748b",
  },
  navbar: {
    background: "rgba(255,255,255,0.98)",
    padding: "12px 35px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "sticky",
    top: 0,
    zIndex: 100,
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
    borderBottom: "1px solid #e2e8f0",
  },
  logoSection: {
    display: "flex",
    flexDirection: "column",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  azureIcon: {
    fontSize: "18px",
  },
  logo: {
    margin: 0,
    fontSize: "20px",
    fontWeight: "800",
    color: "#0f172a",
  },
  logoSub: {
    fontSize: "11px",
    color: "#64748b",
  },
  healthBadge: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#f1f5f9",
    padding: "6px 12px",
    borderRadius: "20px",
    border: "1px solid #e2e8f0",
  },
  healthDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
  },
  healthText: {
    fontSize: "11px",
    fontWeight: "600",
    color: "#475569",
  },
  navRight: {
    display: "flex",
    alignItems: "center",
    gap: "18px",
  },
  adminSwitchBtn: {
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "700",
    textDecoration: "none",
    border: "1px solid #bfdbfe",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: "8px",
    transition: "background 0.2s",
  },
  userAvatar: {
    width: "32px",
    height: "32px",
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
  },
  container: {
    width: "1240px",
    maxWidth: "96%",
    margin: "20px auto",
  },
  welcomeCard: {
    background: "linear-gradient(135deg, #ffffff 0%, #fdf2f8 100%)",
    borderRadius: "14px",
    padding: "20px 28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.03)",
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
    fontSize: "22px",
    fontWeight: "800",
  },
  welcomeText: {
    margin: 0,
    color: "#64748b",
    fontSize: "13px",
  },
  headerActionBtn: {
    background: PINK,
    color: "white",
    border: "none",
    padding: "10px 20px",
    borderRadius: "8px",
    fontWeight: "700",
    fontSize: "13px",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(201,79,139,0.3)",
  },
  viewTabsBar: {
    display: "flex",
    gap: "10px",
    marginBottom: "20px",
    borderBottom: "2px solid #e2e8f0",
    paddingBottom: "8px",
  },
  viewTabBtn: {
    background: "transparent",
    border: "none",
    padding: "8px 18px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "700",
    color: "#64748b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  viewTabBtnActive: {
    background: "#ffffff",
    color: PINK_DARK,
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    borderBottom: `3px solid ${PINK}`,
  },
  tabBadge: {
    background: "#f1f5f9",
    color: "#334155",
    fontSize: "11px",
    fontWeight: "800",
    padding: "2px 7px",
    borderRadius: "10px",
  },
  success: {
    background: "#dcfce7",
    color: "#15803d",
    padding: "12px 18px",
    borderRadius: "8px",
    marginBottom: "16px",
    fontSize: "13px",
    fontWeight: "600",
  },
  error: {
    background: "#fee2e2",
    color: "#b91c1c",
    padding: "12px 18px",
    borderRadius: "8px",
    marginBottom: "16px",
    fontSize: "13px",
    fontWeight: "600",
  },
  section: {
    background: "#ffffff",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "24px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "18px",
    fontWeight: "700",
    color: "#0f172a",
  },
  sectionSubtitle: {
    margin: "4px 0 0",
    fontSize: "13px",
    color: "#64748b",
  },
  sectionBadge: {
    background: "#fdf2f8",
    color: PINK,
    padding: "4px 10px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: "800",
  },
  formGridFour: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "14px",
  },
  formGridThree: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "14px",
    marginTop: "12px",
  },
  label: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#475569",
    marginBottom: "4px",
    display: "block",
  },
  input: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  addButton: {
    background: PINK,
    color: "#ffffff",
    border: "none",
    padding: "10px 20px",
    borderRadius: "6px",
    fontWeight: "700",
    fontSize: "13px",
    cursor: "pointer",
  },
  cancelBtn: {
    background: "#f1f5f9",
    border: "1px solid #cbd5e1",
    padding: "10px 18px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  suggestTagBtn: {
    background: "#f1f5f9",
    border: "1px solid #cbd5e1",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "11px",
    color: "#334155",
    cursor: "pointer",
  },
  boardTopBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
    marginBottom: "16px",
    background: "#ffffff",
    padding: "12px 18px",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
  },
  boardStatsPills: {
    display: "flex",
    gap: "14px",
  },
  boardStatPill: {
    fontSize: "13px",
    color: "#334155",
  },
  boardFilterGroup: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  boardFilterLabel: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#64748b",
    marginRight: "4px",
  },
  typeFilterBtn: {
    padding: "4px 10px",
    borderRadius: "16px",
    border: "1px solid #cbd5e1",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  kanbanGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "18px",
    alignItems: "start",
  },
  kanbanColumn: {
    background: "#f1f5f9",
    borderRadius: "10px",
    padding: "12px",
    minHeight: "500px",
    display: "flex",
    flexDirection: "column",
  },
  kanbanColHeader: {
    padding: "8px 4px 12px",
    borderTop: "4px solid",
    marginBottom: "10px",
  },
  colTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  colTitle: {
    fontSize: "14px",
    fontWeight: "700",
    color: "#1e293b",
  },
  colCountBadge: {
    background: "#e2e8f0",
    color: "#334155",
    fontSize: "12px",
    fontWeight: "700",
    padding: "2px 8px",
    borderRadius: "10px",
  },
  colBody: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    flex: 1,
  },
  colEmpty: {
    padding: "30px 10px",
    textAlign: "center",
    color: "#94a3b8",
    fontSize: "13px",
    fontStyle: "italic",
  },
  kanbanCard: {
    background: "#ffffff",
    borderRadius: "8px",
    padding: "12px 14px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    cursor: "pointer",
  },
  kCardTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemIdTag: {
    fontSize: "11px",
    fontWeight: "700",
    color: "#94a3b8",
    fontFamily: "monospace",
  },
  kCardTitle: {
    margin: "4px 0",
    fontSize: "14px",
    fontWeight: "600",
    color: "#0f172a",
    lineHeight: "1.4",
  },
  kCardDesc: {
    margin: 0,
    fontSize: "12px",
    color: "#64748b",
    lineHeight: "1.4",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },
  kCardMeta: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "4px",
  },
  assigneeAvatarPill: {
    fontSize: "10px",
    fontWeight: "600",
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "2px 6px",
    borderRadius: "10px",
  },
  pointsBadgeMini: {
    fontSize: "10px",
    fontWeight: "700",
    background: "#fef3c7",
    color: "#b45309",
    padding: "2px 6px",
    borderRadius: "10px",
  },
  kCardActions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "8px",
    paddingTop: "8px",
    borderTop: "1px solid #f1f5f9",
  },
  kMoveBtns: {
    display: "flex",
    gap: "6px",
  },
  kMoveBtnActive: {
    background: "#2563eb",
    color: "#ffffff",
    border: "none",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
  },
  kMoveBtnSecondary: {
    background: "#f1f5f9",
    color: "#334155",
    border: "1px solid #cbd5e1",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
  },
  kMoveBtnSuccess: {
    background: "#16a34a",
    color: "#ffffff",
    border: "none",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
  },
  kMiniActions: {
    display: "flex",
    gap: "6px",
  },
  kMiniBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "13px",
  },
  bulkToolbar: {
    background: "#0f172a",
    color: "#ffffff",
    padding: "12px 20px",
    borderRadius: "10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
    flexWrap: "wrap",
    gap: "12px",
  },
  bulkCount: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontWeight: "700",
    fontSize: "14px",
  },
  bulkClearBtn: {
    background: "none",
    border: "1px solid #475569",
    color: "#cbd5e1",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "12px",
    cursor: "pointer",
  },
  bulkControls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  bulkSelect: {
    padding: "6px 10px",
    borderRadius: "6px",
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#ffffff",
    fontSize: "12px",
  },
  bulkApplyBtn: {
    background: PINK,
    color: "#ffffff",
    border: "none",
    padding: "7px 14px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },
  filterSection: {
    background: "#ffffff",
    padding: "16px 20px",
    borderRadius: "10px",
    marginBottom: "16px",
    border: "1px solid #e2e8f0",
  },
  searchRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    marginBottom: "14px",
    flexWrap: "wrap",
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#f8fafc",
    padding: "6px 12px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    flex: 1,
    minWidth: "240px",
  },
  searchIcon: {
    fontSize: "14px",
  },
  searchInput: {
    border: "none",
    background: "transparent",
    outline: "none",
    fontSize: "13px",
    width: "100%",
  },
  clearSearchBtn: {
    background: "none",
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
    fontWeight: "700",
    color: "#64748b",
  },
  sortSelect: {
    padding: "6px 10px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    background: "#ffffff",
  },
  pillsRow: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap",
  },
  pillGroup: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  pillGroupLabel: {
    fontSize: "12px",
    fontWeight: "700",
    color: "#64748b",
  },
  pillBtn: {
    padding: "4px 10px",
    borderRadius: "14px",
    border: "1px solid #cbd5e1",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  taskTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  taskCount: {
    background: "#f1f5f9",
    color: "#334155",
    padding: "4px 10px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "700",
  },
  taskList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  taskCard: {
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    padding: "14px",
    transition: "border-color 0.2s, background 0.2s",
  },
  taskCardInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  taskMainContent: {
    flex: 1,
  },
  taskHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "6px",
    flexWrap: "wrap",
    gap: "8px",
  },
  itemTypeBadge: {
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: "700",
    border: "1px solid",
  },
  taskName: {
    margin: 0,
    fontSize: "15px",
    fontWeight: "700",
    color: "#0f172a",
  },
  badgesWrapper: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  pointsBadge: {
    background: "#fef3c7",
    color: "#b45309",
    fontSize: "11px",
    fontWeight: "700",
    padding: "2px 8px",
    borderRadius: "12px",
    border: "1px solid #fde68a",
  },
  sprintBadge: {
    background: "#e0f2fe",
    color: "#0369a1",
    fontSize: "11px",
    fontWeight: "700",
    padding: "2px 8px",
    borderRadius: "12px",
    border: "1px solid #bae6fd",
  },
  badge: {
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: "700",
  },
  descriptionText: {
    margin: "0 0 8px",
    fontSize: "13px",
    color: "#475569",
    lineHeight: "1.4",
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  assigneeBadge: {
    fontSize: "11px",
    fontWeight: "600",
    background: "#f1f5f9",
    color: "#334155",
    padding: "2px 8px",
    borderRadius: "12px",
  },
  dueDateBadge: {
    fontSize: "11px",
    color: "#64748b",
    background: "#f1f5f9",
    padding: "2px 8px",
    borderRadius: "12px",
  },
  overdueBadge: {
    background: "#fee2e2",
    color: "#dc2626",
    fontWeight: "bold",
  },
  tagsContainer: {
    display: "flex",
    gap: "6px",
  },
  tagChip: {
    fontSize: "11px",
    background: "#f1f5f9",
    color: "#475569",
    padding: "2px 6px",
    borderRadius: "6px",
  },
  taskActions: {
    display: "flex",
    gap: "8px",
    marginLeft: "16px",
  },
  editButton: {
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  deleteButton: {
    background: "#fee2e2",
    color: "#b91c1c",
    border: "1px solid #fca5a5",
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  empty: {
    padding: "40px",
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: "36px",
  },
  emptyTitle: {
    fontSize: "16px",
    margin: "8px 0 4px",
    color: "#0f172a",
  },
  emptyText: {
    fontSize: "13px",
    color: "#64748b",
  },
  sprintControlsBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    background: "#ffffff",
    padding: "14px 20px",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    flexWrap: "wrap",
    gap: "12px",
  },
  sprintSelectDropdown: {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    fontWeight: "600",
    color: "#0f172a",
    background: "#ffffff",
  },
  editSprintBtn: {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    padding: "6px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  burndownCard: {
    background: "#ffffff",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    padding: "20px 24px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
  },
  burndownHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "16px",
  },
  burndownTitle: {
    margin: "0 0 4px",
    fontSize: "17px",
    color: "#0f172a",
  },
  burndownGoal: {
    margin: 0,
    fontSize: "13px",
    color: "#64748b",
  },
  burndownPercent: {
    textAlign: "right",
  },
  percentNumber: {
    fontSize: "26px",
    fontWeight: "800",
    color: "#16a34a",
    display: "block",
  },
  percentLabel: {
    fontSize: "11px",
    color: "#64748b",
    textTransform: "uppercase",
    fontWeight: "700",
  },
  progressBarTrack: {
    background: "#e2e8f0",
    borderRadius: "8px",
    height: "12px",
    overflow: "hidden",
    marginBottom: "18px",
  },
  progressBarFill: {
    background: "linear-gradient(90deg, #3b82f6 0%, #10b981 100%)",
    height: "100%",
    borderRadius: "8px",
    transition: "width 0.4s ease",
  },
  burndownMetricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "12px",
  },
  burnStatBox: {
    background: "#f8fafc",
    borderRadius: "8px",
    padding: "12px",
    border: "1px solid #e2e8f0",
    textAlign: "center",
  },
  burnStatVal: {
    display: "block",
    fontSize: "20px",
    fontWeight: "800",
    color: "#0f172a",
  },
  burnStatLbl: {
    fontSize: "11px",
    fontWeight: "600",
    color: "#64748b",
  },
  typeDistributionRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "16px",
    flexWrap: "wrap",
    paddingTop: "12px",
    borderTop: "1px solid #f1f5f9",
  },
  typeDistPill: {
    padding: "3px 8px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: "700",
    border: "1px solid",
  },
  unassignedDrawer: {
    marginTop: "24px",
    background: "#ffffff",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    padding: "16px 20px",
  },
  unassignedTitle: {
    margin: "0 0 4px",
    fontSize: "15px",
    color: "#0f172a",
  },
  unassignedSub: {
    margin: "0 0 12px",
    fontSize: "12px",
    color: "#64748b",
  },
  unassignedList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  unassignedItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    background: "#f8fafc",
    borderRadius: "6px",
    border: "1px solid #e2e8f0",
  },
  unassignedItemTitle: {
    fontSize: "13px",
    color: "#1e293b",
    fontWeight: "600",
  },
  pullIntoSprintBtn: {
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    padding: "4px 10px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
  },
  pipelineHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  triggerPipelineBtn: {
    background: "#16a34a",
    color: "#ffffff",
    border: "none",
    padding: "10px 18px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(22, 163, 74, 0.3)",
  },
  pipelineRunsList: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  pipelineRunCard: {
    background: "#ffffff",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    padding: "18px 22px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
  },
  runCardHeader: {
    display: "flex",
    justifyContent: "space-between",
  },
  runInfoCol: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  runTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  runStatusDot: {
    color: "#16a34a",
    fontSize: "14px",
  },
  runName: {
    margin: 0,
    fontSize: "16px",
    fontWeight: "700",
    color: "#0f172a",
  },
  runStatusBadge: {
    background: "#dcfce7",
    color: "#166534",
    padding: "2px 8px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: "700",
  },
  runCommitMsg: {
    margin: "4px 0",
    fontSize: "13px",
    color: "#334155",
    fontStyle: "italic",
  },
  runDetailsMeta: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    fontSize: "12px",
    color: "#64748b",
    flexWrap: "wrap",
  },
  stagesContainer: {
    marginTop: "16px",
    paddingTop: "14px",
    borderTop: "1px solid #f1f5f9",
  },
  stagesTrack: {
    display: "flex",
    gap: "10px",
    overflowX: "auto",
    paddingBottom: "4px",
  },
  stageItem: {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minWidth: "110px",
    gap: "2px",
  },
  stageIconWrap: {
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "#dcfce7",
    color: "#15803d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "10px",
    fontWeight: "bold",
    marginBottom: "2px",
  },
  stageCheck: {
    lineHeight: 1,
  },
  stageName: {
    fontSize: "11px",
    fontWeight: "600",
    color: "#1e293b",
    textAlign: "center",
  },
  stageDuration: {
    fontSize: "10px",
    color: "#94a3b8",
  },
  // Templates & AI Assistant Styles
  createFormTopActions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "14px",
    paddingBottom: "12px",
    borderBottom: "1px dashed #e2e8f0",
    flexWrap: "wrap",
    gap: "10px",
  },
  templatePicker: {
    padding: "6px 10px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "12px",
    background: "#f8fafc",
    color: "#334155",
    cursor: "pointer",
    outline: "none",
  },
  aiAssistHeaderBtn: {
    padding: "6px 14px",
    borderRadius: "6px",
    border: "1px solid #818cf8",
    background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
    color: "#4338ca",
    fontWeight: "700",
    fontSize: "12px",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(99,102,241,0.15)",
  },
  createAiCard: {
    background: "#f5f3ff",
    border: "1px solid #c7d2fe",
    borderRadius: "8px",
    padding: "12px 16px",
    marginBottom: "16px",
  },
  aiPromptInput: {
    flex: 1,
    minWidth: "220px",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    outline: "none",
  },
  aiGenerateBtn: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "none",
    background: "#4f46e5",
    color: "white",
    fontWeight: "700",
    fontSize: "13px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  // Queries Engine Styles
  queriesHero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    flexWrap: "wrap",
    gap: "14px",
  },
  saveQueryModalBtn: {
    background: "#ffffff",
    border: "1px solid #cbd5e1",
    color: "#334155",
    padding: "8px 16px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  exportCsvBtn: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    color: "#15803d",
    padding: "8px 16px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  queriesLayout: {
    display: "grid",
    gridTemplateColumns: "300px 1fr",
    gap: "20px",
    alignItems: "start",
  },
  queriesSidebar: {
    background: "#ffffff",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    padding: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  queryGroupHeader: {
    fontSize: "11px",
    fontWeight: "800",
    textTransform: "uppercase",
    color: "#64748b",
    letterSpacing: "0.5px",
    marginBottom: "10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  queryCountBadge: {
    background: "#f1f5f9",
    color: "#475569",
    padding: "1px 6px",
    borderRadius: "10px",
    fontSize: "10px",
    fontWeight: "700",
  },
  queryList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  queryItemBtn: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "10px 12px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.2s",
    width: "100%",
    boxSizing: "border-box",
  },
  queryItemBtnActive: {
    background: "#e0f2fe",
    borderColor: "#7dd3fc",
    boxShadow: "0 1px 4px rgba(2,132,199,0.1)",
  },
  queryItemIcon: {
    fontSize: "16px",
    marginTop: "1px",
  },
  queryItemName: {
    fontSize: "13px",
    fontWeight: "700",
    color: "#1e293b",
  },
  queryItemDesc: {
    fontSize: "11px",
    color: "#64748b",
    marginTop: "2px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  customQueryRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "6px",
    overflow: "hidden",
    transition: "all 0.2s",
  },
  customQueryRowActive: {
    background: "#e0f2fe",
    borderColor: "#7dd3fc",
  },
  customQueryBtn: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    padding: "10px 10px",
    background: "none",
    border: "none",
    cursor: "pointer",
    flex: 1,
    minWidth: 0,
  },
  queryItemMeta: {
    fontSize: "10px",
    color: "#94a3b8",
    marginTop: "2px",
  },
  deleteQueryBtn: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    padding: "8px 10px",
    cursor: "pointer",
    fontSize: "12px",
  },
  noCustomQueries: {
    fontSize: "11px",
    color: "#94a3b8",
    padding: "8px 4px",
    lineHeight: "1.4",
  },
  queriesMainArea: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  filterBuilderCard: {
    background: "#ffffff",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    padding: "18px 20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  filterBuilderHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "14px",
    paddingBottom: "8px",
    borderBottom: "1px solid #f1f5f9",
  },
  filterControlsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "12px",
    marginBottom: "14px",
  },
  filterFieldLabel: {
    display: "block",
    fontSize: "11px",
    fontWeight: "700",
    color: "#475569",
    marginBottom: "4px",
    textTransform: "uppercase",
  },
  filterSelect: {
    width: "100%",
    padding: "7px 10px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "12px",
    background: "#f8fafc",
    color: "#1e293b",
    outline: "none",
    boxSizing: "border-box",
  },
  filterInput: {
    width: "100%",
    padding: "7px 10px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "12px",
    outline: "none",
    boxSizing: "border-box",
  },
  filterActionsRow: {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end",
  },
  runQueryBtn: {
    background: "#0284c7",
    color: "white",
    border: "none",
    padding: "8px 18px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
  },
  resetQueryBtn: {
    background: "#f1f5f9",
    color: "#475569",
    border: "1px solid #cbd5e1",
    padding: "8px 14px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  queryResultsContainer: {
    background: "#ffffff",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    padding: "18px 20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  resultsHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "14px",
    flexWrap: "wrap",
    gap: "8px",
  },
  resultsTitle: {
    margin: 0,
    fontSize: "15px",
    fontWeight: "700",
    color: "#1e293b",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  resultsBadge: {
    fontSize: "11px",
    background: "#e0f2fe",
    color: "#0284c7",
    padding: "2px 8px",
    borderRadius: "12px",
    fontWeight: "700",
  },
  selectedQueryIndicator: {
    fontSize: "12px",
    color: "#64748b",
  },
  loadingQueryBox: {
    padding: "40px",
    textAlign: "center",
    color: "#0284c7",
    fontSize: "14px",
    fontWeight: "600",
  },
  noResultsBox: {
    padding: "40px 20px",
    textAlign: "center",
    color: "#64748b",
  },
  tableResponsive: {
    overflowX: "auto",
  },
  queryTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
  },
  qth: {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "2px solid #e2e8f0",
    color: "#475569",
    fontWeight: "700",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  queryTableRow: {
    borderBottom: "1px solid #f1f5f9",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  qtdId: {
    padding: "10px 12px",
    fontFamily: "monospace",
    fontWeight: "700",
    fontSize: "11px",
    color: "#64748b",
  },
  qtd: {
    padding: "10px 12px",
    color: "#334155",
    verticalAlign: "middle",
  },
  qtdTitle: {
    padding: "10px 12px",
    color: "#0f172a",
    fontWeight: "600",
  },
  qtdMeta: {
    padding: "10px 12px",
    fontSize: "11px",
    color: "#64748b",
  },
  ptsPill: {
    background: "#f1f5f9",
    padding: "2px 6px",
    borderRadius: "10px",
    fontSize: "11px",
    fontWeight: "700",
    color: "#475569",
  },
  sprintTag: {
    fontSize: "11px",
    color: "#0284c7",
    fontWeight: "600",
    background: "#e0f2fe",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(15,23,42,0.45)",
    backdropFilter: "blur(2px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalDialog: {
    background: "#ffffff",
    borderRadius: "12px",
    width: "440px",
    maxWidth: "92%",
    padding: "24px",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
  },
  dialogHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalInput: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
  },
  cancelModalBtn: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#475569",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },
  confirmSaveBtn: {
    padding: "8px 18px",
    borderRadius: "6px",
    border: "none",
    background: "#0284c7",
    color: "white",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
  },
  sampleDataBtn: {
    background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
    color: "#065f46",
    border: "1px solid #a7f3d0",
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(16,185,129,0.15)",
    transition: "all 0.2s",
  },
};

export default Dashboard;