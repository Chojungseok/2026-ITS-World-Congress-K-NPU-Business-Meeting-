import { icon, escapeHtml as e, mark, brochureCards } from './views.js';
import { MATERIAL_CATALOG } from './material-catalog.js';
import { materialAvailable } from './materials.js';

export function eventHome() {
  return `<div class="welcome-page event-portal">
    <header class="welcome-header"><a href="#home" class="brand" aria-label="K-NPU 행사 홈"><span class="brand-symbol">K<span>↗</span></span><span>K-NPU <strong>Connect</strong><small>GANGNEUNG · 2026</small></span></a><span class="welcome-organizer">ITS <b>KOREA</b></span></header>
    <div class="event-utility">2026 강릉 ITS 세계총회<span>Beyond Mobility, Connected World · October 19–23, 2026</span></div>
    <section class="event-hero" aria-labelledby="welcome-title"><div><span class="eyebrow">K-NPU TRANSFORMATION MEETUP</span><h1 id="welcome-title">강릉 K-NPU<br>전환 밋업</h1><p>ITS의 현장과 NPU의 기술을 연결합니다.<br>기업의 기술을 살펴보고, 새로운 협력을 시작하세요.</p></div><div class="event-hero-note"><span>TECHNOLOGY MEETS POSSIBILITY</span><strong>ITS <i>×</i> NPU</strong><p>기술을 이해하는 시간,<br>파트너를 만나는 기회.</p></div></section>
    <section class="event-entry" aria-label="행사 참여 메뉴">
      <a href="#business" class="event-entry-card"><span class="entry-number">01 / CONNECT</span><div><h2>1:1 비즈매칭</h2><p>ITS 기업 상담 신청 · NPU 기업 승인 관리</p></div><span class="entry-action">비즈매칭 바로가기 ${icon('arrow')}</span></a>
      <a href="#materials" class="event-entry-card"><span class="entry-number">02 / DISCOVER</span><div><h2>발표·홍보자료실</h2><p>ITS·NPU·딥다이브 기업 발표자료와 기업 브로셔</p></div><span class="entry-action">자료실 둘러보기 ${icon('arrow')}</span></a>
    </section>
    <div class="welcome-lookup"><p>이미 상담을 신청하셨나요?</p><a class="welcome-lookup-button" href="#lookup">${icon('search')} 신청 현황 확인 ${icon('arrow')}</a></div>
    ${brochureCards()}
    <p class="portal-note">${icon('info')} ITS·NPU·딥다이브 기업별 발표자료를 자료실에서 확인하세요.</p>
    <div class="welcome-admin"><a href="#admin" class="admin-login-link">${icon('shield')} 운영자 로그인</a></div>
  </div>`;
}
function materialButton(material, type) {
  const label=type==='presentation'?'발표자료':'기업 브로셔';
  if(!materialAvailable(material))return `<div class="material-resource pending"><div><span>${label}</span><small>준비 중</small></div><button type="button" class="button secondary small" disabled aria-label="${label} 준비 중">준비 중</button></div>`;
  return `<div class="material-resource"><div><span>${label}</span><small>PDF · 새 탭에서 열기</small></div><a class="button secondary small" href="./${e(material.filePath)}" target="_blank" rel="noopener noreferrer" data-material-id="${e(material.materialId)}" aria-label="${e(material.title)} 보기">${label} 보기 ${icon('arrow')}</a></div>`;
}
export function materialCompanyCards(type, catalog=MATERIAL_CATALOG) {
  const companies=catalog.companies.filter(c=>c.companyType===type);
  if(!companies.length)return '<div class="materials-empty">'+icon('file')+'<h3>발표자료 준비 중</h3><p>발표 기업과 공개 가능한 자료가 확인되면 이곳에 안내합니다.</p></div>';
  return '<div class="materials-grid">'+companies.map(company=>{
    const presentation=catalog.materials.find(m=>m.companyId===company.companyId && m.materialType==='presentation');
    const brochure=catalog.materials.find(m=>m.companyId===company.companyId && m.materialType==='brochure');
    const brand=type==='NPU'?mark({id:company.companyId,name:company.name,english:company.english}):'<span class="material-company-label">'+(type==='DEEPDIVE'?'DEEP DIVE':'ITS COMPANY')+'</span>';
    return `<article class="panel material-company" data-material-company="${e(company.companyId)}"><div class="material-company-head">${brand}<h3>${e(company.name)}</h3></div>${materialButton(presentation,'presentation')}${brochure?materialButton(brochure,'brochure'):''}</article>`;
  }).join('')+'</div>';
}
export function materialsPage() {
 return `<div class="materials-page"><a href="#home" class="text-button">← 행사 홈</a><header class="materials-heading"><span class="eyebrow">MATERIALS LIBRARY</span><h1>발표·홍보자료실</h1><p>기업의 기술과 비전을 먼저 만나보세요.<br>ITS·NPU·딥다이브 발표자료를 PDF로 확인할 수 있습니다.</p><div class="materials-jump"><a href="#materials-its" data-material-jump="materials-its">ITS 기업 ${icon('chevron')}</a><a href="#materials-npu" data-material-jump="materials-npu">NPU 기업 ${icon('chevron')}</a><a href="#materials-deepdive" data-material-jump="materials-deepdive">딥다이브 ${icon('chevron')}</a></div></header>
 <section id="materials-its" class="materials-section" aria-labelledby="its-material-title"><div class="section-heading"><div><span class="eyebrow gray">ITS COMPANIES</span><h2 id="its-material-title">ITS 기업 발표자료</h2><p>ITS 기업의 기술과 적용 사례를 확인하세요.</p></div></div>${materialCompanyCards('ITS')}</section>
 <section id="materials-npu" class="materials-section" aria-labelledby="npu-material-title"><div class="section-heading"><div><span class="eyebrow gray">NPU PARTNERS</span><h2 id="npu-material-title">NPU 기업 발표·홍보자료</h2><p>발표자료와 기업 브로셔를 구분해 확인하세요.</p></div></div>${materialCompanyCards('NPU')}</section>
 <section id="materials-deepdive" class="materials-section" aria-labelledby="deepdive-material-title"><div class="section-heading"><div><span class="eyebrow gray">DEEP DIVE</span><h2 id="deepdive-material-title">딥다이브 발표자료</h2><p>심화 기술 발표자료를 확인하세요.</p></div></div>${materialCompanyCards('DEEPDIVE')}</section>
 <p class="materials-privacy">자료 버튼을 누르면 자료별 관심도 집계를 위해 열람 시각·자료 정보·익명 방문세션 식별정보를 기록합니다. 로그인 정보나 상담 신청 정보와 연결하지 않습니다. 준비 중인 자료에는 기록이 발생하지 않습니다.</p>
 <section class="materials-cta"><div><span class="eyebrow">CONTINUE THE CONVERSATION</span><h2>관심 있는 기술을 찾으셨나요?</h2><p>NPU 파트너와 1:1 상담으로 협력을 구체화하세요.</p></div><a class="button primary" href="#apply">비즈매칭 상담 신청 ${icon('arrow')}</a></section></div>`;
}
const companyTypeName=value=>value==='DEEPDIVE'?'딥다이브':value;
const typeName=value=>value==='presentation'?'발표자료':'브로셔';
const table=(caption,headers,rows)=>'<div class="table-scroll"><table class="requests-table material-stats-table"><caption class="sr-only">'+caption+'</caption><thead><tr>'+headers.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
const num=n=>Number(n||0).toLocaleString('ko-KR');
export function materialStatisticsPanel() {
 return `<section class="panel material-analytics" id="material-analytics"><div class="panel-heading"><div><span class="eyebrow gray">MATERIAL INTEREST</span><h2>자료 관심도 통계</h2><p>상담 신청과 분리된 PDF 클릭 기록입니다.</p></div><button type="button" class="button secondary" id="refresh-material-stats">통계 조회</button></div>
 <form id="material-stats-filters" class="material-stat-filters"><label class="field">시작일<input type="date" name="from"></label><label class="field">종료일<input type="date" name="to"></label><label class="field">기업 구분<select name="companyType"><option value="">전체 기업</option><option value="ITS">ITS</option><option value="NPU">NPU</option><option value="DEEPDIVE">딥다이브</option></select></label><label class="field">기업<select name="companyId"><option value="">모든 기업</option>${MATERIAL_CATALOG.companies.map(c=>'<option value="'+e(c.companyId)+'">'+e(c.name)+'</option>').join('')}</select></label><label class="field">자료 구분<select name="materialType"><option value="">모든 자료</option><option value="presentation">발표자료</option><option value="brochure">브로셔</option></select></label><button type="submit" class="button primary">조회</button></form>
 <p id="material-stats-error" role="alert" class="inline-error" hidden></p><div id="material-stats-results" aria-live="polite"><div class="materials-empty"><h3>자료 관심도를 확인하세요</h3><p>통계 조회를 누르면 자료별·기업별·일자별 클릭 수를 불러옵니다.</p></div></div></section>`;
}
export function materialStatisticsResults(stats) {
 const presentations=stats.types.find(t=>t.materialType==='presentation')?.clicks||0,brochures=stats.types.find(t=>t.materialType==='brochure')?.clicks||0;
 const rows=items=>items.map(item=>'<tr>'+item.map(v=>'<td>'+e(v)+'</td>').join('')+'</tr>');
 const logTime=value=>new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Asia/Seoul'}).format(new Date(value));
 return `<div class="material-metrics"><div><span>전체 클릭</span><strong>${num(stats.totalClicks)}</strong></div><div><span>익명 고유 방문세션</span><strong>${num(stats.uniqueSessions)}</strong></div><div><span>발표자료 클릭</span><strong>${num(presentations)}</strong></div><div><span>브로셔 클릭</span><strong>${num(brochures)}</strong></div></div>
 <p class="history-note">클릭 시도 횟수이며 다운로드 완료·실제 열람 여부를 뜻하지 않습니다. 고유 방문세션은 사람 수와 다르며, 세션 수는 항목 간 중복될 수 있습니다. 기준 시각: 한국 표준시(KST).</p>
 ${!stats.totalClicks?'<div class="materials-empty"><h3>아직 자료 열람 기록이 없습니다</h3><p>등록된 PDF를 열면 통계가 표시됩니다. 다른 조회 기간도 확인해 보세요.</p></div>':''}
 <h3>자료별 관심도</h3>${table('자료별 클릭 수',['자료명','기업 구분','자료 구분','등록 상태','클릭','고유 세션'],rows(stats.materials.map(m=>[m.title,companyTypeName(m.companyType),typeName(m.materialType),m.available?'등록 완료':'준비 중',num(m.clicks),num(m.uniqueSessions)])))}
 <h3>기업별 관심도</h3>${table('기업별 클릭 수',['기업','구분','클릭','고유 세션'],rows(stats.companies.map(c=>[c.name,companyTypeName(c.companyType),num(c.clicks),num(c.uniqueSessions)])))}
 <h3>일자별 클릭 기록</h3>${stats.daily.length?table('일자별 클릭 수',['일자 (KST)','클릭','고유 세션','발표자료','브로셔'],rows(stats.daily.map(d=>[d.date,num(d.clicks),num(d.uniqueSessions),num(d.presentations),num(d.brochures)]))):'<p class="muted">선택한 기간의 클릭 기록이 없습니다.</p>'}
 <h3>개별 클릭 기록 <small>총 ${num(stats.totalRecords)}건</small></h3>${stats.records.length?table('자료 클릭 시각별 기록',['클릭 시각 (KST)','기업','자료','구분'],rows(stats.records.map(r=>[logTime(r.occurredAt),r.companyName,r.title,typeName(r.materialType)]))):'<p class="muted">표시할 기록이 없습니다.</p>'}
 <div class="material-log-pager"><button type="button" class="button secondary small" data-material-offset="${Math.max(0,stats.offset-100)}" ${stats.offset===0?'disabled':''}>이전</button><span>${stats.totalRecords?num(stats.offset+1):'0'}–${num(Math.min(stats.offset+100,stats.totalRecords))} / ${num(stats.totalRecords)}</span><button type="button" class="button secondary small" data-material-offset="${stats.offset+100}" ${stats.offset+100>=stats.totalRecords?'disabled':''}>다음</button></div>`;
}
