import { api } from './api.js';
import { STATUS, STORAGE_KEY, providerById } from './config.js';
import * as view from './views.js';
const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app');
app.innerHTML = view.shell();
const main = $('#main');
const dialog = $('#result-dialog');
let route = '';
let providerToken = null;
let activeProvider = '';
let adminToken = null;
let providerFilter = '';
let currentRows = [];
let currentHistory = [];
let currentProviders = [];
let activeAdminSlot = null;
let lookupRow = null;
let toastTimer;
let renderVersion = 0;
let availabilityVersion = 0;
const titles = { home: '비즈매칭 소개', apply: '상담 신청', lookup: '신청 현황 확인', npu: 'NPU 승인 관리', matching: '매칭 현황', admin: '운영 대시보드' };

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
function showDialog(content, { wide = false, keepSlot = false } = {}) {
  if (!keepSlot) activeAdminSlot = null;
  dialog.classList.toggle('wide-dialog', wide);
  dialog.innerHTML = '<button class="icon-button dialog-close" data-close-dialog aria-label="닫기">' + view.icon('close') + '</button>' + content;
  if (!dialog.open) dialog.showModal();
}
function confirmAction({ title, description, label, danger, action }) {
  showDialog('<span class="dialog-symbol">' + view.icon(danger ? 'info' : 'check') + '</span><h2 id="dialog-title">' + view.escapeHtml(title) + '</h2><p class="dialog-description">' + view.escapeHtml(description) + '</p><p class="inline-error" id="dialog-error" role="alert" hidden></p><div class="dialog-actions"><button class="button secondary" data-close-dialog>돌아가기</button><button class="button ' + (danger ? 'danger' : 'primary') + '" id="confirm-action">' + label + '</button></div>');
  $('#confirm-action').addEventListener('click', event => busy(event.currentTarget, async () => { await action(); dialog.close(); }, '#dialog-error'));
}
dialog.addEventListener('close', () => { activeAdminSlot = null; });
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
async function loadTimes() {
  const form = $('#application-form');
  if (!form) return;
  const version = ++availabilityVersion;
  const data = new FormData(form);
  const selected = data.get('time');
  const [slots, config] = await Promise.all([api.getAvailability(data.get('providerId')), api.getConfig()]);
  if (version !== availabilityVersion || !form.isConnected) return;
  for (const provider of config.providers) {
    const label = $('[data-capacity-provider="' + provider.id + '"]', form);
    if (label) label.textContent = view.capacityRange(provider);
  }
  $('#time-options').innerHTML = view.timeOptions(slots, selected);
  summary();
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
    busy($('button[type="submit"]', form), async () => {
      const record = await api.submitRequest(values);
      form.reset();
      await loadTimes();
      const escapedId = view.escapeHtml(record.id);
      showDialog('<span class="dialog-symbol success">' + view.icon('check') + '</span><span class="eyebrow gray">REQUEST RECEIVED</span><h2 id="dialog-title">상담 신청이 접수되었습니다</h2><p class="dialog-description">NPU 기업의 검토 후 매칭이 확정됩니다.<br>아래 신청ID를 꼭 보관해 주세요.</p><div class="success-summary">' + view.badge(record.status) + '<strong>' + providerById(record.providerId).name + ' · ' + view.escapeHtml(record.time) + '</strong></div><label class="field">신청ID<input readonly id="new-request-id" value="' + escapedId + '"></label><p class="muted">신청ID로 신청 상태를 조회할 수 있습니다. 신청ID를 안전하게 보관해 주세요.<br>데모에서는 확인 이메일이 발송되지 않습니다.</p><div class="dialog-actions"><button class="button secondary" id="copy-id">' + view.icon('copy') + ' ID 복사</button><button class="button primary" id="go-lookup">신청 확인하기 ' + view.icon('arrow') + '</button></div>');
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
  const form = $('#lookup-form');
  if (lookupRow) {
    form.elements.id.value = lookupRow.id;
    showLookup(lookupRow);
  }
  $('#fill-example').onclick = () => {
    form.elements.id.value = 'DEMO-0001';
    form.elements.id.focus();
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    busy($('button[type="submit"]', form), async () => {
      lookupRow = null;
      $('#lookup-result').innerHTML = view.empty('신청을 조회하고 있습니다', '잠시만 기다려 주세요.');
      try {
        const row = await api.findRequest(Object.fromEntries(new FormData(form)));
        lookupRow = row;
        showLookup(row);
      } catch (error) {
        $('#lookup-result').innerHTML = view.empty('신청 정보를 확인해 주세요', '입력한 신청ID에 해당하는 신청을 찾지 못했습니다.');
        throw error;
      }
    }, '#lookup-error');
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
        await renderRoute(false);
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
  $('#refresh-admin').onclick = () => refresh().catch(error => toast(error.message, true));
  $('#admin-logout').onclick = async () => {
    await api.logout(adminToken);
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
    if (row) showDialog('<h2 id="dialog-title" class="sr-only">상담 신청 상세</h2>' + view.requestDetail(row));
  }
  const decisionButton = event.target.closest('[data-decision]');
  if (decisionButton) {
    const row = currentRows.find(item => item.id === decisionButton.dataset.id);
    if (!row) return;
    const approved = decisionButton.dataset.decision === STATUS.CONFIRMED;
    confirmAction({
      title: approved ? '이 상담을 승인할까요?' : '이 상담을 거절할까요?',
      description: row.itsCompany + ' · ' + row.time + (approved ? ' 상담을 매칭확정으로 변경합니다. 승인 시 정원을 다시 확인합니다.' : ' 상담을 매칭거절로 변경합니다.'),
      label: approved ? '승인하기' : '거절하기', danger: !approved,
      action: async () => {
        await api.decideRequest({ token: providerToken, id: row.id, decision: decisionButton.dataset.decision });
        await renderRoute(false);
        toast(approved ? '상담 매칭을 확정했습니다.' : '상담 신청을 거절했습니다.');
      }
    });
  }
});
async function renderRoute(focus = true) {
  const version = ++renderVersion;
  const newRoute = location.hash.replace('#', '');
  route = titles[newRoute] ? newRoute : 'home';
  document.body.classList.toggle('home-screen', route === 'home');
  const itsScreen = route === 'apply' || route === 'lookup';
  const providerScreen = route === 'npu' || route === 'matching';
  $('#sidebar .management-label').hidden = itsScreen;
  $('#sidebar .management-label').textContent = providerScreen ? 'NPU 파트너' : '파트너 & 운영';
  $('#sidebar [data-route="npu"]').hidden = itsScreen || route === 'admin';
  $('#sidebar [data-route="admin"]').hidden = itsScreen || providerScreen;
  $('#sidebar [data-route="matching"]').hidden = !providerScreen;
  const signedInProvider = providerToken ? providerById(activeProvider) : null;
  document.body.classList.toggle('has-provider-session', !!signedInProvider && route !== 'admin');
  document.body.classList.toggle('has-admin-session', !!adminToken && route === 'admin');
  $('.profile-name').textContent = route === 'admin' ? (adminToken ? 'ITS Korea 관리자' : 'ITS Korea') : signedInProvider?.name || (providerScreen ? 'NPU 기업' : 'ITS Korea');
  $('.profile-avatar').textContent = route === 'admin' ? 'ITS' : signedInProvider?.mark || (providerScreen ? 'N' : 'K');
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
  try {
    if (route === 'home') { main.innerHTML = view.homePage(); }
    if (route === 'apply') { main.innerHTML = view.applyPage(); bindApply(); await loadTimes(); }
    if (route === 'lookup') {
      if (lookupRow) lookupRow = await api.findRequest({ id: lookupRow.id });
      if (version !== renderVersion) return;
      main.innerHTML = view.lookupPage(); bindLookup();
    }
    if (route === 'npu' || route === 'matching') {
      if (!providerToken) { main.innerHTML = view.providerLogin(); bindProviderLogin(); }
      else {
        const [rows, config] = await Promise.all([api.getProviderRequests(providerToken), api.getConfig()]);
        if (version !== renderVersion) return;
        currentRows = rows;
        const provider = config.providers.find(p => p.id === activeProvider);
        if (route === 'matching') {
          main.innerHTML = view.providerMatchingPage(activeProvider, rows, provider);
          $('#refresh-matching').onclick = () => refresh().catch(error => toast(error.message, true));
        } else {
          main.innerHTML = view.providerPage(activeProvider, rows, providerFilter, provider);
          bindProvider();
        }
        bindCapacity();
      }
    }
    if (route === 'admin') {
      if (!adminToken) { main.innerHTML = view.adminLogin(); bindAdminLogin(); }
      else {
        const savedHistoryFilters = $('#history-filters') ? Object.fromEntries(new FormData($('#history-filters'))) : null;
        const overview = await api.getAdminOverview(adminToken);
        if (version !== renderVersion) return;
        currentRows = overview.requests;
        currentHistory = overview.history;
        currentProviders = overview.providers;
        main.innerHTML = view.adminPage(overview.requests, overview.providers, overview.history);
        bindAdmin(savedHistoryFilters);
        if (dialog.open && activeAdminSlot) renderAdminSlot();
      }
    }
    if (focus && version === renderVersion) { main.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
  } catch (error) {
    main.innerHTML = '<section class="panel error-panel"><h1>화면을 불러오지 못했습니다</h1><p role="alert">' + view.escapeHtml(error.message) + '</p><button class="button primary" id="retry-page">다시 시도</button></section>';
    $('#retry-page').onclick = () => renderRoute(false);
  }
}
async function refresh() {
  if (route === 'apply') await loadTimes();
  else if (route === 'lookup' && lookupRow) {
    lookupRow = await api.findRequest({ id: lookupRow.id });
    showLookup(lookupRow);
  } else if (((route === 'npu' || route === 'matching') && providerToken) || (route === 'admin' && adminToken)) await renderRoute(false);
}
$('#menu-toggle').onclick = () => {
  const open = $('#sidebar').classList.toggle('is-open');
  $('#menu-toggle').setAttribute('aria-expanded', String(open));
  $('#menu-toggle').setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
};
$('#reset-demo').onclick = () => confirmAction({
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
  if (event.key === STORAGE_KEY || event.key === null) refresh().catch(error => toast(error.message, true));
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh().catch(error => toast(error.message, true));
});
renderRoute(false);
