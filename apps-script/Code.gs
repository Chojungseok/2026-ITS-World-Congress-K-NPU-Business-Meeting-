function json_(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  var parameters = e && e.parameter || {};
  return json_(handle_('GET', { action: parameters.action, providerId: parameters.providerId, apiVersion: parameters.apiVersion, includeConfig: parameters.includeConfig === 'true' }));
}
function doPost(e) {
  var input;
  try {
    var body = e && e.postData && e.postData.contents;
    if (typeof body !== 'string' || body.length > 16000) throw new Error();
    input = JSON.parse(body);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
  } catch (_) {
    return json_({ ok: false, error: { code: 'BAD_REQUEST', message: '요청 형식을 확인해 주세요.' }, meta:{apiVersion:KN.apiVersion} });
  }
  // Tokens and all personal data are accepted ONLY in the POST body.
  return json_(handle_('POST', input));
}
function handle_(method, input) {
  return handleMeasured_(method,input,function() {
    // Version is checked before method routing, locks, authentication or writes.
    if (input.apiVersion !== KN.apiVersion)
      fail_('API_VERSION_MISMATCH','새 버전이 배포되었습니다. 페이지를 새로고침해 주세요.');
    if (method === 'GET' && !['getConfig','getAvailability','getAvailabilityRevision','getPublicBoard','getPublicBoardRevision'].includes(input.action))
      fail_('METHOD_NOT_ALLOWED','요청 형식을 확인할 수 없습니다. 페이지를 새로고침해 주세요.');
    var lockedActions = ['submitRequest','cancelRequest','decideRequest','updateProviderCapacity','logout','findRequest','findRequestIds','extendSchedule','shrinkSchedule'];
    var data = lockedActions.includes(input.action) ? withLock_(function(){return dispatch_(input);}) : dispatch_(input);
    return data == null ? null : data;
  });
}
function providerData_(session, includeConfig) {
  var providerRevision = snapshotRevision_('providers',session.providerId);
  var db = database_(includeConfig ? ['providers','requests','capacities'] : ['providers','requests']);
  provider_(db,session.providerId,true);
  var requests = rows_(db,'requests').filter(function(r){return r.providerId === session.providerId;}).map(publicRow_);
  return includeConfig ? {requests:requests,config:config_(db),revision:providerRevision} : requests;
}
function adminData_() {
  var revision,db = withLock_(function(){revision=snapshotRevision_('admin');return database_(['requests','history','providers','capacities']);});
  var history=rows_(db,'history');
  history.sort(function(a,b){return String(b.occurredAt).localeCompare(String(a.occurredAt)) || b._row-a._row;});
  var config=config_(db);
  return {requests:rows_(db,'requests').map(publicRow_),history:history.map(publicRow_),providers:config.providers,config:config,revision:revision};
}
function loginResponse_(input, role) {
  // Credential counters and token properties are written under a short lock.
  var token=withLock_(function(){return role === 'provider' ? authenticateProvider_(database_(['providers']),input) : authenticateAdmin_(input);});
  if (!(role === 'provider' ? input.includeInitialData === true : input.includeOverview === true)) return token;
  var result={token:token};
  // No outer authentication lock around initial list/overview rendering.
  // Session is revalidated before PII is read; admin retains its brief coherent-read lock.
  try {
    var session=session_(token,role);
    if(role === 'provider'){result.providerId=session.providerId;result.snapshot=providerData_(session,true);}
    else result.overview=adminData_();
  } catch(error) { result.initialDataError=responseError_(error); }
  return result;
}
function dispatch_(input) {
  var session, db;
  // Explicit allowlist: never dynamically call a function named by a client.
  switch (input.action) {
    case 'getConfig': return publicConfig_();
    case 'getPublicBoard': return publicBoard_();
    case 'getPublicBoardRevision': return revision_('board');
    case 'getProviderRevision':
      session = session_(input.token, 'provider');
      return revision_('providers', session.providerId);
    case 'getAdminRevision':
      session_(input.token, 'admin');
      return revision_('admin');
    case 'getAvailabilityRevision': return availabilityRevision_(input.providerId);
    case 'getAvailability':
      var availabilityRevision = snapshotRevision_('availability', input.providerId);
      db = availabilitySnapshot_();
      var slots = availability_(db, input.providerId);
      return input.includeConfig === true ? { slots: slots, config: config_(db), revision: availabilityRevision } : slots;
    case 'shrinkSchedule':
      session = session_(input.token, 'admin');
      return shrinkSchedule_(availabilitySnapshot_(), session, input);
    case 'extendSchedule':
      session = session_(input.token, 'admin');
      return extendSchedule_(database_(['providers', 'capacities', 'requests']), session, input);
    case 'submitRequest': return submit_(submissionSnapshot_(), input);
    case 'findRequestIds': return findRequestIds_(database_(), input);
    case 'findRequest': return publicRow_(verifiedRequest_(database_(), input));
    case 'cancelRequest': return cancel_(database_(['requests', 'capacities']), input);
    case 'authenticateProvider': return loginResponse_(input,'provider');
    case 'authenticateAdmin': return loginResponse_(input,'admin');
    case 'logout':
      session = session_(input.token);
      revokeSession_(session.jti);
      return null;
    case 'getProviderRequests':
      session=session_(input.token,'provider');
      return providerData_(session,input.includeConfig === true);
    case 'decideRequest':
      session = session_(input.token, 'provider');
      return decide_(database_(['providers', 'requests', 'capacities']), session, input);
    case 'updateProviderCapacity':
      session = session_(input.token, 'provider');
      return capacity_(database_(['providers', 'capacities', 'requests']), session, input);
    case 'getAdminRequests':
      session_(input.token, 'admin');
      return rows_(database_(), 'requests').map(publicRow_);
    case 'getAdminOverview':
      session_(input.token,'admin');
      return adminData_();
    default: fail_('UNKNOWN_ACTION', '지원하지 않는 요청입니다.');
  }
}
