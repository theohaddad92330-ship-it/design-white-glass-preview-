"""#2899 (#2443.10) — LE REJEU NOCTURNE DES ÉCHANTILLONS DE PRODUCTION ANONYMISÉS.

Décision Louis (11/10/2026) : les évals se rejouent chaque nuit, hors CI, désactivables, avec un plafond. Ce module
rejoue les DEMANDES anonymisées que les espaces ayant coché ont versées (`chat_prod_samples`, pont interne
`GET /internal/chat-eval-samples`) contre le prompt de Laura, puis lit chaque réponse avec les détecteurs
DÉTERMINISTES du dépôt (`chat_content_guards` : consigne de navigation manuelle, renvoi vers une recherche manuelle).

* **Hors CI** : aucun `test_` ne le lance ; le planificateur nocturne appelle ``python -m app.eval.chat_samples_replay``
  (comme ``app.eval.nightly``). Le rouge nocturne notifie.
* **Désactivé sans clé** : sans ``ANTHROPIC_API_KEY`` → no-op strict (zéro appel réseau, zéro modèle), statut
  ``not_configured``. ``CHAT_SAMPLES_REPLAY_ENABLED=false`` l'éteint même avec une clé.
* **Aucun outil** : le rejeu appelle le modèle SANS outils — il ne lit ni n'écrit aucune donnée d'espace. Il juge
  le respect des règles du prompt, pas des résultats d'outils.
* **Un échantillon non anonyme n'est jamais rejoué** (``screen_sample``) — il est compté, pas lu.
* **Plafond** : ``CHAT_SAMPLES_REPLAY_MAX`` demandes par nuit (défaut 20) ; le reste est NOMMÉ ``skipped``.
* **Une violation ne porte ni la question ni la réponse** : son rang dans l'échantillon et la règle franchie.
* **Pont éteint = non mesuré** (``unavailable``), jamais « aucune violation ».
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from typing import Any

from app.eval.chat_prod_samples import ProdSampleReport, ProdSampleStatus, load_prod_samples, screen_sample
from app.eval.chat_score_scorers import ChatTurn, score_turn
from app.services.chat_content_guards import (
    violates_manual_navigation_instruction,
    violates_manual_redirect_instruction,
)

ENABLED_ENV = "CHAT_SAMPLES_REPLAY_ENABLED"
MAX_ENV = "CHAT_SAMPLES_REPLAY_MAX"
DEFAULT_MAX_SAMPLES = 20

#: Sous ce score, une dimension est comptée « basse » dans le bilan nocturne.
LOW_SCORE = 0.5

Loader = Callable[[int], Awaitable[ProdSampleReport]]
PlayTurn = Callable[[str], Awaitable[str | None]]

#: Les détecteurs lus sur chaque réponse : (règle, détecteur). Un détecteur de plus s'ajoute ici, à UN endroit.
_DETECTORS: tuple[tuple[str, Callable[[str], bool]], ...] = (
    ("manual_navigation", violates_manual_navigation_instruction),
    ("manual_redirect", violates_manual_redirect_instruction),
)


def is_enabled() -> bool:
    return (os.environ.get(ENABLED_ENV) or "").strip().lower() not in ("false", "0", "no", "off")


def configured_max_samples() -> int:
    raw = (os.environ.get(MAX_ENV) or "").strip()
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_MAX_SAMPLES
    return value if value > 0 else DEFAULT_MAX_SAMPLES


@dataclass
class SamplesReplayOutcome:
    status: str  # disabled | not_configured | unavailable | ok | violations
    replayed: int = 0
    failed: int = 0
    skipped: int = 0
    not_anonymous: int = 0
    violations: list[dict[str, Any]] = field(default_factory=list)
    #: #2278.13 — par dimension : réponses évaluées / réponses sous `LOW_SCORE`. Ni question ni réponse. Un score bas
    #: se RAPPORTE, il ne fait pas le rouge nocturne (un juge déterministe ne décide pas seul).
    dimension_scores: dict[str, dict[str, int]] = field(default_factory=dict)

    @property
    def measured(self) -> bool:
        return self.status in ("ok", "violations")

    @property
    def exit_code(self) -> int:
        return 1 if self.violations else 0

    def as_dict(self) -> dict[str, Any]:
        return asdict(self) | {"measured": self.measured, "exit_code": self.exit_code}


async def _live_turn(text: str) -> str | None:
    """Une réponse du modèle au prompt de Laura, SANS outils. ``None`` = le tour a échoué."""
    from app.prompts.bellum_advisor import build_system_prompt
    from app.services.claude_service import call_claude
    from app.services.model_policy import model_for

    try:
        reply, _usage = await call_claude(
            build_system_prompt({}, {}, "", ""),
            text,
            response_model=None,
            max_tokens=800,
            prompt_name="chat_samples_replay",
            model=model_for("chat_samples_replay"),
        )
    except Exception:  # un tour raté se nomme, il ne fait jamais tomber la nuit
        return None
    return reply if isinstance(reply, str) else None


async def run_samples_replay(
    *,
    load: Loader | None = None,
    play_turn: PlayTurn | None = None,
    max_samples: int | None = None,
) -> SamplesReplayOutcome:
    if not (os.environ.get("ANTHROPIC_API_KEY") or "").strip():
        return SamplesReplayOutcome(status="not_configured")
    if not is_enabled():
        return SamplesReplayOutcome(status="disabled")

    cap = max_samples if max_samples is not None else configured_max_samples()
    report = await (load or load_prod_samples)(cap * 2)
    if report.status is not ProdSampleStatus.OK:
        return SamplesReplayOutcome(status="unavailable")

    play = play_turn or _live_turn
    out = SamplesReplayOutcome(status="ok")
    for rank, sample in enumerate(report.samples, start=1):
        if screen_sample(sample.text) is not None:
            out.not_anonymous += 1
            continue
        if out.replayed + out.failed >= cap:
            out.skipped += 1
            continue
        reply = await play(sample.text)
        if reply is None:
            out.failed += 1
            continue
        out.replayed += 1
        for rule, detector in _DETECTORS:
            if detector(reply):
                out.violations.append({"sample_rank": rank, "rule": rule})
        for dimension, result in score_turn(ChatTurn(user_message=sample.text, answer=reply)).scores.items():
            if result.score is None:
                continue
            tally = out.dimension_scores.setdefault(dimension.value, {"evaluated": 0, "low": 0})
            tally["evaluated"] += 1
            tally["low"] += 1 if result.score < LOW_SCORE else 0
    if out.violations:
        out.status = "violations"
    return out


def main() -> int:
    outcome = asyncio.run(run_samples_replay())
    print(json.dumps(outcome.as_dict(), ensure_ascii=False, indent=2))
    return outcome.exit_code


if __name__ == "__main__":
    sys.exit(main())
