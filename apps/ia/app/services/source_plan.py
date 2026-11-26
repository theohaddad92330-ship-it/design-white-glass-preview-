"""#3176 (épopée #3216) — LE PLANIFICATEUR DE SOURCES de Laura (LAU-FINAL-182).

Ce qui n'existait pas
---------------------
Mesuré le 28/09/2026 sur ``origin/main`` : ``git grep`` de ``INTERNAL_ONLY``,
``SourcePlan``, ``source_plan_requested`` ne rend aucun résultat. Le seul
mécanisme voisin, ``context_mode.py`` (#2453), code une hiérarchie de HUIT
couches (profil/rôle/BU/mémoire/portefeuille/CRM/historique/base documentaire)
qui exclut des couches ENTIÈRES pour tout le tour ; ce module-ci répond à une
question différente et complémentaire — PARMI les couches non exclues,
lesquelles ce TOUR PRÉCIS doit-il appeler, dans quel ordre, et avec quel
budget — sur la demande EXPLICITE de la personne (« dans ta mémoire », « ce
qui est public aujourd'hui »…), pas sur un réglage d'écran permanent.

Ce que ce module fait, et ce qu'il ne fait pas
------------------------------------------------
Comme ``research_mode.py`` (#2450) et ``intent_router.py`` (#2321) avant lui :
un vocabulaire de MARQUEURS déclarés (FR et EN), jamais un appel modèle. Un
message sans marqueur ne produit aucun ``SourcePlan`` — silence, jamais un
mode deviné (même garantie que ``research_mode_block`` : chemin byte-identique
sans marqueur).

Ce qui reste hors de ce module, nommément :

* L'objet complet à QUATORZE champs que l'issue #3176 esquissait (budget,
  arrêt, evidence graph…) est refusé pour la même raison que #2450 l'a refusé
  dans ``research_mode.py`` — quatre lots l'ont déjà écarté, voir son
  docstring. Les NEUF champs du ticket (#3176.7) sont ici, RIEN de plus.
* La détection contextuelle de « aujourd'hui »/« en ce moment » (#3176.1,
  portée totale) reste volontairement ÉTROITE : elle ne déclenche
  ``current_public`` que si le message nomme aussi un signal de statut de
  personne/compte (poste, recrutement, actualité…) — jamais le mot seul, pour
  ne pas attraper « peux-tu m'aider AUJOURD'HUI avec ce compte ? » (NO-GO cité
  dans #3176.4).
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field

# ── #3176.1 — les dix couches canoniques du ticket LAU-FINAL-182, DANS LEUR
# ORDRE de hiérarchie de vérité par défaut. La position de DataForge et des
# sources publiques varie selon le champ (le ticket le dit explicitement) :
# c'est pourquoi elle n'est CODÉE qu'ici, comme une SÉQUENCE PAR DÉFAUT que
# chaque `SourcePlan` peut réordonner (`sequence`) — jamais une position fixe
# gravée dans le nom de la couche elle-même. Traçable : un test lit cette
# liste et la compare à l'ordre du ticket, terme à terme.
CANONICAL_SOURCE_LAYERS: tuple[str, ...] = (
    "explicit_request",  # 1. demande explicite et corrections du tour
    "thread_memory",  # 2. mémoire de la conversation
    "profile",  # 3. profil personnel / ESN / BU
    "workspace",  # 4. données workspace
    "connected_systems",  # 5. CRM, mails, agenda, documents, rendez-vous
    "account_dossier",  # 6. dossier compte déjà produit
    "dataforge",  # 7. DataForge
    "market_memory",  # 8. Market Memory
    "public_sources",  # 9. sources publiques actuelles
    "methodological_inference",  # 10. inférence méthodologique
)

# ── #3176.5 / #3176.6 / (INTERNAL_ONLY, CURRENT_PUBLIC du ticket) — les
# quatre modes de recherche. Miroir volontaire de `chat_model_routing.Tier` /
# `RequestedMode` dans son ESPRIT (un vocabulaire fermé, indexé) mais un axe
# DISTINCT : celui-ci décide QUELLES COUCHES appeler, pas quel palier de
# modèle ni quelle policy de coût.
SEARCH_MODES: tuple[str, ...] = ("internal_only", "current_public", "combined", "workspace_first")


@dataclass(frozen=True)
class SourcePlan:
    """#3176.7 — les NEUF champs du ticket, ni plus ni moins. Produit à chaque
    tour où un mode est détecté, consommé par l'appelant (`chat.py`) pour
    borner le catalogue d'outils et enrichir le prompt — jamais par
    l'orchestrateur pour re-router (même séparation que `laura_router`)."""

    requested_scope: str
    mandatory_layers: tuple[str, ...]
    optional_layers: tuple[str, ...] = ()
    forbidden_layers: tuple[str, ...] = ()
    sequence: tuple[str, ...] = ()
    freshness_required: bool = False
    max_cost: str = "low"
    fallback: str = "explicit_gap"
    stop_conditions: tuple[str, ...] = ()


# ── #3176.3 (INTERNAL_ONLY) — le NO-GO du ticket : « Laura affirme ne rien
# connaître parce que l'information n'était pas déjà injectée dans son
# contexte immédiat ». Le plan force donc l'appel des couches internes AVANT
# de conclure à une absence, et INTERDIT toute recherche publique pour ce tour.
_INTERNAL_ONLY_PLAN = SourcePlan(
    requested_scope="internal_only",
    mandatory_layers=(
        "thread_memory",
        "profile",
        "workspace",
        "connected_systems",
        "account_dossier",
        "dataforge",
        "market_memory",
    ),
    forbidden_layers=("public_sources",),
    sequence=(
        "thread_memory",
        "profile",
        "workspace",
        "connected_systems",
        "account_dossier",
        "dataforge",
        "market_memory",
    ),
    freshness_required=False,
    max_cost="low",
    fallback="explicit_gap",
    stop_conditions=("public_search_requested",),
)

# ── #3176.4 (CURRENT_PUBLIC, déjà partiellement porté par le ticket) — la
# fraîcheur prime, mais le dossier déjà produit et Market Memory restent lus
# EN PREMIER (moins cher, souvent déjà daté) avant d'aller chercher en public.
_CURRENT_PUBLIC_PLAN = SourcePlan(
    requested_scope="current_public",
    mandatory_layers=("public_sources",),
    optional_layers=("account_dossier", "dataforge", "market_memory"),
    sequence=("account_dossier", "dataforge", "market_memory", "public_sources"),
    freshness_required=True,
    max_cost="medium",
    fallback="state_as_of_last_verified",
)

# ── #3176.5 (COMBINED) — une décision/stratégie a besoin de TOUT : compat
# historique (dossier + mémoire) + situation actuelle (public) + contexte
# privé (profil, workspace, CRM) + accessibilité (connected_systems).
_COMBINED_PLAN = SourcePlan(
    requested_scope="combined",
    mandatory_layers=(
        "thread_memory",
        "profile",
        "workspace",
        "connected_systems",
        "account_dossier",
        "dataforge",
        "market_memory",
        "public_sources",
    ),
    sequence=(
        "thread_memory",
        "profile",
        "workspace",
        "connected_systems",
        "account_dossier",
        "dataforge",
        "market_memory",
        "public_sources",
    ),
    freshness_required=True,
    max_cost="high",
    fallback="partial_with_named_gaps",
)

# ── #3176.6 (WORKSPACE_FIRST) — l'activité/les relations du commercial
# priment ; le reste (dossier, DataForge, Market Memory, public) reste
# OPTIONNEL, jamais interdit — la réponse peut encore s'enrichir au-delà.
_WORKSPACE_FIRST_PLAN = SourcePlan(
    requested_scope="workspace_first",
    mandatory_layers=("workspace", "connected_systems"),
    optional_layers=("thread_memory", "account_dossier", "dataforge", "market_memory", "public_sources"),
    sequence=(
        "workspace",
        "connected_systems",
        "thread_memory",
        "account_dossier",
        "dataforge",
        "market_memory",
        "public_sources",
    ),
    freshness_required=False,
    max_cost="medium",
    fallback="state_workspace_unavailable",
)

# ── #3176.2 — CONCILIER, PAS DUPLIQUER (GA-26 : un réglage vit à un seul
# endroit). `context_mode.CONTEXT_LAYERS` (#2453) code une hiérarchie VOISINE
# mais distincte : HUIT couches d'un réglage PERMANENT d'écran (Mon
# activité / Mission ponctuelle / Neutre), qui EXCLUENT une couche pour tout
# le tour. `CANONICAL_SOURCE_LAYERS` ci-dessus code les DIX couches d'un
# PLAN PAR TOUR, sur une demande explicite. Cette table déclare comment les
# huit couches de #2453 se rangent dans les dix du ticket LAU-FINAL-182 —
# traçable et testée (`test_source_plan.py::test_toute_couche_de_contexte_mode_se_concilie`)
# plutôt que réécrite en silence à côté.
CONTEXT_LAYER_TO_SOURCE_LAYER: dict[str, str] = {
    "profile": "profile",
    "role": "profile",  # #2453 sépare rôle et profil ; le ticket les tient ensemble (« profil / ESN / BU »).
    "business_units": "profile",
    "durable_memory": "thread_memory",  # mémoire durable ⊂ mémoire de la conversation.
    "portfolio": "account_dossier",  # le portefeuille EST le dossier compte déjà produit.
    "crm": "connected_systems",  # CRM, mails, agenda, documents, rendez-vous — une seule couche du ticket.
    "private_mailboxes": "connected_systems",  # boîtes privées branchées : mêmes systèmes connectés que le CRM.
    "commercial_history": "account_dossier",
    "knowledge_base": "workspace",  # documents RAG de l'espace, scopés au workspace.
}

SOURCE_PLANS: dict[str, SourcePlan] = {
    "internal_only": _INTERNAL_ONLY_PLAN,
    "current_public": _CURRENT_PUBLIC_PLAN,
    "combined": _COMBINED_PLAN,
    "workspace_first": _WORKSPACE_FIRST_PLAN,
}


def build_source_plan(mode: str | None) -> SourcePlan | None:
    """Le plan d'un mode déclaré. ``None`` pour tout mode absent/inconnu —
    aucun plan n'est deviné (même garantie que ``research_mode_block``)."""
    return SOURCE_PLANS.get(mode or "")


# ── Détection des marqueurs — même méthode que `research_mode.py` : un
# vocabulaire DÉCLARÉ, FR et EN, jamais un appel modèle. `_normalize` retire
# accents et casse pour un comparateur robuste aux deux langues.


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text or "")
    ascii_only = decomposed.encode("ascii", "ignore").decode("ascii")
    return ascii_only.lower()


# #3176.3 — les CINQ marqueurs NOMMÉS du ticket, mot pour mot (FR), plus leur
# équivalent EN pour l'interface bilingue (le ticket ne les donne qu'en FR,
# mais Laura sert aussi des utilisateurs en anglais — même bilinguisme que
# tout le reste du prompt).
_INTERNAL_ONLY_MARKERS: tuple[str, ...] = (
    "dans ta memoire",
    "ce que bellum connait deja",
    "sans aller sur le web",
    "dans nos donnees",
    "dans mon crm",
    "in your memory",
    "what bellum already knows",
    "without going on the web",
    "in our data",
    "in my crm",
)

# #3176.4 — SEULEMENT les marqueurs SPÉCIFIQUES du ticket, « aujourd'hui » et
# « en ce moment » DÉLIBÉRÉMENT exclus d'ici (#3176.1, trop génériques) : voir
# `_has_contextual_current_marker` plus bas pour leur détection contextuelle.
_CURRENT_PUBLIC_MARKERS: tuple[str, ...] = (
    "poste actuel",
    "derniers recrutements",
    "dernieres levees",
    "current position",
    "latest hires",
    "latest funding rounds",
)

# #3176.5 — décision ou stratégie nécessitant compat historique + situation
# actuelle + contexte privé + accessibilité À LA FOIS.
_COMBINED_MARKERS: tuple[str, ...] = (
    "quelle strategie",
    "quelle decision",
    "dois-je",
    "faut-il",
    "quelle approche",
    "what strategy",
    "which decision",
    "should i",
    "what approach",
)

# #3176.6 — la réponse dépend PRIORITAIREMENT de l'activité ou des relations
# du commercial.
_WORKSPACE_FIRST_MARKERS: tuple[str, ...] = (
    "dans mes contacts",
    "en tenant compte de mes contacts",
    "parmi mes relations",
    "dans mon reseau",
    "avec qui j'ai deja echange",
    "mon activite recente",
    "mes rendez-vous",
    "in my contacts",
    "taking my contacts into account",
    "among my relations",
    "in my network",
    "who i have already talked to",
    "my recent activity",
    "my meetings",
)

# #3176.1 (portée totale) — la détection CONTEXTUELLE de « aujourd'hui »/« en
# ce moment », jamais le marqueur littéral seul : le mot déclenche
# CURRENT_PUBLIC seulement s'il est accompagné d'un signal de statut de
# personne/compte dans le MÊME message.
_LITERAL_CURRENT_WORDS: tuple[str, ...] = ("aujourd'hui", "aujourdhui", "en ce moment", "today", "right now")
_STATUS_SIGNAL_WORDS: tuple[str, ...] = (
    "poste",
    "role",
    "recrute",
    "embauche",
    "annonce",
    "situation",
    "statut",
    "actualite",
    "position",
    "hiring",
    "announcement",
    "status",
    "news",
)


# #4051.6 — la demande s'appuie sur la base de contacts DU commercial (importée ou saisie).
_OWN_CONTACTS_MARKERS: tuple[str, ...] = ("mes contacts", "my contacts")


def mentions_own_contacts(text: str | None) -> bool:
    """La demande cite « mes contacts » : Laura doit les utiliser, ou dire qu'ils manquent."""
    normalized = _normalize(text or "")
    return any(marker in normalized for marker in _OWN_CONTACTS_MARKERS)


def _has_contextual_current_marker(normalized: str) -> bool:
    has_literal = any(word in normalized for word in _LITERAL_CURRENT_WORDS)
    if not has_literal:
        return False
    return any(word in normalized for word in _STATUS_SIGNAL_WORDS)


@dataclass(frozen=True)
class ModeMatch:
    """Le mode détecté et le marqueur qui l'a déclenché — `matched_marker`
    (#3176.10) est le champ d'observabilité qui prouve QUEL texte a décidé,
    jamais une décision muette."""

    mode: str
    matched_marker: str


#: Précédence de détection quand plusieurs familles matchent le même message :
#: la restriction explicite (INTERNAL_ONLY) gagne d'abord — elle interdit un
#: geste (la recherche publique), l'ignorer serait la seule des quatre erreurs
#: qui viole une consigne explicite plutôt que d'en manquer une occasion.
_DETECTION_ORDER: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("internal_only", _INTERNAL_ONLY_MARKERS),
    ("combined", _COMBINED_MARKERS),
    ("workspace_first", _WORKSPACE_FIRST_MARKERS),
    ("current_public", _CURRENT_PUBLIC_MARKERS),
)


def detect_search_mode(text: str | None) -> ModeMatch | None:
    """#3176.3-.6 — le mode déclaré par CE message, ou ``None`` sans marqueur.

    Aucun appel modèle, aucune E/S — un comparateur de sous-chaînes sur texte
    normalisé, comme ``intent_router.py``/``research_mode.py``."""
    normalized = _normalize(text or "")
    if not normalized:
        return None
    for mode, markers in _DETECTION_ORDER:
        for marker in markers:
            if _normalize(marker) in normalized:
                return ModeMatch(mode=mode, matched_marker=marker)
    if _has_contextual_current_marker(normalized):
        matched = next((w for w in _LITERAL_CURRENT_WORDS if w in normalized), "")
        return ModeMatch(mode="current_public", matched_marker=matched)
    return None


# ── Le bloc de prompt — même contrat que `research_mode.py::research_mode_block` :
# VOLATIL, ajouté en QUEUE du prompt système (`append_before_language_reminder`),
# jamais dans le segment mis en cache (GA-293).

_SOURCE_PLAN_BLOCKS: dict[str, dict[str, str]] = {
    "internal_only": {
        "fr": (
            "\n\nSOURCE DEMANDÉE : UNIQUEMENT INTERNE. La personne a dit vouloir ce que Bellum sait "
            "déjà (« dans ta mémoire », « dans nos données », « dans mon CRM »…) — n'appelle AUCUNE "
            "recherche publique pour ce tour, même si l'information semble incomplète. Vérifie "
            "d'abord la mémoire du fil, le profil, le workspace, les systèmes connectés, le dossier "
            "compte, DataForge et observations du marché ; dis EXPLICITEMENT ce qu'une couche indisponible "
            "ne te rend pas plutôt que de conclure que Bellum ne sait rien."
        ),
        "en": (
            "\n\nREQUESTED SOURCE: INTERNAL ONLY. The person asked for what Bellum already knows "
            "(\"in your memory\", \"in our data\", \"in my CRM\"…) — call NO public search this "
            "turn, even if the information looks incomplete. Check thread memory, profile, "
            "workspace, connected systems, the account dossier, DataForge and market observations first; "
            "state EXPLICITLY when a layer is unavailable rather than concluding Bellum knows "
            "nothing."
        ),
    },
    "current_public": {
        "fr": (
            "\n\nSOURCE DEMANDÉE : ACTUALITÉ PUBLIQUE. La personne veut une information À JOUR "
            "(poste actuel, derniers recrutements, dernières levées…) — vérifie d'abord ce qui est "
            "déjà su (dossier, DataForge, observations du marché), puis confirme ou complète avec une "
            "recherche publique récente. Date ce que tu rends quand l'outil te la donne."
        ),
        "en": (
            "\n\nREQUESTED SOURCE: CURRENT PUBLIC INFORMATION. The person wants up-to-date "
            "information (current role, latest hires, latest funding…) — check what is already "
            "known first (dossier, DataForge, market observations), then confirm or complete with a "
            "recent public search. Date what you report when the tool gives you a date."
        ),
    },
    "combined": {
        "fr": (
            "\n\nSOURCE DEMANDÉE : COMBINÉE. Cette décision ou stratégie a besoin à la fois de la "
            "compatibilité historique (dossier, mémoire), de la situation actuelle (recherche "
            "publique), du contexte privé (profil, workspace, CRM) et de l'accessibilité "
            "(systèmes connectés) — n'en saute aucune ; nomme ce qui manque plutôt que de conclure "
            "sur un sous-ensemble présenté comme complet."
        ),
        "en": (
            "\n\nREQUESTED SOURCE: COMBINED. This decision or strategy needs historical fit "
            "(dossier, memory), the current situation (public search), private context (profile, "
            "workspace, CRM) AND accessibility (connected systems) together — skip none of them; "
            "name what is missing rather than concluding on a subset presented as complete."
        ),
    },
    "workspace_first": {
        "fr": (
            "\n\nSOURCE DEMANDÉE : ACTIVITÉ D'ABORD. La réponse dépend prioritairement de "
            "l'activité ou des relations du commercial — vérifie d'abord son workspace et ses "
            "systèmes connectés (CRM, mails, agenda) avant d'élargir vers le dossier compte, "
            "DataForge, observations du marché ou une recherche publique."
        ),
        "en": (
            "\n\nREQUESTED SOURCE: WORKSPACE FIRST. The answer depends first on the salesperson's "
            "own activity or relationships — check their workspace and connected systems (CRM, "
            "mail, calendar) before widening to the account dossier, DataForge, market observations or a "
            "public search."
        ),
    },
}


def source_plan_block(mode: str | None, language: str) -> str:
    """Le bloc du prompt système pour un mode DÉTECTÉ. ``""`` sans mode
    (aucun marqueur) — prompt inchangé au byte près, même garantie que
    ``research_mode_block``."""
    modes = _SOURCE_PLAN_BLOCKS.get(mode or "")
    if not modes:
        return ""
    lang = "en" if language == "en" else "fr"
    return modes[lang]


# ── #3176.10 — observabilité, câblée sur les APPELS D'OUTILS RÉELS du tour
# (``collected``/``actions`` de l'orchestrateur, chaque entrée porte
# ``entry["tool"]`` — voir ``chat_orchestrator._execute_one_tool``), jamais
# sur la seule lecture du message.

#: Correspondance outil → couche, VOLONTAIREMENT PARTIELLE et documentée :
#: seuls les outils dont la couche est certaine sans ambiguïté y figurent.
#: `dataforge` et `methodological_inference` n'ont aujourd'hui AUCUN outil de
#: chat dédié (le premier se lit via le dossier compte, la seconde n'appelle
#: jamais d'outil par construction) — ils ne peuvent donc jamais apparaître
#: dans `layers_called`, ce que le test associé vérifie explicitement plutôt
#: que de deviner une correspondance qui n'existe pas.
LAYER_TOOL_NAMES: dict[str, frozenset[str]] = {
    "profile": frozenset({"get_user_context", "push_profile"}),
    "workspace": frozenset(
        {"search_workspace_accounts", "search_workspace_contacts", "get_workspace_health", "get_workspace_vocabulary"}
    ),
    "connected_systems": frozenset(
        {"get_crm_presence", "export_contact_to_crm", "create_contact_from_crm_presence", "search_mailbox", "read_mail_thread", "read_beeper_conversation", "list_agenda", "get_account_access"}
    ),
    "account_dossier": frozenset({"get_account_briefing", "get_account_timeline", "get_account_coverage_map"}),
    "market_memory": frozenset({"search_market_memory"}),
    "public_sources": frozenset({"web_search"}),
}


@dataclass(frozen=True)
class SourcePlanTrace:
    """#3176.10 — les SEPT champs d'observabilité du ticket."""

    source_plan_requested: str | None
    source_plan_effective: str | None
    matched_marker: str | None
    layers_called: tuple[str, ...]
    layers_unavailable: tuple[str, ...]
    internal_memory_used: bool
    public_search_avoided: bool
    source_plan_override_reason: str | None = None

    def to_wire(self) -> dict[str, object]:
        return {
            "source_plan_requested": self.source_plan_requested,
            "source_plan_effective": self.source_plan_effective,
            "matched_marker": self.matched_marker,
            "layers_called": list(self.layers_called),
            "layers_unavailable": list(self.layers_unavailable),
            "internal_memory_used": self.internal_memory_used,
            "public_search_avoided": self.public_search_avoided,
            "source_plan_override_reason": self.source_plan_override_reason,
        }


def observe_source_plan(match: ModeMatch | None, plan: SourcePlan | None, called_tool_names: list[str]) -> SourcePlanTrace | None:
    """#3176.10 — la trace d'observabilité d'UN tour, sur les appels d'outils
    RÉELS (``called_tool_names``, extraits de ``collected`` par l'appelant —
    ``chat.py``, jamais devinés ici). ``None`` sans mode détecté : aucun tour
    ordinaire n'écrit cette clé (même contrat additif que le reste de
    ``data["context"]``)."""
    if match is None or plan is None:
        return None
    called = set(called_tool_names)
    layers_called = tuple(
        layer for layer, tool_names in LAYER_TOOL_NAMES.items() if called & tool_names
    )
    # `thread_memory` n'a pas d'outil dédié : son usage se lit sur l'historique
    # du fil, toujours présent dans le prompt utilisateur — donc toujours
    # "utilisé" dès qu'il est mandatory/optional pour ce plan.
    if "thread_memory" in plan.mandatory_layers or "thread_memory" in plan.optional_layers:
        layers_called = ("thread_memory", *layers_called)
    layers_unavailable = tuple(layer for layer in plan.mandatory_layers if layer not in layers_called)
    public_search_avoided = "public_sources" in plan.forbidden_layers and "web_search" not in called
    internal_memory_used = "thread_memory" in layers_called or "profile" in layers_called
    return SourcePlanTrace(
        source_plan_requested=plan.requested_scope,
        source_plan_effective=plan.requested_scope,
        matched_marker=match.matched_marker,
        layers_called=layers_called,
        layers_unavailable=layers_unavailable,
        internal_memory_used=internal_memory_used,
        public_search_avoided=public_search_avoided,
        source_plan_override_reason=None,
    )


__all__ = [
    "CANONICAL_SOURCE_LAYERS",
    "CONTEXT_LAYER_TO_SOURCE_LAYER",
    "SEARCH_MODES",
    "SOURCE_PLANS",
    "LAYER_TOOL_NAMES",
    "ModeMatch",
    "SourcePlan",
    "SourcePlanTrace",
    "build_source_plan",
    "detect_search_mode",
    "observe_source_plan",
    "source_plan_block",
]
