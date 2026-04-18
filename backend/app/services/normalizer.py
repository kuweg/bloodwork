"""Slugify a canonical test name for consistent grouping in the DB."""

from __future__ import annotations

import re
import unicodedata

_WHITESPACE_RE = re.compile(r"[\s\-_.,;:/()\[\]]+")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9_]+")


def _normalize_token(value: str) -> str:
    value = value.strip().lower()
    value = unicodedata.normalize("NFKC", value)
    value = _WHITESPACE_RE.sub(" ", value)
    return value.strip()


def slugify(name: str) -> str:
    """Stable snake_case slug for a test name. Used as the DB canonical key."""
    slug = _normalize_token(name).replace(" ", "_")
    slug = _NON_ALNUM_RE.sub("_", slug).strip("_")
    return slug[:64] or "unknown"
