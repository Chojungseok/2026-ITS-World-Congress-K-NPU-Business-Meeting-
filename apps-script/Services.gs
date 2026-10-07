function availability_(db, providerId) {
  var provider = provider_(db, providerId, true), requests = rows_(db, 'requests');
  return rows_(db, 'capacities').filter(function(s) { return s.providerId === provider.id; }).map(function(s) {
    return { time: s.time, confirmed: confirmed_(requests, provider.id, s.time),
      capacity: integer_(s.capacity, 0, 50), active: active_(s.active) };
  });
}
function submit_(db, input) {
  var company = text_(input.itsCompany, 80, '기업명');
  var contact = text_(input.contactName, 40, '담당자명');
  var phone = text_(input.phone, 24, '연락처');
  if (!/^[0-9+()\s-]{7,24}$/.test(phone)) fail_('VALIDATION', '연락처를 확인해 주세요.');
  var email = email_(input.email), details = text_(input.details, 1000, '상담내용');
  var attendees = integer_(input.attendees, 1, 20);
  if (input.privacyConsent !== true) fail_('CONSENT_REQUIRED', '개인정보 수집·이용 동의가 필요합니다.');
  var privacy = privacy_();
  if (input.privacyNoticeVersion !== privacy.version)
    fail_('NOTICE_CHANGED', '개인정보 안내가 변경되었습니다. 페이지를 새로고침하고 다시 확인해 주세요.');
  var provider = provider_(db, input.providerId, true), slot = slot_(db, provider.id, input.time);
  var requests = rows_(db, 'requests');
  if (requests.some(function(r) {
    return String(r.email).trim().toLowerCase() === email && String(r.itsCompany).trim().toLowerCase() === company.toLowerCase() &&
      r.providerId === provider.id && r.time === slot.time && [KN.status.pending, KN.status.confirmed].includes(r.status);
  })) fail_('DUPLICATE', '동일한 기업·이메일·NPU·시간의 진행 중인 신청이 있습니다. 신청 현황을 확인해 주세요.');
  if (!active_(slot.active) || confirmed_(requests, provider.id, slot.time) >= slot.capacity)
    fail_('CAPACITY_FULL', '선택한 시간은 신청할 수 없습니다. 다른 시간을 선택해 주세요.');
  var now = iso_();
  var row = {
    id: 'KN-' + Utilities.getUuid().toUpperCase(), createdAt: now, itsCompany: company, contactName: contact,
    phone: phone, email: email, providerId: provider.id, providerName: provider.name, time: slot.time,
    attendees: attendees, details: details, status: KN.status.pending, privacyConsent: true,
    privacyConsentedAt: now, privacyNoticeVersion: privacy.version, updatedAt: now
  };
  commit_(db, 'requests', row, event_('신청', 'applicant', company, row, '', row.status));
  return publicRow_(row);
}
function cancel_(db, input) {
  var row = verifiedRequest_(db, input);
  if (row.status === KN.status.cancelled) return publicRow_(row); // Safe retry after a lost response.
  if (![KN.status.pending, KN.status.confirmed].includes(row.status)) fail_('INVALID_STATE', '취소할 수 없는 신청입니다.');
  slot_(db, row.providerId, row.time); // Read authoritative slot even when it is closed.
  var previous = row.status;
  row.status = KN.status.cancelled; row.updatedAt = iso_();
  commit_(db, 'requests', row, event_('취소', 'applicant', row.itsCompany, row, previous, row.status));
  return publicRow_(row);
}
function decide_(db, session, input) {
  var provider = provider_(db, session.providerId, true), requests = rows_(db, 'requests');
  var row = requests.find(function(r) { return r.id === input.id && r.providerId === session.providerId; });
  if (!row) fail_('NOT_FOUND', '처리할 신청을 찾을 수 없습니다.');
  if (![KN.status.confirmed, KN.status.rejected].includes(input.decision)) fail_('VALIDATION', '승인 또는 거절을 선택해 주세요.');
  if (row.status === input.decision) return publicRow_(row);
  if (row.status !== KN.status.pending) fail_('INVALID_STATE', '승인대기 신청만 처리할 수 있습니다.');
  var slot = slot_(db, session.providerId, row.time);
  if (input.decision === KN.status.confirmed && (!active_(slot.active) || confirmed_(requests, session.providerId, row.time) >= slot.capacity))
    fail_('CAPACITY_FULL', '이 시간의 정원이 마감되었거나 운영이 중단되었습니다.');
  var previous = row.status;
  row.status = input.decision; row.updatedAt = iso_();
  commit_(db, 'requests', row, event_(input.decision === KN.status.confirmed ? '승인' : '거절', 'provider', provider.name, row, previous, row.status));
  return publicRow_(row);
}
function capacity_(db, session, input) {
  var provider = provider_(db, session.providerId, true);
  var capacity = integer_(input.capacity, 0, 50), slot = slot_(db, provider.id, input.time);
  if (capacity < confirmed_(rows_(db, 'requests'), provider.id, slot.time))
    fail_('CAPACITY_TOO_SMALL', '이미 확정된 상담 건수보다 정원을 줄일 수 없습니다.');
  if (capacity !== slot.capacity) {
    var event = event_('정원 변경', 'provider', provider.name, slot, '', '');
    event.beforeCapacity = slot.capacity; event.afterCapacity = capacity;
    slot.capacity = capacity; slot.updatedAt = iso_(); slot.updatedBy = provider.name;
    commit_(db, 'capacities', slot, event);
  }
  return { providerId: provider.id, time: slot.time, capacity: capacity };
}
