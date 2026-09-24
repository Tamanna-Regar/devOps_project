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
    if (params.search) query.append("search", params.search);
    const qs = query.toString();
    return request(`/api/admin/tasks${qs ? `?${qs}` : ""}`);
  },

  addTask: (payload) =>
    request("/api/tasks", { method: "POST", body: JSON.stringify(payload) }),

  updateTask: (taskId, payload) =>
    request(`/api/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(payload) }),

  deleteTask: (taskId) => request(`/api/tasks/${taskId}`, { method: "DELETE" }),

  // Admin User Management
  getAllUsers: () => request("/api/admin/users"),

  updateUserRole: (userId, role) =>
    request(`/api/admin/users/${userId}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),

  deleteUser: (userId) => request(`/api/admin/users/${userId}`, { method: "DELETE" }),

  // DevOps Health & Observability
  getHealth: () => request("/health"),
  getLiveness: () => request("/health/live"),
  getReadiness: () => request("/health/ready"),
  getInfo: () => request("/api/info"),
};

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