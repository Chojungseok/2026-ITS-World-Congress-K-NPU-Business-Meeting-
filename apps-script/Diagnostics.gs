// Per-execution timing only. Never retain/log input, tokens, IDs, URLs or exceptions.
var performanceContext_ = null;
var PERFORMANCE_ACTIONS_ = ['getConfig','getAvailability','getAvailabilityRevision','getProviderRevision','getAdminRevision','submitRequest','findRequest','findRequestIds','cancelRequest','authenticateProvider','authenticateAdmin','logout','getProviderRequests','decideRequest','updateProviderCapacity','getAdminRequests','getAdminOverview','extendSchedule','shrinkSchedule','getPublicBoard','getPublicBoardRevision'];
function measureStage_(key, action) {
  var start = Date.now();
  try { return action(); } finally { if (performanceContext_) performanceContext_[key] += Math.max(0,Date.now()-start); }
}
function responseError_(error) {
  return {code:error.apiCode || 'INTERNAL',message:error.apiCode ? error.message : '요청을 처리하지 못했습니다. 처리 결과를 조회한 후 다시 확인해 주세요.'};
}
function handleMeasured_(method, input, action) {
  var previous = performanceContext_, start = Date.now();
  var timing = {action:PERFORMANCE_ACTIONS_.includes(input.action) ? input.action : 'unknown',method:method === 'GET' ? 'GET' : 'POST',clientVersion:input.apiVersion === KN.apiVersion ? KN.apiVersion : (typeof input.apiVersion === 'string' && /^\d{4}-\d{2}-v\d{1,2}\.\d{1,2}$/.test(input.apiVersion) ? input.apiVersion : 'missing-or-unsupported'),lockWaitMs:0,lockHeldMs:0,snapshotMs:0,writeMs:0};
  performanceContext_ = timing;
  var result;
  try { result = {ok:true,data:action()}; }
  catch(error) { result = {ok:false,error:responseError_(error)}; }
  finally { performanceContext_ = previous; }
  result.meta = {apiVersion:KN.apiVersion};
  if (props_().getProperty('PERFORMANCE_DIAGNOSTICS') === 'true') {
    timing.elapsedMs = Math.max(0,Date.now()-start);
    timing.businessMs = Math.max(0,timing.elapsedMs-timing.lockWaitMs-timing.snapshotMs-timing.writeMs);
    result.meta.timing = timing;
    console.log(JSON.stringify(timing));
  }
  return result;
}
