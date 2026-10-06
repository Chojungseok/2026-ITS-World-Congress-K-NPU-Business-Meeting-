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
  email: 'test@example.com', providerId: 'deepx', time: TIMES[5],
  attendees: 2, details: 'NPU 기반 ITS 솔루션 도입 상담', consent: true, ...overrides
});

test('신청은 승인대기로 저장되며 이메일과 ID로 조회된다', async () => {
  const row = await api.submitRequest(form({ email: 'TEST@Example.com' }));
  assert.equal(row.status, STATUS.PENDING);
  assert.equal(row.email, 'test@example.com');
  assert.equal((await api.findRequest({ id: row.id, email: 'test@example.com' })).id, row.id);
  await assert.rejects(api.findRequest({ id: row.id, email: 'other@example.com' }), /일치하는 신청/);
  await assert.rejects(api.submitRequest(form()), /진행 중인 신청/);
});

for (const provider of PROVIDERS) {
  test(provider.name + ' 동시 승인은 정원 ' + provider.capacity + '건을 넘지 않는다', async () => {
    const rows = await Promise.all(Array.from({ length: provider.capacity + 2 }, (_, i) => api.submitRequest(form({ providerId: provider.id, email: 'capacity' + i + '@example.com' }))));
    assert.equal((await api.getAvailability(provider.id)).find(slot => slot.time === TIMES[5]).confirmed, 0);
    const token = await api.enterProviderDemo(provider.id);
    const results = await Promise.allSettled(rows.map(row => api.decideRequest({ token, id: row.id, decision: STATUS.CONFIRMED })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, provider.capacity);
    assert.equal(results.filter(result => result.status === 'rejected').length, 2);
    assert.equal((await api.getAvailability(provider.id)).find(slot => slot.time === TIMES[5]).confirmed, provider.capacity);
    await assert.rejects(api.submitRequest(form({ providerId: provider.id, email: 'full@example.com' })), /정원/);
  });
}

test('확정 취소는 자리를 반환하고 다른 대기 신청을 승인할 수 있다', async () => {
  const first = await api.submitRequest(form({ providerId: 'furiosa' }));
  const next = await api.submitRequest(form({ providerId: 'furiosa', email: 'next@example.com' }));
  const token = await api.enterProviderDemo('furiosa');
  await api.decideRequest({ token, id: first.id, decision: STATUS.CONFIRMED });
  await api.cancelRequest({ id: first.id, email: first.email });
  assert.equal((await api.getAvailability('furiosa')).find(slot => slot.time === TIMES[5]).confirmed, 0);
  const approved = await api.decideRequest({ token, id: next.id, decision: STATUS.CONFIRMED });
  assert.equal(approved.status, STATUS.CONFIRMED);
});

test('NPU 조회와 처리는 자신의 기업으로 제한되고 관리자 세션은 분리된다', async () => {
  const token = await api.enterProviderDemo('deepx');
  const other = await api.submitRequest(form({ providerId: 'mobilint' }));
  assert.ok((await api.getProviderRequests(token)).every(row => row.providerId === 'deepx'));
  await assert.rejects(api.decideRequest({ token, id: other.id, decision: STATUS.CONFIRMED }), /이 기업/);
  await assert.rejects(api.getAdminRequests(token), /세션/);
  await assert.rejects(api.getProviderRequests('fake'), /세션/);
  const admin = await api.enterAdminDemo();
  assert.equal((await api.getAdminRequests(admin)).length, 14);
  await api.logout(token);
  await assert.rejects(api.getProviderRequests(token), /세션/);
});

test('최종 상태 재처리 및 취소된 신청 승인을 거부한다', async () => {
  const row = await api.submitRequest(form());
  const token = await api.enterProviderDemo('deepx');
  await api.decideRequest({ token, id: row.id, decision: STATUS.REJECTED });
  await assert.rejects(api.decideRequest({ token, id: row.id, decision: STATUS.CONFIRMED }), /이미 처리/);
  await assert.rejects(api.cancelRequest({ id: row.id, email: row.email }), /이미 처리/);
  const second = await api.submitRequest(form({ email: 'second@example.com' }));
  await api.cancelRequest({ id: second.id, email: second.email });
  await assert.rejects(api.decideRequest({ token, id: second.id, decision: STATUS.CONFIRMED }), /이미 처리/);
});

test('필수 항목, 타입, 이메일, 운영 시간 및 동의를 검증한다', async () => {
  for (const overrides of [{ itsCompany: ' ' }, { email: 'bad' }, { phone: 'abc' }, { attendees: 0 }, { attendees: 1.5 }, { attendees: 21 }, { providerId: 'fake' }, { time: '99:00' }, { details: 'x'.repeat(1001) }, { consent: false }]) {
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
