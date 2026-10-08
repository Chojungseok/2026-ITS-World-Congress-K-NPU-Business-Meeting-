import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../assets/js/mock-api.js';
import {TIMES,PREVIOUS_TIMES,STORAGE_KEY,STATUS} from '../assets/js/config.js';
const memory=new Map();
Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
Object.defineProperty(globalThis,'localStorage',{value:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v))},configurable:true});
beforeEach(async()=>{memory.clear();await api.resetDemo();});
const form=overrides=>({itsCompany:'찾기 기업',contactName:'담당자',phone:'010-1234-5678',email:'find@example.com',
 providerId:'deepx',time:TIMES[3],attendees:1,details:'상담',consent:true,privacyConsent:true,...overrides});
test('mock upgrades old slot capacities while preserving previous requests/history and returns only new times',async()=>{
 const row=await api.submitRequest(form()),stored=JSON.parse(memory.get(STORAGE_KEY));
 stored.requests.find(r=>r.id===row.id).time=PREVIOUS_TIMES[0];
 for(const p of Object.keys(stored.slotCapacities))stored.slotCapacities[p]=Object.fromEntries(PREVIOUS_TIMES.map(t=>[t,7]));
 stored.history.push({id:'OLD-CAP',occurredAt:new Date().toISOString(),action:'정원 변경',actor:'local',providerId:'deepx',requestId:null,time:PREVIOUS_TIMES[0],beforeCapacity:5,afterCapacity:7});
 memory.set(STORAGE_KEY,JSON.stringify(stored));
 assert.equal((await api.findRequest({id:row.id,email:row.email})).time,PREVIOUS_TIMES[0]);
 const config=await api.getConfig();assert.deepEqual(config.times,TIMES);assert.deepEqual(Object.keys(config.providers[0].capacities),TIMES);
 const upgraded=JSON.parse(memory.get(STORAGE_KEY));assert.deepEqual(upgraded.requests,stored.requests);assert.deepEqual(upgraded.history,stored.history);
 assert.equal(upgraded.slotCapacities.deepx[PREVIOUS_TIMES[0]],7);
 assert.equal(upgraded.slotCapacities.deepx[TIMES[0]],2);
 for(const time of PREVIOUS_TIMES)await assert.rejects(api.submitRequest(form({time})));
});
test('mock ID finder returns multiple minimal results newest first without writing input or audit',async()=>{
 const first=await api.submitRequest(form()),second=await api.submitRequest(form({providerId:'mobilint'}));
 const stored=JSON.parse(memory.get(STORAGE_KEY));stored.requests.find(r=>r.id===first.id).createdAt='2026-01-01T00:00:00Z';
 memory.set(STORAGE_KEY,JSON.stringify(stored));const before=memory.get(STORAGE_KEY);
 const input={itsCompany:' 찾기 기업 ',contactName:' 담당자 ',phone:'010 (1234) 5678',email:' FIND@EXAMPLE.COM '};
 const results=await api.findRequestIds(input);assert.deepEqual(results.map(r=>r.id),[second.id,first.id]);
 assert.deepEqual(Object.keys(results[0]).sort(),['createdAt','id','providerName','status','time']);
 assert.equal(memory.get(STORAGE_KEY),before);
 for(const key of Object.keys(input))await assert.rejects(api.findRequestIds({...input,[key]:'wrong'}),{code:'NOT_FOUND'});
});
test('mock finder counts successes as well as failures and limits repeated lookups',async()=>{
 await api.submitRequest(form());const input=form();for(let i=0;i<10;i++)await api.findRequestIds(input);
 await assert.rejects(api.findRequestIds(input),{code:'RATE_LIMITED'});
});
test('mock requires rejection reason, trims and stores it; approval reason is empty',async()=>{
 const token=await api.authenticateProvider({providerId:'deepx',approvalCode:'deepx20261022'}),row=await api.submitRequest(form());
 for(const rejectionReason of [undefined,' ','x'.repeat(501)])await assert.rejects(api.decideRequest({token,id:row.id,decision:STATUS.REJECTED,rejectionReason}),/거절 사유/);
 const rejected=await api.decideRequest({token,id:row.id,decision:STATUS.REJECTED,rejectionReason:'  로컬 사유  '});
 assert.equal(rejected.rejectionReason,'로컬 사유');
 assert.equal((await api.findRequest({id:row.id,email:row.email})).rejectionReason,'로컬 사유');
 const next=await api.submitRequest(form({email:'next@example.com'}));
 assert.equal((await api.decideRequest({token,id:next.id,decision:STATUS.CONFIRMED,rejectionReason:'ignore'})).rejectionReason,'');
});
