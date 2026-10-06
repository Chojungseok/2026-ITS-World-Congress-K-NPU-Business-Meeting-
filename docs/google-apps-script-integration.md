# 기존 API 계약을 유지한 GAS 전환

## 분석 결과와 유지한 설계

전환 전 api.js는 mock-api.js의 api를 그대로 export했습니다. app.js는 api만 호출하고 views.js가 기존 반응형 화면을 출력했습니다. mock-api.js는 localStorage의 requests/history/slotCapacities를 원본으로 쓰고 메모리 토큰으로 데모 인증을 처리했습니다.

이번 변경은 이 경계를 유지합니다. api.js가 runtime-config.js에 따라 mock-api 또는 gas-api 중 하나만 동적으로 로드합니다. 운영 어댑터 오류 시 mock으로 전환하지 않습니다. CSS, HTML, 화면 배치, 기존 해시 라우팅을 재작성하지 않았습니다.

| 기존 부분 | 변경 |
| --- | --- |
| api.js | 유일한 데이터 진입점 유지, 환경에 따라 구현 선택 |
| mock-api.js | 보존. 기존 ID-only 테스트 계약 유지, 이메일이 주어지면 검증 추가 |
| gas-api.js | 동일한 메서드/반환 형태에 HTTP 전송·오류 처리 추가 |
| config.js | 기존 로컬 기본값 보존, 운영에서는 서버 기업·시간·정원·동의 버전 반영 |
| app.js | 이메일 조회, 세션 복원, 운영 설정, 15초 갱신, 만료 재로그인 |
| views.js | 조회 이메일 필드, 실제 저장 방식/동의문, 운영/로컬 문구 구별, NPU 로그아웃 |
| session-store.js | 토큰만 sessionStorage 저장, 만료된 값 제거 |
| Apps Script | 중앙 원본 DB, 권한·입력·정원 검증, 원자적 감사 기록 |

## API 계약

자바스크립트 호출 형태는 다음과 같습니다. 어댑터는 응답 봉투의 data만 반환하여 기존 UI 계약을 유지하고 실패 시 code가 있는 Error를 throw합니다.

| 메서드 | 입력 | 반환 | 접근/HTTP |
| --- | --- | --- | --- |
| getConfig | 없음 | {providers,times,privacy} | 공개 GET |
| getAvailability | providerId 문자열 | [{time,confirmed,capacity,active}] | 공개 GET |
| submitRequest | 신청 필드 객체 + privacyConsent + privacyNoticeVersion | 신청 객체 | 공개 POST |
| findRequest | {id,email} | 해당 신청 객체 | 본인정보 확인 POST |
| cancelRequest | {id,email} | 취소된 신청 객체 | 본인정보 확인 POST |
| authenticateProvider | {providerId,approvalCode} | token 문자열 | 기업 인증 POST |
| authenticateAdmin | {id,password} | token 문자열 | 관리자 인증 POST |
| logout | token 문자열 | null | 유효 세션 POST |
| getProviderRequests | token 문자열 | 본인 기업 신청 배열 | NPU POST |
| decideRequest | {token,id,decision} | 변경된 신청 객체 | NPU POST |
| updateProviderCapacity | {token,time,capacity} | {providerId,time,capacity} | NPU POST |
| getAdminRequests | token 문자열 | 전체 신청 배열 | 관리자 POST |
| getAdminOverview | token 문자열 | {requests,history,providers} | 관리자 POST |

decision은 매칭확정 또는 매칭거절입니다. status는 승인대기/매칭확정/매칭거절/신청취소입니다. resetDemo는 운영 구현과 서버에 없습니다.

HTTP 본문은 메서드 인자와 action을 같은 객체에 둡니다. 예: `{action:'getProviderRequests',token:...}`. getConfig/getAvailability 외 GET 호출은 거부합니다. 서버에는 client가 지정한 함수명을 실행하는 경로가 없습니다.

신청 객체는 기존 id/createdAt/itsCompany/contactName/phone/email/providerId/time/attendees/details/status/privacyConsent/privacyConsentedAt/privacyNoticeVersion을 유지하고 providerName/updatedAt을 추가합니다. 시트 내부 행 번호는 반환하지 않습니다.

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

모든 서버 진입 경로는 공통 ScriptLock 아래에서 검증합니다. 수정과 처리이력은 고급 Sheets API batchUpdate 한 번으로 저장합니다. 마지막 자리 두 건 승인, 취소/승인, 정원 축소/승인이 임계 구역 밖에서 서로 경쟁하지 않습니다. 이미 처리된 동일 승인/거절/취소의 재시도는 중복 이력을 만들지 않습니다. 단 신규 신청 응답 유실 후 재시도는 DUPLICATE로 차단되므로 ID를 받지 못했다면 관리자에게 접수 확인을 요청해야 합니다.

정원은 기업 × 시간별 0~50 정수입니다. 기존 확정 수 미만으로 줄일 수 없습니다. 정원 0 또는 운영여부 FALSE이면 신규 신청/승인을 받지 않습니다. 취소와 거절은 계속 가능합니다.

사용자 문자열은 Sheets API stringValue로 지정합니다. =, +, -, @, 선행 공백이 있어도 formulaValue로 기록하지 않습니다. 시트 직접 편집은 서버 잠금을 우회하므로 운영 중 상태/정원을 직접 수정하지 않습니다.

## 전송과 갱신

GET에는 action/providerId만 둡니다. POST는 text/plain;charset=utf-8 JSON, credentials omit, mode cors, redirect follow입니다. no-cors/JSONP를 사용하지 않습니다. JSON 응답이나 네트워크 확인 없이 성공 처리하지 않습니다. 쓰기 자동 재시도는 없습니다.

자동 갱신 기본값은 15초입니다. ITS의 시간 선택은 값 변경을 반영하고, NPU/관리자는 미저장 편집과 입력 포커스를 보호합니다. 수동 새로고침과 화면 복귀도 서버 데이터를 읽습니다. 이 구조는 push 실시간 연결이 아니라 주기 조회입니다.

## 검증 범위

`npm test`는 기존 mock 테스트와 실제 .gs 소스를 Node VM에서 실행하는 서버 테스트, 어댑터 전송/세션 테스트를 실행합니다. Google 서비스 모형의 잠금과 batch API가 실제 서버 코드를 검증합니다.

`tests/browser-gas-smoke.mjs`는 선택적 Playwright 검사입니다. 실제 프론트엔드를 분리된 브라우저 컨텍스트에서 실행하고 GAS 요청만 서비스 모형에 연결합니다. npm start로 서버를 실행하고 Playwright가 있는 환경에서 실행합니다. PLAYWRIGHT_MODULE, BROWSER_CHANNEL, PREVIEW_URL 환경변수를 선택적으로 사용할 수 있습니다.

로컬 테스트는 실제 Google 서버의 배포 권한, CORS, API 할당량을 검증하지 않습니다. [설정·실기기 검증 안내](../apps-script/README.md)를 따라 사용자 계정에서 완료해야 합니다.
