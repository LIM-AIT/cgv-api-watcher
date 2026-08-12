from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

API_BASE_URL = "https://cgv.co.kr/api/v1/booking/searchMovScnInfo"
BOOKING_BASE_URL = "https://cgv.co.kr/cnm/movieBook/movie"
COMPANY_CODE = "A420"
KST = timezone(timedelta(hours=9))
BASE_DIR = Path(__file__).resolve().parent
STATUS_PATH = BASE_DIR / "docs" / "status.json"


@dataclass(frozen=True)
class Target:
    key: str
    display_name: str
    movie_keyword: str
    movie_no: str
    format_name: str
    date_from: date
    date_to: date


TARGETS = (
    Target(
        key="odyssey_imax",
        display_name="The Odyssey",
        movie_keyword="오디세이",
        movie_no="30001323",
        format_name="IMAX",
        date_from=date(2026, 8, 25),
        date_to=date(2026, 9, 7),
    ),
    Target(
        key="spiderman_screenx",
        display_name="Spider-Man: Brand New Day",
        movie_keyword="스파이더맨-브랜드 뉴 데이",
        movie_no="30001192",
        format_name="SCREENX",
        date_from=date(2026, 8, 19),
        date_to=date(2026, 9, 7),
    ),
)


def create_session() -> requests.Session:
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        status=3,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.mount("https://", adapter)
    session.headers.update(
        {
            "Accept": "application/json, text/plain, */*",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/139.0.0.0 Safari/537.36"
            ),
            "Referer": "https://cgv.co.kr/cnm/movieBook/cinema",
        }
    )
    return session


def parse_theaters() -> list[dict[str, str]]:
    raw = os.getenv(
        "THEATERS",
        "영등포타임스퀘어:0059,용산아이파크몰:0013",
    )
    theaters: list[dict[str, str]] = []
    for part in raw.split(","):
        part = part.strip()
        if ":" not in part:
            continue
        name, site_no = part.rsplit(":", 1)
        name = name.strip()
        site_no = site_no.strip()
        if name and site_no:
            theaters.append({"name": name, "site_no": site_no})
    if not theaters:
        raise RuntimeError("No theaters configured")
    return theaters


def normalize(value: Any) -> str:
    return str(value or "").strip().lower()


def movie_matches(item: dict[str, Any], target: Target) -> bool:
    mov_no = str(item.get("movNo") or "").strip()
    if mov_no and mov_no == target.movie_no:
        return True
    keyword = normalize(target.movie_keyword)
    fields = (
        item.get("movNm"),
        item.get("expoProdNm"),
        item.get("prodNm"),
    )
    return any(keyword in normalize(value) for value in fields)


def format_text(item: dict[str, Any]) -> str:
    fields = (
        item.get("tcscnsGradCd"),
        item.get("tcscnsGradNm"),
        item.get("scnsNm"),
        item.get("expoProdNm"),
        item.get("prodNm"),
        item.get("scnTypeNm"),
        item.get("theaterTypeNm"),
    )
    return " ".join(normalize(value) for value in fields if value is not None)


def format_matches(item: dict[str, Any], target: Target) -> bool:
    text = format_text(item)
    if target.format_name == "IMAX":
        grade_code = normalize(item.get("tcscnsGradCd"))
        return grade_code == "03" or "imax" in text or "아이맥스" in text
    if target.format_name == "SCREENX":
        return "screenx" in text or "스크린엑스" in text
    return normalize(target.format_name) in text


def detected_format_name(item: dict[str, Any], target: Target) -> str:
    candidates = (
        item.get("tcscnsGradNm"),
        item.get("scnsNm"),
        item.get("prodNm"),
        item.get("expoProdNm"),
    )
    for value in candidates:
        text = str(value or "").strip()
        normalized = text.lower()
        if target.format_name == "IMAX" and (
            "imax" in normalized or "아이맥스" in normalized
        ):
            return text
        if target.format_name == "SCREENX" and (
            "screenx" in normalized or "스크린엑스" in normalized
        ):
            return text
    return target.format_name


def build_booking_url(
    target: Target,
    theater: dict[str, str],
    target_date: date,
    item: dict[str, Any] | None = None,
) -> str:
    item = item or {}
    params = {
        "movNo": str(item.get("movNo") or target.movie_no).strip(),
        "scnSseq": str(item.get("scnSseq") or "").strip(),
        "scnYmd": str(item.get("scnYmd") or target_date.strftime("%Y%m%d")).strip(),
        "scnsNo": str(item.get("scnsNo") or "").strip(),
        "siteNm": str(item.get("siteNm") or f"CGV {theater['name']}").strip(),
        "siteNo": str(item.get("siteNo") or theater["site_no"]).strip(),
    }
    return f"{BOOKING_BASE_URL}?{urlencode({k: v for k, v in params.items() if v})}"


def fetch_day(
    session: requests.Session,
    theater: dict[str, str],
    target_date: date,
) -> tuple[list[dict[str, Any]], str]:
    response = session.get(
        API_BASE_URL,
        params={
            "coCd": COMPANY_CODE,
            "siteNo": theater["site_no"],
            "scnYmd": target_date.strftime("%Y%m%d"),
            "rtctlScopCd": "08",
        },
        timeout=max(5, int(os.getenv("REQUEST_TIMEOUT_SECONDS", "20"))),
    )
    if response.status_code != 200:
        return [], f"CGV API HTTP {response.status_code}"
    try:
        payload = response.json()
    except ValueError:
        return [], "CGV API returned non-JSON response"
    if not isinstance(payload, dict):
        return [], "Unexpected CGV API response"
    if payload.get("statusCode") not in (0, "0"):
        return [], f"CGV API error: {payload.get('statusMessage') or payload.get('statusCode')}"
    data = payload.get("data") or []
    if not isinstance(data, list):
        return [], "Unexpected CGV API data field"
    return [item for item in data if isinstance(item, dict)], ""


def target_dates(target: Target) -> list[date]:
    days: list[date] = []
    current = target.date_from
    while current <= target.date_to:
        days.append(current)
        current += timedelta(days=1)
    return days


def make_result(
    target: Target,
    theater: dict[str, str],
    target_date: date,
    items: list[dict[str, Any]],
    error: str,
) -> dict[str, Any]:
    if error:
        return {
            "date": target_date.isoformat(),
            "movie_found": False,
            "format_open": False,
            "format_count": 0,
            "movie_name": "",
            "format_name": target.format_name,
            "error": error,
            "status": "ERROR",
            "booking_url": "",
            "imax_open": False,
            "imax_count": 0,
        }

    movie_items = [item for item in items if movie_matches(item, target)]
    format_items = [item for item in movie_items if format_matches(item, target)]
    movie_name = ""
    if movie_items:
        movie_name = str(movie_items[0].get("movNm") or target.display_name).strip()
    format_name = target.format_name
    booking_url = ""
    if format_items:
        format_name = detected_format_name(format_items[0], target)
        booking_url = build_booking_url(target, theater, target_date, format_items[0])

    if format_items:
        status = "OPEN"
    elif movie_items:
        status = "WAIT"
    else:
        status = "NO_SCHEDULE"

    opened = bool(format_items)
    count = len(format_items)
    return {
        "date": target_date.isoformat(),
        "movie_found": bool(movie_items),
        "format_open": opened,
        "format_count": count,
        "movie_name": movie_name,
        "format_name": format_name,
        "error": "",
        "status": status,
        "booking_url": booking_url,
        # Legacy aliases keep the current dashboard code backward-compatible.
        "imax_open": opened,
        "imax_count": count,
    }


def target_status(theaters: list[dict[str, Any]]) -> str:
    results = [result for theater in theaters for result in theater.get("results", [])]
    if any(result.get("format_open") for result in results):
        return "OPEN"
    if any(result.get("error") for result in results):
        return "DEGRADED"
    return "RUNNING"


def main() -> int:
    theaters = parse_theaters()
    session = create_session()

    union_dates = sorted({day for target in TARGETS for day in target_dates(target)})
    cache: dict[tuple[str, date], tuple[list[dict[str, Any]], str]] = {}
    for theater in theaters:
        for day in union_dates:
            cache[(theater["site_no"], day)] = fetch_day(session, theater, day)

    target_payloads: dict[str, dict[str, Any]] = {}
    for target in TARGETS:
        target_theaters: list[dict[str, Any]] = []
        for theater in theaters:
            results = []
            for day in target_dates(target):
                items, error = cache[(theater["site_no"], day)]
                results.append(make_result(target, theater, day, items, error))
            target_theaters.append(
                {
                    "name": theater["name"],
                    "site_no": theater["site_no"],
                    "booking_url": build_booking_url(target, theater, target.date_from),
                    "results": results,
                }
            )

        target_payloads[target.key] = {
            "id": target.key,
            "display_name": target.display_name,
            "movie_keyword": target.movie_keyword,
            "movie_no": target.movie_no,
            "format": target.format_name,
            "date_from": target.date_from.isoformat(),
            "date_to": target.date_to.isoformat(),
            "status": target_status(target_theaters),
            "theaters": target_theaters,
        }

    now = datetime.now(KST)
    default_target = target_payloads["odyssey_imax"]
    payload = {
        "service": "CGV WATCHER",
        "status": default_target["status"],
        "checked_at": now.isoformat(timespec="seconds"),
        "checked_at_display": now.strftime("%Y-%m-%d %H:%M:%S KST"),
        "default_target": "odyssey_imax",
        "movie_keyword": default_target["movie_keyword"],
        "display_name": default_target["display_name"],
        "format": default_target["format"],
        "date_from": default_target["date_from"],
        "date_to": default_target["date_to"],
        "theaters": default_target["theaters"],
        "targets": target_payloads,
    }

    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATUS_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        "Multi target status exported: "
        + ", ".join(
            f"{key}={value['status']}" for key, value in target_payloads.items()
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
