// Compatibility facade for existing brochure screens. Registration lives in one catalog.
import { MATERIAL_CATALOG } from './material-catalog.js';
import { materialAvailable } from './materials.js';
export const BROCHURES = Object.freeze(MATERIAL_CATALOG.materials.filter(m => m.materialType === 'brochure' && m.companyType === 'NPU').map(m => ({
  providerId:m.companyId, name:MATERIAL_CATALOG.companies.find(c=>c.companyId===m.companyId).english,
  file:m.filePath?.split('/').at(-1) || '', available:materialAvailable(m), materialId:m.materialId
})));
