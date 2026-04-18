from datetime import date

from app.llm.extractor import _coerce_date


def test_coerce_date_parses_iso_date() -> None:
    assert _coerce_date("2026-03-06") == date(2026, 3, 6)


def test_coerce_date_parses_dot_day_first() -> None:
    assert _coerce_date("06.03.2026") == date(2026, 3, 6)
    assert _coerce_date("16.04.2026") == date(2026, 4, 16)


def test_coerce_date_parses_slash_day_first_when_ambiguous() -> None:
    assert _coerce_date("06/03/2026") == date(2026, 3, 6)


def test_coerce_date_respects_unambiguous_mmdd_for_slash() -> None:
    assert _coerce_date("03/16/2026") == date(2026, 3, 16)


def test_coerce_date_parses_iso_datetime_with_z_suffix() -> None:
    assert _coerce_date("2026-03-06T07:30:00Z") == date(2026, 3, 6)


def test_coerce_date_returns_none_for_invalid_value() -> None:
    assert _coerce_date("not-a-date") is None
