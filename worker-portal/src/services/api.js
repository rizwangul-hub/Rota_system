import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || (
  import.meta.env.PROD
    ? 'https://rota-system-kohl.vercel.app/api'
    : 'http://localhost:5000/api'
);

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('worker_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token expiration or account deactivation
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const code = error.response.data?.code;
      if (code === 'TOKEN_EXPIRED' || code === 'EMPLOYEE_INACTIVE' || code === 'INVALID_TOKEN') {
        localStorage.removeItem('worker_token');
        localStorage.removeItem('worker_user');
        window.dispatchEvent(new CustomEvent('worker-auth-expired', { detail: error.response.data }));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
