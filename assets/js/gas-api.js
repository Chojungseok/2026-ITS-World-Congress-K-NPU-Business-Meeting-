export class ApiError extends Error {
  constructor(code, message) { super(message); this.name = 'ApiError'; this.code = code; }
}
export function createGasApi({ url, fetchImpl = globalThis.fetch, timeoutMs = 45000, configTtlMs = 30000, now = Date.now } = {}) {
  // Public config only: never cache requests, tokens, credentials or PII.
  let cachedConfig = null, configExpiresAt = 0, configPromise = null, configGeneration = 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  function invalidateConfig() {
    configGeneration++; cachedConfig = null; configExpiresAt = 0; configPromise = null;
  }
  function rememberConfig(config) {
    invalidateConfig();
    cachedConfig = clone(config); configExpiresAt = now() + configTtlMs;
  }
  function getConfig() {
    if (cachedConfig && now() < configExpiresAt) return Promise.resolve(clone(cachedConfig));
    if (configPromise) return configPromise;
    const generation = configGeneration;
    const pending = call('getConfig', {}, 'GET').then(config => {
      if (generation !== configGeneration) return getConfig();
      cachedConfig = clone(config); configExpiresAt = now() + configTtlMs;
      return clone(config);
    }).finally(() => { if (configPromise === pending) configPromise = null; });
    configPromise = pending;
    return pending;
  }
  async function providerRequests(token) {
    const generation = configGeneration;
    const data = await call('getProviderRequests', { token, includeConfig: true });
    // Old deployed servers return an array; keep that interface working during rollout.
    if (Array.isArray(data)) return data;
    if (data?.config && generation === configGeneration) rememberConfig(data.config);
    return data.requests;
  }
  async function adminOverview(token) {
    const generation = configGeneration;
    const data = await call('getAdminOverview', { token });
    if (data?.config && generation === configGeneration) rememberConfig(data.config);
    return data;
  }
  async function updateCapacity(input) {
    invalidateConfig();
    try { return await call('updateProviderCapacity', input); }
    finally { invalidateConfig(); } // Also discard after a possibly committed/lost response.
  }
  async function call(action, payload = {}, method = 'POST') {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url || ''))
      throw new ApiError('SETUP_REQUIRED', '운영 서버 URL을 설정해 주세요. apps-script/README.md를 참고하세요.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const target = new URL(url);
      const options = { method, mode: 'cors', credentials: 'omit', redirect: 'follow', cache: 'no-store', signal: controller.signal };
      if (method === 'GET') {
        target.searchParams.set('action', action);
        if (payload.providerId) target.searchParams.set('providerId', payload.providerId);
      } else {
        options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        options.body = JSON.stringify({ ...payload, action });
      }
      const response = await fetchImpl(target.href, options);
      if (!response.ok) throw new ApiError('HTTP_ERROR', '서버에 연결하지 못했습니다. 처리 결과를 조회한 후 다시 시도해 주세요.');
      let result;
      try { result = await response.json(); }
      catch { throw new ApiError('INVALID_RESPONSE', '서버 응답을 확인할 수 없습니다. 웹 앱 접근 권한과 배포 URL을 확인해 주세요.'); }
      if (result?.ok === false && typeof result.error?.code === 'string' && typeof result.error?.message === 'string')
        throw new ApiError(result.error.code, result.error.message);
      if (result?.ok !== true || !Object.hasOwn(result, 'data'))
        throw new ApiError('INVALID_RESPONSE', '서버 응답 형식이 올바르지 않습니다.');
      return result.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // Do not automatically retry writes: the server may already have committed.
      throw new ApiError('NETWORK_ERROR', '연결이 끊겼거나 응답이 지연되었습니다. 처리 결과를 조회한 후 다시 시도해 주세요.');
    } finally { clearTimeout(timer); }
  }
  function identity(input) {
    if (!input?.id?.trim() || !input?.email?.trim()) throw new ApiError('IDENTITY_REQUIRED', '신청ID와 신청 이메일을 입력해 주세요.');
    return { id: input.id.trim(), email: input.email.trim() };
  }
  return Object.freeze({
    mode: 'gas',
    getConfig,
    invalidateConfig,
    getAvailability: providerId => call('getAvailability', { providerId }, 'GET'),
    submitRequest: input => call('submitRequest', input),
    findRequest: async input => call('findRequest', identity(input)),
    cancelRequest: async input => call('cancelRequest', identity(input)),
    authenticateProvider: input => call('authenticateProvider', input),
    authenticateAdmin: input => call('authenticateAdmin', input),
    updateProviderCapacity: updateCapacity,
    logout: token => call('logout', { token }),
    getProviderRequests: providerRequests,
    decideRequest: input => call('decideRequest', input),
    getAdminRequests: token => call('getAdminRequests', { token }),
    getAdminOverview: adminOverview
  });
}
