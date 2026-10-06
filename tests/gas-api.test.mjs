import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGasApi} from '../assets/js/gas-api.js';
import {resolveBackend} from '../assets/js/runtime-config.js';
import {readSession,saveSession,clearSession} from '../assets/js/session-store.js';
const url='https://script.google.com/macros/s/test/exec';

test('adapter keeps signatures, only config/availability use GET; secrets are in simple POST bodies',async()=>{
  const sent=[];
  const api=createGasApi({url,fetchImpl:async(target,options)=>{sent.push({target,options});return new Response(JSON.stringify({ok:true,data:'value'}));}});
  await api.getConfig(); await api.getAvailability('deepx');
  await api.authenticateProvider({providerId:'deepx',approvalCode:'private-code'});
  await api.authenticateAdmin({id:'private-id',password:'private-password'});
  await api.submitRequest({email:'private@example.com'});
  await api.findRequest({id:'KN-1',email:'private@example.com'});
  await api.cancelRequest({id:'KN-1',email:'private@example.com'});
  await api.getProviderRequests('private-token'); await api.getAdminRequests('private-token');
  await api.getAdminOverview('private-token'); await api.logout('private-token');
  await api.decideRequest({token:'private-token',id:'KN-1',decision:'매칭확정'});
  await api.updateProviderCapacity({token:'private-token',time:'16:50 – 17:00',capacity:5});
  assert.deepEqual(sent.slice(0,2).map(r=>r.options.method),['GET','GET']);
  for(const {target,options} of sent.slice(2)) {
    assert.equal(target,url); assert.equal(options.method,'POST'); assert.equal(options.mode,'cors');
    assert.equal(options.credentials,'omit'); assert.equal(options.redirect,'follow');
    assert.deepEqual(options.headers,{'Content-Type':'text/plain;charset=utf-8'});
    assert.ok(JSON.parse(options.body).action);
  }
  assert.equal('resetDemo' in api,false);
});
test('missing config/identity fail closed without any fetch',async()=>{
  let count=0; const fetchImpl=async()=>{count++;throw Error('unexpected');};
  await assert.rejects(createGasApi({url:'',fetchImpl}).getConfig(),{code:'SETUP_REQUIRED'});
  await assert.rejects(createGasApi({url:url+'?token=bad',fetchImpl}).getConfig(),{code:'SETUP_REQUIRED'});
  const api=createGasApi({url,fetchImpl});
  await assert.rejects(api.findRequest({id:'KN-1'}),{code:'IDENTITY_REQUIRED'});
  await assert.rejects(api.cancelRequest({id:'KN-1',email:''}),{code:'IDENTITY_REQUIRED'});
  assert.equal(count,0);
});
test('adapter detects HTML, malformed JSON envelope, HTTP, API and network failure without retrying writes',async()=>{
  for(const [fetchImpl,code] of [
    [async()=>new Response('<html>Sign in</html>'),'INVALID_RESPONSE'],
    [async()=>new Response('{"ok":true}'),'INVALID_RESPONSE'],
    [async()=>new Response('{}',{status:500}),'HTTP_ERROR'],
    [async()=>new Response('{"ok":false,"error":{"code":"CAPACITY_FULL","message":"마감"}}'),'CAPACITY_FULL'],
    [async()=>{throw Error('private network detail');},'NETWORK_ERROR']
  ]) {
    let calls=0; const api=createGasApi({url,fetchImpl:async(...args)=>{calls++;return fetchImpl(...args);}});
    await assert.rejects(api.submitRequest({}),{code}); assert.equal(calls,1);
  }
});
test('production never imports mock implicitly, even if URL has not been configured',()=>{
  const local={hostname:'127.0.0.1',protocol:'http:'}, pages={hostname:'chojungseok.github.io',protocol:'https:'};
  assert.equal(resolveBackend({backend:'auto'},local),'mock');
  assert.equal(resolveBackend({backend:'auto'},pages),'gas');
  assert.equal(resolveBackend({backend:'gas'},local),'gas');
  assert.throws(()=>resolveBackend({backend:'mock'},pages));
});
test('sessionStorage holds token only, expired tokens removed, role-separated; no localStorage',()=>{
  const data=new Map();
  globalThis.sessionStorage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  Object.defineProperty(globalThis,'localStorage',{get(){throw Error('Must not use localStorage');},configurable:true});
  const token=Buffer.from(JSON.stringify({role:'provider',providerId:'deepx',expiresAt:Date.now()+60000})).toString('base64url')+'.signature';
  saveSession('provider',token); assert.equal(readSession('provider').token,token); assert.equal(readSession('admin'),null);
  assert.deepEqual([...data.values()],[token]); clearSession('provider'); assert.equal(readSession('provider'),null);
  data.set('knpu-session-v1-admin',Buffer.from(JSON.stringify({role:'admin',expiresAt:1})).toString('base64url')+'.sig');
  assert.equal(readSession('admin'),null); assert.equal(data.size,0);
});
