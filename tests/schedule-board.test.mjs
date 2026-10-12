import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './gas-harness.mjs';
import {createGasApi} from '../assets/js/gas-api.js';
import {API_VERSION} from '../assets/js/build-version.js';
const good=(h,a,i={},method='POST')=>h.value(h.call(a,i,method));
const last=h=>good(h,'getConfig',{},'GET').times.at(-1);
const extend=(h,token=h.adminToken())=>good(h,'extendSchedule',{token,expectedLastTime:last(h)});
const shrink=(h,token,expectedLastTime=last(h))=>h.call('shrinkSchedule',{token,expectedLastTime});
const board=h=>good(h,'getPublicBoard',{},'GET');
const revision=h=>good(h,'getPublicBoardRevision',{},'GET').revision;
const dbState=h=>JSON.stringify(['requests','capacities','history','providers'].map(t=>h.sheet(t).data));
const saved=h=>Object.fromEntries([...h.properties].filter(([k])=>k==='SHEET_ID'||k==='TOKEN_SIGNING_SECRET'||k==='ADMIN_ID'||k.endsWith('_HASH')));

test('shrink: base timetable, missing admin, wrong role, GET and old API version are rejected without DB writes',()=>{
 const h=createHarness(),token=h.adminToken(),provider=h.provider('deepx'),before=dbState(h),batches=h.counters.batches;
 assert.equal(shrink(h,token).error.code,'SCHEDULE_LIMIT');
 assert.equal(shrink(h,'bad').error.code,'UNAUTHORIZED');assert.equal(shrink(h,provider).error.code,'FORBIDDEN');
 assert.equal(h.call('shrinkSchedule',{token,expectedLastTime:last(h)},'GET').error.code,'METHOD_NOT_ALLOWED');
 const lockCount=h.counters.locks;assert.equal(h.call('shrinkSchedule',{token,apiVersion:'2026-10-v3.0'}).error.code,'API_VERSION_MISMATCH');assert.equal(h.counters.locks,lockCount);
 assert.equal(dbState(h),before);assert.equal(h.counters.batches,batches);
});

test('shrink: last slot only, four FALSE rows + four audit rows in one locked atomic batch; schemas and secrets stay intact',()=>{
 const h=createHarness(),token=h.adminToken();extend(h,token);const {time}=extend(h,token),schema=JSON.stringify(h.context.KN.schemas),secrets=saved(h);
 const oldRows=structuredClone(h.sheet('capacities').data),before={...h.counters},history=h.sheet('history').data.length;
 const oldRevisions=JSON.parse(h.properties.get('KNPU_REVISIONS_V1'));h.advance(1000);
 const result=h.value(shrink(h,token,time));assert.equal(result.removedTime,time);assert.equal(result.time,'16:30 – 16:40');
 assert.equal(h.sheet('capacities').data.length,oldRows.length);assert.equal(h.counters.locks-before.locks,1);assert.equal(h.counters.batchGets-before.batchGets,1);assert.equal(h.counters.batches-before.batches,1);
 h.sheet('capacities').data.forEach((row,i)=>{if(row[2]!==time)assert.deepEqual(row,oldRows[i]);else{assert.equal(row[4],false);assert.equal(row[3],oldRows[i][3]);assert.equal(row[6],'ITS Korea 관리자');assert.notEqual(row[5],oldRows[i][5]);}});
 const events=h.sheet('history').data.slice(history);assert.equal(events.length,4);assert.equal(new Set(events.map(e=>e[7])).size,4);assert.ok(events.every(e=>e[2]==='시간 연장 취소'&&e[3]==='admin'&&e[4]==='ITS Korea 관리자'&&e[8]===time));
 const next=JSON.parse(h.properties.get('KNPU_REVISIONS_V1'));for(const p of h.context.KN.providers){assert.notEqual(next.providers[p.id],oldRevisions.providers[p.id]);assert.notEqual(next.availability[p.id],oldRevisions.availability[p.id]);}assert.notEqual(next.admin,oldRevisions.admin);
 assert.equal(JSON.stringify(h.context.KN.schemas),schema);assert.deepEqual(saved(h),secrets);
 h.value(shrink(h,token));assert.equal(last(h),h.times.at(-1));assert.equal(shrink(h,token).error.code,'SCHEDULE_LIMIT');
});

for(const status of ['승인대기','매칭확정'])test('shrink blocks '+status+' even for another NPU company; zero writes/audit/revision changes',()=>{
 const h=createHarness(),token=h.adminToken(),{time}=extend(h,token),row=good(h,'submitRequest',h.form({providerId:'rebellions',time}));
 if(status==='매칭확정')good(h,'decideRequest',{token:h.provider('rebellions'),id:row.id,decision:status});
 const before=dbState(h),rev=JSON.stringify(JSON.parse(h.properties.get('KNPU_REVISIONS_V1'))),batches=h.counters.batches;
 const r=shrink(h,token);assert.equal(r.error.code,'SCHEDULE_IN_USE');assert.match(r.error.message,/진행 중인 상담 신청/);assert.equal(dbState(h),before);assert.equal(h.counters.batches,batches);assert.equal(h.properties.get('KNPU_REVISIONS_V1'),rev);
});

test('shrink preserves rejected/cancelled requests/history and re-extension reactivates the same physical capacity rows',()=>{
 const h=createHarness(),token=h.adminToken(),{time}=extend(h,token),p=h.provider('deepx');
 const a=good(h,'submitRequest',h.form({time,email:'rejected@example.com'})),b=good(h,'submitRequest',h.form({time,email:'cancelled@example.com'}));
 good(h,'decideRequest',{token:p,id:a.id,decision:'매칭거절',rejectionReason:'기존 기록 유지'});good(h,'cancelRequest',{id:b.id,email:b.email});
 const requests=JSON.stringify(h.sheet('requests').data),history=structuredClone(h.sheet('history').data),rows=h.sheet('capacities').data.length;
 h.value(shrink(h,token));assert.equal(JSON.stringify(h.sheet('requests').data),requests);assert.deepEqual(h.sheet('history').data.slice(0,history.length),history);
 const restored=extend(h,token);assert.equal(restored.time,time);assert.equal(h.sheet('capacities').data.length,rows);
 for(const p of h.context.KN.providers){const matches=h.sheet('capacities').data.filter(r=>r[0]===p.id&&r[2]===time);assert.equal(matches.length,1);assert.equal(matches[0][4],true);}
});

test('two admin tabs and a nested submit/extend/shrink cannot shorten twice or race the common lock',()=>{
 const h=createHarness(),a=h.adminToken(),b=h.adminToken();extend(h,a);const {time}=extend(h,a);let nested;
 h.beforeNextBatch(()=>{nested=[shrink(h,b,time),h.call('extendSchedule',{token:b,expectedLastTime:time}),h.call('submitRequest',h.form({time}))];});
 h.value(shrink(h,a,time));assert.ok(nested.every(r=>r.error.code==='BUSY'));assert.equal(last(h),'16:30 – 16:40');
 assert.equal(shrink(h,b,time).error.code,'SCHEDULE_CHANGED');assert.equal(last(h),'16:30 – 16:40');
 assert.equal(h.sheet('history').data.filter(r=>r[2]==='시간 연장 취소').length,4);
});

test('atomic shrink failure leaves all capacity/request/audit rows untouched and marks revision for bounded recovery',()=>{
 const h=createHarness(),token=h.adminToken();extend(h,token);const before=dbState(h);h.failNextBatch();
 assert.equal(shrink(h,token).error.code,'INTERNAL');assert.equal(dbState(h),before);assert.equal(h.call('getPublicBoardRevision',{},'GET').error.code,'REVISION_PENDING');
 assert.equal(board(h).revision,null);h.context.refreshPublicConfig();assert.ok(revision(h));assert.equal(board(h).times.length,5);
});

test('public board is an explicit PII-free aggregate; one batch reads exactly G/I/L plus headers/providers/capacities',()=>{
 const h=createHarness(),row=good(h,'submitRequest',h.form({itsCompany:'PRIVATE ITS',contactName:'PRIVATE CONTACT',phone:'010-1122-3344',email:'private-its@example.com',details:'PRIVATE DETAILS'}));
 good(h,'decideRequest',{token:h.provider('deepx'),id:row.id,decision:'매칭거절',rejectionReason:'PRIVATE REASON'});
 const before={...h.counters},raw=h.context.Sheets.Spreadsheets.Values.batchGet,ranges=[];
 h.context.Sheets.Spreadsheets.Values.batchGet=(id,o)=>{ranges.push(...o.ranges);return raw(id,o);};
 const data=board(h);assert.equal(h.counters.batchGets-before.batchGets,1);assert.equal(h.counters.rangeReads-before.rangeReads,0);assert.equal(h.counters.locks,before.locks);
 assert.deepEqual(ranges.filter(r=>r.startsWith("'상담신청'!")),["'상담신청'!A1:Q1","'상담신청'!G2:G","'상담신청'!I2:I","'상담신청'!L2:L"]);
 assert.deepEqual(Object.keys(data).sort(),['providers','revision','times']);assert.equal(data.providers.length,4);
 for(const p of data.providers){assert.deepEqual(Object.keys(p).sort(),['english','id','name','slots']);for(const s of p.slots)assert.deepEqual(Object.keys(s).sort(),['active','capacity','confirmed','remaining','time']);}
 const text=JSON.stringify(data);for(const privateValue of [row.id,row.itsCompany,row.contactName,row.phone,row.email,row.details,'PRIVATE REASON',h.properties.get('SHEET_ID'),h.properties.get('TOKEN_SIGNING_SECRET')])assert.ok(!text.includes(privateValue));
 assert.doesNotMatch(text,/requestId|contactName|rejectionReason|approvalCode|password|token|itsCompany/);
});

test('public board revision is property-only, <=300 bytes, and unchanged pending applications read zero Sheets',()=>{
 const h=createHarness(),first=revision(h);good(h,'submitRequest',h.form());assert.equal(revision(h),first);
 const before={...h.counters};for(let i=0;i<100;i++)assert.equal(revision(h),first);
 for(const k of ['batchGets','rangeReads','headerReads','opens','locks'])assert.equal(h.counters[k],before[k]);
 assert.ok(Buffer.byteLength(JSON.stringify(h.call('getPublicBoardRevision',{},'GET')))<300);
 extend(h);assert.equal(revision(h).length,147);assert.ok(Buffer.byteLength(JSON.stringify(h.call('getPublicBoardRevision',{},'GET')))<300);
});

test('approval, confirmed cancellation, capacity, extension and shrink change board revision and correct aggregate counts',()=>{
 const h=createHarness(),p=h.provider('deepx'),admin=h.adminToken();let v=revision(h);
 const row=good(h,'submitRequest',h.form());assert.equal(revision(h),v);assert.equal(board(h).providers[0].slots[0].confirmed,0);
 good(h,'decideRequest',{token:p,id:row.id,decision:'매칭확정'});assert.notEqual(revision(h),v);v=revision(h);assert.equal(board(h).providers[0].slots[0].confirmed,1);
 good(h,'cancelRequest',{id:row.id,email:row.email});assert.notEqual(revision(h),v);v=revision(h);assert.equal(board(h).providers[0].slots[0].remaining,2);
 good(h,'updateProviderCapacity',{token:p,time:h.time,capacity:0});assert.notEqual(revision(h),v);v=revision(h);assert.equal(board(h).providers[0].slots[0].remaining,0);
 extend(h,admin);assert.notEqual(revision(h),v);v=revision(h);assert.equal(board(h).times.length,5);
 h.value(shrink(h,admin));assert.notEqual(revision(h),v);assert.equal(board(h).times.length,4);
});

test('a board snapshot concurrent with a write retains the earlier revision and next probe discovers the write',()=>{
 const h=createHarness(),p=h.provider('deepx'),beforeRevision=revision(h),raw=h.context.Sheets.Spreadsheets.Values.batchGet;let once=true;
 h.context.Sheets.Spreadsheets.Values.batchGet=(id,o)=>{const response=raw(id,o);if(once){once=false;good(h,'updateProviderCapacity',{token:p,time:h.time,capacity:1});}return response;};
 const data=board(h);assert.equal(data.revision,beforeRevision);assert.equal(data.providers[0].slots[0].capacity,2);assert.notEqual(revision(h),data.revision);assert.equal(board(h).providers[0].slots[0].capacity,1);
});

test('public board always honors API_VERSION and closed/inactive provider slots are not offered',()=>{
 const h=createHarness();h.sheet('providers').data[1][3]=false;const data=board(h);assert.ok(data.providers[0].slots.every(s=>s.active===false&&s.remaining===0));
 for(const action of ['getPublicBoard','getPublicBoardRevision']){const before=h.counters.batchGets;assert.equal(h.call(action,{apiVersion:'old'},'GET').error.code,'API_VERSION_MISMATCH');assert.equal(h.counters.batchGets,before);assert.equal(h.call(action,{},'GET').meta.apiVersion,API_VERSION);}
});

test('adapter board GETs have version only; shrink is a sanitized admin POST and clears cached config after success/lost reply',async()=>{
 const h=createHarness(),calls=[];let lost=false;
 const api=createGasApi({url:'https://script.google.com/macros/s/test/exec',fetchImpl:async(u,o)=>{calls.push({u,o});if(lost&&JSON.parse(o.body||'{}').action==='shrinkSchedule')throw Error('lost response');return h.fetch(u,o);}});
 await api.getPublicBoard({token:'must-not-send'});await api.getPublicBoardRevision({token:'must-not-send'});
 for(const c of calls){assert.equal(c.o.method,'GET');assert.deepEqual([...new URL(c.u).searchParams.keys()].sort(),['action','apiVersion']);assert.equal(c.o.body,undefined);}
 const token=h.adminToken();extend(h,token);await api.getConfig();await api.shrinkSchedule({token,expectedLastTime:last(h),forged:'ignored'});
 assert.deepEqual(Object.keys(JSON.parse(calls.at(-1).o.body)).sort(),['action','apiVersion','expectedLastTime','token']);assert.equal(calls.at(-1).o.headers['Content-Type'],'text/plain;charset=utf-8');assert.equal(new URL(calls.at(-1).u).search,'');assert.equal((await api.getConfig()).times.length,4);
 lost=true;const count=calls.length;await assert.rejects(api.shrinkSchedule({token,expectedLastTime:h.times.at(-1)}),e=>e.code==='NETWORK_FETCH_FAILED'&&e.uncertain);assert.equal(calls.length,count+1);await api.getConfig();assert.equal(calls.at(-1).o.method,'GET');
});

test('public board safe reads retry once after a transient failure',async()=>{
 for(const method of ['getPublicBoard','getPublicBoardRevision']){let calls=0;const h=createHarness(),api=createGasApi({url:'https://script.google.com/macros/s/test/exec',backoff:async()=>{},fetchImpl:async(u,o)=>{if(++calls===1)throw Error('transient');return h.fetch(u,o);}});await api[method]();assert.equal(calls,2);}
});
