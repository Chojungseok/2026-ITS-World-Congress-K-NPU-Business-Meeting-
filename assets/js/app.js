import { api } from './api.js';
import { STATUS, STORAGE_KEY, TIMES, providerById, applyPublicConfig, PRIVACY_NOTICE } from './config.js';
import * as view from './views.js';
import { RUNTIME_CONFIG } from './runtime-config.js';
import { readSession, saveSession, clearSession } from './session-store.js';
view.setViewContext({ demo: api.mode === 'mock' });
const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app');
app.innerHTML = view.shell();
// Capture non-bubbling image failures without inline event handlers.
document.addEventListener('error', event => {
  const img = event.target;
  if (!img.matches?.('[data-provider-logo]')) return;
  img.hidden = true; img.parentElement.querySelector('.logo-fallback').hidden = false;
}, true);
const main = $('#main');
// Partial updates preserve scroll explicitly; prevent browser anchor correction afterward.
main.style.overflowAnchor = 'none';
const dialog = $('#result-dialog');
let route = '';
const restoredProvider = api.mode === 'gas' ? readSession('provider') : null;
let providerToken = restoredProvider?.token || null;
let activeProvider = restoredProvider?.providerId || '';
let adminToken = api.mode === 'gas' ? readSession('admin')?.token || null : null;
let providerFilter = '';
let currentRows = [];
let currentHistory = [];
let currentProviders = [];
let activeAdminSlot = null;
let activeRequestDetail = null;
let lookupRow = null;
let loadedAvailabilityRevision = null;
let lookupPrefill = null; // ID-finder email is reused in memory only.
let toastTimer;
let renderVersion = 0;
let availabilityVersion = 0;
let refreshPromise = null;
let refreshVersion = -1;
let dataGeneration = 0;
let providerViewConfig = null;
let capacityViewDeferred = false;
let loadedRevision = null;
let legacyRevisionServer = false;
let revisionRecovery = false;
let pendingRevisionSince = null;
let automaticTimer;
let visibilityGeneration = 0;
let probeOnReturn = false;
let pollingError = '';
const pollingConfig = RUNTIME_CONFIG.revisionPolling || {
  providerMs: RUNTIME_CONFIG.refreshIntervalMs, adminMs: RUNTIME_CONFIG.refreshIntervalMs,
  retryMs: RUNTIME_CONFIG.refreshIntervalMs
};
const titles = { home: '비즈매칭 소개', apply: '상담 신청', lookup: '신청 현황 확인', 'find-id': '신청 ID 찾기', brochures: 'NPU 기업 소개자료', npu: 'NPU 승인 관리', matching: '매칭 현황', admin: '운영 대시보드' };

function toast(message, isError = false) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.toggle('error', isError);
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 4500);
}
function errorAt(selector, error) {
  const element = $(selector);
  if (element) { element.textContent = error.message; element.hidden = false; }
  else toast(error.message, true);
}
async function busy(button, action, errorSelector) {
  if (button.disabled) return;
  const original = button.innerHTML;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = '처리 중…';
  if (errorSelector && $(errorSelector)) $(errorSelector).hidden = true;
  try { await action(); }
  catch (error) { errorAt(errorSelector || '#nonexistent-error', error); }
  finally { button.disabled = false; button.removeAttribute('aria-busy'); button.innerHTML = original; }
}
function showDialog(content, { wide = false, keepSlot = false, keepRequest = false } = {}) {
  if (!keepSlot) activeAdminSlot = null;
  if (!keepRequest) activeRequestDetail = null;
  dialog.classList.toggle('wide-dialog', wide);
  dialog.innerHTML = '<button class="icon-button dialog-close" data-close-dialog aria-label="닫기">' + view.icon('close') + '</button>' + content;
  if (!dialog.open) dialog.showModal();
}
function confirmAction({ title, description, label, danger, action }) {
  showDialog('<span class="dialog-symbol">' + view.icon(danger ? 'info' : 'check') + '</span><h2 id="dialog-title">' + view.escapeHtml(title) + '</h2><p class="dialog-description">' + view.escapeHtml(description) + '</p><p class="inline-error" id="dialog-error" role="alert" hidden></p><div class="dialog-actions"><button class="button secondary" data-close-dialog>돌아가기</button><button class="button ' + (danger ? 'danger' : 'primary') + '" id="confirm-action">' + label + '</button></div>');
  $('#confirm-action').addEventListener('click', event => busy(event.currentTarget, async () => { await action(); dialog.close(); }, '#dialog-error'));
}
dialog.addEventListener('close', () => { activeAdminSlot = null; activeRequestDetail = null; });
dialog.addEventListener('click', event => {
  if (event.target.closest('[data-close-dialog]')) { dialog.close(); return; }
  if (!activeAdminSlot) return;
  const request = event.target.closest('[data-popup-request]');
  if (request) { activeAdminSlot.requestId = request.dataset.popupRequest; renderAdminSlot(); }
  if (event.target.closest('[data-back-slot]')) { activeAdminSlot.requestId = null; renderAdminSlot(); }
});

function summary() {
  const form = $('#application-form');
  if (!form) return;
  const data = new FormData(form);
  $('#selection-summary').innerHTML = view.selectionSummary(data.get('providerId'), data.get('time'), data.get('attendees'));
  $('#character-count').textContent = (data.get('details') || '').length.toLocaleString('ko-KR') + ' / 1,000';
}

function showTimes(form, slots) {
  const providerId = form.elements.providerId.value;
  const provider = providerById(providerId);
  if (provider) {
    const capacities = Object.fromEntries(slots.map(slot => [slot.time, slot.capacity]));
    const label = $('[data-capacity-provider="' + providerId + '"]', form);
    if (label) label.textContent = view.capacityRange({ ...provider, capacities });
  }
  const html = view.timeOptions(slots, new FormData(form).get('time'));
  if ($('#time-options').innerHTML !== html) $('#time-options').innerHTML = html;
  $('button[type="submit"]', form).disabled = form.dataset.ready !== 'true';
  summary();
}
async function loadTimes() {
  const form = $('#application-form');
  if (!form || form.dataset.ready !== 'true') return;
  const version = ++availabilityVersion;
  const providerId = form.elements.providerId.value;
  const snapshot = api.mode === 'gas' ? await api.getAvailabilitySnapshot(providerId) : { slots: await api.getAvailability(providerId) };
  const slots = snapshot.slots;
  if (version !== availabilityVersion || !form.isConnected) return;
  if (snapshot.config) applyPublicConfig(snapshot.config);
  else if (api.mode === 'mock') applyPublicConfig(await api.getConfig());
  loadedAvailabilityRevision = snapshot.revision ?? null;
  document.querySelectorAll('[data-schedule-range]').forEach(el => { el.textContent = view.scheduleRange(); });
  showTimes(form, slots);
}
async function initializeApplication() {
  const form = $('#application-form'), version = ++availabilityVersion;
  const initialProvider = form.elements.providerId.value;
  form.dataset.ready = 'false';
  $('button[type="submit"]', form).disabled = true;
  form.elements.privacyConsent.disabled = true;
  form.querySelectorAll('[name="providerId"]').forEach(input => { input.disabled = true; });
  $('#time-options').textContent = '상담 가능 시간을 불러오는 중…';
  // One snapshot on current GAS; preserve fallback for older deployments/inactive providers.
  const availability = api.mode === 'gas'
    ? api.getAvailabilitySnapshot(initialProvider).then(snapshot => ({ slots:snapshot.slots, snapshot }), error => ({ error }))
    : api.getAvailability(initialProvider).then(slots => ({ slots }), error => ({ error }));
  // Current servers include config in the same authoritative public snapshot. Old
  // deployments and an inactive initial provider still use the safe config fallback.
  const initial = await availability;
  const config = initial.snapshot?.config || await api.getConfig();
  if (!form.isConnected || version !== availabilityVersion) return;
  applyPublicConfig(config);
  const providers = config.providers.filter(provider => provider.active !== false);
  $('.provider-grid', form).innerHTML = view.providerOptions(providers);
  const selected = [...form.querySelectorAll('[name="providerId"]')].find(input => input.value === initialProvider);
  if (selected) selected.checked = true;
  const notice = document.createElement('template');
  notice.innerHTML = view.privacyConsent();
  $('#privacy-details').innerHTML = notice.content.querySelector('#privacy-details').innerHTML;
  if (form.dataset.noticeVersion && form.dataset.noticeVersion !== PRIVACY_NOTICE.version) form.elements.privacyConsent.checked = false;
  form.dataset.noticeVersion = PRIVACY_NOTICE.version;
  form.elements.privacyConsent.disabled = false;
  form.dataset.ready = 'true';
  if (!providers.length) throw new Error('현재 신청 가능한 NPU 기업이 없습니다.');
  summary();
  const result = initial;
  loadedAvailabilityRevision = result.snapshot?.revision ?? null;
  document.querySelectorAll('[data-schedule-range]').forEach(el => { el.textContent = view.scheduleRange(); });
  if (!form.isConnected || version !== availabilityVersion) return;
  if (form.elements.providerId.value !== initialProvider) return loadTimes();
  if (result.error) throw result.error;
  showTimes(form, result.slots);
}
function bindApply() {
  const form = $('#application-form');
  const privacyToggle = $('#privacy-toggle');
  privacyToggle.addEventListener('click', () => {
    const expanded = privacyToggle.getAttribute('aria-expanded') !== 'true';
    privacyToggle.setAttribute('aria-expanded', String(expanded));
    privacyToggle.setAttribute('aria-label', '개인정보 수집 동의 내용 ' + (expanded ? '접기' : '펼치기'));
    $('#privacy-details').hidden = !expanded;
  });
  form.addEventListener('input', summary);
  form.addEventListener('change', event => {
    if (event.target.name === 'providerId') loadTimes().catch(error => errorAt('#application-error', error));
    else summary();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    values.consent = form.elements.consent.checked;
    values.privacyConsent = form.elements.privacyConsent.checked;
    values.privacyNoticeVersion = form.dataset.noticeVersion || PRIVACY_NOTICE.version;
    busy($('button[type="submit"]', form), async () => {
      const record = await api.submitRequest(values);
      form.reset();
      loadTimes().catch(error => toast(error.message, true));
      const escapedId = view.escapeHtml(record.id);
      showDialog('<span class="dialog-symbol success">' + view.icon('check') + '</span><span class="eyebrow gray">REQUEST RECEIVED</span><h2 id="dialog-title">상담 신청이 접수되었습니다</h2><p class="dialog-description">NPU 기업의 검토 후 매칭이 확정됩니다.<br>아래 신청ID를 꼭 보관해 주세요.</p><div class="success-summary">' + view.badge(record.status) + '<strong>' + view.escapeHtml(providerById(record.providerId).name) + ' · ' + view.escapeHtml(record.time) + '</strong></div><label class="field">신청ID<input readonly id="new-request-id" value="' + escapedId + '"></label><p class="muted">신청ID와 신청 이메일로 신청 상태를 조회할 수 있습니다. 신청ID를 안전하게 보관해 주세요.<br>자동 확인 이메일은 발송되지 않습니다.</p><div class="dialog-actions"><button class="button secondary" id="copy-id">' + view.icon('copy') + ' ID 복사</button><button class="button primary" id="go-lookup">신청 확인하기 ' + view.icon('arrow') + '</button></div>');
      $('#copy-id').onclick = async () => {
        try { await navigator.clipboard.writeText(record.id); toast('신청ID를 복사했습니다.'); }
        catch { $('#new-request-id').select(); toast('선택된 신청ID를 직접 복사해 주세요.'); }
      };
      $('#go-lookup').onclick = async () => {
        dialog.close();
        lookupRow = record;
        location.hash = 'lookup';
      };
    }, '#application-error');
  });
  summary();
}
function bindLookup() {
  const form = $('#lookup-form'), version = renderVersion;
  if (lookupRow) {
    form.elements.id.value = lookupRow.id;
    form.elements.email.value = lookupRow.email;
    showLookup(lookupRow);
  }
  const prefill = lookupPrefill; lookupPrefill = null;
  if (prefill) { form.elements.id.value = prefill.id; form.elements.email.value = prefill.email; }
  if (api.mode === 'mock') $('#fill-example').onclick = () => {
    form.elements.id.value = 'DEMO-0001';
    form.elements.email.value = 'demo1@example.com';
    form.elements.id.focus();
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    busy($('button[type="submit"]', form), async () => {
      lookupRow = null;
      $('#lookup-result').innerHTML = view.empty('신청을 조회하고 있습니다', '잠시만 기다려 주세요.');
      try {
        const row = await api.findRequest(Object.fromEntries(new FormData(form)));
        if (version !== renderVersion || !form.isConnected) return;
        lookupRow = row;
        showLookup(row);
      } catch (error) {
        if (version !== renderVersion || !form.isConnected) return;
        $('#lookup-result').innerHTML = view.empty('신청 정보를 확인해 주세요', '신청ID와 신청 이메일을 확인해 주세요.');
        throw error;
      }
    }, '#lookup-error');
  });
  if (prefill) form.requestSubmit();
}
function bindFindIds() {
  const form = $('#find-ids-form'), version = renderVersion;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form));
    busy($('button[type="submit"]', form), async () => {
      $('#find-ids-result').innerHTML = view.empty('신청ID를 찾고 있습니다', '잠시만 기다려 주세요.');
      try {
        const rows = await api.findRequestIds(input);
        if (version !== renderVersion || !form.isConnected) return;
        const result = $('#find-ids-result'); result.innerHTML = view.foundRequestIds(rows);
        result.onclick = event => {
          const button = event.target.closest('[data-found-id]');
          if (!button) return;
          lookupRow = null; lookupPrefill = { id: button.dataset.foundId, email: input.email.trim().toLowerCase() };
          location.hash = 'lookup';
        };
      } catch (error) {
        if (version !== renderVersion || !form.isConnected) return;
        $('#find-ids-result').innerHTML = view.empty('신청자 정보를 확인해 주세요', '입력하신 정보와 일치하는 신청을 찾을 수 없습니다.');
        throw error;
      }
    }, '#find-ids-error');
  });
}
function showLookup(row) {
  $('#lookup-result').innerHTML = view.requestDetail(row, { cancel: true });
  const cancelButton = $('#cancel-request');
  if (cancelButton) cancelButton.onclick = () => confirmAction({
    title: '상담 신청을 취소할까요?',
    description: '취소한 신청은 되돌릴 수 없습니다. 확정된 상담을 취소하면 해당 시간의 자리가 다시 열립니다.',
    label: '신청 취소', danger: true,
    action: async () => {
      lookupRow = await api.cancelRequest({ id: row.id, email: row.email });
      showLookup(lookupRow);
      toast('상담 신청을 취소했습니다.');
    }
  });
}
function bindProviderLogin() {
  $('#provider-login-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    busy($('button[type="submit"]', form), async () => {
      const providerId = form.elements.providerId.value;
      const token = await api.authenticateProvider({
        providerId,
        approvalCode: form.elements.approvalCode.value
      });
      activeProvider = providerId;
      providerToken = token;
      if (api.mode === 'gas') saveSession('provider', token);
      form.elements.approvalCode.value = '';
      providerFilter = '';
      await renderRoute(false);
    }, '#provider-login-error');
  });
}
function bindProvider() {
  $('#refresh-provider').onclick = () => refresh().catch(error => toast(error.message, true));
  $('.status-tabs').onclick = event => {
    const button = event.target.closest('[data-status]');
    if (!button) return;
    providerFilter = button.dataset.status;
    for (const tab of document.querySelectorAll('[data-status]')) {
      tab.classList.toggle('active', tab === button);
      tab.setAttribute('aria-pressed', String(tab === button));
    }
    $('#provider-requests').innerHTML = view.providerRequests(currentRows.filter(row => !providerFilter || row.status === providerFilter));
  };
}
function bindCapacity() {
  document.querySelectorAll('.slot-capacity-form').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      const time = form.elements.time.value;
      const drafts = [...document.querySelectorAll('.slot-capacity-form')].filter(other =>
        other !== form && other.elements.capacity.value !== other.elements.capacity.defaultValue
      ).map(other => [other.elements.time.value, other.elements.capacity.value]);
      busy($('button[type="submit"]', form), async () => {
        await api.updateProviderCapacity({ token: providerToken, time, capacity: form.elements.capacity.value });
        form.elements.capacity.defaultValue = form.elements.capacity.value;
        await refresh({ force: true });
        for (const [draftTime, value] of drafts) {
          const nextForm = [...document.querySelectorAll('.slot-capacity-form')].find(other => other.elements.time.value === draftTime);
          if (nextForm) nextForm.elements.capacity.value = value;
        }
        toast(time + ' 정원을 변경했습니다.');
      }, '#' + $('.inline-error', form).id);
    });
  });
}

function bindAdminLogin() {
  $('#admin-login-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    busy($('button[type="submit"]', form), async () => {
      adminToken = await api.authenticateAdmin({ id: form.elements.id.value, password: form.elements.password.value });
      if (api.mode === 'gas') saveSession('admin', adminToken);
      form.elements.password.value = '';
      await renderRoute(false);
    }, '#admin-login-error');
  });
}
function filterHistory() {
  const form = $('#history-filters');
  if (!form) return;
  const values = Object.fromEntries(new FormData(form));
  const query = values.query.trim().toLocaleLowerCase('ko-KR');
  const requestMap = new Map(currentRows.map(row => [row.id, row]));
  const events = currentHistory.filter(event => {
    const request = requestMap.get(event.requestId);
    return [event.requestId, event.itsCompany, event.actor, request?.contactName].some(value => String(value || '').toLocaleLowerCase('ko-KR').includes(query)) &&
      (!values.provider || values.provider === event.providerId) &&
      (!values.time || values.time === event.time) &&
      (!values.action || values.action === event.action);
  });
  $('#history-results').innerHTML = view.adminHistoryRows(events, currentRows, values.order);
}

function bindAdmin(savedHistoryFilters) {
  $('#extend-schedule').onclick = () => {
    const expectedLastTime = TIMES.filter(time => currentProviders.some(p => p.enabled?.[time] !== false)).at(-1);
    showDialog(view.extensionDialog(expectedLastTime));
    $('#confirm-extension').onclick = event => busy(event.currentTarget, async () => {
      try {
        await api.extendSchedule({ token: adminToken, expectedLastTime });
        await refresh({ force:true }); dialog.close(); toast('상담 시간을 10분 연장했습니다.');
      } catch (error) {
        // After any uncertain write, refresh authoritative schedule before another click.
        await refresh({ force:true }).catch(() => {});
        throw error;
      }
    }, '#dialog-error');
  };
  $('#refresh-admin').onclick = () => refresh().catch(error => toast(error.message, true));
  $('#admin-logout').onclick = async () => {
    try { await api.logout(adminToken); } catch (error) { toast(error.message, true); }
    clearSession('admin');
    adminToken = null;
    currentRows = [];
    currentHistory = [];
    currentProviders = [];
    activeAdminSlot = null;
    dialog.close();
    await renderRoute(false);
  };
  const filters = $('#history-filters');
  if (savedHistoryFilters) for (const [key, value] of Object.entries(savedHistoryFilters)) filters.elements[key].value = value;
  filters.addEventListener('submit', event => event.preventDefault());
  filters.addEventListener('input', event => { if (event.target.matches('input')) filterHistory(); });
  filters.addEventListener('change', event => { if (event.target.matches('select')) filterHistory(); });
  filters.addEventListener('reset', () => setTimeout(filterHistory, 0));
  filterHistory();
}

function renderAdminSlot() {
  if (!adminToken || route !== 'admin' || !activeAdminSlot) return;
  const { providerId, time, requestId } = activeAdminSlot;
  const provider = currentProviders.find(item => item.id === providerId);
  if (!provider) return;
  const row = requestId && currentRows.find(item => item.id === requestId && item.providerId === providerId && item.time === time);
  if (row) {
    showDialog('<button type="button" class="text-button slot-back" data-back-slot>← 상담 기업 목록</button><h2 id="dialog-title" class="sr-only">상담 신청 상세</h2>' + view.requestDetail(row), { keepSlot: true });
  } else {
    activeAdminSlot.requestId = null;
    showDialog(view.adminSlotDetail(provider, time, currentRows), { wide: true, keepSlot: true });
  }
}

main.addEventListener('click', event => {
  const slot = event.target.closest('[data-slot-detail]');
  if (slot && adminToken && route === 'admin') {
    activeAdminSlot = { providerId: slot.dataset.provider, time: slot.dataset.time, requestId: null };
    renderAdminSlot();
    return;
  }
  const detail = event.target.closest('[data-detail]');
  if (detail) {
    const row = currentRows.find(item => item.id === detail.dataset.detail);
    if (row) showRequestDetail(row);
  }
  const decisionButton = event.target.closest('[data-decision]');
  if (decisionButton) {
    const row = currentRows.find(item => item.id === decisionButton.dataset.id);
    if (!row) return;
    const approved = decisionButton.dataset.decision === STATUS.CONFIRMED;
    if (!approved) {
      showDialog(view.rejectionDialog(row));
      $('#reject-request-form').addEventListener('submit', event => {
        event.preventDefault();
        const form = event.currentTarget, reason = form.elements.rejectionReason.value.trim();
        if (!reason || reason.length > 500) {
          errorAt('#dialog-error', new Error('거절 사유를 1~500자로 입력해 주세요.')); return;
        }
        busy($('button[type="submit"]', form), async () => {
          await api.decideRequest({ token: providerToken, id: row.id, decision: STATUS.REJECTED, rejectionReason: reason });
          await refresh({ force: true }); dialog.close(); toast('상담 신청을 거절했습니다.');
        }, '#dialog-error');
      });
      return;
    }
    confirmAction({
      title: approved ? '이 상담을 승인할까요?' : '이 상담을 거절할까요?',
      description: row.itsCompany + ' · ' + row.time + (approved ? ' 상담을 매칭확정으로 변경합니다. 승인 시 정원을 다시 확인합니다.' : ' 상담을 매칭거절로 변경합니다.'),
      label: approved ? '승인하기' : '거절하기', danger: !approved,
      action: async () => {
        await api.decideRequest({ token: providerToken, id: row.id, decision: decisionButton.dataset.decision });
        await refresh({ force: true });
        toast(approved ? '상담 매칭을 확정했습니다.' : '상담 신청을 거절했습니다.');
      }
    });
  }
});
async function renderRoute(focus = true) {
  const version = ++renderVersion;
  loadedAvailabilityRevision = null;
  loadedRevision = null; legacyRevisionServer = false; revisionRecovery = false; pendingRevisionSince = null; pollingError = '';
  const newRoute = location.hash.replace('#', '');
  route = titles[newRoute] ? newRoute : 'home';
  document.body.classList.toggle('home-screen', route === 'home');
  const itsScreen = ['apply', 'lookup', 'find-id', 'brochures'].includes(route);
  const providerScreen = route === 'npu' || route === 'matching';
  $('#sidebar .management-label').hidden = itsScreen;
  $('#sidebar .management-label').textContent = providerScreen ? 'NPU 파트너' : '파트너 & 운영';
  $('#sidebar [data-route="npu"]').hidden = itsScreen || route === 'admin';
  $('#sidebar [data-route="admin"]').hidden = itsScreen || providerScreen;
  $('#sidebar [data-route="matching"]').hidden = !providerScreen;
  $('#sidebar [data-route="brochures"]').hidden = providerScreen;
  $('.topbar-right').hidden = itsScreen || route === 'home';
  $('#provider-logout').hidden = !providerToken || !providerScreen;
  const signedInProvider = providerToken ? providerById(activeProvider) : null;
  document.body.classList.toggle('has-provider-session', !!signedInProvider && route !== 'admin');
  document.body.classList.toggle('has-admin-session', !!adminToken && route === 'admin');
  $('.profile-name').textContent = route === 'admin' ? (adminToken ? 'ITS Korea 관리자' : 'ITS Korea') : signedInProvider?.name || (providerScreen ? 'NPU 기업' : 'ITS Korea');
  $('.profile-avatar').innerHTML = route === 'admin' ? 'ITS' : (signedInProvider && providerScreen ? view.mark(signedInProvider) : 'N');
  $('.profile-avatar').classList.toggle('provider-profile', !!signedInProvider && providerScreen);
  $('#route-title').textContent = titles[route];
  document.title = titles[route] + ' · K-NPU Connect';
  document.querySelectorAll('[data-route]').forEach(link => {
    link.classList.toggle('active', link.dataset.route === route);
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('#sidebar').classList.remove('is-open');
  $('#menu-toggle').setAttribute('aria-expanded', 'false');
  $('#menu-toggle').setAttribute('aria-label', '메뉴 열기');
  main.dataset.loading = 'true';
  try {
    if (route === 'home') main.innerHTML = view.homePage();
    if (route === 'brochures') main.innerHTML = view.brochuresPage();
    if (route === 'find-id') { lookupRow = null; main.innerHTML = view.findIdsPage(); bindFindIds(); }
    if (route === 'apply') {
      main.innerHTML = view.applyPage(); bindApply();
      // Form fields are usable before GAS responds; submission waits for config and slots.
      await initializeApplication();
    }
    if (route === 'lookup') {
      main.innerHTML = view.lookupPage(); bindLookup();
      if (lookupRow) await refresh();
    }
    if (route === 'npu' || route === 'matching') {
      if (!providerToken) {
        main.innerHTML = view.providerLogin(); bindProviderLogin();
        if (api.mode === 'gas') {
          const config = await api.getConfig();
          if (version !== renderVersion) return;
          applyPublicConfig(config);
          const select = $('#provider-login-form [name="providerId"]'), selected = select.value;
          select.innerHTML = view.options(config.providers.filter(p => p.active !== false), '기업을 선택하세요');
          select.value = selected;
        }
      } else {
        main.innerHTML = loadingPanel('NPU 상담 현황', '상담 신청을 불러오는 중…');
        await loadProviderView(version, false);
      }
    }
    if (route === 'admin') {
      if (!adminToken) { main.innerHTML = view.adminLogin(); bindAdminLogin(); }
      else {
        main.innerHTML = loadingPanel('비즈매칭 운영 대시보드', '운영 현황을 불러오는 중…');
        await loadAdminView(version, false);
      }
    }
    if (focus && version === renderVersion) { main.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
  } catch (error) {
    if (version !== renderVersion) return;
    if (await recoverSession(error)) return;
    // Preserve entered application data on a network/config failure.
    if (route === 'apply' && $('#application-form')) {
      errorAt('#application-error', error);
      let retry = $('#retry-application');
      if (!retry) {
        retry = document.createElement('button'); retry.id = 'retry-application';
        retry.type = 'button'; retry.className = 'button secondary'; retry.textContent = '상담 시간 다시 불러오기';
        $('#application-error').after(retry);
      }
      retry.onclick = () => busy(retry, async () => { await initializeApplication(); retry.remove(); }, '#application-error');
    } else {
      main.innerHTML = '<section class="panel error-panel"><h1>화면을 불러오지 못했습니다</h1><p role="alert">' + view.escapeHtml(error.message) + '</p><button class="button primary" id="retry-page">다시 시도</button></section>';
      $('#retry-page').onclick = () => renderRoute(false);
    }
  } finally {
    if (version === renderVersion) { main.dataset.loading = 'false'; scheduleAutomatic(); }
  }
}


function loadingPanel(title, message) {
  return view.pageHeading('BUSINESS MATCHING', title, message) +
    '<section class="panel" role="status" style="padding:24px">' + view.escapeHtml(message) + '</section>';
}
function sameData(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function replaceRegion(selector, template) {
  const current = $(selector, main), next = template.content.querySelector(selector);
  if (current && next && current.outerHTML !== next.outerHTML) { current.replaceWith(next); return true; }
  return false;
}
function capacityEditing() {
  return !!document.activeElement?.closest('.capacity-settings') ||
    [...document.querySelectorAll('.slot-capacity-form [name="capacity"]')].some(input => input.value !== input.defaultValue);
}
async function loadProviderView(version, partial) {
  const token = providerToken, id = activeProvider, page = route, generation = dataGeneration;
  const snapshot = api.mode === 'gas' ? await api.getProviderSnapshot(token) : { requests: await api.getProviderRequests(token) };
  const rows = snapshot.requests;
  if (version !== renderVersion || generation !== dataGeneration || token !== providerToken || route !== page) return;
  // New server includes fresh public config; adapter seeds its cache without another GET.
  const config = await api.getConfig();
  if (version !== renderVersion || generation !== dataGeneration || token !== providerToken || id !== activeProvider || route !== page) return;
  if (api.mode === 'gas') applyPublicConfig(config);
  const provider = config.providers.find(p => p.id === id);
  if (!provider) throw new Error('기업 설정을 확인해 주세요.');
  const unchanged = sameData(currentRows, rows) && sameData(providerViewConfig, provider);
  currentRows = rows; providerViewConfig = provider;
  acceptRevision(snapshot);
  $('.profile-name').textContent = provider.name;
  if (partial && unchanged && (!capacityViewDeferred || capacityEditing())) return false;
  const restoreViewport = preserveViewport();
  const html = page === 'matching' ? view.providerMatchingPage(id, rows, provider) : view.providerPage(id, rows, providerFilter, provider);
  if (!partial) {
    main.innerHTML = html;
    if (page === 'matching') $('#refresh-matching').onclick = () => refresh().catch(error => toast(error.message, true));
    else bindProvider();
    bindCapacity(); capacityViewDeferred = false;
  } else {
    const template = document.createElement('template'); template.innerHTML = html;
    for (const selector of ['.stats-grid', '.slot-overview', '#provider-requests', '.request-section .count-pill', '.matching-panel'])
      replaceRegion(selector, template);
    if (capacityEditing()) capacityViewDeferred = true;
    else { if (replaceRegion('.capacity-settings', template)) bindCapacity(); capacityViewDeferred = false; }
  }
  syncOpenDetail();
  if (partial) restoreViewport();
  return !unchanged;
}
async function loadAdminView(version, partial) {
  const token = adminToken, generation = dataGeneration, overview = await api.getAdminOverview(token);
  if (version !== renderVersion || generation !== dataGeneration || token !== adminToken || route !== 'admin') return;
  // Legacy server fallback derives public times from the already-returned capacities.
  applyPublicConfig(overview.config || {
    providers: overview.providers,
    times: [...new Set(overview.providers.flatMap(p => Object.keys(p.capacities || {})))].sort().length
      ? [...new Set(overview.providers.flatMap(p => Object.keys(p.capacities || {})))].sort() : TIMES
  });
  const unchanged = sameData(currentRows, overview.requests) && sameData(currentHistory, overview.history) && sameData(currentProviders, overview.providers);
  currentRows = overview.requests; currentHistory = overview.history; currentProviders = overview.providers;
  acceptRevision(overview);
  if (partial && unchanged) return false;
  const restoreViewport = preserveViewport();
  if (!partial) {
    main.innerHTML = view.adminPage(currentRows, currentProviders, currentHistory); bindAdmin();
  } else {
    const template = document.createElement('template');
    template.innerHTML = view.adminPage(currentRows, currentProviders, currentHistory);
    for (const selector of ['.stats-grid', '.progress-panel', '.history-panel .panel-heading .count-pill'])
      replaceRegion(selector, template);
    for (const name of ['provider', 'time']) {
      const select = $('#history-filters').elements[name], value = select.value;
      const next = template.content.querySelector('#history-filters [name="' + name + '"]');
      if (select.innerHTML !== next.innerHTML) { select.innerHTML = next.innerHTML; select.value = value; if (!select.value) select.value = ''; }
    }
    filterHistory();
  }
  syncOpenDetail();
  if (partial) restoreViewport();
  return !unchanged;
}
function preserveViewport() {
  const x = window.scrollX, y = window.scrollY, top = dialog.scrollTop;
  return () => { window.scrollTo(x, y); if (dialog.open) dialog.scrollTop = top; };
}
function showRequestDetail(row) {
  activeRequestDetail = { id: row.id, role: route === 'admin' ? 'admin' : 'provider' };
  showDialog('<h2 id="dialog-title" class="sr-only">상담 신청 상세</h2>' + view.requestDetail(row), { keepRequest: true });
}
function syncOpenDetail() {
  if (!dialog.open || dialog.querySelector('input:not([readonly]):not([type="hidden"]),textarea:not([readonly]),select,[contenteditable="true"]')) return;
  if (activeAdminSlot && route === 'admin') renderAdminSlot();
  else if (activeRequestDetail) {
    const role = route === 'admin' ? 'admin' : 'provider';
    const row = role === activeRequestDetail.role && currentRows.find(row => row.id === activeRequestDetail.id);
    if (row) showRequestDetail(row);
  }
}
function acceptRevision(snapshot) {
  legacyRevisionServer = !Object.hasOwn(snapshot, 'revision');
  loadedRevision = typeof snapshot.revision === 'string' ? snapshot.revision : null;
  if (!legacyRevisionServer && loadedRevision === null) {
    pendingRevisionSince ??= Date.now();
    revisionRecovery = Date.now() - pendingRevisionSince >= pollingConfig.retryMs;
  } else { pendingRevisionSince = null; revisionRecovery = false; }
}
function flushDeferredCapacity() {
  if (!capacityViewDeferred || capacityEditing() || !providerToken || !['npu', 'matching'].includes(route) || !providerViewConfig) return;
  const template = document.createElement('template');
  template.innerHTML = route === 'matching' ? view.providerMatchingPage(activeProvider, currentRows, providerViewConfig)
    : view.providerPage(activeProvider, currentRows, providerFilter, providerViewConfig);
  const restore = preserveViewport();
  if (replaceRegion('.capacity-settings', template)) bindCapacity();
  capacityViewDeferred = false; restore();
}
main.addEventListener('focusout', () => setTimeout(flushDeferredCapacity, 0));
async function recoverSession(error) {
  if (!['UNAUTHORIZED', 'FORBIDDEN'].includes(error.code)) return false;
  if (route === 'admin') { adminToken = null; clearSession('admin'); }
  else { providerToken = null; activeProvider = ''; clearSession('provider'); }
  currentRows = []; currentHistory = []; dialog.close();
  toast(error.message, true); await renderRoute(false); return true;
}
function refresh({ force = false, changesOnly = false } = {}) {
  if (refreshPromise && refreshVersion === renderVersion && !force) return refreshPromise;
  if (force) dataGeneration++;
  const version = renderVersion, generation = dataGeneration;
  refreshVersion = version;
  const pending = (async () => {
    if (route === 'apply' && changesOnly && api.mode === 'gas' && loadedAvailabilityRevision) {
      try {
        const revision = await api.getAvailabilityRevision($('#application-form').elements.providerId.value);
        if (version !== renderVersion || generation !== dataGeneration || document.visibilityState !== 'visible') return;
        if (revision.revision === loadedAvailabilityRevision) return;
      } catch(error) { if (!['UNKNOWN_ACTION','REVISION_PENDING'].includes(error.code)) throw error; }
    }
    const detecting = changesOnly && api.mode === 'gas' && !legacyRevisionServer &&
      (route === 'admin' || ['npu', 'matching'].includes(route));
    if (detecting) {
      const visibility = visibilityGeneration;
      try {
        const result = route === 'admin' ? await api.getAdminRevision({ token: adminToken })
          : await api.getProviderRevision({ token: providerToken });
        if (version !== renderVersion || generation !== dataGeneration || visibility !== visibilityGeneration || document.visibilityState !== 'visible') return;
        revisionRecovery = false; pendingRevisionSince = null;
        if (result.revision === loadedRevision) { flushDeferredCapacity(); return; }
      } catch (error) {
        if (version !== renderVersion || generation !== dataGeneration || visibility !== visibilityGeneration) return;
        // During rollout, old servers retain 30s full polling. An interrupted
        // cross-service commit uses the same bounded fallback until revision recovers.
        if (error.code === 'UNKNOWN_ACTION') legacyRevisionServer = true;
        else if (error.code === 'REVISION_PENDING') {
          pendingRevisionSince ??= Date.now();
          // A normal write may still be finishing. Keep lightweight probes fast;
          // full reconciliation is only a fallback for a persistent publication failure.
          if (Date.now() - pendingRevisionSince < pollingConfig.retryMs) return;
          revisionRecovery = true;
        }
        else throw error;
      }
    }
    if (version !== renderVersion || generation !== dataGeneration) return;
    const previousRows = currentRows, previousRevision = loadedRevision;
    let changed = false;
    if (route === 'apply') await loadTimes();
    else if (route === 'lookup' && lookupRow) {
      const original = lookupRow, latest = await api.findRequest({ id: original.id, email: original.email });
      if (version !== renderVersion || route !== 'lookup' || lookupRow !== original) return;
      lookupRow = latest;
      if (!sameData(original, latest)) showLookup(lookupRow);
    } else if ((route === 'npu' || route === 'matching') && providerToken) changed = await loadProviderView(version, true);
    else if (route === 'admin' && adminToken) changed = await loadAdminView(version, true);
    if (detecting && changed && previousRevision !== null && version === renderVersion && generation === dataGeneration) {
      if (route === 'admin') toast('운영 현황이 업데이트되었습니다.');
      else {
        const ids = new Set(previousRows.map(row => row.id));
        if (currentRows.some(row => !ids.has(row.id) && row.status === STATUS.PENDING)) toast('새 상담 신청이 접수되었습니다.');
      }
    }
  })().catch(async error => {
    if (version !== renderVersion) return;
    if (!await recoverSession(error)) throw error;
  }).finally(() => {
    if (refreshPromise === pending) { refreshPromise = null; if (version === renderVersion) scheduleAutomatic(); }
  });
  refreshPromise = pending; return pending;
}
function needsPolling() {
  return route === 'apply' || (route === 'lookup' && !!lookupRow) ||
    (['npu', 'matching'].includes(route) && !!providerToken) || (route === 'admin' && !!adminToken);
}
$('#menu-toggle').onclick = () => {
  const open = $('#sidebar').classList.toggle('is-open');
  $('#menu-toggle').setAttribute('aria-expanded', String(open));
  $('#menu-toggle').setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
};
if (api.mode === 'mock') $('#reset-demo').onclick = () => confirmAction({
  title: '데모 데이터를 초기화할까요?',
  description: '이 브라우저에서 입력한 모든 신청과 처리 내역을 지우고 최초 예시 데이터로 되돌립니다.',
  label: '초기화', danger: true,
  action: async () => {
    await api.resetDemo();
    providerToken = null;
    activeProvider = '';
    adminToken = null;
    lookupRow = null;
    await renderRoute(false);
    toast('예시 데이터로 초기화했습니다.');
  }
});
window.addEventListener('hashchange', () => { dialog.close(); renderRoute(); });
window.addEventListener('storage', event => {
  if (api.mode === 'mock' && (event.key === STORAGE_KEY || event.key === null)) refresh().catch(error => toast(error.message, true));
});
document.addEventListener('visibilitychange', () => {
  visibilityGeneration++;
  clearTimeout(automaticTimer);
  probeOnReturn = document.visibilityState === 'visible';
  if (probeOnReturn) automaticRefresh();
});
renderRoute(false);

$('#provider-logout').onclick = async () => {
  try { await api.logout(providerToken); } catch (error) { toast(error.message, true); }
  clearSession('provider'); providerToken = null; activeProvider = ''; currentRows = [];
  dialog.close(); await renderRoute(false);
};
function automaticDelay() {
  if (revisionRecovery) return pollingConfig.retryMs;
  if (route === 'apply') return pollingConfig.availabilityMs || 5000;
  if (!legacyRevisionServer && ['npu', 'matching'].includes(route) && providerToken) return pollingConfig.providerMs;
  if (!legacyRevisionServer && route === 'admin' && adminToken) return pollingConfig.adminMs;
  return RUNTIME_CONFIG.refreshIntervalMs;
}
function scheduleAutomatic(delay = probeOnReturn ? 0 : automaticDelay()) {
  clearTimeout(automaticTimer);
  if (api.mode === 'gas' && needsPolling() && document.visibilityState === 'visible')
    automaticTimer = setTimeout(automaticRefresh, delay);
}
async function automaticRefresh() {
  clearTimeout(automaticTimer);
  if (api.mode !== 'gas' || !needsPolling() || document.visibilityState !== 'visible' ||
      main.dataset.loading === 'true' || (refreshPromise && refreshVersion === renderVersion)) return;
  // Partial rendering protects drafts/filters while detection continues.
  if (document.querySelector('[aria-busy="true"]') ||
      (route === 'lookup' && (dialog.open || document.activeElement?.matches('input,select,textarea')))) {
    scheduleAutomatic(); return;
  }
  probeOnReturn = false;
  try { await refresh({ changesOnly: true }); pollingError = ''; }
  catch (error) {
    scheduleAutomatic(pollingConfig.retryMs);
    if (pollingError !== error.message) toast(error.message, true);
    pollingError = error.message;
  }
}
