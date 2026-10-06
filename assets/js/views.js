import { PROVIDERS, TIMES, STATUS, providerById } from './config.js';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const e = escapeHtml;
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
export const mark = provider => '<span class="provider-mark ' + provider.color + '" aria-hidden="true">' + provider.mark + '</span>';
export const options = (items, first) => '<option value="">' + first + '</option>' + items.map(item => typeof item === 'string' ? '<option value="' + e(item) + '">' + e(item) + '</option>' : '<option value="' + e(item.id) + '">' + e(item.name) + '</option>').join('');
export const dateText = date => new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(date));

export function shell() {
  return `<aside class="sidebar" id="sidebar">
    <a href="#apply" class="brand" aria-label="K-NPU Connect 홈"><span class="brand-symbol">K<span>↗</span></span><span>K-NPU <strong>Connect</strong><small>BUSINESS MATCHING PLATFORM</small></span></a>
    <div class="event-label"><span class="live-dot"></span> 강릉 K-NPU 전환 밋업</div>
    <nav aria-label="주 메뉴">
      <p class="nav-label">비즈매칭</p>
      <a href="#apply" data-route="apply">${icon('plus')}<span>상담 신청</span>${icon('chevron')}</a>
      <a href="#lookup" data-route="lookup">${icon('search')}<span>신청 확인</span></a>
      <p class="nav-label management-label">파트너 & 운영</p>
      <a href="#npu" data-route="npu">${icon('building')}<span>NPU 승인 관리</span></a>
      <a href="#admin" data-route="admin">${icon('grid')}<span>운영 대시보드</span></a>
    </nav>
    <div class="sidebar-bottom">
      <div class="help-card"><span class="help-icon">${icon('shield')}</span><strong>함께 만드는 AI 전환</strong><p>ITS 산업과 NPU 기술의 만남,<br>새로운 협력을 시작하세요.</p><span class="organizer">ITS <b>KOREA</b></span></div>
      <button class="reset-button" id="reset-demo">${icon('reset')} 데모 데이터 초기화</button>
      <p class="sidebar-version">K-NPU Connect <span>Prototype v0.1</span></p>
    </div>
  </aside>
  <div class="workspace">
    <header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" id="menu-toggle" aria-label="메뉴 열기" aria-expanded="false" aria-controls="sidebar">${icon('menu')}</button><span>비즈매칭 플랫폼</span><span class="separator">/</span><strong id="route-title">상담 신청</strong></div><div class="topbar-right"><span class="demo-pill"><i></i> 로컬 데모</span><span class="topbar-divider"></span><span class="profile-avatar">K</span><span class="profile-name">ITS Korea</span></div></header>
    <main id="main" tabindex="-1"></main>
    <footer class="footer"><span>© K-NPU Connect · ITS Korea</span><span>ITS와 NPU, 가능성을 연결합니다.</span></footer>
  </div>`;
}

export function applyPage() {
  return `<section class="hero">
    <div class="hero-content"><span class="eyebrow"><span></span> CONNECT TO THE NEXT</span><h1>새로운 협력의 시작,<br><em>K-NPU 비즈매칭</em></h1><p>우리 기업에 맞는 NPU 파트너를 만나보세요.<br>1:1 기술 상담으로 AI 전환의 다음 단계를 함께합니다.</p><div class="hero-tags"><span>${icon('users')} 4개 NPU 파트너</span><span>${icon('clock')} 1:1 맞춤 상담</span></div></div>
    <div class="connect-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="art-line line-one"></div><div class="art-line line-two"></div><div class="art-node node-its">ITS<small>INTELLIGENT TRANSPORT</small></div><div class="art-node node-npu">NPU<small>AI ACCELERATOR</small></div><div class="art-link">↗</div><span class="art-dot dot-one"></span><span class="art-dot dot-two"></span><span class="art-caption">BETTER TOGETHER, NEXT POSSIBILITIES</span></div>
  </section>
  <div class="notice">${icon('info')}<p><strong>프로토타입 안내</strong> 현재는 이 브라우저에만 저장되는 데모입니다. 실제 개인정보 대신 예시 정보로 테스트해 주세요. 상담 시간은 예시입니다.</p></div>
  <div class="section-heading"><div><span class="eyebrow gray">BUSINESS MEETING</span><h2>1:1 상담 신청</h2><p>기업 정보와 희망하는 상담을 입력해 주세요.</p></div><span class="required-note"><b>*</b> 필수 입력 항목</span></div>
  <div class="application-layout">
  <form id="application-form" class="form-card">
    <div class="form-step-bar"><span class="active"><b>01</b> 기업 정보</span><i></i><span><b>02</b> 상담 선택</span><i></i><span><b>03</b> 신청 제출</span></div>
    <section class="form-section"><div class="form-section-title"><span class="section-icon">${icon('building')}</span><h3>기업 및 담당자 정보</h3></div>
    <div class="field-grid"><label class="field full">ITS 기업명 <b>*</b><input name="itsCompany" autocomplete="organization" maxlength="80" placeholder="기업명을 입력해 주세요" required></label>
    <label class="field">담당자명 <b>*</b><input name="contactName" autocomplete="name" maxlength="40" placeholder="성함을 입력해 주세요" required></label>
    <label class="field">연락처 <b>*</b><input name="phone" type="tel" autocomplete="tel" maxlength="24" placeholder="010-0000-0000" required></label>
    <label class="field full">이메일 <b>*</b><input name="email" type="email" autocomplete="email" maxlength="120" placeholder="name@company.com" required><small>신청 확인 시 사용하는 이메일입니다. 데모에서는 메일이 발송되지 않습니다.</small></label></div></section>
    <section class="form-section"><div class="form-section-title"><span class="section-icon">${icon('users')}</span><h3>상담 파트너 및 시간</h3></div>
    <fieldset class="provider-fieldset"><legend>상담 희망 NPU 기업 <b>*</b></legend><div class="provider-grid">${PROVIDERS.map((p, i) => `<label class="provider-option"><input type="radio" name="providerId" value="${p.id}" ${i === 0 ? 'checked' : ''} required><span class="provider-tile">${mark(p)}<span class="radio-indicator"></span><strong>${p.name}</strong><small>${p.english}</small><span class="capacity-label">동시 상담 최대 <b>${p.capacity}건</b></span></span></label>`).join('')}</div></fieldset>
    <fieldset class="time-fieldset"><legend>상담 희망 시간 <b>*</b><span class="legend-extra">30분 단위 · 예시 시간표</span></legend><div id="time-options" class="time-grid"><p>시간을 불러오는 중입니다.</p></div><p class="field-hint">${icon('info')} 승인대기 신청은 정원에 포함되지 않으며, NPU 기업의 승인 시 확정됩니다.</p></fieldset>
    <label class="field attendees-field">참석인원 <b>*</b><span class="number-input"><input name="attendees" type="number" min="1" max="20" step="1" value="1" required><span>명</span></span></label></section>
    <section class="form-section"><div class="form-section-title"><span class="section-icon">${icon('file')}</span><h3>상담 내용</h3></div><label class="field">상담하고 싶은 내용을 알려주세요 <b>*</b><textarea name="details" rows="5" maxlength="1000" placeholder="도입을 검토 중인 서비스, 기술 과제, 협력하고 싶은 분야 등을 자유롭게 작성해 주세요." required></textarea></label><div class="textarea-footer"><span>구체적으로 작성하면 더욱 알찬 상담을 준비할 수 있습니다.</span><span id="character-count">0 / 1,000</span></div></section>
    <div class="form-submit"><label class="consent"><input name="consent" type="checkbox" required><span>입력한 데모 정보가 이 브라우저에 저장됨을 확인했습니다. <b>*</b></span></label><p class="inline-error" id="application-error" role="alert" hidden></p><button type="submit" class="button primary submit-button">상담 신청하기 ${icon('arrow')}</button><p class="submit-note">${icon('shield')} 신청 후 NPU 기업의 승인을 거쳐 매칭이 확정됩니다.</p></div>
  </form>
  <aside class="application-aside"><section class="panel summary-panel"><span class="eyebrow gray">YOUR MEETING</span><h3>신청 요약</h3><div id="selection-summary"></div><div class="summary-status"><span class="live-dot"></span> 신청 시 <strong>승인대기</strong>로 접수됩니다.</div></section>
  <section class="panel process-panel"><h3>비즈매칭 진행 안내</h3><ol class="timeline"><li><span>1</span><div><strong>상담 신청</strong><p>희망 기업과 시간을 선택해<br>상담을 신청합니다.</p></div></li><li><span>2</span><div><strong>NPU 기업 검토</strong><p>파트너 기업이 상담 내용을<br>확인하고 승인합니다.</p></div></li><li><span>3</span><div><strong>1:1 비즈매칭 확정</strong><p>신청 확인에서 결과를 확인하고<br>파트너를 만나보세요.</p></div></li></ol></section>
  <div class="aside-tip">${icon('info')}<p>신청 완료 후 발급되는 <strong>신청ID</strong>를 보관해 주세요. 이메일과 함께 신청 상태를 확인할 수 있습니다.</p></div></aside></div>`;
}

export function timeOptions(slots, selected) {
  return slots.map(slot => {
    const full = slot.confirmed >= slot.capacity;
    return `<label class="time-option ${full ? 'full' : ''}"><input type="radio" name="time" value="${e(slot.time)}" ${selected === slot.time && !full ? 'checked' : ''} ${full ? 'disabled' : ''} required><span><strong>${e(slot.time)}</strong><small>${full ? '확정 정원 마감' : '잔여 ' + (slot.capacity - slot.confirmed) + '건'}<i></i></small></span></label>`;
  }).join('');
}
export function selectionSummary(providerId, time, attendees) {
  const p = providerById(providerId);
  return `<div class="summary-provider">${mark(p)}<div><strong>${p.name}</strong><small>${p.english}</small></div></div><dl class="summary-list"><div><dt>${icon('clock')} 상담 시간</dt><dd>${e(time || '시간을 선택해 주세요')}</dd></div><div><dt>${icon('users')} 참석인원</dt><dd>${e(attendees || '1')}명</dd></div></dl>`;
}
export function pageHeading(eyebrow, title, text, action = '') {
  return `<div class="page-heading"><div><span class="eyebrow gray">${eyebrow}</span><h1>${title}</h1><p>${text}</p></div>${action}</div>`;
}
export const empty = (title, text) => `<div class="empty-state">${icon('search')}<h3>${title}</h3><p>${text}</p></div>`;

export function lookupPage() {
  return pageHeading('MY MEETING', '내 신청 확인', '신청ID와 신청 시 입력한 이메일로 진행 상태를 확인하세요.') + `<div class="lookup-layout"><section class="panel lookup-form-panel"><div class="section-icon large">${icon('search')}</div><h2>신청 내역 조회</h2><p>신청 완료 화면에서 받은 정보를 입력해 주세요.</p><form id="lookup-form"><label class="field">신청ID <b>*</b><input name="id" placeholder="KN-… 또는 DEMO-0001" required></label><label class="field">이메일 <b>*</b><input name="email" type="email" autocomplete="email" placeholder="name@company.com" required></label><p id="lookup-error" class="inline-error" role="alert" hidden></p><button class="button primary" type="submit">신청 조회 ${icon('arrow')}</button></form><div class="demo-example"><strong>예시 신청으로 둘러보기</strong><span>DEMO-0001 / demo1@example.com</span><button type="button" class="text-button" id="fill-example">예시 정보 입력 ${icon('arrow')}</button></div></section><section id="lookup-result" aria-live="polite" class="panel lookup-result">${empty('신청 상태를 확인해 보세요', '조회한 신청의 상담 정보와 진행 상태가 여기에 표시됩니다.')}</section></div>`;
}
export function requestDetail(row, { cancel = false } = {}) {
  const p = providerById(row.providerId);
  return `<div class="detail-header"><span class="eyebrow gray">MEETING REQUEST</span>${badge(row.status)}</div><h2 class="detail-company">${e(row.itsCompany)}</h2><p class="muted detail-id">${e(row.id)}</p><div class="detail-partner">${mark(p)}<div><small>상담 파트너</small><strong>${p.name}</strong></div><div class="detail-time">${icon('clock')} ${e(row.time)}</div></div><dl class="detail-grid"><div><dt>담당자</dt><dd>${e(row.contactName)}</dd></div><div><dt>참석인원</dt><dd>${row.attendees}명</dd></div><div><dt>이메일</dt><dd>${e(row.email)}</dd></div><div><dt>연락처</dt><dd>${e(row.phone)}</dd></div><div><dt>신청일시</dt><dd>${dateText(row.createdAt)}</dd></div></dl><div class="detail-description"><h3>상담내용</h3><p>${e(row.details)}</p></div>${cancel && [STATUS.PENDING, STATUS.CONFIRMED].includes(row.status) ? '<div class="detail-actions"><p>일정이 변경되었나요? 신청을 취소할 수 있습니다.</p><button class="button danger-outline" id="cancel-request">신청 취소</button></div>' : ''}`;
}

export function providerLogin() {
  return pageHeading('PARTNER WORKSPACE', 'NPU 승인 관리', '우리 기업에 들어온 상담 신청을 확인하고 새로운 파트너를 만나보세요.') + `<div class="partner-login-layout"><section class="partner-intro"><span class="intro-icon">${icon('building')}</span><h2>가능성 있는 만남을<br>비즈니스로 연결하세요.</h2><p>상담 내용을 검토하고 승인하면<br>1:1 비즈매칭이 확정됩니다.</p><ul><li>${icon('check')} 기업별 상담 신청 조회</li><li>${icon('check')} 시간대별 확정 현황 확인</li><li>${icon('check')} 신청 승인 및 거절</li></ul><div class="partner-logos">${PROVIDERS.map(mark).join('')}</div></section><section class="panel partner-login"><span class="eyebrow gray">NPU PARTNER</span><h2>파트너 데모 입장</h2><p>확인할 NPU 기업을 선택해 주세요.</p><form id="provider-login-form"><label class="field">NPU 기업<select name="providerId" required>${options(PROVIDERS, '기업을 선택하세요')}</select></label><label class="field">기업별 승인코드 <span class="small-badge">연결 예정</span><input type="password" placeholder="서버 연결 후 활성화됩니다" disabled></label><div class="notice compact">${icon('info')}<p>현재는 인증 없는 데모입니다. 실제 승인코드는 Google Apps Script에서 검증하도록 다음 단계에서 연결합니다.</p></div><p id="provider-login-error" role="alert" class="inline-error" hidden></p><button class="button primary" type="submit">데모 화면 입장 ${icon('arrow')}</button></form></section></div>`;
}

export function stats(requests, includeTotal = true) {
  const list = includeTotal ? [['전체 신청', null, 'file'], ['승인대기', STATUS.PENDING, 'clock'], ['매칭확정', STATUS.CONFIRMED, 'check'], ['매칭거절', STATUS.REJECTED, 'close']] : [['승인대기', STATUS.PENDING, 'clock'], ['매칭확정', STATUS.CONFIRMED, 'check'], ['매칭거절', STATUS.REJECTED, 'close']];
  return `<div class="stats-grid ${includeTotal ? '' : 'three'}">${list.map(([label, status, glyph]) => `<section class="stat-card ${statusClass(status)}"><div><span>${label}</span><strong>${status ? requests.filter(row => row.status === status).length : requests.length}<small>건</small></strong></div><span class="stat-icon">${icon(glyph)}</span></section>`).join('')}</div>`;
}
export function providerPage(providerId, requests, filter = '') {
  const p = providerById(providerId);
  return pageHeading('PARTNER WORKSPACE', p.name + ' 상담 신청 관리', '신청 내용을 검토한 후 승인 또는 거절해 주세요.', '<button id="provider-logout" class="button secondary">기업 변경</button>') +
    `<div class="notice">${icon('info')}<p><strong>${p.name} 데모 화면</strong> 동일 시간 최대 ${p.capacity}건까지 확정할 수 있습니다. 실제 기업 인증과 서버 검증은 연결 전입니다.</p></div>` + stats(requests, false) +
    `<section class="panel slot-overview"><div class="panel-heading"><h2>시간별 확정 현황</h2><span>확정 / 정원 · 예시 시간표</span></div><div class="slot-summary-grid">${TIMES.map(time => {
      const confirmed = requests.filter(row => row.time === time && row.status === STATUS.CONFIRMED).length;
      return `<div class="slot-summary ${confirmed >= p.capacity ? 'at-capacity' : ''}"><span>${time}</span><strong>${confirmed}<small> / ${p.capacity}건</small></strong><div class="capacity-track"><i style="width:${confirmed / p.capacity * 100}%"></i></div></div>`;
    }).join('')}</div></section><section class="request-section"><div class="panel-heading"><h2>받은 상담 신청 <span class="count-pill">${requests.length}</span></h2><button id="refresh-provider" class="text-button">${icon('reset')} 새로고침</button></div><div class="status-tabs" role="group" aria-label="신청 상태 필터">${['', ...Object.values(STATUS)].map(status => '<button class="' + (filter === status ? 'active' : '') + '" data-status="' + status + '" aria-pressed="' + (filter === status) + '">' + (status || '전체') + '</button>').join('')}</div><div id="provider-requests" class="requests-grid">${providerRequests(requests.filter(row => !filter || row.status === filter))}</div></section>`;
}
export function providerRequests(requests) {
  if (!requests.length) return empty('표시할 신청이 없습니다', '다른 상태를 선택하거나 새로운 신청을 기다려 주세요.');
  return requests.map(row => `<article class="request-card"><div class="request-card-head"><span class="company-avatar">${e(row.itsCompany.slice(0, 1))}</span><div><h3>${e(row.itsCompany)}</h3><small>${dateText(row.createdAt)} 신청</small></div>${badge(row.status)}</div><div class="request-meta"><span>${icon('clock')} ${e(row.time)}</span><span>${icon('users')} ${row.attendees}명</span></div><p class="request-description">${e(row.details)}</p><div class="request-card-footer"><button class="text-button" data-detail="${e(row.id)}">상세 보기 ${icon('chevron')}</button>${row.status === STATUS.PENDING ? '<div class="decision-buttons"><button class="button secondary small" data-decision="' + STATUS.REJECTED + '" data-id="' + e(row.id) + '">거절</button><button class="button primary small" data-decision="' + STATUS.CONFIRMED + '" data-id="' + e(row.id) + '">' + icon('check') + ' 승인</button></div>' : '<span class="muted">처리 완료</span>'}</div></article>`).join('');
}
export function adminPage(requests) {
  return pageHeading('OPERATIONS OVERVIEW', '비즈매칭 운영 대시보드', '전체 신청부터 최종 매칭까지, 행사 현황을 한눈에 확인하세요.', '<button id="refresh-admin" class="button secondary">' + icon('reset') + ' 새로고침</button>') +
    '<div class="notice">' + icon('info') + '<p><strong>관리자 데모 화면</strong> 이 브라우저의 모의 데이터입니다. 운영용 관리자 인증과 Google Sheets 연결은 다음 단계에 적용합니다.</p></div>' + stats(requests) +
    `<section class="panel schedule-panel"><div class="panel-heading"><div><h2>시간별 상담 현황</h2><p>전체 신청 기준 · 확정 건수 / 동시상담 정원</p></div><div class="schedule-legend"><span><i></i> 여유</span><span><i></i> 정원 마감</span></div></div><div class="table-scroll"><table class="schedule-table"><caption class="sr-only">시간별 NPU 기업의 확정 상담 건수와 정원</caption><thead><tr><th scope="col">상담 시간 <span class="muted">(예시)</span></th>${PROVIDERS.map(p => '<th scope="col"><span class="table-provider">' + mark(p) + p.name + '</span></th>').join('')}</tr></thead><tbody>${TIMES.map(time => '<tr><th scope="row">' + time + '</th>' + PROVIDERS.map(p => {
      const n = requests.filter(row => row.providerId === p.id && row.time === time && row.status === STATUS.CONFIRMED).length;
      return '<td><div class="schedule-cell ' + (n >= p.capacity ? 'at-capacity' : '') + '"><span><strong>' + n + '</strong> / ' + p.capacity + '</span><div class="capacity-track"><i style="width:' + n / p.capacity * 100 + '%"></i></div></div></td>';
    }).join('') + '</tr>').join('')}</tbody></table></div></section>
    <section class="panel admin-list"><div class="panel-heading"><h2>전체 신청 목록 <span class="count-pill">${requests.length}</span></h2><span class="muted">신청취소 ${requests.filter(row => row.status === STATUS.CANCELLED).length}건 포함</span></div>
    <form id="admin-filters" class="filters" role="search"><label class="filter-search"><span class="sr-only">ITS 기업명 검색</span>${icon('search')}<input name="company" placeholder="ITS 기업명 검색" aria-label="ITS 기업명 검색"></label><label><span class="sr-only">NPU 기업 필터</span><select name="provider">${options(PROVIDERS, '모든 NPU 기업')}</select></label><label><span class="sr-only">상담 시간 필터</span><select name="time">${options(TIMES, '모든 시간')}</select></label><label><span class="sr-only">신청 상태 필터</span><select name="status">${options(Object.values(STATUS), '모든 상태')}</select></label><button class="icon-button" type="reset" aria-label="필터 초기화" title="필터 초기화">${icon('reset')}</button></form><div id="admin-results">${adminRows(requests)}</div></section>`;
}
export function adminRows(rows) {
  if (!rows.length) return empty('조건에 맞는 신청이 없습니다', '검색어나 필터를 변경해 주세요.');
  return `<div class="table-scroll"><table class="requests-table"><caption class="sr-only">필터링된 상담 신청 목록</caption><thead><tr><th scope="col">ITS 기업 / 담당자</th><th scope="col">NPU 기업</th><th scope="col">상담 시간</th><th scope="col">인원</th><th scope="col">상태</th><th scope="col"><span class="sr-only">상세</span></th></tr></thead><tbody>${rows.map(row => '<tr><td><strong>' + e(row.itsCompany) + '</strong><small>' + e(row.contactName) + '</small></td><td>' + providerById(row.providerId).name + '</td><td class="nowrap">' + e(row.time) + '</td><td>' + row.attendees + '명</td><td>' + badge(row.status) + '</td><td><button class="icon-button" data-detail="' + e(row.id) + '" aria-label="' + e(row.itsCompany) + ' 신청 상세">' + icon('chevron') + '</button></td></tr>').join('')}</tbody></table></div><div class="table-footer">총 <strong>${rows.length}</strong>건의 신청이 표시됩니다.</div>`;
}
