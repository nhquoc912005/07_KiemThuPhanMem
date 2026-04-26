import axios from 'axios';
import { clearAuthSession, getStoredAccessToken } from '../../auth/session';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLoopbackHost(hostname: string) {
  return LOOPBACK_HOSTS.has(String(hostname || '').trim().toLowerCase());
}

function normalizeBaseUrl(url: string) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function resolveApiBaseUrl() {
  const browserHost = window.location.hostname;
  const defaultBaseUrl = `http://${browserHost}:5000/api/v1`;
  const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim();

  if (!configuredBaseUrl) {
    return defaultBaseUrl;
  }

  try {
    const parsedUrl = new URL(configuredBaseUrl);

    if (!isLoopbackHost(browserHost) && isLoopbackHost(parsedUrl.hostname)) {
      parsedUrl.hostname = browserHost;
      return normalizeBaseUrl(parsedUrl.toString());
    }

    return normalizeBaseUrl(parsedUrl.toString());
  } catch {
    return normalizeBaseUrl(configuredBaseUrl);
  }
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true'
  }
});

api.interceptors.request.use((config) => {
  const accessToken = getStoredAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    const payload = response.data
    if (
      payload &&
      typeof payload === 'object' &&
      'success' in payload &&
      'data' in payload
    ) {
      response.data = payload.data
    }

    return response
  },
  (error) => {
    const status = error.response?.status;
    const requestUrl = String(error.config?.url || '');
    const isAuthEndpoint =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/change-password-first-login') ||
      requestUrl.includes('/auth/register') ||
      requestUrl.includes('/auth/forgot-password') ||
      requestUrl.includes('/auth/reset-password');

    if (status === 401 && !isAuthEndpoint) {
      clearAuthSession();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  }
);

export { api };

