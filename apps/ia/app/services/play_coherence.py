"""Juge de cohérence d'un play / offre (retour Thales 2026-07-07).

Un play doit raconter UNE histoire : périmètre → signal → offre → contact →
action → message → preuve → risque pointent tous le même compte et le même
interlocuteur. Le bug Thales : l'action ("Appeler Nicolas") nomme un contact
autre que le contact prioritaire du play ("Remy"), parce que ``firstAction`` est
tirée d'un quick-win / next-best-action de niveau compte, pas liée au contact
choisi. ``enforce_play_coherence`` détecte ce décalage, RECADRE l'action sur le
contact du play, et signale les maillons manquants (offre / contact non
déterminés) — déterministe, pas de LLM.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from app.services.text_norm import normalize_name

# Values that mean "not sourced" (70% rule) — a gap in the chain, not a name.
_PLACEHOLDERS = {"", "a qualifier", "a identifier", "a definir", "a preciser", "non identifie"}
_MIN_NAME_TOKEN = 3


def _norm(v: object) -> str:
    return normalize_name(v)


def _is_placeholder(v: object) -> bool:
    return _norm(v) in _PLACEHOLDERS


def _name_tokens(name: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", _norm(name)) if len(t) >= _MIN_NAME_TOKEN}


def _contacts_named_in(text: object, contacts: Sequence[Mapping[str, Any]]) -> set[str]:
    """Full names (raw) of the known contacts referenced in ``text`` — matched on
    any distinctive name token (first name or surname), so "Appeler Nicolas"
    binds the contact "Nicolas Martin"."""
    text_tokens = {t for t in re.split(r"[^a-z0-9]+", _norm(text)) if len(t) >= _MIN_NAME_TOKEN}
    named: set[str] = set()
    for c in contacts:
        full = str(c.get("fullName") or c.get("full_name") or "")
        if full and (_name_tokens(full) & text_tokens):
            named.add(full)
    return named


def _coherent_action(play: Mapping[str, Any]) -> str:
    """A first action that unambiguously targets the play's own contact."""
    contact = str(play.get("targetContact") or "").strip()
    role = str(play.get("targetContactRole") or "").strip()
    angle = play.get("angle")
    suffix = (
        f" — angle : {angle}"
        if angle and not _is_placeholder(angle)
        else (f" sur {play.get('perimeter')}" if not _is_placeholder(play.get("perimeter")) else "")
    )
    role_part = f" ({role})" if role else ""
    return f"Contacter {contact}{role_part}{suffix}.".replace(" .", ".")


def enforce_play_coherence(
    play: Mapping[str, Any], contacts: Sequence[Mapping[str, Any]]
) -> dict[str, Any]:
    """Return the play with a ``coherence`` verdict and, when needed, a repaired
    ``firstAction``. ``status`` is:

    - ``coherent``   — the chain is consistent.
    - ``repaired``   — the action targeted another contact and was recadré sur le
                       contact prioritaire (the only auto-fix).
    - ``incoherent`` — a maillon manquant remains (offre / contact non déterminé).
    """
    out = dict(play)
    issues: list[str] = []
    repaired = False

    target = str(play.get("targetContact") or "")
    target_is_real = not _is_placeholder(target)

    # 1. Action targeting a DIFFERENT known contact than the play's own → recadrer.
    if target_is_real:
        referenced = _contacts_named_in(play.get("firstAction"), contacts)
        others = {n for n in referenced if _norm(n) != _norm(target)}
        if others:
            issues.append(
                f"L'action nommait {', '.join(sorted(others))} au lieu du contact "
                f"prioritaire {target} — recadrée sur {target}."
            )
            out["firstAction"] = _coherent_action(play)
            repaired = True

    # 2. Missing links in the chain (honnêteté : ne pas présenter un play troué).
    if not target_is_real:
        issues.append("Contact cible non identifié — play incomplet.")
    if _is_placeholder(play.get("esnOffer")):
        issues.append("Offre non déterminée pour ce périmètre.")
    if _is_placeholder(play.get("painSignal")):
        issues.append("Signal / douleur non qualifié.")

    unrepaired = len(issues) - (1 if repaired else 0)
    if unrepaired > 0:
        status = "incoherent"
    elif repaired:
        status = "repaired"
    else:
        status = "coherent"

    out["coherence"] = {"status": status, "issues": issues}
    return out
