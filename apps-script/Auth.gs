function secret_() {
  var secret = props_().getProperty('TOKEN_SIGNING_SECRET');
  if (!secret || secret.length < 48) fail_('SETUP_REQUIRED', '서버 인증 설정이 필요합니다.');
  return secret;
}
function hmac_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(value, secret_(), Utilities.Charset.UTF_8)).replace(/=+$/, '');
}
function equal_(a, b) {
  a = String(a); b = String(b);
  var difference = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}
// Run only from the editor after entering real credentials in Script Properties.
// Converts credentials to keyed hashes and removes the original plaintext properties.
function configureAuthentication() {
  return withLock_(function() {
    secret_();
    var properties = props_(), updates = {}, remove = [];
    var keys = KN.providers.map(function(p) { return 'PROVIDER_CODE_' + p.id.toUpperCase(); }).concat(['ADMIN_PASSWORD']);
    keys.forEach(function(key) {
      var value = properties.getProperty(key);
      if (value !== null) {
        if (value.length < 12 || value.length > 128 || /^(deepx|mobilint|furiosa|rebellions)20261022$/i.test(value) || value === 'ITSKOREA9911!')
          fail_('SETUP_REQUIRED', '데모 코드 대신 12~128자의 새로운 운영 인증정보를 설정해 주세요.');
        updates[key + '_HASH'] = hmac_('credential:' + key + ':' + value);
        remove.push(key);
      } else if (!properties.getProperty(key + '_HASH')) {
        fail_('SETUP_REQUIRED', '모든 기업 승인코드와 관리자 비밀번호를 Script Properties에 설정해 주세요.');
      }
    });
    var adminId = properties.getProperty('ADMIN_ID');
    if (!adminId || adminId === 'ITSKOREA9911' || adminId.length > 80)
      fail_('SETUP_REQUIRED', '새로운 운영 관리자 ID를 설정해 주세요.');
    properties.setProperties(updates, false);
    remove.forEach(function(key) { properties.deleteProperty(key); });
    Object.keys(properties.getProperties()).forEach(function(key) {
      if (key.indexOf('SESSION_') === 0 || key.indexOf('ATTEMPTS_') === 0) properties.deleteProperty(key);
    });
    console.log('운영 인증정보 설정 완료. 기존 세션은 해제되었습니다. 인증정보를 로그에 출력하지 않습니다.');
  });
}
function checkCredential_(key, supplied) {
  var stored = props_().getProperty(key + '_HASH');
  // Hash both valid and invalid attempts; never compare the real plaintext password.
  var candidate = typeof supplied === 'string' && supplied.length <= 128 ? supplied : '';
  return equal_(hmac_('credential:' + key + ':' + candidate), stored || '') && !!stored;
}
function throttle_(bucket, success) {
  var key = 'ATTEMPTS_' + bucket, properties = props_();
  var state = JSON.parse(properties.getProperty(key) || 'null');
  var now = Date.now();
  if (!state || state.until <= now) state = { count: 0, until: now + 15 * 60 * 1000 };
  if (success === true) { properties.deleteProperty(key); return; }
  if (state.count >= 10) fail_('RATE_LIMITED', '인증 시도가 많습니다. 15분 후 다시 시도해 주세요.');
  if (success === false) { state.count++; properties.setProperty(key, JSON.stringify(state)); }
}
function issueToken_(role, providerId) {
  var properties = props_(), all = properties.getProperties(), now = Date.now(), count = 0;
  Object.keys(all).filter(function(key) { return key.indexOf('SESSION_') === 0; }).forEach(function(key) {
    if (Number(all[key]) <= now) properties.deleteProperty(key); else count++;
  });
  if (count >= 200) fail_('BUSY', '로그인 세션이 많습니다. 잠시 후 다시 시도해 주세요.');
  var payload = { role: role, providerId: providerId || null, expiresAt: now + KN.sessionMs, jti: Utilities.getUuid() };
  var encoded = Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8).replace(/=+$/, '');
  properties.setProperty('SESSION_' + payload.jti, String(payload.expiresAt));
  return encoded + '.' + hmac_('token:' + encoded);
}
function session_(token, role) {
  function invalid() { fail_('UNAUTHORIZED', '로그인이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.'); }
  if (typeof token !== 'string' || token.length > 2048) invalid();
  var parts = token.split('.');
  if (parts.length !== 2 || !equal_(hmac_('token:' + parts[0]), parts[1])) invalid();
  var payload;
  try { payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); }
  catch (_) { invalid(); }
  if (!payload || !['provider','admin'].includes(payload.role) || !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now() || payload.expiresAt > Date.now() + KN.sessionMs ||
      typeof payload.jti !== 'string' || !/^[a-zA-Z0-9-]+$/.test(payload.jti) ||
      Number(props_().getProperty('SESSION_' + payload.jti)) !== payload.expiresAt) invalid();
  if (role && payload.role !== role) fail_('FORBIDDEN', '이 기능에 접근할 권한이 없습니다.');
  if (payload.role === 'provider' && !KN.providers.some(function(p) { return p.id === payload.providerId; })) invalid();
  return payload;
}
function authenticateProvider_(db, input) {
  var provider = provider_(db, input.providerId, true);
  var bucket = 'PROVIDER_' + provider.id.toUpperCase();
  throttle_(bucket);
  if (!checkCredential_('PROVIDER_CODE_' + provider.id.toUpperCase(), input.approvalCode)) {
    throttle_(bucket, false); fail_('INVALID_CREDENTIALS', '기업과 승인코드를 확인해 주세요.');
  }
  throttle_(bucket, true);
  return issueToken_('provider', provider.id);
}
function authenticateAdmin_(input) {
  throttle_('ADMIN');
  if (!props_().getProperty('ADMIN_ID')) fail_('SETUP_REQUIRED', '운영 관리자 인증 설정이 필요합니다.');
  var idMatch = equal_(hmac_('admin-id:' + String(input.id || '').slice(0, 80)), hmac_('admin-id:' + props_().getProperty('ADMIN_ID')));
  var passwordMatch = checkCredential_('ADMIN_PASSWORD', input.password);
  if (!idMatch || !passwordMatch) { throttle_('ADMIN', false); fail_('INVALID_CREDENTIALS', '관리자 인증정보를 확인해 주세요.'); }
  throttle_('ADMIN', true);
  return issueToken_('admin', null);
}
function verifiedRequest_(db, input) {
  // The same response is used for missing IDs and wrong emails, without returning PII.
  var id = typeof input.id === 'string' ? input.id.trim().toUpperCase().slice(0, 80) : '';
  var email = typeof input.email === 'string' ? input.email.trim().toLowerCase().slice(0, 120) : '';
  if (!id || !email) fail_('NOT_FOUND', '신청ID와 신청 이메일을 확인해 주세요.');
  var cache = CacheService.getScriptCache(), key = 'LOOKUP_' + hmac_(id), attempts = Number(cache.get(key) || 0);
  if (attempts >= 10) fail_('RATE_LIMITED', '조회 시도가 많습니다. 잠시 후 다시 시도해 주세요.');
  var row = rows_(db, 'requests').find(function(r) { return r.id === id; });
  if (!row || !equal_(hmac_('email:' + email), hmac_('email:' + String(row.email).toLowerCase()))) {
    cache.put(key, String(attempts + 1), 900);
    fail_('NOT_FOUND', '신청ID와 신청 이메일을 확인해 주세요.');
  }
  cache.remove(key);
  return row;
}

function findRequestIds_(db, input) {
  // Ephemeral verification only. Never write submitted identity or matches to DB/properties/logs.
  var missing = function() { fail_('NOT_FOUND', '입력하신 정보와 일치하는 신청을 찾을 수 없습니다.'); };
  function normalized(value, max) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) missing();
    return value.trim();
  }
  var company = normalized(input.itsCompany, 80), contact = normalized(input.contactName, 40);
  var phone = normalized(input.phone, 24).replace(/\D/g, '');
  var email = normalized(input.email, 120).toLowerCase();
  if (!phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) missing();
  // Email bucket is stable even if the other three fields are varied. Count successes
  // as well as misses; only an opaque keyed hash and count live in the short-lived cache.
  var cache = CacheService.getScriptCache(), key = 'FIND_IDS_' + hmac_('find-ids:' + email);
  var attempts = Number(cache.get(key) || 0);
  if (attempts >= 10) fail_('RATE_LIMITED', '조회 시도가 많습니다. 15분 후 다시 시도해 주세요.');
  cache.put(key, String(attempts + 1), 900); // Protected by the same lookup lock.
  var rows = rows_(db, 'requests').filter(function(r) {
    return String(r.itsCompany).trim() === company && String(r.contactName).trim() === contact &&
      String(r.phone).replace(/\D/g, '') === phone && String(r.email).trim().toLowerCase() === email;
  });
  if (!rows.length) missing();
  rows.sort(function(a, b) { return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b._row - a._row; });
  return rows.map(function(r) {
    var provider = KN.providers.find(function(p) { return p.id === r.providerId; });
    return { id: r.id, createdAt: r.createdAt, providerName: r.providerName || (provider && provider.name) || '',
      time: r.time, status: r.status };
  });
}
