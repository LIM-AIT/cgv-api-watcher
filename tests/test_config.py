from datetime import date

import pytest

from src.cgv_imax_watcher.config import build_date_range, parse_theaters


def test_parse_theaters():
    theaters = parse_theaters("용산아이파크몰:0013,왕십리:0074")
    assert theaters[0].name == "용산아이파크몰"
    assert theaters[0].site_no == "0013"
    assert theaters[1].site_no == "0074"


def test_parse_theaters_rejects_empty():
    with pytest.raises(ValueError):
        parse_theaters("invalid")


def test_build_date_range_is_inclusive():
    dates = build_date_range(date(2026, 8, 7), date(2026, 8, 9))
    assert dates == (
        date(2026, 8, 7),
        date(2026, 8, 8),
        date(2026, 8, 9),
    )
