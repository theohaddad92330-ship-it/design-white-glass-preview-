"""#3175.1/.2 (épopée #3215) — L'OBJET ``CommercialIntent`` à treize champs.

Ce qui manquait
---------------
Le routeur d'intention (``intent_router.py``, #2321) répond à « quelle intention,
quels outils ». Il ne disait pas ce que le ticket #3175 réclame en plus : la
DÉCISION commerciale sous la question littérale, le niveau d'action attendu, le
niveau de PREUVE exigé, ce que la personne EXCLUT, l'ambiguïté restante et le
risque. Ce module assemble ces treize champs UNE FOIS par tour.

Ce qu'il fait, et ce qu'il ne fait pas
--------------------------------------
- Il COMPOSE des producteurs qui existent déjà (la route, la lecture de lieu de
  Découvrir, les marqueurs d'horizon, le plan de sources) — GA-26, jamais une
  seconde lecture de la même donnée — et ajoute des marqueurs DÉCLARÉS (FR et
  EN) pour ce qu'aucun producteur ne lisait (facettes, exclusions, décision).
- Aucun appel de modèle, aucun réseau. Une valeur est une entrée d'un
  vocabulaire FERMÉ, ou ``None`` / vide : « non lu » n'est jamais une valeur
  devinée.
- **Jamais exposé au modèle.** ``literal_request`` est le texte brut de la
  personne : l'objet vit dans le process du tour, il alimente le routage, le
  vérificateur final (``commercial_verifier``) et la télémétrie
  (:func:`commercial_intent_for_log`, SANS CONTENU) — mais aucun bloc de prompt
  ne le rend. :func:`commercial_intent_prompt_leak` en est la preuve rejouable.

Miroir TS : ``packages/contracts/src/schemas/commercial-intent.ts``, tenu par
``commercial-intent.parity.test.ts`` qui LIT ce fichier (GA-26).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.services.chat_thread_state import ThreadPersistentScope
from app.services.compilers.intent_markers import horizon_from_message
from app.services.compilers.intent_router import (
    UNDECLARED_CHAT_INTENT,
    ChatIntentRoute,
    _matched,
    _normalize,
    asks_for_internal_only_scope,
    asks_to_prepare_a_message,
    asks_to_qualify_a_named_account,
)

#: Les treize champs du ticket, DANS SON ORDRE (miroir TS).
COMMERCIAL_INTENT_FIELDS: tuple[str, ...] = (
    "literal_request",
    "underlying_decision",
    "expected_outcome",
    "primary_entity",
    "secondary_entities",
    "requested_facets",
    "explicit_exclusions",
    "time_horizon",
    "requested_knowledge_scope",
    "action_level",
    "evidence_requirement",
    "ambiguity_level",
    "commercial_risk",
)

#: La décision commerciale sous la question — vocabulaire FERMÉ.
COMMERCIAL_DECISIONS: tuple[str, ...] = (
    "trouver_des_comptes",
    "ouvrir_ou_non_le_compte",
    "choisir_entre_options",
    "positionner_un_consultant",
    "trouver_les_decideurs",
    "comprendre_le_perimetre",
    "preparer_l_approche",
    "actualiser_l_information",
    "suivre_l_affaire",
)

COMMERCIAL_ACTION_LEVELS: tuple[str, ...] = ("lire", "analyser", "preparer")
COMMERCIAL_EVIDENCE_REQUIREMENTS: tuple[str, ...] = ("aucune", "preuve_d_outil")
COMMERCIAL_AMBIGUITY_LEVELS: tuple[str, ...] = ("faible", "moyenne", "elevee")
COMMERCIAL_RISK_LEVELS: tuple[str, ...] = ("faible", "moyen", "eleve")
COMMERCIAL_KNOWLEDGE_SCOPES: tuple[str, ...] = ("internal_only",)

#: Intention routée → décision sous-jacente. Une intention absente d'ici (diagnostic,
#: import, retour…) n'a PAS de décision commerciale : on ne l'invente pas.
_DECISION_BY_INTENT: dict[str, str] = {
    "chercher_du_business": "trouver_des_comptes",
    "comparer": "choisir_entre_options",
    "challenger_un_compte": "ouvrir_ou_non_le_compte",
    "trouver_contacts": "trouver_les_decideurs",
    "comprendre_ecosysteme": "comprendre_le_perimetre",
    "choisir_perimetre": "comprendre_le_perimetre",
    "actualiser": "actualiser_l_information",
    "profil": "positionner_un_consultant",
    "matcher": "positionner_un_consultant",
    "proposer": "preparer_l_approche",
    "signe": "suivre_l_affaire",
    "retour": "suivre_l_affaire",
}
#: Les décisions qui sont de la matière COMMERCIALE : jamais traitées comme une
#: question encyclopédique — la réponse doit s'appuyer sur un résultat d'outil
#: (#3175.4/.6).
_EVIDENCE_DECISIONS = frozenset(set(_DECISION_BY_INTENT.values()) | {"ouvrir_ou_non_le_compte"})

#: #3175.4/.6 — positionnement d'un consultant (« j'ai ce Java, j'en fais quoi ? »).
_POSITIONING_MARKERS: tuple[str, ...] = (
    "j'en fais quoi",
    "qu'est-ce que j'en fais",
    "que faire de ce consultant",
    "que faire de ce profil",
    "ou placer ce consultant",
    "ou placer ce profil",
    "a qui proposer ce consultant",
    "what do i do with this consultant",
    "where do i place this consultant",
    "what do i do with this java",
)
#: #3175.4/.6 — comparaison d'options.
_COMPARISON_MARKERS: tuple[str, ...] = (
    "compare",
    "compare-moi",
    "comparer",
    "comparaison",
    "versus",
    "vs",
    "lequel des deux",
    "which of the two",
)

#: #3215 (recette prod 04/10) — « Reformule ta dernière réponse en deux phrases » : un tour de
#: REFORMULATION n'a aucune décision commerciale propre, donc aucune exigence de preuve — et la
#: reformulation d'une réponse d'outil, sans relancer d'outil, partait sans la précision
#: « aucun résultat d'outil ». Elle redit des faits d'un compte : elle porte la même exigence.
_REPHRASE_MARKERS: tuple[str, ...] = (
    "reformule",
    "reformulez",
    "reformuler",
    "redis-moi",
    "redis ta derniere reponse",
    "resume ta derniere reponse",
    "resume ta reponse",
    "en deux phrases",
    "en une phrase",
    "rephrase",
    "summarize your last",
    "say that again",
    "in two sentences",
    "in one sentence",
)

#: Facettes demandées — vocabulaire fermé, marqueurs déclarés.
_FACET_MARKERS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("contacts", ("contacts", "contact", "decideurs", "decision makers", "qui contacter")),
    ("organigramme", ("organigramme", "org chart", "hierarchie")),
    ("technologies", ("technologies", "technos", "stack", "tech stack")),
    ("budget", ("budget", "budgets")),
    ("signaux", ("signaux", "signals", "recrutements", "levee de fonds")),
    ("concurrents", ("concurrents", "competitors", "esn en place", "esn presentes")),
    ("actualites", ("actualites", "actualite", "news")),
    ("financier", ("chiffre d'affaires", "financier", "financials", "resultats financiers")),
)

#: Exclusions explicites — vocabulaire fermé, marqueurs déclarés.
_EXCLUSION_MARKERS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "clients_existants",
        (
            "sans mes clients",
            "hors mes clients",
            "pas mes clients actuels",
            "sans mes clients actuels",
            "hors clients actuels",
            "excluding my clients",
            "not my current clients",
        ),
    ),
    (
        "esn_concurrentes",
        ("sans les esn", "hors esn", "pas les esn", "excluding esns", "no esn"),
    ),
    (
        "sources_publiques",
        ("sans recherche web", "pas de recherche web", "no web search", "without web search"),
    ),
)

#: Les entrées du fil qui NOMMENT une entité secondaire (jamais le compte actif).
_SECONDARY_BY_INPUT: dict[str, str] = {
    "besoin_cite": "need",
    "consultant_cite": "consultant",
    "mission_citee": "mission",
}

#: #3175 — ce que le périmètre persistant du fil (Facet Ledger, #3178) apporte :
#: des étiquettes d'un vocabulaire FERMÉ, jamais le libellé d'une entité.
SCOPE_EXCLUSION = "entites_du_perimetre_exclues"
SCOPE_SECONDARY = "perimetre_groupe"


@dataclass(frozen=True)
class CommercialIntent:
    """Les treize champs. ⚠️ ``literal_request`` et ``primary_entity`` portent du
    contenu : l'objet ne sort jamais vers le modèle ni vers un journal brut."""

    literal_request: str
    underlying_decision: str | None
    expected_outcome: str | None
    primary_entity: str | None
    secondary_entities: tuple[str, ...]
    requested_facets: tuple[str, ...]
    explicit_exclusions: tuple[str, ...]
    time_horizon: str | None
    requested_knowledge_scope: str | None
    action_level: str
    evidence_requirement: str
    ambiguity_level: str
    commercial_risk: str


def _collect(text: str, table: Sequence[tuple[str, tuple[str, ...]]]) -> tuple[str, ...]:
    return tuple(name for name, markers in table if _matched(text, markers))


def build_commercial_intent(
    *,
    message: str,
    route: ChatIntentRoute,
    available_inputs: Sequence[str] = (),
    clarification_already_asked: bool = False,
    persistent_scope: ThreadPersistentScope | None = None,
) -> CommercialIntent:
    """L'objet d'UN tour. Pur, déterministe ; ``route`` est celle que le routeur
    vient de produire — jamais recalculée ici."""
    text = _normalize(message)
    routed = route.intent != UNDECLARED_CHAT_INTENT

    decision: str | None = _DECISION_BY_INTENT.get(route.intent) if routed else None
    # Les marqueurs de ce module AFFINENT la route : une demande de positionnement
    # ou de comparaison n'est pas toujours routée par la table des dix.
    if _matched(text, _POSITIONING_MARKERS):
        decision = "positionner_un_consultant"
    elif _matched(text, _COMPARISON_MARKERS):
        decision = "choisir_entre_options"
    elif asks_to_qualify_a_named_account(message):
        decision = "ouvrir_ou_non_le_compte"
    elif decision is None and asks_to_prepare_a_message(message):
        decision = "preparer_l_approche"

    prepares = bool(asks_to_prepare_a_message(message)) or "preparer_le_message" in route.steps
    if prepares:
        action_level = "preparer"
    elif routed and route.tools or decision is not None:
        action_level = "analyser"
    else:
        action_level = "lire"

    rephrases = _matched(text, _REPHRASE_MARKERS)
    evidence = "preuve_d_outil" if decision in _EVIDENCE_DECISIONS or rephrases else "aucune"

    if not routed and decision is None:
        ambiguity = "elevee"
    elif route.confidence == "hypothese" or not routed:
        ambiguity = "moyenne"
    else:
        ambiguity = "faible"
    if route.missing_inputs and ambiguity == "faible":
        ambiguity = "moyenne"
    if clarification_already_asked and ambiguity == "elevee":
        # La personne a déjà été interrogée : l'ambiguïté reste NOMMÉE, mais
        # elle ne justifie plus une seconde question (le drapeau §9.4).
        ambiguity = "moyenne"

    if prepares or route.awaits_validation:
        risk = "eleve"
    elif decision in {"ouvrir_ou_non_le_compte", "choisir_entre_options", "positionner_un_consultant"}:
        risk = "moyen"
    else:
        risk = "faible"

    scope = "internal_only" if asks_for_internal_only_scope(message) else None
    exclusions = _collect(text, _EXCLUSION_MARKERS)
    if scope == "internal_only" and "sources_publiques" not in exclusions:
        exclusions = (*exclusions, "sources_publiques")

    secondary = tuple(_SECONDARY_BY_INPUT[k] for k in tuple(available_inputs) if k in _SECONDARY_BY_INPUT)
    if persistent_scope is not None:
        # Lu sur ce que le modèle a NOMMÉ au fil (jamais extrait de la phrase).
        secondary = (*secondary, SCOPE_SECONDARY)
        if persistent_scope.excluded_entities and SCOPE_EXCLUSION not in exclusions:
            exclusions = (*exclusions, SCOPE_EXCLUSION)

    return CommercialIntent(
        literal_request=message,
        underlying_decision=decision,
        expected_outcome=route.expected_result if routed else None,
        primary_entity=route.starting_point,
        secondary_entities=secondary,
        requested_facets=_collect(text, _FACET_MARKERS),
        explicit_exclusions=exclusions,
        time_horizon=horizon_from_message(message),
        requested_knowledge_scope=scope,
        action_level=action_level,
        evidence_requirement=evidence,
        ambiguity_level=ambiguity,
        commercial_risk=risk,
    )


def commercial_intent_for_log(intent: CommercialIntent) -> dict[str, object]:
    """La vue JOURNALISABLE — SANS CONTENU : ni le texte, ni le nom de l'entité
    (seule sa PRÉSENCE). Tout le reste est une valeur d'un vocabulaire fermé."""
    return {
        "underlying_decision": intent.underlying_decision or "aucune",
        "expected_outcome": intent.expected_outcome or "aucun",
        "has_primary_entity": intent.primary_entity is not None,
        "secondary_entities": list(intent.secondary_entities),
        "requested_facets": list(intent.requested_facets),
        "explicit_exclusions": list(intent.explicit_exclusions),
        "time_horizon": intent.time_horizon or "aucun",
        "requested_knowledge_scope": intent.requested_knowledge_scope or "aucun",
        "action_level": intent.action_level,
        "evidence_requirement": intent.evidence_requirement,
        "ambiguity_level": intent.ambiguity_level,
        "commercial_risk": intent.commercial_risk,
    }


def commercial_intent_prompt_leak(system_prompt: str, intent: CommercialIntent) -> bool:
    """Vrai quand le texte brut de la personne est recopié dans ``system_prompt``
    — la preuve rejouable que l'objet n'est pas exposé au modèle."""
    return bool(intent.literal_request) and intent.literal_request in system_prompt
