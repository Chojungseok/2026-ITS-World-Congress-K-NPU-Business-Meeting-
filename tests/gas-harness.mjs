// Executes the actual .gs source with in-memory Google service doubles.
// This validates server logic, NOT Google's deployment/CORS/quota behavior.
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID, createHmac } from 'node:crypto';
export function createHarness({ sources = {} } = {}) {
  const properties = new Map(), books = new Map(), cache = new Map();
  let locked = false, clock = Date.now(), nextSheet = 1, created = 0, failBatch = false, beforeBatch = null;
  const counters = { locks: 0, batches: 0, batchGets: 0, rangeReads: 0, headerReads: 0, lastRows: 0, opens: 0 };
  class Sheet {
    constructor(name) { this.name = name; this.id = nextSheet++; this.data = []; this.maxRows = 1000; }
    getName() { return this.name; }
    getSheetId() { return this.id; }
    getMaxRows() { return this.maxRows; }
    getLastRow() { counters.lastRows++; return this.data.length; }
    setFrozenRows() {}
    getRange(row, col, height, width) {
      return {
        getValues: () => { counters.rangeReads++; if (row === 1 && height === 1) counters.headerReads++; return Array.from({length:height}, (_, y) => Array.from({length:width}, (_, x) => this.data[row+y-1]?.[col+x-1] ?? '')); },
        setValues: values => values.forEach((line,y) => { this.data[row+y-1] ||= []; line.forEach((v,x) => { this.data[row+y-1][col+x-1]=v; }); })
      };
    }
  }
  class Book {
    constructor() { this.id = randomUUID(); this.sheets = []; }
    getId() { return this.id; }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/'+this.id; }
    getSheetByName(name) { return this.sheets.find(s=>s.name===name); }
    insertSheet(name) { const sheet = new Sheet(name); this.sheets.push(sheet); return sheet; }
    setSpreadsheetTimeZone() {}
  }
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const propService = {
    getProperty: key => properties.get(key) ?? null,
    setProperty: (key,value) => properties.set(key,String(value)),
    deleteProperty: key => properties.delete(key),
    getProperties: () => Object.fromEntries(properties),
    setProperties: obj => Object.entries(obj).forEach(([k,v])=>properties.set(k,String(v)))
  };
  const context = vm.createContext({
    Date: ClockDate, console: { log() {} },
    PropertiesService: { getScriptProperties: () => propService },
    LockService: { getScriptLock: () => ({
      tryLock() { counters.locks++; if (locked) return false; locked=true; return true; },
      releaseLock() { locked=false; }
    }) },
    CacheService: { getScriptCache: () => ({
      get: key => { const entry=cache.get(key); return entry && entry.until>clock ? entry.value : null; },
      put: (key,value,seconds) => cache.set(key,{value,until:clock+seconds*1000}), remove: key=>cache.delete(key)
    }) },
    Utilities: {
      getUuid: randomUUID, Charset: { UTF_8: 'utf8' },
      base64EncodeWebSafe: value => Buffer.from(value).toString('base64url'),
      base64DecodeWebSafe: value => [...Buffer.from(value, 'base64url')],
      computeHmacSha256Signature: (value,key) => [...createHmac('sha256',key).update(value).digest()],
      newBlob: value => ({ getDataAsString: () => Buffer.from(value).toString('utf8') })
    },
    SpreadsheetApp: {
      create: () => { created++; const book=new Book(); books.set(book.id,book); return book; },
      openById: id => { counters.opens++; if(!books.has(id)) throw Error('Private DB ID / stack must never escape'); return books.get(id); },
      flush() {}
    },
    Sheets: { Spreadsheets: { Values: { batchGet: (id, options) => {
      counters.batchGets++;
      const book = books.get(id);
      if (!book) throw Error('Unknown private DB');
      const valueRanges = options.ranges.map(range => {
        const match = /^'([^']+)'!([A-Z]+)([0-9]*):([A-Z]+)([0-9]*)$/.exec(range);
        if (!match) throw Error('Unsupported A1 range: ' + range);
        const sheet = book.getSheetByName(match[1]);
        if (!sheet) throw Error('Unknown sheet');
        const column = letters => [...letters].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
        const from = Number(match[3] || 1)-1, until = Number(match[5] || sheet.data.length);
        return { range, values: structuredClone(sheet.data.slice(from,until).map(row=>row.slice(column(match[2]),column(match[4])+1))) };
      });
      return { valueRanges };
    } }, batchUpdate: (body,id) => {
      if(!locked) throw Error('Write outside common lock!');
      counters.batches++;
      if(beforeBatch) { const hook=beforeBatch; beforeBatch=null; hook(); }
      if(failBatch) { failBatch=false; throw Error('Atomic batch failed: sensitive details'); }
      const book=books.get(id), staged=new Map(book.sheets.map(s=>[s.id,{data:structuredClone(s.data),maxRows:s.maxRows}]));
      for(const req of body.requests) {
        if(req.appendDimension) { staged.get(req.appendDimension.sheetId).maxRows+=req.appendDimension.length; continue; }
        const u=req.updateCells, target=staged.get(u.start.sheetId);
        if(!target || u.rows.length!==1 || u.fields!=='userEnteredValue') throw Error('Unexpected batch shape');
        const line=u.rows[0].values.map(cell=>{
          const value=cell.userEnteredValue;
          if('formulaValue' in value) throw Error('Formula injection!');
          return value.stringValue ?? value.numberValue ?? value.boolValue ?? '';
        });
        target.data[u.start.rowIndex]=line;
      }
      for(const sheet of book.sheets) Object.assign(sheet,staged.get(sheet.id));
    } } },
    ContentService: { MimeType: { JSON:'application/json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) }
  });
  for(const name of ['Config','Revision','Database','Setup','Auth','Services','Code'])
    vm.runInContext(sources[name] ?? fs.readFileSync(new URL('../apps-script/'+name+'.gs',import.meta.url),'utf8'),context,{filename:name+'.gs'});
  const call = (action,input={},method='POST') => JSON.parse(JSON.stringify(context.handle_(method,{...input,action})));
  const value = result => { if(!result.ok) throw Object.assign(Error(result.error.message), {code:result.error.code}); return result.data; };
  const credentials = Object.fromEntries(['deepx','mobilint','furiosa','rebellions'].map(id=>[id,randomUUID()]));
  const admin = { id:'test-admin-'+randomUUID(), password:randomUUID() };
  function configure() {
    for(const [id,code] of Object.entries(credentials)) properties.set('PROVIDER_CODE_'+id.toUpperCase(),code);
    properties.set('ADMIN_ID',admin.id); properties.set('ADMIN_PASSWORD',admin.password);
    context.configureAuthentication();
  }
  context.setupSystem(); configure();
  return {
    context, call, value, properties, counters, credentials, admin, configure,
    get created() { return created; }, get locked() { return locked; },
    time: context.KN.times[0], times: [...context.KN.times],
    provider: id => value(call('authenticateProvider',{providerId:id,approvalCode:credentials[id]})),
    adminToken: () => value(call('authenticateAdmin',admin)),
    advance: ms=>{clock+=ms;}, failNextBatch:()=>{failBatch=true;},
    beforeNextBatch: callback=>{beforeBatch=callback;},
    sheet: type=>books.get(properties.get('SHEET_ID')).getSheetByName(context.KN.schemas[type].name),
    form: (override={}) => ({itsCompany:'테스트 ITS',contactName:'담당자',phone:'010-0000-0000',email:'test@example.com',
      providerId:'deepx',time:context.KN.times[0],attendees:2,details:'NPU 기술 상담',privacyConsent:true,privacyNoticeVersion:'knpu-2026-v1',...override}),
    fetch: async (url,options) => {
      const parsed=new URL(url);
      const result=options.method==='GET' ? context.doGet({parameter:Object.fromEntries(parsed.searchParams)}) :
        context.doPost({postData:{contents:options.body}});
      return new Response(result.text,{headers:{'content-type':'application/json'}});
    }
  };
}
