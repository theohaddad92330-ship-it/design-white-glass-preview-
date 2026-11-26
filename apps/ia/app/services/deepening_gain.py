"""#189.7 (épopée #3218) — LE GAIN MARGINAL D'UN ROUND D'OUTILS.

Reste de LAU-FINAL-189 (#3183). L'épopée demande DEUX moitiés solidaires :
#189.1, un moteur d'approfondissement automatique à quatre niveaux (PASS 0→3),
et #189.7, son critère d'arrêt sur le GAIN MARGINAL — stopper quand un passage
de plus n'apporte plus rien de neuf, plutôt que sur un budget de temps ou un
nombre de tours fixe. L'épopée le dit elle-même : « l'un sans l'autre ne se
teste pas honnêtement ».

Ce lot NE LIVRE PAS #189.1 : modifier le tour de conversation en production
(`chat_orchestrator.py`, 1886 lignes, dont chaque ligne de contrôle de la
boucle d'outils est documentée par un incident réel déjà survenu — #2269.14-16,
#1950.17, #1943.3, #3085) pour lui ajouter un CINQUIÈME mécanisme de décision
sans avoir de quoi le tester sur de vraies conversations serait soit une
maquette non prouvée, soit une régression sur un chemin critique — voir le
commentaire de clôture sur #3218 pour le détail.

Ce module livre la plus petite tranche utile ET prouvable de #189.7 qui reste
sûre à isoler CE lot : la MESURE elle-même — ``marginal_gain`` est une
fonction pure, testée seule — câblée en OBSERVATION sur chaque round réel de
la boucle d'outils (``chat_orchestrator.py``, juste à côté de
``tool_planner.summarize_and_record_round``, même garantie fail-soft : un
incident de journal ne doit jamais faire planter un tour de chat par
ailleurs correct). Aucun round n'est arrêté par cette mesure : le critère
D'ARRÊT lui-même reste à écrire, avec #189.1, dans un lot séparé.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any

from app.services.chat_thread_state import ThreadState

logger = logging.getLogger(__name__)


def marginal_gain(before: ThreadState, after: ThreadState) -> int:
    """Ce qu'UN round a RÉELLEMENT changé, entre deux instantanés de l'état du
    fil : des entités NOUVELLEMENT résolues (comparaison par (kind, id), pas
    par longueur de liste — ``ThreadStateCollector._remember_object`` réordonne
    ET plafonne ``objects`` à ``OBJECTS_MAX``, donc une longueur inchangée ne
    veut pas dire zéro entité nouvelle), des décisions prises en plus, et des
    pistes tranchées en plus (``ruled_out`` — la forme la plus proche d'une
    « contradiction résolue » que l'état du fil porte aujourd'hui ; vérifié,
    aucun suivi de contradiction dédié n'existe ailleurs — GA-26).

    Pure, jamais négative : ``decisions``/``ruled_out`` ne sont qu'ajoutés
    (jamais retirés) par ``ThreadStateCollector``, mais le calcul reste
    défensif (``max(0, …)``) plutôt que de supposer cet invariant depuis ce
    module."""
    before_entities = {(obj.kind, obj.id) for obj in before.objects}
    after_entities = {(obj.kind, obj.id) for obj in after.objects}
    # #3863.2 — « la cible » est le périmètre que la personne a posé : une
    # entité qu'elle (ou le modèle, sur sa demande) a EXCLUE du périmètre
    # persistant n'est pas un progrès, elle ne gonfle pas l'indicateur. Une
    # entité simplement nouvelle (une filiale trouvée en route) compte toujours.
    excluded = (
        {(obj.kind, obj.id) for obj in after.persistent_scope.excluded_entities}
        if after.persistent_scope is not None
        else set()
    )
    new_entities = len(after_entities - before_entities - excluded)
    new_decisions = max(0, len(after.decisions) - len(before.decisions))
    new_ruled_out = max(0, len(after.ruled_out) - len(before.ruled_out))
    # #189.1 (lot E1 30/09) — une recherche préparée ou une proposition posée
    # est AUSSI un apport : sans elles, le critère d'arrêt du moteur aurait
    # tué un tour dont le seul résultat est une carte de recherche.
    new_searches = len(set(after.searches) - set(before.searches))
    new_proposals = max(0, len(after.proposals) - len(before.proposals))
    return new_entities + new_decisions + new_ruled_out + new_searches + new_proposals


# Recette prod 07/10 (fix/demo-0810-r2b-laura) — les clés qui ne portent AUCUNE
# donnée lue : un statut, un message, une note. `{"note": "rien"}` reste stérile.
# Les champs de l'enveloppe canonique (`tool_result_envelope.py`) décrivent la
# lecture, ils ne SONT pas la donnée : une recherche vide reste stérile.
_NON_EVIDENCE_KEYS = frozenset(
    {
        "status",
        "note",
        "message",
        "hint",
        "error",
        "result_type",
        "total",
        "total_found",
        "returned_count",
        "truncated",
        "sources_consulted",
        "sources_succeeded",
        "sources_failed",
        "scope",
        "caveats",
        "unknowns",
        "partial_reason",
        "error_code",
        "suggested_next_step",
        "coverage",
        "duration_ms",
        "next_cursor",
    }
)
# Les statuts d'enveloppe qui disent « rien n'a été lu » (`ToolResultStatus`).
_STERILE_STATUSES = frozenset(
    {"empty", "not_covered", "permission_denied", "timeout", "provider_error", "invalid_input", "cancelled"}
)


def _carries_data(output: Any) -> bool:
    if isinstance(output, dict):
        if output.get("status") in _STERILE_STATUSES:
            return False
        return any(key not in _NON_EVIDENCE_KEYS and value not in (None, "", 0, False) and value != [] and value != {}
                   for key, value in output.items())
    if isinstance(output, (list, tuple)):
        return len(output) > 0
    return bool(output)


def fresh_evidence(results: Iterable[tuple[str, Any, bool]], *, already_called: frozenset[str]) -> int:
    """Recette prod 07/10 (fix/demo-0810-r2b-laura) — ce qu'UN round a LU de
    neuf : chaque appel réussi, jamais fait avant dans ce tour (signature
    `call_signature`), dont la sortie porte une donnée.

    `marginal_gain` ne voit que les outils de `cited_objects` : une recherche de
    compte par nom, des signaux, des contacts, une note de fil y valaient 0 et
    le moteur arrêtait le tour APRÈS son premier round — « Quels signaux chez
    Arquus ? » résolvait le nom puis répondait sans lire les signaux (cid
    59870f89 : `search_workspace_accounts` seul, puis « approfondissement arrêté
    (marginal_gain) »). Une erreur, un résultat vide ou un appel répété restent
    stériles : le critère d'arrêt sait toujours dire NON."""
    seen: set[str] = set()
    count = 0
    for signature, output, is_error in results:
        if is_error or signature in already_called or signature in seen:
            continue
        seen.add(signature)
        if _carries_data(output):
            count += 1
    return count


def record_round_gain(*, round_index: int, gain: int) -> None:
    """Journalise le gain marginal d'UN round — fail-soft, même geste que
    `tool_planner.summarize_and_record_round`/`tool_call_audit.
    record_tool_call` : un incident d'écriture ici ne doit JAMAIS faire
    planter un tour de chat par ailleurs correct. Observation SEULE : cet
    appel ne filtre ni ne raccourcit la boucle d'outils qui l'entoure."""
    try:
        logger.info("chat_orchestrator: round=%d marginal_gain=%d", round_index, gain)
    except Exception:  # noqa: BLE001 — un incident de journal ne casse jamais le tour
        logger.exception("deepening_gain: échec d'écriture du journal de gain marginal")
