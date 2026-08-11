from __future__ import annotations

import hashlib
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

from .cgv_api import IMAX_GRADE_CODE
from .config import Config
from .email_service import send_email
from .models import WatchResult
from .state import save_state

ODYSSEY_MOVIE_NO = "30001323"


def result_key(result: WatchResult) -> str:
    return (
        f"{result.theater.site_no}|"
        f"{result.target_date.isoformat()}|"
        f"{IMAX_GRADE_CODE}"
    )


def result_signature(cfg: Config, result: WatchResult) -> str:
    payload = "|".join(
        [
            result_key(result),
            cfg.movie_keyword,
            result.movie_name.strip().lower(),
            "OPEN",
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def booking_url_for_result(result: WatchResult) -> str:
    if not result.theater.site_no:
        return result.theater.booking_url

    params = urlencode(
        {
            "movNo": ODYSSEY_MOVIE_NO,
            "scnYmd": result.target_date.strftime("%Y%m%d"),
            "siteNm": f"CGV {result.theater.name}",
            "siteNo": result.theater.site_no,
        }
    )
    return f"https://cgv.co.kr/cnm/movieBook/movie?{params}"


def notify_new(
    cfg: Config,
    results: list[WatchResult],
    state: dict,
    state_path: Path,
) -> str:
    notified = state.setdefault("notified", {})
    sent_items: list[str] = []

    for result in results:
        if not result.imax_open:
            continue

        key = result_key(result)
        signature = result_signature(cfg, result)

        if notified.get(key) == signature:
            continue

        movie_name = result.movie_name or cfg.movie_keyword
        booking_url = booking_url_for_result(result)
        body = f"""CGV IMAX 예매가 열렸습니다.

극장: {result.theater.name}
날짜: {result.target_date.isoformat()}
영화: {movie_name}

CGV 상영 일정 API에서 해당 영화의 IMAX 데이터가 처음 확인되었습니다.

오디세이 IMAX 바로 예매하기:
{booking_url}

자동 예매가 아닌 오픈 감지 알림입니다.
링크를 열어 해당 날짜의 회차를 확인하고 예매하세요.
"""

        send_email(
            cfg,
            f"[CGV IMAX 오픈] {result.target_date:%m/%d} {result.theater.name}",
            body,
        )

        now_text = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        notified[key] = signature
        sent_items.append(f"{result.target_date:%m/%d} {result.theater.name}")
        state["last_change"] = (
            f"{now_text} / {result.target_date:%m/%d} "
            f"{result.theater.name} IMAX OPEN"
        )
        state["last_email"] = now_text

    save_state(state_path, state)

    if sent_items:
        return "발송 완료: " + ", ".join(sent_items)
    if state.get("last_email"):
        return f"대기 중 (마지막 발송 {state['last_email']})"
    return "대기 중"
