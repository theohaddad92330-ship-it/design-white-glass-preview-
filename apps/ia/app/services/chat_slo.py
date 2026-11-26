"""#2441.4 — LES SLO DE STREAMING DU CHAT (LAU-FINAL-155).

L'issue nomme trois seuils : accusé de réception < 500 ms, premier statut
< 1,5 s, réponse < 10 s en P95. Ce module tient les DEUX premiers, qui se
mesurent PAR TOUR — le troisième est une statistique de POPULATION (un
centile sur beaucoup de tours), pas la propriété d'un tour seul ; il reste à
faire (voir la ligne #2441.4 du registre pour ce qui manque : un agrégat sur
plusieurs tours, pas encore posé).

Une valeur non mesurée n'est jamais lue « dans les clous » : elle sort du
récapitulatif, entièrement absente, plutôt que de fabriquer un verdict sur
rien (doctrine « non mesuré ≠ 0 »).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import TypedDict

#: Les trois seuils nommés par #2441.4 — un seul endroit (GA-26). Le troisième
#: (`responseP95`) est ici pour mémoire : rien dans ce module ne le calcule
#: encore (voir le docstring du module).
CHAT_SLO_THRESHOLDS_MS: dict[str, int] = {
    "ack": 500,
    "firstStatus": 1500,
    "responseP95": 10_000,
}

#: Les deux étapes posées par l'API AVANT le service IA (`ChatTurnClock`,
#: `chat-turn-trace.ts`) — le délai perçu comme « mon message est parti » avant
#: que Laura ne commence à travailler.
_ACK_STAGES = ("api.quota", "api.context")


class _SloVerdict(TypedDict):
    ms: int
    sloMs: int
    breached: bool


def ack_ms_from_stages(stage_ms: Mapping[str, int]) -> int | None:
    """L'« ack » : la somme des étapes API mesurées AVANT tout appel modèle.

    Les DEUX étapes doivent être connues — une somme partielle (une seule des
    deux) mentirait sur ce qui a vraiment été mesuré, donc reste `None`.
    """
    values = [stage_ms.get(stage) for stage in _ACK_STAGES]
    if any(value is None for value in values):
        return None
    return sum(value for value in values if value is not None)


def _verdict(value_ms: int | None, threshold_ms: int) -> _SloVerdict | None:
    if value_ms is None:
        return None
    return {"ms": value_ms, "sloMs": threshold_ms, "breached": value_ms > threshold_ms}


def turn_slo_summary(*, ack_ms: int | None, first_status_ms: int | None) -> dict[str, _SloVerdict]:
    """Le verdict SLO d'UN tour — clés absentes pour tout ce qui n'a pas été
    mesuré (GA-18), jamais une valeur devinée ni un « dans les clous » par défaut."""
    summary: dict[str, _SloVerdict] = {}
    ack = _verdict(ack_ms, CHAT_SLO_THRESHOLDS_MS["ack"])
    if ack is not None:
        summary["ack"] = ack
    first_status = _verdict(first_status_ms, CHAT_SLO_THRESHOLDS_MS["firstStatus"])
    if first_status is not None:
        summary["firstStatus"] = first_status
    return summary


__all__ = ["CHAT_SLO_THRESHOLDS_MS", "ack_ms_from_stages", "turn_slo_summary"]
