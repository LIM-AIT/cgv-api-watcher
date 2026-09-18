import importlib
import json
from datetime import date

base = importlib.import_module("run_multi_special")


ODYSSEY = base.Target(
    key="odyssey_imax",
    display_name="The Odyssey",
    movie_keyword="오디세이",
    movie_no="30001323",
    format_name="IMAX",
    date_from=date(2026, 9, 16),
    date_to=date(2026, 9, 27),
    theater_site_nos=("0013",),
)

POSSIBLE_LOVE = base.Target(
    key="possible_love_any",
    display_name="가능한 사랑",
    movie_keyword="가능한 사랑",
    movie_no="30001372",
    format_name="전체 포맷",
    date_from=date(2026, 9, 23),
    date_to=date(2026, 10, 7),
    match_mode="ANY",
    theater_site_nos=("0013", "0059"),
)

# Keep the existing target key so subscriber preferences remain compatible,
# but make the SCREENX slot query-free until the next movie is selected.
SCREENX_UPCOMING = base.Target(
    key="spiderman_screenx",
    display_name="업데이트 예정",
    movie_keyword="",
    movie_no="",
    format_name="SCREENX",
    date_from=date(2099, 1, 2),
    date_to=date(2099, 1, 1),
)

base.TARGETS = (POSSIBLE_LOVE, ODYSSEY, SCREENX_UPCOMING)


def main() -> int:
    exit_code = base.main()
    if exit_code != 0:
        return exit_code

    payload = json.loads(base.STATUS_PATH.read_text(encoding="utf-8"))
    spider = (payload.get("targets") or {}).get("spiderman_screenx")
    if isinstance(spider, dict):
        spider.update(
            {
                "display_name": "업데이트 예정",
                "movie_keyword": "",
                "movie_no": "",
                "date_from": "",
                "date_to": "",
                "status": "UPCOMING",
                "theaters": [],
            }
        )

    base.STATUS_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print("Current targets applied: Odyssey IMAX / Possible Love any format / SCREENX upcoming")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
