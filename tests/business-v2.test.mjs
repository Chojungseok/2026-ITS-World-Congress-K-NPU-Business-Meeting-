import {test} from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHarness} from './gas-harness.mjs';
import {createGasApi} from '../assets/js/gas-api.js';
import * as view from '../assets/js/views.js';
import {BROCHURES} from '../assets/js/brochures.js';
const times=['15:50 – 16:00','16:00 – 16:10','16:10 – 16:20','16:20 – 16:30'];
const previous=['16:50 – 17:00','17:00 – 17:10','17:10 – 17:20','17:20 – 17:30'];
const good=(h,action,input={})=>h.value(h.call(action,input));
const identity=row=>({itsCompany:row.itsCompany,contactName:row.contactName,phone:row.phone,email:row.email});
const revision=h=>h.properties.get('KNPU_REVISIONS_V1');
function oldDb(h) {
  h.sheet('requests').data.forEach(row=>row.splice(16));
  h.sheet('requests').maxColumns=16;
  h.sheet('capacities').data.slice(1).forEach(row=>{row[2]=previous[times.indexOf(row[2])];});
  h.sheet('requests').data.slice(1).forEach(row=>{row[8]=previous[times.indexOf(row[8])];});
  h.sheet('history').data.slice(1).forEach(row=>{row[8]=previous[times.indexOf(row[8])];});
}
test('V2 new setup creates Q rejection reason and exactly four new operating times',()=>{
  const h=createHarness();
  assert.deepEqual(h.times,times);
  assert.equal(h.sheet('requests').data[0][15],'최종수정일시');
  assert.equal(h.sheet('requests').data[0][16],'거절사유');
  assert.equal(h.sheet('requests').data[0].length,17);
  const config=good(h,'getConfig');
  assert.deepEqual(config.times,times);
  // Sheet row order must not change the chronological application choices.
  h.sheet('capacities').data=[h.sheet('capacities').data[0],...h.sheet('capacities').data.slice(1).reverse()];
  for(const p of config.providers){
    assert.deepEqual(Object.keys(p.capacities),times);
    assert.deepEqual(good(h,'getAvailability',{providerId:p.id}).map(s=>s.time),times);
  }
  for(const time of previous)assert.equal(h.call('submitRequest',h.form({time})).error.code,'VALIDATION');
});
test('migration appends Q1 only, disables old slots and adds 16 independent defaults without losing records/auth',()=>{
  const h=createHarness(),token=h.provider('deepx'),row=good(h,'submitRequest',h.form());
  good(h,'decideRequest',{token,id:row.id,decision:'매칭확정'});
  oldDb(h);
  h.sheet('capacities').data[1][3]=9;
  const requests=structuredClone(h.sheet('requests').data.slice(1)),history=structuredClone(h.sheet('history').data);
  const properties=new Map(h.properties);
  const before=revision(h);
  const result=h.context.migrateBusinessMeetingV2();
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{headerAdded:true,oldSlotsClosed:16,newSlotsAdded:16});
  assert.equal(h.created,1);assert.equal(h.sheet('requests').maxColumns,17);
  assert.deepEqual(h.sheet('requests').data.slice(1),requests);
  assert.deepEqual(h.sheet('history').data,history);
  assert.equal(h.sheet('requests').data[0][16],'거절사유');
  const slots=h.sheet('capacities').data.slice(1);
  assert.equal(slots.filter(r=>previous.includes(r[2])&&r[4]===false).length,16);
  assert.equal(slots[0][3],9);
  for(const p of h.context.KN.providers)for(const time of times){
    const matches=slots.filter(r=>r[0]===p.id&&r[2]===time);
    assert.equal(matches.length,1);assert.equal(matches[0][3],p.capacity);assert.equal(matches[0][4],true);
  }
  for(const [key,value]of properties)if(!['KNPU_REVISIONS_V1','PUBLIC_CONFIG_REVISION'].includes(key))
    assert.equal(h.properties.get(key),value,key);
  assert.notEqual(revision(h),before);
  assert.deepEqual(good(h,'getConfig').times,times);
  assert.deepEqual(good(h,'getAvailability',{providerId:'deepx'}).map(s=>s.time),times);
  const legacy=good(h,'findRequest',{id:row.id,email:row.email});
  assert.equal(legacy.time,previous[0]);assert.equal(legacy.rejectionReason,'');
  assert.equal(good(h,'getProviderRequests',{token})[0].time,previous[0]);
  assert.equal(good(h,'getAdminOverview',{token:h.adminToken()}).history[0].time,previous[0]);
  const stable=structuredClone(['requests','history','capacities','providers'].map(t=>h.sheet(t).data));
  h.context.migrateBusinessMeetingV2();h.context.setupSystem();
  assert.deepEqual(['requests','history','capacities','providers'].map(t=>h.sheet(t).data),stable);
  good(h,'cancelRequest',{id:row.id,email:row.email});
  assert.equal(good(h,'findRequest',{id:row.id,email:row.email}).status,'신청취소');
});
test('migration retains existing new custom/disabled slots and refuses duplicates before any data writes',()=>{
  const h=createHarness();oldDb(h);
  h.sheet('capacities').data.push(['deepx','딥엑스',times[0],11,false,'original','operator']);
  h.context.migrateBusinessMeetingV2();
  const existing=h.sheet('capacities').data.filter(r=>r[0]==='deepx'&&r[2]===times[0]);
  assert.equal(existing.length,1);assert.deepEqual(existing[0],['deepx','딥엑스',times[0],11,false,'original','operator']);
  const bad=createHarness();oldDb(bad);bad.sheet('capacities').data.push([...bad.sheet('capacities').data[1]]);
  const before=structuredClone(['requests','capacities'].map(t=>bad.sheet(t).data));
  assert.throws(()=>bad.context.migrateBusinessMeetingV2(),/중복/);
  assert.deepEqual(['requests','capacities'].map(t=>bad.sheet(t).data),before);
});
test('migration rejects unknown/reordered headers without overwriting data',()=>{
  for(const damage of [h=>h.sheet('requests').data[0][2]='unknown',h=>h.sheet('requests').data[0].push('other'),
    h=>h.sheet('requests').data.push(Array(16).fill('').concat('unlabelled'))]){
    const h=createHarness();oldDb(h);damage(h);
    const before=structuredClone(['requests','capacities'].map(t=>h.sheet(t).data));
    assert.throws(()=>h.context.migrateBusinessMeetingV2(),/열 순서/);
    assert.deepEqual(['requests','capacities'].map(t=>h.sheet(t).data),before);
  }
});
test('migration is atomic under the common lock and safe to retry after a failed batch',()=>{
  const h=createHarness();oldDb(h);
  const before=structuredClone(['requests','capacities','history'].map(t=>h.sheet(t).data));
  h.beforeNextBatch(()=>{
    assert.equal(h.locked,true);
    assert.deepEqual(['requests','capacities','history'].map(t=>h.sheet(t).data),before);
    assert.equal(h.call('submitRequest',h.form()).error.code,'BUSY');
  });
  h.failNextBatch();assert.throws(()=>h.context.migrateBusinessMeetingV2());
  assert.deepEqual(['requests','capacities','history'].map(t=>h.sheet(t).data),before);
  h.context.migrateBusinessMeetingV2();
  assert.equal(h.sheet('requests').data[0][16],'거절사유');
  assert.equal(h.sheet('capacities').data.length,33);
  assert.equal(JSON.parse(revision(h)).pending,false);
  assert.equal(h.call('migrateBusinessMeetingV2').error.code,'UNKNOWN_ACTION');
});
test('retry of an already committed migration repairs unpublished revisions without duplicate rows',()=>{
  const h=createHarness();oldDb(h);
  const props=h.context.props_(),set=props.setProperty;
  props.setProperty=(key,value)=>{
    if(key==='KNPU_REVISIONS_V1'&&!JSON.parse(value).pending)throw Error('publication outage');
    return set(key,value);
  };
  assert.throws(()=>h.context.migrateBusinessMeetingV2());
  assert.equal(h.sheet('capacities').data.length,33);assert.equal(JSON.parse(revision(h)).pending,true);
  props.setProperty=set;h.context.migrateBusinessMeetingV2();
  assert.equal(h.sheet('capacities').data.length,33);assert.equal(JSON.parse(revision(h)).pending,false);
});
test('ID finder matches all four normalized fields, returns multiple minimal results newest first; no audit/revision/properties writes',()=>{
  const h=createHarness();
  const first=good(h,'submitRequest',h.form({phone:'010 (1234) 5678'}));
  h.advance(1000);const second=good(h,'submitRequest',h.form({providerId:'mobilint',phone:'010-1234-5678'}));
  const beforeProps=new Map(h.properties),history=structuredClone(h.sheet('history').data),before=revision(h);
  const input={itsCompany:' '+first.itsCompany+' ',contactName:' '+first.contactName+' ',phone:'01012345678',email:' TEST@EXAMPLE.COM '};
  const results=good(h,'findRequestIds',input);
  assert.deepEqual(results.map(r=>r.id),[second.id,first.id]);
  for(const result of results)assert.deepEqual(Object.keys(result).sort(),['createdAt','id','providerName','status','time']);
  assert.deepEqual(new Map(h.properties),beforeProps);assert.equal(revision(h),before);assert.deepEqual(h.sheet('history').data,history);
  assert.equal(h.call('findRequestIds',input,'GET').error.code,'METHOD_NOT_ALLOWED');
  assert.equal(h.call('findRequest',{id:first.id}).error.code,'NOT_FOUND');
});
test('ID finder uses the same NOT_FOUND response for any mismatch or missing field',()=>{
  const h=createHarness(),row=good(h,'submitRequest',h.form()),input=identity(row);
  let common;
  for(const [key,value]of Object.entries({itsCompany:'틀린 기업',contactName:'틀린 담당',phone:'01099999999',email:'wrong@example.com'})){
    const result=h.call('findRequestIds',{...input,[key]:value});
    assert.equal(result.ok,false);assert.equal(result.error.code,'NOT_FOUND');
    common??=result.error.message;assert.equal(result.error.message,common);
  }
  for(const key of Object.keys(input)){
    const missing={...input};delete missing[key];assert.equal(h.call('findRequestIds',missing).error.message,common);
  }
});
test('ID finder throttles successes and failures per normalized email, even if other fields change; resets after 15 minutes',()=>{
  const h=createHarness(),row=good(h,'submitRequest',h.form()),input=identity(row);
  for(let i=0;i<10;i++)assert.equal(h.call('findRequestIds',{...input,itsCompany:i%2?'wrong':input.itsCompany}).ok,i%2===0);
  assert.equal(h.call('findRequestIds',{...input,email:' TEST@EXAMPLE.COM '}).error.code,'RATE_LIMITED');
  h.advance(900001);assert.equal(good(h,'findRequestIds',input)[0].id,row.id);
});
test('rejection requires trimmed 1–500 chars, atomic reason/state/audit, provider+admin revision only',()=>{
  const h=createHarness(),token=h.provider('deepx'),row=good(h,'submitRequest',h.form()),before=JSON.parse(revision(h));
  const history=structuredClone(h.sheet('history').data);
  for(const rejectionReason of [undefined,'','  ','x'.repeat(501),123]){
    assert.equal(h.call('decideRequest',{token,id:row.id,decision:'매칭거절',rejectionReason}).error.code,'VALIDATION');
    assert.deepEqual(JSON.parse(revision(h)),before);assert.deepEqual(h.sheet('history').data,history);
  }
  const rejected=good(h,'decideRequest',{token,id:row.id,decision:'매칭거절',rejectionReason:'  =입력된 사유\n추가 안내  '});
  assert.equal(rejected.status,'매칭거절');assert.equal(rejected.rejectionReason,'=입력된 사유\n추가 안내');
  assert.equal(h.sheet('requests').data[1][16],rejected.rejectionReason);
  assert.equal(h.sheet('requests').data[1][15],rejected.updatedAt);
  const after=JSON.parse(revision(h));
  assert.notEqual(after.providers.deepx,before.providers.deepx);assert.notEqual(after.admin,before.admin);
  assert.deepEqual(after.availability,before.availability);
  assert.equal(good(h,'findRequest',{id:row.id,email:row.email}).rejectionReason,rejected.rejectionReason);
  const overview=good(h,'getAdminOverview',{token:h.adminToken()});
  assert.equal(overview.history[0].action,'거절');assert.equal(h.sheet('history').data[0].length,13);
  const same=revision(h);good(h,'decideRequest',{token,id:row.id,decision:'매칭거절',rejectionReason:'same retry'});
  assert.equal(revision(h),same);
});
test('approval ignores client reason; failed rejection and other-provider tokens cannot save reason',()=>{
  const h=createHarness(),row=good(h,'submitRequest',h.form()),token=h.provider('deepx');
  assert.equal(h.call('decideRequest',{token:h.provider('mobilint'),id:row.id,decision:'매칭거절',rejectionReason:'attack'}).error.code,'NOT_FOUND');
  h.failNextBatch();assert.equal(h.call('decideRequest',{token,id:row.id,decision:'매칭거절',rejectionReason:'fail'}).error.code,'INTERNAL');
  assert.equal(good(h,'findRequest',{id:row.id,email:row.email}).rejectionReason,'');
  const approved=good(h,'decideRequest',{token,id:row.id,decision:'매칭확정',rejectionReason:'ignore'});
  assert.equal(approved.rejectionReason,'');
});
test('legacy rejection is empty and all detail views escape reasons and show only rejected nonempty reasons',()=>{
  const h=createHarness(),row=good(h,'submitRequest',h.form());
  h.sheet('requests').data[1][11]='매칭거절';h.sheet('requests').data[1].splice(16);
  const legacy=good(h,'findRequest',{id:row.id,email:row.email});
  assert.equal(legacy.rejectionReason,'');assert.ok(!view.requestDetail(legacy).includes('rejection-reason'));
  for(const status of ['승인대기','매칭확정','신청취소'])assert.ok(!view.requestDetail({...row,status,rejectionReason:'hidden'}).includes('rejection-reason'));
  const rendered=view.requestDetail({...row,status:'매칭거절',rejectionReason:'<img src=x onerror=alert(1)>'});
  assert.ok(rendered.includes('거절 사유'));assert.ok(rendered.includes('&lt;img'));assert.ok(!rendered.includes('<img'));
});
test('adapter ID finder and rejection send body-only POST, never query PII or persist it',async()=>{
  const h=createHarness(),sent=[];
  const api=createGasApi({url:'https://script.google.com/macros/s/test/exec',fetchImpl:async(url,options)=>{sent.push({url,options});return h.fetch(url,options);}});
  const row=await api.submitRequest(h.form()),input=identity(row);
  const results=await api.findRequestIds({...input,token:'unneeded',extra:'not forwarded'});
  assert.equal(results[0].id,row.id);
  const call=sent.at(-1);assert.equal(call.url,'https://script.google.com/macros/s/test/exec');assert.equal(call.options.method,'POST');
  assert.deepEqual(JSON.parse(call.options.body),{...input,action:'findRequestIds'});
  const token=h.provider('deepx');
  await api.decideRequest({token,id:row.id,decision:'매칭거절',rejectionReason:'서버 사유'});
  assert.equal(JSON.parse(sent.at(-1).options.body).rejectionReason,'서버 사유');
});
test('brochure manifest uses exact ASCII paths; missing PDFs are honestly pending and released links open safely',()=>{
  assert.deepEqual(BROCHURES.map(b=>b.file),['deepx-company-profile-2026.pdf','mobilint-corp-brochure-2026.pdf','furiosa-sales-pitch-2026-kor.pdf','rebellions-company-profile-2026-kr.pdf']);
  for(const item of BROCHURES)assert.match(item.file,/^[a-z0-9-]+\.pdf$/);
  assert.equal((view.brochureCards(BROCHURES.map(item=>({...item,available:false}))).match(/자료 준비 중/g)||[]).length,4);
  const html=view.brochureCards(BROCHURES.map(item=>({...item,available:true})));
  for(const item of BROCHURES)assert.ok(html.includes('href="./assets/brochures/'+item.file+'" target="_blank" rel="noopener noreferrer"'));
  assert.ok(!/iframe|preload|base64|fetch\(/.test(html));
  assert.ok(view.homePage().includes('NPU 기업 소개자료'));assert.ok(view.applyPage().includes('#brochures'));
});

test('past schedules and history retain the original time without presenting a fake zero capacity',()=>{
  const h=createHarness(),row=good(h,'submitRequest',h.form());
  const legacy={...row,time:previous[0],status:'매칭확정'};
  const schedule=view.providerMatchingPage('deepx',[legacy],good(h,'getConfig').providers[0]);
  assert.ok(schedule.includes('16:50'));assert.ok(schedule.includes('이전 상담 시간'));
  assert.ok(!schedule.includes('1<small> / 0건'));
  const html=view.adminPage([],good(h,'getConfig').providers,[{id:'past',occurredAt:row.createdAt,
    action:'정원 변경',actor:'NPU',providerId:'deepx',time:previous[0],beforeCapacity:5,afterCapacity:7}]);
  assert.ok(html.includes('value="'+previous[0]+'"'));
});

test('every released brochure resolves to an existing original PDF asset',()=>{
  for(const item of BROCHURES.filter(item=>item.available)){
    const file=new URL('../assets/brochures/'+item.file,import.meta.url);
    const bytes=fs.readFileSync(file);
    assert.ok(bytes.length>5,item.file);
    assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-',item.file);
  }
});
