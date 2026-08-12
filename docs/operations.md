# CGV WATCHER Operations Runbook

현재 안정화 버전의 운영 점검 절차입니다.

## 1. Normal Service Flow

정상 운영 시 다음이 동시에 동작합니다.

1. `watch.yml` 장시간 감시 세션 실행
2. 약 150초 간격으로 CGV API 조회
3. `docs/status.json` 갱신
4. GitHub Pages에서 최신 상태 표시
5. `subscriber-mailer.yml`이 약 30초 간격으로 구독 알림 확인
6. Supabase Realtime 채팅/Presence 동작

Dashboard:

**https://lim-ait.github.io/cgv-api-watcher/**

## 2. First Checks When Something Looks Wrong

### Dashboard data looks old

확인 순서:

1. GitHub Actions의 `CGV Watcher` workflow가 실행 중인지 확인
2. 최근 `Update dashboard status [skip ci]` commit 시간 확인
3. `docs/status.json`의 `checked_at` 확인
4. GitHub Pages latest build 상태 확인
5. 실제 Dashboard의 마지막 조회 시간 확인

`status.json` commit이 최신인데 Pages만 오래된 경우 watcher 문제가 아니라 Pages 배포/캐시 계층을 먼저 확인합니다.

### Mobile shows an older UI

현재 구조에서는 다음을 확인합니다.

1. 원래 URL로 접속
2. URL이 `app.html?t=...` 형태로 전환되는지 확인
3. `docs/index.html`이 bootstrap 구조인지 확인
4. `docs/app.html`이 최신 cache guard version을 읽는지 확인
5. `docs/app-cache-guard.js`와 `docs/sw.js`가 현재 구조인지 확인
6. GitHub Pages build가 최신 UI commit 기준 `built`인지 확인

현재는 Service Worker 등록 후 강제 reload를 하지 않습니다. 초기 진입 흔들림을 줄이기 위한 의도된 동작입니다.

## 3. Watcher Workflow

Workflow:

```text
.github/workflows/watch.yml
```

운영 특성:

- `workflow_dispatch`로 watcher job 실행
- Python 3.11
- 약 150초 주기
- 120 cycle
- 약 5시간 실행
- 종료 후 다음 세션 자동 dispatch
- `state.json`은 Actions cache로 복구/저장

### Manual restart

GitHub Actions에서 `CGV Watcher` → `Run workflow`를 실행합니다.

동일 watcher 세션이 이미 동작 중인지 먼저 확인하여 불필요한 중복 실행을 피합니다.

## 4. Current Target Configuration

`run_multi_special.py`의 `TARGETS`가 대시보드용 실제 target 정의입니다.

현재 기본값:

```text
odyssey_imax
- The Odyssey / 오디세이
- IMAX
- 2026-08-25 ~ 2026-09-07

spiderman_screenx
- Spider-Man: Brand New Day
- SCREENX
- 2026-08-19 ~ 2026-09-07
```

기본 극장:

```text
영등포타임스퀘어:0059
용산아이파크몰:0013
```

Target 변경 시 확인할 항목:

- `key`
- `display_name`
- `movie_keyword`
- `movie_no`
- `format_name`
- `date_from`
- `date_to`

`watch.yml`의 legacy personal watcher 환경변수도 별도 존재하므로 함께 확인합니다.

## 5. Status Interpretation

개별 날짜:

| Status | Meaning |
|---|---|
| `OPEN` | 지정 특별관 일정 존재 |
| `WAIT` | 영화 일정은 존재, 특별관 일정 없음 |
| `NO_SCHEDULE` | 지정 영화 일정 없음 |
| `ERROR` | CGV API/응답 처리 오류 |

Target 전체:

| Status | Meaning |
|---|---|
| `OPEN` | 하나 이상 오픈 감지 |
| `RUNNING` | 정상 감시, 오픈 없음 |
| `DEGRADED` | 일부 조회 오류 |

## 6. Subscriber Mailer

Workflow:

```text
.github/workflows/subscriber-mailer.yml
```

운영 특성:

- 약 30초 간격
- 약 5시간 세션
- 종료 후 자동 재시작
- Gmail SMTP 사용
- Supabase 구독 데이터 사용
- 최신 `docs/status.json`을 기반으로 알림 판단

문제 시 확인:

1. workflow 실행 상태
2. SMTP GitHub Secrets
3. Supabase 접근/RLS/RPC 상태
4. `STATUS_URL`에서 최신 JSON 조회 가능 여부
5. mailer log의 발송/중복방지 메시지

## 7. Realtime Chat

관련 파일:

```text
docs/chat.js
docs/chat.css
docs/chat-identity-guard.js
docs/chat-content-filter.js
docs/chat-official-admin-direct.js
docs/chat-admin-minimal-style.js
```

### Normal behavior

- 최근 50개 메시지
- 2초 전송 제한
- Realtime 메시지 반영
- Presence 접속자 표시

### Admin behavior

공식 관리자 닉네임:

```text
관리자
```

현재 UI:

- 닉네임 red
- 메시지 bold
- 강한 관리자 카드 배경 없음
- Presence에는 관리자 구분 표시 가능

관리자 표시가 일반 사용자처럼 보이면 `chat-official-admin-direct.js`가 실제 페이지에 로드되는지 먼저 확인합니다.

## 8. Protected Nicknames / Content Filter

보호 닉네임은 normalize 후 substring 기준으로 차단합니다.

대표 보호값:

```text
관리자
운영자
개발자
임우상
우상
```

예를 들어 다음도 일반 사용자에게 허용하지 않습니다.

```text
관리자123
★관리자★
관-리-자
운 영 자
임우상팬
```

공식 관리자 **시각 표시**는 substring이 아니라 exact display name `관리자` 기준으로 구분합니다.

금칙어는 프런트엔드와 DB 양쪽에서 방어하는 구조를 유지합니다.

## 9. GitHub Pages / Cache Architecture

현재 안정화 구조:

```text
root URL
  -> docs/index.html
  -> docs/app.html?t=<timestamp>
  -> app-cache-guard.js
  -> Service Worker background registration
```

중요:

- 실제 UI는 `app.html`
- `index.html`은 bootstrap
- `index.html`을 다시 대형 UI 파일로 합치지 않음
- Service Worker 활성화 시 화면 강제 reload를 다시 넣지 않음
- UI 버전 변경 시 기존 cache-version workflow와 일관성 유지

## 10. GitHub Pages Deployment Check

UI 변경 후 바로 repository 파일만 보고 완료라고 판단하지 않습니다.

확인 순서:

1. 변경 commit 생성 확인
2. Pages latest build가 해당 commit/후속 descendant commit을 포함하는지 확인
3. build status가 `built`인지 확인
4. 모바일/PC에서 실제 UI 확인

Watcher의 자동 `status.json` commit이 HEAD를 계속 이동시킬 수 있으므로, UI 파일 자체의 blob SHA와 Pages build 시점을 함께 보는 것이 안전합니다.

## 11. Safe UI Change Procedure

1. 현재 파일 fetch
2. 최신 blob SHA 확인
3. 작은 범위로 수정
4. 동일 경로를 병렬로 여러 번 write하지 않음
5. 필요하면 asset query version bump
6. Pages build 완료 확인
7. PC 확인
8. 모바일 첫 진입/재진입 확인

특히 header는 동적으로 재구성되는 부분이 있으므로 전체 구조를 불필요하게 정리하거나 rewrite하지 않는 것을 권장합니다.

## 12. Security Incident Quick Response

### Gmail secret exposed

- 즉시 App Password 폐기
- 새 App Password 생성
- GitHub Secret 교체
- Git history 정리

### Supabase high privilege credential exposed

- rotate/revoke
- workflow/server secret 교체
- DB/RLS 로그 확인
- Git history 정리

### Admin credential exposed

- 관리자 credential 변경
- 관련 DB 설정 갱신
- 의심 메시지/삭제 작업 확인

## 13. Stable-version Principle

현재 버전에서 가장 중요한 안정화 포인트는 다음입니다.

- GitHub Actions 상시 감시
- `status.json` 자동 갱신
- Dashboard/Supabase 기능 분리
- `index.html` bootstrap + `app.html` 실제 UI 분리
- 모바일 캐시 방어
- 초기 강제 reload 제거
- 관리자 표시 별도 보강 모듈

기능 추가 시 이 구조를 유지하면서 작은 단위로 확장하는 것을 기본 원칙으로 합니다.
