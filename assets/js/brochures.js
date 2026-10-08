// Static public assets only. Set available:true only after public release approval
// and placing the exact, unmodified PDF at this path. No runtime probes or preloads.
export const BROCHURES = Object.freeze([
  { providerId: 'deepx', name: 'DEEPX', file: 'deepx-company-profile-2026.pdf', available: true },
  { providerId: 'mobilint', name: 'MOBILINT', file: 'mobilint-corp-brochure-2026.pdf', available: true },
  { providerId: 'furiosa', name: 'FURIOSA AI', file: 'furiosa-sales-pitch-2026-kor.pdf', available: true },
  { providerId: 'rebellions', name: 'REBELLIONS', file: 'rebellions-company-profile-2026-kr.pdf', available: true }
]);
