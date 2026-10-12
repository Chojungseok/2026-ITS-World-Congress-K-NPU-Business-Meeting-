import { RUNTIME_CONFIG } from './runtime-config.js';
const entries=[];
const labels=new Set(['bootstrap','home','apply','lookup','find-id','brochures','npu','matching','admin','getConfig','getAvailability','getAvailabilityRevision','getProviderRevision','getAdminRevision','submitRequest','findRequest','findRequestIds','cancelRequest','authenticateProvider','authenticateAdmin','logout','getProviderRequests','decideRequest','updateProviderCapacity','getAdminRequests','getAdminOverview','extendSchedule','shrinkSchedule','board','getPublicBoard','getPublicBoardRevision']);
const codes=new Set(['NETWORK_TIMEOUT','NETWORK_FETCH_FAILED','HTTP_ERROR','INVALID_RESPONSE','API_VERSION_MISMATCH','SERVER_BUSY','SETUP_REQUIRED','VALIDATION','CONSENT_REQUIRED','NOTICE_CHANGED','DUPLICATE','CAPACITY_FULL','NOT_FOUND','RATE_LIMITED','INVALID_CREDENTIALS','UNAUTHORIZED','FORBIDDEN','INVALID_STATE','UNKNOWN_ACTION','METHOD_NOT_ALLOWED','BAD_REQUEST','REVISION_PENDING','INTERNAL','IDENTITY_REQUIRED','SCHEDULE_CHANGED','SCHEDULE_LIMIT','SCHEDULE_IN_USE']);
export const clockNow=()=>globalThis.performance?.now?.() ?? Date.now();
export function recordTiming(kind,label,elapsedMs,extra={}) {
  if (!RUNTIME_CONFIG.performanceDiagnostics || !['bootstrap','route','gas'].includes(kind)) return;
  const item={kind,label:labels.has(label) ? label : 'unknown',elapsedMs:Math.max(0,Math.round(elapsedMs))};
  for(const key of ['attempt','serverMs','lockWaitMs','lockHeldMs','snapshotMs','writeMs','businessMs']) if(Number.isFinite(extra[key])) item[key]=extra[key];
  if(['GET','POST'].includes(extra.method)) item.method=extra.method;
  if(codes.has(extra.code)) item.code=extra.code;
  entries.push(item);if(entries.length>100) entries.shift();
  console.debug('[K-NPU timing]',item);
}
export const performanceEntries=()=>entries.map(item=>({...item}));
