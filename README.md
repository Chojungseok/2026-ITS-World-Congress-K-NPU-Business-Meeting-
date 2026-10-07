# K-NPU Connect

강릉 K-NPU 전환 밋업의 ITS 기업 ↔ NPU 기업 1:1 비즈매칭 시스템입니다. 기존 HTML/CSS/JavaScript 화면을 유지하고, 로컬 mock과 Google Apps Script + 비공개 Google Sheets 운영 백엔드를 선택할 수 있게 구성했습니다.

현재 운영 연결용 Web App URL이 설정되어 있습니다. **이번 성능 개선 코드를 운영에 적용하려면 기존 Apps Script 배포를 새 버전으로 갱신하고 프론트엔드를 GitHub에 반영해야 합니다.** 기존 DB·URL·인증정보를 유지하며 DB를 다시 만들 필요는 없습니다. [성능 개선 및 적용 보고서](docs/performance-optimization.md)를 참고하세요.

새 환경을 처음 만드는 경우에만 [Google 설정 안내](apps-script/README.md)에 따라 권한을 승인하고 setupSystem()을 실행합니다. 저장소의 코드만으로 Google 리소스가 생성되지는 않습니다.

## 실행

Node.js 20 이상. 별도 패키지 설치나 빌드가 필요하지 않습니다.

```powershell
npm start
npm test
```

Windows에서는 start-local.cmd를 더블클릭해도 됩니다. [로컬 화면](http://127.0.0.1:4173/)에서 확인합니다. index.html을 파일로 직접 열면 로컬 실행 안내가 표시됩니다.

## 데이터 모드

assets/js/runtime-config.js 한 곳에서 공개 GAS URL과 backend를 관리합니다.

| 모드/환경 | 저장소 | 인증 |
| --- | --- | --- |
| auto + localhost/127.0.0.1 | 기존 localStorage 데모 | 기존 로컬 테스트 코드 |
| auto + GitHub Pages 등 외부 호스트 | GAS → 비공개 Google Sheets | 서버 인증 |
| gas | 로컬에서도 GAS → Google Sheets | 서버 인증 |

운영 URL이 비어 있으면 운영 설정 오류를 표시합니다. 운영 모드에서 데모 DB로 자동 대체하지 않습니다. 로컬 데모 데이터와 운영 DB는 서로 복사하거나 혼합하지 않습니다.

실제 개인정보는 Google 설정과 개인정보 안내 확정 전 로컬 테스트에 사용하지 마세요. 자동 확인 메일은 발송하지 않습니다.

## 기존 화면

| 경로 | 기능 |
| --- | --- |
| #home | 소개, ITS/NPU 선택, 신청 현황 확인, 관리자 로그인 |
| #apply | 상담 신청, 시간별 잔여 자리, 개인정보 동의 |
| #lookup | 신청ID + 이메일 조회, 승인대기/매칭확정 취소 |
| #npu | 기업 코드 로그인, 본인 기업 신청 승인/거절, 시간별 정원 |
| #matching | 로그인한 NPU의 확정 시간표·상세 |
| #admin | 관리자 인증, 5종 통계, 진행 현황 표/팝업, 복합 필터, 전체 활동 로그 |

시간은 16:50–17:30의 10분 단위 4개 구간입니다. 초기 동시 상담 건수는 딥엑스 5, 모빌린트 2, 퓨리오사 1, 리벨리온 2이며 각 시간대별 0~50으로 변경할 수 있습니다. 이미 확정한 건수 아래로 줄일 수 없습니다.

운영에서는 필요한 화면만 약 30초 주기로 서버 상태를 갱신합니다. 첫 화면과 조회 전/로그인 전 화면은 주기 조회를 하지 않습니다. 편집 중인 정원/필터는 보호하며 수동 새로고침도 제공합니다. 최종 승인 가능 여부는 항상 서버가 다시 검증합니다.

## 로컬 데모 인증

아래 값은 공개된 로컬 시연 전용이며 운영에서는 서버가 거부합니다.

| 기업 | 로컬 승인코드 |
| --- | --- |
| 딥엑스 | deepx20261022 |
| 모빌린트 | mobilint20261022 |
| 퓨리오사 | furiosa20261022 |
| 리벨리온 | rebellions20261022 |

로컬 관리자 ID: ITSKOREA9911 / PW: ITSKOREA9911!

신청 조회 예시는 DEMO-0001 + demo1@example.com입니다. 예시 입력 버튼을 사용해도 됩니다. 데모 초기화는 로컬 모드에만 존재합니다. 기존 mock의 ID-only API 계약은 테스트 호환용으로 유지하지만 화면은 이메일도 요구하고 제공된 이메일을 검증합니다. **운영 API는 ID-only 조회가 불가능합니다.**

## 파일 구조

```text
index.html
start-local.cmd
assets/
  css/styles.css
  js/bootstrap.js
  js/config.js             # 화면 기본값 + 서버 공개 설정 반영
  js/runtime-config.js     # backend, GAS URL, 갱신 주기
  js/api.js                # 유일한 데이터 계층 진입점
  js/mock-api.js           # 기존 localStorage 데모 보존
  js/gas-api.js            # 동일 계약의 HTTP 어댑터
  js/session-store.js      # 단기 토큰 sessionStorage
  js/app.js
  js/views.js
apps-script/
  Code.gs                  # 공개/인증 API 라우팅
  Config.gs                # 스키마·기본값·검증·잠금
  Setup.gs                 # setupSystem
  Auth.gs                  # 코드/비밀번호 해시, 서명 세션
  Database.gs              # Sheets 읽기 및 원자적 텍스트 쓰기
  Services.gs              # 신청·처리·정원 규칙
  appsscript.json          # 고급 Sheets API, 권한
  README.md                # 사용자 Google 설정 안내
scripts/serve.mjs
tests/mock-api.test.mjs
tests/gas-api.test.mjs
tests/gas-backend.test.mjs
tests/gas-harness.mjs
tests/browser-gas-smoke.mjs
tests/performance.test.mjs
tests/browser-performance.mjs
tests/measure-performance.mjs
docs/google-apps-script-integration.md
docs/performance-optimization.md
```

## 설정과 배포

이미 운영 중인 경우 [기존 배포 갱신 절차](apps-script/README.md#기존-운영-환경에-이번-성능-개선-적용)에 따릅니다. 아래는 신규 환경 설정 순서입니다.

1. [Google 설정 안내](apps-script/README.md)에 따라 Apps Script 파일/매니페스트를 복사합니다.
2. setupSystem 실행·Google 권한 승인 → 생성된 DB 공유가 제한됨인지 확인합니다.
3. Script Properties에 새 운영 인증정보를 입력하고 configureAuthentication을 실행합니다.
4. 운영기관이 개인정보 보유기간과 안내문을 확정합니다.
5. Web App을 나로 실행/모든 사용자 접근으로 배포합니다.
6. runtime-config.js에 /exec URL 입력 → 로컬 gas 모드로 확인합니다.
7. 확인된 코드와 공개 URL을 GitHub에 푸시하고 Pages의 main / root 배포를 사용합니다.
8. 실제 Pages 주소에서 모바일 신청 → PC 관리자/NPU 승인 → 모바일 조회를 확인합니다.

이번 성능 개선 작업에서는 Google 배포와 GitHub 푸시를 실행하지 않았습니다. 기존 GAS 배포를 먼저 새 버전으로 갱신한 다음 프론트엔드를 반영하세요. 기존 Pages가 켜져 있다면 main 푸시로 자동 배포될 수 있습니다.

## 보안과 테스트 범위

운영 인증정보·서명 비밀키·DB ID는 Script Properties에서 관리합니다. Google Sheets는 비공개이며 공개 API는 기업 설정/집계/신청 제출만 제공합니다. 조회·취소는 ID+이메일, NPU/관리자는 역할별 서버 인증이 필요합니다. HMAC 토큰은 30분 만료이며 sessionStorage에만 저장합니다.

정원 변경/승인/취소/신청은 서버 ScriptLock으로 직렬화하고 상태와 처리이력을 하나의 Sheets batchUpdate로 저장합니다. 문자열 셀은 수식으로 해석되지 않게 기록합니다.

기존 43개를 포함한 55개 Node 테스트와 Playwright의 분리된 모바일/PC 브라우저 흐름, 화면별 호출 수·비동기 로딩·갱신 경합 검사를 확인했습니다. 브라우저 검사는 모형 Google 서비스를 사용하며 실제 Google CORS/권한/할당량/실기기 동시성 시험을 대신하지 않습니다.

[성능 개선·호출 수·실기기 측정](docs/performance-optimization.md), [API 계약·구현 설계](docs/google-apps-script-integration.md)와 [실제 Google 설정·운영 전 점검](apps-script/README.md)을 참고하세요.
