"""#189.1 + #189.7 (épopée #3218) — LE MOTEUR D'APPROFONDISSEMENT AUTOMATIQUE.

Quatre niveaux, enchaînés par l'orchestrateur SANS geste de l'utilisateur :
PASS 0 contexte local → PASS 1 vérification ciblée → PASS 2 recherche
thématique → PASS 3 résolution des contradictions. Et son critère d'arrêt :
le GAIN MARGINAL (`deepening_gain.marginal_gain`) — un round qui n'a rien
changé (aucune entité résolue, décision, piste tranchée) n'est pas rejoué,
quel que soit le budget de temps restant.

Fonction PURE : l'orchestrateur lui passe les gains déjà mesurés et le
signal « contradiction ouverte », il en tire un niveau à annoncer (note au
modèle + étape visible) ou un arrêt. Les invariants de la boucle (budget de
tour, réserve par round, plafond de rounds) restent SEULS maîtres du temps :
ce moteur ne peut que raccourcir, jamais rallonger un tour.

Une contradiction ouverte reste VISIBLE (#190.8) : Laura la nomme dans sa
réponse finale. #3863.4 — et un gain nul avec une contradiction ouverte
dépense UN round de résolution avant d'arrêter (jamais deux)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from enum import IntEnum
from typing import Any

# Un round qui rapporte MOINS que ce seuil est un round stérile.
MIN_MARGINAL_GAIN = 1


class DeepeningPass(IntEnum):
    LOCAL_CONTEXT = 0
    TARGETED_VERIFICATION = 1
    THEMATIC_SEARCH = 2
    CONTRADICTION_RESOLUTION = 3


@dataclass(frozen=True)
class DeepeningDecision:
    stop: bool
    next_pass: DeepeningPass | None
    reason: str


_LABELS = {
    DeepeningPass.LOCAL_CONTEXT: "Approfondissement — contexte local",
    DeepeningPass.TARGETED_VERIFICATION: "Approfondissement — vérification ciblée",
    DeepeningPass.THEMATIC_SEARCH: "Approfondissement — recherche thématique",
    DeepeningPass.CONTRADICTION_RESOLUTION: "Approfondissement — contradictions à trancher",
}

_NOTES = {
    DeepeningPass.LOCAL_CONTEXT: "PASS 0 — exploite d'abord le contexte local (compte, fiche, historique) avant toute recherche externe.",
    DeepeningPass.TARGETED_VERIFICATION: "PASS 1 — vérifie ciblé : confirme les faits clés trouvés (source, date) avant d'élargir.",
    DeepeningPass.THEMATIC_SEARCH: "PASS 2 — élargis par thème : un angle neuf que les passes précédentes n'ont pas couvert.",
    DeepeningPass.CONTRADICTION_RESOLUTION: (
        "PASS 3 — une contradiction est OUVERTE : nomme les deux prétentions et leurs sources, "
        "tranche seulement si une source fait autorité, sinon dis que ce n'est pas tranché."
    ),
}


def pass_step_label(level: DeepeningPass) -> str:
    return _LABELS[level]


def pass_note(level: DeepeningPass) -> str:
    return _NOTES[level]


def decide_next_pass(
    *, gains: Sequence[int], open_conflict: bool, conflict_pass_spent: bool = False
) -> DeepeningDecision:
    """``gains`` : le gain marginal de chaque round déjà terminé, dans l'ordre.

    #3863.4 — un round stérile ne ferme PAS le tour tant qu'une contradiction
    déterminante reste ouverte ET que le round de résolution n'a pas encore été
    dépensé : UN round de plus, jamais deux (``conflict_pass_spent``) — la
    profondeur ne devient pas une boucle (le plafond de rounds du tour reste
    maître). Sans contradiction ouverte, le gain nul arrête comme avant."""
    if not gains:
        return DeepeningDecision(False, DeepeningPass.LOCAL_CONTEXT, "start")
    if gains[-1] < MIN_MARGINAL_GAIN:
        if open_conflict and not conflict_pass_spent:
            return DeepeningDecision(False, DeepeningPass.CONTRADICTION_RESOLUTION, "open_conflict_zero_gain")
        return DeepeningDecision(True, None, "marginal_gain")
    if open_conflict:
        return DeepeningDecision(False, DeepeningPass.CONTRADICTION_RESOLUTION, "open_conflict")
    if len(gains) >= len(DeepeningPass):
        return DeepeningDecision(True, None, "passes_exhausted")
    return DeepeningDecision(False, DeepeningPass(len(gains)), "next_level")


def has_open_conflict(outputs: Iterable[Any]) -> bool:
    """Une contradiction OUVERTE (`resolvedBy` absent ou `unresolved`) dans ce
    que les outils ont rendu — `data_conflicts` d'un compte ou `conflicts` d'un
    contact (#190.1/#190.2)."""
    return any(_scan(output) for output in outputs)


def _scan(node: Any) -> bool:
    if isinstance(node, dict):
        for key, value in node.items():
            if key in ("conflicts",) and isinstance(value, list):
                if any(isinstance(c, dict) and c.get("resolvedBy", "unresolved") == "unresolved" for c in value):
                    return True
            elif _scan(value):
                return True
        return False
    if isinstance(node, list):
        return any(_scan(item) for item in node)
    return False


#: #4421.7 / c126 — les outils dont la sortie EST le résultat attendu (une liste de comptes) : le tour est
#: arrivé, ce qui reste est la suite (analyses, contacts), pas du remplissage.
_RESULT_LISTS: dict[str, str] = {"find_accounts_for_talent": "accounts", "run_account_search": "items"}


def delivers_result(results: Iterable[tuple[Any, Any, Any]]) -> bool:
    """Ce round a-t-il rendu la LISTE demandée ? Alors aucun statut « Approfondissement — … » n'est annoncé avant
    le résultat : la personne lit UNE ligne d'annonce puis la carte, rien entre (c126, #4421.7). Le travail qui
    suit (analyses, contacts) continue, sans libellé de remplissage."""
    for call, output, _is_error in results:
        key = _RESULT_LISTS.get(getattr(call, "name", ""))
        if key and isinstance(output, dict) and not output.get("error") and output.get(key):
            return True
    return False
