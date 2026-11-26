"""Contact identity + seed merging.

Companion to ``text_norm.normalize_name`` (which already served entities) and
the mirror of ``apps/api/src/modules/contacts/contact-identity.ts`` — the Python
pipeline and the Node persistence must agree on what "the same person" means, or
a pair that survives one layer gets split by the other.

Phase 2 previously merged Apollo + fallback seeds with::

    dedup[fullName.strip().lower()] = seed

Two defects: the key ignored accents, so "Sébastien Chauffray" and "Sebastien
Chauffray" were two people; and the assignment was last-write-wins, so a thin
Brave/Claude seed replaced the rich Apollo one, discarding ``apolloId``,
``linkedinUrl`` and ``apolloDetails``.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.services.text_norm import normalize_name

# Unicode gives these no decomposition, so NFKD leaves them intact and "Lœuvre"
# would never match "Loeuvre". All occur in French/Nordic names.
_LIGATURES = {"œ": "oe", "æ": "ae", "ß": "ss", "ø": "o", "đ": "d", "ł": "l"}

_NON_ALNUM = re.compile(r"[^0-9a-z]+")
_PLACEHOLDER = re.compile(r"^[-—–]+$")


def normalize_person_name(raw: object) -> str:
    """Accent-, case- and punctuation-insensitive name key.

    ``"Jean-Pierre D'Arcy"`` → ``"jean pierre d arcy"``.
    """
    text = str(raw or "")
    for ligature, replacement in _LIGATURES.items():
        text = text.replace(ligature, replacement).replace(ligature.upper(), replacement)
    # normalize_name does NFKD + strip combining marks + lower + collapse spaces;
    # we additionally fold punctuation (hyphens, apostrophes, dots) to spaces.
    folded = _NON_ALNUM.sub(" ", normalize_name(text))
    return " ".join(folded.split())


def normalize_linkedin_url(raw: object) -> str:
    """Canonical profile identity: protocol, subdomain, query and trailing slash
    stripped, so two sources citing the same profile produce the same string."""
    url = str(raw or "").strip().lower()
    if not url:
        return ""
    url = re.sub(r"^https?://", "", url)
    url = re.sub(r"^[a-z0-9-]+\.linkedin\.com", "linkedin.com", url)
    url = re.sub(r"[?#].*$", "", url)
    return url.rstrip("/")


def contact_identity_keys(seed: dict[str, Any]) -> list[str]:
    """Every key under which this seed should be recognised, strongest first.

    Two seeds are the same human when they share ANY key. Keys are namespaced so
    an email can never collide with a name. Empty when the seed carries no usable
    identifier — such a seed is never merged into anything.
    """
    keys: list[str] = []

    email = str(seed.get("email") or "").strip().lower()
    if "@" in email:
        keys.append(f"email:{email}")

    linkedin = normalize_linkedin_url(seed.get("linkedinUrl"))
    if linkedin:
        keys.append(f"li:{linkedin}")

    name = normalize_person_name(seed.get("fullName"))
    if name:
        keys.append(f"name:{name}")
        # Pappers assembles `nom + prenom` ("DUPONT Jean") where Apollo emits
        # "Jean Dupont". Extra key only — the exact-order match still stands.
        sorted_name = " ".join(sorted(name.split()))
        if sorted_name != name:
            keys.append(f"name:{sorted_name}")

    return keys


def _richer(current: Any, candidate: Any) -> Any:
    """Between a stored value and an incoming one: a real value beats an empty
    one; between two real values the more specific (longer) wins. Placeholder
    dashes count as empty."""
    a = str(current).strip() if current is not None else ""
    b = str(candidate).strip() if candidate is not None else ""
    a_ok = bool(a) and not _PLACEHOLDER.match(a)
    b_ok = bool(b) and not _PLACEHOLDER.match(b)

    if not a_ok and not b_ok:
        return current
    if not a_ok:
        return candidate
    if not b_ok:
        return current
    return candidate if len(b) > len(a) else current


# Provenance must not flip when a later source enriches an earlier seed: the row
# is still the Pappers/Apollo find it was, with more fields filled in.
# ``fullName`` is deliberately NOT here — it carries no provenance, and freezing
# it is what lost the accents (see ``_richer_name``).
_PROVENANCE_FIELDS = frozenset({"source", "apolloId"})

# Combining marks left behind by NFKD — one per surviving diacritic.
_COMBINING = re.compile(r"[̀-ͯ]")


def _accent_score(value: str) -> int:
    """How many diacritics a spelling still carries."""
    return len(_COMBINING.findall(unicodedata.normalize("NFKD", value)))


def _richer_name(current: Any, candidate: Any) -> Any:
    """Choose between two observed spellings of the SAME person's name.

    ``fullName`` used to be frozen at whatever the FIRST seed said, so an Apollo
    seed that had already dropped the accents kept "Sebastien Chauffray" even
    when a later source supplied "Sébastien Chauffray". De-accenting is lossy and
    one-way: among spellings that normalise to the same key, the most-accented
    one is the one closest to the source.

    This ORDERS values that already exist — it never composes a new one. When the
    two names do not normalise alike they belong to different people (the seeds
    were matched on email or LinkedIn instead), and the incumbent is kept: a
    merge must never relabel a contact.
    """
    a = str(current).strip() if current is not None else ""
    b = str(candidate).strip() if candidate is not None else ""
    if not b:
        return current
    if not a:
        return candidate
    if normalize_person_name(a) != normalize_person_name(b):
        return current
    return candidate if _accent_score(b) > _accent_score(a) else current


def merge_contact_seeds(seeds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse duplicate contact seeds, FIRST occurrence wins its position and
    its provenance, later occurrences only fill in what it was missing.

    Pure: the input dicts are never mutated. Order-stable, so two identical runs
    produce an identical list.
    """
    merged: list[dict[str, Any]] = []
    by_key: dict[str, dict[str, Any]] = {}

    for seed in seeds:
        keys = contact_identity_keys(seed)
        if not keys:
            continue

        existing = next((by_key[k] for k in keys if k in by_key), None)
        if existing is None:
            row = dict(seed)
            merged.append(row)
            for key in keys:
                by_key.setdefault(key, row)
            continue

        for field, value in seed.items():
            if field == "fullName":
                existing[field] = _richer_name(existing.get(field), value)
                continue
            if field in _PROVENANCE_FIELDS:
                # Keep the incumbent's identity fields, but adopt an id it lacked.
                if field == "apolloId" and not existing.get("apolloId"):
                    existing[field] = value
                continue
            existing[field] = _richer(existing.get(field), value)
        # The later seed may carry an identifier the first lacked (a LinkedIn URL):
        # index it so a third seed citing only that URL still lands here.
        for key in contact_identity_keys(existing):
            by_key.setdefault(key, existing)

    return merged
