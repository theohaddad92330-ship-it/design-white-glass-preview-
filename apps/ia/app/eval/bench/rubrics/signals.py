"""Barème de ``bellum_signals`` — ce qui SE PASSE autour du compte.

C'est le prompt où « faithfulness » veut dire quelque chose de vérifiable sur la
seule sortie : **chaque signal porte-t-il une source ET une date ?** Les deux
sont écrits noir sur blanc dans le prompt lui-même, ce ne sont pas des exigences
ajoutées ici :

    « 1. AUCUNE invention. Chaque signal doit avoir une SOURCE identifiable dans
      les donnees fournies. »                     (app/prompts/bellum_signals.py:52)
    « 4. Date format libre mais explicite […] Si date absente : "Non datee". »
                                                  (app/prompts/bellum_signals.py:55)
    « 6. CITATION : chaque budgetSignal / recentSignal / peopleMentioned porte
      DEUX champs distincts […] Si l'info ne vient d'aucun scrape, "source" vaut
      "Non source" […] JAMAIS d'URL inventee. » (app/prompts/bellum_signals.py:57-60)

Le seuil de l'axe « sourcé » n'est pas non plus inventé : c'est le KPI expédié
``grounding_citations.KPI_MAX_NON_SOURCED_RATIO`` (< 5 % de faits non sourcés).

===========================  =====================================================
Axe                          Primitive d'origine
===========================  =====================================================
``signaux_sources``          ``KPI_MAX_NON_SOURCED_RATIO`` (``app/services/grounding_citations.py:200``)
``signaux_dates``            règle 4 du prompt + ``metrics.source_freshness``
``fraicheur_datee``          ``confidence._real_date_freshness`` (``app/services/confidence.py:133``)
``personnes_sourcees``       ``judge._check_grounding`` (``app/graph/judge.py:98``), même règle
``hypotheses_convergentes``  ``QualifiedHypothesis._cap_confidence_by_convergence``
                             (``app/models/outputs/research.py:98``)
``sans_donnee_inventee``     ``metrics.fabrication_violations``
===========================  =====================================================
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.eval.metrics import fabrication_violations
from app.services.confidence import _real_date_freshness
from app.services.grounding_citations import KPI_MAX_NON_SOURCED_RATIO

from .axes import Axis, RubricResult, axis_value, eliminatory, measured, unmeasurable
from .reading import get, mappings, present

PROMPT = "bellum_signals"

#: La règle de convergence du prompt (:35) et du validateur de sortie : une
#: hypothèse s'appuie sur 2 à 4 signaux concrets ; en dessous, ce n'est pas une
#: hypothèse qualifiée. ``app/models/outputs/research.py:105-107``.
MIN_CONVERGING_SIGNALS = 2


def _dated_signals(output: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Les signaux que le prompt oblige à sourcer ET dater."""
    return (
        mappings(get(output, "recentSignals", "recent_signals"))
        + mappings(get(output, "budgetSignals", "budget_signals"))
    )


def _is_sourced(item: Mapping[str, Any]) -> bool:
    """Un signal est sourcé quand il porte un nom de source LISIBLE, ou un jeton
    de traçabilité. « Non source » est honnête mais n'est pas une source — le
    prompt le dit lui-même."""
    return present(get(item, "source")) or present(get(item, "sourceRef", "source_ref"))


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:  # noqa: ARG001
    axes: list[Axis] = []
    signals = _dated_signals(output)

    # ── 1 & 2. sourcé, daté — les deux moitiés de la règle du prompt ──────────
    if signals:
        sourced = sum(1 for s in signals if _is_sourced(s))
        axes.append(measured(
            "signaux_sources", 3.0, ok=sourced, total=len(signals),
            origin="app/prompts/bellum_signals.py:52,57-60 (règles 1 et 6) + "
                   "app/services/grounding_citations.py:200 (KPI_MAX_NON_SOURCED_RATIO)",
            blind_to="que la source CITÉE existe vraiment dans les documents fournis. On mesure la "
                     "présence d'une citation, pas sa véracité — cela demanderait les documents, "
                     "que la sortie ne porte pas.",
            detail=f"{sourced}/{len(signals)} signal(aux) sourcé(s) "
                   f"(cible : non-sourcés < {KPI_MAX_NON_SOURCED_RATIO * 100:.0f} %)",
            data={"kpiMet": (len(signals) - sourced) / len(signals) < KPI_MAX_NON_SOURCED_RATIO},
        ))
        dated = sum(1 for s in signals if present(get(s, "date", "timeframe")))
        axes.append(measured(
            "signaux_dates", 3.0, ok=dated, total=len(signals),
            origin="app/prompts/bellum_signals.py:55 (règle 4 : « Si date absente : Non datee ») + "
                   "app/models/outputs/research.py:84 (RecentSignal.freshness, estampillée depuis `date`)",
            blind_to="qu'une date soit EXACTE. « 2024 » sur un fait de 2019 se lit comme daté.",
            detail=f"{dated}/{len(signals)} signal(aux) daté(s)",
        ))
    else:
        for name, weight in (("signaux_sources", 3.0), ("signaux_dates", 3.0)):
            axes.append(unmeasurable(
                name, weight,
                reason="la sortie ne contient aucun signal — un barème ne peut pas noter la source "
                       "de rien ; l'absence se lit sur la colonne conformité de schéma",
                origin="app/prompts/bellum_signals.py:52-60",
            ))

    # ── 3. fraîcheur RÉELLE, sur l'échelle expédiée ───────────────────────────
    weight = _real_date_freshness({
        "recentSignals": [
            {"date": get(s, "date")} for s in mappings(get(output, "recentSignals", "recent_signals"))
        ]
    })
    if weight is None:
        axes.append(unmeasurable(
            "fraicheur_datee", 2.0,
            reason="aucune date ISO exploitable dans les signaux (le prompt autorise « septembre "
                   "2024 », que l'échelle de fraîcheur ne sait pas lire) — l'axe signaux_dates "
                   "note déjà la PRÉSENCE d'une date",
            origin="app/services/confidence.py:133 (_real_date_freshness)",
        ))
    else:
        axes.append(axis_value(
            "fraicheur_datee", 2.0, ratio=float(weight),
            origin="app/services/confidence.py:49,133 (_FRESHNESS_BY_AGE / _real_date_freshness)",
            blind_to="la fraîcheur de ce qui n'est pas daté en ISO — et elle bouge avec l'horloge, "
                     "donc deux comparaisons faites à six mois d'écart ne sont pas comparables sur cet axe.",
            detail=f"évidence datée la plus fraîche → poids {weight:.1f}",
        ))

    # ── 4. les personnes citées portent leur source ───────────────────────────
    people = mappings(get(output, "peopleMentioned", "people_mentioned"))
    if people:
        sourced = sum(1 for p in people if _is_sourced(p))
        axes.append(measured(
            "personnes_sourcees", 2.0, ok=sourced, total=len(people),
            origin="app/graph/judge.py:98-118 (_check_grounding : un fait affiché sans source est le "
                   "signal n°1 d'hallucination) + app/prompts/bellum_signals.py:53",
            blind_to="qu'une personne citée EXISTE, et qu'elle soit encore en poste — c'est "
                     "``quality_judge.mark_former_leaders`` qui le fait, avec le registre en main.",
            detail=f"{sourced}/{len(people)} personne(s) citée(s) avec leur source",
        ))
    else:
        axes.append(unmeasurable(
            "personnes_sourcees", 2.0,
            reason="aucune personne citée dans la sortie — ne rien citer n'est pas citer sans source",
            origin="app/graph/judge.py:98-118",
        ))

    # ── 5. convergence des hypothèses ─────────────────────────────────────────
    hypotheses = mappings(get(output, "qualifiedHypotheses", "qualified_hypotheses"))
    if hypotheses:
        converging = sum(
            1 for h in hypotheses
            if len([s for s in (get(h, "basedOnSignals", "based_on_signals") or []) if present(s)])
            >= MIN_CONVERGING_SIGNALS
        )
        axes.append(measured(
            "hypotheses_convergentes", 2.0, ok=converging, total=len(hypotheses),
            origin="app/models/outputs/research.py:98-110 (_cap_confidence_by_convergence : "
                   "1 signal → a_verifier, 2 → probable, 3+ → confirmee)",
            blind_to="que les signaux invoqués soient les BONS : on compte combien il y en a, on ne "
                     "vérifie pas qu'ils fondent l'hypothèse.",
            detail=f"{converging}/{len(hypotheses)} hypothèse(s) appuyée(s) sur "
                   f"≥ {MIN_CONVERGING_SIGNALS} signaux",
        ))
    else:
        axes.append(unmeasurable(
            "hypotheses_convergentes", 2.0,
            reason="aucune hypothèse qualifiée produite",
            origin="app/models/outputs/research.py:98-110",
        ))

    # ── 6. aucune donnée fabriquée ────────────────────────────────────────────
    violations = fabrication_violations([
        signals, people,
        get(output, "competitors"),
        get(output, "esnSynergies", "esn_synergies"),
        get(output, "organigrammeLogic", "organigramme_logic"),
    ])
    # ÉLIMINATOIRE — même porte que no_invented_data (app/eval/metrics.py:548).
    axes.append(eliminatory(
        "sans_donnee_inventee", 3.0, violations=violations,
        origin="app/eval/metrics.py:_FABRICATED_MARKERS + fabrication_violations "
               "(porte `passed = not violations`)",
        blind_to="un concurrent plausible mais absent du compte — le prompt l'interdit (règle 3), "
                 "rien dans la sortie ne permet de le contredire.",
    ))

    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="« Sourcé » ici veut dire « porte une citation », jamais « la citation est vraie » : "
               "vérifier la seconde demanderait les documents collectés, que l'enregistrement du "
               "banc ne conserve que dans le prompt d'entrée, sans lien machine vers chaque signal.",
    )
