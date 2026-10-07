// Counts service calls on synthetic data; does NOT measure Google's network latency.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHarness} from './gas-harness.mjs';

const baseline = process.argv[2] || 'a9f7de75fb52448b2ab43649ac236893f84432fc';
const sources = Object.fromEntries(['Config','Database','Setup','Auth','Services','Code'].map(name =>
  [name, execFileSync('git', ['show', baseline + ':apps-script/' + name + '.gs'], {encoding:'utf8'})]));
function measure(sources) {
  const h = createHarness({sources});
  for (let i=0;i<200;i++) h.value(h.call('submitRequest', h.form({email:'synthetic-'+i+'@example.com'})));
  const provider=h.provider('deepx'), admin=h.adminToken();
  const rows=h.value(h.call('getProviderRequests',{token:provider}));
  const report={};
  function count(label, action, input={}) {
    const before={...h.counters};
    h.value(h.call(action,input));
    report[label]=Object.fromEntries(Object.keys(before).map(key=>[key,h.counters[key]-before[key]]));
  }
  count('getConfig-cold','getConfig');
  count('getConfig-warm','getConfig');
  count('getAvailability','getAvailability',{providerId:'deepx'});
  count('getProviderRequests','getProviderRequests',{token:provider,includeConfig:true});
  count('getAdminOverview','getAdminOverview',{token:admin});
  count('submitRequest','submitRequest',h.form({email:'extra@example.com'}));
  count('decideRequest','decideRequest',{token:provider,id:rows[0].id,decision:'매칭확정'});
  count('cancelRequest','cancelRequest',{id:rows[0].id,email:rows[0].email});
  count('updateProviderCapacity','updateProviderCapacity',{token:provider,time:h.time,capacity:6});
  return report;
}
const report={fixture:'200 synthetic pending requests and 200 audit events before measurement',baseline,
  before:measure(sources),after:measure({})};
fs.mkdirSync('artifacts',{recursive:true});
fs.writeFileSync('artifacts/backend-read-counts.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
