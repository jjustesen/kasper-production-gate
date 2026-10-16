"""Resolve the product names people type in briefs to catalog entries."""

import re
import unicodedata

BRAND_ONLY = "brand"

_LEADING_ARTICLE = re.compile(r"^(the|a|an|our)\s+")


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).casefold().strip()
    text = re.sub(r"\s+", " ", text)
    return _LEADING_ARTICLE.sub("", text)


def build_index(catalog: list[dict]) -> dict[str, dict]:
    """Map every SKU, name and alias of one client's catalog to its entry."""
    index = {}
    for item in catalog:
        for key in [item["sku"], item["name"], *item.get("aliases", [])]:
            index[normalise(key)] = item
    return index


def resolve(product: str, index: dict[str, dict]) -> dict | None:
    """Return the catalog entry, None if unknown. Matching is per client on purpose:
    'kit' means the Starter Kit at Lumen and the Sleep Kit at Halo."""
    return index.get(normalise(product))


def is_brand_only(product: str) -> bool:
    return normalise(product) == BRAND_ONLY
