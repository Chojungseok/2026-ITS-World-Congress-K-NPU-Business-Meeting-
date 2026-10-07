/**
 * Run manually once in the Apps Script editor, after enabling the Sheets API service.
 * Safe to re-run: preserves applications, audit history, credentials and capacities.
 */
function setupSystem() {
  return withLock_(function() {
    var properties = props_(), id = properties.getProperty('SHEET_ID');
    var db;
    if (id) {
      // A missing/inaccessible existing DB is an error: never create a replacement silently.
      db = SpreadsheetApp.openById(id);
    } else {
      db = SpreadsheetApp.create('K-NPU Business Meeting DB');
      properties.setProperty('SHEET_ID', db.getId());
    }
    db.setSpreadsheetTimeZone('Asia/Seoul');
    var context = databaseContext_(db.getId(), db);
    Object.keys(KN.schemas).forEach(function(type) {
      var schema = KN.schemas[type];
      var sheet = db.getSheetByName(schema.name) || db.insertSheet(schema.name);
      if (sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, schema.headers.length).setValues([schema.headers]);
        sheet.setFrozenRows(1);
      }
      table_(context, type); // Refuse a changed header instead of overwriting existing data.
    });
    SpreadsheetApp.flush();
    var existingProviders = rows_(context, 'providers'), existingSlots = rows_(context, 'capacities');
    var changes = [], now = iso_();
    KN.providers.forEach(function(provider) {
      if (!existingProviders.some(function(p) { return p.id === provider.id; }))
        changes.push({ type: 'providers', value: { id: provider.id, name: provider.name, english: provider.english, active: true } });
      KN.times.forEach(function(time) {
        var found = existingSlots.filter(function(s) { return s.providerId === provider.id && s.time === time; });
        if (found.length > 1) fail_('SETUP_REQUIRED', '중복된 시간대별 정원 행을 확인해 주세요.');
        if (!found.length) changes.push({ type: 'capacities', value: {
          providerId: provider.id, providerName: provider.name, time: time, capacity: provider.capacity,
          active: true, updatedAt: now, updatedBy: 'setupSystem'
        } });
      });
    });
    writeBatch_(context, changes);
    if (!properties.getProperty('TOKEN_SIGNING_SECRET'))
      properties.setProperty('TOKEN_SIGNING_SECRET', Utilities.getUuid() + Utilities.getUuid());
    if (!properties.getProperty('PRIVACY_NOTICE_VERSION'))
      properties.setProperty('PRIVACY_NOTICE_VERSION', 'knpu-2026-v1');
    console.log('DB URL: ' + db.getUrl());
    console.log('공유 설정이 제한됨(Restricted)인지 직접 확인하고 configureAuthentication()을 실행하세요.');
    return db.getUrl();
  });
}

// Editor-only: run after manual NPU/operating-status edits. No public API route.
function refreshPublicConfig() {
  withLock_(function() { invalidatePublicConfig_(); publishAllRevisions_(); });
  console.log('공개 설정 캐시를 갱신했습니다.');
}
