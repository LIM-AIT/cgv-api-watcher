from src.cgv_imax_watcher.cgv_api import is_imax, movie_matches


def test_movie_matches_uses_multiple_name_fields():
    item = {"expoProdNm": "스파이더맨-브랜드 뉴 데이(IMAX 2D)"}
    assert movie_matches(item, "스파이더맨")


def test_imax_detects_grade_code():
    assert is_imax({"tcscnsGradCd": "03"})


def test_imax_detects_name_as_fallback():
    assert is_imax({"tcscnsGradNm": "아이맥스"})
