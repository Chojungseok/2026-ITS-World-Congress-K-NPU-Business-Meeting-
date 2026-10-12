import { API_VERSION } from './build-version.js';
export class ApiError extends Error {
  constructor(code, message) { super(message); this.name = 'ApiError'; this.code = code; }
}
export function createGasApi({ url, fetchImpl = globalThis.fetch, timeoutMs = 45000, configTtlMs = 30000, now = Date.now, apiVersion = API_VERSION, retryReads = true, backoff = ms => new Promise(resolve => setTimeout(resolve, ms)), onTiming, clock = () => globalThis.performance?.now?.() ?? Date.now() } = {}) {
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
  async function providerSnapshot(token) {
    const generation = configGeneration;
    const data = await call('getProviderRequests', { token, includeConfig: true });
    // Old deployed servers return an array; keep that interface working during rollout.
    if (Array.isArray(data)) return { requests: data };
    if (data?.config && generation === configGeneration) rememberConfig(data.config);
    return { requests: data.requests, ...(Object.hasOwn(data, 'revision') ? { revision: data.revision } : {}) };
  }
  async function adminOverview(token) {
    const generation = configGeneration;
    const data = await call('getAdminOverview', { token });
    if (data?.config && generation === configGeneration) rememberConfig(data.config);
    return data;
  }
  async function availabilitySnapshot(providerId) {
    const generation = configGeneration;
    const data = await call('getAvailability', { providerId, includeConfig: true }, 'GET');
    if (Array.isArray(data)) return { slots: data }; // Old deployed server during rollout.
    if (data?.config && generation === configGeneration) rememberConfig(data.config);
    return data;
  }
  async function extendSchedule({ token, expectedLastTime }) {
    invalidateConfig();
    try { return await call('extendSchedule', { token, expectedLastTime }); }
    finally { invalidateConfig(); }
  }
  async function shrinkSchedule({token,expectedLastTime}) {
    invalidateConfig();
    try { return await call('shrinkSchedule',{token,expectedLastTime}); }
    finally { invalidateConfig(); }
  }
  async function updateCapacity(input) {
    invalidateConfig();
    try { return await call('updateProviderCapacity', input); }
    finally { invalidateConfig(); } // Also discard after a possibly committed/lost response.
  }
  const retryableReads = new Set(['getConfig','getAvailability','getAvailabilityRevision','getProviderRevision','getAdminRevision','getProviderRequests','getAdminRequests','getAdminOverview','getPublicBoard','getPublicBoardRevision']);
  const writes = new Set(['submitRequest','cancelRequest','decideRequest','updateProviderCapacity','extendSchedule','shrinkSchedule']);
  async function call(action, payload = {}, method = 'POST') {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url || ''))
      throw new ApiError('SETUP_REQUIRED','운영 서버 URL을 설정해 주세요.');
    const deadline=clock()+timeoutMs;
    const maxAttempts=retryReads && retryableReads.has(action) ? 2 : 1;
    for(let attempt=1;attempt<=maxAttempts;attempt++) {
      const started=clock(),controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),Math.max(1,deadline-started));
      let failure,serverTiming;
      try {
        const target=new URL(url);
        const options={method,mode:'cors',credentials:'omit',redirect:'follow',cache:'no-store',signal:controller.signal};
        if(method==='GET') {
          target.searchParams.set('action',action);target.searchParams.set('apiVersion',apiVersion);
          if(payload.providerId) target.searchParams.set('providerId',payload.providerId);
          if(payload.includeConfig===true) target.searchParams.set('includeConfig','true');
        } else {
          options.headers={'Content-Type':'text/plain;charset=utf-8'};
          options.body=JSON.stringify({...payload,action,apiVersion});
        }
        const response=await fetchImpl(target.href,options);
        if(!response.ok) {
          const error=new ApiError('HTTP_ERROR','서버 응답이 원활하지 않습니다. 잠시 후 현황을 확인해 주세요.');
          error.status=response.status;error.retryable=[502,503].includes(response.status);throw error;
        }
        let result;
        try { result=await response.json(); }
        catch(error) { if(controller.signal.aborted) throw error;throw new ApiError('INVALID_RESPONSE','서버 응답을 확인할 수 없습니다. 페이지를 새로고침해 주세요.'); }
        if(result?.ok!==true && result?.ok!==false || result.ok===true && !Object.hasOwn(result,'data') || result.ok===false && (typeof result.error?.code!=='string' || typeof result.error?.message!=='string'))
          throw new ApiError('INVALID_RESPONSE','서버 응답을 확인할 수 없습니다. 페이지를 새로고침해 주세요.');
        if(result.ok===false && result.error.code==='API_VERSION_MISMATCH') throw new ApiError('API_VERSION_MISMATCH','새 버전이 배포되었습니다. 페이지를 새로고침해 주세요.');
        if(result.meta?.apiVersion !== apiVersion) {
          const error=new ApiError('API_VERSION_MISMATCH','서버와 화면의 버전이 다릅니다. 페이지를 새로고침하고 운영 배포 상태를 확인해 주세요.');
          error.uncertain=writes.has(action);throw error;
        }
        serverTiming=result.meta.timing;
        if(result.ok===false) {
          const code=result.error.code==='BUSY' ? 'SERVER_BUSY' : result.error.code;
          const error=new ApiError(code,result.error.message);error.retryable=code==='SERVER_BUSY';throw error;
        }
        return result.data;
      } catch(caught) {
        failure=caught instanceof ApiError ? caught : new ApiError(controller.signal.aborted ? 'NETWORK_TIMEOUT' : 'NETWORK_FETCH_FAILED',controller.signal.aborted ? '서버 응답이 지연되고 있습니다. 잠시 후 현황을 확인해 주세요.' : '서버에 연결하지 못했습니다. 연결 상태를 확인해 주세요.');
        if(failure.code==='NETWORK_FETCH_FAILED') failure.retryable=true;
        if(writes.has(action) && ['NETWORK_TIMEOUT','NETWORK_FETCH_FAILED','HTTP_ERROR','INVALID_RESPONSE','INTERNAL'].includes(failure.code)) failure.uncertain=true;
        if(failure.uncertain) failure.message += action==='submitRequest' ? ' 접수되었을 수 있으므로 다시 제출하지 말고 신청 ID 찾기로 확인해 주세요.' : ' 처리되었을 수 있으므로 최신 현황에서 결과를 먼저 확인해 주세요.';
      } finally {
        clearTimeout(timer);
        try { onTiming?.({action,method,elapsedMs:clock()-started,attempt,code:failure?.code,serverMs:serverTiming?.elapsedMs,lockWaitMs:serverTiming?.lockWaitMs,lockHeldMs:serverTiming?.lockHeldMs,snapshotMs:serverTiming?.snapshotMs,writeMs:serverTiming?.writeMs,businessMs:serverTiming?.businessMs}); } catch { /* Diagnostics cannot affect requests. */ }
      }
      if(attempt>=maxAttempts || !failure.retryable || clock()+500>=deadline) throw failure;
      await backoff(250+Math.floor(Math.random()*251));
    }
  }
  async function authenticate(action,input) {
    const generation=configGeneration,data=await call(action,input);
    if(typeof data==='string') return data; // Existing opt-out authentication contract.
    if(typeof data?.token!=='string') throw new ApiError('INVALID_RESPONSE','로그인 응답을 확인할 수 없습니다.');
    const config=data.snapshot?.config || data.overview?.config;
    if(config && generation===configGeneration) rememberConfig(config);
    return data;
  }
  async function revision(action, input, method = 'POST') {
    const result = await call(action, input, method);
    if (typeof result?.revision !== 'string' || !result.revision)
      throw new ApiError('INVALID_RESPONSE', '변경 버전을 확인할 수 없습니다. 잠시 후 다시 확인해 주세요.');
    return { revision: result.revision };
  }
  function identity(input) {
    if (!input?.id?.trim() || !input?.email?.trim()) throw new ApiError('IDENTITY_REQUIRED', '신청ID와 신청 이메일을 입력해 주세요.');
    return { id: input.id.trim(), email: input.email.trim() };
  }
  return Object.freeze({
    mode: 'gas',
    getConfig,
    invalidateConfig,
    extendSchedule,
    shrinkSchedule,
    getPublicBoard: () => call('getPublicBoard',{},'GET'),
    getPublicBoardRevision: () => revision('getPublicBoardRevision',{},'GET'),
    getAvailabilitySnapshot: availabilitySnapshot,
    getAvailability: providerId => call('getAvailability', { providerId }, 'GET'),
    submitRequest: input => call('submitRequest', input),
    findRequestIds: input => call('findRequestIds', {
      itsCompany: input?.itsCompany, contactName: input?.contactName, phone: input?.phone, email: input?.email
    }),
    findRequest: async input => call('findRequest', identity(input)),
    cancelRequest: async input => call('cancelRequest', identity(input)),
    authenticateProvider: input => authenticate('authenticateProvider', input),
    authenticateAdmin: input => authenticate('authenticateAdmin', input),
    updateProviderCapacity: updateCapacity,
    logout: token => call('logout', { token }),
    // Preserve the original array contract; snapshot metadata is opt-in for the UI.
    getProviderRequests: async token => (await providerSnapshot(token)).requests,
    getProviderSnapshot: providerSnapshot,
    getProviderRevision: ({ token }) => revision('getProviderRevision', { token }),
    getAdminRevision: ({ token }) => revision('getAdminRevision', { token }),
    getAvailabilityRevision: providerId => revision('getAvailabilityRevision', { providerId }, 'GET'),
    decideRequest: input => call('decideRequest', input),
    getAdminRequests: token => call('getAdminRequests', { token }),
    getAdminOverview: adminOverview
  });
}
