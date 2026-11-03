import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || (
  import.meta.env.PROD
    ? 'https://rota-system-kohl.vercel.app/api'
    : 'http://localhost:5000/api'
);

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('usman_web_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('usman_web_token');
      localStorage.removeItem('usman_web_user');
      window.dispatchEvent(new Event('usman_auth_expired'));
    }
    return Promise.reject(error);
  }
);

export default api;
