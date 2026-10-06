export const STATUS = Object.freeze({ PENDING: '승인대기', CONFIRMED: '매칭확정', REJECTED: '매칭거절', CANCELLED: '신청취소' });
export const PROVIDERS = Object.freeze([
  { id: 'deepx', name: '딥엑스', english: 'DEEPX', mark: 'DX', capacity: 5, color: 'blue', description: '온디바이스 AI의 새로운 가능성' },
  { id: 'mobilint', name: '모빌린트', english: 'MOBILINT', mark: 'M', capacity: 2, color: 'purple', description: '고성능 엣지 AI 컴퓨팅' },
  { id: 'furiosa', name: '퓨리오사', english: 'FURIOSA', mark: 'F', capacity: 1, color: 'orange', description: '차세대 AI 반도체와의 만남' },
  { id: 'rebellions', name: '리벨리온', english: 'REBELLIONS', mark: 'R', capacity: 2, color: 'teal', description: 'AI 인프라를 위한 새로운 연결' }
]);
export const TIMES = Object.freeze([
  '13:00 – 13:30', '13:30 – 14:00', '14:00 – 14:30',
  '14:30 – 15:00', '15:00 – 15:30', '15:30 – 16:00'
]);
export const STORAGE_KEY = 'knpu-connect-demo-v1';
export const providerById = id => PROVIDERS.find(provider => provider.id === id);
