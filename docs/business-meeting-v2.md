# K-NPU Business Meeting V2 변경 및 운영 적용 보고서

운영자가 이후 Google 적용 완료를 알리고 PDF 원본 4개를 추가했습니다. GitHub 반영 준비 과정에서 PDF 파일명을 아래 ASCII 이름으로 정리하고 SHA-256 비교로 원본 내용 보존을 확인했습니다. 자료 보기 링크는 현재 활성화되어 있습니다. Google 운영 적용 완료 여부는 이 작업에서 직접 검증하지 않았습니다.

## 작업 결과와 범위

현재 로컬 저장소 E:/2026/강릉 세계총회 K-NPU전환/Business meeting을 기준으로 작업했습니다. 원격에서 가져온 코드로 덮어쓰지 않았습니다. 기존 UI를 유지하면서 새 시간표, 신청 ID 찾기, 거절 사유, 정적 PDF 소개자료 영역을 추가했습니다.

최초 V2 구현 시 GitHub push/Pages 설정 변경, Google DB 생성·수정, 운영 Web App 배포는 실행하지 않았습니다. 이후 운영자의 요청에 따라 GitHub 반영을 준비했습니다. **아래 마이그레이션은 운영자가 Google 계정에서 직접 실행해야 실제 시트에 반영됩니다.** 기존 DB가 운영 중이라는 요청을 전제로 새 DB를 생성하는 흐름을 사용하지 않았습니다.

## 변경된 파일 전체 / GitHub 반영 대상

아래 파일과 승인된 브로슈어 PDF 4개를 함께 반영합니다.

| 구분 | 파일 | 내용 |
| --- | --- | --- |
| 수정 | assets/js/config.js | 새 4개 시간, 이전 4개 시간 보존 상수 |
| 수정 | assets/js/app.js | ID 찾기/소개자료 라우트, 메모리 이메일 재사용, 거절 dialog, 조회 응답 경합 보호 |
| 수정 | assets/js/views.js | 조회 전환 탭, 최소 ID 결과, 거절 입력/상세, 브로슈어 카드, 과거 로그 시간 필터 |
| 수정 | assets/js/gas-api.js | findRequestIds POST 어댑터 |
| 수정 | assets/js/mock-api.js | 시간별 기존 데이터 보존 보충, ID 찾기/제한, 거절 사유 |
| 수정 | assets/css/styles.css | 기존 디자인에 맞춘 탭/카드/사유 반응형 스타일 |
| 수정 | apps-script/Config.gs | 새 시간, Q열 rejectionReason 스키마 |
| 수정 | apps-script/Code.gs | POST allowlist/본인확인 제한 잠금 확장 |
| 수정 | apps-script/Auth.gs | 네 항목 동시 확인, 최소 응답, HMAC 캐시 조회 제한 |
| 수정 | apps-script/Database.gs | 17열 읽기, 새 시간만 public config, 기존 원자적 commit 경로 공유 |
| 수정 | apps-script/Services.gs | 새 시간 검증, 거절 필수 사유/승인 빈 사유 |
| 수정 | scripts/serve.mjs | 로컬 PDF application/pdf |
| 수정 | tests/gas-harness.mjs | 실제 Migration.gs 로드, 부분 셀 쓰기/열 추가 모형 |
| 수정 | tests/mock-api.test.mjs | 새 시간 기대값, 기존 거절 회귀 입력에 필수 사유 추가 |
| 수정 | tests/gas-backend.test.mjs | 기존 거절 회귀 입력에 필수 사유 추가 |
| 수정 | tests/performance.test.mjs | 공개 availability 헤더 범위 Q1, 3개 집계 열 유지 |
| 수정 | tests/revision.test.mjs | 새 17열 snapshot 범위, 필수 사유 |
| 수정 | tests/browser-revision.mjs | 기존 외부 거절 회귀 입력에 필수 사유 추가 |
| 수정 | README.md | 현재 기능/구조/실제 적용 안내 |
| 수정 | apps-script/README.md | 기존 운영 V2 적용 및 신규 환경 안내 |
| 수정 | docs/google-apps-script-integration.md | API 계약/거절/ID 찾기/검증 설명 |
| 신규 | apps-script/Migration.gs | 편집기 전용 migrateBusinessMeetingV2 |
| 신규 | assets/js/brochures.js | PDF 경로와 게시 여부, 현재 모두 미배치 |
| 신규 | assets/brochures/README.md | 공개 승인과 원본 배치 방법 |
| 신규 | tests/business-v2.test.mjs | 서버/마이그레이션/API/상세/PDF 경로·실제 파일 16개 검사 |
| 신규 | tests/business-v2-mock.test.mjs | 로컬 데모 4개 검사 |
| 신규 | tests/browser-business-v2.mjs | 실제 프론트엔드 모바일/PC 및 PDF 요청 검사 |
| 신규 | docs/business-meeting-v2.md | 이 보고서 |

assets/js/api.js와 runtime-config.js, session-store.js, apps-script/Revision.gs/Setup.gs/appsscript.json은 수정하지 않았습니다. 기존 공개 GAS URL과 polling 주기, HMAC 세션, ScriptLock, config 캐시, request snapshot/batchGet을 유지합니다. Setup.gs는 Config.gs의 새 스키마를 사용하므로 신규 환경을 만들 때 처음부터 V2로 생성합니다.

테스트는 삭제하거나 약화하지 않았습니다. 이전 시간 기대값 및 이제 필수인 거절 사유 입력만 변경했고, 이전 65개 테스트를 모두 유지했습니다. artifacts/의 임시 도구·합성 결과·스크린샷은 gitignore 대상입니다. 운영 인증정보와 실제 신청 데이터는 GitHub에 넣지 않습니다.

## Sheet schema와 마이그레이션

상담신청은 기존 A:P 16열을 그대로 유지하고 **Q열 거절사유**를 추가합니다. 프론트엔드/백엔드 필드는 rejectionReason입니다.

신청ID / 신청일시 / ITS기업명 / 담당자명 / 연락처 / 이메일 / NPU기업ID / NPU기업명 / 상담시간 / 참석인원 / 상담내용 / 상태 / 개인정보동의 / 개인정보동의시각 / 개인정보안내문버전 / 최종수정일시 / **거절사유**

처리이력 13열, NPU설정 4열, 시간대별정원 7열의 열 순서는 변경하지 않습니다. 기존 신청 행과 거절 기록의 빈 사유는 오류 없이 취급합니다.

시간대별정원에서는 기존 16:50 – 17:00, 17:00 – 17:10, 17:10 – 17:20, 17:20 – 17:30 행을 삭제하지 않고 운영여부 FALSE로 전환합니다. 정원 숫자/과거 상담신청/처리이력의 시간은 그대로 남습니다. 닫힌 슬롯의 최종수정시각/수정자만 갱신합니다.

새 시간은 정확히 아래 네 개입니다.

- 15:50 – 16:00
- 16:00 – 16:10
- 16:10 – 16:20
- 16:20 – 16:30

각 기업에 없는 시간 행만 생성합니다. 초기값은 DEEPX 5 / MOBILINT 2 / FURIOSA 1 / REBELLIONS 2, 운영여부 TRUE입니다. 이미 존재하는 새 시간 행의 사용자 정원/운영여부는 그대로 둡니다. 공개 설정/availability/관리자 진행 표/NPU 정원 화면에는 새 네 시간만 나옵니다. 과거 신청은 본인 조회·NPU 목록·확정 시간표의 이전 시간 표시·관리자 로그/상세에서 원래 시간으로 남습니다. 과거 pending은 추가 승인하지 않고 거절·취소할 수 있으며, 과거 확정 신청도 취소할 수 있습니다.

migrateBusinessMeetingV2는 기존 16열 또는 신규 17열을 직접 검사한 후 작업하므로 신규 validator가 구형 헤더 때문에 먼저 실패하지 않습니다. 잘못된 열 순서, 알 수 없는 추가 열/헤더 없는 Q열 데이터, 중복 정원 행은 쓰기 전에 거부합니다. Q1 헤더와 정원 변경을 하나의 Sheets batchUpdate로 보내고 기존 writer lock/pending marker/성공 후 revision 발행 경로를 사용합니다. [Google의 batchUpdate 설명](https://developers.google.com/workspace/sheets/api/guides/batchupdate)에 따른 일괄 적용 방식을 사용합니다.

반복 실행해도 신청/처리이력은 다시 쓰지 않고 정원 행도 중복 생성하지 않습니다. 변경이 없어도 공개 캐시 및 모든 관련 revision은 갱신합니다. Sheet 저장 후 revision 발행에 실패한 경우 다시 실행하면 데이터 중복 없이 발행을 복구합니다.

SHEET_ID/인증 해시/ADMIN_ID/TOKEN_SIGNING_SECRET/유효 세션은 변경하지 않습니다. 기존 Spreadsheet 공유 정책도 변경하지 않습니다. setupSystem/configureAuthentication 재실행은 필요 없습니다.

## 신규 API와 개인정보 보호

API 진입점은 기존 api.js 하나입니다. GAS/mock 모두 다음 호출을 제공합니다.

```js
api.findRequestIds({ itsCompany, contactName, phone, email });
```

네 필드를 **POST JSON 본문**으로만 보냅니다. GET는 METHOD_NOT_ALLOWED입니다. 기업명/담당자명은 trim 후 정확 비교, 연락처는 숫자만 남겨 비교, 이메일은 trim+lowercase입니다. 네 값이 모두 일치하는 모든 상태의 신청을 createdAt 최신순으로 반환합니다.

응답 각 항목은 id/createdAt/providerName/time/status만 포함합니다. 담당자·전화·이메일·상담내용은 반환하지 않습니다. 하나라도 일치하지 않거나 필수 값이 없으면 공통 NOT_FOUND 메시지인 “입력하신 정보와 일치하는 신청을 찾을 수 없습니다.”를 사용합니다.

기존 CacheService 조회 제한을 확장했습니다. 정규화 이메일의 서버 HMAC 값이 포함된 캐시 키에 성공·실패 합계 15분 10회만 허용하며, 캐시에 원문 신원정보를 저장하지 않습니다. 다른 세 항목을 바꿔도 같은 이메일 제한을 공유합니다. 제한 갱신은 공통 ScriptLock 안에서 처리하며 시트 읽기는 요청당 한 batchGet입니다. 입력은 처리이력/Script Properties/로그/localStorage에 기록하지 않습니다.

화면의 결과 버튼은 ID를 채우고 방금 검증한 이메일을 **메모리에서만** 재사용하여 기존 ID+이메일 조회를 실행합니다. 이메일은 URL에도 넣지 않습니다. ID 찾기/소개자료 화면은 자동 polling이 없습니다. 재조회 실패 시 이전 결과를 제거하고, 화면 이동 후 늦은 응답은 무시합니다.

기존 공개 API getConfig/getAvailability/getAvailabilityRevision/submitRequest의 범위는 그대로입니다. 전체 목록은 관리자 또는 해당 NPU의 검증된 HMAC 세션에서만 반환합니다. ID+이메일 조회/취소도 그대로 필요합니다. 네 항목 일치는 이번 요청의 본인확인 방식이며 이메일 OTP 소유권 확인을 추가한 것은 아닙니다. CacheService 제한은 기존 보조 방어이며 캐시 유실/대규모 공격 방어와 부하 검증은 별도 운영 점검 대상입니다.

## 거절 사유 저장과 revision

```js
api.decideRequest({ token, id, decision: '매칭거절', rejectionReason });
```

거절 버튼을 누르면 textarea dialog를 열며 서버/화면 양쪽에서 trim 후 1~500자를 확인합니다. 거절 API는 해당 NPU 신청인지, 승인대기인지 확인하고 상태/updatedAt/거절사유와 기존 거절 처리이력을 같은 원자적 batch로 저장합니다. stringValue로 쓰므로 =/+/-/@ 시작 사유도 수식으로 실행되지 않습니다. 화면 출력도 HTML 이스케이프합니다.

승인은 기존 정원 검증/동시성 보호를 유지하고 client가 보낸 사유를 무시하여 빈 문자열을 저장합니다. 같은 거절의 재시도는 기존 사유/이력을 덮어쓰지 않습니다. 신청자·NPU·관리자 상세에서 매칭거절이며 사유가 있을 때만 영역을 표시합니다. 다른 상태/legacy 빈 사유는 표시하지 않습니다.

| 작업 | Provider revision | Admin revision | Availability revision |
| --- | --- | --- | --- |
| 신규 신청 | 해당 기업 변경 | 변경 | 유지 |
| 승인 | 해당 기업 변경 | 변경 | 해당 기업 변경 |
| 거절 및 사유 저장 | 해당 기업 변경 | 변경 | 유지 |
| 대기 신청 취소 | 해당 기업 변경 | 변경 | 유지 |
| 확정 신청 취소 | 해당 기업 변경 | 변경 | 해당 기업 변경 |
| 시간별 정원 | 해당 기업 변경 | 변경 | 해당 기업 변경 |
| ID 찾기 | 유지 | 유지 | 유지 |
| 브로슈어 | 무관 | 무관 | 무관 |
| V2 migration | 네 기업 변경 | 변경 | 네 기업 변경 |

NPU 5초/관리자 10초 경량 확인, 같은 버전이면 시트 읽기 0, config 캐시/진행 중 요청 공유/필터·정원 초안·읽기 전용 상세 부분 갱신을 유지합니다. 새 거절 dialog에 쓰고 있는 사유도 자동 갱신 중 보존됩니다.

## 브로슈어 파일 배치

최초 구현 당시 PDF가 없어 준비 중으로 표시했습니다. 이후 운영자가 실제 원본 PDF 4개를 assets/brochures에 추가했으며, 아래 ASCII 이름으로 정리했습니다. 원본과 정리된 파일의 SHA-256이 모두 일치합니다. 현재 네 자료 보기 링크는 활성화되어 있습니다.

| 공개 승인할 원본 자료 | assets/brochures/에 복사할 이름 |
| --- | --- |
| DEEPX 기업 소개 PDF | deepx-company-profile-2026.pdf |
| MOBILINT 브로슈어 PDF | mobilint-corp-brochure-2026.pdf |
| FURIOSA AI 국문 소개 PDF | furiosa-sales-pitch-2026-kor.pdf |
| REBELLIONS 국문 소개 PDF | rebellions-company-profile-2026-kr.pdf |

**Public Repository에 커밋한 PDF는 공개 파일입니다.** 공개 여부는 운영자가 판단합니다. 접근 제한이 필요한 PDF를 여기에 넣지 않습니다. 공개 승인받은 원본을 내용 변경/압축/재인코딩 없이 복사하고 assets/js/brochures.js의 해당 available만 true로 바꿉니다. 미배치 자료는 false를 유지합니다.

링크는 상대 경로 ./assets/brochures/파일명, target=_blank, rel=noopener noreferrer입니다. 기본 Chrome/Edge PDF viewer에 맡기며 GAS/Sheets를 사용하지 않습니다. PDF preload/iframe/import/base64/자동 HEAD 조회를 사용하지 않아 홈/신청 진입의 PDF 요청은 0회입니다. 작은 brochure manifest JS 모듈 한 개의 정적 요청만 추가됩니다.

## 운영 적용 순서

1. Google Sheets **파일 → 사본 만들기**로 비공개 백업을 만들고 행사 신청·승인 작업을 잠시 멈춥니다. 기존 GAS 코드 버전도 보관합니다.
2. **기존** Apps Script 프로젝트에서 Config.gs/Code.gs/Database.gs/Services.gs/Auth.gs를 교체하고 Migration.gs를 추가합니다. 기존 Setup.gs/Revision.gs/appsscript.json/속성은 유지합니다. 이전 성능/revision 버전도 아직 적용하지 않았다면 최신 여덟 .gs 파일을 모두 반영합니다.
3. 편집기 함수 선택 메뉴에서 **migrateBusinessMeetingV2 → 실행**. 권한 요청이 나오면 기존 DB 운영 계정으로 Sheets 권한을 승인합니다. setupSystem/configureAuthentication을 선택하지 않습니다.
4. 실행 로그 변경 건수와 시트 Q1/이전 정원 FALSE/새 시간 16행/기존 신청·이력·인증·비공개 공유 보존을 확인합니다. 일반 기존 DB 결과는 headerAdded=true, oldSlotsClosed=16, newSlotsAdded=16입니다. 중단된다면 헤더/중복 행을 먼저 확인하고 임의로 초기화하지 않습니다.
5. **배포 → 배포 관리 → 기존 웹 앱 → 연필 → 새 버전 → 배포**. 재배포는 필수입니다. 기존 배포를 수정하면 현재 /exec URL을 유지하며 새 배포/새 DB/새 URL이 필요하지 않습니다.
6. runtime-config.js backend를 잠시 gas로 바꾸어 npm start 후 새 시간/ID 찾기/거절/인증/revision을 테스트하고 auto로 복원합니다. 자동 테스트처럼 모형이 아니라 실제 /exec 응답과 Google Sheet 기록을 확인합니다.
7. 브로슈어의 외부 공개 가능 여부를 운영자가 확인합니다.
8. 승인된 PDF만 assets/brochures에 원본 그대로 복사하고 해당 available을 true로 설정합니다. 없는 PDF는 준비 중으로 둡니다.
9. 이 보고서의 변경 파일 전체와 승인된 PDF만 GitHub에 add/commit/push합니다. artifacts/인증정보/실제 신청 데이터는 제외합니다. 기존 main 기반 Pages는 push 후 배포될 수 있으므로 서버 적용을 먼저 완료합니다.
10. GitHub Actions/Settings → Pages에서 배포 성공과 실제 사이트를 확인하고 강력 새로고침합니다.
11. 아래 PC/모바일 절차를 수행한 후 운영을 재개합니다.

문서의 순서는 운영자가 실행할 후속 단계입니다. 이번 작업에서 Google에 접근하여 DB 생성/마이그레이션/배포를 완료한 것은 아닙니다.

## 검증 결과와 재현

- **npm test: 85개 통과, 실패 0**. 기존 65개 + 신규 V2 20개. 게시된 모든 브로슈어의 실제 파일 존재와 PDF 식별자를 추가 검증합니다.
- browser-business-v2: 새 시간, 모바일 네 정보 ID 찾기/최신순 최소 결과/이메일 메모리 재사용, NPU 사유 필수/편집 보존, 신청자·관리자 사유 표시, mock, overflow/오류 없음.
- PDF 테스트: 게시 true인 테스트 manifest로도 홈/신청/소개자료 로딩 요청 0회, 클릭한 PDF만 1회/새 탭. 테스트 HTTP 404 fixture로 URL 요청만 검증했고 실제 PDF를 만들거나 Viewer 렌더링을 검증한 것은 아닙니다.
- 기존 browser-performance/browser-revision 검사 통과. 홈 GAS 요청 0, 신청 최초 2개/따뜻한 config 1개, 무변경 revision의 시트 읽기 0, 기존 부분 갱신/경합/숨긴 탭/팝업/초안 유지 확인.
- browser-gas-smoke: 통과. 모바일 신청→PC 관리자→NPU 승인→조회→정원 반영→취소 회귀를 확인했습니다.

```powershell
npm test
npm start
# 다른 터미널: 설치된 Playwright를 이용
node tests/browser-business-v2.mjs
node tests/browser-gas-smoke.mjs
node tests/browser-performance.mjs
node tests/browser-revision.mjs
```

선택적으로 PLAYWRIGHT_MODULE/BROWSER_CHANNEL/PREVIEW_URL 환경변수를 지정할 수 있습니다. 브라우저 검사는 실제 프론트엔드를 사용하지만 GAS 요청은 실제 .gs 소스를 실행하는 Google 서비스 모형에 연결합니다. 실제 Google 권한/CORS/할당량/물리 기기/운영 배포 결과를 대신하지 않습니다.

## 실제 PC/모바일 테스트

1. PC와 모바일에서 같은 실제 Pages 주소를 열고 새 네 시간만 표시되는지 확인합니다. 폰/PC localStorage의 데모가 아닌 같은 운영 GAS URL을 사용해야 합니다.
2. 모바일에서 예시 기업·담당자·연락처·이메일로 서로 다른 NPU/시간 두 건을 신청합니다. Sheet에 승인대기 두 행과 처리이력이 생기는지 확인합니다.
3. 신청ID를 따로 입력하지 않고 ID 찾기로 네 정보(전화는 다른 하이픈 형식)를 넣습니다. 두 건이 최신순으로 나오고 결과에 연락처/이메일/상담내용이 없는지 확인합니다. 결과 버튼으로 본인 상세가 열리는지 확인합니다.
4. 네 정보 중 하나씩 틀리게 넣고 같은 NOT_FOUND 문구인지, ID만으로 원래 조회가 불가능한지 확인합니다. 제한 시험은 예시 전용 이메일로 11번째 조회를 검사합니다.
5. PC의 해당 NPU로 로그인하여 다른 기업 신청이 보이지 않는지 확인합니다. 거절 누르기 전 상태가 pending인지, 공백/501자 사유가 차단되고 정상 사유는 저장되는지 확인합니다.
6. 모바일에서 같은 신청을 ID+이메일로 조회하여 거절 사유를 확인합니다. 이전 legacy 거절에는 빈 영역이 없어야 합니다.
7. 다른 NPU에서 승인한 신청은 사유가 없고 승인 상태가 모바일에 보이는지 확인합니다. 관리자 다른 PC에서 신청/승인/거절 로그와 열린 상세가 revision으로 갱신되는지 확인합니다.
8. 시간별 정원 변경이 다른 시간을 바꾸지 않는지, 확정 수 아래로 줄일 수 없는지, 확정 취소 후 자리가 돌아오는지 확인합니다.
9. 예시 전용 정원 1 슬롯의 마지막 자리를 두 NPU 세션에서 동시에 승인하여 하나만 성공하는지 확인합니다. 인증 없는 관리자 목록/다른 NPU 토큰의 변경은 차단되어야 합니다.
10. 이전 시간 신청 조회/관리자 로그·필터가 원래 시간을 유지하고, 이전 시간 신규 신청·승인은 차단되는지 확인합니다.
11. 브라우저 개발자 도구 Network를 비우고 홈/신청을 열어 PDF 요청 0회를 확인합니다. 공개 승인된 자료 하나를 눌러 해당 PDF만 새 탭의 기본 Viewer로 열리고 원본 내용이 맞는지 확인합니다. PC Chrome/Edge와 실제 모바일에서도 확인합니다.
12. NPU/관리자 필터·정원 초안·거절 사유 입력 중 자동 갱신, 숨긴 탭 요청 중단/복귀 즉시 확인, 로그아웃·30분 만료를 확인합니다.

보유기간/최종 개인정보 안내 확정, 비공개 공유, 실제 Google 배포/CORS/할당량과 원본 PDF 검증은 운영자 점검 단계로 남습니다.
