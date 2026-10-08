import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './gas-harness.mjs';
import {createGasApi} from '../assets/js/gas-api.js';
const good = (h,action,input) => h.value(h.call(action,input));
const denied = (h,action,input,code) => {const r=h.call(action,input); assert.equal(r.ok,false); if(code) assert.equal(r.error.code,code); return r;};

test('setup is idempotent, preserves changed capacities and never replaces an inaccessible DB',()=>{
  const h=createHarness(), token=h.provider('deepx');
  good(h,'updateProviderCapacity',{token,time:h.time,capacity:8});
  good(h,'submitRequest',h.form()); h.context.setupSystem();
  assert.equal(h.created,1); assert.equal(h.sheet('requests').data.length,2);
  assert.equal(h.sheet('providers').data.length,5); assert.equal(h.sheet('capacities').data.length,17);
  assert.equal(good(h,'getAvailability',{providerId:'deepx'})[0].capacity,8);
  h.properties.set('SHEET_ID','missing');
  assert.throws(()=>h.context.setupSystem()); assert.equal(h.created,1);
});
test('real credentials are hashed, demo codes rejected, signed sessions expire and logout revokes',()=>{
  const h=createHarness(); assert.equal(h.properties.has('ADMIN_PASSWORD'),false);
  assert.ok(h.properties.get('PROVIDER_CODE_DEEPX_HASH'));
  denied(h,'authenticateProvider',{providerId:'deepx',approvalCode:'deepx20261022'},'INVALID_CREDENTIALS');
  denied(h,'authenticateAdmin',{id:'ITSKOREA9911',password:'ITSKOREA9911!'},'INVALID_CREDENTIALS');
  const token=h.provider('deepx');
  denied(h,'getProviderRequests',{token:token+'x'},'UNAUTHORIZED');
  const parts=token.split('.'); const payload=JSON.parse(Buffer.from(parts[0],'base64url'));
  payload.role='admin'; parts[0]=Buffer.from(JSON.stringify(payload)).toString('base64url');
  denied(h,'getAdminRequests',{token:parts.join('.')},'UNAUTHORIZED');
  good(h,'logout',{token}); denied(h,'getProviderRequests',{token},'UNAUTHORIZED');
  const exp=h.provider('deepx'); h.advance(30*60*1000+1);
  denied(h,'getProviderRequests',{token:exp},'UNAUTHORIZED');
});
test('public endpoints contain no PII; reads, changes and setup cannot bypass role checks',()=>{
  const h=createHarness(), row=good(h,'submitRequest',h.form()), provider=h.provider('deepx'), admin=h.adminToken();
  for(const action of ['getAdminRequests','getAdminOverview','getProviderRequests','decideRequest','updateProviderCapacity'])
    denied(h,action,{},'UNAUTHORIZED');
  denied(h,'getAdminOverview',{token:provider},'FORBIDDEN');
  denied(h,'getProviderRequests',{token:admin},'FORBIDDEN');
  for(const action of ['getConfig','getAvailability']) {
    const data=good(h,action,{providerId:'deepx'});
    assert.equal(JSON.stringify(data).includes(row.email),false);
    assert.equal(JSON.stringify(data).includes(row.contactName),false);
  }
  assert.equal(h.call('getAdminRequests',{token:admin},'GET').error.code,'METHOD_NOT_ALLOWED');
  denied(h,'setupSystem',{},'UNKNOWN_ACTION'); denied(h,'resetDemo',{},'UNKNOWN_ACTION');
  const post=h.context.doPost({postData:{contents:'broken'}}); assert.equal(JSON.parse(post.text).error.code,'BAD_REQUEST');
});
test('lookup and cancellation require ID plus matching email; server owns identity/status/timestamps',()=>{
  const h=createHarness(), row=good(h,'submitRequest',h.form({id:'KN-CLIENT',status:'매칭확정',createdAt:'bad'}));
  assert.match(row.id,/^KN-[A-F0-9-]{36}$/); assert.equal(row.status,'승인대기'); assert.notEqual(row.createdAt,'bad');
  assert.equal(row.privacyConsentedAt,row.createdAt);
  denied(h,'findRequest',{id:row.id},'NOT_FOUND');
  denied(h,'findRequest',{id:row.id,email:'wrong@example.com'},'NOT_FOUND');
  denied(h,'cancelRequest',{id:row.id},'NOT_FOUND');
  assert.equal(good(h,'findRequest',{id:row.id.toLowerCase(),email:' TEST@EXAMPLE.COM '}).id,row.id);
  assert.equal(good(h,'cancelRequest',{id:row.id,email:row.email}).status,'신청취소');
  denied(h,'submitRequest',h.form({privacyConsent:false}),'CONSENT_REQUIRED');
  denied(h,'submitRequest',h.form({privacyNoticeVersion:'obsolete'}),'NOTICE_CHANGED');
});
test('provider token scope cannot be overridden by client providerId or another request ID',()=>{
  const h=createHarness(), dx=good(h,'submitRequest',h.form()), mo=good(h,'submitRequest',h.form({providerId:'mobilint'}));
  const token=h.provider('deepx');
  assert.deepEqual(good(h,'getProviderRequests',{token,providerId:'mobilint'}).map(r=>r.id),[dx.id]);
  denied(h,'decideRequest',{token,id:mo.id,providerId:'mobilint',decision:'매칭확정'},'NOT_FOUND');
  good(h,'updateProviderCapacity',{token,providerId:'mobilint',time:h.time,capacity:4});
  assert.equal(good(h,'getAvailability',{providerId:'mobilint'})[0].capacity,2);
});
test('last slot concurrent API calls: one approval succeeds; cancellation frees capacity centrally',async()=>{
  const h=createHarness(), token=h.provider('furiosa');
  const a=good(h,'submitRequest',h.form({providerId:'furiosa'}));
  const b=good(h,'submitRequest',h.form({providerId:'furiosa',email:'other@example.com'}));
  const one=createGasApi({url:'https://script.google.com/macros/s/test/exec',fetchImpl:h.fetch});
  const two=createGasApi({url:'https://script.google.com/macros/s/test/exec',fetchImpl:h.fetch});
  const outcomes=await Promise.allSettled([a,b].map((r,i)=>(i?two:one).decideRequest({token,id:r.id,decision:'매칭확정'})));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'CAPACITY_FULL');
  const confirmed=outcomes.find(r=>r.status==='fulfilled').value;
  await two.cancelRequest({id:confirmed.id,email:confirmed.email});
  assert.equal((await one.getAvailability('furiosa'))[0].confirmed,0);
});
test('shared lock excludes reentrant approval/cancellation/capacity/submission during commit',()=>{
  const h=createHarness(), token=h.provider('deepx'), row=good(h,'submitRequest',h.form());
  h.beforeNextBatch(()=>{
    for(const [action,input] of [
      ['decideRequest',{token,id:row.id,decision:'매칭확정'}],
      ['cancelRequest',{id:row.id,email:row.email}],
      ['updateProviderCapacity',{token,time:h.time,capacity:0}],
      ['submitRequest',h.form({email:'race@example.com'})]
    ]) denied(h,action,input,'BUSY');
  });
  good(h,'decideRequest',{token,id:row.id,decision:'매칭확정'});
  assert.equal(h.locked,false);
});
test('slot limits are independent, bounded, cannot drop below confirmed, and closed slots reject new work',()=>{
  const h=createHarness(), token=h.provider('deepx'), row=good(h,'submitRequest',h.form());
  good(h,'decideRequest',{token,id:row.id,decision:'매칭확정'});
  denied(h,'updateProviderCapacity',{token,time:h.time,capacity:0},'CAPACITY_TOO_SMALL');
  good(h,'updateProviderCapacity',{token,time:h.times[1],capacity:0});
  assert.deepEqual(good(h,'getAvailability',{providerId:'deepx'}).map(s=>s.capacity),[5,0,5,5]);
  denied(h,'submitRequest',h.form({time:h.times[1]}),'CAPACITY_FULL');
  for(const capacity of [-1,51,1.2,'',null]) denied(h,'updateProviderCapacity',{token,time:h.time,capacity},'VALIDATION');
});
test('active duplicates blocked; status and audit event are atomic, and formula-like inputs stay strings',()=>{
  const h=createHarness(), input=h.form({itsCompany:'=IMPORTXML("x")',contactName:'+name',details:'@payload',phone:'+82-1234-5678'});
  const row=good(h,'submitRequest',input);
  denied(h,'submitRequest',{...input,email:input.email.toUpperCase()},'DUPLICATE');
  const stored=h.sheet('requests').data[1]; assert.equal(stored[2],input.itsCompany); assert.equal(stored[3],'+name'); assert.equal(stored[10],'@payload');
  const token=h.provider('deepx'), before=structuredClone(h.sheet('history').data);
  h.failNextBatch(); const result=denied(h,'decideRequest',{token,id:row.id,decision:'매칭확정'},'INTERNAL');
  assert.equal(JSON.stringify(result).includes('sensitive'),false);
  assert.equal(good(h,'findRequest',{id:row.id,email:row.email}).status,'승인대기');
  assert.deepEqual(structuredClone(h.sheet('history').data),before);
  good(h,'decideRequest',{token,id:row.id,decision:'매칭확정'});
  good(h,'cancelRequest',{id:row.id,email:row.email});
  good(h,'updateProviderCapacity',{token,time:h.time,capacity:7});
  const overview=good(h,'getAdminOverview',{token:h.adminToken()});
  assert.deepEqual(overview.history.map(e=>e.action),['정원 변경','취소','승인','신청']);
  assert.ok(overview.history.every(e=>e.actorRole && e.occurredAt));
});
test('mobile/PC adapters share DB, not localStorage; login failure throttling and credential rotation revoke tokens',async()=>{
  const h=createHarness(), settings={url:'https://script.google.com/macros/s/test/exec',fetchImpl:h.fetch};
  const mobile=createGasApi(settings), pc=createGasApi(settings);
  const row=await mobile.submitRequest(h.form());
  const admin=await pc.authenticateAdmin(h.admin);
  assert.equal((await pc.getAdminOverview(admin)).requests[0].id,row.id);
  const npu=await pc.authenticateProvider({providerId:'deepx',approvalCode:h.credentials.deepx});
  await pc.decideRequest({token:npu,id:row.id,decision:'매칭확정'});
  assert.equal((await mobile.findRequest({id:row.id,email:row.email})).status,'매칭확정');
  h.configure(); denied(h,'getAdminRequests',{token:admin},'UNAUTHORIZED');
  for(let i=0;i<10;i++) denied(h,'authenticateAdmin',{id:'wrong',password:'wrong'},'INVALID_CREDENTIALS');
  denied(h,'authenticateAdmin',h.admin,'RATE_LIMITED');
  h.advance(15*60*1000+1); assert.ok(h.adminToken());
});

test('rejection/cancellation transitions, disabled slots and repeat decisions keep complete audit history',()=>{
  const h=createHarness(), token=h.provider('deepx'), row=good(h,'submitRequest',h.form());
  const slot=h.sheet('capacities').data.find(r=>r[0]==='deepx'&&r[2]===h.time); slot[4]=false;
  denied(h,'decideRequest',{token,id:row.id,decision:'매칭확정'},'CAPACITY_FULL');
  denied(h,'submitRequest',h.form({email:'other@example.com'}),'CAPACITY_FULL');
  assert.equal(good(h,'getAvailability',{providerId:'deepx'})[0].active,false);
  good(h,'decideRequest',{token,id:row.id,decision:'매칭거절',rejectionReason:'기존 회귀 검사용 사유'});
  good(h,'decideRequest',{token,id:row.id,decision:'매칭거절',rejectionReason:'기존 회귀 검사용 사유'});
  denied(h,'cancelRequest',{id:row.id,email:row.email},'INVALID_STATE');
  denied(h,'decideRequest',{token,id:row.id,decision:'매칭확정'},'INVALID_STATE');
  assert.deepEqual(good(h,'getAdminOverview',{token:h.adminToken()}).history.map(e=>e.action),['거절','신청']);
  h.sheet('capacities').data.find(r=>r[0]==='deepx'&&r[2]===h.time)[4]=true;
  const next=good(h,'submitRequest',h.form());
  good(h,'cancelRequest',{id:next.id,email:next.email});
  good(h,'cancelRequest',{id:next.id,email:next.email});
  assert.equal(good(h,'getAdminOverview',{token:h.adminToken()}).history.filter(e=>e.action==='취소').length,1);
});
