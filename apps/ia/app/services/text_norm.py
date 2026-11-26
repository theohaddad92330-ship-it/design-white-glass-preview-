"""Shared name normalisation.

NFKD → strip combining marks → lowercase → collapse whitespace. ONE helper so
accent/case-insensitive entity matching stays byte-identical across the insider
check, the play-to-perimeter binding and the no-go gate (it was reimplemented
4×; a fix to one copy silently diverged the others)."""

from __future__ import annotations

import unicodedata
from collections.abc import Callable
from typing import Any


def normalize_name(name: object) -> str:
    raw = unicodedata.normalize("NFKD", str(name or ""))
    stripped = "".join(c for c in raw if not unicodedata.combining(c))
    return " ".join(stripped.lower().split())


def dedup_by_name(
    items: object,
    key: Callable[[Any], object] = lambda x: x,
) -> list[Any]:
    """Drop duplicates by normalized name, first occurrence wins, order preserved.

    Complements the SIREN-only dedup (which misses brand variants: "Capgemini"
    vs "Capgemini SE", or an entity that lost its siren). Items whose name
    normalises to empty are ALWAYS kept (a blank key must not collapse distinct
    unnamed rows into one)."""
    if not isinstance(items, list):
        return []
    seen: set[str] = set()
    out: list[Any] = []
    for item in items:
        norm = normalize_name(key(item))
        if norm and norm in seen:
            continue
        if norm:
            seen.add(norm)
        out.append(item)
    return out
