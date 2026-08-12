# Distribution Checklist

CGV WATCHER를 복제/배포할 때 사용하는 체크리스트입니다.

## Repository / GitHub Deployment

필수 포함:

- `src/`
- `run.py`
- `run_multi_special.py`
- `run_subscriber_mailer.py`
- `requirements.txt`
- `requirements-dev.txt`
- `.env.example`
- `scripts/`
- `tests/`
- `docs/`
- `.github/workflows/`
- `README.md`
- `CHANGELOG.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `LICENSE`

GitHub Pages는 `main` 브랜치의 `/docs`를 기준으로 서비스합니다.

## GitHub Secrets

운영 repository에서는 필요한 비밀값을 파일에 저장하지 말고 GitHub Secrets로 관리합니다.

대표 항목:

- `SMTP_USER`
- `SMTP_APP_PASSWORD`
- `MAIL_TO`
- `THEATERS` (운영 설정으로 사용할 경우)

Supabase service-role key, 관리자 비밀번호/해시 원본 등 권한이 높은 값은 브라우저 소스나 public repository에 포함하지 않습니다.

## Never Include

- `.env`
- `.venv/`
- `state.json`
- `__pycache__/`
- `.pytest_cache/`
- Gmail App Password
- Supabase service-role key
- 관리자 비밀번호 또는 비밀 해시 원본
- 개인 테스트용 secret dump

## Dashboard Files

`docs/`는 단순 문서 폴더가 아니라 **실제 GitHub Pages 배포 루트**입니다. 배포 패키지에서 제외하면 안 됩니다.

특히 다음 파일은 서비스 동작에 필요합니다.

```text
docs/index.html
docs/app.html
docs/status.json
docs/app-cache-guard.js
docs/sw.js
docs/chat.js
docs/chat.css
docs/alerts.js
docs/alerts.css
```

추가 JS 모듈들도 `app.html`/다른 모듈에서 동적으로 참조하므로 `docs/*.js`를 임의로 선별 제거하지 않는 것을 권장합니다.

## Before Publishing

- `ruff check .`
- `pytest`
- GitHub Actions workflow syntax 확인
- GitHub Pages source가 `main /docs`인지 확인
- dashboard 루트 URL 접속 확인
- 모바일에서 첫 진입/재진입 확인
- 관리자 채팅 표시 확인
- `.env`/secret 파일이 commit history에 포함되지 않았는지 확인

## Local-only ZIP

로컬 watcher만 전달하는 별도 ZIP을 만든다면 GitHub Pages/Supabase 기능을 제외할 수 있지만, 현재 안정화 운영판은 GitHub repository 자체를 배포 단위로 보는 것을 권장합니다.
