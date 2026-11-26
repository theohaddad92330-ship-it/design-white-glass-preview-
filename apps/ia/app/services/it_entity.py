"""Deterministic IT / digital entity detection by legal name.

An ESN's #1 hunting target inside a group is its IT/digital arm — the GIE
informatique, the "X Technologies / Services" subsidiary, the mutualised DSI
(e.g. Crédit Mutuel → *Euro-Information*, *GICM*). The legacy noise filter
dropped these as "GIE / holding" and the tiering buried them, so the most
sellable entity for an ESN never surfaced.

This module is the single signal that says "this entity IS the IT arm". It
lets the cartography do two things instead of dropping the entity:
  - keep it in the operating list (``entities.py`` overrides the noise rule);
  - float it to the P1 zone de chasse (``prioritization.py`` boosts it).

Name-based today — corporate-graph nodes carry only ``name`` + ``siren`` (no
NAF). When the INSEE Sirene client lands, NAF **62.0x** (programmation /
conseil informatique) becomes the authoritative signal and augments this; the
public surface (``is_it_entity``) stays the same so callers don't change.
"""

from __future__ import annotations

import re

# Name fragments that mark an IT / digital entity. Substrings on purpose:
# ``informati`` catches *informatique* AND *information* (Euro-Information,
# Groupement Informatique). Bias is intentionally toward surfacing — for an ESN
# a false positive (an extra IT-looking entity in P1) costs far less than a
# false negative (the real IT subsidiary filtered out).
_IT_ENTITY_PATTERNS: tuple[str, ...] = (
    r"informati",  # informatique, information (Euro-Information, GICM…)
    r"num[ée]riqu",  # numérique
    r"digital",
    r"technolog",  # technologies, technologie
    r"\bdata\b",
    r"datacenter",
    r"\bcloud\b",
    r"cyber",
    r"logiciel",
    r"software",
    r"syst[èe]mes?\s+d['’\s]?\s*information",  # systèmes d'information
    r"\bDSI\b",
    r"\bIT\b",  # standalone "IT" token in an entity name
    r"services?\s+num[ée]riqu",
)

_IT_ENTITY_RE = re.compile("|".join(_IT_ENTITY_PATTERNS), re.IGNORECASE)


def is_it_entity(name: str | None) -> bool:
    """True when the legal name marks an IT / digital entity (ESN prime target)."""
    return bool(_IT_ENTITY_RE.search((name or "").strip()))
