# 상담시간 축소·공개 현황판 구현 및 운영 적용

2026-10-12. E:/2026/강릉 세계총회 K-NPU전환/Business meeting의 기존 **로컬 V3/V3.1 working tree**를 기준으로 구현했습니다. 이전 미커밋 성능·통신 변경을 보존했고 pull/reset/checkout으로 덮어쓰지 않았습니다. 실제 Google DB 수정·배포 또는 GitHub commit/push는 수행하지 않았습니다.

## 1. 수정 파일

이번 기능에서 수정한 파일:

- frontend: assets/js/app.js, views.js, api.js, gas-api.js, mock-api.js, runtime-config.js, build-version.js, performance.js.
- CSS/HTML: assets/css/styles.css(관리자 버튼 그룹만 추가), index.html(생성된 자산 버전).
- server: apps-script/Code.gs, Schedule.gs, Revision.gs, Diagnostics.gs.
- tests: tests/gas-harness.mjs(새 서버 파일 로딩).
- 안내: README.md, apps-script/README.md, docs/google-apps-script-integration.md.

이전 V3.1의 Auth/Database/Config 등 로컬 변경도 그대로 남아 있습니다. 현재 전체 git diff에는 이전 변경과 이번 변경이 함께 들어 있습니다.

## 2. 신규 파일

- apps-script/PublicBoard.gs: 익명 공개 집계 전용 projection.
- assets/css/board.css: board에서만 로딩하는 스크린용 스타일.
- tests/schedule-board.test.mjs / schedule-board-mock.test.mjs / browser-schedule-board.mjs.
- docs/schedule-public-board.md(이 문서), schedule-board-browser-results.json(개인정보 없는 검증 결과).

## 3. shrinkSchedule API

관리자 전용 POST입니다. api.shrinkSchedule({token,expectedLastTime})를 호출하며 body는 action/apiVersion/token/expectedLastTime만 보냅니다. token은 URL/query/hash에 포함하지 않습니다. 서버 HMAC/role/만료/활성 세션을 검증합니다. GET, NPU token, 잘못된 관리자 token은 거절됩니다. 쓰기는 자동 retry하지 않으며 성공·실패 모두 공개 config의 클라이언트 캐시를 무효화합니다.

성공 data: {removedTime,time,providerIds}. removedTime은 비활성화한 마지막 시간, time은 남은 마지막 시간입니다. 성공/실패 envelope의 meta.apiVersion과 V3.1의 45초 총 timeout/오류 분류/불확실한 쓰기 결과 확인 정책을 유지합니다.

## 4. 연장 취소 제한

- 현재 마지막 active 운영 슬롯 한 개만 대상으로 합니다.
- expectedLastTime이 서버의 실제 마지막 시간과 다르면 SCHEDULE_CHANGED.
- 기본 마지막 16:20 – 16:30 이하이면 SCHEDULE_LIMIT. 기본 15:50~16:30 네 구간은 줄이지 않습니다.
- 해당 시간에 어느 회사든 승인대기/매칭확정 신청이 있으면 SCHEDULE_IN_USE. “해당 시간대에 진행 중인 상담 신청이 있어 시간을 줄일 수 없습니다.”라고 안내합니다.
- 거절/취소된 신청만 있으면 허용하고 원래 신청·이력은 보존합니다.

관리자 버튼은 기본 상태에서 disabled이며 제한 안내 title을 제공합니다. 확인 dialog에는 현재 마지막 시간/취소 후 마지막 시간/4개 회사 접수 중단을 표시합니다. 처리 중 확인 버튼은 disabled입니다.

## 5. concurrency 보호

신청·승인·취소·정원 변경·시간 연장과 같은 ScriptLock을 사용합니다. lock 안에서 관리자 인증 → fresh snapshot → expectedLastTime 비교 → 기본시간/진행 신청 검사 → 원자적 저장 → revision 발행 순서입니다. 두 관리자 탭이 같은 마지막 시간을 확인한 상태여도 한 번만 적용되며, 다음 요청은 SCHEDULE_CHANGED가 됩니다. 따라서 한 번의 중복 클릭/응답 유실로 20분 줄이지 않습니다. in-flight 다른 쓰기도 같은 잠금을 사용합니다.

## 6. 처리이력·행 보존

시간대별정원 4행의 active만 FALSE로 만들고 updatedAt/updatedBy를 서버 시각/ITS Korea 관리자로 갱신합니다. 정원 값과 물리적 행 번호를 유지합니다. 처리이력 action=시간 연장 취소, actorRole=admin, actor=ITS Korea 관리자, NPU별 4건을 기록합니다. beforeCapacity/afterCapacity에는 유지된 정원 값을 기록하며 로그 UI에는 “10분 운영 종료 · 기록 보존”으로 표시합니다.

4개 정원 변경과 4개 이력은 **한 atomic batchUpdate**입니다. row delete와 신청 삭제를 하지 않습니다. 다시 +10분 하면 기존 extendSchedule 로직이 같은 비활성 행을 재사용합니다. public config cache와 provider/availability/admin revision은 기존 공통 commit 경로에서 무효화/발행합니다.

## 7. 공개 board route

#board입니다. [로컬 현황판](http://127.0.0.1:4173/#board)에서 확인할 수 있습니다. localhost 기본 auto는 기존 로컬 mock, Pages는 GAS를 사용합니다. 관리자 화면의 “현황판 새창 열기”는 현재 페이지 경로의 query를 제거하고 #board만 붙여 window.open(...,'_blank','noopener')합니다.

관리자 dashboard를 복사하지 않고 별도 집계 화면을 렌더합니다. 사이드바/로그인/관리자 버튼/신청 상세가 없고, 공개 화면 첫 진입에는 저장된 관리자·NPU 세션도 읽지 않습니다. 브라우저 검사에서 opener=null, 새창 sessionStorage=비어 있음, token 전달 없음이 확인됐습니다. 실제 데이터 연결 실패 시 mock으로 자동 대체하지 않습니다.

## 8. 공개 board API

GET getPublicBoard: apiVersion 필수. 입력 token/providerId/신청 개인정보는 사용하지 않습니다. 현재 운영 시간과 네 회사의 집계만 반환합니다. getConfig 또는 네 회사별 getAvailability를 추가 호출하지 않습니다.

응답 예시(실제 데이터/인증정보가 아닌 형식 설명):

    {ok:true,data:{times:[...],providers:[{id,name,english,slots:[{time,capacity,confirmed,remaining,active}]}],revision:"..."},meta:{apiVersion:"2026-10-v3.1"}}

## 9. board revision

GET getPublicBoardRevision입니다. 기존 KNPU_REVISIONS_V1의 네 회사 availability 버전을 묶은 문자열만 반환합니다. 새 속성/시트/열이 없습니다. 최대 revision 길이 147자, 기본 production JSON envelope는 300byte 미만입니다. request ID나 인증 token이 아닙니다.

단순 global revision을 쓰지 않아 pending 접수/거절/대기 취소처럼 확정 자리 집계가 바뀌지 않는 이벤트에는 board full snapshot을 다시 읽지 않습니다. 승인/확정 취소/정원/기업 설정/시간 연장/시간 축소에는 해당 availability 버전이 바뀌어 갱신됩니다. snapshot은 Sheet를 읽기 전 버전을 반환하므로 읽기 중 변경도 다음 probe에서 놓치지 않습니다. 기존 REVISION_PENDING 보호 및 30초 지속 시 제한된 복구 경로도 유지했습니다.

## 10. 공개 필드

- times, providers[].id/name/english.
- slots[].time/capacity/confirmed/remaining/active.
- revision, 항상 meta.apiVersion. 선택 개발 진단을 켠 경우 기존의 개인정보 없는 timing metadata.

confirmed는 매칭확정만 포함합니다. 승인대기는 정원을 차지하지 않습니다. remaining은 운영 중인 슬롯의 max(0,capacity-confirmed), 비활성 기업/슬롯은 0입니다. 화면에서 접수 가능/마감/접수 중지를 구별합니다. 실제 CI는 기존 공식 로컬 SVG 4개를 재사용합니다.

## 11. 비공개 정보

신청 기업명(ITS)/담당자/전화/이메일/신청ID/상담내용/거절사유/관리자·NPU token/승인코드/비밀번호/서명 secret/Sheet ID/신청 일시를 반환하지 않습니다. 서버는 요청 객체의 publicRow_ 또는 object spread를 공개 응답에 사용하지 않고 필드를 명시적으로 생성합니다. 상담신청 값도 집계용 3열만 읽습니다. 기존 인증된 신청 목록/상세/본인확인은 권한을 유지합니다.

## 12. polling과 UI

기본 10초마다 lightweight revision만 확인합니다(runtime-config.js의 revisionPolling.boardMs). 동일 버전이면 DOM/Sheet를 갱신하지 않습니다. 달라진 경우만 getPublicBoard 한 번으로 화면 집계를 바꿉니다. hidden/offline에서 중단하고 visible/online 복귀 시 즉시 probe합니다. 진행 중 요청/route generation 검사로 중복 또는 오래된 결과의 덮어쓰기를 방지합니다. 실패하면 기존 집계와 마지막 확인 시각을 유지하고 연결 확인/수동 재조회 안내를 표시합니다.

시간 축소는 ITS 시간 선택, NPU 시간별 정원, matching, admin 운영표, board에서 F5 없이 반영됩니다. 끝난 NPU 정원 form은 제거하지만 다른 유효한 시간의 입력 초안은 보존합니다. 과거 신청 상세·활동 로그·과거 시간 필터는 이력 보존을 위해 남습니다.

## 13. Sheets read 횟수

| 흐름 | Sheets 읽기/쓰기 |
| --- | --- |
| board 첫 진입 | batchGet 1회, 추가 getConfig/회사별 조회 0회 |
| board revision 동일 | Script Properties만, Sheet/SpreadsheetApp/Lock I/O=0 |
| board revision 변경 | revision + aggregate batchGet 1회 |
| hidden board | 새 API 호출 0회 |
| shrink 검증 | 같은 lock 안에서 fresh aggregate batchGet 1회 |
| shrink 저장 | 정원 4행+이력 4행 atomic batchUpdate 1회 |

aggregate ranges는 NPU설정 A:D, 시간대별정원 A:G, 상담신청 A1:Q1(header), G2:G(providerId), I2:I(time), L2:L(status)입니다. 17열 전체 신청 값은 읽지 않습니다. snapshot context가 같은 시트/헤더 재조회를 막습니다. shrink 저장 과정의 audit header/행 위치/시트 메타데이터 확인은 별도로 필요합니다. 신규 보안·동시성 보호를 비용 때문에 제거하지 않았습니다. 데이터 양에 따른 선형 집계는 남으므로 실제 Google 부하/할당량은 운영 환경에서 확인합니다.

## 14. Sheet schema 변경

없음. 상담신청 17열, 시간대별정원 7열, 처리이력 13열, NPU설정 4열을 그대로 사용합니다.

## 15. migration

필요 없음. 새 migration 함수/새 Sheet/새 열을 만들지 않았습니다.

## 16. setup/auth 재실행

setupSystem/configureAuthentication/migrateBusinessMeetingV2/migrateBusinessMeetingV3를 이번 작업 때문에 실행하지 않습니다. 인증정보/서명키/DB ID/기존 세션을 초기화하거나 교체하지 않습니다. 이 코드 작업이 실제 Google Drive/Sheet 생성 또는 기존 DB 변경을 수행한 것은 아닙니다.

## 17. Apps Script 반영 파일

**Google에 기존 V3.1이 반영돼 있는 경우:** Code.gs / Schedule.gs / Revision.gs / Diagnostics.gs 전체 교체 + PublicBoard.gs 새 파일 추가.

**이전 로컬 V3.1 성능 변경을 아직 Google에 반영하지 않은 경우:** 위 다섯 파일에 Config.gs / Database.gs / Auth.gs도 함께 현재 로컬 내용으로 교체합니다. 새 Code는 V3.1의 API_VERSION/Diagnostics/경량 snapshot/세션 함수에 의존합니다. 따라서 이 경우 총 8개 파일을 함께 반영해야 합니다. Services/Setup/Migration/MigrationV3/appsscript.json 등 나머지 기존 V3 파일은 유지합니다.

SHEET_ID/TOKEN_SIGNING_SECRET/ADMIN_ID/ADMIN_PASSWORD_HASH/PROVIDER_CODE_*_HASH를 변경하지 않습니다. 기존 Sheets API 서비스와 권한을 사용하므로 새 서비스/권한 scope 추가가 없습니다. [V3.1 성능 적용 안내](communication-reliability.md)도 함께 참고하세요.

## 18. /exec 및 자산 버전

기존 runtime-config.js의 /exec URL을 변경하지 않았습니다. API_VERSION=2026-10-v3.1을 유지하고 새 API에도 같은 검사/metadata를 적용합니다. 누락/다른 API 버전은 잠금/읽기/쓰기 전에 API_VERSION_MISMATCH로 거절됩니다. 기존 r1의 동일한 API 계약 호출은 호환됩니다. BUILD_VERSION=2026-10-v3.1-r2로 올려 전체 13개 JS와 CSS를 갱신합니다. board.css도 같은 버전 query를 사용하며 board에서만 로드합니다. 홈의 GAS/adapter/PDF 호출 0회와 apply 최초 snapshot 1회, 로그인 1회 구조를 유지합니다.

## 19. npm test

기존 129개 유지 + 신규 16개 = **145개 통과**. 새 테스트는 기본시간/진행 신청 제한, 권한/GET/version 거절, 네 행 비활성화+네 이력 atomic 저장, schema/secrets 보존, 행 재사용, 두 admin/공통 잠금 경합, 실패 원자성, 3열 allowlist/PII 제외, zero-I/O revision, 최대 payload 크기, 상태별 집계·revision, snapshot 경쟁, cache 무효화, 쓰기 재시도 금지, read 1회 복구, mock 동등 동작을 확인합니다.

## 20. 브라우저 테스트

기존 6개와 신규 browser-schedule-board까지 **7개 검사 통과**. mock Google 서비스이며 실제 운영 Google DB/권한/CORS를 검증한 결과는 아닙니다.

- 관리자 축소 확인·진행 신청 거부·처리 버튼 잠금·응답 유실 시 한 번만 POST/최신 상태 확인.
- 두 관리자 탭이 같은 시간을 확인한 후 1회만 성공, 슬롯 한 개만 비활성화.
- 새창 opener/session/token 분리, 익명 집계, PII 없는 화면.
- 동일 revision 3회에 Sheet read 0/DOM 동일, pending은 확정에 미포함.
- 승인/확정 취소/정원/연장/축소 자동 반영, hidden 중지/visible 즉시 확인.
- 유효한 NPU 정원 초안 보존, 모든 역할에서 종료 시간 제거.
- 기본 4구간: 1366×768 / 1440×900 / 1920×1080 / 2560×1440 한 화면에 표시.
- 320/390px 모바일: 페이지 가로 넘침 없음, 표 내부 가로 스크롤.
- 6구간도 기본 행사장 1920×1080에 맞춰 밀도를 조정합니다. 더 많은 시간은 세로 스크롤이 필요할 수 있습니다.

[개인정보 없는 브라우저 결과](schedule-board-browser-results.json). 실행: npm start, npm test, node tests/browser-schedule-board.mjs. Playwright가 별도 환경에 있으면 PLAYWRIGHT_MODULE/BROWSER_CHANNEL을 지정합니다. 앱에 새 패키지/framework는 추가하지 않았습니다.

## 21. 실제 PC/스크린 확인 절차

1. Google 반영 후 로컬 backend를 임시 gas로 설정합니다. 테스트용 신청으로 관리자 연장 → pending/confirmed가 있는 시간 축소 거부 → 신청 취소/거절 → 축소 성공 → 4개 행 FALSE/4개 이력 → 재연장 시 같은 행 재사용을 확인합니다.
2. 두 관리자 탭에서 같은 마지막 시간의 확인창을 열고 적용하여 한 슬롯만 줄어드는지 확인합니다.
3. admin의 현황판 새창을 열고 URL에 token이 없고 새창 로그인 없이 집계만 표시되는지 확인합니다.
4. 모바일 ITS 신청 → PC NPU 승인 → board 확정 증가 → 취소 → 감소, 시간별 정원 변경 및 시간 연장/축소를 실제 Pages에서 확인합니다. 별도 새로고침 없이 다음 변경 확인(10초 간격)과 집계 조회가 성공한 뒤 반영되는지 확인합니다.
5. devtools에서 반복 요청은 getPublicBoardRevision, 변경 시만 getPublicBoard인지 확인합니다. 실제 CORS/ContentService redirect/Google 접근권한/할당량을 검사합니다. raw 개인정보/token을 포함한 HAR 대신 action/시간/횟수만 기록합니다.
6. 행사장 PC에서 board 새창을 해당 스크린으로 옮기고 브라우저 전체화면(F11)으로 띄웁니다. OS/브라우저 확대율·스케일을 기본으로 맞추고 네 회사 CI/모든 운영 시간/마감 색상/마지막 확인 시각을 확인합니다. 노트북 절전/스크린 잠금은 행사장 운영자가 설정합니다.
7. 네 스크린 해상도, 연결 끊김/복귀, hidden/visible 복귀를 점검합니다. 작업 후 로컬 backend:auto, performanceDiagnostics:false로 되돌립니다.

## 22. Apps Script → GitHub 배포 순서

1. 기존 Google 프로젝트에 17절의 변경 파일을 반영합니다. 새 프로젝트/DB를 만들거나 setup/auth/migration을 실행하지 않습니다.
2. 배포 → 배포 관리 → 기존 Web App 수정 → 새 버전 → 배포. 기존 실행 주체/접근 설정 및 /exec를 유지합니다.
3. 로컬 backend:gas에서 shrink/board 실제 연동을 확인합니다.
4. backend:auto로 복원합니다.
5. npm run sync-assets → npm run sync-assets -- --check → npm test.
6. 변경 파일 확인 → GitHub add/commit/push → 기존 Pages 배포 반영 확인.
7. 실제 행사 스크린에서 #board를 열고 21절 흐름을 확인합니다.

이번 작업에서는 로컬 코드와 테스트만 완료했습니다. Google 새 버전 배포보다 frontend push를 먼저 하면 새 API를 아직 지원하지 않는 서버에서 조회/축소 오류가 날 수 있으므로 위 순서를 지킵니다.
