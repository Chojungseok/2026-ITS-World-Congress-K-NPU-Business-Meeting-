import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {BASE_TIMES,STORAGE_KEY,STATUS} from '../assets/js/config.js';
const store=new Map();
Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
const {api}=await import('../assets/js/mock-api.js');
const admin=()=>api.authenticateAdmin({id:'ITSKOREA9911',password:'ITSKOREA9911!'});
beforeEach(async()=>{store.clear();await api.resetDemo();});
test('mock extension requires admin and rejects concurrent/repeated old expected last time',async()=>{
 const token=await admin(),last=BASE_TIMES.at(-1);
 await assert.rejects(api.extendSchedule({token:'invalid',expectedLastTime:last}));
 const result=await Promise.allSettled([api.extendSchedule({token,expectedLastTime:last}),api.extendSchedule({token,expectedLastTime:last})]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 const config=await api.getConfig();assert.equal(config.times.at(-1),'16:30 – 16:40');
 assert.ok(config.providers.every(p=>p.capacities['16:30 – 16:40']===2));
 assert.equal((await api.getAdminOverview(token)).history.filter(e=>e.action==='시간 연장').length,4);
 await assert.rejects(api.extendSchedule({token,expectedLastTime:last}),{code:'SCHEDULE_CHANGED'});
});
test('mock extended slots support application/approval/cancellation and ID verification without losing original data',async()=>{
 const token=await admin(),before=(await api.getAdminRequests(token)).length;
 const {time}=await api.extendSchedule({token,expectedLastTime:BASE_TIMES.at(-1)});
 const row=await api.submitRequest({itsCompany:'V3 ITS',contactName:'담당',phone:'010-0000-0000',email:'v3@example.com',providerId:'deepx',time,attendees:1,details:'상담',consent:true,privacyConsent:true});
 const provider=await api.authenticateProvider({providerId:'deepx',approvalCode:'deepx20261022'});
 await api.decideRequest({token:provider,id:row.id,decision:STATUS.CONFIRMED});
 assert.equal((await api.getAvailability('deepx')).at(-1).confirmed,1);
 await api.cancelRequest({id:row.id,email:row.email});
 assert.equal((await api.getAvailability('deepx')).at(-1).confirmed,0);
 assert.equal((await api.getAdminRequests(token)).length,before+1);
});
test('mock old V2 data migrates operational defaults to 2 but preserves historical capacities, IDs and history',async()=>{
 const raw=JSON.parse(store.get(STORAGE_KEY));delete raw.capacityVersion;delete raw.times;
 raw.capacities.deepx=5;raw.slotCapacities.deepx[BASE_TIMES[3]]=5;raw.slotCapacities.deepx['16:50 – 17:00']=5;
 const ids=raw.requests.map(r=>r.id),history=structuredClone(raw.history);store.set(STORAGE_KEY,JSON.stringify(raw));
 const config=await api.getConfig(),saved=JSON.parse(store.get(STORAGE_KEY));
 assert.ok(config.providers.every(p=>Object.values(p.capacities).every(c=>c===2)));
 assert.equal(saved.slotCapacities.deepx['16:50 – 17:00'],5);assert.deepEqual(saved.requests.map(r=>r.id),ids);assert.deepEqual(saved.history,history);
});
test('mock migration refuses >2 existing confirmed before any local data write',async()=>{
 const raw=JSON.parse(store.get(STORAGE_KEY));delete raw.capacityVersion;
 const row=raw.requests.find(r=>r.status===STATUS.CONFIRMED&&r.providerId==='deepx');
 for(let i=0;i<3;i++)raw.requests.push({...row,id:'over'+i});
 const before=JSON.stringify(raw);store.set(STORAGE_KEY,before);
 await assert.rejects(api.getConfig(),/확정.*로컬 V3/);assert.equal(store.get(STORAGE_KEY),before);
});
