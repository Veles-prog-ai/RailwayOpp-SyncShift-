/**
 * Separated Frontend-to-Backend API Client.
 * When deployed separately from the backend gateway, configure VITE_API_BASE_URL
 * (e.g. https://api.example.com). When served together on the same origin, leave empty.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function apiUrl(path) {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export async function apiFetch(path, init) {
  return fetch(apiUrl(path), init);
}
