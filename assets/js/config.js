export const STATUS = Object.freeze({ PENDING: '승인대기', CONFIRMED: '매칭확정', REJECTED: '매칭거절', CANCELLED: '신청취소' });
export let PROVIDERS = Object.freeze([
  { id: 'deepx', name: '딥엑스', english: 'DEEPX', mark: 'DX', capacity: 2, color: 'blue', description: '온디바이스 AI의 새로운 가능성' },
  { id: 'mobilint', name: '모빌린트', english: 'MOBILINT', mark: 'M', capacity: 2, color: 'purple', description: '고성능 엣지 AI 컴퓨팅' },
  { id: 'furiosa', name: '퓨리오사', english: 'FURIOSA', mark: 'F', capacity: 2, color: 'orange', description: '차세대 AI 반도체와의 만남' },
  { id: 'rebellions', name: '리벨리온', english: 'REBELLIONS', mark: 'R', capacity: 2, color: 'teal', description: 'AI 인프라를 위한 새로운 연결' }
]);
export const LEGACY_TIMES = Object.freeze([
  '13:00 – 13:30', '13:30 – 14:00', '14:00 – 14:30',
  '14:30 – 15:00', '15:00 – 15:30', '15:30 – 16:00'
]);
export const PREVIOUS_TIMES = Object.freeze([
  '16:50 – 17:00', '17:00 – 17:10', '17:10 – 17:20', '17:20 – 17:30'
]);
export const BASE_TIMES = Object.freeze([
  '15:50 – 16:00', '16:00 – 16:10', '16:10 – 16:20', '16:20 – 16:30'
]);
export let TIMES = BASE_TIMES;
export const PRIVACY_NOTICE_VERSION = 'local-demo-v1';
export const STORAGE_KEY = 'knpu-connect-demo-v1';
export const providerById = id => PROVIDERS.find(provider => provider.id === id);

// 시간별 정원; 이전 시간표는 기존 기업 정원을 사용합니다.
export const capacityFor = (provider, time) => provider.capacities?.[time] ?? provider.capacity;

export let PRIVACY_NOTICE = Object.freeze({ version: 'local-demo-v1', retentionText: '운영기관 확인 후 안내 예정' });
const PRESENTATION = PROVIDERS;
export function applyPublicConfig(config) {
  if (!Array.isArray(config?.providers) || !config.providers.length || !Array.isArray(config.times) || !config.times.length)
    throw new Error('서버 기업·시간 설정을 확인해 주세요.');
  PROVIDERS = Object.freeze(config.providers.map(provider => ({
    ...(PRESENTATION.find(p => p.id === provider.id) || { mark: 'N', color: 'blue', description: '' }), ...provider
  })));
  TIMES = Object.freeze([...config.times]);
  if (config.privacy) PRIVACY_NOTICE = Object.freeze({ ...config.privacy });
}

export const isSlotOpen = (provider, time) => provider.active !== false && provider.enabled?.[time] !== false;
