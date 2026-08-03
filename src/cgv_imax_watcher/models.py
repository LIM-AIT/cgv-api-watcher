from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Theater:
    name: str
    site_no: str

    @property
    def booking_url(self) -> str:
        from urllib.parse import urlencode

        query = urlencode({"siteNm": self.name, "siteNo": self.site_no})
        return f"https://cgv.co.kr/cnm/movieBook/cinema?{query}"


@dataclass(frozen=True)
class WatchResult:
    theater: Theater
    target_date: date
    movie_found: bool
    imax_open: bool
    imax_count: int
    movie_name: str
    api_url: str
    error: str = ""
