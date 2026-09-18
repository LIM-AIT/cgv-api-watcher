from datetime import date

import run_multi_special as watcher


def make_target(match_mode: str, format_name: str) -> watcher.Target:
    return watcher.Target(
        key="test",
        display_name="가능한 사랑",
        movie_keyword="가능한 사랑",
        movie_no="",
        format_name=format_name,
        date_from=date(2026, 9, 23),
        date_to=date(2026, 9, 23),
        match_mode=match_mode,
    )


def test_any_mode_accepts_matching_movie_without_format_requirement():
    target = make_target("ANY", "전체 포맷")
    item = {
        "movNm": "가능한 사랑",
        "tcscnsGradCd": "01",
        "tcscnsGradNm": "일반",
        "scnsNm": "4관",
    }

    assert watcher.movie_matches(item, target)
    assert watcher.format_matches(item, target)


def test_format_mode_still_requires_requested_format():
    target = make_target("FORMAT", "IMAX")
    item = {
        "movNm": "가능한 사랑",
        "tcscnsGradCd": "01",
        "tcscnsGradNm": "일반",
        "scnsNm": "4관",
    }

    assert watcher.movie_matches(item, target)
    assert not watcher.format_matches(item, target)
