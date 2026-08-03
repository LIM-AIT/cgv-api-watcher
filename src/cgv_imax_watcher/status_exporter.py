from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .config import Config
from .models import WatchResult

KST = timezone(timedelta(hours=9))


def export_status(
    cfg: Config,
    results: list[WatchResult],
    output_path: Path,
) -> None:
    now = datetime.now(KST)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "service": "CGV API Watcher",
        "status": _overall_status(results),
        "checked_at": now.isoformat(timespec="seconds"),
        "checked_at_display": now.strftime("%Y-%m-%d %H:%M:%S KST"),
        "movie_keyword": cfg.movie_keyword,
        "date_from": cfg.target_dates[0].isoformat(),
        "date_to": cfg.target_dates[-1].isoformat(),
        "theaters": [
            {
                "name": theater.name,
                "site_no": theater.site_no,
                "booking_url": theater.booking_url,
                "results": [
                    {
                        "date": result.target_date.isoformat(),
                        "movie_found": result.movie_found,
                        "imax_open": result.imax_open,
                        "imax_count": result.imax_count,
                        "movie_name": result.movie_name,
                        "error": result.error,
                        "status": _result_status(result),
                    }
                    for result in results
                    if result.theater.site_no == theater.site_no
                ],
            }
            for theater in cfg.theaters
        ],
    }

    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _result_status(result: WatchResult) -> str:
    if result.error:
        return "ERROR"
    if result.imax_open:
        return "OPEN"
    if result.movie_found:
        return "WAIT"
    return "NO_SCHEDULE"


def _overall_status(results: list[WatchResult]) -> str:
    if any(result.imax_open for result in results):
        return "OPEN"
    if any(result.error for result in results):
        return "DEGRADED"
    return "RUNNING"
