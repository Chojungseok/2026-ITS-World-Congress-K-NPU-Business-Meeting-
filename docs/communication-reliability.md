# V3.1 성능·통신 안정성 변경 보고서

2026-10-08. 기준은 로컬 E:/2026/강릉 세계총회 K-NPU전환/Business meeting의 작업 전 커밋 0e1f4ebf89dfd75aab522c22a6560e273fa74043입니다. 원격 pull/reset/checkout으로 작업 내용을 덮어쓰지 않았습니다. 기존 화면·CSS·동의문·정원 0~2·관리자 시간 연장·거절 사유·ID 찾기·CI·PDF·권한·revision을 보존했습니다. 이번 작업은 로컬 구현/검증이며 Google 편집기와 운영 DB, GitHub 배포를 변경하지 않았습니다.

## 1. 실제 확인한 첫 로딩 병목

작업 전 bootstrap → app → api의 최상위 await가 GAS 어댑터 JS까지 다운로드해야 홈을 렌더했습니다. GAS HTTP 자체는 원래도 0회였지만 정적 모듈 의존성이 화면 표시를 지연했습니다. api를 지연 로드 facade로 바꾸어 첫 API 메서드 호출 때만 백엔드를 읽습니다. 홈에는 백엔드 JS, GAS, Sheet, revision 호출이 모두 없습니다. 입력 폼/로그인 폼은 서버 응답 전에 표시하며 오류가 나도 입력을 보존합니다.

실제 운영 공개 API만 읽어 getConfig 3,561/3,484ms, getAvailability 1,460ms, HTTP 200 JSON을 확인했습니다. 세 요청 모두 Google 리다이렉트 후 응답이 왔고 아직 apiVersion 메타데이터가 없었습니다. 이는 당시 배포된 기존 서버의 읽기 관측값입니다. 인증·쓰기·Google 서버 내부 시간이나 cold start의 원인을 측정한 결과는 아닙니다. 샘플 3개로 지연 분포를 판단하지 않았습니다. [개인정보 없는 공개 API 관측](communication-live-public.json).

## 2. submitRequest 병목

기존 신청 검증은 상담신청 A:Q 17열 전체를 읽었고, 성공 후 불필요한 availability snapshot을 추가 조회했습니다. pending은 정원을 예약하지 않으므로 성공 후 최신 revision 확인만 수행합니다. 기존 필수 중복/정원/활성/시간/동의 검증과 atomic 요청+이력 저장, 서버 ID/시각 생성, revision 발행은 그대로입니다.

## 3. NPU 로그인 병목

authenticateProvider → getProviderRequests의 순차 HTTP 2회가 필요했습니다. 선택 인자 includeInitialData:true로 인증+token+첫 snapshot을 한 HTTP에 받습니다. 선택 인자가 없으면 기존 token 문자열 계약을 유지합니다. 유효하게 발급된 token을 재검증한 뒤 해당 회사 데이터만 반환합니다. 첫 데이터 읽기에 실패하면 token과 안전한 initialDataError를 반환하고 화면은 같은 token으로 조회를 다시 합니다. 인증 요청을 재전송하지 않습니다.

## 4. 관리자 로그인 병목

authenticateAdmin → getAdminOverview의 순차 HTTP 2회를 includeOverview:true를 사용한 1회로 합쳤습니다. 기존 overview의 requests/history/providers/config/revision 필드를 유지합니다. 인증 없는 전체 목록 경로를 추가하지 않았습니다.

## 5. NETWORK_ERROR 후보와 수정

기존에는 fetch 실패와 AbortController timeout을 NETWORK_ERROR로 합쳐 원인을 분리할 수 없었습니다. NETWORK_TIMEOUT, NETWORK_FETCH_FAILED, HTTP_ERROR(status), INVALID_RESPONSE, API_VERSION_MISMATCH, SERVER_BUSY로 구별합니다. 기존 45초를 유지하며 읽기 재시도와 backoff까지 같은 총 시간 예산에 포함합니다. timeout 자체는 자동 재시도하지 않습니다.

실제 간헐적 장애의 단일 원인은 아직 확정할 수 없습니다. 네트워크/CORS/Google 접근권한·HTML 응답/502·503/잠금 경합/클라이언트·서버 버전 불일치를 분리해서 관측할 수 있게 했습니다. 원시 exception/stack, URL, 입력 본문은 진단 로그에 기록하지 않습니다.

## 6. POST 오류의 실제 발생 경로

기존 Code.gs에서는 GET이 getConfig/getAvailability/getAvailabilityRevision 이외 action으로 들어오면 METHOD_NOT_ALLOWED와 “POST 요청이 필요합니다”가 발생했습니다. 이 조건을 테스트로 재현했습니다. 현재 브라우저는 로그인·신청·관리자 조회를 POST로 보냅니다. 운영의 잘못된 GET authenticateAdmin 무인증 관측은 15초 응답을 얻지 못했으므로 그 장애의 실제 서버 오류 코드를 단정하지 않습니다.

신버전 서버는 method 검사 전에 apiVersion을 확인합니다. 오래 열린 탭/누락 버전은 API_VERSION_MISMATCH로 실행 전 차단합니다. 같은 버전의 잘못된 method는 요청 형식과 새로고침 안내를 반환합니다. ContentService의 최종 콘텐츠 리다이렉트 GET은 원래 action을 다시 실행하는 GET이 아닙니다. redirect:follow를 유지합니다. [Google ContentService 공식 설명](https://developers.google.com/apps-script/guides/content).

## 7. API_VERSION

frontend build-version.js의 API_VERSION과 Config.gs의 KN.apiVersion은 2026-10-v3.1입니다. GET query/POST body에 항상 apiVersion을 보내고 성공/실패 응답 meta.apiVersion을 검증합니다. 서버는 잠금/인증/DB 조회/쓰기 전에 검사합니다. 잘못된 JSON에는 BAD_REQUEST와 같은 서버 버전을 반환합니다.

버전 오류는 자동 재전송/자동 reload하지 않습니다. “새 버전 불러오기”는 사용자가 한 번 누를 때 HTML URL에 갱신 query를 붙여 같은 route를 새로 읽습니다. 따라서 무한 reload가 없습니다. 버전 없는 구서버가 이미 쓰기를 했을 가능성은 uncertain 결과로 안내합니다. 새서버의 명시적인 실행 전 버전 거절은 uncertain으로 표시하지 않습니다.

## 8. cache busting

BUILD_VERSION은 assets/js/build-version.js 한 곳에서 관리합니다. 변경 시 npm run sync-assets를 실행하면 index.html의 CSS/bootstrap와 모든 13개 JS 모듈의 import map query가 같은 버전으로 생성됩니다. app만 버전을 붙이고 하위 모듈은 남겨두는 방식을 사용하지 않습니다. Node import 경로는 유지했습니다. [HTML import map 표준](https://html.spec.whatwg.org/multipage/webappapis.html#import-maps).

npm run sync-assets -- --check는 생성 파일 및 client/GAS API_VERSION 일치도 검사합니다. 별도 bundler나 framework를 추가하지 않았습니다. API 계약을 변경할 때만 API_VERSION을 양쪽에서 바꾸며, 일반 정적 파일 변경은 BUILD_VERSION만 올립니다. 최신 import map 지원 브라우저를 사용합니다.

## 9. 첫 화면 asset 최적화

공통 app.js만 modulepreload합니다. 동일 최종 코드에서 preload 제외 Home ready 중앙값 299ms, 포함 265.9ms로 관측했습니다. 20ms 정적 응답 지연을 넣은 로컬 비교이며 실제 모든 네트워크의 개선을 보장하는 수치는 아닙니다. PRELOAD_APP 설정도 버전 파일에서 관리합니다. backend/숨긴 route/PDF/큰 이미지 preload는 없습니다.

Home JS: 10 → 11개. 버전/진단 작은 모듈은 추가됐고 GAS 어댑터의 필수 초기 로드는 제거됐습니다. 초기 전체 리소스 16 → 17개, PDF 0회, 홈에 표시하는 CI SVG 4개입니다. 전체 요청 수가 감소했다고 주장하지 않습니다. preconnect/dns-prefetch는 실제 DNS/TLS 효과를 분리해 측정하지 못해 추가하지 않았습니다.

## 10. 로그인 HTTP 전후

NPU 2 → 1, 관리자 2 → 1입니다. 로그인 입력 화면 진입의 공개 getConfig는 별도이며 제출 이후 ready까지 센 값입니다. 여기서 HTTP count는 GAS action 왕복 수입니다. Google ContentService의 중간 리다이렉트 hop은 별도 네트워크 요청입니다.

## 11. submit Sheet read 전후와 데이터 증가

검증용 기존 신청: A:Q 전체 → C/F/G/I/L 5열. A1:Q1 header는 같은 batch에서 검사합니다. NPU설정/시간대별정원도 그 batchGet에 포함하고 요청별 validated context를 재사용합니다. 현재도 신청 저장 전에 audit header 확인/행 위치 메타데이터 읽기는 필요합니다.

- submit API 자체: batchGet 1 → 1, 기존 신청 행의 열 수 17 → 5(약 71% 감소).
- 화면 제출+후속 동기화: batchGet 2 → 1. 200개 fixture의 실제 셀 수 4335 → 1161.
- NPU 목록: providers/requests/capacities 한 batch. 요청 17열을 서버에서 읽고 token 회사로 필터 후 반환합니다.
- admin overview: requests 17열/history 13열/providers 4열/capacities 7열을 한 batch로 읽습니다. 동일 시트를 재조회하지 않습니다.
- ID finder: 기존 requests 17열 한 batch를 유지합니다. 네 항목 본인확인/시도 제한/최소 결과만 반환합니다.

Sheet 기반 검증·목록·ID 찾기는 행 수에 대한 선형 읽기가 남아 있고 admin은 전체 데이터를 요구합니다. 무한 데이터에서도 일정 시간이라고 주장하지 않습니다. 실운영 1,000/10,000행 부하와 목록 표시 비용을 확인한 뒤 서버 권한을 유지하는 페이지 조회/필요 열 축소를 별도 검토해야 합니다.

## 12. ScriptLock 범위

쓰기 5종은 동일 ScriptLock과 최신 DB 재검증을 유지합니다. 로그인 lock은 실패 counter/credential/token/session 속성 기록까지입니다. NPU 최초 snapshot은 해제 후 읽습니다. NPU 활성 설정은 인증 때 작은 4행을 읽고 해제 후 snapshot에서 다시 검증하므로 batchGet 2회가 유지됩니다. 보안 검사를 없애서 읽기 1회라고 보고하지 않습니다.

관리자 인증 lock과 overview snapshot lock은 분리되어 acquire/release/acquire/release 순서입니다. overview의 네 시트 일관성 확보를 위한 짧은 read lock은 유지하고, 집계/정렬/응답 구성은 해제 후 수행합니다. 기존 lookup/ID finder 시도 제한과 logout lock도 유지합니다.

## 13. safe retry 대상

getConfig/getAvailability/getAvailabilityRevision/getProviderRevision/getAdminRevision/getProviderRequests/getAdminRequests/getAdminOverview에만 fetch 실패·502·503·서버 BUSY 시 250~500ms backoff 후 최대 1회 재시도합니다. protected read는 여전히 POST+정상 token이 필요합니다. 버전/잘못된 JSON/인증 거절/timeout/500은 자동 재시도하지 않습니다.

## 14. retry 금지 대상

submitRequest/decideRequest/cancelRequest/extendSchedule/updateProviderCapacity, authenticateProvider/authenticateAdmin/logout, findRequest/findRequestIds는 자동 재실행하지 않습니다. 본인확인 read도 시도 제한을 변경하므로 제외했습니다. 쓰기의 transport/HTTP/형식/INTERNAL 실패는 이미 반영됐을 수 있는 uncertain으로 표시합니다.

## 15. 오류 UX와 polling

읽기 화면에 “다시 시도”, apply의 상담 시간 재조회, NPU 로그인 기업 설정 재조회를 제공합니다. route/session/입력 초안은 보존합니다. 신청 응답 유실은 신청 ID 찾기 링크를 제공하고, 승인/정원/연장 응답 유실은 보호된 최신 snapshot, 취소 응답 유실은 ID+이메일 조회로 결과를 확인합니다.

로그인 중/신청 접수 중 안내를 표시하고 user action 동안 timer를 중단합니다. 기존 in-flight 응답은 generation 검사를 통해 새 UI를 덮어쓰지 못합니다. 성공한 NPU/admin 변경은 기존 강제 snapshot의 revision을 받아 한 번 동기화하며, pending 신청은 Sheet I/O 없는 availability revision을 한 번 확인합니다. action 후 기존 5초/10초 polling을 재개합니다. offline/hidden에서는 중단하고 online/visible 복귀 시 즉시 변경을 확인합니다.

## 16. frontend 변경 파일

수정: index.html, assets/js/api.js, app.js, gas-api.js, bootstrap.js, runtime-config.js, package.json. 추가: assets/js/build-version.js, performance.js, scripts/sync-assets.mjs. views.js/config.js/session-store.js/mock-api.js/CSS/CI/PDF는 보존했습니다. 기존 브라우저 fixture는 version query와 새 API metadata/왕복 횟수에 맞게 갱신했습니다.

## 17. Apps Script 변경 파일

전체 교체: Config.gs / Code.gs / Database.gs / Auth.gs. 새 파일: Diagnostics.gs. Services.gs / Revision.gs / Schedule.gs / Setup.gs / Migration*.gs / appsscript.json은 변경하지 않았습니다. Google 프로젝트에는 이 다섯 파일만 반영하면 됩니다.

## 18. Sheet migration

이번 V3.1에는 필요 없습니다. 상담신청 17열/시간대별정원 7열/처리이력 13열/NPU설정 4열 모두 그대로입니다. 기존 V3 시간·정원·신청·이력을 변경하는 setup/migration은 실행하지 않습니다.

## 19. Script Properties와 session 비용

SHEET_ID/TOKEN_SIGNING_SECRET/ADMIN_ID/ADMIN_PASSWORD_HASH/PROVIDER_CODE_*_HASH 변경은 필요 없습니다. KNPU_SESSION_INDEX_V1은 서버가 자동 생성하는 작은 파생 인덱스입니다. 첫 로그인/누락·손상 시 SESSION_*를 읽어 복구하고 이후 login에서는 getProperties 전체 scan이 없습니다. 로그인 한 번에 만료 세션 정리는 최대 10개입니다. 인덱스가 쓰기 도중 손상될 경우 먼저 무효화하여 다음 요청이 실제 SESSION_*에서 복구합니다.

200 활성 세션 제한/30분 만료/HMAC/role/providerId 검증/로그아웃 즉시 폐기/SESSION_* 일치 확인은 유지합니다. 인덱스는 인증의 근거가 아닙니다. 200개 인덱스는 약 8.6KB이며 [Google의 속성 값 9KB 한도](https://developers.google.com/apps-script/guides/services/quotas) 내에서 관리합니다. 인덱스 자체는 운영자가 수동 편집하지 않습니다.

선택 진단: Script Property PERFORMANCE_DIAGNOSTICS=true, 로컬 runtime-config.js의 performanceDiagnostics:true. 기본값은 둘 다 비활성입니다. 진단은 action/method/정해진 버전/elapsed/lock 대기·보유/snapshot/write/business만 기록합니다. frontend bootstrap/route/GAS action 시간도 같은 방식으로 수집합니다. 이름/전화/이메일/상담내용/token/code/password/신청ID/Sheet ID를 기록하지 않습니다. backend businessMs는 총 시간에서 wait/snapshot/write를 뺀 나머지로 Properties·인증·변환 비용도 포함합니다. 진단 후 속성을 제거하거나 false로 돌립니다.

## 20. setupSystem 재실행

필요 없습니다. 이번 작업은 실제 Drive/Sheet를 생성하지 않았으며 생성된 것으로 가정하지 않습니다.

## 21. configureAuthentication 재실행

필요 없습니다. 재실행하면 기존 session을 폐기하므로 이번 성능 갱신을 위해 실행하지 않습니다. 인증정보 교체는 별도의 운영 작업입니다.

## 22. /exec URL

runtime-config.js의 기존 URL을 그대로 유지했습니다. 새 Web App을 만들지 않고 기존 배포를 새 버전으로 수정합니다.

## 23. npm test

기존 103개 + 신규 26개 = 129개 통과. 신청/중복/최후 자리 경쟁/취소 정원 반환/본인 이메일/역할/거절 사유/정원/시간 연장/revision/캐시/수식 방지/원자적 이력 검증을 유지합니다. 버전 metadata로 늘어난 revision 응답 크기 기준은 100 → 150byte로 갱신했습니다. 검증 항목을 삭제하지 않았습니다.

## 24. 신규 테스트와 브라우저 결과

communication.test.mjs: 버전 검사 선행, method allowlist, 5열 batch, 인증+initial snapshot/lock 범위/실패 fallback, 진단 무개인정보, 세션 200개/30분/logout/index 복구, fetch/502/503/BUSY 1회 retry, 쓰기·인증·본인확인 재실행 금지, timeout/JSON/HTTP/버전 분류, asset 전체 버전 검사.

browser-communication.mjs: 홈 GAS/adapter/PDF 0, JS query version, 503 복구, JSON 오류 수동 복구와 draft, 1HTTP provider login, action 중 polling 0, offline/online, 저장 후 응답 유실의 신청/승인/취소 재조회, 오래 열린 NPU/admin/submit 탭 버전 오류. ContentService와 같은 POST→303→다른 origin JSON 경로는 실제 로컬 echo 서버로 모의합니다. 운영 Google 서버의 CORS를 검증한 것으로 해석하지 않습니다.

기존 browser-gas-smoke / browser-performance / browser-revision / browser-business-v2 / browser-business-v3도 통과했습니다. V3 화면 너비 320/360/390/430/768/1024/1280/1440/1920, popups, CI 대체, 원본 PDF 클릭, 자동 시간 연장 반영을 유지합니다.

## 25. 전후 성능 수치

**Google 실제 latency가 아닌 로컬 Google service doubles 측정입니다.** 실제 전후 repository 코드를 브라우저에서 실행했습니다. 200개 합성 신청+이력, desktop 1440×1000, 흐름당 새 context 3회 중앙값, 정적 응답 20ms/API 100ms 고정 지연. 충돌이 없는 lock wait는 모형상 0입니다. frontend elapsed는 측정 시작부터 후속 요청 정리까지, ready는 화면 usable/제출 dialog 시점입니다. login 시점은 입력 완료 뒤 버튼 클릭 직전입니다. payload는 해당 흐름의 JSON 응답 합계이며 진단 meta.timing이 없는 운영 모드입니다. PII/실제 token/신청ID는 측정 파일에 저장하지 않습니다.

| 흐름 | frontend elapsed ms 전→후 | ready ms 전→후 | GAS HTTP 전→후 | batchGet 전→후 | lock wait ms 전→후(모형) | payload byte 전→후 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 336.6 → 273.2 | 328.9 → 265.9 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| Apply | 454.7 → 472.5 | 453 → 471.1 | 1 → 1 | 1 → 1 | 0 → 0 | 1693 → 1730 |
| Submit | 306.9 → 292.8 | 257.7 → 244.4 | 2 → 2 | 2 → 1 | 0 → 0 | 2247 → 697 |
| Provider login | 386.6 → 268.5 | 385.5 → 267.7 | 2 → 1 | 2 → 2 | 0 → 0 | 100337 → 100395 |
| Admin login | 392.6 → 324.6 | 391.5 → 323.6 | 2 → 1 | 1 → 1 | 0 → 0 | 164460 → 164497 |
| Provider refresh | 159.3 → 176.8 | 157.9 → 175.5 | 1 → 1 | 1 → 1 | 0 → 0 | 100124 → 100158 |
| Admin overview | 179.2 → 184.7 | 178.1 → 183.7 | 1 → 1 | 1 → 1 | 0 → 0 | 164255 → 164289 |

Apply 및 수동 provider/admin 읽기 경로는 같은 HTTP/Sheet I/O를 유지합니다. 일부 ready 수치는 증가했습니다. 이 3회 모형 결과로 모든 흐름의 개선이나 실제 Google 지연 개선을 확정하지 않습니다. 효과가 분명한 것은 로그인 왕복 제거와 submit의 읽기량 감소입니다. [전체 샘플·asset 목록·셀 수](communication-performance.json).

재현: npm start 실행 후 아래 브라우저 명령을 순서대로 실행합니다. Playwright가 환경에 있으면 PLAYWRIGHT_MODULE/BROWSER_CHANNEL을 지정합니다. Node 앱 의존성은 추가하지 않았습니다.

- npm test
- npm run sync-assets -- --check
- node tests/browser-gas-smoke.mjs
- node tests/browser-performance.mjs
- node tests/browser-revision.mjs
- node tests/browser-business-v2.mjs
- node tests/browser-business-v3.mjs
- node tests/browser-communication.mjs
- node tests/measure-communication.mjs

## 26. 실제 Google 환경에서 확인할 항목

운영 담당자의 기존 Google 프로젝트 배포가 아직 필요합니다. 공개 읽기 외 인증/신청/실제 Sheet 쓰기/실기기 동시성을 이번 작업에서 실행하지 않았습니다. 재배포 후 테스트용 신청으로 다음을 확인합니다.

1. 배포 응답 meta.apiVersion=2026-10-v3.1. Apps Script 실행 기록의 debug action/단계 시간만 확인합니다.
2. 실제 GitHub Pages origin에서 GET/POST/ContentService redirect/JSON/CORS가 성공하는지, 로그인 HTML/502·503이 없는지 확인합니다.
3. 모바일 신청 → PC admin 확인 → 해당 NPU 승인 → 다른 기기 확정 확인 → 취소 후 정원 반환.
4. 마지막 1자리 동시에 2건 승인 시 1건만 확정, 타사 token 및 무인증 admin 접근 차단, ID-only 조회 차단.
5. 두 기기의 시간 연장/정원 수정/거절 사유와 revision 반영. 기존 old tab은 업데이트 안내, 새 페이지는 정상 접근.
6. action별 적어도 10회 client elapsed/server elapsed/lockWait/snapshot/write/응답 크기 기록. 유휴 이후 첫 호출과 연속 호출을 구분합니다. 정상 응답이 45초에 가깝다면 server 단계/경합/Google 할당량을 분석합니다.
7. 1,000/10,000개 비공개 테스트 행에서 submit/provider/admin/ID finder 비용 및 Google 실행·Properties·Sheets 할당량을 확인합니다. 타임아웃을 늘려 숨기지 않습니다.

## 27. Apps Script 재배포 순서

현재 V3 운영 DB 기준입니다. 새 프로젝트/Sheet/배포를 생성하거나 setup/auth/migration을 실행하지 않습니다.

1. 기존 Google Apps Script 프로젝트를 엽니다.
2. 저장소 Config.gs/Code.gs/Database.gs/Auth.gs 전체 내용으로 같은 파일을 교체합니다.
3. 파일 옆 + → 스크립트 → Diagnostics를 만들고 Diagnostics.gs 전체 내용을 복사합니다. 기존의 다른 파일/manifest/Script Properties는 유지합니다.
4. 저장합니다. 선택 진단을 사용할 때만 PERFORMANCE_DIAGNOSTICS 속성을 true로 설정합니다.
5. 배포 → 배포 관리 → 기존 Web App → 수정(연필) → 버전: 새 버전 → 배포. 기존 실행 주체/접근 설정을 유지합니다.
6. 같은 /exec에 getConfig와 apiVersion=2026-10-v3.1을 보내 meta.apiVersion을 확인합니다. 오래 열린 기존 사이트가 버전 안내를 보이는 것은 안전한 전환 동작입니다.
7. 로컬에서 runtime-config.js backend를 임시 gas로 바꾸어 새 코드의 역할별 흐름과 실제 Sheet 반영을 테스트합니다. Google DB/인증은 운영자가 직접 준비합니다. 테스트 후 backend:auto, performanceDiagnostics:false로 되돌립니다.

## 28. GitHub push 순서

**Google 새 버전 배포 완료 → 로컬 GAS 검증 → frontend GitHub push → Pages 반영 확인**입니다. GitHub만 먼저 업데이트하면 구서버 응답 버전 부재로 안내가 나옵니다. 이번 작업에서는 push/commit/Google 배포를 실행하지 않았습니다.

build-version.js 한 곳의 BUILD_VERSION을 새 배포 값으로 관리하고 npm run sync-assets → npm run sync-assets -- --check → npm test를 실행합니다. 그 다음 변경 파일을 검토하여 add/commit/push하고 기존 Pages의 main/root 배포를 기다립니다. URL을 새로 만들지 않습니다. 모바일/PC 테스트 뒤 debug 설정은 false로 유지합니다. [초보자 운영 안내](../apps-script/README.md).
