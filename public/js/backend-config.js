// Central backend URL used by frontend to call API endpoints.
// Priority: window.RR_BACKEND_URL > window.__ENV__.BACKEND_URL > same origin (Vercel)
const envBackend = (window.__ENV__ && window.__ENV__.BACKEND_URL) || null;
const runtimeBackend = window.RR_BACKEND_URL || envBackend;
export const BACKEND_URL = (runtimeBackend && String(runtimeBackend).replace(/\/$/, '')) || window.location.origin;
