"""#3695.3 — le bloc « signaux » du prompt de message, honnête sur l'âge.

Le prompt appelait « SIGNAUX RÉCENTS (source d'accroche prioritaire) » les cinq
premiers signaux du dossier, quel que soit leur âge : un recrutement de 2024
pouvait ouvrir un message comme une actualité. Ici l'âge se RECALCULE à la date
du jour depuis ``date`` (le ``freshness`` stocké à l'analyse peut avoir vieilli)
avec la MÊME règle que le reste du produit (``signal_freshness``, fenêtre par
type) — jamais un second calcul. Un signal non daté reste « non daté », jamais
supposé récent.

Sans signal ancien ou non daté, le rendu est celui d'avant, à l'octet près.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any

from app.services.signal_freshness import TEMPORAL_RECENT, TEMPORAL_UNDATED, classify_temporal_status

_MAX_SIGNALS = 5


def render_message_signals(recent_signals: Sequence[Any] | None, *, today: date | None = None) -> str:
    """Le bloc signaux du prompt ; ``""`` quand il n'y a rien."""
    if not recent_signals:
        return ""
    window = list(recent_signals[:_MAX_SIGNALS])
    recent: list[Any] = []
    aged: list[str] = []
    for signal in window:
        if not isinstance(signal, Mapping):
            recent.append(signal)
            continue
        status = classify_temporal_status(signal.get("date"), today=today, signal_type=signal.get("type"))
        if status == TEMPORAL_RECENT:
            recent.append(signal)
        else:
            aged.append(_aged_line(signal, undated=status == TEMPORAL_UNDATED))
    parts: list[str] = []
    if recent:
        parts.append(f"\nSIGNAUX RÉCENTS (source d'accroche prioritaire) :\n{recent!s}")
    if aged:
        parts.append(
            "\nSIGNAUX ANCIENS OU NON DATÉS (ne les présente JAMAIS comme récents ; "
            "si tu en cites un, donne sa date, par exemple « en 2024 », ou n'en cite pas) :\n" + "\n".join(aged)
        )
    return "".join(parts)


def _aged_line(signal: Mapping[str, Any], *, undated: bool) -> str:
    text = " ".join(str(signal.get("signal") or "").split())
    when = "non daté" if undated else f"daté {signal.get('date')}"
    return f"- {text} ({when})"
