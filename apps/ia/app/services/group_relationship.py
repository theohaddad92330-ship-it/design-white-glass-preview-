"""Détection de relation de groupe ESN ↔ compte cible — la "logique Axians".

Quand l'ESN vendeuse appartient au groupe analysé (Axians ⊂ VINCI), le plan ne
doit JAMAIS attaquer l'IT interne du groupe frontalement : il se positionne en
COMPLÉMENT des équipes internes (insider, co-traitance, renfort de niche), jamais
en concurrent frontal. Déterministe (nom ESN vs entités du groupe), pas de LLM.

Robuste à l'ambiguïté ESN/target : le nom ESN est lu sur ``profile_data`` (issu
du questionnaire), les entités du groupe sur ``account_data`` (la recherche cible).
"""

from __future__ import annotations

import re
from typing import Any

from app.config.knowledge_config import get_config
from app.services.text_norm import normalize_name

_ENTITY_LIST_KEYS = (
    "subsidiaries",
    "entitiesExhaustive",
    "entities_exhaustive",
    "meaningfulSubsidiaries",
    "meaningful_subsidiaries",
)


_norm = normalize_name


def _group_name(account_data: dict[str, Any]) -> str:
    return str(account_data.get("company_name") or account_data.get("companyName") or "")


def _target_entity_names(account_data: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for key in _ENTITY_LIST_KEYS:
        for e in account_data.get(key) or []:
            n = e.get("name") if isinstance(e, dict) else e
            if n:
                names.append(str(n))
    return names


def detect_insider(profile_data: dict[str, Any], account_data: dict[str, Any]) -> dict[str, Any] | None:
    """Descriptor when the seller ESN belongs to the target group (its name
    matches one of the group's entities), else ``None``. Whole-word match on the
    accent/case-normalised names so "Axians" binds "Axians Communication" but a
    short acronym can't collide inside an unrelated name."""
    cfg = get_config().group_relationship
    esn = _norm(profile_data.get("companyName"))
    if len(esn) < cfg.min_esn_name_len:
        return None
    group = _group_name(account_data)
    # Self-analysis (ESN == the target itself) is not an insider-ESN relationship.
    if esn == _norm(group):
        return None
    # A generic one-word ESN name ("Data", "Sud") only counts on an EXACT entity
    # match, never a whole-word-inside match (would false-positive on "VINCI Sud").
    esn_is_generic = " " not in esn and esn in set(cfg.generic_esn_words)
    pattern = re.compile(rf"\b{re.escape(esn)}\b")
    for name in _target_entity_names(account_data):
        n = _norm(name)
        if esn == n or (not esn_is_generic and pattern.search(n)):
            return {
                "isInsider": True,
                "esn": profile_data.get("companyName"),
                "group": group or None,
                "matchedEntity": name,
                "note": "L'ESN appartient au groupe cible — positionnement en complément, jamais frontal.",
            }
    return None


def insider_directive(insider: dict[str, Any] | None) -> str:
    """Prompt directive injected into the plan's relationship block when the ESN
    is an insider of the group. Empty string otherwise (no-op)."""
    if not insider or not insider.get("isInsider"):
        return ""
    esn = insider.get("esn") or "ton ESN"
    group = insider.get("group") or "ce groupe"
    matched = insider.get("matchedEntity") or ""
    rattach = f" (rattachement détecté : {matched})" if matched else ""
    return (
        f"LOGIQUE COMPLÉMENT (Axians) : {esn} appartient au groupe {group}{rattach}. "
        "Ne JAMAIS attaquer l'IT interne du groupe frontalement ni te positionner en "
        "concurrent des équipes internes — positionne-toi en COMPLÉMENT (co-traitance, "
        "renfort, expertise de niche) et en insider qui connaît la gouvernance du groupe. "
        "Cible les BU/périmètres non couverts par l'interne, jamais un remplacement frontal."
    )
