"""#3198 (LAU-FINAL-204, beta P0) — le VOCABULAIRE de la trace structurée du
raisonnement commercial de Laura, et la vue qu'en voit le support.

─────────────────────────────────────────────────────────────────────────────
POURQUOI CE MODULE EXISTE
─────────────────────────────────────────────────────────────────────────────
Le retour bêta #3198 : « l'équipe constate qu'une réponse est mauvaise mais
ne peut pas savoir si la cause vient du routage, de la donnée, du modèle ou
du prompt. » Le dépôt trace déjà la PERFORMANCE d'un tour de chat
(`turn_trace.py` / `chat-turn-trace.ts` — les étages `auth`/`quota`/`context`/
`db`, #2442.4) mais rien ne trace la DÉCISION : quelle intention a été
détectée, quel plan de sources a été suivi, quel verdict de compte a été
rendu et pourquoi. `git grep` de chacun des seize champs demandés par #3198
rend zéro résultat dans tout le dépôt avant ce module.

Ce module livre le même genre de pierre que `chat_hard_failures.py` /
`chat_corpus_sources.py` pour cette épopée : le VOCABULAIRE fermé (les seize
champs, dans l'ordre exact de l'issue, GA-08), une structure qui les porte
sans jamais pouvoir porter une chaîne de pensée libre, et la projection que
voit le support. Le branchement sur un vrai tour de conversation LIVE
(`chat_orchestrator.py`) reste hors de cette tranche — même limite assumée
que la première tranche de `chat_hard_failures.py` (« code juste, calculé,
testé, pas encore appelé par l'orchestrateur »).

─────────────────────────────────────────────────────────────────────────────
« NE PAS STOCKER UNE CHAÎNE DE PENSÉE LIBRE » — CE QUE ÇA VEUT DIRE EN CODE
─────────────────────────────────────────────────────────────────────────────
La consigne de #3198 n'est pas qu'une intention : `validate_trace` la fait
tenir. Chaque champ texte est plafonné à `MAX_FIELD_CHARS` (une phrase
courte, jamais un paragraphe de raisonnement), et chaque champ liste doit
être un VRAI tuple de chaînes courtes — jamais une chaîne unique qui
s'itérerait caractère par caractère. Un dépassement est un défaut nommé,
jamais une troncature silencieuse : tronquer inventerait un motif que la
trace n'a pas produit.

`unknowns` distingue `None` (jamais vérifié — non mesuré) de `()` (vérifié,
rien d'inconnu trouvé) : la même discipline que « non mesuré n'est jamais 0 »
(GA-18/GA-19), appliquée à une liste plutôt qu'à un score.

─────────────────────────────────────────────────────────────────────────────
LA VUE SUPPORT — CE QU'ELLE GARDE, CE QU'ELLE ÉCARTE, ET POURQUOI
─────────────────────────────────────────────────────────────────────────────
#3198 nomme quatre choses que le support doit voir (« les plans et statuts
structurés, les sources consultées, les versions, les erreurs ») et trois
qu'il ne doit JAMAIS voir (secrets, chaîne de pensée, données non
autorisées). Les champs plafonnés par `validate_trace` couvrent déjà les deux
derniers structurellement (aucun champ ne PEUT porter une chaîne de pensée).
Reste la troisième distinction, que `SUPPORT_VISIBLE_FIELDS` opère : les sept
champs qui répondent à la question « routage, donnée, modèle ou prompt ? »
(intention détectée, plan de sources, périmètre d'entité, version de profil,
règles de méthode, outils appelés, statut du vérificateur) restent visibles ;
les sept qui portent le JUGEMENT COMMERCIAL sur le compte d'un client
(décision sous-jacente, verdict de compte, facteurs dominants/bloquants,
niveau de contestation, alternatives, facettes préservées) ne le sont pas —
le support diagnostique une panne technique, il n'a pas besoin de rejouer
l'avis commercial rendu à un client précis pour le faire. **Tranché sans
Louis** : ce découpage n'est écrit nulle part ailleurs, choisi par analogie
avec le NO-GO de l'issue elle-même plutôt que deviné.
"""

from __future__ import annotations

from dataclasses import dataclass, fields
from enum import StrEnum

#: Une phrase courte, jamais un paragraphe — au-delà, ce n'est plus une
#: étiquette de trace mais un raisonnement libre déguisé.
MAX_FIELD_CHARS = 200


class ReasoningTraceField(StrEnum):
    """Les SEIZE champs de la trace, dans l'ordre exact du corps de #3198.

    ⚠️ ORDRE FIGÉ (GA-08, même discipline que `ChatHardFailure`) : une valeur
    ne disparaît jamais, un ajout va en FIN.
    """

    DETECTED_INTENT = "detected_intent"
    UNDERLYING_DECISION = "underlying_decision"
    SOURCE_PLAN = "source_plan"
    ENTITY_SCOPE = "entity_scope"
    PROFILE_VERSION = "profile_version"
    METHOD_RULES_USED = "method_rules_used"
    TOOLS_CALLED = "tools_called"
    ACCOUNT_VERDICT = "account_verdict"
    DOMINANT_FACTORS = "dominant_factors"
    BLOCKING_FACTORS = "blocking_factors"
    UNKNOWNS = "unknowns"
    CHALLENGE_LEVEL = "challenge_level"
    ALTERNATIVES_GENERATED = "alternatives_generated"
    FACETS_PRESERVED = "facets_preserved"
    VERIFIER_STATUS = "verifier_status"
    FINAL_ACTION = "final_action"


#: Les champs qui sont des LISTES (tuples de chaînes courtes) plutôt qu'une
#: chaîne courte unique — tout le reste de `ReasoningTraceField` est scalaire.
_LIST_FIELDS = frozenset(
    {
        ReasoningTraceField.SOURCE_PLAN,
        ReasoningTraceField.METHOD_RULES_USED,
        ReasoningTraceField.TOOLS_CALLED,
        ReasoningTraceField.DOMINANT_FACTORS,
        ReasoningTraceField.BLOCKING_FACTORS,
        ReasoningTraceField.UNKNOWNS,
        ReasoningTraceField.ALTERNATIVES_GENERATED,
        ReasoningTraceField.FACETS_PRESERVED,
    }
)

#: Les sept champs diagnostiques (routage / donnée / modèle / prompt) que le
#: support voit — jamais le jugement commercial sur le compte lui-même.
SUPPORT_VISIBLE_FIELDS = frozenset(
    {
        ReasoningTraceField.DETECTED_INTENT,
        ReasoningTraceField.SOURCE_PLAN,
        ReasoningTraceField.ENTITY_SCOPE,
        ReasoningTraceField.PROFILE_VERSION,
        ReasoningTraceField.METHOD_RULES_USED,
        ReasoningTraceField.TOOLS_CALLED,
        ReasoningTraceField.VERIFIER_STATUS,
    }
)


@dataclass(frozen=True)
class ReasoningTrace:
    """UN tour de raisonnement commercial — jamais un écran, jamais une
    chaîne de pensée : seize champs courts, structurés, plafonnés."""

    detected_intent: str
    underlying_decision: str
    source_plan: tuple[str, ...]
    entity_scope: str
    profile_version: str
    method_rules_used: tuple[str, ...]
    tools_called: tuple[str, ...]
    account_verdict: str
    dominant_factors: tuple[str, ...]
    blocking_factors: tuple[str, ...]
    #: `None` = jamais vérifié (non mesuré) ; `()` = vérifié, rien d'inconnu.
    unknowns: tuple[str, ...] | None
    challenge_level: str
    alternatives_generated: tuple[str, ...]
    facets_preserved: tuple[str, ...]
    verifier_status: str
    final_action: str


def _field_problems(name: str, value: object, *, is_list: bool) -> list[str]:
    problems: list[str] = []
    if is_list:
        if name == "unknowns" and value is None:
            return problems
        if not isinstance(value, tuple):
            problems.append(
                f"{name} doit être un tuple de chaînes courtes, reçu {type(value).__name__!r} "
                "(une chaîne unique s'itérerait caractère par caractère)"
            )
            return problems
        for item in value:
            if not isinstance(item, str) or len(item) > MAX_FIELD_CHARS:
                problems.append(
                    f"{name} porte un élément de plus de {MAX_FIELD_CHARS} caractères — "
                    "une chaîne de pensée libre déguisée en item de liste"
                )
                break
    else:
        if not isinstance(value, str) or len(value) > MAX_FIELD_CHARS:
            problems.append(
                f"{name} dépasse {MAX_FIELD_CHARS} caractères — une chaîne de pensée libre "
                "ne se stocke jamais dans la trace (#3198)"
            )
    return problems


def validate_trace(trace: ReasoningTrace) -> tuple[str, ...]:
    """Les défauts d'une trace — liste vide = elle tient la règle « jamais de
    chaîne de pensée libre ». Jamais un rejet silencieux côté appelant."""
    problems: list[str] = []
    for field in fields(trace):
        value = getattr(trace, field.name)
        is_list = ReasoningTraceField(field.name) in _LIST_FIELDS
        problems.extend(_field_problems(field.name, value, is_list=is_list))
    return tuple(problems)


def support_view(trace: ReasoningTrace) -> dict[str, object]:
    """La projection que voit le support : les champs diagnostiques
    (routage/donnée/modèle/prompt), jamais le jugement commercial sur le
    compte. Voir le docstring du module pour le détail du découpage."""
    return {field.value: getattr(trace, field.value) for field in SUPPORT_VISIBLE_FIELDS}


#: Épopée #3223 — les QUATRE champs SUPPORT_VISIBLE qu'un tour de chat peut
#: nommer AVANT l'appel modèle, sur du réel déjà calculé ailleurs (#2321
#: `route_chat_intent`, #3178 le Facet Ledger, `method_knowledge`) — jamais un
#: second calcul (GA-26).
_PRE_TURN_FIELDS = (
    ReasoningTraceField.DETECTED_INTENT,
    ReasoningTraceField.SOURCE_PLAN,
    ReasoningTraceField.ENTITY_SCOPE,
    ReasoningTraceField.METHOD_RULES_USED,
)

#: Épopée #3223 (suite) — les TROIS champs SUPPORT_VISIBLE connus seulement
#: APRÈS la boucle d'outils : `tools_called` (les outils RÉELLEMENT exécutés)
#: se lit directement dans `actions`, déjà renvoyé par `run_chat_with_tools`
#: (« une entrée par outil réellement exécuté », voir son docstring) — jamais
#: un second calcul. `verifier_status` (le verdict de
#: `commercial_verifier.verify_response`) se lit dans `verifier_status_sink`,
#: rempli par référence par `chat_orchestrator._commercial_verify` — même
#: patron que `observability_sink` (#3196.6) : le tuple `(reply, actions)` ne
#: change pas d'un octet, aucun des soixante et quelques appelants de
#: `run_chat_with_tools` n'a besoin d'être touché.
#:
#: `profile_version` — cru bloqué par la tranche pré-tour (« aucune notion de
#: version n'existe encore sur `ProfileContext`/`profile_data` ») : ce
#: diagnostic datait d'AVANT que l'intégration E (#3365) ne fusionne #3212.3
#: dans `main` (`analysis-versioning.ts`, `esn:<version>/context:<version>`,
#: déjà relayé par l'outil `get_account_briefing` — #3212.3(b)). Relayé tel
#: quel par `chat_tools.profile_version_hint`, jamais un second calcul
#: (GA-26) : `None` sans dossier de compte consulté ce tour — une absence
#: RÉELLE, jamais devinée — donc les SEPT champs support-visibles sont
#: maintenant tous branchés sur un vrai tour.
_POST_TURN_FIELDS = (
    ReasoningTraceField.TOOLS_CALLED,
    ReasoningTraceField.VERIFIER_STATUS,
    ReasoningTraceField.PROFILE_VERSION,
)


def pre_turn_diagnostic_fields(
    *,
    detected_intent: str,
    source_plan: tuple[str, ...],
    entity_scope: str,
    method_rules_used: tuple[str, ...],
) -> dict[str, object]:
    """Le sous-ensemble PROUVABLE de `ReasoningTrace` sur un vrai tour, calculé
    AVANT l'appel modèle — jamais les seize champs au complet (voir
    `_PRE_TURN_FIELDS`). Même discipline que `validate_trace` : lève plutôt
    que de journaliser une chaîne de pensée libre déguisée."""
    fields: dict[str, object] = {
        ReasoningTraceField.DETECTED_INTENT.value: detected_intent,
        ReasoningTraceField.SOURCE_PLAN.value: source_plan,
        ReasoningTraceField.ENTITY_SCOPE.value: entity_scope,
        ReasoningTraceField.METHOD_RULES_USED.value: method_rules_used,
    }
    problems: list[str] = []
    for field in _PRE_TURN_FIELDS:
        problems.extend(_field_problems(field.value, fields[field.value], is_list=field in _LIST_FIELDS))
    if problems:
        raise ValueError("; ".join(problems))
    return fields


def post_turn_diagnostic_fields(
    *,
    tools_called: tuple[str, ...],
    verifier_status: str,
    profile_version: str,
) -> dict[str, object]:
    """Les TROIS derniers champs SUPPORT_VISIBLE, connus seulement APRÈS la
    boucle d'outils (voir `_POST_TURN_FIELDS`) — même discipline que
    `pre_turn_diagnostic_fields` : lève plutôt que de journaliser une chaîne
    de pensée libre déguisée. Avec `pre_turn_diagnostic_fields`, couvre les
    SEPT champs support-visibles au complet."""
    fields: dict[str, object] = {
        ReasoningTraceField.TOOLS_CALLED.value: tools_called,
        ReasoningTraceField.VERIFIER_STATUS.value: verifier_status,
        ReasoningTraceField.PROFILE_VERSION.value: profile_version,
    }
    problems: list[str] = []
    for field in _POST_TURN_FIELDS:
        problems.extend(_field_problems(field.value, fields[field.value], is_list=field in _LIST_FIELDS))
    if problems:
        raise ValueError("; ".join(problems))
    return fields
