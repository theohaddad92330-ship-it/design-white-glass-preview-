"""Couche config du knowledge (niveau 1, Théo) — règles déterministes tunables,
versionnées + override-ables à chaud. Voir agent_docs/knowledge-architecture.md.

Les defaults shippés (git, versionnés, testés) vivent ici, source unique de vérité
par domaine. Les overrides runtime (par ESN / tenant) sont deep-mergés par-dessus
via ``set_overrides`` — in-process pour l'instant ; la table ``config_overrides``
+ un loader NestJS est la slice suivante. Un seuil se change alors SANS redeploy.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

CONFIG_VERSION = "v1"


class SourcesConfig(BaseModel):
    # Sources non-probantes à écarter des recommandations (F2).
    weak_sources: list[str] = ["ia_reconstruction"]


class NoGoConfig(BaseModel):
    # Longueur mini d'un mot-clé de secteur no-go (3 → "BTP" marche) + stopwords.
    min_keyword_len: int = 3
    stopwords: list[str] = [
        "grande", "petite", "secteur", "secteurs", "public", "prive", "services",
        "sociale", "sociales", "des", "les", "aux", "une", "par", "sur", "pour",
        "dans", "avec", "and", "the",
    ]


class GroupRelationshipConfig(BaseModel):
    # En-deçà, un nom d'ESN est trop court pour matcher sans risque (logique Axians).
    min_esn_name_len: int = 3
    # Mots génériques : un nom d'ESN qui en fait partie exige un match EXACT.
    generic_esn_words: list[str] = [
        "data", "cloud", "tech", "digital", "group", "groupe", "conseil", "services",
        "service", "systems", "system", "solutions", "solution", "info", "sud", "nord",
        "est", "ouest", "centre", "france", "europe", "consulting", "partners", "expertise",
    ]


class KnowledgeConfig(BaseModel):
    version: str = CONFIG_VERSION
    sources: SourcesConfig = Field(default_factory=SourcesConfig)
    no_go: NoGoConfig = Field(default_factory=NoGoConfig)
    group_relationship: GroupRelationshipConfig = Field(default_factory=GroupRelationshipConfig)

    model_config = {"frozen": True}


_DEFAULTS = KnowledgeConfig()
_overrides: dict[str, Any] = {}


def _deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for k, v in (patch or {}).items():
        out[k] = _deep_merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def get_config() -> KnowledgeConfig:
    """The active config = shipped defaults ← runtime overrides (deep-merged)."""
    if not _overrides:
        return _DEFAULTS
    return KnowledgeConfig.model_validate(_deep_merge(_DEFAULTS.model_dump(), _overrides))


def set_overrides(patch: dict[str, Any] | None) -> None:
    """Apply a runtime override patch (a subtree per domain). In-process for now;
    a ``config_overrides`` table + loader is the next slice."""
    global _overrides
    _overrides = patch or {}


def clear_overrides() -> None:
    set_overrides({})
