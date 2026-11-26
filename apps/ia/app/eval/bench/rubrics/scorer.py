"""Barème de ``bellum_scorer`` — un score de compte, et son verdict.

Ce prompt produit exactement ce que la doctrine encadre le plus étroitement : un
SCORE. Le dépôt en dit trois choses, et les trois sont vérifiables sur la sortie
sans jamais dire si le score est « juste » :

1. **un score n'est jamais nu** — ses axes sont nommés. Le prompt en énonce cinq
   (``app/prompts/bellum_scorer.py:41-45``), et ``ScoringOutput.criteria`` les
   porte avec leur raison ;
2. **le verdict est une RÈGLE, pas l'humeur du modèle.** Le routeur RÉÉCRIT la
   recommandation à partir du score global, par les bandes canoniques
   (``app/routers/scorer.py:66-69`` → ``account_score.verdict_from_global_score``).
   Ce n'est pas une précaution de style : le commentaire dit que ce point
   d'entrée « émettait un GO/PRUDENT/NO-GO divergent » ;
3. **aucune PROBABILITÉ.** Le prompt n'en demande pas, et ce barème n'en note
   aucune.

La faute que ce barème SAIT voir
--------------------------------
Un verdict PLUS OPTIMISTE que la bande du score. Le prompt superpose deux règles :
les bandes de ``account_score`` (GO ≥ 7/10) et trois conditions supplémentaires
— « GO : score ≥ 7.0 ET offer_fit ≥ 7 ET au moins 1 contact identifié »
(``app/prompts/bellum_scorer.py:48``). Les deux se composent dans un seul sens :
un modèle a le droit d'être PLUS prudent que la bande, jamais moins. Noter
l'égalité stricte punirait un modèle qui obéit ; noter la borne haute attrape le
seul écart qui compte — celui qui fait travailler un commercial sur un compte
que la règle refusait.

⚠️ Ce que ce barème NE peut PAS voir, et il faut le savoir avant de le lire :
``ScoringOutput`` porte des VALEURS PAR DÉFAUT — ``global_score=5.0``,
``recommendation="PRUDENT"`` (``app/models/outputs/scorer.py:19-21``). Un modèle
qui n'écrit rien reçoit donc une valeur de remplissage, et la sortie
enregistrée par le banc est le ``model_dump`` d'APRÈS validation : le 5,0 d'un
modèle muet et le 5,0 d'un modèle qui a compté sont indiscernables. Ce qui les
sépare reste visible ailleurs : ``criteres_du_contrat`` tombe à zéro, parce que
``criteria`` a pour défaut ``{}`` et qu'aucun défaut ne le remplit.

⚠️ **On note la STRUCTURE et la RÈGLE, jamais la justesse du score.** Aucun axe
ne dit si 8,5 était mérité, ni si les raisons sont pertinentes. Un compte noté
absurdement mais décomposé, argumenté et cohérent avec sa bande marque 100 ici.

============================================  ==================================
Axe                                           Primitive d'origine
============================================  ==================================
``criteres_du_contrat``                       ``bellum_scorer.py:41-45``
``criteres_argumentes``                       ``bellum_scorer.py:73-74``
``scores_dans_la_bande``                      ``ScoringOutput`` (ge=0, le=10)
``verdict_du_vocabulaire``                    ``bellum_scorer.py:47``
``verdict_jamais_plus_optimiste``             ``account_score.verdict_from_global_score``
``champs_de_suivi``                           ``ScoringOutput`` (bloc JSON)
``sans_donnee_inventee``                      ``metrics.fabrication_violations``
============================================  ==================================
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.eval.metrics import fabrication_violations
from app.services.account_score import verdict_from_global_score

from .axes import Axis, RubricResult, eliminatory, measured, share, unmeasurable
from .reading import as_mapping, get, present

PROMPT = "bellum_scorer"

_PROMPT_FILE = "app/prompts/bellum_scorer.py"
_MODEL_FILE = "app/models/outputs/scorer.py"

#: Les cinq critères que le prompt ÉNONCE, avec leur pondération indicative
#: (``bellum_scorer.py:41-45``). La pondération n'est PAS notée : le prompt la
#: dit « indicative », donc un écart n'est pas une faute, et noter un écart à une
#: règle qui se déclare souple reviendrait à inventer la règle.
CONTRACT_CRITERIA: tuple[str, ...] = (
    "offer_fit",
    "size_compatibility",
    "geographic_fit",
    "cycle_compatibility",
    "competition_level",
)

#: Le vocabulaire unifié, en toutes lettres dans le prompt
#: (``bellum_scorer.py:47``). ``EXPLORER``, qu'``account_score`` sait produire,
#: n'en fait PAS partie : il suppose un signal de complétude des données que ce
#: prompt ne reçoit pas.
VERDICTS: tuple[str, ...] = ("GO", "PRUDENT", "STOP")

#: Du plus prudent au plus optimiste — l'ordre qui donne son sens à « jamais plus
#: optimiste que la bande ».
_OPTIMISM: dict[str, int] = {"STOP": 0, "PRUDENT": 1, "GO": 2}

#: Les quatre champs de suivi du bloc « SORTIE JSON » (``bellum_scorer.py:94-97``).
#: ``criteria`` et ``global_score`` n'y sont pas : ils ont leurs propres axes.
FOLLOW_UP_FIELDS: tuple[str, ...] = (
    "one_line", "next_review_date", "score_delta", "score_delta_reason",
)

#: La borne de ``ScoreCriterion.score`` et de ``ScoringOutput.global_score``
#: (``app/models/outputs/scorer.py:12,19`` — ``Field(ge=0, le=10)``).
SCORE_MIN, SCORE_MAX = 0.0, 10.0


def _criteria(output: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    raw = as_mapping(get(output, "criteria"))
    return {str(k): as_mapping(v) for k, v in raw.items() if isinstance(v, Mapping)}


def _number(value: Any) -> float | None:
    """Un nombre, ou ``None``. Un booléen n'est PAS un nombre ici : ``True``
    passerait pour 1,0 et un score de 1 n'est pas une absence de score."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _in_band(value: Any) -> bool:
    n = _number(value)
    return n is not None and SCORE_MIN <= n <= SCORE_MAX


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:
    axes: list[Axis] = []
    criteria = _criteria(output)
    recommendation = str(get(output, "recommendation") or "").strip().upper()
    global_score = _number(get(output, "global_score"))

    # ── 1. les cinq critères que le prompt ÉNONCE ─────────────────────────────
    ok, total = share(CONTRACT_CRITERIA, lambda name: name in criteria)
    axes.append(measured(
        "criteres_du_contrat", 3.0, ok=ok, total=total,
        origin=f"{_PROMPT_FILE}:41-45 (les cinq critères de scoring) + {_MODEL_FILE}:20 "
               "(ScoringOutput.criteria)",
        blind_to="un critère EN PLUS. Un modèle qui ajoute « budget_fit » n'est pas sanctionné : "
                 "le prompt énonce cinq critères, il n'interdit pas d'en nommer un sixième, et "
                 "ce barème ne note que des règles écrites.",
        detail=f"{ok}/{total} critères nommés ({', '.join(CONTRACT_CRITERIA)})",
        data={"named": sorted(criteria)},
    ))

    # ── 2. un axe sans raison n'est pas un axe ────────────────────────────────
    if not criteria:
        axes.append(unmeasurable(
            "criteres_argumentes", 2.0,
            reason="aucun critère rendu — il n'y a aucune raison à mesurer. C'est "
                   "criteres_du_contrat qui sanctionne l'absence, pas cet axe (qui noterait "
                   "sinon deux fois la même faute)",
            origin=f"{_PROMPT_FILE}:73-74",
        ))
    else:
        named, n = share(list(criteria.values()), lambda c: present(get(c, "reason")))
        axes.append(measured(
            "criteres_argumentes", 2.0, ok=named, total=n,
            origin=f"{_PROMPT_FILE}:73-74 (« Explication spécifique à CE compte et CES offres ») "
                   f"+ {_MODEL_FILE}:13 (ScoreCriterion.reason)",
            blind_to="que la raison soit SPÉCIFIQUE. Le prompt demande une explication propre à ce "
                     "compte et à ces offres ; « bon fit » remplit le champ et ne dit rien. "
                     "Mesurer la spécificité supposerait de comparer à l'analyse d'entrée, que le "
                     "prompt interpole en `str(dict)` — donc illisible sans deviner.",
            detail=f"{named}/{n} critère(s) portant une raison",
        ))

    # ── 3. les bornes du schéma ───────────────────────────────────────────────
    banded = [_in_band(get(c, "score")) for c in criteria.values()]
    banded.append(global_score is not None and SCORE_MIN <= global_score <= SCORE_MAX)
    axes.append(measured(
        "scores_dans_la_bande", 1.5, ok=sum(1 for b in banded if b), total=len(banded),
        origin=f"{_MODEL_FILE}:12,19 (Field(ge=0, le=10) — ScoreCriterion.score et "
               "ScoringOutput.global_score)",
        blind_to="que le score soit MÉRITÉ, et qu'il ne soit pas une valeur par défaut : "
                 f"``global_score`` vaut 5,0 quand le modèle n'écrit rien ({_MODEL_FILE}:19), et "
                 "le barème reçoit la sortie d'APRÈS validation — le 5,0 muet et le 5,0 compté "
                 "sont indiscernables ici.",
        detail=f"{sum(1 for b in banded if b)}/{len(banded)} score(s) dans [0,10] "
               "(les critères + le global)",
    ))

    # ── 4. le vocabulaire unifié du verdict ───────────────────────────────────
    axes.append(measured(
        "verdict_du_vocabulaire", 1.5, ok=1 if recommendation in VERDICTS else 0, total=1,
        origin=f"{_PROMPT_FILE}:47 (« vocabulaire unifié GO / PRUDENT / STOP »)",
        blind_to="la casse et les variantes voisines : « NO-GO », que ce point d'entrée émettait "
                 "avant l'unification (app/routers/scorer.py:66-69), échoue cet axe — c'est "
                 "voulu, un quatrième mot est un quatrième sens.",
        detail=f"recommandation « {recommendation or '(absente)'} »",
        data={"recommendation": recommendation},
    ))

    # ── 5. le verdict n'est JAMAIS plus optimiste que sa bande ────────────────
    if global_score is None or recommendation not in _OPTIMISM:
        axes.append(unmeasurable(
            "verdict_jamais_plus_optimiste", 3.0,
            reason=("aucun score global lisible — la bande canonique ne peut pas être calculée, "
                    "donc « plus optimiste que la bande » n'a pas de sens"
                    if global_score is None else
                    f"la recommandation « {recommendation or '(absente)'} » n'est pas dans le "
                    "vocabulaire unifié — c'est verdict_du_vocabulaire qui le sanctionne ; on ne "
                    "peut pas ordonner un mot qu'on ne connaît pas"),
            origin="app/services/account_score.py:72 (verdict_from_global_score)",
        ))
    else:
        band = verdict_from_global_score(global_score)
        respected = _OPTIMISM[recommendation] <= _OPTIMISM.get(band, _OPTIMISM["GO"])
        axes.append(measured(
            "verdict_jamais_plus_optimiste", 3.0, ok=1 if respected else 0, total=1,
            origin="app/services/account_score.py:64-70,72 (GLOBAL_GO_MIN / GLOBAL_PRUDENT_MIN "
                   "et verdict_from_global_score) + app/routers/scorer.py:66-69 (le routeur "
                   f"RÉÉCRIT la recommandation) + {_PROMPT_FILE}:47-50",
            blind_to="l'écart dans l'autre sens. Un modèle PLUS prudent que sa bande passe cet "
                     f"axe — et c'est la règle : le prompt ajoute trois conditions à GO "
                     f"({_PROMPT_FILE}:48) que la bande seule ne connaît pas. Noter l'égalité "
                     "stricte sanctionnerait un modèle qui obéit.",
            detail=f"score {global_score:g}/10 ⇒ bande « {band} » ; recommandation "
                   f"« {recommendation} » — "
                   + ("cohérente" if respected else "PLUS OPTIMISTE que la bande"),
            data={"band": band, "recommendation": recommendation, "global_score": global_score},
        ))

    # ── 6. les champs de suivi ────────────────────────────────────────────────
    ok, total = share(FOLLOW_UP_FIELDS, lambda f: present(get(output, f)))
    axes.append(measured(
        "champs_de_suivi", 1.0, ok=ok, total=total,
        origin=f"{_PROMPT_FILE}:94-97 (bloc SORTIE JSON) + {_MODEL_FILE}:22-25",
        blind_to="le contenu de ces champs. `score_delta` « +1.2 vs score brut initial » est une "
                 "chaîne libre : le barème vérifie qu'elle est écrite, jamais qu'elle est juste.",
        detail=f"{ok}/{total} champs de suivi ({', '.join(FOLLOW_UP_FIELDS)})",
    ))

    # ── 7. aucune donnée fabriquée ────────────────────────────────────────────
    axes.append(eliminatory(
        "sans_donnee_inventee", 1.0,
        violations=fabrication_violations([
            get(output, "one_line"), get(output, "score_delta_reason"), criteria,
        ]),
        origin="app/eval/metrics.py:96,521 (_FABRICATED_MARKERS + fabrication_violations — "
               "porte `passed = not violations`)",
        blind_to="une raison PLAUSIBLE mais fausse — « déjà trois consultants chez ce client » "
                 "ne contient aucun marqueur de remplissage. Aucun axe de ce barème ne l'attrape, "
                 "et c'est dit dans le caveat.",
    ))

    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="Ce barème mesure la STRUCTURE du score et la RÈGLE du verdict, jamais la justesse "
               "du score : ni que 8,5 soit mérité, ni que les raisons soient tirées de l'analyse "
               "fournie (le prompt l'interpole en `str(dict)`, donc rien n'y est relisible sans "
               "deviner), ni que la pondération indicative ait été suivie. Il répond à « ce score "
               "est-il décomposé, argumenté et cohérent avec sa bande ? », pas à « ce score "
               "est-il le bon ? ».",
    )
