# Changelog

All notable project changes are documented here.

## [2.0.0] - 2026-08-12

### Added
- GitHub Actions 기반 장시간 연속 CGV 감시
- GitHub Pages 실시간 상태 대시보드
- `docs/status.json` 자동 생성 및 갱신
- 다중 Target/특별관 감시 구조 (`IMAX`, `SCREENX`)
- 영화 번호(`movNo`) 기반 식별 + 키워드 fallback
- 날짜별/극장별 예매 바로가기
- Supabase 기반 실시간 채팅과 Presence
- 관리자 인증 및 관리자 전용 메시지 처리
- 공식 관리자 시각 표시
- 보호 닉네임 차단
- 채팅 금칙어/성적 표현 필터
- 구독자 이메일 알림 workflow
- 반응속도 테스트와 Global TOP 5
- 개발자 Instagram 링크
- 모바일 대응 dashboard layout

### Changed
- 프로젝트 표시명을 `CGV WATCHER`로 통일
- 로컬 PC 상시 실행 중심 구조에서 GitHub Actions 상시 운영 구조로 전환
- Dashboard 진입점을 `index.html` bootstrap + `app.html` 구조로 분리
- 모바일 브라우저의 오래된 소스 노출 문제를 줄이기 위해 Service Worker와 cache guard 적용
- 초기 진입 시 불필요한 강제 reload를 제거하여 화면 흔들림 감소
- 관리자 채팅은 카드 강조 대신 빨간 닉네임 + 볼드 메시지로 단순화
- UI cache version 자동 관리 workflow 추가

### Security
- 서버 측 RLS/RPC와 클라이언트 보호 로직을 함께 사용하도록 채팅 관리자/닉네임 정책 강화
- 관리자/운영자/개발자/임우상/우상 포함 닉네임 차단
- 채팅 금칙어를 클라이언트와 DB 양쪽에서 방어하도록 구성

### Operations
- Watcher는 약 150초 간격으로 동작하며 약 5시간 단위 세션을 자동 재시작
- Subscriber mailer는 약 30초 간격으로 상태를 확인
- `status.json` 자동 커밋으로 `main` HEAD가 자주 변경되는 운영 특성 문서화

## [1.0.1] - 2026-08-03

### Added
- One-command environment verification
- Optional live CGV API connectivity check
- Optional test email delivery check
- Windows and macOS verify scripts

## [1.0.0] - 2026-08-03

### Added
- CGV JSON schedule API monitoring
- Multi-theater and date-range monitoring
- IMAX-only detection
- Gmail notification
- Duplicate notification prevention
- Windows and macOS scripts
- Modular Python package structure
- Unit tests
- GitHub Actions CI
- Security, contribution, and distribution documentation
