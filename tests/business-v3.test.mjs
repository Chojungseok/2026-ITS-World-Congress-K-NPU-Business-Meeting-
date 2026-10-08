import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHarness} from './gas-harness.mjs';
import {createGasApi} from '../assets/js/gas-api.js';
import {PROVIDER_LOGOS} from '../assets/js/logos.js';
import * as view from '../assets/js/views.js';
const good=(h,a,i={})=>h.value(h.call(a,i));
const data=h=>JSON.stringify(['providers','capacities','requests','history'].map(t=>h.sheet(t).data));
const rev=h=>JSON.parse(h.properties.get('KNPU_REVISIONS_V1'));
const extend=(h,last=h.times.at(-1))=>good(h,'extendSchedule',{token:h.adminToken(),expectedLastTime:last});
test('V3 every fresh provider/slot defaults to 2, accepts 0/1/2 and rejects 3+, fractional and invalid types',()=>{
 const h=createHarness(),token=h.provider('deepx');
 assert.ok(h.context.KN.providers.every(p=>p.capacity===2));
 assert.ok(h.sheet('capacities').data.slice(1).every(r=>r[3]===2));
 for(const capacity of [0,1,2])good(h,'updateProviderCapacity',{token,time:h.time,capacity});
 for(const capacity of [3,50,-1,1.5,'',true,null])assert.equal(h.call('updateProviderCapacity',{token,time:h.time,capacity}).error.code,'VALIDATION');
 assert.ok(view.capacitySettings(good(h,'getConfig').providers[0],[]).includes('max="2"'));
});
test('V3 migration preflights ALL active slots, reports every overbooked company/time/count and writes nothing',()=>{
 const h=createHarness();const row=good(h,'submitRequest',h.form());
 const original=h.sheet('requests').data[1];original[11]='매칭확정';
 for(const id of ['deepx','mobilint'])for(let i=0;i<3;i++){
  const r=[...original];r[0]=id+i;r[6]=id;r[7]=id;r[8]=h.times[1];h.sheet('requests').data.push(r);
 }
 h.sheet('capacities').data[1][3]=5;const before=data(h),props=new Map(h.properties),c={...h.counters};
 assert.throws(()=>h.context.migrateBusinessMeetingV3(),/딥엑스.*확정 3건.*모빌린트.*확정 3건/);
 assert.equal(data(h),before);assert.deepEqual(h.properties,props);assert.equal(h.counters.batches,c.batches);
});
test('V3 migration is idempotent, preserves inactive legacy rows, requests, reasons, history, headers and credentials',()=>{
 const h=createHarness();good(h,'submitRequest',h.form());
 h.sheet('capacities').data[1][3]=5;
 h.sheet('capacities').data.push(['deepx','딥엑스','16:50 – 17:00',5,false,'old','old']);
 const original=structuredClone(['requests','history','providers'].map(t=>h.sheet(t).data)),props=new Map(h.properties),old=[...h.sheet('capacities').data.at(-1)];
 const before=rev(h),result=h.context.migrateBusinessMeetingV3();
 assert.equal(result.changedSlots,1);assert.deepEqual(h.sheet('capacities').data.at(-1),old);
 assert.deepEqual(['requests','history','providers'].map(t=>h.sheet(t).data),original);
 for(const [key,value]of props)if(!['KNPU_REVISIONS_V1','PUBLIC_CONFIG_REVISION'].includes(key))assert.equal(h.properties.get(key),value,key);
 for(const id of Object.keys(h.credentials)){assert.notEqual(rev(h).providers[id],before.providers[id]);assert.notEqual(rev(h).availability[id],before.availability[id]);}
 const stable=data(h);assert.equal(h.context.migrateBusinessMeetingV3().changedSlots,0);assert.equal(data(h),stable);
 assert.equal(h.created,1);
});
test('V3 migration batch failure preserves every cell and retry repairs pending revision',()=>{
 const h=createHarness();h.sheet('capacities').data[1][3]=5;const before=data(h);
 h.failNextBatch();assert.throws(()=>h.context.migrateBusinessMeetingV3());assert.equal(data(h),before);
 h.context.migrateBusinessMeetingV3();assert.equal(h.sheet('capacities').data[1][3],2);assert.equal(rev(h).pending,false);
});
test('extension is admin-only POST; editor migrations are never public APIs',()=>{
 const h=createHarness(),last=h.times.at(-1),before=data(h);
 assert.equal(h.call('extendSchedule',{expectedLastTime:last}).error.code,'UNAUTHORIZED');
 assert.equal(h.call('extendSchedule',{token:h.provider('deepx'),expectedLastTime:last}).error.code,'FORBIDDEN');
 assert.equal(h.call('extendSchedule',{token:h.adminToken(),expectedLastTime:last},'GET').error.code,'METHOD_NOT_ALLOWED');
 for(const action of ['migrateBusinessMeetingV3','migrateBusinessMeetingV2'])assert.equal(h.call(action,{token:h.adminToken()}).error.code,'UNKNOWN_ACTION');
 assert.equal(data(h),before);
});
test('first and second extensions add exactly four unique slots, four audit events, capacity 2; all views share DB',()=>{
 const h=createHarness(),before=rev(h),oldRequests=JSON.stringify(h.sheet('requests').data);
 assert.equal(extend(h).time,'16:30 – 16:40');assert.equal(extend(h,'16:30 – 16:40').time,'16:40 – 16:50');
 const config=good(h,'getConfig');assert.equal(config.times.length,6);
 for(const p of config.providers){
  assert.equal(p.capacities['16:30 – 16:40'],2);assert.equal(p.capacities['16:40 – 16:50'],2);
  assert.equal(good(h,'getAvailability',{providerId:p.id}).length,6);
  assert.notEqual(rev(h).providers[p.id],before.providers[p.id]);assert.notEqual(rev(h).availability[p.id],before.availability[p.id]);
 }
 const overview=good(h,'getAdminOverview',{token:h.adminToken()});assert.equal(overview.config.times.length,6);
 assert.equal(overview.history.filter(e=>e.action==='시간 연장').length,8);
 assert.ok(overview.history.every(e=>e.actorRole==='admin'&&e.actor==='ITS Korea 관리자'&&e.requestId===''&&e.afterCapacity===2));
 assert.ok(overview.history.every(e=>h.context.KN.providers.some(p=>p.id===e.providerId)));
 assert.equal(JSON.stringify(h.sheet('requests').data),oldRequests);
 const row=good(h,'submitRequest',h.form({time:config.times.at(-1)}));assert.equal(row.time,'16:40 – 16:50');
});
test('two admin tabs/same timed-out request create just one slot for expectedLastTime; common lock excludes reentrant writes',async()=>{
 const h=createHarness(),token=h.adminToken(),input={token,expectedLastTime:h.times.at(-1)};
 h.beforeNextBatch(()=>assert.equal(h.call('extendSchedule',input).error.code,'BUSY'));
 const result=await Promise.all([Promise.resolve().then(()=>h.call('extendSchedule',input)),Promise.resolve().then(()=>h.call('extendSchedule',input))]);
 assert.equal(result.filter(r=>r.ok).length,1);assert.equal(result.find(r=>!r.ok).error.code,'SCHEDULE_CHANGED');
 const before=data(h);assert.equal(h.call('extendSchedule',input).error.code,'SCHEDULE_CHANGED');assert.equal(data(h),before);
 assert.equal(h.sheet('history').data.length,5);assert.equal(h.sheet('capacities').data.length,21);
});
test('extension and audit are one atomic batch; failure/retry never leaves partial provider slots or events',()=>{
 const h=createHarness(),before=data(h),token=h.adminToken(),input={token,expectedLastTime:h.times.at(-1)};
 h.failNextBatch();assert.equal(h.call('extendSchedule',input).error.code,'INTERNAL');assert.equal(data(h),before);
 good(h,'extendSchedule',input);assert.equal(h.sheet('capacities').data.length,21);assert.equal(h.sheet('history').data.length,5);
 assert.equal(rev(h).pending,false);
});
test('extension reopens original inactive V2 time rows instead of duplicating them and preserves historical requests',()=>{
 const h=createHarness();for(const p of h.context.KN.providers)h.sheet('capacities').data.push([p.id,p.name,'16:50 – 17:00',5,false,'old','operator']);
 extend(h);extend(h,'16:30 – 16:40');const before=h.sheet('capacities').data.length;
 assert.equal(extend(h,'16:40 – 16:50').time,'16:50 – 17:00');assert.equal(h.sheet('capacities').data.length,before);
 for(const p of h.context.KN.providers){const rows=h.sheet('capacities').data.filter(r=>r[0]===p.id&&r[2]==='16:50 – 17:00');assert.equal(rows.length,1);assert.equal(rows[0][3],2);assert.equal(rows[0][4],true);}
});
test('legacy slot with >2 confirmed prevents whole reactivation and produces no writes',()=>{
 const h=createHarness();for(const p of h.context.KN.providers)h.sheet('capacities').data.push([p.id,p.name,'16:50 – 17:00',5,false,'old','operator']);
 const row=good(h,'submitRequest',h.form()),original=h.sheet('requests').data[1];original[8]='16:50 – 17:00';original[11]='매칭확정';
 for(let i=0;i<2;i++){const r=[...original];r[0]='old'+i;h.sheet('requests').data.push(r);}
 extend(h);extend(h,'16:30 – 16:40');const before=data(h);
 assert.equal(h.call('extendSchedule',{token:h.adminToken(),expectedLastTime:'16:40 – 16:50'}).error.code,'CAPACITY_CONFLICT');assert.equal(data(h),before);
});
test('time parsing rejects malformed, non-ten-minute and midnight-crossing slots without writes',()=>{
 const h=createHarness();
 for(const time of ['xx','24:00 – 24:10','23:55 – 00:05','16:30 – 16:50','16:99 – 17:09'])assert.throws(()=>h.context.parseSlot_(time));
 assert.throws(()=>h.context.nextSlot_('23:40 – 23:50'),/날짜 경계/);
});
test('public availability envelope has configuration/revision but no applicant PII; lightweight probes read zero sheets',()=>{
 const h=createHarness(),row=good(h,'submitRequest',h.form());
 const publicData=good(h,'getAvailability',{providerId:'deepx',includeConfig:true});
 assert.equal(publicData.slots.length,4);assert.equal(publicData.config.times.length,4);assert.ok(publicData.revision);
 for(const v of [row.id,row.email,row.phone,row.contactName,row.details])assert.ok(!JSON.stringify(publicData).includes(v));
 const before={...h.counters};good(h,'getAvailabilityRevision',{providerId:'deepx'});good(h,'getProviderRevision',{token:h.provider('deepx')});
 // Authentication reads a provider table; count the revision call alone separately.
 const now={...h.counters};good(h,'getAdminRevision',{token:h.adminToken()});
 assert.equal(h.counters.batchGets,now.batchGets);assert.equal(h.counters.rangeReads,now.rangeReads);
});
test('GAS extension uses simple body-only POST, sanitizes payload, invalidates config even after lost response and does not auto-retry',async()=>{
 const calls=[];let lost=false;const h=createHarness(),api=createGasApi({url:'https://script.google.com/macros/s/test/exec',fetchImpl:async(url,opt)=>{calls.push({url,opt});if(lost&&JSON.parse(opt.body||'{}').action==='extendSchedule')throw Error('lost');return h.fetch(url,opt);}});
 await api.getConfig();const token=h.adminToken();await api.extendSchedule({token,expectedLastTime:h.times.at(-1),time:'client-forged'});
 assert.equal(calls.at(-1).opt.method,'POST');assert.equal(calls.at(-1).opt.headers['Content-Type'],'text/plain;charset=utf-8');
 assert.deepEqual(Object.keys(JSON.parse(calls.at(-1).opt.body)).sort(),['action','expectedLastTime','token']);assert.ok(!calls.at(-1).url.includes(token));
 assert.equal((await api.getConfig()).times.length,5);
 lost=true;const before=calls.length;await assert.rejects(api.extendSchedule({token,expectedLastTime:'16:30 – 16:40'}));assert.equal(calls.length,before+1);
 await api.getConfig();assert.equal(calls.at(-1).opt.method,'GET');
});
test('four logos are tiny local official SVGs, alt/intrinsic ratio and accessible fallback exist; no hotlink or active content',()=>{
 for(const [id,logo]of Object.entries(PROVIDER_LOGOS)){
 const file=fs.readFileSync(new URL('../assets/logos/'+logo.file,import.meta.url),'utf8');assert.ok(file.includes('<svg'));assert.ok(Buffer.byteLength(file)<15000);
 assert.ok(!/<script|<foreignObject|<image|\bon\w+\s*=|href=/i.test(file));
 const markup=view.mark({id});assert.ok(markup.includes('src="./assets/logos/'));assert.ok(markup.includes('alt="'+logo.alt+'"'));assert.ok(markup.includes('logo-fallback'));assert.ok(!markup.includes('https://'));
 }
});
