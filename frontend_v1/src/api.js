// src/api.js
import axios from 'axios';

const apiClient = axios.create({
  baseURL: '',
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const login = (username, password) => {
  const formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);
  return apiClient.post('/api/login', formData);
};

export const getStatus = () => {
  return apiClient.get('/api/status');
};

export const startContainer = (containerId) => {
  return apiClient.post(`/api/containers/${containerId}/start`);
};

export const restartContainer = (containerId) => {
  return apiClient.post(`/api/containers/${containerId}/restart`);
};

export const stopContainer = (containerId) => {
  return apiClient.post(`/api/containers/${containerId}/stop`);
};

export const getContainerLogs = (containerId, lines) => {
  return apiClient.get(`/api/containers/${containerId}/logs?lines=${lines}`);
};

// Run a shell command inside the container
export const runContainerCommand = (containerId, command) => {
  return apiClient.post(`/api/containers/${containerId}/exec`, {
    command,
  });
};
