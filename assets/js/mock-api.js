import { STATUS, PROVIDERS, TIMES, STORAGE_KEY, providerById } from './config.js';

let queue = Promise.resolve();
const sessions = new Map();
const message = {
  session: '데모 세션이 만료되었습니다. 다시 입장해 주세요.',
  full: '이 시간의 확정 상담이 정원에 도달했습니다. 다른 시간을 선택해 주세요.'
};
const fail = text => { throw new Error(text); };
const uid = () => globalThis.crypto.randomUUID();
const emailOf = value => String(value ?? '').trim().toLowerCase();
const textOf = (value, label, max) => {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) fail(label + '을(를) 확인해 주세요.');
  return text;
};
const clone = value => structuredClone(value);

function seed() {
  const companies = ['한빛모빌리티', '넥스트로드', '스마트웨이브', '그린트래픽', '도시인사이트', '이음테크', '로드링크', '미래ITS'];
  const states = [STATUS.PENDING, STATUS.CONFIRMED, STATUS.PENDING, STATUS.REJECTED, STATUS.CONFIRMED, STATUS.PENDING, STATUS.CONFIRMED, STATUS.CANCELLED, STATUS.PENDING, STATUS.CONFIRMED, STATUS.PENDING, STATUS.CONFIRMED];
  return states.map((status, index) => ({
    id: 'DEMO-' + String(index + 1).padStart(4, '0'),
    createdAt: '2026-10-01T' + String(9 + Math.floor(index / 6)).padStart(2, '0') + ':' + String(index * 5 % 60).padStart(2, '0') + ':00+09:00',
    itsCompany: companies[index % companies.length] + ' (예시)',
    contactName: ['김담당', '이담당', '박담당'][index % 3],
    phone: '010-0000-0000',
    email: 'demo' + (index + 1) + '@example.com',
    providerId: PROVIDERS[index % 4].id,
    time: TIMES[Math.floor(index / 4)],
    attendees: index % 3 + 1,
    details: ['지능형 교통관제 시스템의 영상 분석을 NPU 환경으로 전환하고자 합니다. 모델 호환성과 도입 절차를 상담하고 싶습니다.', '도로 인프라에 적용할 엣지 AI 솔루션과 실증 협력 가능성을 논의하고 싶습니다.', '차량 객체 인식 모델의 추론 성능 및 전력 효율 개선을 위한 기술 상담을 희망합니다.'][index % 3],
    status
  })).concat([{
    id: 'DEMO-0013', createdAt: '2026-10-01T11:00:00+09:00',
    itsCompany: '교통AI랩 (예시)', contactName: '최담당', phone: '010-0000-0000',
    email: 'demo13@example.com', providerId: 'furiosa', time: TIMES[0], attendees: 2,
    details: '교차로 객체 인식 모델 최적화와 NPU 도입 검토 상담입니다.', status: STATUS.CONFIRMED
  }]);
}

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const data = { version: 1, requests: seed() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    }
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.requests) || !data.requests.every(validRecord)) throw new Error('invalid');
    return data;
  } catch (error) {
    if (error.message === 'invalid' || error instanceof SyntaxError) fail('저장된 데모 데이터를 읽을 수 없습니다. 왼쪽 메뉴의 데모 초기화를 이용해 주세요.');
    fail('브라우저 저장소를 사용할 수 없습니다. 저장소 허용 설정을 확인해 주세요.');
  }
}
function validRecord(record) {
  return record && ['id', 'createdAt', 'itsCompany', 'contactName', 'phone', 'email', 'details'].every(key => typeof record[key] === 'string')
    && !!providerById(record.providerId) && TIMES.includes(record.time)
    && Object.values(STATUS).includes(record.status) && Number.isInteger(record.attendees) && record.attendees > 0;
}
function write(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch { fail('저장 공간이 부족하거나 저장이 차단되었습니다. 브라우저 설정을 확인해 주세요.'); }
}
async function mutate(action) {
  const work = () => {
    const data = read();
    const result = action(data);
    write(data);
    return clone(result);
  };
  // 동일 브라우저의 여러 탭도 직렬화합니다. 서버 측 검증을 대체하지 않습니다.
  if (globalThis.navigator?.locks) return navigator.locks.request(STORAGE_KEY, work);
  const next = queue.then(work);
  queue = next.catch(() => {});
  return next;
}
const count = (requests, providerId, time) => requests.filter(row => row.providerId === providerId && row.time === time && row.status === STATUS.CONFIRMED).length;
const session = (token, role) => {
  const value = sessions.get(token);
  if (!value || value.role !== role) fail(message.session);
  return value;
};
const owned = (requests, id, email) => {
  const row = requests.find(item => item.id.toUpperCase() === String(id).trim().toUpperCase() && item.email === emailOf(email));
  if (!row) fail('일치하는 신청이 없습니다. 신청ID와 이메일을 확인해 주세요.');
  return row;
};
const newSession = value => { const token = uid(); sessions.set(token, value); return token; };

export const api = {
  mode: 'mock',
  async getConfig() { return clone({ providers: PROVIDERS, times: TIMES }); },
  async getAvailability(providerId) {
    if (!providerById(providerId)) fail('NPU 기업을 선택해 주세요.');
    const { requests } = read();
    return TIMES.map(time => ({ time, confirmed: count(requests, providerId, time), capacity: providerById(providerId).capacity }));
  },
  async submitRequest(input) {
    const itsCompany = textOf(input.itsCompany, '기업명', 80);
    const contactName = textOf(input.contactName, '담당자명', 40);
    const phone = textOf(input.phone, '연락처', 24);
    const email = emailOf(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) fail('올바른 이메일을 입력해 주세요.');
    if (!/^[0-9+()\s-]{7,24}$/.test(phone)) fail('올바른 연락처를 입력해 주세요.');
    const provider = providerById(input.providerId);
    if (!provider || !TIMES.includes(input.time)) fail('NPU 기업과 상담 시간을 선택해 주세요.');
    const attendees = Number(input.attendees);
    if (!Number.isInteger(attendees) || attendees < 1 || attendees > 20) fail('참석인원은 1~20명으로 입력해 주세요.');
    const details = textOf(input.details, '상담내용', 1000);
    if (input.consent !== true) fail('데모 데이터 저장 안내에 동의해 주세요.');
    return mutate(data => {
      if (count(data.requests, provider.id, input.time) >= provider.capacity) fail(message.full);
      if (data.requests.some(row => row.email === email && row.itsCompany === itsCompany && row.providerId === provider.id && row.time === input.time && [STATUS.PENDING, STATUS.CONFIRMED].includes(row.status))) fail('동일한 기업·시간으로 진행 중인 신청이 있습니다. 신청 확인 메뉴를 이용해 주세요.');
      const record = { id: 'KN-' + uid().toUpperCase(), createdAt: new Date().toISOString(), itsCompany, contactName, phone, email, providerId: provider.id, time: input.time, attendees, details, status: STATUS.PENDING };
      data.requests.unshift(record);
      return record;
    });
  },
  async findRequest({ id, email }) { return clone(owned(read().requests, id, email)); },
  async cancelRequest({ id, email }) {
    return mutate(data => {
      const row = owned(data.requests, id, email);
      if (![STATUS.PENDING, STATUS.CONFIRMED].includes(row.status)) fail('이미 처리된 신청은 취소할 수 없습니다.');
      row.status = STATUS.CANCELLED;
      return row;
    });
  },
  // 실제 승인을 흉내 내는 비밀번호는 두지 않습니다. 운영 시 서버 인증으로 교체해야 합니다.
  async enterProviderDemo(providerId) {
    if (!providerById(providerId)) fail('NPU 기업을 선택해 주세요.');
    return newSession({ role: 'provider', providerId });
  },
  async enterAdminDemo() { return newSession({ role: 'admin' }); },
  async logout(token) { sessions.delete(token); },
  async getProviderRequests(token) {
    const { providerId } = session(token, 'provider');
    return clone(read().requests.filter(row => row.providerId === providerId));
  },
  async decideRequest({ token, id, decision }) {
    const { providerId } = session(token, 'provider');
    if (![STATUS.CONFIRMED, STATUS.REJECTED].includes(decision)) fail('지원하지 않는 처리입니다.');
    return mutate(data => {
      const row = data.requests.find(item => item.id === id && item.providerId === providerId);
      if (!row) fail('이 기업의 신청을 찾을 수 없습니다.');
      if (row.status !== STATUS.PENDING) fail('이미 처리된 신청입니다. 목록을 새로고침해 주세요.');
      if (decision === STATUS.CONFIRMED && count(data.requests, providerId, row.time) >= providerById(providerId).capacity) fail(message.full);
      row.status = decision;
      return row;
    });
  },
  async getAdminRequests(token) { session(token, 'admin'); return clone(read().requests); },
  async resetDemo() {
    const reset = () => write({ version: 1, requests: seed() });
    if (globalThis.navigator?.locks) await navigator.locks.request(STORAGE_KEY, reset);
    else await reset();
    sessions.clear();
  }
};
