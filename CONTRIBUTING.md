# Contributing

CGV WATCHER는 Python watcher, GitHub Actions, GitHub Pages 프런트엔드, Supabase 기반 채팅/알림 기능으로 구성됩니다.

## Before You Change Anything

1. 현재 `main`을 기준으로 작업합니다.
2. `docs/status.json`은 자동화가 자주 갱신하므로 일반 기능 수정과 상태 데이터 변경을 섞지 않는 것을 권장합니다.
3. UI 변경 전 `docs/app.html`, 관련 JS/CSS, cache guard 구조를 먼저 확인합니다.
4. 관리자/채팅 기능 변경 시 클라이언트 코드만 보고 보안을 판단하지 말고 Supabase RLS/RPC 정책도 함께 확인합니다.

## Local Setup

```bash
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate  # Windows

pip install -r requirements.txt -r requirements-dev.txt
```

`.env.example`을 `.env`로 복사하고 필요한 테스트 값을 입력합니다. 실제 Gmail App Password나 다른 비밀값은 커밋하지 마세요.

## Required Checks

Python 변경:

```bash
ruff check .
pytest
```

Watcher 동작 확인:

```bash
python run.py --once
python run_multi_special.py
```

환경 검증:

```bash
python verify.py
```

## Frontend Changes

GitHub Pages의 실제 화면은 `docs/app.html`입니다. 루트 `docs/index.html`은 cache-safe bootstrap 역할만 합니다.

UI 작업 시 다음 원칙을 지킵니다.

- `index.html`을 실제 대시보드 화면으로 되돌리지 않습니다.
- 모바일 캐시 안정화용 `app-cache-guard.js` / `sw.js` 구조를 임의로 제거하지 않습니다.
- JS/CSS URL 버전 변경이 필요한 경우 기존 cache-version 흐름과 함께 처리합니다.
- 모바일 레이아웃을 우선 확인합니다.
- 동적 header 구성 코드는 기존 구조를 확인한 뒤 최소 범위로 수정합니다.

## Chat / Admin Changes

관련 파일:

- `docs/chat.js`
- `docs/chat.css`
- `docs/chat-identity-guard.js`
- `docs/chat-content-filter.js`
- `docs/chat-official-admin-direct.js`
- `docs/chat-admin-minimal-style.js`

현재 정책:

- 공식 관리자 표시명은 정확히 `관리자`
- 공식 관리자 메시지는 빨간 닉네임 + 볼드 본문
- 일반 사용자는 보호 표현이 포함된 닉네임을 사용할 수 없음
- 관리자 권한 작업은 Supabase RPC/RLS를 통해 서버 측에서 제한
- 금칙어 필터는 프런트엔드와 DB 양쪽 방어를 유지

## Workflow Changes

주요 workflow:

- `.github/workflows/watch.yml`
- `.github/workflows/subscriber-mailer.yml`
- `.github/workflows/restart-dates.yml`
- `.github/workflows/ui-cache-version.yml`
- `.github/workflows/ci.yml`

`watch.yml`은 약 5시간 단위 세션 종료 후 다음 세션을 자동 dispatch합니다. 연속 실행 구조를 수정할 때는 중복 실행과 동시성 설정을 반드시 확인합니다.

## Pull Requests

PR에는 최소한 다음을 적어주세요.

- 변경 목적
- 영향받는 파일/기능
- 로컬/CI 테스트 결과
- UI 변경 시 모바일 확인 여부
- Supabase 정책 변경이 있다면 migration/RLS/RPC 영향

## Project Boundaries

다음 기능은 추가하지 않습니다.

- 자동 예매
- 자동 좌석 선점/예약
- 자동 결제
- CAPTCHA 우회
- 접근 제어 우회
- 서비스에 과도한 요청을 발생시키는 구현
