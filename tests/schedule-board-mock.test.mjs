import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {BASE_TIMES,STORAGE_KEY,STATUS} from '../assets/js/config.js';
const store=new Map();Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
const {api}=await import('../assets/js/mock-api.js');
const admin=()=>api.authenticateAdmin({id:'ITSKOREA9911',password:'ITSKOREA9911!'});
beforeEach(async()=>{store.clear();await api.resetDemo();});

test('mock shrink protects base and role; preserves retired capacity entries and audit history when reopened',async()=>{
 const token=await admin();await assert.rejects(api.shrinkSchedule({token,expectedLastTime:BASE_TIMES.at(-1)}),{code:'SCHEDULE_LIMIT'});
 const {time}=await api.extendSchedule({token,expectedLastTime:BASE_TIMES.at(-1)});
 await assert.rejects(api.shrinkSchedule({token:'bad',expectedLastTime:time}));
 const outcomes=await Promise.allSettled([api.shrinkSchedule({token,expectedLastTime:time}),api.shrinkSchedule({token,expectedLastTime:time})]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'SCHEDULE_CHANGED');
 const raw=JSON.parse(store.get(STORAGE_KEY));assert.equal(raw.times.length,4);assert.ok(Object.values(raw.slotCapacities).every(p=>p[time]===2));assert.equal(raw.history.filter(e=>e.action==='시간 연장 취소').length,4);
 await api.extendSchedule({token,expectedLastTime:BASE_TIMES.at(-1)});assert.equal((await api.getPublicBoard()).times.length,5);
});

test('mock pending/confirmed block shrink; cancellation permits it; board contains public aggregates only',async()=>{
 const token=await admin(),{time}=await api.extendSchedule({token,expectedLastTime:BASE_TIMES.at(-1)}),rev=(await api.getPublicBoardRevision()).revision;
 const input={itsCompany:'PRIVATE ITS',contactName:'PRIVATE PERSON',phone:'010-0000-0000',email:'private@example.com',providerId:'deepx',time,attendees:1,details:'PRIVATE DETAILS',consent:true,privacyConsent:true};
 const row=await api.submitRequest(input);assert.equal((await api.getPublicBoardRevision()).revision,rev);await assert.rejects(api.shrinkSchedule({token,expectedLastTime:time}),{code:'SCHEDULE_IN_USE'});
 const provider=await api.authenticateProvider({providerId:'deepx',approvalCode:'deepx20261022'});await api.decideRequest({token:provider,id:row.id,decision:STATUS.CONFIRMED});await assert.rejects(api.shrinkSchedule({token,expectedLastTime:time}),{code:'SCHEDULE_IN_USE'});
 const data=await api.getPublicBoard();assert.notEqual(data.revision,rev);assert.equal(data.providers[0].slots.at(-1).confirmed,1);for(const privateValue of [row.id,input.itsCompany,input.contactName,input.phone,input.email,input.details,token])assert.ok(!JSON.stringify(data).includes(privateValue));
 await api.cancelRequest({id:row.id,email:row.email});await api.shrinkSchedule({token,expectedLastTime:time});assert.equal((await api.getPublicBoard()).times.length,4);assert.equal((await api.getAdminRequests(token)).find(r=>r.id===row.id).status,STATUS.CANCELLED);
});
