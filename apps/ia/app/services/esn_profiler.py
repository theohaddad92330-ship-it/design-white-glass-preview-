"""Deterministic BELLUM_PROFILER (06_SYSTEM_PROMPTS #2 / 03_BUSINESS_RULES §9).

Turns the raw ESN profile into structured rules the pipeline consumes — archetype,
preferred entry mode, no-go sectors. No LLM: same compute-side pattern as
account_score / truth_status. The LLM-driven personalisation (S1, profile in the
prompts) already differentiates output by profile; these deterministic rules are the
robustness layer (stable archetype/entry-mode + a hard no-go list the entity gate
can honour).
"""

from __future__ import annotations

from typing import Any

from app.services.esn_stage import classify_esn_stage, size_int

# Rétro-compat : ce module exportait `_size_int`, importé ailleurs. La fonction
# vit désormais dans le socle `esn_stage` (une seule échelle) — on garde l'alias.
_size_int = size_int

# L'archétype du deck reste le vocabulaire affiché côté produit (5 libellés déjà
# traduits, colonne `esn_profiles`), mais il n'a PLUS ses propres coupures : c'est
# une projection 1-pour-1 du stade p3. Avant, il coupait à 100/500 quand le stade
# coupait à 80/300 — une ESN de 90 tombait dans deux bandes contradictoires.
_STAGE_TO_ARCHETYPE: dict[str, str] = {
    "freelance": "solo_hunter",
    "petite": "boutique_expert",
    "structuration": "mid_market_challenger",
    "etablie": "scale_up",
    "grande": "enterprise_player",
}

# Mode d'entrée par stade (méthode plan de compte) : une petite ESN attaque
# bottom-up (N-2 accessible), une grande peut assumer le top-down (référencement).
_STAGE_TO_ENTRY_MODE: dict[str, str] = {
    "freelance": "bottom-up",
    "petite": "bottom-up",
    "structuration": "middle-out",
    "etablie": "middle-out",
    "grande": "top-down",
}


def esn_archetype(size: int | None) -> str:
    """Archétype du deck, projeté du stade p3. Taille inconnue → `mid_market`
    (milieu neutre, valeur historique conservée pour ne pas requalifier en base
    les profils sans effectif déclaré)."""
    if size_int(size) is None:
        return "mid_market"
    return _STAGE_TO_ARCHETYPE[classify_esn_stage(size)]


def preferred_entry_mode(size: int | None) -> str:
    """Mode d'entrée calibré, projeté du même stade. Taille inconnue →
    `middle-out` (valeur historique neutre)."""
    if size_int(size) is None:
        return "middle-out"
    return _STAGE_TO_ENTRY_MODE[classify_esn_stage(size)]


def derive_esn_rules(profile_data: dict[str, Any]) -> dict[str, Any]:
    """Structured, deterministic rules derived from the raw ESN profile."""
    size = _size_int(profile_data.get("size"))
    return {
        "esnArchetype": esn_archetype(size),
        "preferredEntryMode": preferred_entry_mode(size),
        # Hard no-go sectors declared on the profile → the entity/perimeter gate
        # can exclude an entity in one of these (profile-driven scope, §9).
        "noGoSectors": [str(s).strip() for s in (profile_data.get("noGoSectors") or []) if str(s).strip()],
        "offers": [str(o).strip() for o in (profile_data.get("offers") or []) if str(o).strip()],
    }
