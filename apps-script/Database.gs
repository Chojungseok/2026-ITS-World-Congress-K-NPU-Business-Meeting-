function database_() {
  var id = props_().getProperty('SHEET_ID');
  if (!id) fail_('SETUP_REQUIRED', '운영 DB 설정이 필요합니다.');
  return SpreadsheetApp.openById(id);
}
function table_(db, type) {
  var schema = KN.schemas[type];
  var sheet = db.getSheetByName(schema.name);
  if (!sheet) fail_('SETUP_REQUIRED', 'DB 시트 설정을 확인해 주세요.');
  var headers = sheet.getRange(1, 1, 1, schema.headers.length).getValues()[0];
  if (headers.some(function(h, i) { return h !== schema.headers[i]; }))
    fail_('SETUP_REQUIRED', 'DB 열 구성이 일치하지 않습니다. 운영 담당자에게 문의해 주세요.');
  return sheet;
}
function rows_(db, type) {
  var sheet = table_(db, type), keys = KN.schemas[type].keys;
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, keys.length).getValues()
    .map(function(values, i) {
      var item = { _row: i + 2 };
      keys.forEach(function(key, j) { item[key] = values[j] instanceof Date ? values[j].toISOString() : values[j]; });
      return item;
    }).filter(function(item) { return item[keys[0]] !== ''; });
}
function publicRow_(row) {
  var copy = Object.assign({}, row);
  delete copy._row;
  return copy;
}
// Explicit stringValue never interprets =, +, -, @ or leading whitespace as a formula.
// A mutation and its audit event are sent together in ONE atomic Sheets batch.
function writeBatch_(db, changes) {
  var requests = [], nextRows = {}, sizes = {};
  changes.forEach(function(change) {
    var sheet = table_(db, change.type), id = sheet.getSheetId();
    if (!nextRows[id]) { nextRows[id] = sheet.getLastRow() + 1; sizes[id] = sheet.getMaxRows(); }
    var row = change.row || nextRows[id]++;
    if (row > sizes[id]) {
      requests.push({ appendDimension: { sheetId: id, dimension: 'ROWS', length: row - sizes[id] } });
      sizes[id] = row;
    }
    var values = KN.schemas[change.type].keys.map(function(key) {
      var value = change.value[key];
      var typed = typeof value === 'boolean' ? { boolValue: value } :
        typeof value === 'number' ? { numberValue: value } : { stringValue: value == null ? '' : String(value) };
      return { userEnteredValue: typed };
    });
    requests.push({ updateCells: {
      start: { sheetId: id, rowIndex: row - 1, columnIndex: 0 },
      rows: [{ values: values }], fields: 'userEnteredValue'
    } });
  });
  if (requests.length) Sheets.Spreadsheets.batchUpdate({ requests: requests }, db.getId());
}
function commit_(db, type, value, event) {
  writeBatch_(db, [
    { type: type, row: value._row, value: value },
    { type: 'history', value: event }
  ]);
}
function event_(action, role, actor, row, previous, next) {
  return {
    id: Utilities.getUuid(), occurredAt: iso_(), action: action, actorRole: role, actor: actor,
    requestId: row.id || '', itsCompany: row.itsCompany || '', providerId: row.providerId,
    time: row.time, fromStatus: previous || '', toStatus: next || ''
  };
}
function provider_(db, id, requireActive) {
  var provider = rows_(db, 'providers').find(function(p) { return p.id === id; });
  if (!provider || (requireActive && !active_(provider.active))) fail_('VALIDATION', '운영 중인 NPU 기업을 선택해 주세요.');
  return provider;
}
function slot_(db, providerId, time) {
  var slots = rows_(db, 'capacities').filter(function(s) { return s.providerId === providerId && s.time === time; });
  if (slots.length !== 1) fail_('SETUP_REQUIRED', '상담 시간 설정을 확인해 주세요.');
  slots[0].capacity = integer_(slots[0].capacity, 0, 50);
  return slots[0];
}
function confirmed_(requests, providerId, time) {
  return requests.filter(function(r) { return r.providerId === providerId && r.time === time && r.status === KN.status.confirmed; }).length;
}
function config_(db) {
  var slots = rows_(db, 'capacities');
  var providers = rows_(db, 'providers').map(function(p) {
    var capacities = {}, enabled = {};
    slots.filter(function(s) { return s.providerId === p.id; }).forEach(function(s) {
      capacities[s.time] = integer_(s.capacity, 0, 50);
      enabled[s.time] = active_(s.active);
    });
    return { id: p.id, name: p.name, english: p.english, active: active_(p.active), capacity: 0, capacities: capacities, enabled: enabled };
  });
  return {
    providers: providers,
    times: Array.from(new Set(slots.map(function(s) { return s.time; }))).sort(),
    privacy: {
      version: props_().getProperty('PRIVACY_NOTICE_VERSION') || 'knpu-2026-v1',
      // TODO: ITS Korea must finalize this before accepting real applications.
      retentionText: props_().getProperty('PRIVACY_RETENTION_TEXT') || '운영기관 확인 후 안내 예정'
    }
  };
}
