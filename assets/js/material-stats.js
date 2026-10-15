// Pure aggregate projection shared by mock and generated GAS code. Never returns session IDs.
export function aggregateMaterialViews(catalog, events, filters = {}) {
  const from = filters.from || '', to = filters.to || '';
  const allowed = catalog.materials.filter(m =>
    (!filters.companyId || m.companyId === filters.companyId) &&
    (!filters.companyType || m.companyType === filters.companyType) &&
    (!filters.materialType || m.materialType === filters.materialType));
  const all = Object.fromEntries(catalog.materials.map(m => [m.materialId, m]));
  const ids = new Set(allowed.map(m => m.materialId));
  const seoulDate = value => new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 10);
  const selected = events.filter(row => {
    if (!ids.has(row.materialId) || !Number.isFinite(Date.parse(row.occurredAt))) return false;
    const date = seoulDate(row.occurredAt);
    return (!from || date >= from) && (!to || date <= to);
  });
  const visitors = rows => new Set(rows.map(r => r.sessionHash)).size;
  const materialRows = allowed.map(m => {
    const rows = selected.filter(r => r.materialId === m.materialId);
    return { materialId:m.materialId, title:m.title, companyId:m.companyId, companyType:m.companyType,
      materialType:m.materialType, available:m.available === true && m.publicApproved === true && !!m.filePath,
      clicks:rows.length, uniqueSessions:visitors(rows) };
  });
  const companies = catalog.companies.filter(c =>
    (!filters.companyId || c.companyId === filters.companyId) && (!filters.companyType || c.companyType === filters.companyType))
    .map(c => {
      const rows = selected.filter(r => all[r.materialId]?.companyId === c.companyId);
      return { companyId:c.companyId, name:c.name, companyType:c.companyType, clicks:rows.length, uniqueSessions:visitors(rows) };
    });
  const types = ['presentation','brochure'].map(materialType => {
    const rows = selected.filter(r => all[r.materialId]?.materialType === materialType);
    return { materialType, clicks:rows.length, uniqueSessions:visitors(rows) };
  });
  const dates = [...new Set(selected.map(r => seoulDate(r.occurredAt)))].sort().reverse();
  const daily = dates.map(date => {
    const rows = selected.filter(r => seoulDate(r.occurredAt) === date);
    return { date, clicks:rows.length, uniqueSessions:visitors(rows),
      presentations:rows.filter(r => all[r.materialId]?.materialType === 'presentation').length,
      brochures:rows.filter(r => all[r.materialId]?.materialType === 'brochure').length };
  });
  const records = selected.map((r,index) => ({...r,index})).sort((a,b)=>String(b.occurredAt).localeCompare(String(a.occurredAt)) || b.index-a.index).map(r=>{const m=all[r.materialId];return {occurredAt:r.occurredAt,materialId:m.materialId,title:m.title,companyName:catalog.companies.find(c=>c.companyId===m.companyId)?.name || m.companyId,companyType:m.companyType,materialType:m.materialType};});
  return { totalClicks:selected.length, uniqueSessions:visitors(selected), materials:materialRows, companies, types, daily, records };
}
