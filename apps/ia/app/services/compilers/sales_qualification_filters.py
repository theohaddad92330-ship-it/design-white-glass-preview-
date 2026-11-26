"""#2273 (LAU-FINAL-015) — les 5 filtres de qualification (épopée #2959).

L'issue #2273 demande cinq filtres NOMMÉS (expertise utile / voie d'accès /
voie d'achat / prix-zone-modèle / timing) où une info inconnue produit une
VÉRIFICATION, jamais un rejet silencieux (#2273.8).

Ce module ne recalcule AUCUN score : il PROJETTE des signaux déjà collectés
ailleurs (le breakdown /5 par axe déjà posé par le LLM, `account_score.py` ;
les marchés DECP déjà attribués, `purchasingThread.byBuyer`) sur le vocabulaire
du filtre — jamais une donnée devinée. Trois filtres (expertise utile /
accès / timing) lisent l'axe correspondant du score /25 ; ``voie_achat`` lit
la présence d'un marché déjà observé ; ``prix_zone_modele`` reste TOUJOURS
``a_verifier`` — aucune source ne collecte cette compatibilité aujourd'hui, et
en inventer une serait la donnée fictive que la doctrine interdit (CLAUDE.md).

Chaque filtre ne porte que DEUX statuts possibles : ``valide`` ou
``a_verifier`` — jamais ``rejete`` (#2273.8, doctrine : une donnée absente ou
faible se vérifie, elle n'écarte jamais un compte silencieusement).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from app.services.account_score import clamp_axis

QUALIFICATION_FILTERS: tuple[tuple[str, str], ...] = (
    ("expertise_utile", "L'expertise de l'ESN est-elle réellement utile à ce compte"),
    ("voie_acces", "Existe-t-il une voie d'accès au compte"),
    ("voie_achat", "Existe-t-il une voie d'achat de prestation externe"),
    ("prix_zone_modele", "Prix, zone et modèle sont-ils compatibles"),
    ("timing", "Pourquoi maintenant, comme critère de compte"),
)

# Filtres projetés depuis un axe déjà posé par `account_score.SCORE_AXES` —
# jamais un second calcul du même axe.
_AXIS_FOR_FILTER: dict[str, str] = {
    "expertise_utile": "fit_offre",
    "voie_acces": "accessibilite",
    "timing": "timing",
}

# Seuil (sur /5) à partir duquel l'axe valide le filtre plutôt que de le
# laisser à vérifier. Un axe SOUS ce seuil n'écarte jamais le compte à lui
# seul (#2273.8) — il nomme juste ce qui reste à vérifier.
_VALIDATED_MIN = 3


def _axis_points(score_breakdown: Sequence[Mapping[str, Any]] | None, axis_key: str) -> int | None:
    for item in score_breakdown or []:
        if not isinstance(item, Mapping):
            continue
        key = str(item.get("axis") or item.get("key") or "")
        if key == axis_key:
            return clamp_axis(axis_key, item.get("points"))
    return None


def evaluate_qualification_filters(
    score_breakdown: Sequence[Mapping[str, Any]] | None,
    *,
    purchasing_by_buyer: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Évalue les 5 filtres de qualification (#2273.3-.8) sur un compte.

    ``score_breakdown`` = ``raw_analysis.evaluation.scoreBreakdown`` (liste de
    ``{axis, points}`` déjà posée par le score /25). ``purchasing_by_buyer`` =
    ``raw_analysis.purchasingThread.byBuyer`` (marchés DECP déjà attribués).

    Retourne toujours ``{"filters": [...], "unknowns": [...]}`` — jamais une
    clé manquante que l'appelant devrait deviner.
    """
    filters: list[dict[str, Any]] = []
    unknowns: list[str] = []

    for key, label in QUALIFICATION_FILTERS:
        if key == "voie_achat":
            has_purchasing = any(isinstance(p, Mapping) for p in (purchasing_by_buyer or []))
            if has_purchasing:
                status, reason = "valide", "marché(s) déjà attribué(s) observé(s) (DECP)"
            else:
                status, reason = (
                    "a_verifier",
                    "aucun achat externe déjà observé — à vérifier, jamais écarté sans preuve",
                )
        elif key == "prix_zone_modele":
            status, reason = (
                "a_verifier",
                "aucune donnée de compatibilité prix/zone/modèle collectée — à vérifier",
            )
        else:
            axis_key = _AXIS_FOR_FILTER[key]
            points = _axis_points(score_breakdown, axis_key)
            if points is None:
                status, reason = "a_verifier", f"axe « {axis_key} » non renseigné dans le score — à vérifier"
            elif points >= _VALIDATED_MIN:
                status, reason = "valide", f"axe « {axis_key} » à {points}/5"
            else:
                status, reason = (
                    "a_verifier",
                    f"axe « {axis_key} » faible ({points}/5) — à vérifier, jamais écarté sur ce seul signal",
                )

        if status == "a_verifier":
            unknowns.append(key)
        filters.append({"key": key, "label": label, "status": status, "reason": reason})

    return {"filters": filters, "unknowns": unknowns}
