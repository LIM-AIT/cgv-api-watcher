from __future__ import annotations

import argparse
import time
from pathlib import Path

from colorama import init as colorama_init

from .cgv_api import create_http_session, fetch_schedule
from .config import Config
from .dashboard import clear_screen, print_dashboard
from .email_service import send_email
from .models import WatchResult
from .notifier import notify_new
from .state import load_state, reset_state
from .status_exporter import export_status


def run_check(session, cfg: Config) -> list[WatchResult]:
    results: list[WatchResult] = []

    for theater in cfg.theaters:
        for target_date in cfg.target_dates:
            try:
                result = fetch_schedule(session, cfg, theater, target_date)
            except Exception as exc:
                result = WatchResult(
                    theater=theater,
                    target_date=target_date,
                    movie_found=False,
                    imax_open=False,
                    imax_count=0,
                    movie_name="",
                    api_url="",
                    error=f"{type(exc).__name__}: {exc}",
                )
            results.append(result)

    return results


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--test-email", action="store_true")
    parser.add_argument("--reset-state", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    colorama_init()

    base_dir = Path.cwd()
    state_path = base_dir / "state.json"
    cfg = Config.from_env(base_dir)

    if args.reset_state:
        reset_state(state_path)
        print("중복 알림 기록을 초기화했습니다.")
        return 0

    if args.test_email:
        send_email(
            cfg,
            "[CGV IMAX API 감시기] 테스트 메일",
            "CGV IMAX API 감시기의 메일 설정이 정상입니다.",
        )
        print("테스트 메일을 전송했습니다.")
        return 0

    state = load_state(state_path)
    session = create_http_session()
    check_count = 0

    try:
        while True:
            check_count += 1
            try:
                results = run_check(session, cfg)

                export_status(
                    cfg,
                    results,
                    base_dir / "docs" / "status.json",
                )

                email_status = notify_new(
                    cfg, results, state, state_path
                )
                print_dashboard(
                    cfg, results, check_count, state, email_status
                )
            except KeyboardInterrupt:
                print("\n감시를 종료합니다.")
                return 0
            except Exception as exc:
                clear_screen()
                print("CGV IMAX API WATCHER")
                print(f"조회 중 오류: {type(exc).__name__}: {exc}")
                print(f"{cfg.interval_seconds}초 후 다시 시도합니다.")

            if args.once:
                return 0

            time.sleep(cfg.interval_seconds)
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
