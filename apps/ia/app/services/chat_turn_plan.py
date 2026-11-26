"""#2276.39-.43 — le PLAN d'un tour de Laura : budget d'outils, parallélisation,
contrôles et self-check choisis selon la complexité de la demande.

Ce qui a été écarté, et pourquoi ce fichier ne le réintroduit pas
------------------------------------------------------------------
La classification simple / analytique / recherche / orchestration / critique
(#2276.32-.36) est ÉCARTÉE : une cinquième grille de lecture de la demande à
côté du palier de modèle (#2248) aurait fait deux vérités sur « cette demande
est-elle difficile ? ». Le plan se fonde donc sur des signaux DÉJÀ présents :

* la complexité = le palier de la demande (``choose_chat_tier``, #2248) — des
  règles nommées, sans appel réseau, déjà bancées ;
* la nature des appels d'un round (lecture/écriture, ``_batches_for_round``) ;
* le nombre de sources lues (la largeur d'un lot de lectures) ;
* les capacités critiques ou financières (``CRITICAL_TOOL_NAMES``).

Ce que le plan décide
---------------------
* #2276.39 budget : une demande complexe a UN round d'outils de plus. Le budget
  de TEMPS du tour ne bouge pas — il est tenu par le plafond de l'appelant
  (``CHAT_TURN_CEILING_S`` < 120 s côté NestJS), et c'est lui qui borne tout.
* #2276.40 parallélisation : une demande complexe lit plus de sources à la fois
  (lot de lectures plus large) ; les écritures restent seules et à leur place.
* #2276.41 contrôles : un round qui a touché une capacité critique impose au
  tour suivant la règle des chiffres (``_CRITICAL_CONTROL_NOTE``).
* #2276.42 self-check : il TOURNE sur un tour critique — contrôle déterministe
  des chiffres de la réponse contre ce que les outils ont rendu — et se mesure
  (une ligne de log, un nombre, jamais le texte). Il ne réécrit pas une réponse
  déjà affichée au fil de l'eau.
* #2276.43 : une demande complexe ne part jamais sur un modèle économique
  (``is_economic_model``) — la garde vit dans ``chat_orchestrator._make_turns``.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from app.services.chat_model_routing import ChatTierContext, _normalise, choose_chat_tier
from app.services.search_universe import CoverageReport, exhaustiveness_claim_allowed

logger = logging.getLogger(__name__)

#: Le plan d'avant ce lot, à l'octet : deux rounds, lots de cinq lectures.
_SIMPLE_TOOL_ROUNDS = 2
_SIMPLE_FANOUT_LIMIT = 5
#: Une demande complexe : un round de plus, des lots de lectures plus larges.
_COMPLEX_TOOL_ROUNDS = 3
_COMPLEX_FANOUT_LIMIT = 8

#: #4417.1 (FAIL prod 25/10) — « réponds au dernier mail de X » : `search_mailbox` -> `read_mail_thread` ->
#: `prepare_mail_draft`, trois appels SÉQUENTIELS (le `thread_id` du suivant sort du précédent), plus un tour de reprise si l'un
#: échoue (destinataire sans adresse, fil non retrouvé). Avec deux
#: rounds, Laura lisait le fil puis le tour final (`offer_reply_options` seul) la forçait à rédiger la réponse
#: DANS LE CHAT, sans brouillon. Un round par outil du chemin, pas un de plus.
_MAIL_REPLY_TOOL_ROUNDS = 4

#: #3196.2 / #3196.3 (LAU-FINAL-202) — le mode ``"approfondi"`` (#2450.1,
#: épopée #2882) forçait déjà le palier ``deep`` (``MODE_TIER``,
#: ``chat_model_routing.py``), mais recevait le MÊME budget que ``"verifie"``
#: — aucune des quatre budgets nommés par l'issue (Rapide/Vérifié/Approfondi/
#: Auto) ne se distinguait de son voisin une fois le palier forcé. Un round
#: de plus qu'une demande complexe ordinaire, un lot de lectures plus large :
#: l'écart mesurable que l'issue demande, PAS le job asynchrone reprenable
#: qu'elle décrit aussi (#3196.4) — ça reste un système à part, hors de cette
#: tranche (voir le commentaire de fin sur l'issue #3196).
_APPROFONDI_FANOUT_LIMIT = _COMPLEX_FANOUT_LIMIT + 2

# #4438.1 — Laura VA AU BOUT (décision Louis 21/10, audit des conversations
# réelles : 37 % des réponses étaient une tranche partielle qui s'arrêtait au
# bout de 2 à 4 rounds et proposait la suite). Une demande de RECHERCHE ou de
# CROISEMENT reçoit jusqu'à huit appels d'outils — LA constante unique (GA-26).
# Le budget de TEMPS du tour ne bouge pas : c'est lui qui borne vraiment, et ce
# qui ne tient pas dedans continue seul (`continues_alone`).
RESEARCH_TOOL_ROUNDS = 8
#: Le mode le plus profond n'a jamais MOINS qu'une recherche ordinaire.
_APPROFONDI_TOOL_ROUNDS = RESEARCH_TOOL_ROUNDS

# #4438.1 — une demande de recherche : un verbe de recherche ET ce qu'on
# cherche (comptes, contacts, consultants, missions…). Lu sur le texte
# normalisé par `_normalise` (minuscules, sans accents), FR et EN.
_RESEARCH_VERB = re.compile(
    r"\b(?:trouv\w*|cherch\w*|recherch\w*|list\w*|identifi\w*|repere\w*|denich\w*|sors|sortir|"
    r"donne[- ]?(?:moi|nous)|quel(?:le)?s?|qui|croise\w*|find\w*|search\w*|look for|who|which)\b"
)
_RESEARCH_TARGET = re.compile(
    r"\b(?:comptes?|entreprises?|societes?|boites?|prospects?|clients?|filiales?|contacts?|decideurs?|"
    r"interlocuteurs?|personnes?|numeros?|e-?mails?|consultants?|profils?|talents?|missions?|besoins?|"
    r"offres?|appels? d'offres?|accounts?|compan(?:y|ies)|contacts?|people|decision[- ]makers?|"
    r"candidates?|jobs?)\b"
)


def is_research_request(request: str | None) -> bool:
    """#4438.1 — la demande cherche-t-elle des objets (comptes, contacts,
    consultants, missions…) plutôt qu'un geste unique ? Deux motifs fermés,
    sans appel réseau, même méthode que les règles du palier (#2248)."""
    text = _normalise(request or "")
    return bool(_RESEARCH_VERB.search(text) and _RESEARCH_TARGET.search(text))


_REPLY_VERB = re.compile(r"\b(?:repon\w*|reply|respond\w*|answer)\b")
_REPLY_TARGET = re.compile(r"\b(?:e-?mails?|mails?|inmails?|messages?|courriels?|fil)\b")


def is_mail_reply_request(request: str | None) -> bool:
    """#4417.1 — « réponds à ce mail » / « réponds au dernier mail de X » : un verbe de réponse ET un mail.
    Deux motifs fermés sur le texte normalisé, sans appel réseau (même méthode que `is_research_request`)."""
    text = _normalise(request or "")
    return bool(_REPLY_VERB.search(text) and _REPLY_TARGET.search(text))


@dataclass(frozen=True)
class TurnPlan:
    """Ce qu'un tour se donne, décidé une fois, avant le premier appel."""

    complex: bool
    reason: str
    tool_rounds: int
    fanout_limit: int
    # #4438.1 — une recherche/croisement : budget `RESEARCH_TOOL_ROUNDS`, et le
    # travail qui ne tient pas dans le tour continue seul (`continues_alone`).
    research: bool = False


SIMPLE_TURN_PLAN = TurnPlan(
    complex=False,
    reason="default",
    tool_rounds=_SIMPLE_TOOL_ROUNDS,
    fanout_limit=_SIMPLE_FANOUT_LIMIT,
)


def plan_turn(request: str | None, context: ChatTierContext | None) -> TurnPlan:
    """Le plan d'un tour. ``request=None`` (appelant d'avant) : le plan d'avant."""
    if request is None:
        return SIMPLE_TURN_PLAN
    context = context or ChatTierContext()
    decision = choose_chat_tier(request, context)
    # #4438.1 — un mode Rapide EXPLICITE garde son budget court : un geste de
    # la personne gagne sur toute lecture du texte (#2450.1).
    research = context.requested_mode != "rapide" and (
        decision.reason in _CROSSING_TIER_REASONS or is_research_request(request)
    )
    if decision.tier != "deep":
        if research:
            return TurnPlan(
                complex=False,
                reason="research",
                tool_rounds=RESEARCH_TOOL_ROUNDS,
                fanout_limit=_SIMPLE_FANOUT_LIMIT,
                research=True,
            )
        # #4417.1 — répondre à un mail est un geste simple, mais à trois outils : il reçoit leur budget.
        if is_mail_reply_request(request):
            return TurnPlan(
                complex=False,
                reason="mail_reply",
                tool_rounds=_MAIL_REPLY_TOOL_ROUNDS,
                fanout_limit=_SIMPLE_FANOUT_LIMIT,
            )
        return SIMPLE_TURN_PLAN
    # #3196.3 — un geste EXPLICITE pour le mode le plus profond reçoit le
    # budget le plus large : la même priorité que le mode lui-même sur toute
    # heuristique (voir ``choose_chat_tier``, "mode_approfondi").
    if decision.reason == "mode_approfondi":
        return TurnPlan(
            complex=True,
            reason=decision.reason,
            tool_rounds=_APPROFONDI_TOOL_ROUNDS,
            fanout_limit=_APPROFONDI_FANOUT_LIMIT,
            research=research,
        )
    return TurnPlan(
        complex=True,
        reason=decision.reason,
        tool_rounds=RESEARCH_TOOL_ROUNDS if research else _COMPLEX_TOOL_ROUNDS,
        fanout_limit=_COMPLEX_FANOUT_LIMIT,
        research=research,
    )


#: #4438.1 — les raisons du palier qui SONT un croisement : plusieurs familles
#: d'outils lourds dans la même demande, ou une analyse de compte multi-source.
_CROSSING_TIER_REASONS: frozenset[str] = frozenset({"heavy_tools", "account_analysis"})


def continues_alone(plan: TurnPlan) -> bool:
    """#4438.1 — le travail de CE tour, s'il ne tient pas dans son budget,
    continue-t-il SEUL (tâche de fond de reprise, `chat_deepen_jobs`) plutôt
    que de proposer la suite ? Le mode Approfondi (#3236.2) et toute
    recherche/croisement."""
    return plan.reason == "mode_approfondi" or plan.research


#: R22-LG (recette prod 22/10, #4433) — les rounds STÉRILES consécutifs (zéro
#: résultat, outil en échec) qu'une recherche s'accorde pour passer au palier
#: suivant (externe, secteur voisin, zone voisine) avant que le gain nul ne
#: l'arrête. Le budget du tour (`RESEARCH_TOOL_ROUNDS`, temps) reste maître.
RESEARCH_STERILE_ROUNDS_MAX = 2


def keeps_widening_after_sterile_round(plan: TurnPlan, gains: Sequence[int]) -> bool:
    """R22-LG — une recherche dont le dernier round n'a rien rendu continue-t-elle
    (palier suivant) au lieu de s'arrêter sur gain nul ? Avant : le premier zéro
    de l'espace arrêtait le tour avant la bascule externe, et la réponse finissait
    sur « recherche externe… reste à faire » avec zéro compte."""
    if not plan.research or not gains or gains[-1] > 0:
        return False
    sterile = 0
    for gain in reversed(gains):
        if gain > 0:
            break
        sterile += 1
    return sterile <= RESEARCH_STERILE_ROUNDS_MAX


#: #2276.41 — les capacités CRITIQUES : l'argent (chiffre d'affaires, pipeline,
#: impayés, blocages de facturation, avenant de mission), et ce qui débite ou
#: écrit hors de Bellum (analyse de compte, export CRM). Une liste FERMÉE et
#: vérifiée contre le catalogue (``tests/test_chat_turn_plan.py``).
CRITICAL_TOOL_NAMES: frozenset[str] = frozenset(
    {
        "get_revenue",
        # #2900 (#2415.10, LOT c6 26/09) — le CA confirmé est de l'argent,
        # même famille que `get_revenue` juste au-dessus.
        "get_confirmed_revenue",
        "get_pipeline",
        "get_overdue_payments",
        "get_invoice_blockers",
        "propose_mission_amendment",
        "export_contact_to_crm",
        "start_account_analysis",
        # #4462.1 — une liste d'analyses lancées d'office.
        "analyze_named_companies",
    }
)


def round_is_critical(tool_names: Iterable[str]) -> bool:
    """Un round est critique dès qu'UN de ses appels l'est."""
    return any(name in CRITICAL_TOOL_NAMES for name in tool_names)


#: #2146.9 (via #2898) — les raisons du palier (#2248) qui, PAR LEUR PROPRE
#: DÉFINITION, supposent plusieurs recherches/croisements avant de répondre :
#: une analyse de compte (dossier multi-source), un plan à plusieurs étapes,
#: ou au moins deux familles d'outils lourds nommées dans la même demande.
#: ``explicit_depth``/``quality_floor_actuality``/``default`` en sont exclus :
#: creuser UNE réponse, ou vouloir de la fraîcheur, ne dit rien de PLUSIEURS
#: recherches croisées. Aucun classifieur ajouté pour l'occasion — la
#: cinquième grille (#2276.32-.36) reste ÉCARTÉE, voir le docstring du module.
_MULTI_SEARCH_TIER_REASONS: frozenset[str] = frozenset(
    {"account_analysis", "multi_step_plan", "heavy_tools"}
)


def requires_multiple_searches(plan: TurnPlan) -> bool:
    """#2146.9 — la demande a-t-elle DÉJÀ été mesurée comme nécessitant
    plusieurs recherches croisées ? Dérivé du SEUL signal réel disponible
    avant le premier appel outil (le palier, #2248) — jamais un signal
    inventé pour router (`agent_docs/doctrine.md:19`, JAMAIS de donnée
    fictive)."""
    return plan.reason in _MULTI_SEARCH_TIER_REASONS


#: #2146.10 (via #2898) — la raison du palier (#2248) qui, par SA PROPRE
#: définition, dit que la demande est LARGE plutôt que CROISÉE : une demande
#: longue, à plusieurs questions, ou en liste de plusieurs volets
#: (``long_or_complex``). Ce n'est PAS une recherche à travers plusieurs
#: sources (déjà ``_MULTI_SEARCH_TIER_REASONS`` ci-dessus, disjoint de
#: celui-ci) — c'est UNE inspection, mais volumineuse : plus à parcourir
#: qu'à répondre en ligne. Aucun classifieur ajouté — même méthode que
#: `requires_multiple_searches`, le même signal déjà mesuré (#2248).
_LARGE_INSPECTION_TIER_REASONS: frozenset[str] = frozenset({"long_or_complex"})


def requires_large_inspection(plan: TurnPlan) -> bool:
    """#2146.10 — la demande a-t-elle DÉJÀ été mesurée comme une inspection
    volumineuse (longue, à plusieurs questions, ou en liste de plusieurs
    volets) plutôt qu'une recherche croisée ? Disjoint de
    `requires_multiple_searches` : le routeur (`laura_router.decide_action`)
    vérifie LAUNCH_JOB avant OPEN_SURFACE, donc une même raison de palier ne
    doit jamais matcher les deux, sous peine de figer OPEN_SURFACE."""
    return plan.reason in _LARGE_INSPECTION_TIER_REASONS


#: #2276.43 — les marqueurs d'un modèle ÉCONOMIQUE, en mot entier : ``gemini``
#: ne contient pas le mot ``mini``.
_ECONOMIC_MODEL = re.compile(
    r"(?:^|[-_:/.\s])(?:haiku|mini|nano|lite)(?:$|[-_:/.\s\d])", re.IGNORECASE
)


def is_economic_model(model: str) -> bool:
    return bool(_ECONOMIC_MODEL.search(model or ""))


# ── #2276.42 — le self-check des chiffres ───────────────────────────────────

# Un nombre écrit : chiffres, séparés de milliers par espace/point/virgule.
_NUMBER = re.compile(r"\d(?:[\d   .,]*\d)?")
_NON_DIGIT = re.compile(r"\D")


def _digits(raw: str) -> str:
    # « 1 250 000 », « 1,250,000 » et « 1250000 » sont le même nombre ;
    # « 18,5 » et « 18.5 » aussi.
    return _NON_DIGIT.sub("", raw).lstrip("0") or "0"


def _is_noise(digits: str) -> bool:
    # Un chiffre seul (« 3 relances ») ne se vérifie pas utilement, et une année
    # nommée n'est pas une mesure.
    return len(digits) < 2 or (len(digits) == 4 and 1900 <= int(digits) <= 2100)


def unverified_figures(text: str, tool_outputs: Iterable[str]) -> list[str]:
    """Les nombres de la réponse qu'AUCUN outil du tour n'a rendus.

    Déterministe, sans appel de modèle : une comparaison de chiffres, après
    normalisation des séparateurs. Un nombre retrouvé dans une sortie d'outil
    est ancré ; les autres sont rendus, dans leur ordre d'apparition.
    """
    known = {
        _digits(match) for output in tool_outputs for match in _NUMBER.findall(output)
    }
    missing: list[str] = []
    for match in _NUMBER.findall(text or ""):
        digits = _digits(match.strip(" .,"))
        if _is_noise(digits) or digits in known or digits in missing:
            continue
        missing.append(digits)
    return missing


# ── #213.1/.3/.7 (#3207) — le self-check du contrat de comptage ─────────────
#
# Antériorité : `unverified_figures` (#2276.42) vérifie qu'un nombre a une
# SOURCE ; il ne vérifie pas qu'il porte une UNITÉ. « 41 consultants observés »
# peut très bien être ancré dans une sortie d'outil et rester ambigu (41
# personnes ? 41 CV ? 41 occurrences ?) — c'est ce deuxième trou que ce
# contrôle comble, même famille (déterministe, sans appel de modèle, mesuré
# jamais cité), même limite assumée : une PROXIMITÉ textuelle, pas une
# classification sémantique par `object_type` (#213.2 — le contrat de
# comptage à quinze champs — reste hors lot, il suppose que chaque outil sache
# déjà distinguer ses propres unités).
#
# Les UNITÉS #213.3, à distinguer explicitement dans le corps LAU-FINAL-213.
# Un mot de métier ambigu (« consultant », « décideur ») n'y figure PAS : c'est
# précisément ce que l'exemple critique de l'issue reproche.
_UNIT_WORDS = re.compile(
    r"\b("
    r"personnes?|parcours|missions?|exp[ée]riences?|observations?|"
    r"entreprises?|filiales?|projets?|contacts?|signal(?:aux)?|"
    r"sources?|offres?|relations?"
    r")\b",
    re.IGNORECASE,
)
#: Un repère de période ou de statut temporel (#213.7 : « période » fait
#: aussi partie du NO-GO, pas seulement l'unité).
_SCOPE_WORDS = re.compile(
    r"\b(p[ée]riodes?|entre|depuis|actuellement|historiques?)\b",
    re.IGNORECASE,
)
#: Fenêtre de proximité (caractères) autour du nombre où chercher une unité ou
#: un repère de période.
_UNIT_WINDOW = 40


def numbers_missing_unit(text: str) -> list[str]:
    """Les nombres de la réponse sans UNITÉ ni repère de période à proximité.

    Heuristique de proximité textuelle, pas une lecture du sens : elle ne sait
    pas qu'« un consultant » recouvre plusieurs UNITÉS à la fois, seulement
    dire qu'AUCUN mot d'unité ni de période n'entoure le nombre.
    """
    text = text or ""
    missing: list[str] = []
    for match in _NUMBER.finditer(text):
        digits = _digits(match.group().strip(" .,"))
        if _is_noise(digits) or digits in missing:
            continue
        start = max(0, match.start() - _UNIT_WINDOW)
        end = min(len(text), match.end() + _UNIT_WINDOW)
        window = text[start:end]
        if _UNIT_WORDS.search(window) or _SCOPE_WORDS.search(window):
            continue
        missing.append(digits)
    return missing


# ── #214.4/.7 (#3208) — le self-check du contrat de couverture ──────────────
#
# Antériorité : `COPILOT_FORBIDDEN_PHRASINGS` (apps/ia/app/prompts/
# forbidden_phrasings.py, #1922.17) bannit DÉJÀ la phrase exacte « voici une
# analyse exhaustive » au niveau du PROMPT (ce qu'on demande à Laura de ne pas
# dire). Ce contrôle-ci est un FILET, pas un doublon (GA-26 : un réglage à un
# seul endroit — celui-ci en est un autre, la VÉRIFICATION après coup, pas la
# consigne) : il généralise aux formes que le prompt ne couvre pas encore
# (« tous les décideurs », « la liste complète ») et se mesure comme
# `unverified_figures`, jamais en citant le texte.
#
# Une réclamation d'exhaustivité : « tous/toutes les X », sauf l'idiome
# « tous les deux/trois... » qui ne parle pas d'une population.
_ALL_OF_X = re.compile(
    r"\b(?:tous|toutes|all)\s+(?:les|the)\b(?!\s+(?:deux|trois|quatre|cinq|two|three|four|five)\b)",
    re.IGNORECASE,
)
#: Un adjectif d'exhaustivité, scopé à un nom de couverture/recherche proche
#: (jamais nu : « un dossier complet » est la promesse produit elle-même,
#: CLAUDE.md § Projet — pas une réclamation d'exhaustivité de recherche).
_COMPLETENESS_WORD = re.compile(
    r"\b(exhaustifs?|exhaustives?|complets?|compl[eè]tes?)\b",
    re.IGNORECASE,
)
_COVERAGE_NOUN_NEARBY = re.compile(
    r"\b(listes?|r[ée]sultats?|recherches?|couvertures?|panoramas?|inventaires?|r[ée]pertoires?|analyses?)\b",
    re.IGNORECASE,
)
#: Une négation à proximité immédiate désamorce la réclamation : « liste NON
#: exhaustive », « couverture PARTIELLE » sont explicitement AUTORISÉES par
#: LAU-FINAL-214.
_NEGATION_NEARBY = re.compile(
    r"\b(non|pas|peu|partielle?s?|insuffisante?s?)\b",
    re.IGNORECASE,
)
_CLAIM_WINDOW = 30


def _negated(text: str, start: int) -> bool:
    return bool(_NEGATION_NEARBY.search(text[max(0, start - _CLAIM_WINDOW) : start]))


def unjustified_absolute_claims(text: str, coverage: CoverageReport | None = None) -> list[str]:
    """Les réclamations d'exhaustivité (« tous », « exhaustif », « complet »)
    que rien, dans le texte, ne vient justifier ou nuancer.

    Déterministe, sans contrat de couverture réel à consulter (#214.1/.2 —
    hors lot) : tant qu'aucun code ne calcule encore une vraie justification,
    toute réclamation NON explicitement nuancée par une négation proche reste
    considérée injustifiée.

    #214.4/.7 (épopée #3229, LAU-FINAL-214) — le ban devient CONDITIONNEL au
    contrat que ``search_universe.exhaustiveness_claim_allowed`` pose : un
    ``CoverageReport`` qui le prouve (couverture MESURÉE à 100 %, rien
    d'exclu/non résolu/source indisponible) le lève ; son absence (``None``,
    l'appel d'aujourd'hui depuis ``_self_check`` tant qu'aucun outil ne
    construit encore ce rapport pour un tour de chat arbitraire) le laisse
    INCONDITIONNEL. Rend les MARQUEURS (premier mot de la réclamation,
    minuscule), dédoublonnés et triés — jamais le texte qui les entoure.
    """
    if coverage is not None and exhaustiveness_claim_allowed(coverage):
        return []
    text = text or ""
    found: list[str] = []
    for match in _ALL_OF_X.finditer(text):
        if _negated(text, match.start()):
            continue
        found.append(match.group())
    for match in _COMPLETENESS_WORD.finditer(text):
        if _negated(text, match.start()):
            continue
        start = max(0, match.start() - _CLAIM_WINDOW)
        end = min(len(text), match.end() + _CLAIM_WINDOW)
        if not _COVERAGE_NOUN_NEARBY.search(text[start:end]):
            continue
        found.append(match.group())
    return sorted({claim.split()[0].lower() for claim in found})


def tool_output_text(output: object) -> str:
    """Une sortie d'outil, en texte comparable (JSON sans espaces superflus)."""
    if isinstance(output, str):
        return output
    try:
        return json.dumps(output, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return str(output)


# ── #3196.5 (LAU-FINAL-202) — dédoublication : « ne jamais appeler deux fois
# la même source avec les mêmes paramètres dans un même run » ─────────────


def call_signature(name: str, arguments: dict) -> tuple[str, str]:
    """Ce qui identifie un appel : son nom et ses arguments, normalisés en
    JSON à clés triées — deux appels aux mêmes valeurs, dans un ordre de clés
    différent, comptent comme UNE seule source. Une valeur non sérialisable
    retombe sur ``str()`` (même geste que ``tool_output_text``) plutôt que de
    faire planter la détection pour un argument exotique."""
    try:
        normalised = json.dumps(
            arguments, sort_keys=True, ensure_ascii=False, default=str
        )
    except (TypeError, ValueError):
        normalised = str(arguments)
    return (name, normalised)


def duplicate_call_names(
    calls: Iterable[tuple[str, dict]],
    *,
    already_called: frozenset[tuple[str, str]],
) -> tuple[str, ...]:
    """Les noms d'outils de CE round qui répètent une signature déjà vue plus
    tôt dans le MÊME tour (``already_called``) ou plus tôt dans ce même
    round. DÉTECTION SEULE — même geste que
    ``tool_planner.summarize_and_record_round`` : ne filtre ni ne bloque
    aucun appel, aucun comportement de la boucle ne change. Rejouer le
    résultat d'un appel déjà exécuté (au lieu de le répéter) reste hors de
    cette tranche — c'est un changement du CHEMIN d'exécution, pas de son
    observation."""
    seen = set(already_called)
    duplicates: list[str] = []
    for name, arguments in calls:
        signature = call_signature(name, arguments)
        if signature in seen:
            duplicates.append(name)
        else:
            seen.add(signature)
    return tuple(duplicates)


# ── #3196.6 (LAU-FINAL-202) — observabilité d'UN TOUR, pas d'un round ──────
#
# ``tool_planner.PlanExecutionLog`` journalise déjà un ROUND (outils choisis
# contre outils disponibles). Ce qui manquait est le résumé du TOUR ENTIER,
# au moment où il compte le plus : quand le budget a manqué. Les huit champs
# sont ceux nommés par l'issue — aucun n'est renommé, pour qu'ils restent
# cherchables tels quels dans les journaux.


@dataclass(frozen=True)
class TurnObservability:
    execution_plan: str
    planned_steps: int
    completed_steps: int
    skipped_steps: int
    parallel_calls: int
    budget_exhausted: bool
    degraded_answer: bool
    job_created: bool
    # #3218 — la trace DURABLE du moteur d'approfondissement (l'événement `step`
    # est effacé à l'écran au premier fragment) : `{kind:'pass', pass:N}` ou
    # `{kind:'stop', reason}`. Vide ⇒ aucune clé sur le fil (octet identique).
    deepening: tuple[dict[str, object], ...] = ()
    # #3861.5 (BEL-LAU-1008-010) — un repli vers une capacité moindre (#2276.43 :
    # jamais un modèle économique pour une demande complexe) n'est pas masqué
    # comme une exécution équivalente. `False` (le défaut, et tout appelant
    # d'avant ce champ) : chemin byte-identique — seul `_make_turns` le pose à
    # `True`, jamais deviné depuis un nom de modèle ici (doctrine : nos
    # fournisseurs ne se nomment jamais, même en observabilité).
    capability_fallback: bool = False


def build_turn_observability(
    *,
    plan: TurnPlan,
    completed_steps: int,
    parallel_calls: int,
    budget_exhausted: bool,
    degraded_answer: bool,
    job_created: bool = False,
    deepening: tuple[dict[str, object], ...] = (),
    capability_fallback: bool = False,
) -> TurnObservability:
    """``execution_plan`` reprend la RAISON du plan (``plan.reason`` —
    ``"default"``, ``"mode_approfondi"``, …), le seul nom de plan que le tour
    connaisse déjà (#2276, ``choose_chat_tier``) — inventer un second
    vocabulaire ferait deux vérités sur le même plan. ``skipped_steps`` ne
    descend jamais sous zéro : un tour qui a réellement consommé plus de
    rounds que ``plan.tool_rounds`` n'en prévoyait (ne devrait pas arriver,
    la boucle appelante est bornée par ``range(plan.tool_rounds)``) reste
    HONNÊTE plutôt que de rendre un nombre négatif absurde."""
    skipped = max(plan.tool_rounds - completed_steps, 0)
    return TurnObservability(
        execution_plan=plan.reason,
        planned_steps=plan.tool_rounds,
        completed_steps=completed_steps,
        skipped_steps=skipped,
        parallel_calls=parallel_calls,
        budget_exhausted=budget_exhausted,
        degraded_answer=degraded_answer,
        job_created=job_created,
        deepening=deepening,
        capability_fallback=capability_fallback,
    )


def record_turn_observability(
    observability: TurnObservability, *, correlation_id: str
) -> None:
    """Fail-soft de bout en bout, même geste que
    ``tool_planner.record_plan_execution_log`` : un incident d'écriture de
    journal ne doit JAMAIS faire planter un tour de chat par ailleurs
    correct. Le corps des messages ne sort jamais vers un journal (doctrine)
    — seuls des noms, des nombres et des booléens sont journalisés."""
    try:
        logger.info(
            "Laura observabilité tour : execution_plan=%s planned_steps=%d completed_steps=%d "
            "skipped_steps=%d parallel_calls=%d budget_exhausted=%s degraded_answer=%s "
            "job_created=%s capability_fallback=%s (cid=%s)",
            observability.execution_plan,
            observability.planned_steps,
            observability.completed_steps,
            observability.skipped_steps,
            observability.parallel_calls,
            observability.budget_exhausted,
            observability.degraded_answer,
            observability.job_created,
            observability.capability_fallback,
            correlation_id,
        )
    except Exception:  # noqa: BLE001 — le journal ne doit jamais faire planter le chat
        logger.exception("chat_turn_plan: échec d'écriture de l'observabilité du tour")


# ── #3196.6 (reste, LAU-FINAL-202) — hors des journaux Python ──────────────
#
# Ce que `record_turn_observability` écrit ne sert qu'à un `grep` de logs —
# l'issue #3196 réclame aussi l'exposition côté API. `run_chat_with_tools`
# accepte un `observability_sink` (liste de l'APPELANT, remplie par
# référence — même patron que `collected`, #1957.12) : y ajouter une entrée
# au tuple `(reply, actions)` casserait le contrat documenté d'`actions`
# (« une entrée par outil RÉELLEMENT exécuté », lu par `turn_outcome` et par
# la quasi-totalité de la suite de tests de l'orchestrateur).


def turn_observability_as_dict(observability: TurnObservability) -> dict[str, object]:
    """La `TurnObservability` d'un tour, en `dict` JSON-sérialisable — les
    HUIT champs nommés par l'issue #3196, sous la même clé qu'eux, plus
    `capability_fallback` (#3861.5, #2276.43). L'appelant
    (``app/routers/chat.py``) la pose sur ``context["turn_observability"]``."""
    wire: dict[str, object] = {
        "execution_plan": observability.execution_plan,
        "planned_steps": observability.planned_steps,
        "completed_steps": observability.completed_steps,
        "skipped_steps": observability.skipped_steps,
        "parallel_calls": observability.parallel_calls,
        "budget_exhausted": observability.budget_exhausted,
        "degraded_answer": observability.degraded_answer,
        "job_created": observability.job_created,
        "capability_fallback": observability.capability_fallback,
    }
    if observability.deepening:
        wire["deepening"] = [dict(event) for event in observability.deepening]
    return wire


__all__ = [
    "CRITICAL_TOOL_NAMES",
    "SIMPLE_TURN_PLAN",
    "TurnObservability",
    "TurnPlan",
    "build_turn_observability",
    "call_signature",
    "duplicate_call_names",
    "is_economic_model",
    "numbers_missing_unit",
    "plan_turn",
    "record_turn_observability",
    "requires_large_inspection",
    "requires_multiple_searches",
    "round_is_critical",
    "tool_output_text",
    "turn_observability_as_dict",
    "unjustified_absolute_claims",
    "unverified_figures",
]
