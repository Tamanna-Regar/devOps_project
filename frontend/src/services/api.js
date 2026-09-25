const getBaseUrl = () => {
  if (import.meta.env.VITE_API_URL !== undefined) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost") {
      return "http://localhost:8000";
    }
    if (window.location.hostname === "127.0.0.1") {
      return "http://127.0.0.1:8000";
    }
    return "";
  }
  return "http://127.0.0.1:8000";
};

const BASE_URL = getBaseUrl();

export { BASE_URL, getBaseUrl };

export function getToken() {
  return localStorage.getItem("token") || localStorage.getItem("access_token");
}

export function getUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function request(path, options = {}) {
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  // Attach JWT if available
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Handle URL (support relative path if BASE_URL is empty)
  const baseUrl = getBaseUrl();
  const fullUrl = baseUrl ? `${baseUrl.replace(/\/+$/, "")}${path}` : path;

  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.detail || data.message || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Auth
  register: (payload) =>
    request("/api/register", { method: "POST", body: JSON.stringify(payload) }),

  login: (payload) =>
    request("/api/login", { method: "POST", body: JSON.stringify(payload) }),

  getMe: () => request("/api/me"),

  forgotPassword: (payload) =>
    request("/api/forgot-password", { method: "POST", body: JSON.stringify(payload) }),

  resetPassword: (payload) =>
    request("/api/reset-password", { method: "POST", body: JSON.stringify(payload) }),

  // Tasks
  getMyTasks: (params = {}) => {
    if (typeof params === "string") {
      return request(`/api/tasks/${encodeURIComponent(params)}`);
    }
    const query = new URLSearchParams();
    if (params.status && params.status !== "All") query.append("status", params.status);
    if (params.priority && params.priority !== "All") query.append("priority", params.priority);
    if (params.item_type && params.item_type !== "All") query.append("item_type", params.item_type);
    if (params.search) query.append("search", params.search);
    if (params.sort_by) query.append("sort_by", params.sort_by);
    if (params.sort_order) query.append("sort_order", params.sort_order);
    const qs = query.toString();
    return request(`/api/tasks${qs ? `?${qs}` : ""}`);
  },

  getAllTasks: (params = {}) => {
    const query = new URLSearchParams();
    if (params.status && params.status !== "All") query.append("status", params.status);
    if (params.priority && params.priority !== "All") query.append("priority", params.priority);
    if (params.item_type && params.item_type !== "All") query.append("item_type", params.item_type);
    if (params.search) query.append("search", params.search);
    const qs = query.toString();
    return request(`/api/admin/tasks${qs ? `?${qs}` : ""}`);
  },

  addTask: (payload) =>
    request("/api/tasks", { method: "POST", body: JSON.stringify(payload) }),

  updateTask: (taskId, payload) =>
    request(`/api/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(payload) }),

  deleteTask: (taskId) => request(`/api/tasks/${taskId}`, { method: "DELETE" }),

  // User Profile & Settings
  updateProfile: (payload) =>
    request("/api/me", { method: "PUT", body: JSON.stringify(payload) }),

  updatePassword: (payload) =>
    request("/api/me/password", { method: "PUT", body: JSON.stringify(payload) }),

  getTeamMembers: () => request("/api/users/team"),

  getTags: () => request("/api/tags"),

  // Boards & Sprints
  getBoard: (sprintId) =>
    request(`/api/board${sprintId ? `?sprint_id=${encodeURIComponent(sprintId)}` : ""}`),

  getSprints: () => request("/api/sprints"),

  createSprint: (payload) =>
    request("/api/sprints", { method: "POST", body: JSON.stringify(payload) }),

  updateSprint: (sprintId, payload) =>
    request(`/api/sprints/${sprintId}`, { method: "PUT", body: JSON.stringify(payload) }),

  deleteSprint: (sprintId) =>
    request(`/api/sprints/${sprintId}`, { method: "DELETE" }),

  getSprintBurndown: (sprintId) =>
    request(`/api/sprints/${sprintId}/burndown`),

  getBacklog: (params = {}) => {
    const query = new URLSearchParams();
    if (params.skip !== undefined) query.append("skip", params.skip);
    if (params.limit !== undefined) query.append("limit", params.limit);
    const qs = query.toString();
    return request(`/api/backlog${qs ? `?${qs}` : ""}`);
  },

  assignTaskToSprint: (taskId, sprintId) =>
    request(`/api/tasks/${taskId}/sprint`, {
      method: "PUT",
      body: JSON.stringify({ sprint_id: sprintId }),
    }),

  // Work Item Hierarchy
  setTaskParent: (taskId, parentId) =>
    request(`/api/tasks/${taskId}/parent`, {
      method: "PUT",
      body: JSON.stringify({ parent_id: parentId }),
    }),

  getTaskChildren: (taskId) =>
    request(`/api/tasks/${taskId}/children`),

  // Work Item Comments
  addComment: (taskId, text) =>
    request(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  getComments: (taskId) =>
    request(`/api/tasks/${taskId}/comments`),

  // Activity Log
  getActivityLog: (taskId) =>
    request(`/api/tasks/${taskId}/activity`),

  // Work Item Attachments
  uploadAttachment: async (taskId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return uploadFile(`/api/tasks/${taskId}/attachments`, formData);
  },

  getAttachments: (taskId) =>
    request(`/api/tasks/${taskId}/attachments`),

  downloadAttachment: async (attachmentId, filename = "download") => {
    const token = getToken();
    const baseUrl = getBaseUrl();
    const fullUrl = baseUrl
      ? `${baseUrl.replace(/\/+$/, "")}/api/attachments/${attachmentId}/download`
      : `/api/attachments/${attachmentId}/download`;

    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(fullUrl, { headers });
    if (!res.ok) throw new Error("Failed to download attachment");

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // Bulk Actions
  bulkUpdateTasks: (payload) =>
    request("/api/tasks/bulk-update", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Azure Pipelines CI/CD Runs
  getPipelineRuns: () => request("/api/pipelines/runs"),
  triggerPipeline: () => request("/api/pipelines/trigger", { method: "POST" }),

  // Admin User Management
  getAllUsers: () => request("/api/admin/users"),

  updateUserRole: (userId, role) =>
    request(`/api/admin/users/${userId}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),

  deleteUser: (userId) => request(`/api/admin/users/${userId}`, { method: "DELETE" }),

  // Azure DevOps Queries Engine
  getQueries: () => request("/api/queries"),
  createQuery: (payload) =>
    request("/api/queries", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteQuery: (queryId) =>
    request(`/api/queries/${queryId}`, {
      method: "DELETE",
    }),
  runQuery: (payload) =>
    request("/api/queries/run", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // AI Work Item Assistant
  aiGenerateWorkItem: (payload) =>
    request("/api/ai/generate-work-item", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Demo Data Seeder
  seedDemoData: () => request("/api/demo/seed", { method: "POST" }),

  // DevOps Health & Observability
  getHealth: () => request("/health"),
  getLiveness: () => request("/health/live"),
  getReadiness: () => request("/health/ready"),
  getInfo: () => request("/api/info"),
};

export async function uploadFile(path, formData) {
  const token = getToken();
  const headers = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const baseUrl = getBaseUrl();
  const fullUrl = baseUrl ? `${baseUrl.replace(/\/+$/, "")}${path}` : path;

  const response = await fetch(fullUrl, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = data.detail || data.message || `Upload failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function saveSession(token, user) {
  localStorage.setItem("token", token);
  localStorage.setItem("access_token", token);
  if (user) {
    localStorage.setItem("user", JSON.stringify(user));
    if (user.email) {
      localStorage.setItem("userEmail", user.email);
    }
  }
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("access_token");
  localStorage.removeItem("user");
  localStorage.removeItem("userEmail");
}