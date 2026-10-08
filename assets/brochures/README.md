# NPU 기업 소개자료 PDF 배치

운영자가 제공한 PDF 4개를 아래 ASCII 파일명으로 배치했습니다. 원본과 정리된 파일의 SHA-256을 비교하여 내용이 동일함을 확인했습니다. 코드가 PDF 내용을 수정하거나 재인코딩하지 않았습니다.

이 저장소는 **Public**입니다. 여기에 커밋/푸시한 PDF는 GitHub와 GitHub Pages를 통해 공개 파일이 됩니다. 운영자가 공개 승인을 확인한 자료만 넣으세요. 접근 제한이 필요한 PDF는 이 폴더에 추가하지 않습니다.

| 공개 승인받아 준비할 원본 | 복사할 이름 |
| --- | --- |
| DEEPX 2026 기업 소개 PDF | deepx-company-profile-2026.pdf |
| MOBILINT 2026 홍보 브로슈어 PDF | mobilint-corp-brochure-2026.pdf |
| FURIOSA AI 2026 국문 소개 PDF | furiosa-sales-pitch-2026-kor.pdf |
| REBELLIONS 2026 국문 기업 소개 PDF | rebellions-company-profile-2026-kr.pdf |

제공된 원본은 [DEEPX] Company Profile_20260727_01.pdf, [모빌린트] Corp_Brochure_2026.pdf, [퓨리오사] Sales_Pitch_2026_General_KOR.pdf, [리벨리온] 회사 소개서KR ver_260710(ATOM-MAX, Rebel100™ 포함).pdf입니다. 파일명만 정리했고 내용은 그대로입니다. 향후 교체 자료도 공개 승인을 확인한 뒤 내용 변경 없이 배치하세요.

현재 assets/js/brochures.js의 네 기업 available은 true이며 자료 보기 링크가 활성화되어 있습니다. 향후 배치 후에도 해당 기업의 available만 true로 설정하세요. 배치하지 않은 기업은 false로 두어 준비 중으로 표시합니다. 운영 전 실제 /assets/brochures/... PDF 링크를 Chrome/Edge에서 클릭하여 원본/새 탭/파일명과 대소문자를 확인하세요.

메인/신청/소개자료 화면은 PDF를 preload/import/iframe/base64로 읽지 않습니다. 링크 클릭 시에만 선택한 파일을 직접 요청합니다. GAS/Sheets 접근이 없습니다. 로컬 서버는 PDF를 application/pdf로 제공합니다.
