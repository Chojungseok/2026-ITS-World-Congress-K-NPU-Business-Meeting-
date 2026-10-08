import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../assets/js/mock-api.js';
import { STATUS, PROVIDERS, TIMES, STORAGE_KEY } from '../assets/js/config.js';
import { escapeHtml } from '../assets/js/views.js';

// Node의 실험적 Web Locks 대신 단일 프로세스 경로를 검증합니다. 브라우저 경합은 별도 E2E로 검증합니다.
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
const memory = new Map();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key)
}, configurable: true });
beforeEach(async () => { memory.clear(); await api.resetDemo(); });
const form = (overrides = {}) => ({
  itsCompany: '테스트 기업', contactName: '테스트 담당', phone: '010-1234-5678',
  email: 'test@example.com', providerId: 'deepx', time: TIMES[3],
  attendees: 2, details: 'NPU 기반 ITS 솔루션 도입 상담', consent: true, privacyConsent: true, ...overrides
});

test('신청은 승인대기로 저장되며 신청ID만으로 조회된다', async () => {
  const row = await api.submitRequest(form({ email: 'TEST@Example.com' }));
  assert.equal(row.status, STATUS.PENDING);
  assert.equal(row.email, 'test@example.com');
  assert.equal((await api.findRequest({ id: '  ' + row.id.toLowerCase() + '  ' })).id, row.id);
  await assert.rejects(api.findRequest({ id: 'NOT-A-REQUEST' }), /일치하는 신청/);
  await assert.rejects(api.submitRequest(form()), /진행 중인 신청/);
});

for (const provider of PROVIDERS) {
  test(provider.name + ' 동시 승인은 정원 ' + provider.capacity + '건을 넘지 않는다', async () => {
    const rows = await Promise.all(Array.from({ length: provider.capacity + 2 }, (_, i) => api.submitRequest(form({ providerId: provider.id, email: 'capacity' + i + '@example.com' }))));
    assert.equal((await api.getAvailability(provider.id)).find(slot => slot.time === TIMES[3]).confirmed, 0);
    const token = await api.authenticateProvider({ providerId: provider.id, approvalCode: provider.id + '20261022' });
    const results = await Promise.allSettled(rows.map(row => api.decideRequest({ token, id: row.id, decision: STATUS.CONFIRMED })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, provider.capacity);
    assert.equal(results.filter(result => result.status === 'rejected').length, 2);
    assert.equal((await api.getAvailability(provider.id)).find(slot => slot.time === TIMES[3]).confirmed, provider.capacity);
    await assert.rejects(api.submitRequest(form({ providerId: provider.id, email: 'full@example.com' })), /정원/);
  });
}

test('확정 취소는 자리를 반환하고 다른 대기 신청을 승인할 수 있다', async () => {
  const first = await api.submitRequest(form({ providerId: 'furiosa' }));
  const next = await api.submitRequest(form({ providerId: 'furiosa', email: 'next@example.com' }));
  const token = await api.authenticateProvider({ providerId: 'furiosa', approvalCode: 'furiosa20261022' });
  await api.decideRequest({ token, id: first.id, decision: STATUS.CONFIRMED });
  await api.cancelRequest({ id: first.id, email: first.email });
  assert.equal((await api.getAvailability('furiosa')).find(slot => slot.time === TIMES[3]).confirmed, 0);
  const approved = await api.decideRequest({ token, id: next.id, decision: STATUS.CONFIRMED });
  assert.equal(approved.status, STATUS.CONFIRMED);
});

test('NPU 조회와 처리는 자신의 기업으로 제한되고 관리자 세션은 분리된다', async () => {
  const token = await api.authenticateProvider({ providerId: 'deepx', approvalCode: 'deepx20261022' });
  const other = await api.submitRequest(form({ providerId: 'mobilint' }));
  assert.ok((await api.getProviderRequests(token)).every(row => row.providerId === 'deepx'));
  await assert.rejects(api.decideRequest({ token, id: other.id, decision: STATUS.CONFIRMED }), /이 기업/);
  await assert.rejects(api.getAdminRequests(token), /세션/);
  await assert.rejects(api.getProviderRequests('fake'), /세션/);
  const admin = await api.authenticateAdmin({ id: 'ITSKOREA9911', password: 'ITSKOREA9911!' });
  assert.equal((await api.getAdminRequests(admin)).length, 14);
  await api.logout(token);
  await assert.rejects(api.getProviderRequests(token), /세션/);
});

test('최종 상태 재처리 및 취소된 신청 승인을 거부한다', async () => {
  const row = await api.submitRequest(form());
  const token = await api.authenticateProvider({ providerId: 'deepx', approvalCode: 'deepx20261022' });
  await api.decideRequest({ token, id: row.id, decision: STATUS.REJECTED, rejectionReason: '기존 회귀 검사용 사유' });
  await assert.rejects(api.decideRequest({ token, id: row.id, decision: STATUS.CONFIRMED }), /이미 처리/);
  await assert.rejects(api.cancelRequest({ id: row.id, email: row.email }), /이미 처리/);
  const second = await api.submitRequest(form({ email: 'second@example.com' }));
  await api.cancelRequest({ id: second.id, email: second.email });
  await assert.rejects(api.decideRequest({ token, id: second.id, decision: STATUS.CONFIRMED }), /이미 처리/);
});

test('필수 항목, 타입, 이메일, 운영 시간 및 동의를 검증한다', async () => {
  for (const overrides of [{ itsCompany: ' ' }, { email: 'bad' }, { phone: 'abc' }, { attendees: 0 }, { attendees: 1.5 }, { attendees: 21 }, { providerId: 'fake' }, { time: '99:00' }, { details: 'x'.repeat(1001) }, { consent: false }, { privacyConsent: false }, { privacyConsent: undefined }]) {
    await assert.rejects(api.submitRequest(form(overrides)));
  }
});

test('손상된 저장소를 묵시적으로 덮어쓰지 않으며 명시적으로 초기화 가능하다', async () => {
  localStorage.setItem(STORAGE_KEY, '{bad');
  await assert.rejects(api.getAvailability('deepx'), /초기화/);
  assert.equal(localStorage.getItem(STORAGE_KEY), '{bad');
  await api.resetDemo();
  assert.equal((await api.getAvailability('deepx')).length, TIMES.length);
});

test('HTML 특수문자는 화면 삽입 시 이스케이프된다', () => {
  assert.equal(escapeHtml('<img onerror="x"> & \'x\''), '&lt;img onerror=&quot;x&quot;&gt; &amp; &#39;x&#39;');
});

test('새 시간표만 신청할 수 있고 개인정보 동의 이력을 저장한다', async () => {
  assert.deepEqual(TIMES, ['15:50 – 16:00', '16:00 – 16:10', '16:10 – 16:20', '16:20 – 16:30']);
  await assert.rejects(api.submitRequest(form({ time: '13:00 – 13:30' })), /시간/);
  const row = await api.submitRequest(form());
  assert.equal(row.privacyConsent, true);
  assert.equal(row.privacyConsentedAt, row.createdAt);
  assert.equal(row.privacyNoticeVersion, 'local-demo-v1');
});

test('기존 신청 시간은 보존하고 이전 예시 데이터만 새 시간표로 표시한다', async () => {
  const row = await api.submitRequest(form());
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  stored.requests.find(item => item.id === row.id).time = '15:30 – 16:00';
  stored.requests.find(item => item.id === 'DEMO-0001').time = '13:00 – 13:30';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  assert.equal((await api.findRequest({ id: row.id })).time, '15:30 – 16:00');
  assert.equal((await api.findRequest({ id: 'DEMO-0001' })).time, TIMES[0]);
  assert.equal((await api.getAvailability('deepx')).length, 4);
});

test('기업별 로컬 승인코드로 해당 기업의 신청만 조회한다', async () => {
  for (const provider of PROVIDERS) {
    const token = await api.authenticateProvider({ providerId: provider.id, approvalCode: '  ' + provider.id + '20261022  ' });
    const rows = await api.getProviderRequests(token);
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => row.providerId === provider.id));
  }
});

test('비어 있거나 잘못된 코드와 다른 기업의 코드로 입장할 수 없다', async () => {
  for (const provider of PROVIDERS) {
    for (const approvalCode of [undefined, '', '  ', 'incorrect', (provider.id + '20261022').toUpperCase()]) {
      await assert.rejects(api.authenticateProvider({ providerId: provider.id, approvalCode }), /승인코드/);
    }
    for (const other of PROVIDERS.filter(item => item.id !== provider.id)) {
      await assert.rejects(api.authenticateProvider({ providerId: provider.id, approvalCode: other.id + '20261022' }), /일치하지 않습니다/);
    }
  }
  await assert.rejects(api.authenticateProvider({ providerId: 'unknown', approvalCode: 'deepx20261022' }), /기업/);
  await assert.rejects(api.authenticateProvider(), /기업/);
});

test('승인코드와 세션은 공개 설정 및 저장 데이터에 포함되지 않는다', async () => {
  const config = await api.getConfig();
  const token = await api.authenticateProvider({ providerId: 'deepx', approvalCode: 'deepx20261022' });
  await api.getProviderRequests(token);
  const stored = localStorage.getItem(STORAGE_KEY);
  for (const secret of [token, ...PROVIDERS.map(provider => provider.id + '20261022')]) {
    assert.ok(!JSON.stringify(config).includes(secret));
    assert.ok(!stored.includes(secret));
  }
  assert.equal(api.enterProviderDemo, undefined);
});

const providerLogin = id => api.authenticateProvider({ providerId: id, approvalCode: id + '20261022' });
const adminLogin = () => api.authenticateAdmin({ id: 'ITSKOREA9911', password: 'ITSKOREA9911!' });

test('관리자 ID와 비밀번호를 검증하고 NPU 세션의 전체 이력 조회를 거부한다', async () => {
  for (const input of [{}, { id: 'ITSKOREA9911', password: 'bad' }, { id: 'bad', password: 'ITSKOREA9911!' }]) {
    await assert.rejects(api.authenticateAdmin(input), /일치하지/);
  }
  const provider = await providerLogin('deepx');
  await assert.rejects(api.getAdminOverview(provider), /세션/);
  await assert.rejects(api.getAdminOverview('invalid'), /세션/);
  const token = await adminLogin();
  const overview = await api.getAdminOverview(token);
  assert.equal(overview.requests.length, 13);
  assert.equal(overview.history.length, 13);
  assert.ok(overview.history.every(event => event.action === '기존 상태' && event.occurredAt === null));
  for (const secret of [token, 'ITSKOREA9911!']) assert.ok(!localStorage.getItem(STORAGE_KEY).includes(secret));
  assert.equal(api.enterAdminDemo, undefined);
  await api.logout(token);
  await assert.rejects(api.getAdminOverview(token), /세션/);
});

test('NPU 정원은 본인 기업만 변경되고 변경값을 저장하며 잘못된 값을 거부한다', async () => {
  const token = await providerLogin('deepx');
  const admin = await adminLogin();
  for (const capacity of [-1, 1.5, 51, '', ' ', null, true, '2x', undefined]) {
    await assert.rejects(api.updateProviderCapacity({ time: TIMES[3], token, capacity }), /정수/);
  }
  await assert.rejects(api.updateProviderCapacity({ time: TIMES[3], token: admin, capacity: 2 }), /세션/);
  await assert.rejects(api.updateProviderCapacity({ time: TIMES[3], token: 'bad', capacity: 2 }), /세션/);
  await api.updateProviderCapacity({ time: TIMES[3], token, capacity: '3', providerId: 'mobilint' });
  const providers = (await api.getConfig()).providers;
  assert.equal(providers.find(p => p.id === 'deepx').capacities[TIMES[3]], 3);
  assert.equal(providers.find(p => p.id === 'mobilint').capacity, 2);
  assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY)).slotCapacities.deepx[TIMES[3]], 3);
  assert.deepEqual((await api.getAvailability('deepx')).map(slot => slot.capacity), [5, 5, 5, 3]);
  await api.updateProviderCapacity({ time: TIMES[3], token, capacity: 3 });
  const changes = (await api.getAdminOverview(admin)).history.filter(event => event.action === '정원 변경');
  assert.equal(changes.length, 1);
  assert.equal(changes[0].beforeCapacity, 5);
  assert.equal(changes[0].afterCapacity, 3);
  assert.equal(changes[0].time, TIMES[3]);
});

test('정원 확대 시 기존 대기 상담을 승인하고 확정 수보다 낮은 축소는 차단한다', async () => {
  const token = await providerLogin('furiosa');
  await assert.rejects(api.decideRequest({ token, id: 'DEMO-0003', decision: STATUS.CONFIRMED }), /정원/);
  await api.updateProviderCapacity({ time: TIMES[0], token, capacity: 2 });
  await api.decideRequest({ token, id: 'DEMO-0003', decision: STATUS.CONFIRMED });
  await assert.rejects(api.updateProviderCapacity({ time: TIMES[0], token, capacity: 1 }), /최소 2건/);
  assert.equal((await api.getAvailability('furiosa'))[0].capacity, 2);
  await api.cancelRequest({ id: 'DEMO-0013', email: 'demo13@example.com' });
  await api.updateProviderCapacity({ time: TIMES[0], token, capacity: 1 });
  assert.equal((await api.getAvailability('furiosa'))[0].capacity, 1);
});

test('정원 0은 신규 접수와 승인을 중단하고 재확대하면 상담을 진행할 수 있다', async () => {
  const token = await providerLogin('rebellions');
  const pending = await api.submitRequest(form({ providerId: 'rebellions' }));
  await api.updateProviderCapacity({ time: TIMES[3], token, capacity: 0 });
  assert.deepEqual((await api.getAvailability('rebellions')).map(slot => slot.capacity), [2, 2, 2, 0]);
  assert.equal((await api.findRequest({ id: 'DEMO-0012' })).status, STATUS.CONFIRMED);
  await assert.rejects(api.submitRequest(form({ providerId: 'rebellions', email: 'new@example.com' })), /정원/);
  await assert.rejects(api.decideRequest({ token, id: pending.id, decision: STATUS.CONFIRMED }), /정원/);
  await api.updateProviderCapacity({ time: TIMES[3], token, capacity: 1 });
  assert.equal((await api.decideRequest({ token, id: pending.id, decision: STATUS.CONFIRMED })).status, STATUS.CONFIRMED);
});

test('정원 축소와 승인 경합에서 확정 상담이 최종 정원을 초과하지 않는다', async () => {
  for (const reduceFirst of [true, false]) {
    await api.resetDemo();
    const token = await providerLogin('deepx');
    await api.updateProviderCapacity({ time: TIMES[3], token, capacity: 2 });
    const row = await api.submitRequest(form());
    await api.decideRequest({ token, id: row.id, decision: STATUS.CONFIRMED });
    const next = await api.submitRequest(form({ email: 'next@example.com' }));
    const reduce = () => api.updateProviderCapacity({ time: TIMES[3], token, capacity: 1 });
    const approve = () => api.decideRequest({ token, id: next.id, decision: STATUS.CONFIRMED });
    const results = await Promise.allSettled((reduceFirst ? [reduce, approve] : [approve, reduce]).map(action => action()));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const slot = (await api.getAvailability('deepx')).find(slot => slot.time === TIMES[3]);
    assert.ok(slot.confirmed <= slot.capacity);
  }
});

test('신청·승인·취소 및 거절 이력을 신청ID와 시각으로 보존하고 실패는 기록하지 않는다', async () => {
  const token = await providerLogin('deepx');
  const admin = await adminLogin();
  const row = await api.submitRequest(form());
  await api.decideRequest({ token, id: row.id, decision: STATUS.CONFIRMED });
  await api.cancelRequest({ id: row.id, email: row.email });
  await assert.rejects(api.decideRequest({ token, id: row.id, decision: STATUS.CONFIRMED }));
  const rejected = await api.submitRequest(form({ email: 'reject@example.com' }));
  await api.decideRequest({ token, id: rejected.id, decision: STATUS.REJECTED, rejectionReason: '기존 회귀 검사용 사유' });
  const history = (await api.getAdminOverview(admin)).history;
  const events = history.filter(event => event.requestId === row.id);
  assert.deepEqual(events.map(event => event.action), ['취소', '승인', '신청']);
  assert.deepEqual(events.map(event => event.toStatus), [STATUS.CANCELLED, STATUS.CONFIRMED, STATUS.PENDING]);
  assert.equal(events[0].fromStatus, STATUS.CONFIRMED);
  assert.match(events[1].actor, /NPU · 딥엑스/);
  assert.ok(events.every(event => Number.isFinite(Date.parse(event.occurredAt)) && event.itsCompany === row.itsCompany));
  assert.deepEqual(history.filter(event => event.requestId === rejected.id).map(event => event.action), ['거절', '신청']);
});

test('이전 저장 데이터를 보존하면서 설정과 기존 상태 이력을 한 번만 추가한다', async () => {
  const token = await adminLogin();
  const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
  delete raw.capacities;
  delete raw.slotCapacities;
  delete raw.history;
  raw.requests[0].status = STATUS.CANCELLED;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  const overview = await api.getAdminOverview(token);
  assert.equal(overview.requests[0].status, STATUS.CANCELLED);
  assert.equal(overview.history.length, 13);
  assert.equal(overview.providers[0].capacity, 5);
  assert.equal((await api.getAdminOverview(token)).history.length, 13);
  assert.equal(JSON.parse(localStorage.getItem(STORAGE_KEY)).history.length, 13);
});

test('손상된 정원이나 처리 이력을 자동으로 초기화하지 않는다', async () => {
  const original = JSON.parse(localStorage.getItem(STORAGE_KEY));
  for (const override of [{ capacities: { deepx: -1 } }, { slotCapacities: { deepx: -1 } }, { history: [{ action: 'invalid' }] }]) {
    const corrupt = JSON.stringify({ ...original, ...override });
    localStorage.setItem(STORAGE_KEY, corrupt);
    await assert.rejects(api.getConfig(), /초기화/);
    assert.equal(localStorage.getItem(STORAGE_KEY), corrupt);
  }
});

test('기업별 정원 설정을 시간별로 이관하고 기존 기록을 보존한다', async () => {
  const admin = await adminLogin();
  const old = JSON.parse(localStorage.getItem(STORAGE_KEY));
  old.capacities.deepx = 3;
  delete old.slotCapacities;
  const oldHistory = structuredClone(old.history);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
  const overview = await api.getAdminOverview(admin);
  assert.deepEqual(overview.providers.find(p => p.id === 'deepx').capacities, Object.fromEntries(TIMES.map(time => [time, 3])));
  assert.deepEqual(JSON.parse(localStorage.getItem(STORAGE_KEY)).history, oldHistory);
  const token = await providerLogin('deepx');
  await api.updateProviderCapacity({ token, time: TIMES[0], capacity: 0 });
  assert.deepEqual((await api.getAvailability('deepx')).map(slot => slot.capacity), [0, 3, 3, 3]);
  assert.equal((await api.findRequest({ id: 'DEMO-0005' })).status, STATUS.CONFIRMED);
});

test('시간대 누락·잘못된 시간은 거부하고 서로 다른 시간대 변경은 독립적으로 저장된다', async () => {
  const token = await providerLogin('deepx');
  for (const time of [undefined, '', '99:00', '13:00 – 13:30']) {
    await assert.rejects(api.updateProviderCapacity({ token, time, capacity: 2 }), /시간대/);
  }
  await Promise.all([
    api.updateProviderCapacity({ token, time: TIMES[0], capacity: 0 }),
    api.updateProviderCapacity({ token, time: TIMES[3], capacity: 2 })
  ]);
  assert.deepEqual((await api.getAvailability('deepx')).map(slot => slot.capacity), [0, 5, 5, 2]);
  await assert.rejects(api.submitRequest(form({ time: TIMES[0] })), /정원/);
  const row = await api.submitRequest(form({ time: TIMES[3] }));
  await api.decideRequest({ token, id: row.id, decision: STATUS.CONFIRMED });
  assert.equal((await api.getAvailability('deepx'))[3].confirmed, 1);
});

test('관리자 로그는 기록된 시각순으로 정렬하고 미기록 상태는 마지막에 둔다', async () => {
  const admin = await adminLogin();
  const token = await providerLogin('deepx');
  await api.updateProviderCapacity({ token, time: TIMES[0], capacity: 2 });
  await api.updateProviderCapacity({ token, time: TIMES[3], capacity: 3 });
  await api.updateProviderCapacity({ token, time: TIMES[2], capacity: 4 });
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  const changes = stored.history.filter(event => event.action === '정원 변경');
  changes[0].occurredAt = '2026-10-06T15:00:00+09:00';
  changes[1].occurredAt = '2026-10-06T13:00:00+09:00';
  changes[2].occurredAt = '2026-10-06T14:00:00+09:00';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  const log = (await api.getAdminOverview(admin)).history;
  assert.deepEqual(log.slice(0, 3).map(event => event.time), [TIMES[0], TIMES[2], TIMES[3]]);
  assert.ok(log.slice(3).every(event => event.occurredAt === null));
});
