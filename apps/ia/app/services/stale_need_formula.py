"""#3243.r41 (recette prod 17/10, ARCHI LOGICIEL — signaux archivés 2020-2022) — la formule « besoin à confirmer »
rendue DÉTERMINISTE.

Le détecteur ``commercial_challenge.detect_stale_signals`` posait la formule dans le PROMPT (r40) ; le modèle écrivait
quand même « besoin… confirmé ». Une consigne de prompt n'est pas une garantie : la ligne est donc bâtie ICI, du même
détecteur (GA-26), et posée sur la réponse par le code — le texte du modèle ne la remplace jamais."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from app.services.commercial_challenge import _named_dated_signal, detect_stale_signals

_FORMULA = re.compile(r"besoin\s+à\s+confirmer", re.IGNORECASE)
# « aucun besoin confirmé », « pas de besoin client confirmé », « besoin confirmé » seul (pas déjà nié ni « à confirmer »).
_WRONG = re.compile(
    r"(?:\b(?:aucun|aucune|pas de|sans)\s+besoins?(?:\s+client)?\s+confirmés?\b|(?<!à )(?<!non )\bbesoins?\s+confirmés?\b)",
    re.IGNORECASE,
)

_LINES = {
    "fr": "{named} — tous les signaux connus sur ce compte sont archivés : le besoin n'est pas établi comme actuel.",
    "en": "{named} — every known signal on this account is archived: the need is not established as current.",
}


def stale_need_line(analysis: Mapping[str, Any] | None, language: str = "fr") -> str | None:
    """``Besoin à confirmer : « titre », daté 2021-03-14 — …`` quand TOUS les signaux sont archivés, sinon ``None``."""
    analysis = analysis if isinstance(analysis, Mapping) else None
    if detect_stale_signals(analysis) is None:
        return None
    a = analysis or {}
    signals = a.get("recentSignals") or a.get("recent_signals") or []
    named = _named_dated_signal([s for s in signals if isinstance(s, Mapping)]).strip(" ()")
    named = named[:1].upper() + named[1:]
    if language == "en":
        named = named.replace("Besoin à confirmer", "Need to confirm").replace("daté", "dated")
    return _LINES["en" if language == "en" else "fr"].format(named=named)


def apply_stale_need_formula(reply: str, line: str | None) -> str:
    """La formule corrigée dans le texte (« besoin confirmé » ⇒ « besoin à confirmer »), et la ligne posée en TÊTE
    quand la réponse ne la porte pas (un challenge actif ouvre la réponse). ``line`` ``None`` ⇒ réponse intacte."""
    if not line or not reply:
        return reply
    fixed = _WRONG.sub("besoin à confirmer", reply)
    if _FORMULA.search(fixed):
        return fixed
    return f"{line}\n\n{fixed}"
