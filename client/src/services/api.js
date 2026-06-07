import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

const panelStorageKey = 'stocksense_panel_mode';
const authStorageKeys = {
  admin: 'stocksense_token_admin',
  customer: 'stocksense_token_customer',
};

api.interceptors.request.use((config) => {
  const activePanel = sessionStorage.getItem(panelStorageKey) === 'customer' ? 'customer' : 'admin';
  const token = sessionStorage.getItem(authStorageKeys[activePanel]);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
