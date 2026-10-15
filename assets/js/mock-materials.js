// Imported only by mock-api.js. No seed clicks; production never imports this store.
import { MATERIAL_CATALOG } from './material-catalog.js';
import { materialAvailable, materialById } from './materials.js';
import { aggregateMaterialViews } from './material-stats.js';
export const MATERIAL_STORAGE_KEY = 'knpu-material-clicks-demo-v1';
const failure = (code,message) => { throw Object.assign(new Error(message),{code}); };
const read = () => {const value=JSON.parse(localStorage.getItem(MATERIAL_STORAGE_KEY) || '[]');if(!Array.isArray(value))failure('LOCAL_DATA','자료 열람 데모 데이터를 확인해 주세요.');return value;};
export async function logMockMaterialView(input) {
  const material=materialById(input.materialId);
  if(!materialAvailable(material))failure('MATERIAL_UNAVAILABLE','아직 등록되지 않은 자료입니다.');
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  if(!uuid.test(input.sessionId || '') || !uuid.test(input.clickId || ''))failure('VALIDATION','자료 열람 요청 형식을 확인해 주세요.');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input.sessionId));
  const sessionHash=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
  const work=()=>{
    const rows=read(),previous=rows.find(r=>r.clickId===input.clickId);
    if(previous){if(previous.sessionHash!==sessionHash || previous.materialId!==material.materialId)failure('VALIDATION','중복 클릭 요청을 확인해 주세요.');return {recorded:true,duplicate:true};}
    if(rows.filter(r=>r.sessionHash===sessionHash && Date.parse(r.occurredAt)>Date.now()-60000).length>=30)failure('RATE_LIMITED','자료 열람 기록 요청이 많습니다.');
    rows.push({materialId:material.materialId,occurredAt:new Date().toISOString(),sessionHash,clickId:input.clickId});
    localStorage.setItem(MATERIAL_STORAGE_KEY,JSON.stringify(rows));return {recorded:true,duplicate:false};
  };
  return globalThis.navigator?.locks ? navigator.locks.request(MATERIAL_STORAGE_KEY,work) : work();
}
export function mockMaterialStatistics(filters={}) {
  const result=aggregateMaterialViews(MATERIAL_CATALOG,read(),filters),offset=Math.max(0,Number(filters.offset)||0);
  return {...result,records:result.records.slice(offset,offset+100),offset,totalRecords:result.records.length,
    catalogVersion:MATERIAL_CATALOG.version,generatedAt:new Date().toISOString()};
}
export function resetMockMaterials(){localStorage.setItem(MATERIAL_STORAGE_KEY,'[]');}
