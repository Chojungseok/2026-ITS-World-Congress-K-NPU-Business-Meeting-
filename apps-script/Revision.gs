// One non-secret property; existing credentials/session properties are never replaced.
// No Sheets calls or ScriptLock in revision reads. All publishes run under the writer lock.
var REVISION_PROPERTY = 'KNPU_REVISIONS_V1';
function revisionState_() {
  var raw = props_().getProperty(REVISION_PROPERTY);
  if (!raw) return { global: '0', admin: '0', providers: {}, availability: {}, pending: false };
  var state = JSON.parse(raw);
  if (!state || typeof state.global !== 'string' || typeof state.admin !== 'string' ||
      !state.providers || !state.availability || typeof state.pending !== 'boolean')
    fail_('SETUP_REQUIRED', '변경 감지 설정을 확인해 주세요.');
  return state;
}
function revisionValue_(state, scope, providerId) {
  return scope === 'admin' ? state.admin : (state[scope][providerId] || '0');
}
function revision_(scope, providerId) {
  var state = revisionState_();
  if (state.pending) fail_('REVISION_PENDING', '변경 결과를 동기화하고 있습니다. 잠시 후 다시 확인해 주세요.');
  return { revision: revisionValue_(state, scope, providerId) };
}
function snapshotRevision_(scope, providerId) {
  var state = revisionState_();
  return state.pending ? null : revisionValue_(state, scope, providerId);
}
function availabilityRevision_(providerId) {
  if (!KN.providers.some(function(p) { return p.id === providerId; }))
    fail_('VALIDATION', 'NPU 기업을 확인해 주세요.');
  return revision_('availability', providerId);
}
function prepareRevision_(changes) {
  var providers = {}, availability = {};
  changes.forEach(function(change) {
    var row = change.value, id = row.providerId || row.id;
    if (['requests', 'capacities', 'providers'].includes(change.type)) providers[id] = true;
    if (['capacities', 'providers'].includes(change.type) ||
        (change.type === 'history' && (row.fromStatus === KN.status.confirmed || row.toStatus === KN.status.confirmed)))
      availability[id] = true;
  });
  var state = revisionState_(), recovering = state.pending;
  // This marker is NOT a revision increment. It prevents silent missed updates if
  // Sheets commits but Properties publication fails (the two services are not atomic).
  state.pending = true;
  props_().setProperty(REVISION_PROPERTY, JSON.stringify(state));
  return { state: state, providers: Object.keys(providers), availability: Object.keys(availability), recovering: recovering };
}
function publishRevision_(change) {
  var state = change.state, next = Utilities.getUuid();
  state.global = next; state.admin = next; state.pending = false;
  var all = KN.providers.map(function(p) { return p.id; });
  (change.recovering ? all : change.providers).forEach(function(id) { state.providers[id] = next; });
  (change.recovering ? all : change.availability).forEach(function(id) { state.availability[id] = next; });
  props_().setProperty(REVISION_PROPERTY, JSON.stringify(state));
}
function publishAllRevisions_() {
  var all = KN.providers.map(function(p) { return p.id; });
  publishRevision_({ state: revisionState_(), providers: all, availability: all, recovering: true });
}
