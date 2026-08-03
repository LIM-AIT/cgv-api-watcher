from __future__ import annotations

import argparse
import importlib
import sys
from pathlib import Path

from src.cgv_imax_watcher.cgv_api import create_http_session, fetch_schedule, is_imax
from src.cgv_imax_watcher.config import Config, build_date_range, parse_theaters
from src.cgv_imax_watcher.email_service import send_email
from src.cgv_imax_watcher.state import load_state, save_state

BASE_DIR = Path(__file__).resolve().parent


class CheckResult:
    def __init__(self, name: str, passed: bool, detail: str = "") -> None:
        self.name = name
        self.passed = passed
        self.detail = detail


def run_check(name: str, func) -> CheckResult:
    try:
        detail = func()
        return CheckResult(name, True, str(detail or "정상"))
    except Exception as exc:
        return CheckResult(name, False, f"{type(exc).__name__}: {exc}")


def check_python_version() -> str:
    if sys.version_info < (3, 11):
        raise RuntimeError(f"Python 3.11 이상 필요, 현재 {sys.version.split()[0]}")
    return sys.version.split()[0]


def check_required_packages() -> str:
    for package in ("requests", "dotenv", "colorama"):
        importlib.import_module(package)
    return "requests, python-dotenv, colorama"


def check_env_file() -> str:
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        raise FileNotFoundError(".env 파일이 없습니다.")
    return str(env_path)


def load_config() -> Config:
    return Config.from_env(BASE_DIR)


def check_config() -> str:
    cfg = load_config()
    return (
        f"극장 {len(cfg.theaters)}개, "
        f"날짜 {len(cfg.target_dates)}일, "
        f"영화 '{cfg.movie_keyword}'"
    )


def check_theater_parser() -> str:
    parsed = parse_theaters("용산아이파크몰:0013,왕십리:0074")
    if parsed[0].site_no != "0013" or parsed[1].site_no != "0074":
        raise AssertionError("극장 파싱 결과가 예상과 다릅니다.")
    return "극장명/코드 파싱"


def check_date_range() -> str:
    from datetime import date

    dates = build_date_range(date(2026, 8, 7), date(2026, 8, 9))
    if len(dates) != 3:
        raise AssertionError("날짜 범위 계산 오류")
    return "포함 범위 3일"


def check_imax_logic() -> str:
    if not is_imax({"tcscnsGradCd": "03"}):
        raise AssertionError("IMAX 코드 판별 실패")
    if not is_imax({"tcscnsGradNm": "아이맥스"}):
        raise AssertionError("IMAX 명칭 판별 실패")
    return "코드 및 명칭 판별"


def check_state_manager() -> str:
    test_path = BASE_DIR / ".verify_state.json"
    try:
        state = {"notified": {"sample": "value"}, "last_change": "", "last_email": ""}
        save_state(test_path, state)
        loaded = load_state(test_path)
        if loaded["notified"].get("sample") != "value":
            raise AssertionError("상태 저장/조회 불일치")
        return "state.json 저장/조회"
    finally:
        if test_path.exists():
            test_path.unlink()


def check_email_config() -> str:
    cfg = load_config()
    missing = []
    if not cfg.smtp_user:
        missing.append("SMTP_USER")
    if not cfg.smtp_app_password:
        missing.append("SMTP_APP_PASSWORD")
    if not cfg.mail_to:
        missing.append("MAIL_TO")
    if missing:
        raise ValueError("누락: " + ", ".join(missing))
    return f"{cfg.smtp_user} -> {cfg.mail_to}"


def check_cgv_api() -> str:
    cfg = load_config()
    theater = cfg.theaters[0]
    target_date = cfg.target_dates[0]

    session = create_http_session()
    try:
        result = fetch_schedule(session, cfg, theater, target_date)
    finally:
        session.close()

    return (
        f"{theater.name} / {target_date.isoformat()} / "
        f"영화={result.movie_found}, IMAX={result.imax_open}"
    )


def send_test_email() -> str:
    cfg = load_config()
    send_email(
        cfg,
        "[CGV IMAX Watcher] Verification Test",
        "CGV IMAX API Watcher v1.0.1 검증 메일입니다.",
    )
    return f"전송 완료: {cfg.mail_to}"


def print_report(results: list[CheckResult]) -> None:
    width = 72
    print("=" * width)
    print(" CGV IMAX API WATCHER - VERIFICATION")
    print("=" * width)

    for result in results:
        status = "PASS" if result.passed else "FAIL"
        print(f"[{status}] {result.name}")
        print(f"       {result.detail}")

    passed = sum(1 for result in results if result.passed)
    total = len(results)

    print("-" * width)
    print(f"Overall Result: {passed} / {total} PASS")
    print("=" * width)

    if passed != total:
        print("실패 항목을 수정한 뒤 verify를 다시 실행하세요.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--send-email",
        action="store_true",
        help="실제 테스트 이메일도 발송",
    )
    args = parser.parse_args()

    checks = [
        ("Python Version", check_python_version),
        ("Required Packages", check_required_packages),
        (".env File", check_env_file),
        ("Configuration", check_config),
        ("Theater Parsing", check_theater_parser),
        ("Date Range", check_date_range),
        ("IMAX Detection", check_imax_logic),
        ("State Manager", check_state_manager),
        ("Email Configuration", check_email_config),
        ("CGV API Connection", check_cgv_api),
    ]

    if args.send_email:
        checks.append(("Email Delivery", send_test_email))

    results = [run_check(name, func) for name, func in checks]
    print_report(results)

    return 0 if all(result.passed for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
