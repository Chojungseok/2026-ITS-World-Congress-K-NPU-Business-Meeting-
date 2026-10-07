// All secrets belong in Script Properties, never in this file.
var KN = {
  status: { pending: '승인대기', confirmed: '매칭확정', rejected: '매칭거절', cancelled: '신청취소' },
  providers: [
    { id: 'deepx', name: '딥엑스', english: 'DEEPX', capacity: 5 },
    { id: 'mobilint', name: '모빌린트', english: 'MOBILINT', capacity: 2 },
    { id: 'furiosa', name: '퓨리오사', english: 'FURIOSA', capacity: 1 },
    { id: 'rebellions', name: '리벨리온', english: 'REBELLIONS', capacity: 2 }
  ],
  times: ['16:50 – 17:00', '17:00 – 17:10', '17:10 – 17:20', '17:20 – 17:30'],
  sessionMs: 30 * 60 * 1000,
  publicConfigTtlSeconds: 30,
  schemas: {
    requests: { name: '상담신청',
      headers: ['신청ID','신청일시','ITS기업명','담당자명','연락처','이메일','NPU기업ID','NPU기업명','상담시간','참석인원','상담내용','상태','개인정보동의','개인정보동의시각','개인정보안내문버전','최종수정일시'],
      keys: ['id','createdAt','itsCompany','contactName','phone','email','providerId','providerName','time','attendees','details','status','privacyConsent','privacyConsentedAt','privacyNoticeVersion','updatedAt'] },
    capacities: { name: '시간대별정원',
      headers: ['NPU기업ID','NPU기업명','상담시간','최대상담건수','운영여부','최종수정일시','최종수정자'],
      keys: ['providerId','providerName','time','capacity','active','updatedAt','updatedBy'] },
    history: { name: '처리이력',
      headers: ['이벤트ID','처리시각','처리유형','처리자역할','처리자','신청ID','ITS기업명','NPU기업ID','상담시간','변경전상태','변경후상태','변경전정원','변경후정원'],
      keys: ['id','occurredAt','action','actorRole','actor','requestId','itsCompany','providerId','time','fromStatus','toStatus','beforeCapacity','afterCapacity'] },
    providers: { name: 'NPU설정',
      headers: ['NPU기업ID','NPU기업명','영문명','활성여부'],
      keys: ['id','name','english','active'] }
  }
};
function fail_(code, message) {
  var error = new Error(message);
  error.apiCode = code;
  throw error;
}
function props_() { return PropertiesService.getScriptProperties(); }
function iso_() { return new Date().toISOString(); }
function active_(value) { return value === true || value === 'TRUE'; }
function withLock_(action) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) fail_('BUSY', '다른 요청을 처리 중입니다. 잠시 후 다시 확인해 주세요.');
  try { return action(); } finally { lock.releaseLock(); }
}
function text_(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    fail_('VALIDATION', label + '을(를) 확인해 주세요.');
  return value.trim();
}
function email_(value) {
  var email = text_(value, 120, '이메일').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail_('VALIDATION', '이메일을 확인해 주세요.');
  return email;
}
function integer_(value, min, max) {
  if (!['string','number'].includes(typeof value) || String(value).trim() === '')
    fail_('VALIDATION', '숫자를 확인해 주세요.');
  var n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail_('VALIDATION', min + '~' + max + ' 사이의 정수를 입력해 주세요.');
  return n;
}
