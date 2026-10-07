// A fresh context is created for each API request; PII never survives execution.
function databaseContext_(id, spreadsheet) {
  return { getId: function() { return id; }, spreadsheet: spreadsheet || null,
    tables: {}, records: {}, validated: {} };
}
function database_(types) {
  var id = props_().getProperty('SHEET_ID');
  if (!id) fail_('SETUP_REQUIRED', '운영 DB 설정이 필요합니다.');
  var db = databaseContext_(id);
  if (types) snapshot_(db, types);
  return db;
}
function validateHeaders_(db, type, headers) {
  var expected = KN.schemas[type].headers;
  if (expected.some(function(value, i) { return headers[i] !== value; }))
    fail_('SETUP_REQUIRED', 'DB 열 구성이 일치하지 않습니다. 운영 담당자에게 문의해 주세요.');
  db.validated[type] = true;
}
function table_(db, type) {
  if (!db.tables[type]) {
    if (!db.spreadsheet) db.spreadsheet = SpreadsheetApp.openById(db.getId());
    var sheet = db.spreadsheet.getSheetByName(KN.schemas[type].name);
    if (!sheet) fail_('SETUP_REQUIRED', 'DB 시트 설정을 확인해 주세요.');
    db.tables[type] = sheet;
  }
  var table = db.tables[type];
  if (!db.validated[type]) validateHeaders_(db, type,
    table.getRange(1, 1, 1, KN.schemas[type].headers.length).getValues()[0]);
  return table;
}
function snapshot_(db, types) {
  var missing = types.filter(function(type) { return !Object.prototype.hasOwnProperty.call(db.records, type); });
  if (!missing.length) return db;
  var ranges = missing.map(function(type) {
    return "'" + KN.schemas[type].name + "'!A:" + String.fromCharCode(64 + KN.schemas[type].keys.length);
  });
  var response = Sheets.Spreadsheets.Values.batchGet(db.getId(), {
    ranges: ranges, valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING'
  });
  missing.forEach(function(type, index) {
    var values = response.valueRanges[index].values || [], keys = KN.schemas[type].keys;
    validateHeaders_(db, type, values[0] || []);
    db.records[type] = values.slice(1).map(function(values, i) {
      var item = { _row: i + 2 };
      keys.forEach(function(key, j) { item[key] = values[j] == null ? '' : values[j]; });
      return item;
    }).filter(function(item) { return item[keys[0]] !== ''; });
  });
  return db;
}
function rows_(db, type) {
  snapshot_(db, [type]);
  return db.records[type];
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
  if (requests.length) {
    var configChanged = changes.some(function(change) { return ['capacities', 'providers'].includes(change.type); });
    // Versioned keys prevent a slow, pre-change cache fill resurrecting stale config.
    if (configChanged) invalidatePublicConfig_();
    try { Sheets.Spreadsheets.batchUpdate({ requests: requests }, db.getId()); }
    finally { if (configChanged) invalidatePublicConfig_(); }
    changes.forEach(function(change) { delete db.records[change.type]; });
  }
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
    privacy: privacy_()
  };
}

function privacy_() {
  return {
    version: props_().getProperty('PRIVACY_NOTICE_VERSION') || 'knpu-2026-v1',
    // TODO: ITS Korea must finalize this before accepting real applications.
    retentionText: props_().getProperty('PRIVACY_RETENTION_TEXT') || '운영기관 확인 후 안내 예정'
  };
}
function publicCacheKey_() {
  return 'KNPU_CONFIG_V2:' + props_().getProperty('SHEET_ID') + ':' +
    (props_().getProperty('PUBLIC_CONFIG_REVISION') || '0');
}
function invalidatePublicConfig_() {
  var oldKey = publicCacheKey_();
  props_().setProperty('PUBLIC_CONFIG_REVISION', Utilities.getUuid());
  try { CacheService.getScriptCache().remove(oldKey); } catch (_) { /* Cache is optional. */ }
}
function publicConfig_() {
  var key = publicCacheKey_(), cache = CacheService.getScriptCache(), cached = null;
  var privacy = privacy_();
  try { cached = JSON.parse(cache.get(key) || 'null'); } catch (_) { /* Fetch fresh on cache miss/failure. */ }
  if (cached && JSON.stringify(cached.privacy) === JSON.stringify(privacy)) return cached;
  // Notice properties are checked even on a cache hit, so edits cannot hide behind the server TTL.
  if (cached) { try { cache.remove(key); } catch (_) {} }
  var config = config_(database_(['providers', 'capacities']));
  if (key === publicCacheKey_()) {
    try { cache.put(key, JSON.stringify(config), KN.publicConfigTtlSeconds); } catch (_) { /* Never fail a read because caching failed. */ }
  }
  return config;
}
// Availability needs only providerId, time and status; never read contact/details columns.
function availabilitySnapshot_() {
  var db = database_(), types = ['providers', 'capacities'];
  var ranges = types.map(function(type) {
    return "'" + KN.schemas[type].name + "'!A:" + String.fromCharCode(64 + KN.schemas[type].keys.length);
  });
  ranges.push("'상담신청'!A1:P1", "'상담신청'!G2:G", "'상담신청'!I2:I", "'상담신청'!L2:L");
  var response = Sheets.Spreadsheets.Values.batchGet(db.getId(), { ranges: ranges, valueRenderOption: 'UNFORMATTED_VALUE' });
  types.forEach(function(type, index) {
    var values = response.valueRanges[index].values || [], keys = KN.schemas[type].keys;
    validateHeaders_(db, type, values[0] || []);
    db.records[type] = values.slice(1).map(function(row, i) {
      var result = { _row: i + 2 };
      keys.forEach(function(key, j) { result[key] = row[j] == null ? '' : row[j]; });
      return result;
    }).filter(function(row) { return row[keys[0]] !== ''; });
  });
  validateHeaders_(db, 'requests', (response.valueRanges[2].values || [])[0] || []);
  var columns = response.valueRanges.slice(3).map(function(range) { return range.values || []; });
  db.records.requests = Array.from({ length: Math.max.apply(null, columns.map(function(c) { return c.length; })) }, function(_, i) {
    return { providerId: (columns[0][i] || [''])[0], time: (columns[1][i] || [''])[0], status: (columns[2][i] || [''])[0] };
  });
  return db;
}
