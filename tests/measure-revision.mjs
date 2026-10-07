// Synthetic service-call/payload comparison. No live credentials, network or DB.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHarness} from './gas-harness.mjs';
const h=createHarness(),good=(action,input={})=>h.value(h.call(action,input));
for(let i=0;i<200;i++)good('submitRequest',h.form({email:'sample-'+i+'@example.com'}));
const provider=h.provider('deepx'),admin=h.adminToken();
const measure=(role,action,token)=>({role,action,token,probes:0,full:0,reads:0,bytes:0,probeBytes:0});
const npu=measure('provider','getProviderRequests',provider),manager=measure('admin','getAdminOverview',admin);
const bytes=data=>Buffer.byteLength(JSON.stringify({ok:true,data}),'utf8');
function full(c){
 const before=h.counters.batchGets,result=good(c.action,{token:c.token,includeConfig:true});
 c.full++;c.reads+=h.counters.batchGets-before;c.bytes+=bytes(result);c.revision=result.revision;
 return result;
}
const providerSample=full(npu),adminSample=full(manager);
function probe(c){
 const before={...h.counters},result=good(c.role==='provider'?'getProviderRevision':'getAdminRevision',{token:c.token});
 assert.deepEqual(h.counters,before);c.probes++;c.probeBytes+=bytes(result);
 if(result.revision!==c.revision)full(c);
}
for(let i=1;i<=360;i++){
 if(i%60===0&&i<=300)good('submitRequest',h.form({email:'new-'+i+'@example.com'}));
 probe(npu);if(i%2===0)probe(manager);
}
const report={simulation:'30 minutes, 200 existing synthetic requests, 5 additional changes; excludes writes and manual actions',
 revisionJsonBytes:bytes(good('getProviderRevision',{token:provider})),
 sampleFullJsonBytes:{provider:bytes(providerSample),admin:bytes(adminSample)},
 before:{provider:{polls:60,fullReadsIncludingInitial:61},admin:{polls:60,fullReadsIncludingInitial:61}},
 after:Object.fromEntries([npu,manager].map(c=>[c.role,{revisionProbes:c.probes,fullReadsIncludingInitial:c.full,
   sheetsReadCalls:c.reads,revisionSheetReadCalls:0,totalJsonBytes:c.bytes+c.probeBytes}]))};
assert.equal(npu.full,6);assert.equal(manager.full,6);
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/revision-performance.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
