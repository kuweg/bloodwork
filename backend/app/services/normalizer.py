"""Slugify a canonical test name for consistent grouping in the DB.

The slug is the key that lines up the same test across languages, labs, and
reports. Two rules matter for correctness:

- A percentage test and an absolute-count test of the same analyte must NOT
  collapse to the same slug (e.g. "Lymphocytes %" vs "Lymphocytes #"), or trends
  end up comparing a percentage against a cell count.
- Different spellings of the *same* concept should unify (#, "Absolute", "Count").
"""

from __future__ import annotations

import re
import unicodedata

# Split on whitespace and common punctuation/separators.
_SPLIT_RE = re.compile(r"[\s\-_.,;:/()\[\]]+")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")

# Tokens that all mean "percentage of" / "absolute count of" the same analyte.
_PERCENT_TOKENS = {"percent", "percentage", "pct"}
_COUNT_TOKENS = {"count", "absolute", "abs", "number"}

# Clinical synonyms where two names refer to the same test. Conservative on
# purpose: "Total" is meaningful for bilirubin/cholesterol/protein, so only
# alias where it is genuinely redundant (total testosterone == testosterone).
_PHRASE_ALIASES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\btotal testosterone\b"), "testosterone"),
]


def _normalize(name: str) -> str:
    s = unicodedata.normalize("NFKC", name.strip().lower())
    for pattern, replacement in _PHRASE_ALIASES:
        s = pattern.sub(replacement, s)
    # Turn the bare symbols into words so they survive tokenization instead of
    # being stripped (the old bug: "%" and "#" both vanished).
    s = s.replace("%", " percent ").replace("#", " count ")
    return s


def slugify(name: str) -> str:
    """Stable snake_case slug for a test name. Used as the DB canonical key."""
    tokens: list[str] = []
    for raw in _SPLIT_RE.split(_normalize(name)):
        token = raw
        if token in _PERCENT_TOKENS:
            token = "percent"
        elif token in _COUNT_TOKENS:
            token = "count"
        token = _NON_ALNUM_RE.sub("", token)
        if not token:
            continue
        # Collapse adjacent duplicates so "... count count" (from "Count #")
        # reads as a single "count".
        if tokens and tokens[-1] == token:
            continue
        tokens.append(token)

    return "_".join(tokens)[:64] or "unknown"
