// Anonymous click intents, not downloads/read completion or authenticated people.
var MATERIAL_REGISTRY_PROPERTY = 'KNPU_MATERIAL_REGISTRY_V4';
function validateMaterialCatalog_(catalog) {
  if(!catalog || typeof catalog.version!=='string' || !Array.isArray(catalog.companies) || !Array.isArray(catalog.materials))
    fail_('MATERIAL_SETUP_REQUIRED','자료 등록정보를 동기화해 주세요.');
  var companies={},ids={},presentations={};
  catalog.companies.forEach(function(c){
    if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(c.companyId) || !['NPU','ITS'].includes(c.companyType) || typeof c.name!=='string' || !c.name.trim() || c.name.length>80 || companies[c.companyId])
      fail_('MATERIAL_SETUP_REQUIRED','자료 기업 설정을 확인해 주세요.');
    companies[c.companyId]=c;
  });
  catalog.materials.forEach(function(m){
    var c=companies[m.companyId];
    if(!/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(m.materialId) || ids[m.materialId] || !c || c.companyType!==m.companyType || !['presentation','brochure'].includes(m.materialType) || typeof m.title!=='string' || !m.title.trim() || m.title.length>160 || typeof m.available!=='boolean' || typeof m.publicApproved!=='boolean')
      fail_('MATERIAL_SETUP_REQUIRED','자료 등록정보를 확인해 주세요.');
    ids[m.materialId]=true;
    if(m.materialType==='presentation'){if(presentations[m.companyId])fail_('MATERIAL_SETUP_REQUIRED','기업당 발표자료는 1개만 등록하세요.');presentations[m.companyId]=true;}
    if(m.filePath!==null && (typeof m.filePath!=='string' || !/^assets\/(brochures|materials)\/[a-z0-9/_-]+\.pdf$/.test(m.filePath) || m.filePath.includes('..')))
      fail_('MATERIAL_SETUP_REQUIRED','자료 경로를 확인해 주세요.');
    if(m.available && (!m.publicApproved || !m.filePath))fail_('MATERIAL_SETUP_REQUIRED','공개 승인된 PDF만 활성화하세요.');
  });
  return catalog;
}
// EDITOR ONLY. Copy the generated MaterialCatalog.gs, save, then run this.
// Deployed handlers read Properties, so future catalog updates need no redeploy.
function syncMaterialCatalog() {
  return withLock_(function(){
    var catalog=validateMaterialCatalog_(MATERIAL_CATALOG_SEED),raw=JSON.stringify(catalog),properties=props_();
    var previous=properties.getProperty(MATERIAL_REGISTRY_PROPERTY),prefix='KNPU_MATERIAL_'+Utilities.getUuid()+'_',count=0;
    // Shards stay below the 9 KB property limit even for Korean text.
    for(var i=0;i<raw.length;i+=2000)properties.setProperty(prefix+(count++),raw.slice(i,i+2000));
    properties.setProperty(MATERIAL_REGISTRY_PROPERTY,JSON.stringify({prefix:prefix,count:count,version:catalog.version}));
    if(previous){var old=JSON.parse(previous);for(var j=0;j<old.count;j++)properties.deleteProperty(old.prefix+j);}
    console.log('자료 등록정보 동기화: '+catalog.materials.length+'건. PDF 파일은 GitHub에 별도 반영하세요.');
    return {version:catalog.version,materials:catalog.materials.length};
  });
}
function materialCatalog_() {
  var properties=props_(),manifest=properties.getProperty(MATERIAL_REGISTRY_PROPERTY);
  if(!manifest)fail_('MATERIAL_SETUP_REQUIRED','자료 등록정보를 동기화해 주세요.');
  var record=JSON.parse(manifest),raw='';
  for(var i=0;i<record.count;i++){var part=properties.getProperty(record.prefix+i);if(part===null)fail_('MATERIAL_SETUP_REQUIRED','자료 등록정보를 확인해 주세요.');raw+=part;}
  return validateMaterialCatalog_(JSON.parse(raw));
}
function logMaterialView_(input) {
  // Never accept client-provided URLs, company names, contact data or timestamps.
  if(Object.keys(input).some(function(k){return !['action','apiVersion','materialId','sessionId','clickId'].includes(k);}))
    fail_('VALIDATION','자료 열람 요청 형식을 확인해 주세요.');
  var catalog=materialCatalog_(),material=catalog.materials.find(function(m){return m.materialId===input.materialId;});
  if(!material || !material.available || !material.publicApproved || !material.filePath)
    fail_('MATERIAL_UNAVAILABLE','아직 등록되지 않은 자료입니다.');
  var uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  if(typeof input.sessionId!=='string' || !uuid.test(input.sessionId) || typeof input.clickId!=='string' || !uuid.test(input.clickId))
    fail_('VALIDATION','자료 열람 요청 형식을 확인해 주세요.');
  var hash=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('materials:'+input.sessionId,props_().getProperty('TOKEN_SIGNING_SECRET')));
  var db=database_(['materialViews']),rows=rows_(db,'materialViews');
  var duplicate=rows.find(function(r){return r.clickId===input.clickId;});
  if(duplicate){
    if(duplicate.sessionHash!==hash || duplicate.materialId!==material.materialId)fail_('VALIDATION','중복 클릭 요청을 확인해 주세요.');
    return {recorded:true,duplicate:true};
  }
  // Bounded per-session traffic; no IP addresses, user agents or account identifiers.
  var cutoff=Date.now()-60000;
  if(rows.filter(function(r){return r.sessionHash===hash && Date.parse(r.occurredAt)>cutoff;}).length>=30)
    fail_('RATE_LIMITED','자료 열람 기록 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  var company=catalog.companies.find(function(c){return c.companyId===material.companyId;});
  writeBatch_(db,[{type:'materialViews',value:{id:Utilities.getUuid(),occurredAt:iso_(),materialId:material.materialId,
    companyId:company.companyId,companyName:company.name,companyType:material.companyType,materialType:material.materialType,
    title:material.title,sessionHash:hash,clickId:input.clickId}}]);
  return {recorded:true,duplicate:false};
}
function materialFilters_(input) {
  var result={};
  ['from','to'].forEach(function(key){
    var value=input[key] || '';
    if(value && (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value))
      fail_('VALIDATION','조회 날짜를 확인해 주세요.');
    result[key]=value;
  });
  if(result.from && result.to && result.from>result.to)fail_('VALIDATION','조회 시작일과 종료일을 확인해 주세요.');
  ['companyId','companyType','materialType'].forEach(function(key){if(input[key])result[key]=text_(input[key],80,'자료 필터');});
  return result;
}
function materialStatistics_(input) {
  // Defense in depth: this function also guards auth before catalog or DB reads.
  session_(input.token,'admin');
  var filters=materialFilters_(input);
  var snapshot=withLock_(function(){return {catalog:materialCatalog_(),db:database_(['materialViews'])};});
  var catalog=snapshot.catalog,db=snapshot.db;
  var stats=aggregateMaterialViews(catalog,rows_(db,'materialViews'),filters);
  var offset=input.offset == null ? 0 : integer_(input.offset,0,10000000),total=stats.records.length;
  stats.records=stats.records.slice(offset,offset+100);
  return Object.assign(stats,{offset:offset,totalRecords:total,catalogVersion:catalog.version,generatedAt:iso_()});
}
