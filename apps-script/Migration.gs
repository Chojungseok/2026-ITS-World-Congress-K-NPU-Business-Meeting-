/**
 * Editor-only V2 migration for the existing private DB. NEVER exposed through dispatch_.
 * Back up the Sheet and pause writes first. Does not run setupSystem/authentication.
 */
function migrateBusinessMeetingV2() {
  return withLock_(function() {
    var db = database_(), book = SpreadsheetApp.openById(db.getId());
    var sheet = book.getSheetByName(KN.schemas.requests.name);
    if (!sheet) fail_('SETUP_REQUIRED', '상담신청 시트가 없습니다.');
    // Do not call table_/rows_ for requests before the old header has been upgraded.
    var expected = KN.schemas.requests.headers, width = sheet.getMaxColumns();
    var header = sheet.getRange(1, 1, 1, Math.min(width, expected.length)).getValues()[0];
    if (expected.slice(0, -1).some(function(value, i) { return header[i] !== value; }) ||
        (header[16] && header[16] !== '거절사유') || sheet.getLastColumn() > expected.length ||
        (!header[16] && sheet.getLastColumn() > 16))
      fail_('SETUP_REQUIRED', '상담신청 기존 열 순서를 확인하세요. 마이그레이션은 데이터를 변경하지 않았습니다.');
    // All preflight validation and duplicate checks finish before any write.
    snapshot_(db, ['providers', 'capacities']);
    table_(db, 'history');
    var slots = rows_(db, 'capacities'), requests = [], now = iso_(), added = 0, closed = 0;
    KN.providers.forEach(function(p) {
      provider_(db, p.id, false);
      KN.previousTimes.concat(KN.times).forEach(function(time) {
        if (slots.filter(function(s) { return s.providerId === p.id && s.time === time; }).length > 1)
          fail_('SETUP_REQUIRED', '중복된 시간대별 정원 행을 먼저 확인하세요. 데이터를 변경하지 않았습니다.');
      });
    });
    function cells(table, row, column, values) {
      requests.push({ updateCells: { start: { sheetId: table.getSheetId(), rowIndex: row, columnIndex: column },
        rows: [{ values: values.map(function(value) {
          return { userEnteredValue: typeof value === 'boolean' ? { boolValue: value } :
            typeof value === 'number' ? { numberValue: value } : { stringValue: String(value) } };
        }) }], fields: 'userEnteredValue' } });
    }
    var headerAdded = header[16] !== '거절사유';
    if (headerAdded) {
      if (width < expected.length) requests.push({ appendDimension: {
        sheetId: sheet.getSheetId(), dimension: 'COLUMNS', length: expected.length - width } });
      cells(sheet, 0, 16, ['거절사유']); // Q1 only: existing application cells remain untouched.
    }
    var capacitySheet = table_(db, 'capacities'), nextRow = capacitySheet.getLastRow(), maxRows = capacitySheet.getMaxRows();
    KN.providers.forEach(function(p) {
      slots.filter(function(s) { return s.providerId === p.id && KN.previousTimes.includes(s.time) && active_(s.active); })
        .forEach(function(s) {
          cells(capacitySheet, s._row - 1, 4, [false, now, 'migrateBusinessMeetingV2']); closed++;
        });
      KN.times.forEach(function(time) {
        if (slots.some(function(s) { return s.providerId === p.id && s.time === time; })) return;
        if (nextRow >= maxRows) {
          requests.push({ appendDimension: { sheetId: capacitySheet.getSheetId(), dimension: 'ROWS', length: 1 } }); maxRows++;
        }
        cells(capacitySheet, nextRow++, 0, [p.id, p.name, time, p.capacity, true, now, 'migrateBusinessMeetingV2']); added++;
      });
    });
    // Same pending marker, writer lock and atomic Sheets commit as normal mutations.
    // All provider/admin/availability revisions are notified even for a header-only upgrade.
    var scopes = KN.providers.map(function(p) { return { type: 'capacities', value: { providerId: p.id } }; });
    executeBatch_(db, requests, scopes);
    // A no-op retry still refreshes public cache and all versions, including recovery
    // of a previously committed-but-unpublished migration. No Sheet data is rewritten.
    if (!requests.length) {
      invalidatePublicConfig_(); publishAllRevisions_();
    }
    var result = { headerAdded: headerAdded, oldSlotsClosed: closed, newSlotsAdded: added };
    console.log('V2 migration: ' + JSON.stringify(result)); // Counts only, no identity/secrets.
    return result;
  });
}
