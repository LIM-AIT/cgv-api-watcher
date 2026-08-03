from __future__ import annotations

from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .config import Config
from .models import Theater, WatchResult

API_BASE_URL = "https://cgv.co.kr/api/v1/booking/searchMovScnInfo"
COMPANY_CODE = "A420"
IMAX_GRADE_CODE = "03"


def create_http_session() -> requests.Session:
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


def normalize(value: Any) -> str:
    return str(value or "").strip().lower()


def movie_matches(item: dict[str, Any], keyword: str) -> bool:
    normalized_keyword = normalize(keyword)
    fields = (item.get("movNm"), item.get("expoProdNm"), item.get("prodNm"))
    return any(normalized_keyword in normalize(value) for value in fields)


def is_imax(item: dict[str, Any]) -> bool:
    grade_code = normalize(item.get("tcscnsGradCd"))
    grade_name = normalize(item.get("tcscnsGradNm"))
    screen_name = normalize(item.get("scnsNm"))

    return (
        grade_code == IMAX_GRADE_CODE
        or "아이맥스" in grade_name
        or "imax" in grade_name
        or "imax" in screen_name
    )


def fetch_schedule(
    session: requests.Session,
    cfg: Config,
    theater: Theater,
    target_date,
) -> WatchResult:
    params = {
        "coCd": COMPANY_CODE,
        "siteNo": theater.site_no,
        "scnYmd": target_date.strftime("%Y%m%d"),
        "rtctlScopCd": "08",
    }

    response = session.get(
        API_BASE_URL,
        params=params,
        timeout=cfg.request_timeout_seconds,
    )

    if response.status_code != 200:
        raise RuntimeError(f"CGV API HTTP {response.status_code}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise RuntimeError("CGV API가 JSON이 아닌 응답을 반환했습니다.") from exc

    if not isinstance(payload, dict):
        raise RuntimeError("CGV API 응답 구조가 예상과 다릅니다.")

    if payload.get("statusCode") not in (0, "0"):
        raise RuntimeError(
            f"CGV API 오류: {payload.get('statusMessage') or payload.get('statusCode')}"
        )

    data = payload.get("data") or []
    if not isinstance(data, list):
        raise RuntimeError("CGV API data 필드가 목록이 아닙니다.")

    movie_items = [
        item
        for item in data
        if isinstance(item, dict) and movie_matches(item, cfg.movie_keyword)
    ]
    imax_items = [item for item in movie_items if is_imax(item)]

    movie_name = ""
    if imax_items:
        movie_name = str(imax_items[0].get("movNm") or "")
    elif movie_items:
        movie_name = str(movie_items[0].get("movNm") or "")

    return WatchResult(
        theater=theater,
        target_date=target_date,
        movie_found=bool(movie_items),
        imax_open=bool(imax_items),
        imax_count=len(imax_items),
        movie_name=movie_name,
        api_url=response.url,
    )
