import { MATERIAL_CATALOG } from './material-catalog.js';
export const materialAvailable = item => item?.available === true && item.publicApproved === true &&
  typeof item.filePath === 'string' && /^assets\/(?:brochures|materials)\/[a-z0-9/_-]+\.pdf$/.test(item.filePath) && !item.filePath.includes('..');
export function materialById(id) { return MATERIAL_CATALOG.materials.find(m => m.materialId === id); }
// A tab-scoped random identifier, independent of login, application IDs and PII.
let volatileSession;
export function materialSessionId(storage) {
  const key = 'knpu-material-visit-v1', valid = v => /^[a-f0-9-]{36}$/i.test(v || '');
  try { storage ??= globalThis.sessionStorage; const stored = storage?.getItem(key); if (valid(stored)) return stored; } catch {}
  const id = volatileSession ||= crypto.randomUUID();
  try { storage?.setItem(key, id); } catch {}
  return id;
}
