from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

from .models import Theater


@dataclass(frozen=True)
class Config:
    theaters: tuple[Theater, ...]
    target_dates: tuple[date, ...]
    movie_keyword: str
    interval_seconds: int
    request_timeout_seconds: int
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_app_password: str
    mail_to: str
    use_color: bool

    @classmethod
    def from_env(cls, base_dir: Path) -> "Config":
        load_dotenv(base_dir / ".env")

        theaters = parse_theaters(
            os.getenv(
                "THEATERS",
                "영등포타임스퀘어:0059,용산아이파크몰:0013",
            )
        )

        date_from = parse_date(os.getenv("DATE_FROM", "2026-08-07"))
        date_to = parse_date(os.getenv("DATE_TO", "2026-08-09"))
        target_dates = build_date_range(date_from, date_to)

        return cls(
            theaters=theaters,
            target_dates=target_dates,
            movie_keyword=os.getenv("MOVIE_KEYWORD", "스파이더맨").strip(),
            interval_seconds=max(60, int(os.getenv("INTERVAL_SECONDS", "120"))),
            request_timeout_seconds=max(
                5, int(os.getenv("REQUEST_TIMEOUT_SECONDS", "20"))
            ),
            smtp_host=os.getenv("SMTP_HOST", "smtp.gmail.com").strip(),
            smtp_port=int(os.getenv("SMTP_PORT", "465")),
            smtp_user=os.getenv("SMTP_USER", "").strip(),
            smtp_app_password=os.getenv(
                "SMTP_APP_PASSWORD", ""
            ).replace(" ", "").strip(),
            mail_to=os.getenv("MAIL_TO", "").strip(),
            use_color=os.getenv("USE_COLOR", "true").lower()
            not in {"0", "false", "no"},
        )


def parse_theaters(raw: str) -> tuple[Theater, ...]:
    theaters: list[Theater] = []

    for item in raw.split(","):
        item = item.strip()
        if ":" not in item:
            continue

        name, site_no = item.rsplit(":", 1)
        name = name.strip()
        site_no = site_no.strip()

        if name and site_no:
            theaters.append(Theater(name=name, site_no=site_no))

    if not theaters:
        raise ValueError(
            "THEATERS에 '극장명:극장번호' 형식으로 하나 이상 입력하세요."
        )

    return tuple(theaters)


def parse_date(value: str) -> date:
    return datetime.strptime(value.strip(), "%Y-%m-%d").date()


def build_date_range(start: date, end: date) -> tuple[date, ...]:
    if end < start:
        raise ValueError("DATE_TO는 DATE_FROM보다 빠를 수 없습니다.")

    dates: list[date] = []
    current = start
    while current <= end:
        dates.append(current)
        current += timedelta(days=1)

    return tuple(dates)
