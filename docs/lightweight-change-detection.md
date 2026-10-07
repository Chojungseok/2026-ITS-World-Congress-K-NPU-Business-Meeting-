# 변경 버전 기반 자동 갱신

대상: Chojungseok/2026-ITS-World-Congress-K-NPU-Business-Meeting-
기준: f1044fc (1차 성능 최적화)
검증일: 2026-10-07

이번 코드는 로컬에 구현·검증했습니다. **Google Apps Script 재배포와 GitHub push는 수행하지 않았습니다.** 기존 UI, 업무 규칙, 인증, Web App URL, 비공개 Google Sheets 원본 구조를 유지합니다.

## 1. 분석 및 적용 구조

기존 app.js는 필요한 화면에서 30초마다 refresh를 호출했습니다. NPU/matching은 getProviderRequests, admin은 getAdminOverview를 매번 실행했습니다. 이미 구현된 즉시 home 렌더링, 공개 config 캐시, 요청별 batchGet snapshot, 짧은 관리자 snapshot 잠금, 부분 렌더링, sessionStorage를 그대로 활용했습니다.

새 흐름:

1. 화면 진입 → 전체 데이터 1회 + 그 snapshot의 revision 저장.
2. NPU/matching 5초, admin 10초마다 인증된 경량 revision 조회.
3. 같으면 아무런 Sheet 읽기·전체 데이터 요청·DOM 교체·toast를 하지 않음.
4. 다르면 기존 전체 API를 한 번 호출하고 바뀐 화면 영역만 갱신.
5. 실제 수신한 snapshot의 revision을 기억하고 다음 검사에 사용.

반복 타이머는 응답 처리 후 다음 주기를 예약합니다. 같은 화면의 revision 확인과 전체 갱신은 하나의 Promise를 공유하므로 이전 요청이 느리면 새 요청을 쌓지 않습니다. 최초 진입/수동 새로고침/자신이 처리한 승인·정원 변경 후에는 바로 전체 데이터를 읽습니다. 변경 완료 후 강제 갱신은 기존 generation 보호를 유지하여 늦은 이전 응답을 무시합니다.

## 2. 저장 위치와 버전 종류

Script Properties의 **KNPU_REVISIONS_V1** 한 항목에 작은 JSON을 저장합니다.

| 필드 | 범위 |
| --- | --- |
| global | 전체 상담 데이터 변경 |
| admin | 관리자 통계·진행 현황·처리이력 |
| providers.deepx / mobilint / furiosa / rebellions | 각 기업의 신청·상태·정원 |
| availability.deepx / mobilint / furiosa / rebellions | 각 기업의 확정 수·정원·운영 설정 |
| pending | 저장/버전 발행 사이의 장애 감지용 내부 표식 |

값은 서버 UUID 문자열입니다. 시각값만 사용하지 않으며 성공한 쓰기 잠금 안에서 새 값을 생성합니다. 대소 비교 대신 동일 여부만 비교합니다. 한 JSON 항목을 교체하므로 범위별 키가 중간 상태로 읽히지 않도록 했습니다. 이 항목은 개인정보, 신청ID, 연락처, 토큰, 인증정보를 담지 않습니다.

속성이 없으면 초기 버전은 0입니다. 조회만으로 설정을 만들지 않으며 첫 정상 데이터 저장 때 자동 생성합니다. 기존 SHEET_ID/서명 비밀키/비밀번호 해시/기업 코드 해시/세션은 초기화하거나 교체하지 않습니다. 새 시트나 스키마 변경이 없고 setupSystem/configureAuthentication 재실행도 필요 없습니다. Properties는 [Apps Script의 기존 키·값 저장 기능](https://developers.google.com/apps-script/reference/properties/properties)을 사용합니다.

## 3. 어떤 변경이 어떤 버전을 바꾸는가

| 성공한 변경 | global/admin | 해당 NPU provider | 해당 NPU availability |
| --- | --- | --- | --- |
| ITS 신규 신청 | 변경 | 변경 | 유지: 대기는 자리 미점유 |
| NPU 승인 | 변경 | 변경 | 변경 |
| NPU 거절 | 변경 | 변경 | 유지 |
| 승인대기 신청 취소 | 변경 | 변경 | 유지 |
| 매칭확정 신청 취소 | 변경 | 변경 | 변경 |
| 시간별 정원 변경 | 변경 | 변경 | 변경 |
| 기업/운영 설정 편집 후 refreshPublicConfig 실행 | 변경 | 모든 기업 변경 | 모든 기업 변경 |

다른 NPU의 정상 신청/승인/취소/정원 변경으로 딥엑스 버전이 불필요하게 바뀌지 않습니다. 검증 실패(DUPLICATE/CAPACITY_FULL/INVALID_STATE 등), 같은 정원 재저장, 이미 완료된 승인/취소 재시도에는 새 버전을 발행하지 않습니다. 로그인·로그아웃도 상담 버전 변경 대상이 아닙니다.

현재 운영 화면에 없는 기업 활성화/운영여부의 수동 변경은 운영을 멈춘 뒤 시트에서 편집하고 기존 운영자 함수 **refreshPublicConfig()**를 실행합니다. 이 함수는 공개 설정 캐시를 비우고 모든 범위에 새 버전을 발행합니다. 시트 직접 편집을 자동 감지하는 트리거는 추가하지 않았습니다. 신청/상태/정원은 계속 앱에서 변경하여 검증과 이력을 남깁니다.

## 4. API와 권한

성공 응답은 기존 {ok:true,data:...}, 실패는 {ok:false,error:{code,message}}입니다.

| 경량 API | 프론트엔드 호출 | HTTP/접근 |
| --- | --- | --- |
| getProviderRevision | api.getProviderRevision({token}) | POST, provider 인증 |
| getAdminRevision | api.getAdminRevision({token}) | POST, admin 인증 |
| getAvailabilityRevision | api.getAvailabilityRevision(providerId) | GET, 공개 집계 버전 |

정상 data는 **{revision: "서버 버전"}**뿐입니다. 공개 availability 버전도 회사 기본 ID 검증만 하고 Sheet를 읽지 않습니다. 현재 ITS 화면은 기존 30초 availability 조회를 유지하므로 이 공개 버전 API를 정기 호출하지 않습니다.

세 API 모두 SpreadsheetApp.openById, getLastRow, getValues, rows_, batchGet을 호출하지 않고 ScriptLock도 잡지 않습니다. NPU/admin은 기존 HMAC 서명·만료·서버 활성 세션·role을 먼저 확인합니다. Provider revision은 token의 providerId만 사용하며 입력 providerId로 다른 회사에 접근할 수 없습니다. 토큰은 POST 본문에만 보냅니다.

전체 API의 호환성:

- getProviderRequests(token)의 기존 프론트엔드 반환값은 계속 배열입니다.
- 서버 getProviderRequests의 includeConfig:true 응답에 revision을 추가했습니다. 옵션이 없으면 기존 배열입니다.
- 새 어댑터 메서드 getProviderSnapshot(token)은 같은 endpoint 응답에서 {requests,revision}을 반환하고 config는 기존 공개 메모리 캐시에 반영합니다.
- getAdminOverview는 기존 requests/history/providers/config에 revision만 추가합니다.
- revision 필드가 없는 이전 GAS 배포도 동작하며 30초 전체 갱신으로 호환됩니다. 정상 새 서버에서는 변경 없을 때 전체 조회를 하지 않습니다.

## 5. 동시성과 변경 누락 방지

쓰기 순서: 공통 ScriptLock → 실제 시트 snapshot·검증 → 데이터와 처리이력의 원자적 batchUpdate → revision 발행 → 잠금 해제입니다. 마지막 자리 동시 승인, 취소/승인, 정원 변경/승인 보호를 유지합니다.

Provider 전체 조회는 **시트를 읽기 직전** revision을 기억합니다. 조회 중 새 신청이 생기면 반환 데이터에 이전 버전이 붙을 수 있지만, 새 버전을 잘못 붙이지 않습니다. 다음 경량 조회에서 차이를 발견해 다시 읽습니다. 관리자 전체 조회는 기존 짧은 snapshot 잠금 안에서 revision과 네 시트를 읽습니다.

클라이언트는 경량 조회에서 본 버전으로 기준을 미리 올리지 않습니다. 전체 데이터 응답이 성공하고 현재 화면에 적용됐을 때만 그 응답의 revision을 기억합니다. 전체 조회 실패·오래된 route/token/generation 응답은 기준을 바꾸지 않습니다. 숨겨졌다가 복귀하는 동안 진행 중이던 이전 probe도 무시하고, 끝난 직후 새 probe를 하나 예약합니다.

### 두 Google 서비스 사이의 실패

Sheets와 Script Properties는 하나의 트랜잭션이 아닙니다. Sheet 저장만 성공하고 버전 발행이 실패할 때 변경을 영구히 놓치지 않도록, 쓰기 직전 내부 pending 표식을 남깁니다. 이 단계에서는 revision 값은 그대로입니다.

- 저장과 발행이 모두 성공하면 새 revision과 pending:false를 한 번에 저장합니다.
- 검증 실패는 저장 단계에 진입하지 않으므로 pending 표식도 만들지 않습니다.
- Sheet 요청 결과가 모호하거나 버전 발행이 실패하면 새 revision을 성공한 것처럼 반환하지 않습니다. 정상 revision 조회는 REVISION_PENDING, 전체 snapshot은 revision:null로 응답합니다.
- 정상 저장 중 잠시 pending을 보면 NPU 5초/admin 10초 경량 재확인을 유지합니다. **30초 이상 지속할 때만** 전체 조회로 보완하며 이후에도 30초보다 자주 전체 조회하지 않습니다.
- 다음 정상 쓰기 또는 운영자의 refreshPublicConfig() 실행으로 복구합니다. 이전의 모호한 변경까지 놓치지 않도록 이 복구 시에는 모든 기업 버전을 갱신합니다.
- 사용자는 쓰기 오류 후 실제 신청/이력 결과를 먼저 확인합니다. 자동 재제출이나 인증정보 초기화는 하지 않습니다.

이 예외 복구와 이전 서버 호환 모드를 제외한 정상 새 서버에서는 변경 없는 전체 조회가 없습니다.

## 6. 주기와 화면 보존

runtime-config.js:

```js
refreshIntervalMs: 30000,
revisionPolling: Object.freeze({
  providerMs: 5000,
  adminMs: 10000,
  retryMs: 30000
})
```

| 화면 | 자동 동작 |
| --- | --- |
| home / 로그인 전 / lookup 조회 전 | 없음 |
| NPU 승인·matching | 5초 revision 확인 → 바뀌면 본인 목록 |
| 관리자 | 10초 revision 확인 → 바뀌면 overview |
| ITS 신청 | 기존 30초 availability |
| 조회를 마친 ITS lookup | 기존 30초 ID+이메일 확인 |
| 숨긴 탭 | 없음 |
| visible 복귀 | 즉시 해당 버전 확인, 진행 중이면 완료 직후 실행 |
| 네트워크 오류 | 30초 후 재시도, 같은 오류 toast 반복 방지 |

정원 입력 초안/포커스, 관리자 검색·기업·시간·처리유형·정렬, NPU 상태 탭을 보존합니다. 정원 입력 중에도 신청 목록과 통계는 갱신하고 해당 입력 필드는 그대로 둡니다. 편집을 마치면 보류한 정원 표시만 반영합니다.

관리자 요약 통계, 잔여 자리/확정 수/정원/기업별 합계, 필터된 로그, 시간대 팝업, 신청 상세 팝업을 갱신합니다. 전체 화면을 재생성하지 않으며 스크롤은 새 문서 높이가 허용하는 범위에서 유지합니다. 팝업에 직접 편집 가능한 필드가 있는 경우 그 내용을 덮어쓰지 않습니다.

신규 신청이 실제 목록에 추가됐을 때 NPU toast 한 번, 실제 관리자 데이터가 바뀌었을 때 운영 현황 toast 한 번을 표시합니다. 변경 없는 확인에는 알림/소리가 없습니다.

5초/10초는 **확인 간격**입니다. 실제 표시까지는 GAS 실행 시작·네트워크·데이터 조회 시간이 더해집니다. 느린 이전 요청이 진행 중이거나 사용자가 실제 처리 버튼을 누르는 동안에는 중복 요청을 만들지 않으므로 5초 안의 화면 반영을 절대 시간으로 보장하지는 않습니다.

## 7. 비교 측정

합성 신청 200건에서 시작해 30분 동안 5회 변경이 생기는 순서를 모형 서비스로 실행했습니다. 실제 30분의 Google 부하 시험이나 실서버 응답시간 측정이 아닙니다. 이전 구조의 호출 횟수는 30초 full polling 계산값입니다.

| 화면 | 이전 전체 조회 | 새 revision 조회 | 새 전체 조회 | 새 조회의 Sheets 읽기 |
| --- | ---: | ---: | ---: | ---: |
| NPU 30분/변경 5회 | 60 + 최초 1 | 약 360 | 5 + 최초 1 | 6회 |
| 관리자 30분/변경 5회 | 60 + 최초 1 | 약 180 | 5 + 최초 1 | 6회 |

revision 확인 자체의 Sheet 읽기: **0회**. 연속 변경이 합쳐지면 전체 조회는 더 적을 수 있고, 조회 중 추가 변경·수동 새로고침·오류 복구는 추가 조회를 만들 수 있습니다. 위 수치는 조회만 계산하고 데이터 변경 자체의 읽기/쓰기는 제외합니다.

동일 합성 데이터의 JSON 본문 표본:

- revision 성공 응답: **70 bytes**
- NPU 전체 응답: **98,914 bytes**
- 관리자 전체 응답: **172,481 bytes**
- 새 구조의 30분 총 응답 본문: NPU **625,954 bytes**, 관리자 **1,060,186 bytes**

압축·HTTP 헤더·리다이렉트는 제외한 JSON 바이트 수입니다. 요청 개수는 늘지만 큰 응답과 Sheet 읽기는 줄어듭니다. 인증된 revision 조회에는 기존 세션 검증을 포함한 Script Properties 읽기가 있습니다. 현재 코드상 보통 3회 읽기이며 동시 탭 수에 따라 누적됩니다. Google의 Properties 읽기/쓰기 일일 할당량과 실행 제한은 그대로 적용됩니다. 행사 계정·실제 동시 화면 수로 실행 이력을 확인하세요. [공식 할당량](https://developers.google.com/apps-script/guides/services/quotas).

## 8. 변경 파일과 GitHub 반영 목록

다음 16개 파일을 함께 반영합니다. artifacts의 테스트 결과/임시 파일은 제외합니다.

| 파일 | 변경 |
| --- | --- |
| assets/js/app.js | 역할별 변경 감지·단일 실행·snapshot 기준·부분 갱신·팝업·스크롤·입력 보호 |
| assets/js/gas-api.js | revision API, getProviderSnapshot, 기존 배열 계약 유지 |
| assets/js/runtime-config.js | NPU 5초/admin 10초/오류 30초 설정 |
| apps-script/Revision.gs (신규) | Script Properties 버전·범위별 발행·pending 복구 |
| apps-script/Code.gs | 인증된 경량 API와 전체 응답의 snapshot revision |
| apps-script/Database.gs | 기존 원자적 쓰기 성공 후 revision 발행 |
| apps-script/Setup.gs | 기존 운영자 공개 설정 갱신에 전체 버전 발행 연결 |
| tests/gas-harness.mjs | 새 Revision.gs를 실제 서버 테스트에 로드 |
| tests/revision.test.mjs (신규) | 서버/어댑터/시트 I/O/경합·실패 복구 테스트 10개 |
| tests/browser-revision.mjs (신규) | 실제 화면의 자동 반영·권한별 흐름·입력/팝업·복귀·경합 검사 |
| tests/measure-revision.mjs (신규) | 200건/30분/5회 변경의 읽기 및 응답 크기 계측 |
| README.md | 현재 갱신 방식·파일 구조·검증 결과 |
| apps-script/README.md | 새 파일 추가와 기존 웹 앱 새 버전 배포 절차 |
| docs/google-apps-script-integration.md | 호환 API와 동기화 계약 |
| docs/performance-optimization.md | 이전 보고서임을 표시하고 최신 설계 연결 |
| docs/lightweight-change-detection.md (신규) | 이 보고서 |

api.js, mock-api.js, session-store.js, Auth.gs, Config.gs, Services.gs, appsscript.json, CSS, HTML, 기존 시트 열은 변경하지 않았습니다. 새 인프라·서비스·유료 도구·트리거도 없습니다.

## 9. 테스트 결과

- **npm test: 65개 통과, 실패 0** — 기존 55개와 새 10개.
- **browser-gas-smoke: 통과** — 모바일 신청, 관리자, NPU 승인, 조회, 정원 변경, 취소, mock 유지.
- **browser-performance: 통과** — 기존 home 0회, 설정 캐시/부분 갱신/늦은 응답 보호 유지.
- **browser-revision: 통과** — 관리자 요구 A~H, 신규 신청/승인/거절/취소/정원 변경, NPU 초안/관리자 모든 필터, 두 상세 팝업 경로, 스크롤 범위 보존, hidden 요청 0/visible 즉시 확인, 느린 probe 공유, 조회 중 변경, 실패 후 재검사, matching, 이전 배포 호환, 발행 실패 복구.
- revision 같은 경우 full API 없음, revision 확인 시 Sheet I/O·전역 잠금 없음, 다른 기업 revision 유지, 권한/세션 만료/폐기, 쓰기 후 발행, 실패/중복 버전 유지, 기존 마지막 자리 동시 승인/중복 신청/개인정보 동의/ID+이메일/처리이력 검사를 확인했습니다.

재현:

```powershell
npm test
node tests/measure-revision.mjs
```

브라우저 검사는 npm start를 켜고 Playwright가 설치된 환경에서 실행합니다. 필요하면 PLAYWRIGHT_MODULE, BROWSER_CHANNEL(msedge 등), PREVIEW_URL을 지정합니다.

```powershell
node tests/browser-gas-smoke.mjs
node tests/browser-performance.mjs
node tests/browser-revision.mjs
```

결과는 artifacts/revision-performance.json 및 artifacts/revision-browser-results.json입니다. 테스트 서비스 모형은 실제 Google 서버의 권한/CORS/할당량/네트워크 지연/동시 실행 부하를 대신하지 않습니다. hidden/visible 검사도 브라우저 visibility 상태와 이벤트를 테스트에서 재현한 것입니다.

## 10. 기존 Apps Script 재배포

1. 현재 운영 중인 Apps Script 프로젝트를 엽니다.
2. **Revision.gs를 새 스크립트 파일로 추가**하고 저장소 내용을 복사합니다.
3. 수정된 **Code.gs, Database.gs, Setup.gs**를 각각 전체 내용으로 교체하고 저장합니다. 기존 Auth/Config/Services/매니페스트는 유지합니다.
4. 기존 Script Properties는 그대로 둡니다. **setupSystem·configureAuthentication 실행은 필요 없습니다.** 새 속성은 첫 정상 변경 시 자동 생성됩니다.
5. **배포 → 배포 관리 → 기존 웹 앱 → 수정(연필) → 새 버전 → 배포**.
6. **동일한 /exec URL**을 유지합니다. 새 웹 앱이나 새 Spreadsheet를 만들지 않습니다.
7. 위 파일 목록을 GitHub에 커밋/푸시하고 Pages 반영 후 강력 새로고침합니다. 서버를 먼저 갱신하면 이전 프론트엔드와도 호환됩니다.

이번 작업에서 실제 Google 설정/배포나 GitHub push는 실행하지 않았습니다. 새 .gs 파일을 빠뜨리면 쓰기와 revision API가 작동하지 않으므로 네 파일을 함께 적용합니다.

## 11. 실제 PC·모바일 시험

1. 같은 Pages 주소를 PC에서 NPU, 다른 PC/브라우저에서 관리자, 모바일에서 ITS 신청으로 엽니다. 로컬 auto 모드는 mock이므로 운영 확인은 Pages 또는 명시적 gas 모드로 합니다.
2. 변경 없이 1분 기다립니다. PC Network에서 NPU는 getProviderRevision, 관리자는 getAdminRevision만 반복되고 full API가 호출되지 않아야 합니다. 개인정보/토큰 대신 API 이름·횟수·시간만 기록합니다.
3. 모바일에서 합성 정보로 신청합니다. NPU는 다음 5초 확인, 관리자는 다음 10초 확인 후 새 목록/통계/로그를 표시해야 합니다. GAS 응답 지연 시간은 따로 기록합니다.
4. 관리자 검색·기업·시간·처리유형·정렬을 설정하고, 시간대 팝업을 연 채 NPU에서 승인합니다. 통계·확정·잔여 자리·상태·이력이 함께 바뀌고 필터/팝업이 유지되는지 확인합니다.
5. 정원을 바꾸고 관리자 진행 표와 팝업이 갱신되는지, ITS 시간 선택은 다음 30초 조회에서 반영되는지 확인합니다.
6. 모바일에서 ID+이메일로 확정 신청을 취소합니다. 관리자 상세의 상태 변경과 자리 반환, NPU 목록 변경을 확인합니다. 거절도 별도 신청으로 확인합니다.
7. NPU 정원에 저장하지 않은 숫자를 입력한 채 다른 신청을 넣어봅니다. 목록은 갱신되고 입력값은 유지되어야 합니다.
8. 관리자/NPU 탭을 숨기고 변경을 발생시킨 뒤 돌아옵니다. 숨긴 동안 요청이 멈추고 복귀 시 바로 확인해야 합니다.
9. 같은 기업의 두 세션으로 마지막 자리 동시 승인, 잘못된 이메일/다른 기업 접근 차단을 다시 확인합니다.
10. 실제 동시 운영 탭 수로 실행 횟수·오류·지연을 확인합니다. 30분 세션이 만료되면 기존 동작대로 다시 로그인합니다.

실서버 배포 전에는 이번 변경의 실제 모바일/PC 반영 지연을 측정했다고 볼 수 없습니다. 로컬 검증은 호출/시트 읽기 구조와 화면 동작을 확인한 결과입니다.
