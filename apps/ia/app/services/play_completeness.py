"""Complétude d'une reco/play — méthode SalesConnect (roadmap §14).

DoD : « toute reco indique : signal, preuve, contact, action, message, risque ».
Une reco n'est ACTIONNABLE que si elle porte ces 6 champs ET que sa ``preuve`` est
reliée à une source RÉELLE (non vide, non faible/reconstruite). ``evaluate_play_
completeness`` rend un verdict déterministe ``{status, missing, hasFoundedEvidence,
requiredFields}`` :

- ``complete`` — les 6 champs sont là et la preuve est fondée → play actionnable.
- ``faible``   — un champ manque OU la preuve n'est pas fondée → play signalé
  non-actionnable, JAMAIS supprimé (cohérent avec la logique weak-source, Théo #2).

Aucune preuve n'est jamais fabriquée ici : le juge ne fait que LIRE ce que
``_plays`` a pu sourcer. Réutilisable (plays, futur chatbot / mémoire continue)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.services.source_quality import is_weak_source

# Les 6 champs SalesConnect → la clé du play (aliasée) qui porte chacun.
# ``signal``/``contact``/``action``/``message``/``risque`` existaient déjà sur le
# play ; ``preuve`` est le champ ajouté (la source citée du signal).
SALESCONNECT_FIELDS: tuple[tuple[str, str], ...] = (
    ("signal", "painSignal"),
    ("preuve", "preuve"),
    ("contact", "targetContact"),
    ("action", "firstAction"),
    ("message", "readyMessage"),
    ("risque", "risk"),
)

# Placeholders posés par ``_plays`` quand un maillon n'a pas pu être sourcé (règle
# des 70 % — on l'affiche explicitement plutôt que de l'inventer, §6/§8).
_PLACEHOLDERS = {
    "",
    "à qualifier",
    "a qualifier",
    "à identifier",
    "a identifier",
    "à définir",
    "a definir",
    "à préciser",
    "a preciser",
    "non identifié",
    "non identifie",
}


def _is_missing_text(value: object) -> bool:
    """A text link is missing when empty or a 70%-rule placeholder."""
    return str(value or "").strip().lower() in _PLACEHOLDERS


def _founded_evidence(preuve: object) -> bool:
    """A ``preuve`` is FOUNDED when it carries a real source — non-empty and not a
    weak/AI-reconstructed one (Théo #2). Robust to a preuve dict that didn't
    pre-compute ``weak`` : re-derive it from ``source_quality`` on the source."""
    if not isinstance(preuve, Mapping):
        return False
    source = str(preuve.get("source") or "").strip()
    if not source:
        return False
    weak = preuve.get("weak")
    if weak is None:
        weak = is_weak_source(source)
    return not weak


def evaluate_play_completeness(play: Mapping[str, Any]) -> dict[str, Any]:
    """SalesConnect completeness verdict for one play (roadmap §14).

    ``complete`` iff the 6 fields are present AND the ``preuve`` is founded on a
    real source; otherwise ``faible`` with the missing field labels listed. Never
    mutates or drops the play — it only exposes the status so a weak reco can be
    badged rather than silently shipped as a fact."""
    missing: list[str] = []
    for label, key in SALESCONNECT_FIELDS:
        value = play.get(key)
        if label == "preuve":
            if not _founded_evidence(value):
                missing.append(label)
        elif value is None or _is_missing_text(value):
            missing.append(label)
    return {
        "status": "complete" if not missing else "faible",
        "missing": missing,
        "hasFoundedEvidence": _founded_evidence(play.get("preuve")),
        "requiredFields": [label for label, _ in SALESCONNECT_FIELDS],
    }
