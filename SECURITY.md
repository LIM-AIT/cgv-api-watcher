# Security Policy

CGV WATCHER는 GitHub Actions, GitHub Pages, Gmail SMTP, Supabase를 함께 사용합니다. public repository에 노출되어도 되는 값과 절대 노출하면 안 되는 값을 구분해서 관리해야 합니다.

## Secrets That Must Never Be Committed

다음 값은 repository, Pages 정적 파일, 로그, 스크린샷에 포함하지 마세요.

- `.env`
- Gmail App Password
- `SMTP_APP_PASSWORD`
- Supabase service-role key
- 관리자 비밀번호
- 관리자 비밀번호 원문 또는 복구 가능한 형태의 값
- 개인 API secret/token
- `state.json`에 개인/민감정보가 포함되는 경우 해당 파일

GitHub Actions에서는 민감값을 GitHub Secrets로 주입합니다.

## Supabase Browser Keys

브라우저에서 사용하는 publishable/anon key는 프런트엔드에서 보일 수 있다는 전제로 설계합니다. 해당 키 자체를 비밀값처럼 신뢰하지 않습니다.

보안 경계는 다음에 둡니다.

- Row Level Security (RLS)
- 제한된 RPC 권한
- 필요한 경우 `SECURITY DEFINER` 함수의 최소 권한 설계
- public/anon role에 불필요한 table/function 권한을 부여하지 않음

Supabase service-role key는 절대 GitHub Pages JavaScript에 넣지 않습니다.

## Chat Security

현재 채팅은 클라이언트 방어와 DB 방어를 함께 사용합니다.

- 보호 닉네임 substring 차단
- 공식 관리자 표시명은 정확히 `관리자`
- 관리자 전용 동작은 비밀번호 검증 RPC 사용
- 관리자 메시지 전송은 서버 측 RPC를 통해 처리
- 일반 사용자가 관리자 표시명을 직접 게시하지 못하도록 RLS 정책 유지
- 금칙어/부적절 표현은 프런트엔드 필터 + DB trigger/policy 양쪽에서 방어

클라이언트 JavaScript의 클래스명/버튼 숨김만으로 관리자 권한을 보호하지 않습니다.

## Realtime Presence Caveat

Supabase Realtime Presence는 클라이언트가 전송한 metadata를 기반으로 합니다. 따라서 Presence의 `관리자` 표시는 일반적인 UI 사용에서는 보호되지만, 보안상 강한 신원 증명 수단으로 간주하지 않습니다.

메시지 작성/삭제 같은 실제 권한은 Presence가 아니라 서버 측 RPC/RLS로 판단합니다.

## GitHub Actions

Workflow 수정 시 다음을 확인합니다.

- `permissions:` 범위를 필요한 수준으로만 유지
- secret을 `echo`하거나 로그에 출력하지 않음
- 외부 PR/신뢰할 수 없는 입력에 secrets를 전달하지 않음
- 자동 commit/push workflow가 다른 workflow와 충돌하지 않는지 확인

## GitHub Pages

`docs/`는 전부 public 정적 파일입니다.

따라서 다음 파일에는 비밀값이 있어서는 안 됩니다.

- `docs/*.html`
- `docs/*.js`
- `docs/*.json`
- `docs/*.css`

Public key, publishable key처럼 공개를 전제로 한 값만 포함합니다.

## If a Secret Is Exposed

### Gmail App Password

1. Google 계정에서 즉시 폐기합니다.
2. 새 App Password를 생성합니다.
3. GitHub Secret을 교체합니다.
4. Git history에 커밋됐다면 history에서도 제거합니다.

### Supabase High-privilege Key

1. 즉시 rotate/revoke합니다.
2. 사용하는 workflow/server 환경의 secret을 교체합니다.
3. RLS/RPC 로그와 DB 변경 내역을 확인합니다.
4. public repository history에서 제거합니다.

### Admin Credential

1. 관리자 credential을 즉시 변경합니다.
2. 관련 DB config/secret을 갱신합니다.
3. 의심스러운 관리자 메시지 삭제/변경 기록을 확인합니다.

## Reporting

보안 문제는 public Issue에 credential이나 재현용 secret을 올리지 말고 repository owner에게 비공개로 전달하세요.
