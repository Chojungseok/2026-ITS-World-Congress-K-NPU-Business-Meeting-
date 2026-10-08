# K-NPU Business Meeting V3 — 변경·검증·운영 적용 보고서

작성일: 2026-10-08. 작업 저장소: E:/2026/강릉 세계총회 K-NPU전환/Business meeting.

현재 로컬 working tree를 기준으로 구현했습니다. 비교 기준은 작업 시작 시 로컬 커밋 f0a4c3fb472b38b3af0efcb205d1bbb40b6f8ed0입니다. 원격 pull/reset은 수행하지 않았습니다. 이 V3 작업에서는 실제 Google DB 수정, Web App 배포, GitHub commit/push, Pages 배포를 수행하지 않았습니다. 아래 운영 절차를 실제 소유자 계정에서 완료해야 중앙 DB와 공개 화면에 반영됩니다.

## 1–2. 변경 파일 전체와 신규 파일

수정한 기존 파일 24개:

- apps-script/Code.gs
- apps-script/Config.gs
- apps-script/Database.gs
- apps-script/Services.gs
- assets/css/styles.css
- assets/js/app.js
- assets/js/config.js
- assets/js/gas-api.js
- assets/js/mock-api.js
- assets/js/runtime-config.js
- assets/js/views.js
- tests/browser-gas-smoke.mjs
- tests/browser-performance.mjs
- tests/browser-revision.mjs
- tests/business-v2-mock.test.mjs
- tests/business-v2.test.mjs
- tests/gas-backend.test.mjs
- tests/gas-harness.mjs
- tests/mock-api.test.mjs
- tests/performance.test.mjs
- tests/revision.test.mjs
- README.md
- apps-script/README.md
- docs/google-apps-script-integration.md

신규 파일 15개:

- apps-script/MigrationV3.gs
- apps-script/Schedule.gs
- assets/js/logos.js
- assets/logos/README.md
- assets/logos/deepx-logo.svg
- assets/logos/mobilint-logo.svg
- assets/logos/furiosa-logo.svg
- assets/logos/rebellions-logo.svg
- tests/browser-business-v3.mjs
- tests/business-v3.test.mjs
- tests/business-v3-mock.test.mjs
- tests/measure-business-v3.mjs
- docs/business-meeting-v3.md
- docs/v3-performance-features.json
- docs/v3-performance-final.json

api.js의 단일 진입점, session-store.js, Auth.gs, Revision.gs, Setup.gs, Migration.gs, appsscript.json, 기존 브로슈어 PDF는 유지했습니다. 인증 토큰·비밀키·운영 계정 값은 추가하거나 공개하지 않았습니다.

## 3–4. 공식 CI 출처·경로·확보 결과

회사 공식 홈페이지에서 실제 SVG 원본을 확보했습니다. 4개 모두 확보했으며 추가로 받아야 할 CI 파일은 없습니다. 자세한 SHA-256과 확보 방식은 [CI 출처 기록](../assets/logos/README.md)에 있습니다.

|기업|로컬 파일|공식 출처|크기|
|---|---|---|---|
|DEEPX|assets/logos/deepx-logo.svg|[공식 SVG](https://cdn.deepx.ai/wp-content/uploads/Logo.svg), [회사](https://deepx.ai/)|2,034 B|
|MOBILINT|assets/logos/mobilint-logo.svg|[공식 홈페이지 헤더 인라인 SVG](https://www.mobilint.com/)|4,651 B|
|FuriosaAI|assets/logos/furiosa-logo.svg|[공식 홈페이지 헤더 인라인 SVG](https://furiosa.ai/)|2,495 B|
|REBELLIONS|assets/logos/rebellions-logo.svg|[공식 SVG](https://kr.rebellions.ai/wp-content/uploads/2025/08/logo-light-bg.svg), [회사](https://rebellions.ai/)|10,391 B|

합계 19,571 B입니다. 외부 hotlink·스크린샷 트레이싱·색상 변경 없이 로컬 정적 파일로 제공합니다. DEEPX와 MOBILINT의 흰색 CI는 어두운 배경에 놓았습니다. object-fit:contain, 명시적 크기, alt, lazy loading을 적용했습니다. 이미지 실패 시 회사명 텍스트로 대체합니다. 기업 선택·로그인·프로필·신청 요약·상세·관리자 표·브로슈어 등 기존 mark 출력 위치를 공식 CI로 교체하고 표/프로필에 작은 전용 크기를 적용했습니다.

## 5. 역할별 UI

|사용자/경로|동작|
|---|---|
|ITS: apply / lookup / find-id / brochures|우측 상단 profile 영역을 hidden 처리하여 공간까지 제거. 소개자료 메뉴 유지|
|NPU: npu / matching|인증 전·후 소개자료 메뉴 숨김. 로그인 후 해당 기업명과 CI 유지|
|관리자: admin|ITS Korea 관리자 프로필 유지. 기존 진행 표/팝업/로그/필터에 시간 연장 버튼 추가|
|Home|상단 행사 안내와 역할 선택 유지. 사용자 프로필 숨김. 공개 기업 자료실과 관리자 로그인 링크 유지|

메뉴 표시 조건은 route/context 기반 UI 기능입니다. 실제 데이터 권한은 기존 서버 HMAC 인증으로 검증합니다.

## 6. 정원 정책

네 기업의 새 기본 정원은 모두 2건입니다. NPU가 변경할 수 있는 범위는 각 시간대별 정수 0~2입니다. 0은 해당 시간 신규 접수와 승인 중단, 1/2는 상담 건수입니다. input max=2와 서버 integer 검증을 함께 적용했습니다. 3 이상·소수·잘못된 타입은 거부하며, 확정 상담 수 미만으로 축소할 수 없습니다.

운영 DB의 기존 숫자를 임의로 잘라 읽지 않습니다. 과거 비활성 시간대의 정원과 상담 기록은 원래 값으로 남습니다. 따라서 기존 V2 DB는 운영 전 아래 V3 migration을 먼저 실행해야 합니다. mock도 기존 신청/이력을 보존하며 정원을 이전하고 확정 2건 초과 시 초기화하지 않고 오류를 표시합니다.

## 7. V3 migration과 데이터 구조

migrateBusinessMeetingV3()는 Apps Script 편집기 전용 함수이며 HTTP API allowlist에 없습니다.

1. 공통 ScriptLock 안에서 현재 SHEET_ID의 NPU설정·시간대별정원·상담신청을 한 번의 batchGet snapshot으로 읽습니다.
2. 모든 active 시간대의 기업·10분 시간 형식·중복 행·확정 건수를 사전 검사합니다.
3. 확정 2건 초과가 하나라도 있으면 회사 / 시간 / 확정 건수 목록을 오류에 표시하고 **어떤 시트도 변경하기 전에 전체 중단**합니다. 기존 확정 신청을 취소하지 않습니다.
4. 검사 통과 후 현재 active 정원 중 2가 아닌 행만 2로 변경하고 수정시각/수정자를 남깁니다. inactive legacy 행은 그대로 둡니다.
5. 공개 설정 캐시를 무효화하고 전체 NPU·availability·admin revision을 다시 발행합니다.

재실행 시 이미 변경된 행/시각을 다시 쓰지 않습니다. 캐시/버전 재발행은 수행하므로 버전 발행 단계의 실패 복구에도 사용할 수 있습니다. 실패한 atomic batch는 일부 행만 남기지 않습니다. 처리이력·거절사유·신청ID·신청 내용·인증 해시·SHEET_ID·TOKEN_SIGNING_SECRET·세션은 변경하지 않습니다.

**새 Sheet/열/DB를 추가하지 않습니다.** V2의 4개 Sheet와 열 순서를 그대로 씁니다: 상담신청 17열(거절사유 Q 포함), 시간대별정원 7열, 처리이력 13열, NPU설정 4열. 시간 연장도 기존 시간대별정원·처리이력만 사용합니다.

## 8–12. 시간 연장 API·재시도·이력·revision·캐시

### API 계약

POST 본문:

~~~json
{
  "action": "extendSchedule",
  "token": "관리자 HMAC 세션 토큰",
  "expectedLastTime": "16:20 – 16:30"
}
~~~

성공 예시:

~~~json
{
  "ok": true,
  "data": {
    "previousLastTime": "16:20 – 16:30",
    "time": "16:30 – 16:40",
    "providerIds": ["deepx", "mobilint", "furiosa", "rebellions"],
    "capacity": 2
  }
}
~~~

NPU 토큰·인증 없음·GET 호출은 거부합니다. 새 시간/정원/providerId를 클라이언트가 결정하지 않습니다. HMAC admin 세션을 확인하고 공통 ScriptLock 안에서 서버 DB의 실제 마지막 active 시간과 expectedLastTime을 비교합니다. 다르면 SCHEDULE_CHANGED를 반환합니다. 같은 마지막 시간으로 두 탭에서 보내거나 응답 유실 후 같은 요청을 재시도해도 다음 슬롯은 한 번만 생깁니다. 처리 중 확인 버튼을 비활성화하고 어댑터는 쓰기를 자동 재시도하지 않습니다. 오류/응답 유실 시 최신 DB를 다시 조회하며, 관리자가 추가 연장을 의도할 때는 최신 화면에서 확인 창을 새로 엽니다.

시간은 정규식과 HH:mm의 분 단위 숫자로 파싱합니다. 10분 구간·시간/분 범위·같은 날을 확인하며 날짜 경계를 넘는 추가는 SCHEDULE_LIMIT으로 거부합니다. 기본 15:50–16:30에서 연속된 운영 슬롯만 현재 시간표에 포함하여 과거 16:50 이후의 비활성 V1 시간표가 자동 복원되지 않게 합니다.

### 원자적 저장과 기존 시간 충돌

정상적인 새 시간에는 4개 NPU 정원 행(capacity=2, active=TRUE)을 생성하고 각 기업의 '시간 연장' 처리이력 1개, 총 4개를 같은 Sheets batchUpdate 한 번에 기록합니다. 기존 writeBatch_ 경로의 텍스트 셀 쓰기와 변경 버전 보호를 유지합니다. [Google batchUpdate의 원자적 적용 설명](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate).

V2가 보존한 비활성 과거 시간과 연장 시간이 겹치면 해당 기업×시간 행을 다시 활성화합니다. 이는 **중복 행을 생성하지 않기 위한 데이터 보호 예외**입니다. 기존 신청/ID/과거 이력은 그대로 남으며, 그 시간의 기존 확정이 2건을 초과하면 연장을 거부합니다. 이미 active이거나 중복된 행은 SCHEDULE_CONFLICT로 거부합니다.

이력은 처리유형=시간 연장, 처리자역할=admin, 처리자=ITS Korea 관리자, 실제 NPU기업ID, 신규 상담시간, 변경전/후 정원으로 저장합니다. 신청ID/ITS기업명/상태 변화는 없는 설정 이벤트입니다. providerId='all'을 쓰지 않습니다. 관리자 통합 로그와 처리유형 필터에서 조회됩니다.

### 자동 반영

저장 성공 후 provider 전체·availability 전체·admin revision을 발행하고 공개 config 캐시를 무효화합니다. 서버가 조회 전에 revision을 포착하는 기존 규칙을 유지하여 읽는 도중의 변경을 놓치지 않습니다. 클라이언트 config도 변경 전과 응답 성공/실패 후 무효화하여 오래된 응답의 캐시 재등록을 방지합니다.

ITS apply는 약 5초의 공개 availability revision, NPU/matching은 5초의 인증 revision, admin은 10초의 인증 revision으로 감지합니다. 변화가 있을 때만 데이터를 읽고 새 시간 버튼·정원 입력·매칭 행·진행 표/필터를 부분 갱신합니다. 신청 입력·정원 초안·필터·상세 팝업을 보호하며 숨긴 탭에서는 확인을 멈춥니다. lookup은 기존 30초 확인을 유지합니다.

### 기존 공개/인증 경계 유지

공개 GET은 getConfig, getAvailability, getAvailabilityRevision만 허용합니다. getAvailability에 includeConfig=true이면 공개 슬롯/설정/revision 봉투를 제공하되 기존 옵션 없는 호출은 배열 반환을 유지합니다. getAvailabilitySnapshot은 어댑터의 추가 메서드이며 같은 서버 API를 사용합니다. 신청 제출은 공개 POST, 조회/취소는 ID+이메일, ID 찾기는 네 정보 일치 POST입니다. NPU 목록·변경은 본인 기업 세션, 관리자 목록/overview/연장은 관리자 세션이 필요합니다.

전체 개인정보·연락처·상담내용은 공개 집계에 포함하지 않습니다. 토큰/본인확인 정보는 text/plain JSON POST 본문에만 전달하고 URL에 넣지 않습니다. 운영 인증정보는 Script Properties에 유지하고 토큰은 sessionStorage의 기존 단기 세션입니다. no-cors/JSONP로 성공을 가장하지 않습니다.

## 13–15. 디자인 참고·모바일

[2026 강릉 ITS 세계총회 공식 홈페이지](https://2026itsworldcongress.org/ITS/120002/index.do?lang=KR)를 PC와 모바일 브라우저로 실제 확인했습니다. 공식 사이트에서 보이는 녹색 강조·행사 utility line·크고 분명한 제목·넓은 간격·섹션 분리를 참고하여 이 서비스의 화면에 맞게 구성했습니다. 사이트 HTML/CSS/사진/그래픽을 복사하지 않았습니다. CI는 위 각 회사 원본입니다.

흰색/옅은 회색, 짙은 남색 본문, 녹색 강조를 쓰고 gradient/glass/큰 둥근 모서리/3D 그림자를 줄였습니다. 상단에 2026 강릉 ITS 세계총회, Beyond Mobility, Connected World, October 19–23, 2026과 본 서비스 K-NPU Business Meeting을 구분했습니다. 기존 신청/확인/로그인/시간표/로그 콘텐츠와 역할 흐름은 유지합니다.

모바일은 16~18px 여백, 1열 입력, 충분한 버튼 높이, 적절한 기업 카드 열 수, 표 내부 가로 스크롤, 화면 안의 스크롤 가능한 팝업으로 조정했습니다. 320/360/390/430/768/1024/1280/1440/1920px에서 확인했습니다. NPU 프로필의 CI와 이름도 작은 폭에서 겹치지 않습니다. system/local 폰트를 유지했고 새 웹폰트·프레임워크·대형 배경·video/canvas·외부 아이콘/애니메이션 라이브러리는 추가하지 않았습니다. PDF는 클릭 시에만 요청합니다.

## 16–19. 병목 분석·측정·최적화 결과

기능/디자인 완료 후 측정한 [최적화 전 원시 자료](v3-performance-features.json), 추가 최적화 후의 [최종 원시 자료](v3-performance-final.json)를 보관했습니다. tests/measure-business-v3.mjs는 git show로 비교 버전 파일만 읽습니다. working tree를 checkout/pull/reset하지 않습니다.

조건: 로컬 Edge headless, PC 1440×1000, 가상 신청 200개+이력 200개, API마다 고정 100ms 가상 지연, 화면별 3회 중앙값. **실제 Google 서버 왕복시간/할당량/실기기의 성능 측정이 아닙니다.** static은 main의 첫 내용 표시, ready는 데이터 반영 완료 시각입니다. 인증 후 화면은 로그인 제출 이후부터 측정하며 인증 요청도 포함합니다. 서로 다른 실행의 작은 시간 차이는 환경 오차가 있으므로 아래 속도를 운영 보장치로 해석하지 않습니다.

|화면|기존 V2 static / ready ms|기능·디자인 후 ready ms|최종 V3 static / ready ms|
|---|---|---|---|
|Home|140.6 / 301|302.1|119.2 / 178.5|
|ITS 신청|361.3 / 492.5|476.6|215.3 / 338.8|
|NPU 로그인|143.9 / 345.3|326.5|120.1 / 233.3|
|NPU 신청 목록|42.4 / 404.3|400.5|32.5 / 360.4|
|NPU 매칭|40.4 / 364.3|366.1|33.3 / 350.5|
|관리자 로그인|138.2 / 296.2|300.6|116.2 / 178.2|
|관리자 대시보드|38.2 / 461.5|425.2|31.1 / 374.4|
|신청 ID 찾기|135.2 / 293.4|305.4|115.7 / 180.5|
|브로슈어|137.7 / 315.9|300.4|120.5 / 177.4|

|화면|GAS 횟수 전→후|Sheets batchGet 전→후 (캐시 warm)|응답 JSON 합계 B 전→후|초기 main replacement 전→후|
|---|---|---|---|---|
|Home|0 → 0|0 → 0|0 → 0|1 → 1|
|ITS 신청|2 → 1|1 → 1|1,642 → 1,693|1 → 1|
|NPU 로그인|1 → 1|0 → 0|1,350 → 1,350|1 → 1|
|NPU 신청 목록|2 → 2|2 → 2|103,927 → 103,927|2 → 2|
|NPU 매칭|2 → 2|2 → 2|103,927 → 103,927|2 → 2|
|관리자 로그인|0 → 0|0 → 0|0 → 0|1 → 1|
|관리자 대시보드|2 → 2|1 → 1|177,486 → 177,486|2 → 2|
|신청 ID 찾기|0 → 0|0 → 0|0 → 0|1 → 1|
|브로슈어|0 → 0|0 → 0|0 → 0|1 → 1|

첫 apply의 cold config에서는 batchGet 2→1입니다. 표의 warm apply는 1→1입니다. NPU 로그인 페이지 getConfig가 cache miss이면 batchGet 1, hit이면 0입니다. 측정 순서상 V3 첫 NPU 로그인은 cold이므로 최종 JSON에 1/0/0 세 표본을 그대로 남겼습니다. batchGet 한 번은 여러 시트/range를 묶은 네트워크 읽기이며 '한 시트만 읽었다'는 뜻이 아닙니다. 추가 개별 rangeReads는 모든 측정 표본에서 0입니다. 각 정상 snapshot에서 동일 시트/헤더를 다시 읽지 않는 기존 요청 내 캐시를 유지합니다.

확인한 병목과 대응:

- apply의 공개 config와 availability가 분리된 두 요청: includeConfig snapshot 한 번으로 통합하여 같은 세 시트 snapshot을 재사용합니다. 최신 서버 기준 중복 getConfig=0이며 이전 서버의 배열 응답에는 호환 fallback이 있습니다. JSON 봉투로 총 payload가 51 B 늘었지만 HTTP 호출은 절반이 되었습니다.
- 목록/로그의 날짜 형식 객체를 각 행마다 생성: 동일한 Intl.DateTimeFormat 두 개를 재사용하여 200개 신청+이력 처리의 반복 비용을 줄였습니다. 결과 형식은 유지합니다.
- apply에서 변경 없는 상태도 전체 잔여석 조회: 공개 revision 확인으로 변경 없을 때 Sheets I/O=0, 시간 옵션/폼 교체=0입니다. NPU/admin의 경량 revision, in-flight 공유, 숨긴 탭 중단을 그대로 유지합니다.
- authenticated list/overview는 한 snapshot의 config를 어댑터 캐시에 반영합니다. 로그인 페이지 외 추가 getConfig 호출은 없습니다. 관리자 목록·이력은 기존 보호된 응답 한 번으로 받고 배경 변경은 해당 구역만 바꿉니다.
- JSON.stringify 비교를 포함한 200행 실제 흐름을 측정했습니다. 우선 제거할 병목은 요청 분리와 날짜 객체 반복이었으므로 안정된 비교/부분 갱신 규칙은 유지했습니다. 실제 행사 데이터 규모/Google 지연에서 추가 측정이 필요합니다.

인증 직후 main replacement=2는 초기 로딩→데이터 표시입니다. 이후 무변경 확인은 전체 main 교체=0, 실제 변경도 목록/표/통계 등의 부분 교체로 검증했습니다. 모든 정적 화면/첫 진입의 PDF 요청=0입니다. CI 네 개는 합계 약 19.6KB이며 페이지 내 필요한 이미지만 로드합니다. 정적 화면은 GAS 요청=0, NPU 로그인만 공개 config=1입니다.

## 20–21. 테스트 결과·한계

npm test: **103개 통과, 실패/건너뜀 0**. 기존 85개 케이스를 유지하고 V3 backend 14개, mock 4개를 추가했습니다. 이전 5/1/0~50 정원 fixture/기대값은 새 정책 2/0~2로 조정했습니다. 기존 XSS 검사는 공식 img 도입에 맞춰 정상 img를 금지하지 않고 악성 img/src/onerror 미출력과 escaping을 확인하도록 조정했습니다. 회귀 항목/동시성/보안 검사를 삭제하지 않았습니다.

|브라우저 검사|결과|
|---|---|
|browser-business-v3.mjs|9개 폭, 역할 UI/CI fallback/프로필 정렬, 두 차례 연장, 전 역할 자동 반영, 신청 폼 보존, mock, PDF 초기 0 통과|
|browser-business-v2.mjs|ID 찾기/자동 조회, 거절 필수 사유/초안 보존/신청자 조회, 기존 PDF 새 탭·클릭 시 요청 통과|
|browser-gas-smoke.mjs|분리된 모바일 신청→PC 관리자→NPU 승인→조회→정원 변경→취소 통과|
|browser-revision.mjs|무변경/변경, 숨김/복귀, 만료, pending 복구, 편집·필터·팝업 보존 통과|
|browser-performance.mjs|즉시 UI/요청 수/중복 방지/config 재사용/부분 렌더 통과|

실제 .gs 소스를 Google 서비스 모형에서 실행하여 마지막 자리 동시 승인, 정원 축소 경합, extension 관리자 두 탭/응답 유실 재시도/atomic batch 실패, migration 전체 사전검사/반복/인증정보 보존/legacy 충돌을 검증했습니다. 공개 개인정보 응답·ID-only 조회·다른 회사 변경·무인증 admin 접근도 거부되는지 기존 검사를 유지했습니다.

실제 Google 권한/CORS/Google 리다이렉트/네트워크 경합과 PC·모바일 운영 계정은 아직 실증하지 않았습니다. Apps Script를 직접 Google에 업로드하거나 migration을 실행한 것으로 간주하지 마세요. 재현은 npm start / npm test 및 Playwright가 설치된 환경의 node tests/browser-business-v3.mjs 등입니다. 브라우저는 실제 .gs 코드와 모형 서비스만 연결하여 운영 DB를 수정하지 않습니다.

## 22–28. 운영 적용 순서

### A. 비공개 백업과 Apps Script 반영 (22)

1. 신청/승인/정원 변경을 잠시 중단할 수 있는 시간에 진행합니다. Google Sheets에서 파일 → 사본 만들기로 **비공개 백업**을 만들고 원본/백업 공유 모두 제한됨(Restricted)인지 확인합니다. 백업 Sheet ID로 기존 SHEET_ID를 바꾸지 않습니다.
2. 현재 운영 Web App과 연결된 **기존 Apps Script 프로젝트**를 엽니다. 새 프로젝트/새 DB를 만들지 않습니다. 기존 SHEET_ID/인증 해시/서명키/세션 속성을 유지합니다.
3. 기존 **Config.gs, Code.gs, Database.gs, Services.gs**를 저장소 파일의 전체 내용으로 교체합니다.
4. 파일 옆 + → 스크립트에서 **Schedule**, **MigrationV3** 두 파일을 만들고 각각 Schedule.gs, MigrationV3.gs 전체 내용을 복사합니다. 파일명 뒤 .gs는 편집기가 붙입니다. 저장합니다.
5. 기존 **Auth.gs, Revision.gs, Setup.gs, Migration.gs, appsscript.json**을 유지합니다. 이들은 이번 diff에서 변경되지 않았습니다. 이전 revision/batchGet 버전이 빠진 오래된 프로젝트라면 저장소의 10개 .gs와 매니페스트를 모두 같은 버전으로 맞춰야 합니다.

### B. migration 실행과 확인 (23–25)

6. 상단 함수 선택에서 **migrateBusinessMeetingV3** 선택 → **실행**. 기존 계정의 Sheets 권한 승인을 요구하면 운영 소유자 계정으로 승인합니다. 실행 로그를 엽니다.
7. 성공 로그의 V3 migration: activeSlots / changedSlots / capacity:2를 확인합니다. 기본 4시간×4기업이면 activeSlots=16입니다. changedSlots는 현재 DB 값에 따라 달라집니다. 시간대별정원에서 active 행의 최대상담건수=2, 기존 비활성 시간과 상담신청/거절사유/이력/ID가 유지되는지 확인합니다.
8. CAPACITY_CONFLICT면 로그의 기업·시간·확정 건수를 보고 기존 확정 상담을 운영자가 먼저 조정합니다. 강제 취소/셀 삭제/마이그레이션 제한 무시는 하지 않습니다. 필요한 실제 일정 조정이 끝난 뒤 같은 함수를 실행합니다. 중복/형식 오류도 원본과 백업을 비교하여 원인을 해결한 후 재실행합니다.
9. **setupSystem() 재실행 불필요. configureAuthentication() 재실행 불필요.** 기존 DB/세션/비밀번호를 초기화하지 않습니다. 새 Sheet/열을 만들지 않습니다. 새 환경을 처음 만드는 경우만 [최초 구축 안내](../apps-script/README.md)의 setup/auth 절차를 따릅니다.

### C. 기존 Web App의 새 버전 배포 (26)

10. Apps Script **배포 → 배포 관리 → 현재 Web App 선택 → 연필(수정) → 버전: 새 버전 → 배포**를 실행합니다. '나로 실행(Me)'와 '모든 사용자(Anyone)' 접근을 유지합니다. 기존 배포를 갱신하여 /exec URL을 유지합니다. 파일 저장만으로 기존 배포 버전이 바뀌지 않습니다. [공식 배포 관리](https://developers.google.com/apps-script/concepts/deployments), [Web App 권한](https://developers.google.com/apps-script/guides/web).
11. 공개 URL은 assets/js/runtime-config.js 한 곳에서 확인합니다. 기존 URL을 그대로 유지했다면 수정이 없습니다. /dev나 로그인 전용 HTML 응답을 운영 API로 사용하지 않습니다.

### D. 로컬 실제 GAS 확인 후 GitHub/Pages 반영 (27)

12. runtime-config.js의 backend를 잠시 gas로 설정하고 npm start → http://127.0.0.1:4173/ 에서 **실제 DB**의 정원/시간/인증을 확인합니다. 이때는 운영 DB를 사용하므로 테스트임을 구분하는 정보로 진행하고 테스트 신청ID를 기록합니다. 자동 demo 값이 표시되면 gas 모드인지 다시 확인합니다.
13. 공식 CI 네 개의 깨짐/비율/모바일 표시를 확인합니다. 원래 backend:auto로 복원해 로컬 기본 mock/공개 호스트 GAS 규칙을 유지합니다. 공개 URL 외 비밀값을 코드에 넣지 않습니다.
14. 위 1–2절의 변경/신규 **39개 파일**을 GitHub에 add/commit/push 대상으로 사용합니다. 로그/개발 스크린샷/artifacts/실제 DB 내보내기/인증정보는 포함하지 않습니다. 기존 공개 PDF는 그대로입니다. 이 작업에서는 push를 실행하지 않았습니다.
15. 저장소 [Chojungseok/2026-ITS-World-Congress-K-NPU-Business-Meeting-](https://github.com/Chojungseok/2026-ITS-World-Congress-K-NPU-Business-Meeting-)의 Pages가 main / root를 사용 중이면 push가 자동 배포를 시작할 수 있습니다. 먼저 GAS migration/재배포/로컬 실제 연결을 완료합니다. Pages 설정의 Visit site와 배포 완료 상태를 확인하고 강력 새로고침합니다. 별도 빌드나 UI 프레임워크 설치는 없습니다.

### E. 실제 운영 PC·모바일 시험 (28)

16. 모바일에서 같은 Pages URL로 테스트 신청 → Google Sheet의 새 ID/승인대기/동의 기록/신청 이력 확인 → PC 관리자로 그 신청 확인.
17. 해당 NPU로 로그인하여 자기 기업 신청만 조회 → 승인 → 다른 PC/모바일에서 ID+이메일 조회로 확정 확인 → 취소하여 잔여석 반환 확인. ID-only/틀린 이메일/무인증 admin/다른 NPU 토큰의 신청 변경은 거부되어야 합니다.
18. NPU의 한 시간 정원을 0→1→2로 바꾸고 이미 열린 ITS 화면에서 약 5초 후 반영되는지 확인합니다. 3 및 확정 수보다 낮은 정원은 거부되어야 합니다. 정원 1의 마지막 자리를 두 브라우저에서 승인하여 한 건만 성공하는지 확인합니다.
19. 신청 ID 찾기의 네 항목 확인과 자동 조회, 거절 사유의 관리자/신청자 표시, 기존 원본 PDF 클릭 열기도 검사합니다.
20. 관리자 +10분 버튼에서 현재/추가 시간을 확인하고 한 번 승인합니다. 첫 연장은 16:30–16:40입니다. 네 기업 정원 2와 처리이력 4개, 이미 열린 ITS/NPU/matching/admin 새 행이 전체 새로고침 없이 반영되는지 확인합니다.
21. 두 관리자 탭에서 같은 expectedLastTime으로 연장하여 한 번만 추가되는지 확인합니다. 응답 지연/유실 시 같은 요청으로 두 슬롯이 생기지 않고 최신 화면을 다시 열어야 추가 연장이 되는지 확인합니다. 의도한 두 번째 연장은 16:40–16:50입니다.
22. 세 번째 16:50–17:00 연장은 과거 비활성 행이 있다면 이를 재사용합니다. 기업×시간 중복 행 없음/기존 기록 유지/확정 초과 거부를 확인합니다. 시간 연장은 실제 운영 일정의 변경이므로 시험 시간을 미리 정하고 결과를 운영 담당자가 확인합니다. 별도 자동 축소 API는 없습니다.
23. 실제 Pages origin의 GET/POST/redirect/JSON/CORS, 로그인 만료/로그아웃, 숨긴 탭 복귀, 편집 중 초안 보존과 수동 새로고침을 확인합니다. 개발자 Network에서 무변경 자동 확인은 revision만 호출하고 PDF 초기 요청=0인지 확인합니다. 실제 Google의 latency/호출 할당량을 행사 예상 데이터 규모로 측정하고 개인정보 보유기간 설정과 접근 권한도 다시 점검합니다.

운영 적용 완료 여부는 위 Google 실행·재배포와 실기기 결과로 확인해야 합니다. 저장소 코드가 실제 Drive/Sheet를 생성/수정했다고 가정하지 않습니다.
