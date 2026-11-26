"""Barème de ``bellum_strategy`` — l'existant, remis dans la forme commune.

⚠️ **Rien n'est renoté ici.** Ce module n'ajoute aucun critère, ne retire aucun
point : il traduit les six bandes de ``app/eval/strategy/rubric.py`` en axes, de
sorte que ``total`` sorte **numériquement identique** à ``RubricScore.total``.

La démonstration tient en une ligne d'algèbre : les poids des axes sont les
``max_points`` des bandes (dont la somme fait exactement 100), et le ratio d'un
axe est ``points / max_points``. Donc

    100 × Σ(max_points × points/max_points) / Σ(max_points)
  = 100 × Σ(points) / 100
  = Σ(points) = RubricScore.total

Un test compare les deux valeurs sur plusieurs sorties — c'est lui, pas ce
commentaire, qui garantit qu'on n'a pas cassé la seule grille qui existait.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.eval.strategy.rubric import score_strategy

from .axes import RubricResult, axis_value

PROMPT = "bellum_strategy"

#: Ce que chaque bande ne sait PAS voir — la colonne utile du tableau, écrite une
#: fois plutôt que devinée à chaque lecture.
_BLIND_TO: dict[str, str] = {
    "angles": "que l'angle soit PERTINENT pour CE compte : on compte les champs, l'ACTION et "
              "l'offre chiffrée, jamais la justesse du pari commercial.",
    "rdv_script": "le naturel du script. Un opening sans formule interdite peut rester creux.",
    "pains": "que la douleur soit RÉELLE — seulement qu'elle soit qualifiée (sévérité, impact, offre).",
    "power_questions": "qu'une question ouverte fasse effectivement parler l'interlocuteur.",
    "objections": "que l'objection anticipée soit celle que le client posera.",
    "selection": "la justesse de l'arbitrage : on vérifie qu'il est ÉCRIT, pas qu'il est bon.",
}


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:  # noqa: ARG001
    rubric = score_strategy(output)
    axes = [
        axis_value(
            band.name, band.max_points, ratio=band.ratio,
            origin=f"app/eval/strategy/rubric.py (bande « {band.name} », {band.max_points:g} pts)",
            blind_to=_BLIND_TO.get(band.name, ""),
            detail=band.detail, data=dict(band.data),
        )
        for band in rubric.bands
    ]
    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="Barème inchangé : les six bandes de app/eval/strategy/rubric.py, à la virgule près. "
               "Ce module ne fait que les exposer comme des axes.",
    )
