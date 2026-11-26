"""#2248 — Laura choisit son palier de modèle, demande par demande.

Demande de Louis (17/09/2026) : « Laura doit pouvoir choisir entre plusieurs
modèles plus ou moins chers : tourner sur un modèle rapide par défaut, et un
modèle fort pour les vraies demandes de fond, dans certaines exceptions. »

Décision du même jour, et ce qu'elle exclut
-------------------------------------------

* **Un classifieur à RÈGLES, pas un appel de modèle en plus.** Demander à un
  modèle « cette demande est-elle difficile ? » ajouterait un aller-retour
  payant et une latence à CHAQUE tour — c'est-à-dire exactement ce que le
  palier rapide cherche à retirer. Les règles sont nommées, ordonnées, et
  chacune est figée par le banc ``tests/test_chat_model_routing.py``.
* **Deux paliers, deux tâches de la passerelle** (``chat_fast`` et
  ``chat_deep``). Leur destination se règle comme toutes les autres :
  ``LLM_ROUTE_CHAT_FAST`` / ``LLM_ROUTE_CHAT_DEEP`` (même forme que
  ``LLM_ROUTE_CHAT``, ``fournisseur[:modèle]``). La destination est résolue
  par ``llm_gateway.resolve_dispatch`` — la MÊME dérivation que ``complete`` —
  donc le bris de glace ``LLM_GATEWAY_DISABLED``, le repli vers Anthropic et
  « le modèle suit son fournisseur » valent pour les paliers sans être réécrits.
* **Sans réglage = no-op STRICT.** Aucun des deux réglages posé ⇒ le
  classifieur ne tourne même pas, la tâche résolue reste ``bellum_chat``, le
  coût se compte sous ``bellum_chat`` : chemin byte-identique à celui d'avant.
  Un palier non réglé HÉRITE de la destination du chat entier
  (``llm_gateway._TASK_ROUTE_INHERITS``) : poser le seul palier fort ne déplace
  pas le quotidien.
* **Un coupe-circuit** — ``CHAT_MODEL_ROUTING_DISABLED`` (capacité
  ``copilot.model_routing``) — ramène le chemin d'avant sans retirer les
  réglages.
* **Aucun nom de modèle à l'écran ni dans un prompt** (doctrine « nos
  fournisseurs ne se nomment jamais ») : le palier ne sort d'ici que vers la
  mesure (ligne de log, nom de coût du tour), jamais vers la personne.

Ce qui n'est PAS mesuré : la qualité de Laura sur un palier rapide. Le code
rend la bascule possible et réversible ; il ne la décide pas.
"""

from __future__ import annotations

import logging
import os
import re
import unicodedata
from dataclasses import dataclass
from typing import Literal, NamedTuple

from app.middleware.correlation_id import get_correlation_id
from app.services import llm_gateway
from app.services.kill_switch import CHAT_MODEL_ROUTING_KILL_SWITCH, disabled

logger = logging.getLogger(__name__)

Tier = Literal["fast", "deep"]

#: #2440.56/.60/.61 (épopée #2975) — le RISQUE de la demande, tel que ce module
#: peut le lire SANS inventer de classifieur. ``"unknown"`` est le défaut de
#: TOUT appelant d'avant ce champ : chemin byte-identique. ``"elevated"`` ne
#: vient jamais d'un texte analysé — seulement d'un fait déjà mesuré ailleurs
#: (voir ``ChatTierContext.risk``).
RiskTier = Literal["unknown", "elevated"]

#: #2450.1 (épopée #2882) — les quatre modes NOMMÉS que l'épopée demande
#: (Auto/Rapide/Vérifié/Approfondi), tels qu'une future surface les posera.
#: ⚠️ Ceci n'est PAS la policy à 14 paramètres de #2450.2 (modèles, outils,
#: budget, arrêt, evidence graph…) — seul le PALIER DE MODÈLE en dépend pour
#: l'instant. Le reste de l'épopée (sélecteur sur 6 surfaces, plancher de
#: qualité, jobs reprenables pour Approfondi) reste un système à part, à
#: plusieurs jours, non repris par ce lot.
RequestedMode = Literal["auto", "rapide", "verifie", "approfondi"]

#: `'rapide'`/`'verifie'`/`'approfondi'` forcent leur palier ; `'auto'` n'a
#: pas d'entrée ici — il laisse les règles ci-dessous décider, EXACTEMENT
#: comme avant ce lot.
MODE_TIER: dict[str, Tier] = {"rapide": "fast", "verifie": "deep", "approfondi": "deep"}

#: La tâche de la passerelle de chaque palier — c'est elle qui donne son nom au
#: réglage (``LLM_ROUTE_CHAT_FAST`` / ``LLM_ROUTE_CHAT_DEEP``).
TIER_TASKS: dict[Tier, str] = {"fast": "chat_fast", "deep": "chat_deep"}

#: #2443.9 (#2899) — la tâche du modèle candidat servi à la cohorte canary.
CANARY_TASK = "chat_canary"

#: Les règles, dans l'ordre où elles sont essayées. La PREMIÈRE qui répond
#: donne le palier fort et SA raison ; ``default`` est le palier rapide.
#: ⚠️ `mode_*` sont AJOUTÉES EN FIN, jamais au milieu (même discipline que
#: GA-08 côté TypeScript) — même si elles sont en fait vérifiées EN PREMIER
#: dans `choose_chat_tier` : un geste explicite (choisir un mode) gagne sur
#: toute heuristique, la même priorité que `explicit_depth` déjà en tête.
TIER_REASONS: tuple[str, ...] = (
    "explicit_depth",
    "account_analysis",
    "multi_step_plan",
    "heavy_tools",
    "long_or_complex",
    "default",
    "mode_rapide",
    "mode_verifie",
    "mode_approfondi",
    "quality_floor_actuality",
    # #2440.56/.60/.61 (épopée #2975) — AJOUTÉE EN FIN (même discipline GA-08
    # que les `mode_*` ci-dessus), bien que vérifiée EN DERNIER dans
    # `choose_chat_tier` : elle ne répond que si aucune règle précédente
    # (mode explicite compris) n'a déjà donné `deep`.
    "elevated_risk",
)

#: Longueur à partir de laquelle une demande est « de fond » à elle seule.
#: Une demande courante (ouvrir une fiche, poser un rappel, préparer un mail)
#: tient en une ou deux phrases — sous 200 caractères dans le banc ; 600, c'est
#: un paragraphe de contexte à digérer.
LONG_REQUEST_CHARS = 600
#: Trois questions dans un même message : plusieurs réponses à articuler.
MANY_QUESTIONS = 3
#: Trois éléments de liste : une demande en plusieurs volets.
MANY_ITEMS = 3
#: Deux familles d'outils lourds nommées dans la même demande.
HEAVY_TOOL_FAMILIES_MIN = 2

#: Mode OMBRE (décision de Louis, 17/09/2026) : le palier se journalise sans
#: rien router, tant qu'aucun palier n'est réglé. Lu par ``shadow_active``.
SHADOW_ENV_VAR = "CHAT_MODEL_ROUTING_SHADOW"
_SHADOW_ON = frozenset({"1", "true"})


@dataclass(frozen=True)
class ChatTierContext:
    """Ce que le classifieur lit AUTOUR de la demande.

    ``account_in_scope`` : un compte est actif dans le fil — « fais-moi une
    analyse » y vise ce compte-là.

    ``requested_mode`` — #2450.1 (épopée #2882) : le mode que la personne a
    choisi, quand une surface future en pose un. ``None``/``"auto"`` : elle
    n'a rien choisi (ou aucun sélecteur n'existe encore) — les règles
    ci-dessous décident seules, chemin BYTE-IDENTIQUE à avant ce lot.
    ``"rapide"``/``"verifie"``/``"approfondi"`` : un geste EXPLICITE, qui
    gagne sur toute heuristique — même priorité que ``explicit_depth``.
    """

    account_in_scope: bool = False
    requested_mode: RequestedMode | None = None
    #: #2443.9 (#2899) — l'espace du tour est dans la cohorte canary
    #: (`app.eval.chat_canary`). ``False`` (défaut, tout appelant d'avant) :
    #: chemin BYTE-IDENTIQUE. N'a d'effet que si `LLM_ROUTE_CHAT_CANARY` est posée.
    canary: bool = False
    #: #2440.56/.60/.61 (épopée #2975) — MODEL POLICY : « choisir selon […] le
    #: risque […] ». ``"unknown"`` (le défaut, et tout appelant d'avant ce
    #: champ) laisse les règles ci-dessous décider seules, chemin
    #: BYTE-IDENTIQUE à avant ce lot — exactement la même discipline que
    #: `requested_mode=None`. ``"elevated"`` ne doit JAMAIS venir d'un texte
    #: analysé ici : c'est un FAIT déjà mesuré par l'appelant (aujourd'hui,
    #: `apps/ia/app/routers/chat.py` le lit sur
    #: ``thread.previous.proposals`` — une proposition d'ÉCRITURE, projetée
    #: par #1927 depuis un vrai statut `pending_confirmation`, encore en
    #: attente de confirmation dans ce fil : la personne s'apprête
    #: probablement à la confirmer, exactement le moment où la doctrine MODEL
    #: POLICY nomme le risque).
    risk: RiskTier = "unknown"


class ChatTierDecision(NamedTuple):
    """Le palier ET la règle qui l'a choisi — la raison voyage avec le choix."""

    tier: Tier
    reason: str


class ChatRoute(NamedTuple):
    """Ce qu'un tour de chat résout AVANT d'appeler le modèle.

    ``task`` part dans ``llm_gateway.resolve_dispatch`` ; ``cost_name`` est le
    nom sous lequel le coût du tour est compté (``_log_usage``) ; ``decision``
    est ``None`` quand le routage n'a pas tourné — le chemin d'avant.
    """

    task: str
    cost_name: str
    decision: ChatTierDecision | None


def _pattern(*alternatives: str) -> re.Pattern[str]:
    return re.compile("|".join(rf"\b(?:{a})\b" for a in alternatives))


# Les motifs s'écrivent SANS accents et en minuscules : la demande est
# normalisée avant d'être lue (``_normalise``). FR et EN côte à côte — une règle
# monolingue est aveugle à l'autre langue de l'interface.
_EXPLICIT_DEPTH = _pattern(
    r"approfondi\w*",
    r"en profondeur",
    r"en detail",
    r"creus(?:e|er|ez|ons)",
    r"prends le temps",
    r"reflechis bien",
    r"in[- ]?depth",
    r"deep[- ]?dive",
    r"dig deeper",
    r"thorough\w*",
    r"think (?:it through|hard|carefully)",
    r"take your time",
)
_ANALYSIS_VERB = _pattern(
    r"analys\w*",
    r"analyz\w*",
    r"diagnostic\w*",
    r"audit\w*",
    r"swot",
    r"cartograph\w*",
    r"map out",
    r"fais le point",
    r"etat des lieux",
    r"break ?down",
)
_ACCOUNT_NOUN = _pattern(
    r"comptes?",
    r"entreprises?",
    r"societes?",
    r"groupes?",
    r"clients?",
    r"prospects?",
    r"organigramme",
    r"accounts?",
    r"compan(?:y|ies)",
    r"org ?chart",
    r"organi[sz]ations?",
)
_MULTI_STEP_PLAN = _pattern(
    r"plan d'(?:action|attaque)",
    r"plan de (?:compte|conquete|prospection|bataille|relance|attaque|campagne)",
    r"plan (?:sur|a|en) \d+ (?:jours|semaines|mois)",
    r"\d+[- ]day plan",
    r"(?:action|account|attack|outreach) plan",
    r"plan of attack",
    r"strateg\w*",
    r"feuille de route",
    r"roadmap",
    r"etape par etape",
    r"step[- ]by[- ]step",
    r"sequence de (?:relance|prospection)",
    r"outreach sequence",
    r"go[- ]to[- ]market",
)
#: Une famille = un outil (ou un groupe d'outils) coûteux du catalogue de
#: ``chat_tools``. Une seule famille nommée est une demande outillée
#: ordinaire ; deux, c'est un enchaînement à orchestrer.
_HEAVY_TOOL_FAMILIES: dict[str, re.Pattern[str]] = {
    "compare": _pattern(r"compar\w*"),
    "briefing": _pattern(r"briefing"),
    "matching": _pattern(r"match\w*"),
    "pipeline": _pattern(r"pipe(?:line)?", r"chiffre d'affaires", r"revenue"),
    "campaign": _pattern(r"campagnes?", r"campaigns?"),
    "territory": _pattern(r"territoires?", r"territor(?:y|ies)"),
    "market": _pattern(r"(?:etude|memoire) de marche", r"market (?:study|research|memory)"),
    "rfp": _pattern(r"appels? d'offres?", r"rfps?"),
    "talents": _pattern(r"consultants?", r"talents?"),
    "risks": _pattern(r"risques?", r"risks?"),
    "network": _pattern(r"reseau dormant", r"changements? de poste", r"job changes?", r"alumni"),
    "account_search": _pattern(r"ciblage", r"comptes similaires", r"similar (?:accounts|companies)", r"lookalike\w*"),
}
_LIST_ITEM = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+", re.MULTILINE)

#: #2450.7 (épopée #2882) — le plancher de qualité minimal : une demande
#: d'ACTUALITÉ (« quoi de neuf », « dernières nouvelles », « current events »)
#: n'a pas de garantie de fraîcheur sous le palier rapide. Ce n'est PAS le
#: plancher à quatorze paramètres de #2450.2 (pas de source/date par
#: affirmation, pas de re-vérification de contradiction) — seul le palier
#: relève, comme les autres règles ci-dessus. Ne joue QUE dans la branche
#: heuristique : un mode explicite (`requested_mode`) a déjà répondu plus haut
#: et n'est jamais silencieusement contredit (#2450.9).
_QUALITY_FLOOR_ACTUALITY = _pattern(
    r"actualites?",
    r"dernieres? nouvelles",
    r"quoi de neuf",
    r"derniers? evenements?",
    r"ce qui se passe (?:en ce moment|actuellement|dans le monde|sur le marche)",
    r"current events?",
    r"latest news",
    r"breaking news",
    r"what'?s new",
    r"recent news",
)


def _normalise(text: str) -> str:
    """Minuscules, sans accents, apostrophes droites."""
    decomposed = unicodedata.normalize("NFKD", text.replace("’", "'"))
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def choose_chat_tier(request: str, context: ChatTierContext) -> ChatTierDecision:
    """LE palier d'une demande — la dérivation unique (#2248).

    Palier fort (``deep``) dès qu'une règle répond, dans cet ordre :

    1. ``explicit_depth`` — la personne le DEMANDE (« approfondis », « creuse »,
       « in depth », « dig deeper ») ;
    2. ``account_analysis`` — une analyse de compte : un verbe d'analyse ET
       soit un compte nommé comme tel, soit un compte actif dans le fil ;
    3. ``multi_step_plan`` — un plan en plusieurs étapes (plan d'action,
       stratégie, feuille de route, pas à pas) ;
    4. ``heavy_tools`` — au moins deux familles d'outils lourds dans la même
       demande (comparer, matcher, pipeline, campagne…) ;
    5. ``long_or_complex`` — une demande longue, ou à plusieurs questions, ou
       en liste de plusieurs volets ;
    6. ``quality_floor_actuality`` — une demande d'actualité (#2450.7), quand
       aucune des règles précédentes n'a déjà répondu.

    Tout le reste : palier rapide, raison ``default``. Aucun appel réseau.

    #2450.1 (épopée #2882) — un ``requested_mode`` EXPLICITE (``"rapide"``,
    ``"verifie"``, ``"approfondi"``) gagne AVANT toute règle ci-dessus, même
    sur une demande vide : c'est un geste posé par la personne, pas une
    lecture du texte. ``None``/``"auto"`` ne change rien à ce qui suit.

    #2440.56/.60/.61 (épopée #2975) — LA TABLE DE DÉCISION DU RISQUE, en tout
    dernier : ``context.risk == "elevated"`` ne force ``deep`` QUE si aucune
    règle ci-dessus (mode explicite compris) n'a déjà répondu — un mode
    explicite ou une heuristique de complexité restent prioritaires sur un
    risque mesuré ailleurs. ``context.risk == "unknown"`` (le défaut) laisse
    ce dernier ``return`` inchangé : chemin byte-identique à avant ce champ.
    """
    if context.requested_mode and context.requested_mode != "auto":
        forced = MODE_TIER[context.requested_mode]
        return ChatTierDecision(forced, f"mode_{context.requested_mode}")
    decision = _choose_heuristic_tier(request, context)
    if decision.tier == "fast" and context.risk == "elevated":
        return ChatTierDecision("deep", "elevated_risk")
    return decision


def _choose_heuristic_tier(request: str, context: ChatTierContext) -> ChatTierDecision:
    text = _normalise(request or "")
    if not text.strip():
        return ChatTierDecision("fast", "default")
    if _EXPLICIT_DEPTH.search(text):
        return ChatTierDecision("deep", "explicit_depth")
    if _ANALYSIS_VERB.search(text) and (context.account_in_scope or _ACCOUNT_NOUN.search(text)):
        return ChatTierDecision("deep", "account_analysis")
    if _MULTI_STEP_PLAN.search(text):
        return ChatTierDecision("deep", "multi_step_plan")
    families = sum(1 for pattern in _HEAVY_TOOL_FAMILIES.values() if pattern.search(text))
    if families >= HEAVY_TOOL_FAMILIES_MIN:
        return ChatTierDecision("deep", "heavy_tools")
    if (
        len(request) >= LONG_REQUEST_CHARS
        or request.count("?") >= MANY_QUESTIONS
        or len(_LIST_ITEM.findall(request)) >= MANY_ITEMS
    ):
        return ChatTierDecision("deep", "long_or_complex")
    if _QUALITY_FLOOR_ACTUALITY.search(text):
        return ChatTierDecision("deep", "quality_floor_actuality")
    return ChatTierDecision("fast", "default")


#: #2450.8/.9/.12 (épopée #2882) — la phrase du plancher de qualité, dans les
#: deux langues d'interface. ⚠️ AUCUN coût en crédits ici : l'issue en donne un
#: à TITRE D'EXEMPLE (« coûterait environ X crédits »), mais aucune table ne
#: convertit un palier en coût AVANT le tour — l'inventer serait une donnée
#: fictive (doctrine, `CLAUDE.md` « Code rules » : « JAMAIS de donnée fictive.
#: Échec API → erreur claire, pas de fallback inventé »). Le geste utile — ne
#: jamais forcer silencieusement, dire la limite, nommer l'option — tient sans
#: ce chiffre.
_MODE_INSUFFICIENCY_NOTICE: dict[str, str] = {
    "fr": (
        "Je réponds en Rapide avec ce que je connais déjà, mais je ne peux pas "
        "garantir que ce soit à jour. Repasse en Vérifié si tu as besoin d'un état actuel."
    ),
    "en": (
        "I'm answering in Quick mode with what I already know, but I can't guarantee "
        "it's current. Switch to Verified if you need an up-to-date answer."
    ),
}


def mode_insufficiency_notice(request: str, context: ChatTierContext, *, interface_language: str = "fr") -> str | None:
    """#2450.8/.9/.12 (épopée #2882) — le geste que #2450.1 s'était engagé à ne
    PAS faire seul : « un mode explicite gagne AVANT toute règle, même sur une
    demande vide ». Rester silencieux dessus laissait le NO-GO de l'issue
    ouvert (« le choix utilisateur est ignoré OU une dépense est engagée sous
    prétexte que le mode est insuffisant ») : ``choose_chat_tier`` respecte
    déjà la première moitié (jamais de dépense forcée), cette fonction rend la
    seconde possible (le dire, sans jamais agir à la place de la personne).

    Ne joue QUE quand ``requested_mode == "rapide"`` ET que la MÊME règle que
    #2450.7 (``_QUALITY_FLOOR_ACTUALITY``) aurait répondu ``deep`` si le mode
    n'avait pas déjà tranché — la seule policy de plancher qui existe
    aujourd'hui, réutilisée telle quelle plutôt qu'une seconde heuristique
    inventée pour l'occasion. ``None`` : aucun conflit détecté, chemin
    BYTE-IDENTIQUE à avant cette fonction (elle n'est appelée nulle part tant
    que rien ne l'invoque).
    """
    policy = CHAT_MODE_POLICIES.get(context.requested_mode or "")
    if policy is None or not policy.proposes_upgrade:
        return None
    text = _normalise(request or "")
    if not text.strip() or not _QUALITY_FLOOR_ACTUALITY.search(text):
        return None
    key = "en" if interface_language == "en" else "fr"
    return _MODE_INSUFFICIENCY_NOTICE[key]


@dataclass(frozen=True)
class ChatModePolicy:
    """#2450.2 (épopée #2882) — la plus petite tranche RÉELLE de la policy par
    mode, PAS les quatorze paramètres que l'issue décrit (budget, outils au
    pluriel, arrêt, evidence graph…) : chacun d'eux resterait à deviner sans
    décision produit sur sa forme, exactement ce que quatre lots précédents
    (nuit 14, r7, g18, g10, n2 — commentaires du 26 au 27/09 sur #2882) ont
    refusé de faire. Ce que CE lot ajoute : nommer ENSEMBLE, sous un même
    objet, les deux comportements qui sont déjà réels et déjà testés ailleurs
    dans ce module (``MODE_TIER``, et l'exclusion d'outil ci-dessous) plutôt
    que de les laisser dispersés — pour qu'un futur champ (budget, sources
    autorisées…) s'ajoute ICI le jour où sa forme sera tranchée, au lieu
    d'ouvrir un second objet.

    ``auto`` n'a délibérément PAS d'entrée dans ``CHAT_MODE_POLICIES`` : rien
    n'est forcé, l'heuristique de ``choose_chat_tier`` décide seule — la même
    garantie que ``MODE_TIER`` porte déjà.
    """

    tier: Tier
    excludes_web_search: bool
    #: #2450.9 — le mode PROPOSE le passage au palier au-dessus quand sa
    #: réponse ne peut pas garantir l'actualité, au lieu de dépenser en silence
    #: (:func:`mode_insufficiency_notice` lit CE champ, plus le nom du mode).
    proposes_upgrade: bool


#: #2450.4 / #2448.5 (épopée #2882) — RAPIDE exclut la recherche publique de
#: son catalogue d'outils : sa promesse (« répondre à partir de ce que
#: BellumAI sait déjà ») exclut par construction d'aller chercher sur le web,
#: que l'appel soit payant ou non (`web_search` ne coûte rien, mais reste une
#: recherche PUBLIQUE — voir `web_search_tool.py`). VÉRIFIÉ et APPROFONDI ne
#: l'excluent pas : leur promesse est justement d'aller vérifier au-delà de ce
#: qui est déjà su.
CHAT_MODE_POLICIES: dict[str, ChatModePolicy] = {
    "rapide": ChatModePolicy(tier="fast", excludes_web_search=True, proposes_upgrade=True),
    "verifie": ChatModePolicy(tier="deep", excludes_web_search=False, proposes_upgrade=False),
    "approfondi": ChatModePolicy(tier="deep", excludes_web_search=False, proposes_upgrade=False),
}


def mode_excluded_tool_names(requested_mode: RequestedMode | None) -> frozenset[str]:
    """#2450.4 / #2448.5 (épopée #2882) — les outils qu'un mode EXPLICITE
    retire du catalogue avant l'appel modèle. ``frozenset()`` pour
    ``None``/``"auto"`` (rien n'est retiré, chemin byte-identique à avant
    cette fonction) et pour tout mode dont la policy ne l'exclut pas.
    """
    policy = CHAT_MODE_POLICIES.get(requested_mode or "")
    if policy is None or not policy.excludes_web_search:
        return frozenset()
    return frozenset({"web_search"})


#: #2448.4 (épopée #2882) — « AUTO n'est pas un mode opaque » : la phrase que
#: le système doit pouvoir dire APRÈS le tour, une par raison de
#: ``TIER_REASONS``, dans les deux langues d'interface. Jamais le nom d'un
#: fournisseur ni d'un modèle (doctrine, inchangée par ce lot) — seulement CE
#: QUI, dans la demande, a fait pencher le palier.
_TIER_REASON_EXPLANATIONS: dict[str, dict[str, str]] = {
    "explicit_depth": {
        "fr": "Tu as demandé d'approfondir, donc j'ai pris le temps qu'il fallait.",
        "en": "You asked me to dig deeper, so I took the time this needed.",
    },
    "account_analysis": {
        "fr": "Il s'agit d'analyser un compte, donc j'ai vérifié plutôt que de résumer de mémoire.",
        "en": "This is an account analysis, so I checked rather than summarizing from memory.",
    },
    "multi_step_plan": {
        "fr": "Tu demandes un plan à plusieurs étapes, donc j'ai pris le temps de le construire.",
        "en": "You're asking for a multi-step plan, so I took the time to build it properly.",
    },
    "heavy_tools": {
        "fr": "Ta demande enchaîne plusieurs outils lourds, donc j'ai pris le temps de les orchestrer.",
        "en": "Your request chains several heavy tools, so I took the time to orchestrate them.",
    },
    "long_or_complex": {
        "fr": "Ta demande a plusieurs volets, donc j'ai pris le temps d'y répondre en entier.",
        "en": "Your request has several parts, so I took the time to answer them all.",
    },
    "default": {
        "fr": "C'était une demande courante, donc j'ai répondu directement avec ce que je savais déjà.",
        "en": "This was a routine request, so I answered directly with what I already knew.",
    },
    "mode_rapide": {
        "fr": "Tu as choisi Rapide, donc j'ai répondu avec ce que je savais déjà, sans recherche publique.",
        "en": "You chose Quick, so I answered with what I already knew, without a public search.",
    },
    "mode_verifie": {
        "fr": "Tu as choisi Vérifié, donc j'ai cherché à confirmer plutôt qu'à supposer.",
        "en": "You chose Verified, so I looked to confirm rather than assume.",
    },
    "mode_approfondi": {
        "fr": "Tu as choisi Approfondi, donc j'ai croisé plusieurs sources avant de conclure.",
        "en": "You chose Deep, so I cross-checked several sources before concluding.",
    },
    "quality_floor_actuality": {
        "fr": "Tu demandes une actualité, donc j'ai vérifié plutôt que de répondre sur des données anciennes.",
        "en": "You're asking about current events, so I checked rather than rely on old data.",
    },
    # #2440.56 (épopée #2975) — la raison ajoutée par le lot V19 ; sans elle,
    # un tour forcé en profondeur par le risque n'aurait aucune explication.
    "elevated_risk": {
        "fr": "Ta demande touche à quelque chose de sensible, donc j'ai pris le temps de vérifier avant de répondre.",
        "en": "Your request touches on something sensitive, so I took the time to check before answering.",
    },
}


def explain_tier_decision(reason: str, *, interface_language: str = "fr") -> str:
    """#2448.4 (épopée #2882) — la phrase d'explication de LA raison qui a
    choisi le palier de ce tour, dans la langue d'interface. Chaîne vide pour
    une raison inconnue (un appelant futur qui en ajouterait une sans mettre à
    jour cette table ne casse rien — il perd juste l'explication, jamais le
    tour).
    """
    key = "en" if interface_language == "en" else "fr"
    entry = _TIER_REASON_EXPLANATIONS.get(reason)
    return entry[key] if entry else ""


def routing_active() -> bool:
    """Le routage par palier tourne-t-il ?

    Seulement si au moins un palier a une destination POSÉE (variable ou entrée
    ``LLM_GATEWAY_ROUTING``) et que le coupe-circuit n'est pas posé. On teste la
    PRÉSENCE, comme ``llm_gateway._has_override`` : épingler un palier sur le
    défaut est une décision, pas une absence.
    """
    if disabled(CHAT_MODEL_ROUTING_KILL_SWITCH):
        return False
    return any(llm_gateway._has_override(task) for task in TIER_TASKS.values())


def resolve_chat_route(prompt_name: str, request: str | None, context: ChatTierContext | None) -> ChatRoute:
    """La tâche à router et le nom de coût d'un tour de chat.

    Appelée là où les deux chemins du chat résolvent leur destination (la
    boucle d'outils dans ``chat_orchestrator._make_turns``, le repli sans
    outils dans ``routers/chat.py``) : la conversation et la boucle d'outils
    suivent donc le MÊME palier, décidé une fois par tour.

    ``request=None`` (un appelant qui ne transmet pas la demande), routage non
    réglé ou coupe-circuit posé ⇒ ``(prompt_name, prompt_name, None)`` : la
    route d'avant, sans classifier ni journaliser — sauf le mode OMBRE
    (``shadow_active``), qui classe et journalise sans rien changer d'autre.
    """
    legacy = ChatRoute(prompt_name, prompt_name, None)
    if request is None:
        return legacy
    # #2443.9 (#2899) — LA BASCULE de la cohorte canary : un espace nommé par
    # `CHAT_CANARY_WORKSPACE_ALLOWLIST` reçoit le modèle CANDIDAT
    # (`LLM_ROUTE_CHAT_CANARY`) AVANT généralisation ; le coût du tour porte
    # le suffixe `_canary`, donc la comparaison à la baseline se lit au ledger.
    # Sans modèle candidat posé, hors cohorte ou coupe-circuit : route d'avant.
    if (
        context is not None
        and context.canary
        and not disabled(CHAT_MODEL_ROUTING_KILL_SWITCH)
        and llm_gateway._has_override(CANARY_TASK)
    ):
        decision = choose_chat_tier(request, context)
        _log_decision(decision, shadow=False)
        return ChatRoute(CANARY_TASK, f"{prompt_name}_canary", decision)
    if not routing_active():
        # #2248 — mode OMBRE (décision de Louis, 17/09/2026) : le palier se
        # MESURE avant de se décider. La route rendue reste celle d'avant —
        # destination et nom de coût inchangés ; seule une ligne de log s'ajoute.
        if shadow_active():
            _log_decision(choose_chat_tier(request, context or ChatTierContext()), shadow=True)
        return legacy
    decision = choose_chat_tier(request, context or ChatTierContext())
    _log_decision(decision, shadow=False)
    return ChatRoute(TIER_TASKS[decision.tier], f"{prompt_name}_{decision.tier}", decision)


def shadow_active() -> bool:
    """Le mode OMBRE tourne-t-il ? (``CHAT_MODEL_ROUTING_SHADOW``)

    Allumé par ``1`` / ``true`` (casse ignorée) ; absent ou toute autre valeur
    = éteint, chemin byte-identique. Il ne vaut que tant qu'AUCUN palier n'est
    réglé (``routing_active`` faux) : un palier réglé est la décision de
    router, l'ombre n'a plus d'objet. Le coupe-circuit l'éteint aussi — il
    coupe le classifieur, mesure comprise.
    """
    if disabled(CHAT_MODEL_ROUTING_KILL_SWITCH):
        return False
    return os.environ.get(SHADOW_ENV_VAR, "").strip().lower() in _SHADOW_ON


def _log_decision(decision: ChatTierDecision, *, shadow: bool) -> None:
    """#2248 — le palier et SA règle, jamais le contenu de la demande."""
    cid = get_correlation_id()
    logger.info(
        "Laura routage de modèle tier=%s reason=%s%s%s",
        decision.tier,
        decision.reason,
        " shadow=true" if shadow else "",
        f" cid={cid}" if cid else "",
    )


__all__ = [
    "CHAT_MODE_POLICIES",
    "ChatModePolicy",
    "ChatRoute",
    "ChatTierContext",
    "ChatTierDecision",
    "SHADOW_ENV_VAR",
    "TIER_REASONS",
    "TIER_TASKS",
    "Tier",
    "choose_chat_tier",
    "explain_tier_decision",
    "mode_excluded_tool_names",
    "mode_insufficiency_notice",
    "resolve_chat_route",
    "routing_active",
    "shadow_active",
]
