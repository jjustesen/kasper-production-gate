"""Deterministic copy checks: banned phrases and discount caps."""

import re

_DISCOUNT = re.compile(
    r"(\d{1,3}(?:[.,]\d+)?)\s?%\s*(?:off|discount|desconto)"
    r"|(?:save|discount of|desconto de)\s*(\d{1,3}(?:[.,]\d+)?)\s?%",
    re.IGNORECASE,
)


def _phrase_pattern(phrase: str) -> re.Pattern:
    # Whole words only ("cure" must not match "secure"), and the words of a
    # phrase may be separated by spaces or hyphens ("before-and-after").
    words = [re.escape(w) for w in phrase.split()]
    return re.compile(r"(?<!\w)" + r"[\s\-]+".join(words) + r"(?!\w)", re.IGNORECASE)


def find_banned(text: str, banned: list[str]) -> list[str]:
    """Banned phrases that appear in text, in list order."""
    return [phrase for phrase in banned if _phrase_pattern(phrase).search(text)]


def max_discount(text: str) -> float | None:
    """The largest discount percentage mentioned in text, if any."""
    values = [
        float((m.group(1) or m.group(2)).replace(",", "."))
        for m in _DISCOUNT.finditer(text)
    ]
    return max(values) if values else None
