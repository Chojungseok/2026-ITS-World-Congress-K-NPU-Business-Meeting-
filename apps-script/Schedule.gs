// Schedule is derived from central capacity rows. No new sheets/columns/properties.
function parseSlot_(value) {
  var match = typeof value === 'string' && /^(\d{2}):(\d{2}) – (\d{2}):(\d{2})$/.exec(value);
  if (!match) fail_('SCHEDULE_INVALID', '상담 시간 형식을 확인해 주세요.');
  var parts = match.slice(1).map(Number);
  if (parts[0] > 23 || parts[2] > 23 || parts[1] > 59 || parts[3] > 59)
    fail_('SCHEDULE_INVALID', '상담 시간 형식을 확인해 주세요.');
  var start = parts[0] * 60 + parts[1], end = parts[2] * 60 + parts[3];
  if (end - start !== 10) fail_('SCHEDULE_INVALID', '상담 시간은 같은 날의 10분 구간이어야 합니다.');
  return { start: start, end: end };
}
function nextSlot_(last) {
  var end = parseSlot_(last).end;
  if (end + 10 >= 24 * 60) fail_('SCHEDULE_LIMIT', '날짜 경계를 넘는 상담 시간은 추가할 수 없습니다.');
  function hhmm(minutes) { return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0'); }
  return hhmm(end) + ' – ' + hhmm(end + 10);
}
function operatingTimes_(db) {
  var slots = rows_(db,'capacities'), times = KN.times.slice(), next;
  // Only contiguous extensions belong to today's schedule. An old row manually
  // switched on cannot silently reintroduce the retired V1/V2 timetable.
  while (parseSlot_(times[times.length-1]).end + 10 < 1440) {
    next = nextSlot_(times[times.length-1]);
    if (!slots.some(function(s) { return s.time === next && active_(s.active) && KN.providers.some(function(p){return p.id === s.providerId;}); })) break;
    times.push(next);
  }
  return times;
}
function lastActiveSlot_(db) {
  var operating = operatingTimes_(db);
  var times = rows_(db, 'capacities').filter(function(s) {
    return operating.includes(s.time) && active_(s.active) && KN.providers.some(function(p) { return p.id === s.providerId; });
  }).map(function(s) { return s.time; });
  if (!times.length) fail_('SCHEDULE_INVALID', '운영 중인 상담 시간이 없습니다.');
  times.sort(function(a,b) { return parseSlot_(a).end - parseSlot_(b).end; });
  return times[times.length - 1];
}
function extendSchedule_(db, session, input) {
  // Called only by the admin POST allowlist while the common ScriptLock is held.
  var last = lastActiveSlot_(db);
  if (input.expectedLastTime !== last)
    fail_('SCHEDULE_CHANGED', '상담 시간이 이미 변경되었습니다. 최신 현황을 확인한 후 다시 연장해 주세요.');
  var next = nextSlot_(last), slots = rows_(db, 'capacities'), requests = rows_(db, 'requests');
  var now = iso_(), changes = [];
  KN.providers.forEach(function(p) {
    provider_(db, p.id, false);
    var existing = slots.filter(function(s) { return s.providerId === p.id && s.time === next; });
    if (existing.length > 1 || (existing.length && active_(existing[0].active)))
      fail_('SCHEDULE_CONFLICT', p.name + ' ' + next + ' 시간 설정이 중복되거나 이미 운영 중입니다.');
    var confirmed = confirmed_(requests, p.id, next);
    if (confirmed > 2) fail_('CAPACITY_CONFLICT', p.name + ' / ' + next + ' / 확정 ' + confirmed + '건: 정원 2건으로 연장할 수 없습니다.');
    // V2 retained old closed slots at 16:50 etc. Reopen their original row rather than
    // creating a duplicate provider×time; existing requests/history keep their IDs.
    var row = Object.assign({}, existing[0] || {}, { providerId:p.id, providerName:p.name,
      time:next, capacity:2, active:true, updatedAt:now, updatedBy:'ITS Korea 관리자' });
    var event = event_('시간 연장', 'admin', 'ITS Korea 관리자', row, '', '');
    event.occurredAt = now; event.beforeCapacity = existing.length ? existing[0].capacity : ''; event.afterCapacity = 2;
    changes.push({ type:'capacities', row:row._row, value:row }, { type:'history', value:event });
  });
  writeBatch_(db, changes); // One atomic capacity+4-event batch; publishes all scopes.
  return { previousLastTime:last, time:next, providerIds:KN.providers.map(function(p){return p.id;}), capacity:2 };
}
