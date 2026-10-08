import { PROVIDERS, TIMES, STATUS, providerById, capacityFor, isSlotOpen, PRIVACY_NOTICE } from './config.js';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
import { PROVIDER_LOGOS } from './logos.js';
import { BROCHURES } from './brochures.js';
const e = escapeHtml;
let demo = true;
export function setViewContext(context) { demo = context.demo; }
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h2m4 0h2M8 11h2m4 0h2M10 21v-6h4v6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-5"/>',
  reset: '<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>'
};
export const icon = name => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.grid) + '</svg>';
export const statusClass = status => ({ [STATUS.PENDING]: 'pending', [STATUS.CONFIRMED]: 'confirmed', [STATUS.REJECTED]: 'rejected', [STATUS.CANCELLED]: 'cancelled' }[status] || 'cancelled');
export const badge = status => '<span class="badge ' + statusClass(status) + '"><i></i>' + e(status) + '</span>';
export const mark = value => {
  const provider = { ...providerById(value.id), ...value }, logo = PROVIDER_LOGOS[provider.id];
  return '<span class="provider-mark provider-logo '+(logo?.dark ? 'logo-dark' : '')+'">' +
    (logo ? '<img data-provider-logo src="./assets/logos/'+e(logo.file)+'" alt="'+e(logo.alt)+'" width="'+logo.width+'" height="'+logo.height+'" loading="lazy" decoding="async">' : '') +
    '<span class="logo-fallback" '+(logo?'hidden':'')+'>'+e(provider.english || provider.name)+'</span></span>';
};
export const options = (items, first) => '<option value="">' + first + '</option>' + items.map(item => typeof item === 'string' ? '<option value="' + e(item) + '">' + e(item) + '</option>' : '<option value="' + e(item.id) + '">' + e(item.name) + '</option>').join('');
const dateFormatter = new Intl.DateTimeFormat('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Seoul' });
const logDateFormatter = new Intl.DateTimeFormat('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone:'Asia/Seoul' });
export const dateText = date => dateFormatter.format(new Date(date));

export function shell() {
  return `<aside class="sidebar" id="sidebar">
    <a href="#home" class="brand" aria-label="K-NPU Connect 홈"><span class="brand-symbol">K<span>↗</span></span><span>K-NPU <strong>Connect</strong><small>BUSINESS MATCHING PLATFORM</small></span></a>
    <div class="event-label"><span class="live-dot"></span> 강릉 K-NPU 전환 밋업</div>
    <nav aria-label="주 메뉴">
      <p class="nav-label">비즈매칭</p>
      <a href="#apply" data-route="apply">${icon('plus')}<span>상담 신청</span>${icon('chevron')}</a>
      <a href="#lookup" data-route="lookup">${icon('search')}<span>신청 현황 확인</span></a>
      <a href="#brochures" data-route="brochures">${icon('file')}<span>NPU 기업 소개자료</span></a>
      <p class="nav-label management-label">파트너 & 운영</p>
      <a href="#npu" data-route="npu">${icon('building')}<span>NPU 승인 관리</span></a>
      <a href="#matching" data-route="matching" hidden>${icon('clock')}<span>매칭 현황</span></a>
      <a href="#admin" data-route="admin">${icon('grid')}<span>운영 대시보드</span></a>
    </nav>
    <div class="sidebar-bottom">
      <div class="help-card"><span class="help-icon">${icon('shield')}</span><strong>함께 만드는 AI 전환</strong><p>ITS 산업과 NPU 기술의 만남,<br>새로운 협력을 시작하세요.</p><span class="organizer">ITS <b>KOREA</b></span></div>
      <button class="reset-button" id="reset-demo" ${demo ? '': 'hidden'}>${icon('reset')} 데모 데이터 초기화</button>
      <p class="sidebar-version">K-NPU Connect <span>${demo ? 'Local prototype' : 'Business meeting'}</span></p>
    </div>
  </aside>
  <div class="workspace">
    <header class="topbar"><div class="event-identity"><span>2026 강릉 ITS 세계총회</span><strong>K-NPU Business Meeting</strong><small>Beyond Mobility, Connected World · October 19–23, 2026</small></div><div class="topbar-controls"><div class="breadcrumb"><button class="icon-button mobile-menu" id="menu-toggle" aria-label="메뉴 열기" aria-expanded="false" aria-controls="sidebar">${icon('menu')}</button><span>비즈매칭 플랫폼</span><span class="separator">/</span><strong id="route-title">상담 신청</strong></div><div class="topbar-right"><span class="demo-pill"><i></i> ${demo ? '로컬 데모' : '비즈매칭'}</span><span class="topbar-divider"></span><span class="profile-avatar">K</span><span class="profile-name">ITS Korea</span><button class="text-button" id="provider-logout" hidden>로그아웃</button></div></div></header>
    <main id="main" tabindex="-1"></main>
    <footer class="footer"><span>© K-NPU Connect · ITS Korea</span><span>ITS와 NPU, 가능성을 연결합니다.</span></footer>
  </div>`;
}

export function applyPage(providers = PROVIDERS.filter(p => p.active !== false)) {
  return `<section class="hero">
    <div class="hero-content"><span class="eyebrow"><span></span> CONNECT TO THE NEXT</span><h1>새로운 협력의 시작,<br><em>K-NPU 비즈매칭</em></h1><p>우리 기업에 맞는 NPU 파트너를 만나보세요.<br>1:1 기술 상담으로 AI 전환의 다음 단계를 함께합니다.</p><div class="hero-tags"><span>${icon('users')} 4개 NPU 파트너</span><span>${icon('clock')} 1:1 맞춤 상담</span></div></div>
    </section>
  <div class="notice">${icon('info')}<p>${demo ? '<strong>프로토타입 안내</strong> 이 브라우저에만 저장되는 로컬 데모입니다. 예시 정보로 테스트해 주세요.' : '<strong>상담 신청 안내</strong> 신청 정보는 ITS Korea의 비즈매칭 운영을 위해 저장됩니다.'} 상담은 <span data-schedule-range>${scheduleRange()}</span> 시간대에 10분 단위로 진행됩니다.</p></div>
  <div class="section-heading"><div><span class="eyebrow gray">BUSINESS MEETING</span><h2>1:1 상담 신청</h2><p>기업 정보와 희망하는 상담을 입력해 주세요.</p></div><span class="required-note"><b>*</b> 필수 입력 항목</span></div>
  <div class="application-layout">
  <form id="application-form" class="form-card">
    <div class="form-step-bar"><span class="active"><b>01</b> 기업 정보</span><i></i><span><b>02</b> 상담 선택</span><i></i><span><b>03</b> 신청 제출</span></div>
    <section class="form-section"><div class="form-section-title"><span class="section-icon">${icon('building')}</span><h3>기업 및 담당자 정보</h3></div>
    <div class="field-grid"><label class="field full">ITS 기업명 <b>*</b><input name="itsCompany" autocomplete="organization" maxlength="80" placeholder="기업명을 입력해 주세요" required></label>
    <label class="field">담당자명 <b>*</b><input name="contactName" autocomplete="name" maxlength="40" placeholder="성함을 입력해 주세요" required></label>
    <label class="field">연락처 <b>*</b><input name="phone" type="tel" autocomplete="tel" maxlength="24" placeholder="010-0000-0000" required></label>
    <label class="field full">이메일 <b>*</b><input name="email" type="email" autocomplete="email" maxlength="120" placeholder="name@company.com" required><small>상담 관련 연락과 신청 확인에 사용하는 이메일입니다. 자동 확인 메일은 발송되지 않습니다.</small></label></div></section>
    <section class="form-section"><div class="form-section-title"><span class="section-icon">${icon('users')}</span><h3>상담 파트너 및 시간</h3></div>
    <fieldset class="provider-fieldset"><legend>상담 희망 NPU 기업 <b>*</b></legend><div class="provider-grid">${providerOptions(providers)}</div></fieldset>
    <fieldset class="time-fieldset"><legend>상담 희망 시간 <b>*</b><span class="legend-extra">10분 단위 · <span data-schedule-range>${scheduleRange()}</span></span></legend><div id="time-options" class="time-grid"><p>시간을 불러오는 중입니다.</p></div><p class="field-hint">${icon('info')} 승인대기 신청은 정원에 포함되지 않으며, NPU 기업의 승인 시 확정됩니다.</p></fieldset>
    <label class="field attendees-field">참석인원 <b>*</b><span class="number-input"><input name="attendees" type="number" min="1" max="20" step="1" value="1" required><span>명</span></span></label></section>
    <section class="form-section"><div class="form-section-title"><span class="section-icon">${icon('file')}</span><h3>상담 내용</h3></div><label class="field">상담하고 싶은 내용을 알려주세요 <b>*</b><textarea name="details" rows="5" maxlength="1000" placeholder="도입을 검토 중인 서비스, 기술 과제, 협력하고 싶은 분야 등을 자유롭게 작성해 주세요." required></textarea></label><div class="textarea-footer"><span>구체적으로 작성하면 더욱 알찬 상담을 준비할 수 있습니다.</span><span id="character-count">0 / 1,000</span></div></section>
    <div class="form-submit"><label class="consent"><input name="consent" type="checkbox" required><span>${demo ? '입력한 데모 정보가 이 브라우저에 저장됨을 확인했습니다.' : '입력한 신청 정보와 저장 방식 안내를 확인했습니다.'} <b>*</b></span></label>${privacyConsent()}<p class="inline-error" id="application-error" role="alert" hidden></p><button type="submit" class="button primary submit-button">상담 신청하기 ${icon('arrow')}</button><p class="submit-note">${icon('shield')} 신청 후 NPU 기업의 승인을 거쳐 매칭이 확정됩니다.</p></div>
  </form>
  <aside class="application-aside"><section class="panel summary-panel"><span class="eyebrow gray">YOUR MEETING</span><h3>신청 요약</h3><div id="selection-summary"></div><div class="summary-status"><span class="live-dot"></span> 신청 시 <strong>승인대기</strong>로 접수됩니다.</div></section>
  <section class="panel brochure-tip"><h3>NPU 기업 소개자료</h3><p>상담 전에 파트너의 기술과 기업 소개자료를 확인하세요.</p><a href="#brochures" class="text-button">소개자료 보기 ${icon('arrow')}</a></section>
  <section class="panel process-panel"><h3>비즈매칭 진행 안내</h3><ol class="timeline"><li><span>1</span><div><strong>상담 신청</strong><p>희망 기업과 시간을 선택해<br>상담을 신청합니다.</p></div></li><li><span>2</span><div><strong>NPU 기업 검토</strong><p>파트너 기업이 상담 내용을<br>확인하고 승인합니다.</p></div></li><li><span>3</span><div><strong>1:1 비즈매칭 확정</strong><p>신청 확인에서 결과를 확인하고<br>파트너를 만나보세요.</p></div></li></ol></section>
  <div class="aside-tip">${icon('info')}<p>신청 완료 후 발급되는 <strong>신청ID</strong>를 보관해 주세요. 신청ID와 신청 이메일로 신청 상태를 확인할 수 있습니다.</p></div></aside></div>`;
}

export function timeOptions(slots, selected) {
  return slots.map(slot => {
    const full = slot.active === false || slot.confirmed >= slot.capacity;
    return `<label class="time-option ${full ? 'full' : ''}"><input type="radio" name="time" value="${e(slot.time)}" ${selected === slot.time && !full ? 'checked' : ''} ${full ? 'disabled' : ''} required><span><strong>${e(slot.time)}</strong><small>${(slot.active === false || slot.capacity === 0) ? '접수 중단' : full ? '정원 마감 · ' + slot.capacity + '건' : '잔여 ' + (slot.capacity - slot.confirmed) + ' / ' + slot.capacity + '건'}<i></i></small></span></label>`;
  }).join('');
}
export function selectionSummary(providerId, time, attendees) {
  const p = providerById(providerId);
  if (!p) return '<p>운영 중인 NPU 기업을 선택해 주세요.</p>';
  return `<div class="summary-provider">${mark(p)}<div><strong>${e(p.name)}</strong><small>${e(p.english)}</small></div></div><dl class="summary-list"><div><dt>${icon('clock')} 상담 시간</dt><dd>${e(time || '시간을 선택해 주세요')}</dd></div><div><dt>${icon('users')} 참석인원</dt><dd>${e(attendees || '1')}명</dd></div></dl>`;
}
export function pageHeading(eyebrow, title, text, action = '') {
  return `<div class="page-heading"><div><span class="eyebrow gray">${eyebrow}</span><h1>${title}</h1><p>${text}</p></div>${action}</div>`;
}
export const empty = (title, text) => `<div class="empty-state">${icon('search')}<h3>${title}</h3><p>${text}</p></div>`;

export function lookupPage() {
  return pageHeading('MY MEETING', '신청 현황 확인', '신청ID와 신청 이메일을 입력하면 상담 신청 현황을 확인할 수 있습니다.') + lookupTabs('lookup') + `<div class="lookup-layout">
    <section class="panel lookup-form-panel"><div class="section-icon large">${icon('search')}</div><h2>신청 내역 조회</h2><p>신청 완료 화면에서 발급받은 신청ID와 신청 시 입력한 이메일을 입력해 주세요.</p>
      <form id="lookup-form">
        <label class="field">신청ID <b>*</b><input name="id" placeholder="KN-…" autocomplete="off" spellcheck="false" maxlength="80" required></label>
        <label class="field">신청 이메일 <b>*</b><input name="email" type="email" autocomplete="email" maxlength="120" required placeholder="name@company.com"></label><p id="lookup-error" class="inline-error" role="alert" hidden></p>
        <button class="button primary" type="submit">신청 현황 조회 ${icon('arrow')}</button>
      </form>
      <div class="demo-example" ${demo ? '' : 'hidden'}><strong>예시 신청으로 둘러보기</strong><span>DEMO-0001</span><button type="button" class="text-button" id="fill-example">예시 신청ID 입력 ${icon('arrow')}</button></div>
    </section>
    <section id="lookup-result" aria-live="polite" class="panel lookup-result">${empty('신청 상태를 확인해 보세요', '조회한 신청의 상담 정보와 진행 상태가 여기에 표시됩니다.')}</section>
  </div>`;
}

export function requestDetail(row, { cancel = false } = {}) {
  const p = { ...providerById(row.providerId), ...(row.providerName ? { name: row.providerName } : {}) };
  return `<div class="detail-header"><span class="eyebrow gray">MEETING REQUEST</span>${badge(row.status)}</div><h2 class="detail-company">${e(row.itsCompany)}</h2><p class="muted detail-id">${e(row.id)}</p><div class="detail-partner">${mark(p)}<div><small>상담 파트너</small><strong>${e(p.name)}</strong></div><div class="detail-time">${icon('clock')} ${e(row.time)}</div></div><dl class="detail-grid"><div><dt>담당자</dt><dd>${e(row.contactName)}</dd></div><div><dt>참석인원</dt><dd>${e(row.attendees)}명</dd></div><div><dt>이메일</dt><dd>${e(row.email)}</dd></div><div><dt>연락처</dt><dd>${e(row.phone)}</dd></div><div><dt>신청일시</dt><dd>${dateText(row.createdAt)}</dd></div></dl><div class="detail-description"><h3>상담내용</h3><p>${e(row.details)}</p></div>${row.status === STATUS.REJECTED && typeof row.rejectionReason === 'string' && row.rejectionReason.trim() ? '<div class="detail-description rejection-reason"><h3>거절 사유</h3><p>' + e(row.rejectionReason) + '</p></div>' : ''}${cancel && [STATUS.PENDING, STATUS.CONFIRMED].includes(row.status) ? '<div class="detail-actions"><p>일정이 변경되었나요? 신청을 취소할 수 있습니다.</p><button class="button danger-outline" id="cancel-request">신청 취소</button></div>' : ''}`;
}

export function providerLogin() {
  return pageHeading('PARTNER WORKSPACE', 'NPU 승인 관리', '우리 기업에 들어온 상담 신청을 확인하고 새로운 파트너를 만나보세요.') + `<div class="partner-login-layout"><section class="partner-intro"><span class="intro-icon">${icon('building')}</span><h2>가능성 있는 만남을<br>비즈니스로 연결하세요.</h2><p>상담 내용을 검토하고 승인하면<br>1:1 비즈매칭이 확정됩니다.</p><ul><li>${icon('check')} 기업별 상담 신청 조회</li><li>${icon('check')} 시간대별 확정 현황 확인</li><li>${icon('check')} 신청 승인 및 거절</li></ul><div class="partner-logos">${PROVIDERS.map(mark).join('')}</div></section><section class="panel partner-login"><span class="eyebrow gray">NPU PARTNER</span><h2>${demo ? 'NPU 기업 로컬 확인' : 'NPU 기업 로그인'}</h2><p>기업을 선택하고 사전 부여받은 승인코드를 입력해 주세요.</p><form id="provider-login-form"><label class="field">NPU 기업<select name="providerId" required>${options(PROVIDERS.filter(p => p.active !== false), '기업을 선택하세요')}</select></label><label class="field">기업별 승인코드 <span class="small-badge">${demo ? '로컬 확인' : '기업 인증'}</span><input type="password" name="approvalCode" placeholder="기업별 승인코드를 입력해 주세요" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="128" required></label><div class="notice compact">${icon('info')}<p>${demo ? '로컬 테스트용 승인코드를 확인합니다.' : '사전 부여받은 운영 승인코드를 입력해 주세요. 로그인은 30분간 유지됩니다.'}</p></div><p id="provider-login-error" role="alert" class="inline-error" hidden></p><button class="button primary" type="submit">승인코드 확인 후 입장 ${icon('arrow')}</button></form></section></div>`;
}

export function stats(requests, includeTotal = true) {
  const list = includeTotal ? [['전체 신청', null, 'file'], ['승인대기', STATUS.PENDING, 'clock'], ['매칭확정', STATUS.CONFIRMED, 'check'], ['매칭거절', STATUS.REJECTED, 'close'], ['신청취소', STATUS.CANCELLED, 'close']] : [['승인대기', STATUS.PENDING, 'clock'], ['매칭확정', STATUS.CONFIRMED, 'check'], ['매칭거절', STATUS.REJECTED, 'close']];
  return `<div class="stats-grid ${includeTotal ? 'five' : 'three'}">${list.map(([label, status, glyph]) => `<section class="stat-card ${statusClass(status)}"><div><span>${label}</span><strong>${status ? requests.filter(row => row.status === status).length : requests.length}<small>건</small></strong></div><span class="stat-icon">${icon(glyph)}</span></section>`).join('')}</div>`;
}
export function providerPage(providerId, requests, filter = '', p = providerById(providerId)) {
  return pageHeading('PARTNER WORKSPACE', e(p.name) + ' 상담 신청 관리', '신청 내용을 검토한 후 승인 또는 거절해 주세요.') +
    `<div class="notice">${icon('info')}<p><strong>${e(p.name)} ${demo ? '로컬 확인 화면' : '상담 관리'}</strong> 각 시간대에 설정한 정원까지 상담을 확정할 수 있습니다. ${demo ? '이 브라우저에 저장된 상담 신청을 확인합니다.' : '우리 기업에 접수된 상담 신청을 확인합니다.'}</p></div>` + capacitySettings(p, requests) + stats(requests, false) +
    `<section class="panel slot-overview"><div class="panel-heading"><h2>시간별 확정 현황</h2><span>확정 / 정원 · 10분 단위</span></div><div class="slot-summary-grid">${TIMES.map(time => {
      const confirmed = requests.filter(row => row.time === time && row.status === STATUS.CONFIRMED).length;
      const capacity = capacityFor(p, time);
      return `<div class="slot-summary ${confirmed >= capacity ? 'at-capacity' : ''}"><span>${e(time)}</span><strong>${confirmed}<small> / ${capacity}건</small></strong><div class="capacity-track"><i style="width:${capacity ? Math.min(100, confirmed / capacity * 100) : 0}%"></i></div></div>`;
    }).join('')}</div></section><section class="request-section"><div class="panel-heading"><h2>받은 상담 신청 <span class="count-pill">${requests.length}</span></h2><button id="refresh-provider" class="text-button">${icon('reset')} 새로고침</button></div><div class="status-tabs" role="group" aria-label="신청 상태 필터">${['', ...Object.values(STATUS)].map(status => '<button class="' + (filter === status ? 'active' : '') + '" data-status="' + status + '" aria-pressed="' + (filter === status) + '">' + (status || '전체') + '</button>').join('')}</div><div id="provider-requests" class="requests-grid">${providerRequests(requests.filter(row => !filter || row.status === filter))}</div></section>`;
}

export function providerMatchingPage(providerId, requests, p = providerById(providerId)) {
  const confirmed = requests.filter(row => row.providerId === providerId && row.status === STATUS.CONFIRMED);
  const previousTimes = [...new Set(confirmed.map(row => row.time).filter(time => !TIMES.includes(time)))].sort();
  const scheduleTimes = [...TIMES, ...previousTimes];
  return pageHeading('MATCHING SCHEDULE', e(p.name) + ' 매칭 현황', '확정된 상담을 시간대별로 확인하세요. 상담을 누르면 상세 내용을 볼 수 있습니다.', '<button id="refresh-matching" class="button secondary">' + icon('reset') + ' 새로고침</button>') + capacitySettings(p, requests) +
    `<section class="panel matching-panel" aria-label="${e(p.name)} 확정 상담 시간표">
      <div class="panel-heading"><div><h2>비즈매칭 시간표 <span class="count-pill">${confirmed.length}건 확정</span></h2><p>${scheduleRange()} · 10분 단위 · 시간대별 정원 적용</p></div><span class="badge confirmed"><i></i> 매칭확정</span></div>
      <table class="matching-table">
        <caption class="sr-only">${e(p.name)} 시간대별 확정 상담 목록</caption>
        <thead><tr><th scope="col">상담 시간</th><th scope="col">확정 / 정원</th><th scope="col">상담 기업 및 내용</th></tr></thead>
        <tbody>${scheduleTimes.map(time => {
          const rows = confirmed.filter(row => row.time === time);
          const capacity = capacityFor(p, time);
          const [start, end] = time.split(' – ');
          return `<tr class="matching-row" data-time="${e(time)}">
            <th scope="row" class="matching-time"><strong>${e(start)}</strong><span>– ${e(end)}</span>${!TIMES.includes(time) ? '<small>이전 신청 시간</small>' : ''}</th>
            <td class="matching-capacity">${TIMES.includes(time) ? '<strong>' + rows.length + '<small> / ' + capacity + '건</small></strong><span>' + (rows.length >= capacity ? '정원 마감' : '상담 확정') + '</span>' : '<strong>' + rows.length + '건</strong><span>이전 상담 시간</span>'}</td>
            <td class="matching-consultations">${rows.length ? '<div class="matching-meetings">' + rows.map(row =>
              `<button type="button" class="matching-meeting" data-detail="${e(row.id)}" aria-label="${e(row.itsCompany)} · ${e(time)} 상담 상세 보기">
                <span class="matching-meeting-heading"><strong>${e(row.itsCompany)}</strong><span>${e(row.attendees)}명</span></span>
                <span class="matching-description">${e(row.details)}</span>
                <span class="matching-detail-link">상세 보기 ${icon('chevron')}</span>
              </button>`).join('') + '</div>' : '<p class="matching-empty">확정된 상담이 없습니다.</p>'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      <p class="matching-footnote">승인대기·거절·취소된 신청은 <a href="#npu">NPU 승인 관리</a>에서 확인할 수 있습니다.</p>
    </section>`;
}

export function providerRequests(requests) {
  if (!requests.length) return empty('표시할 신청이 없습니다', '다른 상태를 선택하거나 새로운 신청을 기다려 주세요.');
  return requests.map(row => `<article class="request-card"><div class="request-card-head"><span class="company-avatar">${e(row.itsCompany.slice(0, 1))}</span><div><h3>${e(row.itsCompany)}</h3><small>${dateText(row.createdAt)} 신청</small></div>${badge(row.status)}</div><div class="request-meta"><span>${icon('clock')} ${e(row.time)}</span><span>${icon('users')} ${e(row.attendees)}명</span></div><p class="request-description">${e(row.details)}</p><div class="request-card-footer"><button class="text-button" data-detail="${e(row.id)}">상세 보기 ${icon('chevron')}</button>${row.status === STATUS.PENDING ? '<div class="decision-buttons"><button class="button secondary small" data-decision="' + STATUS.REJECTED + '" data-id="' + e(row.id) + '">거절</button><button class="button primary small" data-decision="' + STATUS.CONFIRMED + '" data-id="' + e(row.id) + '">' + icon('check') + ' 승인</button></div>' : '<span class="muted">처리 완료</span>'}</div></article>`).join('');
}
export function capacitySettings(provider, requests) {
  return `<section class="panel capacity-settings per-slot-settings"><div><span class="eyebrow gray">CAPACITY BY TIME</span><h2>시간대별 최대 상담 건수</h2><p>변경할 시간대의 정원을 입력하고 저장해 주세요. 각 시간대에 독립적으로 적용됩니다.</p><p class="capacity-hint">0~2건 · 0건은 해당 시간 접수 중단 · 확정된 상담 수보다 낮게 설정할 수 없습니다.</p></div><div class="slot-capacity-list">${TIMES.map((time, index) => {
    const confirmed = requests.filter(row => row.time === time && row.status === STATUS.CONFIRMED).length;
    return `<form class="slot-capacity-form" data-time="${e(time)}"><input type="hidden" name="time" value="${e(time)}"><div class="slot-capacity-time"><strong>${e(time)}</strong><span>현재 확정 ${confirmed}건${isSlotOpen(provider, time) ? '' : ' · 운영 중단'}</span></div><label class="field" for="slot-capacity-${index}"><span class="sr-only">${e(time)} 최대 상담 건수</span><div class="capacity-input"><input id="slot-capacity-${index}" name="capacity" type="number" min="0" max="2" step="1" value="${capacityFor(provider, time)}" required><span>건</span></div></label><button class="button primary small" type="submit" aria-label="${e(time)} 정원 저장">저장</button><p id="slot-capacity-error-${index}" class="inline-error" role="alert" hidden></p></form>`;
  }).join('')}</div></section>`;
}


export function adminLogin() {
  return pageHeading('ADMIN ACCESS', '관리자 로그인', 'ITS Korea 운영 담당자 전용 화면입니다.') +
    `<section class="panel admin-login"><span class="section-icon large">${icon('shield')}</span><h2>운영 관리자 로그인</h2><p>관리자 ID와 비밀번호를 입력해 주세요.</p><form id="admin-login-form"><label class="field">관리자 ID<input name="id" autocomplete="username" maxlength="64" required placeholder="관리자 ID"></label><label class="field">비밀번호<input name="password" type="password" autocomplete="current-password" maxlength="128" required placeholder="비밀번호"></label><p id="admin-login-error" class="inline-error" role="alert" hidden></p><button class="button primary" type="submit">로그인 ${icon('arrow')}</button></form><p class="admin-login-note">${demo ? '로컬 확인용 로그인입니다.' : '운영 관리자 인증이 필요합니다. 로그인은 30분간 유지됩니다.'}</p><a href="#home" class="text-button">첫 화면으로 돌아가기</a></section>`;
}

export function adminPage(requests, providers = PROVIDERS, history = []) {
  const allTimes = [...TIMES, ...new Set([...requests, ...history].map(row => row.time).filter(time => time && !TIMES.includes(time)))];
  return pageHeading('OPERATIONS OVERVIEW', '비즈매칭 운영 대시보드', '남은 상담 자리와 모든 처리 기록을 한눈에 확인하세요.', '<div class="admin-page-actions"><button id="extend-schedule" class="button primary">상담 시간 +10분 연장</button><button id="refresh-admin" class="button secondary">' + icon('reset') + ' 새로고침</button><button id="admin-logout" class="text-button">로그아웃</button></div>') +
    stats(requests) + adminProgress(requests, providers) +
    `<section class="panel admin-list history-panel"><div class="panel-heading"><div><h2>전체 활동 로그 <span class="count-pill">${history.length}</span></h2><p>신청·취소·승인·거절·정원 변경·시간 연장을 하나의 로그로 확인합니다.</p></div></div>
    <form id="history-filters" class="filters unified-log-filters" role="search"><label class="filter-search"><span class="sr-only">활동 로그 검색</span>${icon('search')}<input name="query" placeholder="신청ID / 기업명 / 담당자 검색" aria-label="활동 로그 검색"></label><label><span class="sr-only">NPU 기업</span><select name="provider">${options(providers, '모든 NPU 기업')}</select></label><label><span class="sr-only">상담 시간</span><select name="time">${options(allTimes, '모든 시간')}</select></label><label><span class="sr-only">처리 유형</span><select name="action">${options(['신청', '취소', '승인', '거절', '정원 변경', '시간 연장', '기존 상태'], '모든 처리')}</select></label><label><span class="sr-only">시간 정렬</span><select name="order"><option value="desc">최신순</option><option value="asc">오래된 순</option></select></label><button class="icon-button" type="reset" aria-label="로그 필터 초기화">${icon('reset')}</button></form>
    <p class="history-note">기록된 처리 시각을 기준으로 정렬합니다. 시각이 없는 기존 상태는 로그 끝에 표시하며, 신청ID를 누르면 현재 신청 상세를 볼 수 있습니다.</p>
    <div id="history-results">${adminHistoryRows(history, requests)}</div></section>`;
}


export function adminProgress(requests, providers) {
  return `<section class="panel schedule-panel progress-panel"><div class="panel-heading"><div><h2>진행 현황</h2><p>잔여 건수를 누르면 해당 시간의 상담 기업 목록을 확인할 수 있습니다.</p></div><div class="schedule-legend"><span><i></i> 잔여 있음</span><span><i></i> 마감 / 중단</span></div></div><div class="table-scroll"><table class="schedule-table progress-table"><caption class="sr-only">NPU 기업별 시간대별 잔여 상담 자리</caption><thead><tr><th scope="col">상담 시간</th>${providers.map(p => '<th scope="col"><span class="table-provider">' + mark(p) + e(p.name) + '</span><small>시간대별 정원 적용</small></th>').join('')}</tr></thead><tbody>${TIMES.map(time => '<tr><th scope="row">' + e(time) + '</th>' + providers.map(p => {
    const capacity = capacityFor(p, time);
    const confirmed = requests.filter(row => row.providerId === p.id && row.time === time && row.status === STATUS.CONFIRMED).length;
    const open = isSlotOpen(p, time);
    const remaining = open ? Math.max(0, capacity - confirmed) : 0;
    return `<td><button type="button" class="progress-cell ${remaining === 0 ? 'full' : ''}" data-slot-detail data-provider="${e(p.id)}" data-time="${e(time)}" data-remaining="${remaining}" aria-label="${e(p.name)} ${e(time)} 잔여 ${remaining}건, 상담 기업 보기"><strong>잔여 ${remaining}<small>건</small></strong><span>확정 ${confirmed} / 정원 ${capacity}</span><em>${!open || capacity === 0 ? '접수 중단' : remaining === 0 ? '정원 마감' : '상담 가능'} ${icon('chevron')}</em></button></td>`;
  }).join('') + '</tr>').join('')}</tbody><tfoot><tr><th scope="row">총 남은 자리</th>${providers.map(p => {
    const remaining = TIMES.reduce((sum, time) => sum + (isSlotOpen(p, time) ? Math.max(0, capacityFor(p, time) - requests.filter(row => row.providerId === p.id && row.time === time && row.status === STATUS.CONFIRMED).length) : 0), 0);
    return '<td><strong>' + remaining + '건</strong></td>';
  }).join('')}</tr></tfoot></table></div></section>`;
}



export function adminHistoryRows(events, requests = [], order = 'desc') {
  if (!events.length) return empty('표시할 활동 로그가 없습니다', '검색 조건을 변경하거나 신청 처리 후 다시 확인해 주세요.');
  const known = events.filter(event => event.occurredAt);
  const sorted = [...(order === 'asc' ? known.reverse() : known), ...events.filter(event => !event.occurredAt)];
  const requestMap = new Map(requests.map(row => [row.id, row]));
  const timestamp = value => value ? logDateFormatter.format(new Date(value)) : '처리 시각 미기록';
  return `<div class="table-scroll"><table class="requests-table history-table"><caption class="sr-only">시간순 전체 활동 로그</caption><thead><tr><th scope="col">처리 시각 / 유형</th><th scope="col">신청ID / ITS 기업</th><th scope="col">NPU / 상담 시간</th><th scope="col">처리자</th><th scope="col">변경 내용</th></tr></thead><tbody>${sorted.map(event => {
    const request = requestMap.get(event.requestId);
    return `<tr data-log-id="${e(event.id)}" data-occurred-at="${e(event.occurredAt || '')}">
    <td><strong>${e(event.action)}</strong><small>${e(timestamp(event.occurredAt))}</small></td>
    <td class="request-id-cell">${event.requestId ? '<button type="button" class="text-button request-id" data-detail="' + e(event.requestId) + '">' + e(event.requestId) + '</button><strong>' + e(event.itsCompany) + '</strong>' + (request ? '<small>' + e(request.contactName) + ' · ' + request.attendees + '명</small>' : '') : '<span class="muted">신청ID 없음 · 기업 설정</span>'}</td>
    <td>${e(providerById(event.providerId).name)}<small>${e(event.time || '모든 시간대 · 이전 설정')}</small></td>
    <td class="history-actor">${e(event.actor)}</td>
    <td>${event.action === '시간 연장' ? '<span class="history-change">10분 추가 · 정원 2건</span>' : event.action === '정원 변경' ? '<span class="history-change">최대 ' + event.beforeCapacity + '건 → ' + event.afterCapacity + '건</span>' : '<div class="history-status"><small>' + e(event.action === '기존 상태' ? '기존 저장 상태' : (event.fromStatus || '신규 신청') + ' →') + '</small>' + badge(event.toStatus) + '</div>'}</td>
  </tr>`;
  }).join('')}</tbody></table></div><div class="table-footer">총 <strong>${events.length}</strong>건의 로그 · ${order === 'asc' ? '오래된 순' : '최신순'}</div>`;
}


export function homePage() {
  return `<div class="welcome-page">
    <header class="welcome-header">
      <a href="#home" class="brand" aria-label="K-NPU Connect 첫 화면"><span class="brand-symbol">K<span>↗</span></span><span>K-NPU <strong>Connect</strong><small>BUSINESS MATCHING PLATFORM</small></span></a>
      <span class="welcome-organizer">ITS <b>KOREA</b></span>
    </header>
    <div class="event-utility">2026 강릉 ITS 세계총회 <span>Beyond Mobility, Connected World · October 19–23, 2026</span></div><section class="welcome-intro" aria-labelledby="welcome-title">
      <span class="welcome-event"><span class="live-dot"></span> 강릉 K-NPU 전환 밋업</span>
      <h1 id="welcome-title">K-NPU Business Meeting<br><em>ITS와 NPU의 협력을 연결합니다.</em></h1>
      <p>ITS 기업의 현장 과제와 NPU 기업의 기술을 잇는<br class="desktop-break"> 1:1 비즈매칭 프로그램입니다.<br>상담을 통해 AI 전환의 가능성과 협력 기회를 만나보세요.</p>
    </section>
    <section class="welcome-selection" aria-labelledby="selection-title">
      <h2 id="selection-title">어떤 기업으로 참여하시나요?</h2>
      <p class="welcome-selection-hint">기업 유형을 선택해 주세요.</p>
      <div class="role-choices">
        <a href="#apply" class="role-choice its-choice" aria-label="ITS 기업으로 상담 신청하기">
          <div class="role-choice-top"><span class="role-choice-icon">${icon('building')}</span><span class="role-choice-label">ITS COMPANY</span></div>
          <h3>ITS 기업입니다</h3>
          <p>NPU 파트너를 찾고<br> 1:1 비즈매칭 상담을 신청합니다.</p>
          <span class="role-choice-action">상담 신청하기 ${icon('arrow')}</span>
        </a>
        <a href="#npu" class="role-choice npu-choice" aria-label="NPU 기업으로 상담 신청 확인하기">
          <div class="role-choice-top"><span class="role-choice-icon">${icon('grid')}</span><span class="role-choice-label">NPU COMPANY</span></div>
          <h3>NPU 기업입니다</h3>
          <p>우리 기업에 들어온 상담 신청을 확인하고<br> 승인 또는 거절합니다.</p>
          <span class="role-choice-action">상담 신청 확인하기 ${icon('arrow')}</span>
        </a>
      </div>
    </section>
    <div class="welcome-lookup"><p>이미 상담을 신청하셨나요?</p><a class="welcome-lookup-button" href="#lookup">${icon('search')} 신청 현황 확인 ${icon('arrow')}</a></div>
    ${brochureCards()}
    <p class="welcome-process"><span>상담 신청</span>${icon('chevron')}<span>NPU 기업 검토</span>${icon('chevron')}<span>1:1 매칭 확정</span></p>
    <div class="welcome-admin"><a href="#admin" class="admin-login-link">${icon('shield')} 관리자로 로그인</a></div>
  </div>`;
}


export function privacyConsent() {
  return `<section class="privacy-consent" aria-label="개인정보 수집 동의">
    <div class="privacy-consent-header">
      <label class="consent"><input name="privacyConsent" type="checkbox" required><span>개인정보 수집 동의 <b>*</b></span></label>
      <button type="button" id="privacy-toggle" class="privacy-toggle" aria-expanded="false" aria-controls="privacy-details" aria-label="개인정보 수집 동의 내용 펼치기">${icon('chevron')}</button>
    </div>
    <div id="privacy-details" class="privacy-details" hidden>
      <h4>개인정보 수집·이용 안내</h4>
      <p class="privacy-scope">${demo ? '현재 로컬 테스트 모드입니다. 예시 정보만 입력해 주세요.' : '상담 신청 전에 다음 내용을 확인해 주세요.'}</p>
      <dl>
        <div><dt>운영 주체</dt><dd>ITS Korea</dd></div>
        <div><dt>수집·이용 목적</dt><dd>K-NPU 비즈매칭 상담 신청 접수, NPU 기업과의 상담 매칭 및 일정 관리, 신청 상태 및 매칭 결과 관리, 상담 관련 연락 및 행사 운영 안내</dd></div>
        <div><dt>수집 항목</dt><dd>기업명, 담당자명, 연락처, 이메일, 상담 희망 NPU 기업, 상담 희망 시간, 참석인원, 상담내용</dd></div>
        <div><dt>추가 기록 항목</dt><dd>개인정보 수집·이용 동의 여부, 동의 시각, 동의문 버전 (${e(PRIVACY_NOTICE.version)})</dd></div><div><dt>저장 방식 안내</dt><dd>${demo ? '로컬 테스트 입력은 이 브라우저에만 저장됩니다.' : '입력된 신청 정보는 행사 운영 및 비즈매칭 관리를 위해 ITS Korea가 관리하는 Google Sheets에 저장될 수 있으며, 해당 데이터는 공개되지 않고 운영 권한이 있는 담당자만 접근하도록 구성합니다.'}</dd></div><div><dt>보유·이용 기간</dt><dd>${e(PRIVACY_NOTICE.retentionText)}</dd></div>
        <div><dt>동의 거부 권리</dt><dd>개인정보 수집·이용에 동의하지 않을 권리가 있습니다. 다만 상담 신청 및 비즈매칭 운영에 필요한 정보이므로 동의하지 않을 경우 상담 신청이 제한될 수 있습니다.</dd></div>
      </dl>
    </div>
  </section>`;
}
export function capacityRange(provider) {
  const capacities = TIMES.map(time => capacityFor(provider, time));
  const minimum = Math.min(...capacities);
  const maximum = Math.max(...capacities);
  return (minimum === maximum ? maximum : minimum + '~' + maximum) + '건';
}

export function adminSlotDetail(provider, time, requests) {
  const rows = requests.filter(row => row.providerId === provider.id && row.time === time);
  const confirmed = rows.filter(row => row.status === STATUS.CONFIRMED);
  const pending = rows.filter(row => row.status === STATUS.PENDING);
  const other = rows.filter(row => [STATUS.REJECTED, STATUS.CANCELLED].includes(row.status));
  const capacity = capacityFor(provider, time);
  const cards = list => `<div class="slot-dialog-list">${list.map(row => `<button type="button" class="slot-dialog-card" data-popup-request="${e(row.id)}" aria-label="${e(row.itsCompany)} 상담 상세 보기"><span class="slot-dialog-card-head"><strong>${e(row.itsCompany)}</strong>${badge(row.status)}</span><span class="slot-dialog-contact">${e(row.contactName)} · ${e(row.attendees)}명</span><span class="slot-dialog-id">${e(row.id)}</span><span class="slot-dialog-description">${e(row.details)}</span><span class="matching-detail-link">신청 상세 ${icon('chevron')}</span></button>`).join('')}</div>`;
  return `<span class="eyebrow gray">MEETINGS BY TIME</span><h2 id="dialog-title">${e(provider.name)} 상담 기업</h2><p class="dialog-description">${e(time)}</p><div class="slot-dialog-summary"><span>잔여 <strong>${isSlotOpen(provider, time) ? Math.max(0, capacity - confirmed.length) : 0}건</strong></span><span>확정 <strong>${confirmed.length}건</strong></span><span>정원 <strong>${capacity}건</strong></span></div><section class="slot-dialog-section"><h3>확정 상담 <span>${confirmed.length}건</span></h3>${confirmed.length ? cards(confirmed) : '<p class="slot-dialog-empty">이 시간대에 확정된 상담이 없습니다.</p>'}</section><section class="slot-dialog-section"><h3>승인대기 <span>${pending.length}건 · 정원 미포함</span></h3>${pending.length ? cards(pending) : '<p class="slot-dialog-empty">대기 중인 신청이 없습니다.</p>'}</section>${other.length ? '<details class="slot-dialog-other"><summary>거절·취소된 신청 ' + other.length + '건</summary>' + cards(other) + '</details>' : ''}`;
}

export function providerOptions(providers) { return providers.map((p, i) => `<label class="provider-option"><input type="radio" name="providerId" value="${e(p.id)}" ${i === 0 ? 'checked' : ''} required><span class="provider-tile">${mark(p)}<span class="radio-indicator"></span><strong>${e(p.name)}</strong><small>${e(p.english)}</small><span class="capacity-label">시간별 정원 <b data-capacity-provider="${e(p.id)}">${capacityRange(p)}</b></span></span></label>`).join(''); }

export function lookupTabs(active) {
  return '<nav class="lookup-tabs" aria-label="신청 조회 방법"><a href="#lookup" ' +
    (active === 'lookup' ? 'class="active" aria-current="page"' : '') + '>신청 현황 확인</a>' +
    '<a href="#find-id" ' + (active === 'find-id' ? 'class="active" aria-current="page"' : '') + '>신청 ID 찾기</a></nav>';
}
export function findIdsPage() {
  return pageHeading('FIND MY REQUEST', '신청 ID 찾기', '신청할 때 입력한 네 가지 정보로 신청ID를 찾을 수 있습니다.') +
    lookupTabs('find-id') + `<div class="lookup-layout">
    <section class="panel lookup-form-panel"><div class="section-icon large">${icon('search')}</div><h2>신청자 정보 확인</h2>
      <p>기업명·담당자명·연락처·이메일이 모두 일치하는 신청만 표시합니다.</p>
      <form id="find-ids-form" autocomplete="off">
        <label class="field">ITS 기업명 <b>*</b><input name="itsCompany" maxlength="80" required></label>
        <label class="field">담당자명 <b>*</b><input name="contactName" maxlength="40" required></label>
        <label class="field">연락처 <b>*</b><input name="phone" type="tel" maxlength="24" required placeholder="010-0000-0000"></label>
        <label class="field">이메일 <b>*</b><input name="email" type="email" maxlength="120" required placeholder="name@company.com"></label>
        <p id="find-ids-error" class="inline-error" role="alert" hidden></p>
        <button class="button primary" type="submit">신청 ID 찾기 ${icon('arrow')}</button>
      </form>
    </section>
    <section id="find-ids-result" aria-live="polite" class="panel lookup-result">
      ${empty('신청ID를 잊으셨나요?', '신청자 정보를 입력하면 일치하는 신청이 최근 신청 순으로 표시됩니다.')}
    </section></div>`;
}
export function foundRequestIds(rows) {
  return '<h2 class="found-ids-title">일치하는 신청 <span class="count-pill">' + rows.length + '</span></h2>' +
    '<div class="found-ids-list">' + rows.map(row => `<article class="found-id-card">
      <div class="found-id-head"><strong>${e(row.providerName)}</strong>${badge(row.status)}</div>
      <p>${icon('clock')} ${e(row.time)}</p><small>${dateText(row.createdAt)} 신청</small>
      <p class="found-request-id">${e(row.id)}</p>
      <button type="button" class="button secondary small" data-found-id="${e(row.id)}">신청 현황 보기 ${icon('arrow')}</button>
    </article>`).join('') + '</div>';
}
export function rejectionDialog(row) {
  return `<span class="dialog-symbol">${icon('info')}</span><h2 id="dialog-title">상담 신청을 거절하시겠습니까?</h2>
    <p class="dialog-description">${e(row.itsCompany)} · ${e(row.time)}<br>입력한 사유는 신청자에게 표시됩니다.</p>
    <form id="reject-request-form"><label class="field">거절 사유 <b>*</b>
      <textarea name="rejectionReason" rows="5" maxlength="500" required placeholder="상담 진행이 어려운 사유를 입력해 주세요."></textarea></label>
      <p class="muted">최대 500자</p><p class="inline-error" id="dialog-error" role="alert" hidden></p>
      <div class="dialog-actions"><button type="button" class="button secondary" data-close-dialog>돌아가기</button>
      <button type="submit" class="button danger" id="confirm-action">거절하기</button></div></form>`;
}
export function brochureCards(items = BROCHURES) {
  return `<section class="brochure-section" aria-labelledby="brochure-title">
    <div class="section-heading"><div><span class="eyebrow gray">NPU PARTNERS</span><h2 id="brochure-title">NPU 기업 소개자료</h2>
      <p>기업별 PDF 소개자료를 새 탭에서 확인하세요.</p></div></div>
    <div class="brochure-grid">${items.map(item => {
      const provider = providerById(item.providerId);
      return `<article class="panel brochure-card">${mark(provider)}<h3>${e(item.name)}</h3><p>기업 및 기술 소개자료 · PDF</p>
        ${item.available ? '<a class="button secondary small" href="./assets/brochures/' + e(item.file) +
          '" target="_blank" rel="noopener noreferrer">자료 보기 ' + icon('arrow') + '</a>' :
          '<button class="button secondary small" type="button" disabled>자료 보기</button><span class="brochure-pending" role="status">자료 준비 중</span>'}</article>`;
    }).join('')}</div></section>`;
}
export function brochuresPage() {
  return pageHeading('NPU PARTNERS', 'NPU 기업 소개자료', '상담 전에 NPU 파트너의 기업과 기술을 살펴보세요.') + brochureCards();
}

export function scheduleRange() {
  return TIMES.length ? TIMES[0].slice(0,5) + '–' + TIMES.at(-1).slice(-5) : '운영 시간 확인 중';
}
export function extensionDialog(lastTime) {
  const match = /– (\d{2}):(\d{2})$/.exec(lastTime || '');
  const end = match ? Number(match[1])*60+Number(match[2]) : 1440;
  const hhmm = n => String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  const next = end+10 < 1440 ? hhmm(end)+' – '+hhmm(end+10) : '날짜 경계: 연장 불가';
  return '<h2 id="dialog-title">상담 시간을 연장하시겠습니까?</h2><dl class="extension-summary"><div><dt>현재 마지막 상담</dt><dd>'+e(lastTime)+'</dd></div><div><dt>추가 상담</dt><dd>'+e(next)+'</dd></div></dl><p class="dialog-description">4개 NPU 기업에 동일하게 10분 상담시간이 추가됩니다. 새 시간대의 정원은 기업별 2건입니다.</p><p id="dialog-error" class="inline-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button secondary" data-close-dialog>취소</button><button type="button" class="button primary" id="confirm-extension" '+(end+10>=1440?'disabled':'')+'>10분 연장</button></div>';
}
