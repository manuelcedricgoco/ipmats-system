/**
 * Thin fetch wrapper for the DPWH 360° API. Attaches the current Supabase
 * session token and normalises errors into ApiError.
 */
import { isSuspensionError } from './constants.js';
import { supabase } from './supabaseClient.js';

export const ACCOUNT_SUSPENDED_EVENT = 'ipmats:account-suspended';

const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function buildQuery(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function request(method, path, { body, query, signal, raw } = {}) {
  const headers = { ...(await authHeader()) };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}${buildQuery(query)}`, { method, headers, body: payload, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (raw && res.ok) return res;
  if (res.status === 204) return null;

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const message = data?.error?.message || `Request failed (${res.status})`;
    // Suspended while signed in: AuthContext signs out and the sign-in page explains why.
    if (res.status === 403 && isSuspensionError(message)) window.dispatchEvent(new CustomEvent(ACCOUNT_SUSPENDED_EVENT, { detail: { message } }));
    throw new ApiError(res.status, message, data?.error?.details);
  }
  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  del: (path, opts) => request('DELETE', path, opts),

  /** Download a file (PDF / Excel) with auth and trigger a browser save. */
  async download(path, query, fallbackName = 'download') {
    const res = await request('GET', path, { query, raw: true });
    const disposition = res.headers.get('content-disposition') || '';
    const name = /filename="?([^"]+)"?/.exec(disposition)?.[1] || fallbackName;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
