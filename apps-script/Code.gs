function json_(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  var parameters = e && e.parameter || {};
  return json_(handle_('GET', { action: parameters.action, providerId: parameters.providerId }));
}
function doPost(e) {
  var input;
  try {
    var body = e && e.postData && e.postData.contents;
    if (typeof body !== 'string' || body.length > 16000) throw new Error();
    input = JSON.parse(body);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
  } catch (_) {
    return json_({ ok: false, error: { code: 'BAD_REQUEST', message: '요청 형식을 확인해 주세요.' } });
  }
  // Tokens and all personal data are accepted ONLY in the POST body.
  return json_(handle_('POST', input));
}
function handle_(method, input) {
  try {
    if (method === 'GET' && !['getConfig','getAvailability'].includes(input.action))
      fail_('METHOD_NOT_ALLOWED', '이 기능은 POST 요청이 필요합니다.');
    // Reads also acquire this lock to avoid a mixed snapshot during a mutation.
    var data = withLock_(function() { return dispatch_(input); });
    return { ok: true, data: data == null ? null : data };
  } catch (error) {
    // Never send/log exception messages, bodies, tokens, spreadsheet IDs or stack traces.
    return { ok: false, error: {
      code: error.apiCode || 'INTERNAL',
      message: error.apiCode ? error.message : '요청을 처리하지 못했습니다. 처리 결과를 조회한 후 다시 시도해 주세요.'
    } };
  }
}
function dispatch_(input) {
  var session, db;
  // Explicit allowlist: never dynamically call a function named by a client.
  switch (input.action) {
    case 'getConfig': return config_(database_());
    case 'getAvailability': return availability_(database_(), input.providerId);
    case 'submitRequest': return submit_(database_(), input);
    case 'findRequest': return publicRow_(verifiedRequest_(database_(), input));
    case 'cancelRequest': return cancel_(database_(), input);
    case 'authenticateProvider': return authenticateProvider_(database_(), input);
    case 'authenticateAdmin': return authenticateAdmin_(input);
    case 'logout':
      session = session_(input.token);
      props_().deleteProperty('SESSION_' + session.jti);
      return null;
    case 'getProviderRequests':
      session = session_(input.token, 'provider'); db = database_();
      provider_(db, session.providerId, true);
      return rows_(db, 'requests').filter(function(r) { return r.providerId === session.providerId; }).map(publicRow_);
    case 'decideRequest':
      session = session_(input.token, 'provider');
      return decide_(database_(), session, input);
    case 'updateProviderCapacity':
      session = session_(input.token, 'provider');
      return capacity_(database_(), session, input);
    case 'getAdminRequests':
      session_(input.token, 'admin');
      return rows_(database_(), 'requests').map(publicRow_);
    case 'getAdminOverview':
      session_(input.token, 'admin'); db = database_();
      var history = rows_(db, 'history');
      history.sort(function(a, b) { return String(b.occurredAt).localeCompare(String(a.occurredAt)) || b._row - a._row; });
      return { requests: rows_(db, 'requests').map(publicRow_), history: history.map(publicRow_), providers: config_(db).providers };
    default: fail_('UNKNOWN_ACTION', '지원하지 않는 요청입니다.');
  }
}
