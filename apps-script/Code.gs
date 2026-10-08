function json_(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  var parameters = e && e.parameter || {};
  return json_(handle_('GET', { action: parameters.action, providerId: parameters.providerId, includeConfig: parameters.includeConfig === 'true' }));
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
    if (method === 'GET' && !['getConfig','getAvailability','getAvailabilityRevision'].includes(input.action))
      fail_('METHOD_NOT_ALLOWED', '이 기능은 POST 요청이 필요합니다.');
    // Mutations/auth counters keep the same common lock. Pure reads do not queue behind them.
    var lockedActions = ['submitRequest', 'cancelRequest', 'decideRequest', 'updateProviderCapacity',
      'authenticateProvider', 'authenticateAdmin', 'logout', 'findRequest', 'findRequestIds', 'extendSchedule'];
    var data = lockedActions.includes(input.action)
      ? withLock_(function() { return dispatch_(input); }) : dispatch_(input);
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
    case 'getConfig': return publicConfig_();
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
    case 'extendSchedule':
      session = session_(input.token, 'admin');
      return extendSchedule_(database_(['providers', 'capacities', 'requests']), session, input);
    case 'submitRequest': return submit_(database_(['providers', 'capacities', 'requests']), input);
    case 'findRequestIds': return findRequestIds_(database_(), input);
    case 'findRequest': return publicRow_(verifiedRequest_(database_(), input));
    case 'cancelRequest': return cancel_(database_(['requests', 'capacities']), input);
    case 'authenticateProvider': return authenticateProvider_(database_(['providers']), input);
    case 'authenticateAdmin': return authenticateAdmin_(input);
    case 'logout':
      session = session_(input.token);
      props_().deleteProperty('SESSION_' + session.jti);
      return null;
    case 'getProviderRequests':
      session = session_(input.token, 'provider');
      // Capture BEFORE reading. A concurrent commit leaves an older revision, so the
      // next probe detects it; never label an old snapshot with a newer revision.
      var providerRevision = snapshotRevision_('providers', session.providerId);
      db = database_(input.includeConfig === true ? ['providers', 'requests', 'capacities'] : ['providers', 'requests']);
      provider_(db, session.providerId, true);
      var requests = rows_(db, 'requests').filter(function(r) { return r.providerId === session.providerId; }).map(publicRow_);
      // Optional envelope for new adapters; legacy callers still receive the same array.
      return input.includeConfig === true ? { requests: requests, config: config_(db), revision: providerRevision } : requests;
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
      session_(input.token, 'admin');
      // batchGet alone does not document cross-range transaction isolation. Keep a short
      // snapshot lock for the admin's mutually consistent requests/history/capacities.
      var adminRevision;
      db = withLock_(function() {
        adminRevision = snapshotRevision_('admin');
        return database_(['requests', 'history', 'providers', 'capacities']);
      });
      var history = rows_(db, 'history');
      history.sort(function(a, b) { return String(b.occurredAt).localeCompare(String(a.occurredAt)) || b._row - a._row; });
      var config = config_(db);
      return { requests: rows_(db, 'requests').map(publicRow_), history: history.map(publicRow_), providers: config.providers, config: config, revision: adminRevision };
    default: fail_('UNKNOWN_ACTION', '지원하지 않는 요청입니다.');
  }
}
