# K-NPU 성능 개선 보고서

대상: Chojungseok/2026-ITS-World-Congress-K-NPU-Business-Meeting-
기준 커밋: a9f7de75fb52448b2ab43649ac236893f84432fc
작성: 2026-10-07

기존 화면, 해시 경로, 기능, 운영 Web App URL, Google Sheets 스키마를 유지했습니다. 이번 변경은 로컬에서 검증했으며 **Google Apps Script 새 버전 배포와 GitHub push는 수행하지 않았습니다.** 운영 환경의 개선 후 응답시간은 아직 측정하지 않았습니다.

## 1. 실제 확인한 병목

- 모든 GAS 화면 진입에서 getConfig를 먼저 기다려 home까지 서버 응답에 종속되었습니다.
- apply는 진입 config 뒤 availability/config를 함께 읽어 총 3회, NPU/matching은 진입 config 뒤 목록/config로 3회, admin은 config/overview로 2회 호출했습니다.
- 15초 갱신 때 NPU/admin 화면을 다시 만들며 같은 설정 조회가 반복되었습니다.
- 모든 서버 API가 동일 ScriptLock을 획득해 단순 조회도 변경 작업과 대기했습니다.
- rows_/table_을 부를 때마다 헤더, 마지막 행, 시트 데이터를 다시 읽었습니다. 같은 요청 안에서 provider_/slot_/config_가 중복 조회했습니다.
- 공개 설정에 대한 서버 캐시가 없었습니다.

실제 기존 /exec에서 공개 GET을 각각 한 번 측정했을 때 getConfig는 **4,134ms**, getAvailability(deepx)는 **4,499ms**였고 HTTP 200/ok:true였습니다. 이는 네트워크·Google 실행 시작 비용 등이 포함된 변경 전 단일 표본입니다. 평균이나 개선 후 속도, Sheets I/O만의 비용을 뜻하지 않습니다. 운영 개인정보나 인증 API는 이 계측에 사용하지 않았습니다.

## 2. 주요 화면의 GAS 호출 수

변경 전은 기준 커밋의 호출 경로를 분석한 값, 변경 후는 실제 프론트엔드와 GAS 서비스 모형을 연결한 Playwright 계측 결과입니다. API 동작 1회를 세며 Google 응답 리다이렉트는 별도 API로 중복 계산하지 않습니다. 사용자 추가 클릭이나 다음 polling은 제외합니다.

| 화면/동작 | 변경 전 | 변경 후 | 변경 내용 |
| --- | ---: | ---: | --- |
| home 진입 | 1 | **0** | 즉시 표시 |
| apply 최초 진입, config 캐시 없음 | 3 | **2** | 폼 즉시 표시, config/availability 병렬 |
| apply 재진입, 유효 config 캐시 있음 | 3 | **1** | availability만 조회 |
| lookup 조회 전 진입 | 1 | **0** | 입력 UI만 표시 |
| lookup ID+이메일 제출 | 1 | **1** | 본인확인 유지 |
| NPU 로그인 화면, config 캐시 없음 | 1 | **1** | 로그인 폼을 먼저 표시, 비동기 공개 설정 |
| NPU 로그인 화면, config 캐시 있음 | 1 | **0** | 캐시 재사용 |
| NPU 로그인 제출→목록 표시 | 4 | **2** | 인증 + 본인 목록/config 포함 응답 |
| 로그인한 NPU 목록 진입 | 3 | **1** | 목록 응답으로 공개 설정도 갱신 |
| matching 진입 | 3 | **1** | 같은 기업 조회 재사용 |
| 관리자 로그인 화면 진입 | 1 | **0** | 설정 불필요 |
| 관리자 로그인 제출→대시보드 | 3 | **2** | 인증 + overview |
| 관리자 dashboard 진입 | 2 | **1** | overview에 공개 설정 포함 |

로그인 제출 행은 로그인 화면 진입 때의 호출을 더하지 않은 수입니다. lookup에 이전 조회 결과가 있으면 재진입 시 본인확인 1회가 추가됩니다. config 만료 시 1회 다시 읽습니다. 비활성 기업 때문에 최초 선택을 교체하거나 재시도하는 예외 흐름에는 추가 availability가 발생할 수 있습니다. 이전 GAS 배포와 새 프론트엔드를 섞으면 NPU 설정을 한 번 더 읽을 수 있으므로 서버부터 갱신합니다.

### Polling

기본 주기는 **15초 → 30초**입니다.

| 활성 화면 | 이전 1회 갱신 요청 | 이후 1회 갱신 요청 |
| --- | ---: | ---: |
| apply | 2 | 1: availability |
| 조회를 마친 lookup | 1 | 1: findRequest |
| 로그인한 NPU/matching | 3 | 1: getProviderRequests |
| 로그인한 admin | 2 | 1: getAdminOverview |

home, 빈 lookup, 로그인 전 화면에서는 polling하지 않습니다. 숨겨진 탭, 초기 로딩, 처리 중인 동작, 편집 중인 NPU 정원/필터 등은 기존 입력 보호 규칙으로 갱신을 미룹니다. 수동 새로고침도 같은 화면의 진행 중 요청을 공유합니다. 변경 완료 후 강제 갱신은 이전 조회보다 우선하고 늦은 이전 응답은 표시를 되돌리지 못합니다.

데이터가 같으면 DOM 교체를 생략합니다. 바뀌면 목록/통계/시간표 등 필요한 영역만 갱신하며 NPU 상태 탭, 미저장 정원, 관리자 필터, ITS 입력값을 유지합니다.

## 3. Google Sheets 읽기 감소

실제 .gs 소스를 Google 서비스 모형에서 실행하고 합성 신청 200건과 이력 200건을 만든 뒤 서비스 호출 횟수를 측정했습니다. 실제 Google 서버의 시간 측정이나 HTTP 요청 수가 아닙니다. 아래 이전 값은 헤더 읽기를 포함한 getValues 횟수입니다.

| API | 이전 getValues | 이후 값 읽기 | 이후 잠금 |
| --- | ---: | --- | --- |
| getConfig, 서버 캐시 없음 | 4 | batchGet 1회 | 없음 |
| getConfig, 서버 캐시 적중 | 4 | **0회** | 없음 |
| getAvailability | 6 | batchGet 1회 | 없음 |
| getProviderRequests, 공개 config 포함 | 4 | batchGet 1회 | 없음 |
| getAdminOverview | 8 | batchGet 1회 | snapshot 구간만 |
| submitRequest | 12 | batchGet 1회 + 이력 헤더 1회 | 유지 |
| decideRequest | 8 | batchGet 1회 + 이력 헤더 1회 | 유지 |
| cancelRequest | 6 | batchGet 1회 + 이력 헤더 1회 | 유지 |
| updateProviderCapacity | 8 | batchGet 1회 + 이력 헤더 1회 | 유지 |

- 요청별 database context가 읽은 행·시트·헤더 검증을 기억합니다. 같은 요청의 provider_/slot_/confirmed_/config_는 그 배열을 재사용합니다.
- 필요한 시트는 요청 시작 시 batchGet으로 한 번에 읽습니다. 헤더도 같은 응답에 포함하여 검증합니다. 검증을 생략하거나 영구 캐시하지 않습니다.
- availability는 신청의 providerId(G열), time(I열), status(L열)와 헤더만 읽습니다. 연락처/이메일/상담내용 데이터는 읽지 않습니다.
- 쓰기와 이력은 기존처럼 batchUpdate 한 번으로 함께 기록합니다. 이력을 추가할 때 필요한 헤더/끝 행 조회는 남겨 두었습니다.
- 순수 읽기에서는 SpreadsheetApp.openById/getLastRow 호출도 없어졌습니다. 정원 변경 등의 쓰기는 기존 쓰기 경로를 유지합니다.

서비스 호출 최소화·일괄 처리·단기 캐시는 [Apps Script 공식 성능 권고](https://developers.google.com/apps-script/guides/support/best-practices)를 따릅니다. [batchGet](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet)은 여러 범위를 한 번에 읽지만 서로 다른 시트의 트랜잭션 격리를 보장한다고 가정하지 않았습니다.

## 4. 잠금과 보안

- 신청·승인·거절·취소·정원 변경은 **같은 ScriptLock 안에서 최신 DB 읽기→검증→신청/정원과 이력의 일괄 쓰기**를 수행합니다.
- 정원의 마지막 자리 동시 승인, 정원 축소와 승인, 취소와 승인 간 임계 구역은 유지했습니다.
- 인증/로그아웃/ID+이메일 조회는 세션 또는 시도 제한 상태도 갱신하므로 잠금을 유지합니다.
- 공개 조회, 인증 후 NPU 본인 목록, 관리자 단일 목록의 불필요한 잠금은 제거했습니다.
- 관리자 overview의 네 시트 batchGet은 동일 잠금 아래에서 읽습니다. 읽은 배열의 정렬·집계·응답 생성은 잠금 해제 후 진행하여 점유 시간을 줄입니다.
- 잠금 없는 공개 집계는 표시용입니다. 승인/신청 판단에 재사용하지 않습니다. 시트 직접 편집은 Apps Script 잠금을 따르지 않으므로 운영 상태/정원 변경은 앱을 이용합니다.
- Auth.gs, 역할/기업 격리, HMAC token, 만료·폐기, ID+이메일, 동의 버전 확인을 변경하지 않았습니다.
- 개인정보 목록은 인증 후에만 반환합니다. 공개 config 캐시에는 기업명·시간·정원·운영여부·개인정보 안내만 보관합니다.
- 신청 내용은 화면에 필요한 동안만 메모리에 존재하며 localStorage나 공용 CacheService에 저장하지 않습니다. 세션 토큰은 기존 sessionStorage 방식입니다.
- 토큰은 POST 본문에만 전달합니다. 기존 text/plain JSON, CORS, 리다이렉트, 오류 처리와 쓰기 자동 재시도 금지를 유지했습니다.

## 5. 캐시 정책

| 위치 | 대상 | 수명 | 갱신/무효화 |
| --- | --- | --- | --- |
| gas-api.js | 공개 config | 30초, 메모리만 | 만료, 정원 변경 전후, 인증된 조회의 새 공개 config |
| GAS Script Cache | 공개 config | 30초 | 정원/기업 설정 쓰기 전후, 수동 refreshPublicConfig, 안내 속성 불일치 |
| 요청별 database context | 이번 요청의 시트 행/헤더 | 해당 요청만 | 다음 API는 새로 읽음 |

동시에 발생한 getConfig는 하나의 Promise를 공유합니다. 실패 응답은 캐시하지 않습니다. 정원 변경 응답이 유실되어도 캐시를 비웁니다. 서버의 공개 설정 키에는 변경 세대가 포함되고, 클라이언트도 세대를 확인하므로 변경 전 늦은 응답이 새 캐시를 덮어쓰지 않습니다.

기업/운영여부를 시트에서 수동 변경한 경우 Apps Script 편집기에서 **refreshPublicConfig()**를 실행합니다. 공개 API/자동 트리거를 추가하지 않았습니다. 수동 함수를 생략하면 서버 TTL에 따라 갱신되며 브라우저 캐시까지 겹칠 경우 설정 표시는 약 60초 늦을 수 있습니다. 이미 열려 있는 브라우저의 즉시 확인은 페이지 새로고침으로 합니다.

PRIVACY_NOTICE_VERSION/PRIVACY_RETENTION_TEXT는 서버 캐시 적중 시에도 Script Properties의 현재 값과 비교합니다. 브라우저 캐시에 남은 안내는 30초 캐시 또는 페이지 새로고침 후 바뀌고, 실제 제출 시 서버가 버전을 재검증합니다. CacheService가 조기 만료하거나 get/put에 실패하면 DB 읽기로 처리합니다. [공식 CacheService 설명](https://developers.google.com/apps-script/reference/cache).

## 6. 수정 파일과 GitHub 반영 대상

다음 **17개 파일 전체**를 같은 변경으로 반영합니다. 테스트/문서는 Pages 동작 파일은 아니지만 재현 가능한 저장소 상태를 위해 함께 커밋합니다. artifacts의 결과 파일과 임시 도구는 gitignore 대상이며 올리지 않습니다.

| 파일 | 변경 |
| --- | --- |
| assets/js/app.js | 즉시 화면 표시, 중복 설정 조회 제거, 선택적 polling/부분 갱신, 늦은 응답 보호 |
| assets/js/gas-api.js | 공개 config TTL·Promise 공유·무효화, 호환 응답 해제 |
| assets/js/runtime-config.js | polling 30초. 기존 gasUrl 유지 |
| assets/js/views.js | 기존 기업 선택/동의문 일부 재사용, lookup 서버 기업명 표시 |
| apps-script/Code.gs | 읽기/쓰기 잠금 분리, 필요한 snapshot 선언, 호환 config 응답 |
| apps-script/Database.gs | batchGet·요청별 재사용·헤더 검증·공개 캐시·최소 열 집계 |
| apps-script/Services.gs | 제출 시 안내 검증을 위해 불필요한 전체 config 읽기 제거 |
| apps-script/Config.gs | 공개 캐시 TTL 30초 |
| apps-script/Setup.gs | 새 DB context와 기존 setup 호환, 운영자 캐시 갱신 함수 |
| tests/gas-harness.mjs | batchGet 모형, 읽기/잠금 계측, 이전 소스 비교 지원 |
| tests/performance.test.mjs (신규) | 캐시·무효화·잠금·snapshot 회귀 테스트 12개 |
| tests/browser-performance.mjs (신규) | 화면별 호출 수·지연 로딩·부분 갱신·승인 응답 경합 검사 |
| tests/measure-performance.mjs (신규) | 합성 신청 200건으로 기준 커밋 대비 I/O 횟수 비교 |
| README.md | 현 상태·30초 갱신·검증 결과와 문서 연결 |
| apps-script/README.md | 기존 운영 배포 갱신·캐시·실기기 안내 |
| docs/google-apps-script-integration.md | 유지된 API와 새 snapshot/잠금/캐시 계약 |
| docs/performance-optimization.md (신규) | 이 보고서 |

api.js의 유일 진입점 설계, mock-api.js, Auth.gs, CSS, index.html, appsscript.json은 그대로입니다. 패키지·인프라·Google Sheets 열 변경은 없습니다.

## 7. 검증 결과와 재현

- **npm test: 55개 통과, 0 실패**. 기존 43개 모두 유지, 성능 검사 12개 추가.
- **기존 browser-gas-smoke: 통과**. 분리된 모바일/PC 컨텍스트의 신청→관리자→NPU 승인→조회→정원 변경→취소, 오류/화면 넘침 검사.
- **browser-performance: 통과**. home 요청 0, apply 지연 중 폼 입력, 초안 보존, 캐시 재진입, 빈 화면 polling 0, NPU/관리자 부분 갱신, 승인 후 늦은 응답 무시.
- 본인확인, 기업 격리, 관리자 인증, 중복 신청, 개인정보 동의, 승인/거절/취소, 이력, 확정 수 미만 정원 감소 차단, 마지막 자리 경합 회귀 검사를 유지했습니다.
- Google 서비스 모형에서 읽기/쓰기 횟수와 잠금을 검증했습니다. 실제 Google의 동시 실행·CORS·권한·할당량·지연시간을 대신 검증한 것은 아닙니다.

기본 실행:

```powershell
npm test
node tests/measure-performance.mjs
```

브라우저 검사는 먼저 npm start를 실행하고 Playwright가 제공되는 환경에서 다음을 실행합니다. 필요하면 PLAYWRIGHT_MODULE(설치된 Playwright 모듈 경로), BROWSER_CHANNEL(예: msedge), PREVIEW_URL 환경변수를 지정합니다.

```powershell
node tests/browser-gas-smoke.mjs
node tests/browser-performance.mjs
```

계측 스크립트는 기본으로 위 기준 커밋을 git show로 읽습니다. 얕은 clone 등 해당 커밋이 없으면 이력이 있는 clone을 사용하거나 비교할 이전 커밋을 첫 인자로 전달합니다. 결과는 artifacts/backend-read-counts.json, artifacts/frontend-request-counts.json에 저장하며 운영 데이터는 쓰지 않습니다.

## 8. 운영 반영 순서

1. 기존 Apps Script 프로젝트에 변경된 **Code.gs, Config.gs, Database.gs, Services.gs, Setup.gs**를 모두 복사하고 저장합니다.
2. 기존 Auth.gs/매니페스트/Script Properties/Sheets v4 서비스를 유지합니다. DB 생성이나 인증정보 재설정은 필요 없습니다. setupSystem/configureAuthentication을 다시 실행하지 않아도 됩니다.
3. 편집기 함수 목록에서 **refreshPublicConfig**를 선택하여 실행합니다.
4. **배포 → 배포 관리 → 기존 웹 앱 → 수정(연필) → 새 버전 → 배포**. 저장만 하면 /exec는 바뀌지 않습니다.
5. 동일한 /exec 주소를 유지한 채 변경 파일을 GitHub에 커밋/푸시합니다. 기존 Pages 배포 완료 후 강력 새로고침합니다.
6. 기존 서버와의 어댑터 호환 처리는 있지만 모든 성능 효과를 얻으려면 서버와 프론트엔드 양쪽을 적용해야 합니다.

상세 화면 안내는 [Google 설정 문서](../apps-script/README.md#기존-운영-환경에-이번-성능-개선-적용)에 있습니다. 이번 작업에서 Google 배포·DB 생성·운영 설정 변경은 수행하지 않았습니다.

## 9. 실제 PC/모바일에서 비교하는 방법

1. 회사 PC, 외부 PC, 모바일에서 **동일 Pages 주소**를 사용합니다. 로컬 auto 모드는 mock이므로 운영 성능 비교에 사용하지 않습니다.
2. PC 개발자도구 Network를 열고 getConfig/getAvailability 또는 script.google.com/macros의 API 요청을 확인합니다. Google의 응답 리다이렉트를 API 두 번으로 세지 않습니다. 요청 본문/토큰 대신 동작명·횟수·소요시간만 기록합니다.
3. 새로고침 직후(cold)와 30초 이내 같은 화면 재진입(warm)을 구분합니다. home에서 GAS 요청이 없는지, apply 폼에 즉시 입력 가능하고 시간만 로딩되는지 확인합니다. 모바일도 첫 화면과 입력 반응을 확인합니다.
4. 표의 각 화면을 같은 기기/네트워크에서 5~10회 비교하고 중앙값과 가장 느린 값을 기록합니다. 로그인 폼 진입과 로그인 제출을 구분하고, 비교 중 30초 polling을 별도로 셉니다.
5. NPU 로그인 후 목록/매칭은 1회, 관리자 대시보드는 1회 요청인지 확인합니다. 필터·정원 초안을 입력한 상태로 갱신해 입력이 지워지지 않는지 확인합니다.
6. 각 활성 화면을 1분 정도 두고 30초 간격 갱신을 확인합니다. home, 조회 전, 로그인 전에는 반복 호출이 없어야 합니다.
7. 합성 정보로 모바일 신청→PC 관리자 조회→NPU 승인→모바일 ID+이메일 조회를 확인합니다. 다른 PC에서 정원 변경 후 ITS 시간의 잔여 자리가 다음 주기 또는 화면 재진입에 반영되는지 확인합니다.
8. 기존 기능 시험대로 마지막 자리 동시 승인, 확정 취소 후 정원 반환, 다른 기업 접근 차단, 관리자 로그와 집계 일치를 다시 확인합니다.

정확한 개선 후 밀리초 수치는 이 배포·실기기 비교 후 판단합니다. GAS 실행 시작 비용, 네트워크, Google 서비스 할당량은 호출을 줄여도 남습니다. 이번 변경의 로컬 검증 결과는 **더 적은 요청·시트 읽기와 서버 대기 전 UI 표시**입니다.
