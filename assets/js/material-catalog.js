// Single source of truth for public material registration. No secrets.
// Presentations remain null until an actual, release-approved PDF is supplied.
export const MATERIAL_CATALOG = {
  version: '2026-10-v4',
  companies: [
    { companyId: 'deepx', companyType: 'NPU', name: '딥엑스', english: 'DEEPX' },
    { companyId: 'mobilint', companyType: 'NPU', name: '모빌린트', english: 'MOBILINT' },
    { companyId: 'furiosa', companyType: 'NPU', name: '퓨리오사', english: 'FURIOSA AI' },
    { companyId: 'rebellions', companyType: 'NPU', name: '리벨리온', english: 'REBELLIONS' }
    // Add verified ITS speakers here; their number is not fixed.
  ],
  materials: [
    { materialId: 'NPU-DEEPX-PITCH', companyId: 'deepx', companyType: 'NPU', materialType: 'presentation', title: '딥엑스 발표자료', filePath: null, available: false, publicApproved: false },
    { materialId: 'NPU-MOBILINT-PITCH', companyId: 'mobilint', companyType: 'NPU', materialType: 'presentation', title: '모빌린트 발표자료', filePath: null, available: false, publicApproved: false },
    { materialId: 'NPU-FURIOSA-PITCH', companyId: 'furiosa', companyType: 'NPU', materialType: 'presentation', title: '퓨리오사 발표자료', filePath: null, available: false, publicApproved: false },
    { materialId: 'NPU-REBELLIONS-PITCH', companyId: 'rebellions', companyType: 'NPU', materialType: 'presentation', title: '리벨리온 발표자료', filePath: null, available: false, publicApproved: false },
    // Existing public brochures: preserve the original files and release flags.
    { materialId: 'NPU-DEEPX-BROCHURE', companyId: 'deepx', companyType: 'NPU', materialType: 'brochure', title: '딥엑스 기업 브로셔', filePath: 'assets/brochures/deepx-company-profile-2026.pdf', available: true, publicApproved: true },
    { materialId: 'NPU-MOBILINT-BROCHURE', companyId: 'mobilint', companyType: 'NPU', materialType: 'brochure', title: '모빌린트 기업 브로셔', filePath: 'assets/brochures/mobilint-corp-brochure-2026.pdf', available: true, publicApproved: true },
    { materialId: 'NPU-FURIOSA-BROCHURE', companyId: 'furiosa', companyType: 'NPU', materialType: 'brochure', title: '퓨리오사 기업 브로셔', filePath: 'assets/brochures/furiosa-sales-pitch-2026-kor.pdf', available: true, publicApproved: true },
    { materialId: 'NPU-REBELLIONS-BROCHURE', companyId: 'rebellions', companyType: 'NPU', materialType: 'brochure', title: '리벨리온 기업 브로셔', filePath: 'assets/brochures/rebellions-company-profile-2026-kr.pdf', available: true, publicApproved: true }
  ]
};
