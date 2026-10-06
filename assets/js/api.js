import { RUNTIME_CONFIG, resolveBackend } from './runtime-config.js';
// Sole backend entry point. Do not import the demo backend in production.
const mode = resolveBackend();
export const api = mode === 'mock'
  ? (await import('./mock-api.js')).api
  : (await import('./gas-api.js')).createGasApi({ url: RUNTIME_CONFIG.gasUrl });
