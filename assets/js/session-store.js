// Only short-lived signed tokens are persisted; no applicant PII or passwords.
const KEY = 'knpu-session-v1-';
function payload(token) {
  try {
    const value = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
    return value.expiresAt > Date.now() ? value : null;
  } catch { return null; }
}
export function saveSession(role, token) {
  const value = payload(token);
  if (value?.role !== role) return;
  try { sessionStorage.setItem(KEY + role, token); } catch { /* Memory-only login still works. */ }
}
export function readSession(role) {
  try {
    const token = sessionStorage.getItem(KEY + role), value = payload(token);
    if (value?.role === role) return { token, providerId: value.providerId };
    clearSession(role);
  } catch { /* Storage may be disabled. */ }
  return null;
}
export function clearSession(role) {
  try { sessionStorage.removeItem(KEY + role); } catch { /* Storage may be disabled. */ }
}
