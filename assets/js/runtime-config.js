// Public configuration only. Never put passwords, approval codes or tokens here.
export const RUNTIME_CONFIG = Object.freeze({
  // auto: localhost/127.0.0.1/file uses mock; all other hosts use GAS.
  // Use 'gas' to test the real backend locally. Hosted sites never fall back to mock.
  backend: 'auto',
  gasUrl: 'https://script.google.com/macros/s/AKfycbytiA-aqCFyragSDjxLrWzxuyLPqN_BCFbDiOv6YHd_AbkE2axhpw4-b95q3fqZNKJ_/exec', // Paste https://script.google.com/macros/s/DEPLOYMENT_ID/exec here.
  refreshIntervalMs: 30000, // Apply/lookup and compatibility fallback only.
  revisionPolling: Object.freeze({ providerMs: 5000, adminMs: 10000, retryMs: 30000 })
});
export function resolveBackend(config = RUNTIME_CONFIG, location = globalThis.location) {
  const local = !location || location.protocol === 'file:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!['auto', 'gas', 'mock'].includes(config.backend)) throw new Error('backend 설정을 확인해 주세요.');
  if (config.backend === 'mock' && !local) throw new Error('공개 사이트에서는 로컬 데모 모드를 사용할 수 없습니다.');
  return config.backend === 'auto' ? (local ? 'mock' : 'gas') : config.backend;
}
