import { API_VERSION } from './build-version.js';
import { RUNTIME_CONFIG, resolveBackend } from './runtime-config.js';
import { recordTiming } from './performance.js';
// Sole entry point. Home loads neither backend adapter nor server data.
const mode=resolveBackend();let pending;
const backend=()=>pending ||= (mode==='mock' ? import('./mock-api.js').then(m=>m.api) : import('./gas-api.js').then(m=>m.createGasApi({url:RUNTIME_CONFIG.gasUrl,apiVersion:API_VERSION,onTiming:t=>recordTiming('gas',t.action,t.elapsedMs,t)}))).catch(error=>{pending=null;throw error;});
const methods=['getConfig','invalidateConfig','getAvailability','getAvailabilitySnapshot','submitRequest','findRequest','findRequestIds','cancelRequest','authenticateProvider','authenticateAdmin','updateProviderCapacity','logout','getProviderRequests','getProviderSnapshot','getProviderRevision','getAdminRevision','getAvailabilityRevision','decideRequest','getAdminRequests','getAdminOverview','extendSchedule','shrinkSchedule','getPublicBoard','getPublicBoardRevision'];
const facade={mode};for(const name of methods) facade[name]=async(...args)=>(await backend())[name](...args);
if(mode==='mock') facade.resetDemo=async()=>(await backend()).resetDemo();
export const api=Object.freeze(facade);
