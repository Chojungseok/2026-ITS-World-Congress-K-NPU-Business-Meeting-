# 기존 API 계약을 유지한 GAS 전환

현재 V3 변경·운영 DB 적용은 [V3 보고서](business-meeting-v3.md)를 먼저 참고하세요. 아래는 최초 GAS 전환부터 이어온 계약 설명이며 V3에서는 정원·시간표·디자인을 갱신했습니다.

## 분석 결과와 유지한 설계

전환 전 api.js는 mock-api.js의 api를 그대로 export했습니다. app.js는 api만 호출하고 views.js가 기존 반응형 화면을 출력했습니다. mock-api.js는 localStorage의 requests/history/slotCapacities를 원본으로 쓰고 메모리 토큰으로 데모 인증을 처리했습니다.

이번 변경은 이 경계를 유지합니다. api.js가 runtime-config.js에 따라 mock-api 또는 gas-api 중 하나만 동적으로 로드합니다. 운영 어댑터 오류 시 mock으로 전환하지 않습니다. CSS, HTML, 화면 배치, 기존 해시 라우팅을 재작성하지 않았습니다.

| 기존 부분 | 변경 |
| --- | --- |
| api.js | 유일한 데이터 진입점 유지, 환경에 따라 구현 선택 |
| mock-api.js | 보존. 기존 ID-only 테스트 계약 유지, 이메일이 주어지면 검증 추가 |
| gas-api.js | 동일한 메서드/반환 형태의 HTTP 전송·오류 처리, 공개 설정 30초 메모리 캐시·진행 중 요청 공유 |
| config.js | 기존 로컬 기본값 보존, 운영에서는 서버 기업·시간·정원·동의 버전 반영 |
| app.js | 이메일 조회, 세션 복원, 운영 설정, NPU 5초/관리자 10초 버전 확인 후 부분 갱신, 만료 재로그인 |
| views.js | 조회 이메일 필드, 실제 저장 방식/동의문, 운영/로컬 문구 구별, NPU 로그아웃 |
| session-store.js | 토큰만 sessionStorage 저장, 만료된 값 제거 |
| Apps Script | 중앙 원본 DB, 권한·입력·정원 검증, 원자적 감사 기록 |

## API 계약

자바스크립트 호출 형태는 다음과 같습니다. 어댑터는 응답 봉투의 data만 반환하여 기존 UI 계약을 유지하고 실패 시 code가 있는 Error를 throw합니다.

| 메서드 | 입력 | 반환 | 접근/HTTP |
| --- | --- | --- | --- |
| getConfig | 없음 | {providers,times,privacy} | 공개 GET |
| getAvailability | providerId 문자열 | [{time,confirmed,capacity,active}] | 공개 GET |
| getAvailabilitySnapshot | providerId 문자열 | {slots,config,revision} | 같은 공개 GET, includeConfig=true |
| submitRequest | 신청 필드 객체 + privacyConsent + privacyNoticeVersion | 신청 객체 | 공개 POST |
| findRequestIds | {itsCompany,contactName,phone,email} | [{id,createdAt,providerName,time,status}] | 네 항목 본인 확인 POST, 15분 10회 제한 |
| findRequest | {id,email} | 해당 신청 객체 | 본인정보 확인 POST |
| cancelRequest | {id,email} | 취소된 신청 객체 | 본인정보 확인 POST |
| authenticateProvider | {providerId,approvalCode} | token 문자열 | 기업 인증 POST |
| authenticateAdmin | {id,password} | token 문자열 | 관리자 인증 POST |
| logout | token 문자열 | null | 유효 세션 POST |
| getProviderRequests | token 문자열 | 본인 기업 신청 배열 | NPU POST |
| getProviderSnapshot | token 문자열 | {requests,revision} | NPU POST, 같은 getProviderRequests 서버 동작 |
| getProviderRevision | {token} | {revision} | NPU POST, Sheet I/O 없음 |
| getAdminRevision | {token} | {revision} | 관리자 POST, Sheet I/O 없음 |
| getAvailabilityRevision | providerId 문자열 | {revision} | 공개 GET, Sheet I/O 없음 |
| decideRequest | {token,id,decision,rejectionReason?} | 변경된 신청 객체 | NPU POST |
| updateProviderCapacity | {token,time,capacity} | {providerId,time,capacity} | NPU POST |
| extendSchedule | {token,expectedLastTime} | {previousLastTime,time,providerIds,capacity} | 관리자 POST, 공통 ScriptLock/atomic batch |
| getAdminRequests | token 문자열 | 전체 신청 배열 | 관리자 POST |
| getAdminOverview | token 문자열 | {requests,history,providers,config,revision} | 관리자 POST |

decision은 매칭확정 또는 매칭거절입니다. 거절에는 trim 후 1~500자의 rejectionReason이 필수이며, 승인은 해당 값을 무시하고 빈 문자열을 저장합니다. 기존 거절 사유가 없으면 정상적인 빈 값으로 취급합니다. status는 승인대기/매칭확정/매칭거절/신청취소입니다. resetDemo는 운영 구현과 서버에 없습니다.

HTTP 본문은 메서드 인자와 action을 같은 객체에 둡니다. 예: `{action:'getProviderRequests',token:...}`. getConfig/getAvailability/getAvailabilityRevision 외 GET 호출은 거부합니다. 서버에는 client가 지정한 함수명을 실행하는 경로가 없습니다.

성능 개선 서버는 getProviderRequests의 POST 본문에 선택적으로 `includeConfig:true`가 있으면 `{requests,config,revision}`을 반환합니다. 없으면 기존 배열을 반환합니다. gas-api.js는 이 응답을 배열로 풀어서 UI 계약을 유지하고 공개 config만 메모리에 보관합니다. 기존 배포가 배열을 반환하는 경우도 지원합니다. getProviderSnapshot은 같은 서버 동작의 revision을 함께 반환하는 선택적 어댑터 메서드입니다. getProviderRequests의 기존 배열 계약은 유지합니다. getAdminOverview에는 config/revision을 추가했으며 기존 필드도 유지합니다. revision 필드가 없는 이전 서버는 30초 전체 갱신으로 호환됩니다.

신청 객체는 기존 id/createdAt/itsCompany/contactName/phone/email/providerId/time/attendees/details/status/privacyConsent/privacyConsentedAt/privacyNoticeVersion을 유지하고 providerName/updatedAt/rejectionReason을 추가합니다. 시트 내부 행 번호는 반환하지 않습니다.

기업 설정의 capacities는 시간 → 정원, enabled는 시간 → 운영여부입니다. 활성여부는 active로 전달합니다. 기업 마크/색상 등 화면 장식만 프론트엔드 기본값을 사용합니다. 잔여 자리는 공개된 집계와 정원으로 계산하고 개인정보는 포함하지 않습니다.

history는 기존 action/occurredAt/actor/requestId/itsCompany/providerId/time/fromStatus/toStatus/beforeCapacity/afterCapacity를 보존하고 actorRole을 추가합니다. 최신 시각순, 동일 시각은 기록 순서 역순입니다.

## 인증·개인정보 경계

- 익명 전체 목록·임의 신청 상세 API는 없습니다.
- 신청자 조회/취소는 ID와 이메일의 동시 일치가 필요합니다. 잘못된 이메일과 존재하지 않는 ID는 같은 오류로 응답합니다.
- 이는 요청된 최소 본인확인입니다. 이메일 소유권 OTP 인증은 포함하지 않습니다. UUID 신청ID와 이메일을 함께 안전하게 관리해야 합니다.
- NPU 권한은 HMAC 서명과 서버 활성 세션을 확인한 token의 providerId만 사용합니다. input.providerId를 바꿔도 소유 범위를 바꿀 수 없습니다.
- 관리자와 기업 role을 구분합니다. NPU 토큰으로 관리자 API를 실행할 수 없습니다.
- 토큰은 30분 만료, jti별 Script Properties 등록/폐기, sessionStorage 저장입니다. 로그아웃/인증정보 재설정 시 서버에서 폐기합니다.
- 실제 승인코드/비밀번호는 Script Properties에서 등록하고 configureAuthentication으로 키드 해시화합니다. 공개된 데모 값은 등록/인증에 사용하지 않습니다.
- 동의시각·신청ID·상태·수정시각은 서버에서 생성합니다. 동의문 버전이 현재 안내와 다르면 거부합니다.
- 보유기간은 PRIVACY_RETENTION_TEXT로 분리했습니다. 운영기관 확정 전에는 미확정 안내이며 실제 기간을 임의로 정하지 않았습니다.
- Sheet/프로젝트는 비공개 공유가 전제입니다. 실제 소유자가 공유 권한을 확인해야 합니다.

## 상태 전이와 데이터 일관성

신청: 신규 → 승인대기. 승인대기 → 매칭확정 또는 매칭거절. 승인대기/매칭확정 → 신청취소.

중복 활성 신청은 정규화한 이메일 + ITS기업 + NPU + 시간으로 검사합니다. 승인대기는 자리를 예약하지 않습니다. 승인 직전에 확정 건수를 다시 읽습니다. 확정 취소 후 다음 집계부터 자리가 반환됩니다.

신청·승인·거절·취소·정원 변경은 공통 ScriptLock 안에서 실제 DB를 새로 읽고 검증합니다. 인증·로그아웃·신청자 본인확인도 세션/시도 제한 갱신을 위해 잠금을 유지합니다. 공개 설정·가용 시간·기업 목록·관리자 단일 목록은 순수 조회이므로 전역 잠금 없이 읽습니다. 관리자 overview는 네 시트의 batchGet 구간만 같은 잠금으로 보호하고 집계·변환은 잠금 해제 후 수행합니다. 수정과 처리이력은 고급 Sheets API batchUpdate 한 번으로 저장합니다. 마지막 자리 두 건 승인, 취소/승인, 정원 축소/승인이 임계 구역 밖에서 서로 경쟁하지 않습니다. 이미 처리된 동일 승인/거절/취소의 재시도는 중복 이력을 만들지 않습니다. 단 신규 신청 응답 유실 후 재시도는 DUPLICATE로 차단되므로 ID를 받지 못했다면 네 정보가 일치하는 신청 ID 찾기로 접수를 확인하거나 관리자에게 문의할 수 있습니다.

정원은 기업 × 시간별 0~2 정수입니다. 기본값은 네 기업 모두 2이며 기존 active DB에는 migrateBusinessMeetingV3를 적용합니다. 비활성 과거 정원은 원래 값으로 보존합니다. 기존 확정 수 미만으로 줄일 수 없습니다. 정원 0 또는 운영여부 FALSE이면 신규 신청/승인을 받지 않습니다. 취소와 거절은 계속 가능합니다.

사용자 문자열은 Sheets API stringValue로 지정합니다. =, +, -, @, 선행 공백이 있어도 formulaValue로 기록하지 않습니다. 시트 직접 편집은 서버 잠금을 우회하므로 운영 중 상태/정원을 직접 수정하지 않습니다.

## 전송과 갱신

GET에는 공개 action/providerId/includeConfig만 둡니다. POST는 text/plain;charset=utf-8 JSON, credentials omit, mode cors, redirect follow입니다. no-cors/JSONP를 사용하지 않습니다. JSON 응답이나 네트워크 확인 없이 성공 처리하지 않습니다. 쓰기 자동 재시도는 없습니다.

NPU/matching은 5초마다 getProviderRevision, 관리자는 10초마다 getAdminRevision을 호출합니다. 동일 버전이면 목록·설정을 다시 읽지 않습니다. 변경된 경우만 기존 부분 갱신으로 목록/overview를 읽습니다. 최초 진입과 수동 새로고침은 바로 전체 데이터를 읽습니다. home/빈 lookup/로그인 전/숨긴 탭은 주기 요청이 없습니다. visible 복귀는 즉시 버전을 확인하며 진행 중 요청이 있으면 중복 없이 끝난 직후 확인합니다. apply는 5초 availability revision 확인으로 변경 시 공개 snapshot을 갱신합니다. 조회를 마친 lookup은 기존 30초 갱신을 유지합니다.

정원 초안·상태 탭·관리자 필터·가능한 범위의 스크롤 위치·열린 상세 팝업을 보존합니다. revision 확인과 데이터 갱신은 하나의 진행 중 Promise로 중복을 막고, 변경 완료 후 강제 갱신은 기존 generation 보호를 유지합니다. 변경 알림은 실제 새 데이터 반영 시에만 한 번 표시하며 소리는 없습니다.

서버는 Script Properties의 KNPU_REVISIONS_V1에 global/admin/기업별 providers·availability 버전을 둡니다. 모든 정상 변경은 원자적 Sheet+이력 저장 성공 후 같은 쓰기 잠금 안에서 새 UUID 버전을 발행합니다. Provider 전체 조회는 시트를 읽기 전 버전, admin은 snapshot 잠금 안의 버전을 반환합니다. 클라이언트는 확인 API에서 본 최신 버전이 아닌 실제 받은 snapshot 버전만 기억하므로 조회 도중 변경을 놓치지 않습니다. 새 시트나 기존 속성 초기화는 없습니다. [변경 감지 설계와 복구 조건](lightweight-change-detection.md)을 참고하세요.

공개 config는 브라우저 메모리 및 Script Cache에서 각각 30초만 보관합니다. 정원 변경은 양쪽 캐시를 무효화하며 이전 응답이 캐시를 되살리지 못하게 버전을 확인합니다. 개인정보·목록·정원 검증용 데이터는 지속 캐시하지 않습니다. 서버의 요청별 snapshot은 같은 시트/헤더의 재조회를 막고 요청 종료 후 폐기합니다. 수동 기업/운영여부 변경 후에는 편집기에서 refreshPublicConfig()를 실행합니다. 개인정보 안내 속성은 서버 캐시를 반환하기 전에 다시 비교합니다. 자세한 호출 수와 일관성 범위는 [성능 보고서](performance-optimization.md)를 참고하세요.

## 검증 범위

`npm test`의 103개 검사는 기존 mock 테스트와 실제 .gs 소스를 Node VM에서 실행하는 서버 테스트, 어댑터 전송/세션 테스트를 실행합니다. Google 서비스 모형의 잠금과 batch API가 실제 서버 코드를 검증합니다.

`tests/browser-gas-smoke.mjs`는 선택적 Playwright 검사입니다. 실제 프론트엔드를 분리된 브라우저 컨텍스트에서 실행하고 GAS 요청만 서비스 모형에 연결합니다. npm start로 서버를 실행하고 Playwright가 있는 환경에서 실행합니다. PLAYWRIGHT_MODULE, BROWSER_CHANNEL, PREVIEW_URL 환경변수를 선택적으로 사용할 수 있습니다.

`tests/browser-performance.mjs`는 화면별 실제 어댑터 호출 수, 지연 중 즉시 화면 표시, 필터/초안 유지, 승인 후 늦은 응답 무시를 검증합니다. `node tests/measure-performance.mjs`는 합성 신청 200건에 대한 이전 커밋과 현재 서버의 서비스 호출 횟수를 비교합니다. 두 스크립트 모두 운영 DB에 접근하지 않습니다.

`tests/revision.test.mjs`는 버전 변경 범위·인증·시트 읽기 0·발행 실패·snapshot 경합을 검사합니다. `tests/browser-revision.mjs`는 다른 클라이언트의 변경 자동 반영, 팝업/필터/초안, hidden/visible, 중복 방지, 실패 후 재검사를 확인합니다. `node tests/measure-revision.mjs`로 30분/5회 변경의 합성 서비스 호출 및 payload 크기를 비교합니다.

로컬 테스트는 실제 Google 서버의 배포 권한, CORS, API 할당량을 검증하지 않습니다. [설정·실기기 검증 안내](../apps-script/README.md)를 따라 사용자 계정에서 완료해야 합니다.

V2는 새 15:50~16:30 운영 시간만 공개 config/availability로 반환하고 과거 신청/이력의 시간은 보존합니다. 신청 ID 찾기는 revision을 변경하지 않으며 입력 정보를 지속 저장하지 않습니다. 거절 사유는 Q열에 안전한 stringValue로 기록하고 기존 provider/admin revision 발행을 그대로 사용합니다. PDF는 정적 링크이며 GAS/Sheets를 호출하지 않습니다.

## V3 시간 연장과 정원 이전

관리자 extendSchedule은 예상 마지막 시간과 서버 실제 시간을 공통 잠금 안에서 비교한 뒤 다음 10분을 계산합니다. 같은 expectedLastTime의 재시도/두 탭은 한 번만 적용됩니다. 네 정원과 실제 providerId의 시간 연장 이력 네 개를 한 batchUpdate로 쓰고 전체 provider/availability/admin revision과 config 캐시를 갱신합니다. 과거 비활성 동일 기업×시간은 재활성화하며 중복을 만들지 않습니다. 날짜 경계·확정 초과·설정 중복은 거부합니다. migrateBusinessMeetingV3는 편집기 전용으로 전체 확정>2 검사 후 active 정원만 변경하며 새 스키마/인증 재설정은 없습니다. 자세한 실제 Google 절차는 [V3 보고서](business-meeting-v3.md)에 있습니다.
