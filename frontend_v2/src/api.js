// src/api.js
import axios from "axios";

const apiClient = axios.create({
  baseURL: "",
});

/**
 * We keep a list of callbacks that should run when the backend tells us
 * "your token is invalid / expired" (typically 401 or 403).
 *
 * DashboardV2 will register one of these callbacks so it can force logout
 * immediately without the user clicking anything.
 */
let onAuthErrorCallbacks = [];

export function registerAuthErrorCallback(cb) {
  onAuthErrorCallbacks.push(cb);
}

function notifyAuthError() {
  onAuthErrorCallbacks.forEach((cb) => {
    try {
      cb();
    } catch (_) {
      // ignore individual callback errors; we don't want to break others
    }
  });
}

/**
 * REQUEST INTERCEPTOR
 * Attach JWT token (if present in localStorage) to every outgoing request.
 */
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * RESPONSE INTERCEPTOR
 * If the backend returns 401/403, that usually means:
 * - token expired
 * - token invalid
 * - not authorized anymore
 *
 * In that case:
 *  - remove token from localStorage
 *  - notify the app so it can force logout and show <LoginForm />
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;

    if (status === 401 || status === 403) {
      // kill the token immediately
      localStorage.removeItem("token");

      // notify all listeners (DashboardV2 will listen and reset its state)
      notifyAuthError();
    }

    return Promise.reject(error);
  }
);

// ------------------ helper that LogsModal / ExecModal use ------------------
export function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ------------------ AUTH ------------------
export const login = (username, password) => {
  const formData = new FormData();
  formData.append("username", username);
  formData.append("password", password);
  return apiClient.post("/api/login", formData);
};

// ------------------ V1 container actions ------------------
export const startContainer = (containerId) =>
  apiClient.post(`/api/containers/${containerId}/start`);

export const stopContainer = (containerId) =>
  apiClient.post(`/api/containers/${containerId}/stop`);

export const restartContainer = (containerId) =>
  apiClient.post(`/api/containers/${containerId}/restart`);

export const getContainerLogs = (containerId, lines) =>
  apiClient.get(`/api/containers/${containerId}/logs?lines=${lines}`);

export const runContainerCommand = (containerId, command) =>
  apiClient.post(`/api/containers/${containerId}/exec`, { command });

// ------------------ V2 (stacks / compose view) ------------------
// GET /api/v2/stacks  -> { stacks: [...] }
export const listStacks = async () => {
  const res = await apiClient.get("/api/v2/stacks");
  return res.data.stacks || [];
};

// GET /api/v2/stacks/:stackId -> detail with containers
export const getStackDetail = async (stackId) => {
  const res = await apiClient.get(
    `/api/v2/stacks/${encodeURIComponent(stackId)}`
  );
  return res.data;
};

export default apiClient;
