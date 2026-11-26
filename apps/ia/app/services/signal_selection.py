"""Sélection déterministe des signaux — ce qui change la décision, pas du volume (#3668.7).

Le prompt ``bellum_signals`` pose la règle (programme général = contexte, jamais
un homonyme). Une règle de prompt n'est pas une garantie : ce module la tient
APRÈS le modèle, sans appel LLM, sur la sortie réelle.

Trois lectures, aucune ne SUPPRIME un signal (on archive, on ne supprime pas) :

- **Entité** — un signal qui nomme une AUTRE entité (un homonyme écarté, une
  filiale sœur sur une demande ciblée) sans nommer la cible est rangé en
  ``context`` avec sa raison. Un signal qui ne nomme personne reste
  ``unverified`` : l'absence de nom n'est pas une preuve contre lui.
- **Programme / budget** — un programme général (« Climat », « Ambition
  2026-2030 ») sans chantier, interlocuteur ou expertise reconnaissable est du
  contexte ; un budget global n'est ni un budget de prestation ni une enveloppe
  accessible. Un signal DÉFAVORABLE (réorganisation, incident, gel documenté)
  reste toujours en tête : il change la décision.
- **Doublons** — deux formulations du même fait (même type, même année, mots
  quasi identiques) ne comptent qu'une fois ; les sources s'additionnent.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence

from .text_norm import normalize_name

ROLE_LEAD = "lead"
ROLE_CONTEXT = "context"

ENTITY_TARGET = "target"
ENTITY_OTHER = "other_entity"
ENTITY_UNVERIFIED = "unverified"

#: Types défavorables : ils changent la décision, jamais rétrogradés.
_UNFAVOURABLE_TYPES = frozenset({"incident", "restructuration", "regulation"})
_UNFAVOURABLE_RE = re.compile(r"\b(r[ée]organisation|gel|restructuration|plan\s+social|difficult[ée]s?|incident|cyberattaque)\b", re.I)

_GENERAL_PROGRAM_RE = re.compile(
    r"\b(climat|ambition\s+20\d{2}|plan\s+strat[ée]gique|feuille\s+de\s+route|raison\s+d.[êe]tre|rse|d[ée]veloppement\s+durable|programme\s+g[ée]n[ée]ral)\b",
    re.I,
)
_ACTIONABLE_RE = re.compile(
    r"\b(appel\s+d.offres?|march[ée]|lots?\s*\d*|migration|erp|cloud|data|dsi|recrut\w*|poste|nomm\w*|prestation|ing[ée]nieri\w*|"
    r"externalis\w*|refonte|mission|chantier|sous-traitan\w*|interlocuteur|directeur)\b",
    re.I,
)
_GLOBAL_AMOUNT_RE = re.compile(r"\b\d+(?:[.,]\d+)?\s*(?:milliards?|md)\b", re.I)
_SERVICE_BUDGET_RE = re.compile(r"\b(prestation|it\b|informatique|num[ée]rique|digital|externalis\w*|d[ée]penses?\s+it)\b", re.I)

_NAME_MIN = 4
_DUP_JACCARD = 0.8


def _text(signal: Mapping[str, object]) -> str:
    return normalize_name(" ".join(str(signal.get(k) or "") for k in ("signal", "source", "salesImplication")))


def _names_in(text: str, name: str) -> bool:
    n = normalize_name(name)
    return len(n) >= _NAME_MIN and re.search(rf"(?<!\w){re.escape(n)}(?!\w)", text) is not None


def _tokens(text: str) -> frozenset[str]:
    return frozenset(w for w in re.findall(r"[a-z0-9]{3,}", text))


def _year(signal: Mapping[str, object]) -> str:
    m = re.search(r"(?:19|20)\d{2}", str(signal.get("date") or ""))
    return m.group(0) if m else ""


def _is_dup(a: Mapping[str, object], b: Mapping[str, object]) -> bool:
    if str(a.get("type") or "") != str(b.get("type") or "") or _year(a) != _year(b):
        return False
    ta, tb = _tokens(normalize_name(a.get("signal"))), _tokens(normalize_name(b.get("signal")))
    if not ta or not tb:
        return False
    return len(ta & tb) / len(ta | tb) >= _DUP_JACCARD


def _other_entity(text: str, target: str, others: Sequence[str]) -> str | None:
    if _names_in(text, target):
        return None
    tn = normalize_name(target)
    for other in others:
        on = normalize_name(other)
        if not on or on == tn or on in tn or tn in on:
            continue
        if _names_in(text, other):
            return other
    return None


def select_signals(
    signals: Iterable[object] | None,
    *,
    target: str,
    other_entities: Sequence[str] = (),
) -> tuple[list[dict[str, object]], dict[str, int]]:
    """Rend ``(signaux annotés, bilan)``. Jamais de perte : ``len(sorties) + fusionnés == len(entrées)``.

    Chaque signal gagne ``selectionRole`` (lead|context), ``entityMatch`` et, quand
    il est rétrogradé, ``selectionReason`` — la phrase que l'écran affiche.
    """
    kept: list[dict[str, object]] = []
    merged = 0
    for raw in signals or []:
        if not isinstance(raw, Mapping):
            continue
        sig = dict(raw)
        twin = next((k for k in kept if _is_dup(k, sig)), None)
        if twin is not None:
            merged += 1
            extra = str(sig.get("source") or "").strip()
            known = [s for s in str(twin.get("source") or "").split(" · ") if s]
            if extra and extra not in known:
                twin["source"] = " · ".join([*known, extra])
            continue
        kept.append(sig)

    context = other = 0
    for sig in kept:
        text = _text(sig)
        stype = str(sig.get("type") or "").lower()
        favourable_blind = stype not in _UNFAVOURABLE_TYPES and not _UNFAVOURABLE_RE.search(text)
        sig["selectionRole"] = ROLE_LEAD
        sig["entityMatch"] = ENTITY_TARGET if _names_in(text, target) else ENTITY_UNVERIFIED
        elsewhere = _other_entity(text, target, other_entities)
        if elsewhere:
            sig["entityMatch"] = ENTITY_OTHER
            sig["selectionRole"] = ROLE_CONTEXT
            sig["selectionReason"] = f"Concerne {elsewhere}, pas {target} — contexte, à vérifier avant de s'en servir."
            other += 1
        elif favourable_blind and _GENERAL_PROGRAM_RE.search(text) and not _ACTIONABLE_RE.search(text):
            sig["selectionRole"] = ROLE_CONTEXT
            sig["selectionReason"] = "Programme général : aucun chantier, interlocuteur ni expertise nommé — contexte, pas un besoin confirmé."
        elif favourable_blind and _GLOBAL_AMOUNT_RE.search(text) and not _SERVICE_BUDGET_RE.search(text):
            sig["selectionRole"] = ROLE_CONTEXT
            sig["selectionReason"] = "Budget global : ni budget de prestation ni enveloppe accessible à un prestataire."
        if sig["selectionRole"] == ROLE_CONTEXT:
            context += 1
    return kept, {"total": len(kept), "context": context, "otherEntity": other, "duplicatesMerged": merged}
