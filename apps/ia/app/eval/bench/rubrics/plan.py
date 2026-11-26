"""Barème de ``bellum_plan`` — le plan de bataille, SECTION PAR SECTION.

Une particularité qu'il faut connaître avant de lire le code : **en production,
``bellum_plan`` n'est jamais UN appel.** ``phase4_plan.py`` le découpe en onze
appels concurrents — un en-tête (``bellum_plan_action_plan_meta``), un par
compartiment temporel (``bellum_plan_action_plan_phase_0..4``) et un par section
(``bellum_plan_offers``, ``_quick_wins``, ``_if_no_response``, ``_evaluation``,
``_competitive_strategy``). Ils portent tous le même prompt système et se
ramènent au même modèle (``model_policy._canonical``, ``app/services/model_policy.py:174``).

Ce module note donc **ce que la sortie contient**, et NOMME comme non mesurable
ce qu'elle ne contient pas. Conséquences assumées, toutes deux honnêtes :

* un enregistrement de la section ``offers`` ne fait bouger que les axes des
  offres ; les autres sortent du dénominateur avec leur raison ;
* l'appel ``meta`` ne rend que deux champs. Deux mesures ne font pas une note :
  ``total`` vaut ``None`` et le dit (``axes.MIN_MEASURED_AXES``). C'est la
  réponse juste — pas un trou.

⚠️ **On note la STRUCTURE et l'ACTIONNABILITÉ MÉCANIQUE**, jamais le pari
commercial : ni la pertinence d'une action, ni la justesse d'un verdict, ni la
valeur d'une offre. C'est exactement la frontière que ``rubrics/strategy.py``
énonce pour son propre barème — « on compte les champs, l'ACTION et l'offre
chiffrée, jamais la justesse du pari commercial ».

===============================  =================================================
Axe                              Primitive d'origine
===============================  =================================================
``phases_nommees``               ``ACTION_PLAN_PHASES`` (``bellum_plan.py:355``)
``actions_completes``            ``_ACTION_SCHEMA`` (``bellum_plan.py:358-362``)
``actions_avec_canal``           l'énumération de canaux du schéma (:130)
``actions_datees``               règle 4 : deadlines relatives (:69)
``identifiants_actions``         le format ``action_PHASE_INDEX`` (:92)
``minima_actions``               « MINIMUM 2 actions par phase » (:124)
``offres_completes``             les champs d'une offre (:143-153)
``offres_sourcees``              ``justifyingSignals`` (:152, :306)
``estimations_justifiees``       « obligatoire dès qu'un chiffre est avancé » (:151)
``minima_offres``                « MINIMUM 3 offres » (:142)
``quick_wins_complets``          les champs d'un quick win (:159-165)
``repli_complet``                les champs de ``if_no_response`` (:168-178)
``axes_du_bareme``               ``account_score.SCORE_AXES`` (grille /25 canonique)
``points_dans_lechelle``         idem — chaque axe sur son max
``verdict_non_invente``          « le total /25 et le verdict sont RECALCULÉS » (:182)
``risques_complets`` / ``minima_risques``  (:190-198)
``contre_angles_complets``       ``competitiveStrategy.vsCompetitors`` (:226-232)
``sous_comptes_complets`` / ``angles_dans_lenumeration``  (:211-221)
``sans_donnee_inventee``         ``metrics.fabrication_violations``
===============================  =================================================
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from app.eval.metrics import fabrication_violations
from app.prompts.bellum_plan import ACTION_PLAN_PHASES
from app.services.account_score import SCORE_AXES

from .axes import Axis, RubricResult, axis_value, eliminatory, measured, share, unmeasurable
from .reading import as_mapping, get, mappings, present

PROMPT = "bellum_plan"

#: Les canaux que le schéma ÉNONCE (``bellum_plan.py:130``, repris tel quel dans
#: le schéma de section ``bellum_plan.py:297``).
CHANNELS: frozenset[str] = frozenset(
    {"linkedin", "email", "phone", "event", "meeting", "content"}
)

#: Les sept champs d'une action dans le schéma de PRODUCTION (``_ACTION_SCHEMA``,
#: ``bellum_plan.py:358-362``). Le schéma monolithique en demande deux de plus
#: (``owner``, ``reason``) mais il n'est plus appelé nulle part : c'est celui-ci
#: qui part réellement, onze fois par plan.
ACTION_FIELDS: tuple[str, ...] = (
    "action_id", "action", "contact", "channel", "deadline", "expectedOutcome", "kpi",
)

#: Les champs d'une offre. Les trois estimations (TJM, taille d'équipe, durée)
#: n'y sont PAS : le prompt autorise explicitement à les laisser vides — « Rien
#: ne permet d'estimer ? Laisse le champ vide » (:63, :308). Les compter absentes
#: punirait exactement le comportement demandé.
OFFER_FIELDS: tuple[str, ...] = (
    "title", "pitch", "targetContact", "painAddressed", "justifyingSignals", "differentiator",
)
#: Les trois chiffres qu'une offre PEUT avancer, et qui déclenchent l'obligation
#: d'expliciter l'hypothèse.
OFFER_FIGURES: tuple[str, ...] = ("estimatedTJM", "estimatedTeamSize", "estimatedDuration")

QUICK_WIN_FIELDS: tuple[str, ...] = (
    "action", "contact", "channel", "time_required", "expected_impact",
)
RISK_FIELDS: tuple[str, ...] = ("risk", "probability", "impact", "mitigation")
VS_FIELDS: tuple[str, ...] = ("competitor", "differentiator", "talkingPoint")
SUB_ACCOUNT_FIELDS: tuple[str, ...] = (
    "name", "why", "entryContact", "suggestedOffer", "nextAction", "approachAngle", "deadline",
)
#: Les sept mouvements d'ouverture que le schéma ÉNONCE (``bellum_plan.py:212``).
APPROACH_ANGLES: frozenset[str] = frozenset(
    {"bottom_up", "middle_out", "top_down", "sandwich", "rang2", "prospection_inversee", "public"}
)

#: Ce que le modèle n'a PAS le droit d'écrire dans ``evaluation`` : le total /25
#: et le verdict sont recalculés par ``account_score`` (:182, :324).
FORBIDDEN_EVALUATION_KEYS: tuple[str, ...] = ("total", "verdict", "score")

#: Les minima que le prompt ÉNONCE, ligne par ligne.
MIN_ACTIONS_PER_PHASE = 2   # :124 et :397
MIN_OFFERS = 3              # :142
EXPECTED_QUICK_WINS = 3     # :158
MIN_RISKS = 3               # :191

#: « Les deadlines sont relatives (J+3, S+1, M+1) pour être replanifiables » (:69).
_RELATIVE_DEADLINE_RE = re.compile(r"^\s*[JSMjsm]\s*\+\s*\d+", re.UNICODE)
#: « ID unique format action_PHASE_INDEX » (:92, :126).
_ACTION_ID_RE = re.compile(r"^action_[a-z0-9]+(?:_[a-z0-9]+)*_\d+$", re.IGNORECASE)

_CANONICAL_AXES: dict[str, int] = {name: maximum for name, _, maximum in SCORE_AXES}
#: Le max d'un axe que la grille canonique ne connaît pas. Tous les axes
#: canoniques valent 5 ; un axe inventé se juge sur la même échelle, faute de
#: mieux — et l'axe le dit dans son ``blind_to``.
_DEFAULT_AXIS_MAX = max(_CANONICAL_AXES.values())


def _phases(output: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Les compartiments temporels, quelle que soit la forme de l'appel.

    Le plan complet les porte sous ``actionPlan.phases`` ; l'appel par
    compartiment (``bellum_plan_action_plan_phase_N``) rend un unique ``phase``.
    """
    action_plan = as_mapping(get(output, "actionPlan", "action_plan"))
    phases = mappings(get(action_plan, "phases"))
    single = as_mapping(get(output, "phase"))
    return phases or ([single] if single else [])


def _actions(phases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [a for p in phases for a in mappings(get(p, "actions"))]


def _figures(offer: Mapping[str, Any]) -> bool:
    return any(present(get(offer, f)) for f in OFFER_FIGURES)


def _contract_slots(output: Mapping[str, Any], phases: list[dict[str, Any]]) -> list[tuple[str, bool]]:
    """Les champs de tête des sections PRÉSENTES — et d'elles seules.

    Une section absente n'est pas une section vide : c'est un autre appel. La
    compter manquante ferait dire au banc qu'un modèle a raté ce qu'on ne lui a
    pas demandé.
    """
    slots: list[tuple[str, bool]] = []
    action_plan = as_mapping(get(output, "actionPlan", "action_plan"))
    if action_plan:
        slots += [
            ("actionPlan.strategy", present(get(action_plan, "strategy"))),
            ("actionPlan.justification", present(get(action_plan, "justification"))),
            ("actionPlan.phases", bool(phases)),
        ]
    elif present(get(output, "strategy")) or present(get(output, "justification")):
        # L'appel ``meta`` : deux champs, rien d'autre (``bellum_plan.py:378``).
        slots += [
            ("strategy", present(get(output, "strategy"))),
            ("justification", present(get(output, "justification"))),
        ]
    if as_mapping(get(output, "phase")):
        phase = as_mapping(get(output, "phase"))
        slots += [(f"phase.{k}", present(get(phase, k))) for k in ("name", "title", "objective")]
        slots.append(("phase.actions", bool(mappings(get(phase, "actions")))))
    evaluation = as_mapping(get(output, "evaluation"))
    if evaluation:
        slots += [
            ("evaluation.scoreBreakdown", bool(mappings(get(evaluation, "scoreBreakdown")))),
            ("evaluation.justification", present(get(evaluation, "justification"))),
            ("evaluation.risks", bool(mappings(get(evaluation, "risks")))),
        ]
    competitive = as_mapping(get(output, "competitiveStrategy", "competitive_strategy"))
    if competitive:
        slots += [
            ("competitiveStrategy.positioningStatement",
             present(get(competitive, "positioningStatement"))),
            ("competitiveStrategy.vsCompetitors",
             bool(mappings(get(competitive, "vsCompetitors")))),
        ]
    return slots


def _unmeasured_section(name: str, weight: float, section: str, origin: str) -> Axis:
    return unmeasurable(
        name, weight,
        reason=f"cette sortie ne porte pas la section « {section} » — en production le plan est "
               "découpé en onze appels (phase4_plan.py), donc l'absence d'une section n'est pas "
               "une faute du modèle mais un autre appel",
        origin=origin,
    )


def score(output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult:  # noqa: ARG001
    axes: list[Axis] = []
    phases = _phases(output)
    actions = _actions(phases)
    offers = mappings(get(output, "offersToPropose", "offers_to_propose"))
    quick_wins = mappings(get(output, "quick_wins", "quickWins"))
    fallback = as_mapping(get(output, "if_no_response", "ifNoResponse"))
    evaluation = as_mapping(get(output, "evaluation"))
    competitive = as_mapping(get(output, "competitiveStrategy", "competitive_strategy"))
    sub_accounts = mappings(get(output, "prioritySubAccounts", "priority_sub_accounts"))

    # ── 0. les champs de tête des sections présentes ──────────────────────────
    slots = _contract_slots(output, phases)
    if slots:
        axes.append(measured(
            "champs_du_contrat", 2.0, ok=sum(1 for _, ok in slots if ok), total=len(slots),
            origin="app/prompts/bellum_plan.py:113-139,180-198,224-233,296-333 (les schémas de "
                   "section réellement envoyés)",
            blind_to="les sections ABSENTES, volontairement : le plan part en onze appels, et une "
                     "section qu'on n'a pas demandée n'est pas une section ratée.",
            detail=" · ".join(f"{name} {'✓' if ok else '✗'}" for name, ok in slots),
        ))
    else:
        axes.append(unmeasurable(
            "champs_du_contrat", 2.0,
            reason="aucune section reconnue dans cette sortie — il n'y a pas de champ de tête à "
                   "compter ; c'est la conformité de schéma qui porte ce constat",
            origin="app/prompts/bellum_plan.py:113-139",
        ))

    # ── 1. les compartiments temporels ────────────────────────────────────────
    if phases:
        ok, total = share(phases, lambda p: str(get(p, "name") or "").strip() in ACTION_PLAN_PHASES)
        axes.append(measured(
            "phases_nommees", 2.0, ok=ok, total=total,
            origin="app/prompts/bellum_plan.py:355 (ACTION_PLAN_PHASES) + :401 (« Le champ 'name' "
                   "DOIT valoir exactement »)",
            blind_to="que le CONTENU de la phase corresponde à son horizon : des actions de mois 6 "
                     "rangées sous IMMEDIAT portent le bon nom.",
            detail=f"{ok}/{total} phase(s) dans l'énumération fermée "
                   f"({' | '.join(ACTION_PLAN_PHASES)})",
        ))
        n_phases = len(phases)
        reached = sum(
            min(1.0, len(mappings(get(p, "actions"))) / MIN_ACTIONS_PER_PHASE) for p in phases
        )
        axes.append(axis_value(
            "minima_actions", 2.0, ratio=reached / n_phases,
            origin="app/prompts/bellum_plan.py:124 (« MINIMUM 2 actions par phase ») + :397 "
                   "(« Liste 2 a 4 actions ») — même construction que "
                   "app/eval/strategy/rubric.py:62-67",
            blind_to="la QUALITÉ de ce qui remplit le quota : deux actions creuses valent deux "
                     "actions justes.",
            detail=" · ".join(
                f"{get(p, 'name') or '?'} {len(mappings(get(p, 'actions')))}/{MIN_ACTIONS_PER_PHASE}"
                for p in phases
            ),
        ))
    else:
        axes.append(_unmeasured_section("phases_nommees", 2.0, "actionPlan.phases",
                                        "app/prompts/bellum_plan.py:355"))
        axes.append(_unmeasured_section("minima_actions", 2.0, "actionPlan.phases",
                                        "app/prompts/bellum_plan.py:124"))

    # ── 2. une action est EXÉCUTABLE : complète, canalisée, datée, identifiée ──
    if actions:
        ok, total = share(actions, lambda a: all(present(get(a, f)) for f in ACTION_FIELDS))
        axes.append(measured(
            "actions_completes", 3.0, ok=ok, total=total,
            origin="app/prompts/bellum_plan.py:358-362 (_ACTION_SCHEMA, le schéma réellement "
                   "envoyé) + :123-135 (le schéma monolithique dont il descend)",
            blind_to="``owner`` et ``reason``, demandés par le schéma monolithique (:128,:131) mais "
                     "PAS par le schéma de production : les exiger noterait un champ que le "
                     "prompt expédié ne demande plus.",
            detail=f"{ok}/{total} action(s) avec les {len(ACTION_FIELDS)} champs du schéma",
        ))
        ok, total = share(
            actions, lambda a: str(get(a, "channel") or "").strip().lower() in CHANNELS
        )
        axes.append(measured(
            "actions_avec_canal", 2.0, ok=ok, total=total,
            origin="app/prompts/bellum_plan.py:130,297 (linkedin | email | phone | event | "
                   "meeting | content) + :68 (règle 3)",
            blind_to="que le canal soit le BON pour cette personne — un DSI approché par téléphone "
                     "reste dans l'énumération.",
            detail=f"{ok}/{total} action(s) sur un canal de l'énumération",
        ))
        ok, total = share(
            actions, lambda a: bool(_RELATIVE_DEADLINE_RE.match(str(get(a, "deadline") or "")))
        )
        axes.append(measured(
            "actions_datees", 2.0, ok=ok, total=total,
            origin="app/prompts/bellum_plan.py:69 (règle 4 : « Les deadlines sont relatives (J+3, "
                   "S+1, M+1) pour etre replanifiables »)",
            blind_to="que l'échéance soit RÉALISTE. « J+1 » pour obtenir un COMEX est relatif, "
                     "replanifiable, et intenable.",
            detail=f"{ok}/{total} échéance(s) relative(s) (J+n / S+n / M+n)",
        ))
        ok, total = share(
            actions, lambda a: bool(_ACTION_ID_RE.match(str(get(a, "action_id") or "").strip()))
        )
        axes.append(measured(
            "identifiants_actions", 1.0, ok=ok, total=total,
            origin="app/prompts/bellum_plan.py:92,126 (« ID unique format action_PHASE_INDEX ») — "
                   "c'est la clé de suivi de l'action en base",
            blind_to="l'UNICITÉ des identifiants entre deux appels : chaque compartiment temporel "
                     "est généré par un appel séparé qui ne voit pas les autres, donc une "
                     "collision inter-phases n'est pas visible d'ici.",
            detail=f"{ok}/{total} identifiant(s) au format attendu",
        ))
    else:
        for name, weight, origin in (
            ("actions_completes", 3.0, "app/prompts/bellum_plan.py:358-362"),
            ("actions_avec_canal", 2.0, "app/prompts/bellum_plan.py:130"),
            ("actions_datees", 2.0, "app/prompts/bellum_plan.py:69"),
            ("identifiants_actions", 1.0, "app/prompts/bellum_plan.py:92"),
        ):
            axes.append(_unmeasured_section(name, weight, "actionPlan.phases[].actions", origin))

    # ── 3. les offres ─────────────────────────────────────────────────────────
    if offers:
        ok, total = share(offers, lambda o: all(present(get(o, f)) or bool(get(o, f))
                                                for f in OFFER_FIELDS))
        axes.append(measured(
            "offres_completes", 2.0, ok=ok, total=total,
            origin="app/prompts/bellum_plan.py:143-153,299-301 (champs d'une offre)",
            blind_to="les trois estimations chiffrées, volontairement HORS de cet axe : le prompt "
                     "autorise à les laisser vides quand rien ne permet d'estimer (:63,:308), et "
                     "les compter absentes punirait exactement le comportement demandé.",
            detail=f"{ok}/{total} offre(s) avec les {len(OFFER_FIELDS)} champs non optionnels",
        ))
        ok, total = share(offers, lambda o: bool([
            s for s in (get(o, "justifyingSignals", "justifying_signals") or []) if present(s)
        ]))
        axes.append(measured(
            "offres_sourcees", 2.0, ok=ok, total=total,
            origin="app/prompts/bellum_plan.py:152,306 (« cite les signaux REELS de l'analyse […] "
                   "pas de signal invente ») + :52-58 (méthode SalesConnect, champ PREUVE)",
            blind_to="que le signal cité EXISTE dans l'analyse : la sortie ne porte pas l'analyse, "
                     "et la rapprocher demanderait le dossier assemblé.",
            detail=f"{ok}/{total} offre(s) rattachée(s) à au moins un signal",
        ))
        with_figures = [o for o in offers if _figures(o)]
        if with_figures:
            ok = sum(1 for o in with_figures
                     if present(get(o, "estimationHypothesis", "estimation_hypothesis")))
            axes.append(measured(
                "estimations_justifiees", 2.0, ok=ok, total=len(with_figures),
                origin="app/prompts/bellum_plan.py:151 (« obligatoire des qu'un chiffre est "
                       "avance ») + :59-63 (« TJM, taille d'equipe et duree sont des ESTIMATIONS »)",
                blind_to="que l'hypothèse TIENNE : « compte > 5 000 salariés → 2 consultants » est "
                         "un raisonnement écrit, pas un raisonnement vérifié.",
                detail=f"{ok}/{len(with_figures)} offre(s) chiffrée(s) avec leur hypothèse "
                       f"(sur {len(offers)} offre(s))",
            ))
        else:
            axes.append(unmeasurable(
                "estimations_justifiees", 2.0,
                reason="aucune offre n'avance de chiffre — le prompt autorise explicitement à "
                       "laisser les estimations vides (« Rien ne permet d'estimer ? Laisse le "
                       "champ vide »), donc il n'y a AUCUNE hypothèse à justifier ici",
                origin="app/prompts/bellum_plan.py:59-63,151",
            ))
        axes.append(axis_value(
            "minima_offres", 1.0, ratio=min(1.0, len(offers) / MIN_OFFERS),
            origin="app/prompts/bellum_plan.py:142 (« MINIMUM 3 offres »)",
            blind_to="la pertinence des offres : trois offres génériques valent trois offres justes.",
            detail=f"{len(offers)}/{MIN_OFFERS} offre(s)",
        ))
    else:
        for name, weight, origin in (
            ("offres_completes", 2.0, "app/prompts/bellum_plan.py:143-153"),
            ("offres_sourcees", 2.0, "app/prompts/bellum_plan.py:152"),
            ("estimations_justifiees", 2.0, "app/prompts/bellum_plan.py:151"),
            ("minima_offres", 1.0, "app/prompts/bellum_plan.py:142"),
        ):
            axes.append(_unmeasured_section(name, weight, "offersToPropose", origin))

    # ── 4. les quick wins ─────────────────────────────────────────────────────
    if quick_wins:
        ok, total = share(quick_wins, lambda q: all(present(get(q, f)) for f in QUICK_WIN_FIELDS))
        axes.append(measured(
            "quick_wins_complets", 2.0, ok=ok, total=total,
            origin="app/prompts/bellum_plan.py:157-165,312 (champs d'un quick win)",
            blind_to="que le quick win tienne vraiment en moins de quinze minutes — on lit le "
                     "champ ``time_required``, on ne chronomètre rien.",
            detail=f"{ok}/{total} quick win(s) complet(s)",
        ))
        axes.append(axis_value(
            "minima_quick_wins", 1.0, ratio=min(1.0, len(quick_wins) / EXPECTED_QUICK_WINS),
            origin="app/prompts/bellum_plan.py:158 (« EXACTEMENT 3 quick wins »)",
            blind_to="un EXCÈS : le prompt en demande exactement trois, cet axe ne pénalise pas "
                     "le quatrième — un plan trop généreux n'est pas un plan faux.",
            detail=f"{len(quick_wins)}/{EXPECTED_QUICK_WINS} quick win(s)",
        ))
    else:
        axes.append(_unmeasured_section("quick_wins_complets", 2.0, "quick_wins",
                                        "app/prompts/bellum_plan.py:157-165"))
        axes.append(_unmeasured_section("minima_quick_wins", 1.0, "quick_wins",
                                        "app/prompts/bellum_plan.py:158"))

    # ── 5. le plan B ──────────────────────────────────────────────────────────
    if fallback:
        keys = ("trigger", "different_angle", "reengagement_pretext", "escalation_option")
        ok, total = share(keys, lambda k: present(get(fallback, k)))
        axes.append(measured(
            "repli_complet", 2.0, ok=ok, total=total,
            origin="app/prompts/bellum_plan.py:168-178,313 (champs de if_no_response)",
            blind_to="que le prétexte de relance « semble naturel et non insistant » — le prompt le "
                     "demande (:176), un barème ne sait pas le lire.",
            detail=f"{ok}/{total} champs du plan B",
        ))
        alternative = as_mapping(get(fallback, "alternative_contact"))
        if alternative:
            ok, total = share(("name", "title", "reason"), lambda k: present(get(alternative, k)))
            axes.append(measured(
                "contact_alternatif_situe", 1.0, ok=ok, total=total,
                origin="app/prompts/bellum_plan.py:170-174 (alternative_contact)",
                blind_to="que la personne EXISTE : aucun barème ne peut le vérifier ici, la sortie "
                         "de cette section ne porte pas la liste des contacts fournis.",
                detail=f"{ok}/{total} champs du contact alternatif",
            ))
        else:
            axes.append(unmeasurable(
                "contact_alternatif_situe", 1.0,
                reason="aucun contact alternatif produit — c'est repli_complet qui porte le "
                       "constat, pas cet axe (qui noterait sinon deux fois la même faute)",
                origin="app/prompts/bellum_plan.py:170-174",
            ))
    else:
        axes.append(_unmeasured_section("repli_complet", 2.0, "if_no_response",
                                        "app/prompts/bellum_plan.py:168-178"))
        axes.append(_unmeasured_section("contact_alternatif_situe", 1.0, "if_no_response",
                                        "app/prompts/bellum_plan.py:170-174"))

    # ── 6. l'évaluation — la grille /25 CANONIQUE, et rien de plus ────────────
    if evaluation:
        breakdown = mappings(get(evaluation, "scoreBreakdown", "score_breakdown"))
        produced = {str(get(b, "axis") or "").strip().lower() for b in breakdown}
        ok, total = share(sorted(_CANONICAL_AXES), lambda a: a in produced)
        axes.append(measured(
            "axes_du_bareme", 3.0, ok=ok, total=total,
            origin="app/services/account_score.py:23 (SCORE_AXES — la grille /25 canonique de "
                   "l'annexe méthodo p25) + app/prompts/bellum_plan.py:182-188",
            blind_to="que la NOTE donnée à un axe soit juste. Le produit somme et bande "
                     "(account_score.verdict_for_score) ; il ne relit pas le jugement.",
            detail=f"{ok}/{total} axes canoniques présents ({', '.join(sorted(_CANONICAL_AXES))})",
        ))
        if breakdown:
            ok, total = share(breakdown, _points_in_scale)
            axes.append(measured(
                "points_dans_lechelle", 2.0, ok=ok, total=total,
                origin="app/services/account_score.py:23,31 (chaque axe sur son max, SCORE_MAX = 25)",
                blind_to="un axe HORS grille est noté sur le max canonique (5), faute de mieux : "
                         "on ne connaît pas l'échelle d'un axe que le modèle a inventé.",
                detail=f"{ok}/{total} note(s) dans [0, max de l'axe]",
            ))
            absent = sum(1 for k in FORBIDDEN_EVALUATION_KEYS if not present(get(evaluation, k)))
            axes.append(measured(
                "verdict_non_invente", 2.0, ok=absent, total=len(FORBIDDEN_EVALUATION_KEYS),
                origin="app/prompts/bellum_plan.py:182,324 (« le total /25 et le verdict […] sont "
                       "recalcules ensuite — ne les invente pas ») + "
                       "app/services/account_score.py:44 (verdict_for_score, qui les recalcule)",
                blind_to="un total glissé AILLEURS que sous ces trois clés — on cherche les noms "
                         "que le prompt interdit, pas tout nombre ressemblant à un verdict.",
                detail=f"{absent}/{len(FORBIDDEN_EVALUATION_KEYS)} clé(s) interdite(s) bien absente(s) "
                       f"({', '.join(FORBIDDEN_EVALUATION_KEYS)})",
            ))
        else:
            for name, weight, origin in (
                ("points_dans_lechelle", 2.0, "app/services/account_score.py:23"),
                ("verdict_non_invente", 2.0, "app/prompts/bellum_plan.py:182"),
            ):
                axes.append(unmeasurable(
                    name, weight,
                    reason="aucun détail de score produit — c'est axes_du_bareme qui sanctionne "
                           "l'absence, pas ces axes",
                    origin=origin,
                ))
        risks = mappings(get(evaluation, "risks"))
        if risks:
            ok, total = share(risks, lambda r: all(present(get(r, f)) for f in RISK_FIELDS))
            axes.append(measured(
                "risques_complets", 2.0, ok=ok, total=total,
                origin="app/prompts/bellum_plan.py:190-198,322 (champs d'un risque)",
                blind_to="que le risque soit RÉEL, et que sa probabilité déclarée veuille dire "
                         "quelque chose — le dépôt n'affiche aucune probabilité et n'en note aucune.",
                detail=f"{ok}/{total} risque(s) avec les {len(RISK_FIELDS)} champs",
            ))
        else:
            axes.append(unmeasurable(
                "risques_complets", 2.0,
                reason="aucun risque produit — l'absence se lit sur champs_du_contrat "
                       "(evaluation.risks)",
                origin="app/prompts/bellum_plan.py:190-198",
            ))
        axes.append(axis_value(
            "minima_risques", 1.0, ratio=min(1.0, len(risks) / MIN_RISKS),
            origin="app/prompts/bellum_plan.py:191 (« MINIMUM 3 risques »)",
            blind_to="la gravité de ce qui remplit le quota.",
            detail=f"{len(risks)}/{MIN_RISKS} risque(s)",
        ))
    else:
        for name, weight, origin in (
            ("axes_du_bareme", 3.0, "app/services/account_score.py:23"),
            ("points_dans_lechelle", 2.0, "app/services/account_score.py:23"),
            ("verdict_non_invente", 2.0, "app/prompts/bellum_plan.py:182"),
            ("risques_complets", 2.0, "app/prompts/bellum_plan.py:190-198"),
            ("minima_risques", 1.0, "app/prompts/bellum_plan.py:191"),
        ):
            axes.append(_unmeasured_section(name, weight, "evaluation", origin))

    # ── 7. la stratégie face aux concurrents ──────────────────────────────────
    vs = mappings(get(competitive, "vsCompetitors", "vs_competitors"))
    if vs:
        ok, total = share(vs, lambda v: all(present(get(v, f)) for f in VS_FIELDS))
        axes.append(measured(
            "contre_angles_complets", 2.0, ok=ok, total=total,
            origin="app/prompts/bellum_plan.py:226-232,332 (champs d'une ligne vsCompetitors)",
            blind_to="que le concurrent cité soit RÉELLEMENT en place sur ce compte : contrairement "
                     "à bellum_battlecard, ce prompt n'injecte pas de liste fermée de concurrents, "
                     "donc rien ici ne peut dire qu'un nom a été inventé.",
            detail=f"{ok}/{total} contre-angle(s) complet(s)",
        ))
    else:
        axes.append(_unmeasured_section("contre_angles_complets", 2.0,
                                        "competitiveStrategy.vsCompetitors",
                                        "app/prompts/bellum_plan.py:226-232"))

    # ── 8. les sous-comptes prioritaires ──────────────────────────────────────
    if sub_accounts:
        ok, total = share(sub_accounts, lambda s: all(present(get(s, f))
                                                      for f in SUB_ACCOUNT_FIELDS))
        axes.append(measured(
            "sous_comptes_complets", 2.0, ok=ok, total=total,
            origin="app/prompts/bellum_plan.py:213-221 (champs d'un sous-compte prioritaire)",
            blind_to="que le sous-compte vienne bien des ``priorityPerimeters`` fournis (:211) — "
                     "la sortie ne porte pas la liste, donc « n'invente PAS d'autres entités » "
                     "n'est pas vérifiable ici.",
            detail=f"{ok}/{total} sous-compte(s) avec les {len(SUB_ACCOUNT_FIELDS)} champs",
        ))
        ok, total = share(
            sub_accounts,
            lambda s: str(get(s, "approachAngle", "approach_angle") or "").strip().lower()
            in APPROACH_ANGLES,
        )
        axes.append(measured(
            "angles_dans_lenumeration", 1.0, ok=ok, total=total,
            origin="app/prompts/bellum_plan.py:212 (les 7 mouvements d'ouverture)",
            blind_to="que le mouvement choisi soit celui que le contexte recommande — la table "
                     "déterministe est en amont (opening_movement), elle n'est pas dans la sortie.",
            detail=f"{ok}/{total} angle(s) dans l'énumération des 7 mouvements",
        ))
    else:
        axes.append(_unmeasured_section("sous_comptes_complets", 2.0, "prioritySubAccounts",
                                        "app/prompts/bellum_plan.py:213-221"))
        axes.append(_unmeasured_section("angles_dans_lenumeration", 1.0, "prioritySubAccounts",
                                        "app/prompts/bellum_plan.py:212"))

    # ── 9. aucune donnée fabriquée ────────────────────────────────────────────
    axes.append(eliminatory(
        "sans_donnee_inventee", 2.0,
        violations=fabrication_violations([
            phases, offers, quick_wins, fallback, evaluation, competitive, sub_accounts,
            get(output, "strategy"), get(output, "justification"), get(output, "messages"),
        ]),
        origin="app/eval/metrics.py:96,521 (_FABRICATED_MARKERS + fabrication_violations — "
               "porte `passed = not violations`)",
        blind_to="une invention PLAUSIBLE : un contact « Directeur du Digital » chez une société "
                 "qui n'en a pas ne contient aucun marqueur de remplissage.",
    ))

    return RubricResult(
        prompt=PROMPT, axes=axes,
        caveat="Ce barème mesure la STRUCTURE et l'actionnabilité MÉCANIQUE d'un plan — champs "
               "remplis, canaux et échéances exploitables, grille /25 canonique respectée, minima "
               "atteints. Il ne dit RIEN de la valeur commerciale : ni si l'action est la bonne, "
               "ni si le verdict est mérité, ni si l'offre a une chance. Et parce que le plan part "
               "en onze appels, une sortie de section ne mesure que ses propres axes : sous trois "
               "axes mesurés, il n'y a pas de note, et la raison est écrite.",
    )


def _points_in_scale(band: Mapping[str, Any]) -> bool:
    """La note d'un axe tient-elle dans [0, son max] ? Un texte n'est pas une note."""
    raw = get(band, "points")
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        return False
    maximum = _CANONICAL_AXES.get(str(get(band, "axis") or "").strip().lower(), _DEFAULT_AXIS_MAX)
    return 0 <= float(raw) <= maximum
