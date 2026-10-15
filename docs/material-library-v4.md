# V4 행사 홈 · 발표·홍보자료실 · 자료 관심도 통계

## 이번 작업 범위

2026-10-14 기준 **E:\\2026\\강릉 세계총회 K-NPU전환\\Business meeting**의 기존 V3.1 코드를 확장했습니다.
로컬 개발과 서비스 모형 테스트만 진행합니다. 실제 Google 운영 DB 변경, Apps Script 배포, GitHub add/commit/push는 실행하지 않았습니다.

실제 발표자료 PDF는 한 개도 추가하지 않았습니다. 브로셔 원본 네 개를 수정하거나 발표자료로 복제하지 않았습니다.
NPU 네 기업의 발표자료는 모두 `filePath:null / available:false / publicApproved:false`입니다. 확인되지 않은 ITS 기업은 추가하지 않았습니다.

## 완료 기능

| 항목 | 동작 |
| --- | --- |
| 행사 통합 홈 `#home` | 기존 forest green 디자인으로 행사 소개, 비즈매칭/자료실 진입, 신청 확인, 기존 브로셔, 하단 운영자 로그인 |
| 기존 비즈매칭 `#business` | 기존 ITS/NPU 기업 선택 화면을 보존. 신청/조회/ID 찾기/취소/승인/정원/현황판 흐름 유지 |
| 자료실 `#materials` | ITS/NPU 섹션, 기업 카드, 발표자료/브로셔 구분, 준비 중 상태, 하단 상담 신청 버튼 |
| 미등록 자료 | disabled 버튼, href/data-material-id 없음, PDF/HEAD 요청과 클릭 로그 모두 없음 |
| 기존 `#brochures` | 네 원본 파일과 새 탭 링크 재사용. 클릭 로그 연결, 초기 PDF 요청 없음 |
| 관리자 진입 | 기업 선택 화면의 관리자 링크를 행사 통합 홈 맨 아래 운영자 로그인으로 이동 |
| 관심도 통계 | 로그인 후 명시적 조회. 자료별/기업별/자료 유형별/일자별 클릭 및 고유 세션, 개별 기록 100건 단위 페이지 |
| 필터 | KST 시작일/종료일, ITS/NPU, 기업, 발표자료/브로셔 |
| 빈 데이터 | 0건 통계, 준비 중 자료 0건 행, 빈 기록 안내 |
| 개인정보 경계 | 클릭 기록과 상담 신청을 결합하지 않음. 통계는 관리자 전용 POST |
| 등록 구조 | 한 설정 파일 + 생성 도구 + 편집기용 서버 목록 동기화 |
| 마이그레이션 | 기존 DB에 자료열람이력 한 시트만 추가하는 반복 실행 가능한 편집기 함수 |

자료실의 ITS/NPU 섹션 이동은 페이지 라우팅을 바꾸지 않는 내부 스크롤입니다.
행사 홈·자료실 진입은 GAS/Sheets 요청 0건, PDF 요청 0건입니다.
관리자 자료 통계는 기존 10초 상담 polling에 합치지 않았습니다. 통계 조회/필터/페이지 이동 시에만 조회합니다.

## 실제 등록된 브로셔와 공개 가능 여부 확인 범위

| 기업 | 기존 파일 | 크기 (bytes) | 확인 |
| --- | --- | ---: | --- |
| 딥엑스 | assets/brochures/deepx-company-profile-2026.pdf | 9,146,457 | 파일 존재, %PDF- 서명, 기존 공개 등록 true |
| 모빌린트 | assets/brochures/mobilint-corp-brochure-2026.pdf | 5,879,977 | 동일 |
| 퓨리오사 | assets/brochures/furiosa-sales-pitch-2026-kor.pdf | 7,638,458 | 동일 |
| 리벨리온 | assets/brochures/rebellions-company-profile-2026-kr.pdf | 5,864,691 | 동일 |

네 PDF는 기존 Public Repository에 등록되어 있던 원본 파일을 그대로 사용합니다.
기존 `assets/brochures/README.md`와 available 설정을 확인해 공개 등록 상태를 계승했습니다.
**기업별 대외 공개 허락서나 승인 이력 문서는 저장소에서 확인되지 않았습니다.** 코드/파일 존재만으로 재배포 권리를 확정할 수 없으므로 운영자가 기존 공개 승인 근거를 확인해야 합니다. 공개 승인이 없는 자료는 해당 등록정보의 available/publicApproved를 false로 바꾸세요.
이번 작업에서는 공개 범위 변경이나 외부 업로드를 하지 않았습니다.

## 추후 준비할 자료

- NPU: 딥엑스, 모빌린트, 퓨리오사, 리벨리온의 실제 발표자료 PDF 각 1개 및 대외 공개 승인.
- ITS: 확정된 발표 기업 목록(기업명, 고유 companyId, 필요시 영문명)과 기업별 실제 발표자료 PDF 1개 및 공개 승인.
- ITS 기업 수는 제한된 상수로 고정하지 않았습니다. 설정에 회사를 추가하면 카드가 생성됩니다.
- 기업은 확정됐지만 PDF가 없다면 회사와 null/false 발표자료 항목을 등록해 준비 중으로 표시할 수 있습니다.
- 자료명/버전, 공개 가능 여부, 확정 PDF 파일을 전달해 주세요. 접근 제한이 필요한 자료는 Public Repository에 넣지 않습니다.
- 이번에는 ITS 업체명, 발표 파일명, 발표 PDF 경로를 임의로 확정하지 않았습니다.

## 한 곳에서 등록하기

원본 설정은 **assets/js/material-catalog.js**입니다.

```js
{
  materialId: 'NPU-DEEPX-PITCH', // 기존 ID는 계속 유지
  companyId: 'deepx',
  companyType: 'NPU',
  materialType: 'presentation',
  title: '딥엑스 발표자료',
  filePath: null,              // 실제 PDF 확보 후에만 상대 경로 입력
  available: false,
  publicApproved: false
}
```

`companies` 배열에 기업 정보, `materials` 배열에 자료 정보를 둡니다.
presentation은 회사당 한 개이며 생성 도구와 서버 양쪽에서 중복을 거부합니다.
자료 ID는 대문자 ASCII 영문/숫자/-/_로 구성한 안정된 식별자를 사용합니다.
이미 열람 기록이 있는 ID를 재사용하거나 삭제하지 말고, 공개 중지 시 available:false로 보존하세요.

권장 저장 구조(경로/파일명은 실제 파일을 받은 뒤 확정):

```text
assets/
  brochures/                 # 기존 네 PDF 유지
  materials/
    npu/<company-id>/<approved-filename>.pdf
    its/<company-id>/<approved-filename>.pdf
```

권장 파일명 패턴은 `<company-id>-presentation-<version>.pdf`입니다.
이는 권장 규칙이며 현재 설정에 실제 발표자료 경로로 입력하지 않았습니다.
ASCII 소문자/숫자/-/_ 및 .pdf를 사용하고 파일명 대소문자를 맞추세요.

### 실제 PDF를 받은 뒤 등록하는 순서

1. 회사와 공개 승인을 확인합니다.
2. 원본 PDF를 위 지정 폴더에 복사합니다. 브로셔를 발표자료로 복사하지 않습니다.
3. ITS 새 회사라면 companies에 `{companyId,companyType:'ITS',name,english}`를 추가합니다.
4. 기존/신규 materials 항목의 filePath에 실제 파일의 저장소 기준 경로(`assets/...`)를 입력합니다. available과 publicApproved를 true로 바꿉니다.
5. 로컬 터미널에서 `npm run sync-assets`를 실행합니다. 이 명령은 `sync-materials`도 실행합니다.
6. 도구가 파일 존재, %PDF- 서명, 안전한 상대 경로, ID 중복, 회사 연결, 회사별 발표자료 1건을 검사합니다.
7. `apps-script/MaterialCatalog.gs`와 `MaterialStats.gs`가 생성됩니다. 직접 수정하지 않습니다.
8. Apps Script 편집기의 MaterialCatalog.gs를 생성된 파일 내용으로 교체해 저장하고 **syncMaterialCatalog()**를 실행합니다. (운영 전 적용 시점에 사용자가 직접.)
9. `npm run sync-assets -- --check`, `npm test`와 로컬 자료실/브로셔/통계 확인을 합니다.
10. 준비된 파일·설정·생성 파일을 GitHub에 반영하고 Pages 업데이트 뒤 실제 모바일/PC에서 확인합니다.

### 자료를 추가할 때 Apps Script 재배포가 필요한가?

| 변경 | GitHub/Pages 업데이트 | Script Properties 목록 동기화 | Apps Script 새 버전 배포 |
| --- | --- | --- | --- |
| 최초 V4 API 도입 | 필요 | syncMaterialCatalog 필요 | **필요** |
| 기존 준비 중 발표자료 활성화 | 필요 | **필요** | 불필요 |
| ITS 기업/자료 ID 추가 | 필요 | **필요** | 불필요 |
| 제목/회사명/경로/공개 여부 변경 | 필요 | **필요** | 불필요 |
| 파일 내용 교체, ID·경로·등록정보 동일 | 필요 | 불필요 | 불필요 |
| API/통계 집계/시트 구조 코드 변경 | 필요시 | 필요시 | **필요** |

**발표자료 최초 등록은 GitHub 업데이트만으로 끝나지 않습니다.** 서버는 클라이언트의 available/기업명/URL을 신뢰하지 않으므로 서버 검증 목록도 맞춰야 합니다.
syncMaterialCatalog는 생성 파일의 목록을 Script Properties에 저장하는 편집기 전용 함수입니다.
배포된 기존 V4 웹앱은 실행 시 이 Properties 목록을 읽으므로, 목록만 바꾸는 작업은 웹앱 재배포가 필요 없습니다.
자료 등록 때마다 여러 코드를 수동으로 편집하거나 프론트/서버 ID를 별도 작성할 필요는 없습니다.

## Apps Script / 시트 / 보안 설계

### API

| API | HTTP / 권한 | 입출력 |
| --- | --- | --- |
| logMaterialView | 공개 POST | materialId, 랜덤 sessionId, 클릭별 UUID clickId. 결과는 recorded/duplicate만 |
| getMaterialStatistics | 관리자 인증 POST | token, from/to, companyId/companyType/materialType, offset. 집계와 식별자 없는 개별 기록 |

기존 API_VERSION `2026-10-v3.1` 계약은 그대로 보존하고 두 action을 추가했습니다. 프론트 빌드는 `2026-10-v4-r1`입니다.
새 API를 GET으로 호출하면 차단합니다. token/sessionId는 URL query에 넣지 않습니다.
text/plain;charset=utf-8 POST, JSON 응답/버전 검증, CORS/redirect 처리 등 기존 GAS 어댑터를 재사용합니다.
쓰기 재시도는 없습니다. PDF는 즉시 새 탭으로 열고 로그 실패는 화면 알림으로 표시합니다.
준비 중 버튼에는 링크/로그 핸들러가 없고 서버도 미등록/비활성 ID를 거부합니다.

클라이언트는 자료 ID·랜덤 세션·클릭 UUID만 보냅니다. 회사명/자료명/유형/시각은 서버가 검증 목록과 서버 시각으로 결정합니다.
임의 URL/기업명/이메일/클라이언트 시각을 본문에 넣으면 거부합니다.
자료 ID는 공개 정적 메타데이터이며 비밀값이 아닙니다.

### 신규 자료열람이력 (A:J)

이벤트ID / 열람일시 / 자료ID / 기업ID / 기업명 / 기업구분 / 자료구분 / 자료제목 / 방문세션해시 / 클릭ID

- 이벤트ID·시각은 서버에서 생성합니다.
- 방문세션은 탭의 sessionStorage에 둔 랜덤 UUID로 로그인/신청/연락처와 무관합니다. 저장소 차단 시 메모리 임시값을 사용합니다.
- 서버는 TOKEN_SIGNING_SECRET으로 도메인이 분리된 HMAC 세션 해시를 저장합니다. 원본 세션 UUID는 시트에 저장하지 않습니다.
- token, 승인코드, 비밀번호, 이메일, 연락처, IP, user agent, 상담내용을 이 시트에 기록하지 않습니다.
- 통계 응답에는 세션 해시·클릭ID·이벤트ID도 반환하지 않습니다.
- StringValue 쓰기로 수식 Injection을 방지합니다.
- 같은 clickId 재전송은 중복 저장하지 않으며, 다른 세션/자료로 재사용하면 거부합니다.
- 세션당 1분 30건 제한과 공통 ScriptLock으로 쓰기를 보호합니다.
- 자료 클릭은 비즈매칭 revision/history를 변경하지 않아 각 클릭마다 상담 신청 전체 목록을 다시 읽지 않습니다.
- 고유 세션은 실제 사람 수가 아닙니다. 새 탭/브라우저/기기는 다른 세션일 수 있습니다. 복사 URL 직접 방문, 차단된 요청, 봇 등을 완전히 측정하는 분석 도구가 아닙니다.
- 일자는 서버 ISO 시각을 KST로 변환해 집계하며 자료/기업/구분 필터를 동시에 적용합니다.
- 상담신청/시간대별정원/처리이력/NPU설정 네 시트와 기존 인증정보는 유지됩니다.
- 운영 자료열람이력의 보유/파기 정책은 ITS Korea가 결정해야 합니다. 임의 기간을 넣지 않았습니다.

### 편집기 마이그레이션 (이번에 실행하지 않음)

1. 추후 운영 적용 시 기존 비공개 DB를 백업하고 SHEET_ID가 맞는지 확인합니다.
2. 코드 변경을 Apps Script 편집기에 반영합니다.
   - 수정: Config.gs, Code.gs, Database.gs
   - 추가: MaterialCatalog.gs, MaterialStats.gs, Materials.gs, MigrationV4.gs
   - 나머지 기존 파일/manifest/Script Properties는 유지합니다.
   - V3.1/현황판 코드가 아직 Google에 반영되지 않았다면 해당 이전 변경도 함께 반영해야 합니다.
3. 함수 선택에서 **migrateMaterialLibraryV4**를 골라 실행합니다.
4. 필요한 경우 본인 Google 계정으로 권한 승인 후, 기존 DB에 자료열람이력 시트와 A:J 헤더가 생겼는지 확인합니다.
5. **syncMaterialCatalog**를 실행해 서버 검증 목록을 등록합니다.
6. 기존 웹앱 배포의 수정 → 새 버전으로 V4 코드를 배포합니다. 기존 /exec URL, 실행 사용자(본인), 접근 설정을 유지합니다.
7. Spreadsheet 공유 설정 Restricted를 확인합니다.
8. 이후 GitHub/Pages에 프론트를 반영합니다.

기존 DB에는 setupSystem/configureAuthentication/V2·V3 정원 migration을 다시 실행할 필요가 없습니다.
migrateMaterialLibraryV4는 SHEET_ID가 없거나 접근할 수 없으면 중단하며 새 Spreadsheet를 만들지 않습니다.
새 프로젝트의 setupSystem은 새 analytics 스키마도 생성하지만, 실제 Google에서 직접 실행/승인해야 생깁니다.
이번 로컬 테스트의 createHarness/setupSystem은 메모리 서비스 모형이며 **실제 Google Drive/Sheets 생성이 아닙니다.**

## 검증

- 최종 결과: Node **157/157 통과**, 브라우저 **8종 통과**, 자산/자료 목록 일치 검사 통과.
- 브라우저 8종: gas-smoke / performance / communication / business-v2 / business-v3 / revision / schedule-board / materials-v4.
- Node: 기존 145개 회귀 테스트를 유지하고 V4 12개를 추가했습니다.
- V4: 준비 중/가짜 경로 노출 금지, 실제 브로셔 파일, ITS 카드 확장/이스케이프, migration 반복 실행/기존 데이터 보존, 서버 목록 shard 동기화, 미등록 ID 차단, 세션 해시, 관리자 권한, 중복 클릭/잠금/제한, KST 날짜 경계, 자료/기업/유형/일자별 집계, 100건 paging, mock 분리/초기화.
- 브라우저: 행사 홈 → 기존 비즈매칭, 자료실 준비 중, NPU 4카드, 하단 신청, 로그 없는 초기 렌더, 브로셔 클릭 → 다른 PC 관리자(서비스 모형), 2개 익명 세션, 빈 통계/필터, ITS 추가 카드, 로그 통신 실패 시 PDF 열기 유지.
- 화면: 320/390/768/1440 폭의 행사 홈/기업 선택/자료실과 390 폭 관리자에서 페이지 가로 넘침 없음.
- 기존 신청·본인확인·승인/거절·취소·정원·시간 연장/취소·현황판·polling·통신 회귀 검사를 유지합니다.
- 실제 발표자료 PDF가 필요한 활성화/유형 집계는 **메모리 mock 등록정보와 합성 클릭만으로** 검사했습니다. 테스트 PDF 파일을 만들거나 운영 시트에 합성 데이터를 저장하지 않았습니다.
- 브라우저의 PDF 새 탭 검사는 기존 PDF URL 요청을 관찰하고 설치된 PDF 뷰어 영향을 피하는 204 응답을 사용합니다. 원본 파일 존재/%PDF- 검사는 별도 Node 검사입니다.
- Google 배포 권한·할당량·실제 CORS·공개 승인·실기기 운영은 이번 로컬 검사로 확정할 수 없습니다.

### 나중에 운영 적용 후 모바일 → PC 확인

1. 모바일의 실제 Pages 자료실에서 등록 완료된 브로셔 하나를 누릅니다.
2. PC에서 행사 홈 하단 운영자 로그인 → 자료 관심도 통계 → 조회합니다.
3. 해당 자료·기업·브로셔 클릭이 1건 증가하고 KST 개별 기록에 표시되는지 확인합니다.
4. 같은 모바일 탭에서 다시 열면 클릭 +1, 해당 조회 범위의 고유 세션은 유지되는지 확인합니다.
5. 다른 기기/새 방문세션으로 열면 고유 세션이 증가하는지 확인합니다.
6. 준비 중 버튼은 클릭/네트워크 요청/통계 증가가 모두 없는지 확인합니다.
7. 발표자료 확보 후 위 등록 절차를 거쳐 발표자료/브로셔 구분 집계를 확인합니다.
8. 로그인하지 않은 요청과 NPU 토큰으로 통계가 조회되지 않는지 확인합니다.
9. 신청·조회·승인·취소·정원·현황판도 기존대로 동작하는지 확인합니다.

## 추가·수정 파일

추가:
- assets/js/material-catalog.js, materials.js, material-stats.js, material-views.js, mock-materials.js
- assets/css/materials.css, assets/materials/README.md
- scripts/sync-materials.mjs
- apps-script/MaterialCatalog.gs, MaterialStats.gs (자동 생성), Materials.gs, MigrationV4.gs
- tests/materials-v4.test.mjs, tests/browser-materials-v4.mjs
- docs/material-library-v4.md

수정:
- assets/js/app.js, api.js, gas-api.js, mock-api.js, brochures.js, build-version.js
- apps-script/Config.gs, Code.gs, Database.gs
- scripts/sync-assets.mjs, index.html, package.json
- assets/js/views.js, assets/brochures/README.md
- tests/gas-harness.mjs, tests/browser-business-v2.mjs (공통 registry/기존 브로셔 fixture 경로 반영)
- README.md, apps-script/README.md, docs/google-apps-script-integration.md

테스트 스크린샷과 실행 로그는 gitignored artifacts에만 저장합니다. 실제 발표자료 PDF 추가는 0개입니다.
