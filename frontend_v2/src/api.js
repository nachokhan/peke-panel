// src/api.js
import axios from "axios";

const apiClient = axios.create({
  baseURL: "",
});

// token JWT en todas las requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --------- helper que usan modales Logs/Shell ---------
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

// GET /api/v2/stacks/:stackId -> detalle con containers
export const getStackDetail = async (stackId) => {
  const res = await apiClient.get(
    `/api/v2/stacks/${encodeURIComponent(stackId)}`
  );
  return res.data;
};
