/**
 * Editor only. Back up the private V2 DB and pause writes before running.
 * Idempotent: inspect all active slots before writing ANY changes.
 */
function migrateBusinessMeetingV3() {
  return withLock_(function() {
    var db = database_(['providers','capacities','requests']);
    var slots = rows_(db, 'capacities'), requests = rows_(db, 'requests'), conflicts = [], seen = {};
    var active = slots.filter(function(s) { return active_(s.active); });
    active.forEach(function(s) {
      provider_(db, s.providerId, false); parseSlot_(s.time);
      var key = s.providerId + '|' + s.time;
      if (seen[key]) fail_('SETUP_REQUIRED', '중복된 시간대별 정원 행을 먼저 확인하세요.');
      seen[key] = true;
      var count = confirmed_(requests, s.providerId, s.time);
      if (count > 2) conflicts.push(s.providerName + ' / ' + s.time + ' / 확정 ' + count + '건');
    });
    if (conflicts.length) fail_('CAPACITY_CONFLICT', 'V3 적용 중단. 기존 확정 상담을 보호합니다: ' + conflicts.join('; '));
    var now = iso_(), changes = active.filter(function(s) { return Number(s.capacity) !== 2; }).map(function(s) {
      return { type:'capacities', row:s._row, value:Object.assign({},s,{capacity:2,updatedAt:now,updatedBy:'migrateBusinessMeetingV3'}) };
    });
    // No application/history/credential edits, no schema changes, no setup/auth reset.
    writeBatch_(db, changes);
    invalidatePublicConfig_(); publishAllRevisions_();
    var result = { activeSlots:active.length, changedSlots:changes.length, capacity:2 };
    console.log('V3 migration: ' + JSON.stringify(result)); return result;
  });
}
