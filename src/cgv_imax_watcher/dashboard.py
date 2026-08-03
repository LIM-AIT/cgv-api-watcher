from __future__ import annotations

import os
from datetime import datetime, timedelta

from colorama import Fore, Style

from .config import Config
from .models import WatchResult


def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def colored(cfg: Config, text: str, tone: str) -> str:
    if not cfg.use_color:
        return text

    colors = {
        "open": Fore.GREEN,
        "wait": Fore.YELLOW,
        "error": Fore.RED,
    }
    return f"{colors.get(tone, '')}{text}{Style.RESET_ALL}"


def print_dashboard(
    cfg: Config,
    results: list[WatchResult],
    check_count: int,
    state: dict,
    email_status: str,
) -> None:
    clear_screen()

    now = datetime.now()
    next_check = now + timedelta(seconds=cfg.interval_seconds)

    print("=" * 82)
    print(" CGV IMAX API WATCHER v1.0.1")
    print("=" * 82)
    print(f" 영화       : {cfg.movie_keyword}")
    print(
        f" 감시 날짜  : {cfg.target_dates[0].isoformat()} ~ "
        f"{cfg.target_dates[-1].isoformat()}"
    )
    print(f" 감시 극장  : {', '.join(t.name for t in cfg.theaters)}")
    print(" 확인 방식  : CGV JSON API 직접 조회")
    print(f" 확인 주기  : {cfg.interval_seconds}초")
    print(f" 확인 횟수  : {check_count}회")
    print(f" 현재 시각  : {now:%Y-%m-%d %H:%M:%S}")
    print("=" * 82)

    for theater in cfg.theaters:
        print()
        print(f"[{theater.name}]")

        theater_results = [
            result
            for result in results
            if result.theater.site_no == theater.site_no
        ]

        for result in theater_results:
            label = result.target_date.strftime("%m/%d")
            if result.error:
                status = colored(cfg, "[ERROR] API 조회 실패", "error")
                detail = result.error
            elif result.imax_open:
                status = colored(cfg, "[OPEN] IMAX 예매 오픈", "open")
                detail = (
                    f"{result.movie_name} / IMAX 데이터 {result.imax_count}건"
                )
            elif result.movie_found:
                status = colored(cfg, "[WAIT] IMAX 미오픈", "wait")
                detail = "영화 일정은 있으나 IMAX 데이터는 아직 없습니다."
            else:
                status = colored(cfg, "[WAIT] 영화 일정 없음", "wait")
                detail = "해당 날짜에 영화 데이터가 아직 없습니다."

            print(f" {label} : {status}")
            print(f"          {detail}")

        print(f" 예매 페이지: {theater.booking_url}")
        print("-" * 82)

    opened = [
        f"{r.target_date:%m/%d} {r.theater.name}"
        for r in results
        if r.imax_open
    ]
    errors = [
        f"{r.target_date:%m/%d} {r.theater.name}: {r.error}"
        for r in results
        if r.error
    ]

    print()
    print("[감시 정보]")
    print(" 오픈 감지  : " + (", ".join(opened) if opened else "아직 없음"))
    print(
        f" 다음 확인  : {next_check:%H:%M:%S} "
        f"({cfg.interval_seconds}초 후)"
    )
    print(f" 이메일     : {email_status}")
    print(f" 마지막 변경: {state.get('last_change') or '아직 없음'}")
    print(" 최근 오류  : " + (" | ".join(errors) if errors else "없음"))
    print("=" * 82)
    print(" 종료하려면 Ctrl+C를 누르세요.")
