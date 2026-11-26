"""Provenance + complétude des OFFRES commerciales (roadmap §14).

DoD : « chaque offre affiche : estimation Bellum, hypothèse, éditable, reliée
aux tarifs du client ». Aujourd'hui les EJM/durées des ``offersToPropose``
sortent du LLM en texte libre, sans provenance. Ce module — calqué sur le
pattern preuve/completeness des plays (#466 : ``_play_evidence`` +
``play_completeness``) — structure chaque offre en :class:`CommercialOffer` :

- l'estimation d'effort/durée est TOUJOURS marquée hypothèse (``estimate=True``
  + ``hypothesis`` = le raisonnement en clair). Rien à estimer → champs ``None``,
  JAMAIS un chiffre inventé (§8) ;
- ``editable=True`` (constante — signal UI : l'offre est modifiable) ;
- ``rateBasis=None`` par défaut : le ``estimatedTJM`` du LLM n'est JAMAIS repris
  comme base tarifaire — « à relier aux tarifs du client » (aucune grille dans
  ``AnalysisProfileData`` aujourd'hui → placeholder éditable) ;
- la ``provenance`` est reliée aux entrées SOURCÉES de la recherche
  (``recentSignals``/``budgetSignals`` — le même registre que les plays), jamais
  fabriquée ; une source faible/reconstruite est gardée mais ``weak=True``.

``evaluate_offer_completeness`` rend le verdict déterministe
``{status: complete|faible, missing, hasFoundedEvidence, requiredFields}`` :
une offre sans estimation, sans hypothèse ou sans provenance fondée est marquée
``faible`` (jamais supprimée) — même logique que ``play_completeness``."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.models.outputs.plan import CommercialOffer
from app.services.source_quality import is_weak_source
from app.services.text_norm import normalize_name

# Les 3 exigences DoD d'une offre (roadmap §14). Le volet tarifaire n'y figure
# PAS : ``rateBasis`` est un placeholder éditable (aucune grille client connue),
# son absence est l'état honnête, pas un manque.
OFFER_REQUIRED_FIELDS: tuple[str, ...] = ("estimation", "hypothese", "provenance")

# Placeholders 70 % (accent-free — comparés via ``normalize_name``) : un champ
# qui les porte est traité comme VIDE, pas comme une estimation.
_PLACEHOLDER_PREFIXES: tuple[str, ...] = (
    "a qualifier",
    "a identifier",
    "a definir",
    "a preciser",
    "a estimer",
    "non identifie",
    "non precise",
    "inconnu",
    "n/a",
    "tbd",
)


def _clean_text(value: object) -> str | None:
    """Trimmed text, ``None`` when empty or a 70%-rule placeholder — a « à
    définir » n'est pas une estimation (§6/§8)."""
    s = str(value or "").strip()
    if not s:
        return None
    normalized = normalize_name(s)
    if normalized.startswith(_PLACEHOLDER_PREFIXES):
        return None
    return s


def _founded_provenance(provenance: object) -> bool:
    """Une provenance est FONDÉE quand elle cite une source réelle — non vide et
    non faible/reconstruite (Théo #2). Même sémantique que ``_founded_evidence``
    de play_completeness ; re-dérive ``weak`` si absent."""
    if not isinstance(provenance, Mapping):
        return False
    source = str(provenance.get("source") or "").strip()
    if not source:
        return False
    weak = provenance.get("weak")
    if weak is None:
        weak = is_weak_source(source)
    return not weak


def evaluate_offer_completeness(offer: Mapping[str, Any]) -> dict[str, Any]:
    """Verdict de complétude d'une offre structurée (calque play_completeness).

    ``complete`` ssi l'offre porte une estimation (effort OU durée), une
    hypothèse en clair ET une provenance fondée sur une source réelle ; sinon
    ``faible`` avec les manques listés. Ne mute ni ne supprime jamais l'offre —
    une estimation sans justification est badgée, pas présentée comme un fait."""
    missing: list[str] = []
    if not (_clean_text(offer.get("estimatedEffort")) or _clean_text(offer.get("durationEstimate"))):
        missing.append("estimation")
    if not _clean_text(offer.get("hypothesis")):
        missing.append("hypothese")
    founded = _founded_provenance(offer.get("provenance"))
    if not founded:
        missing.append("provenance")
    return {
        "status": "complete" if not missing else "faible",
        "missing": missing,
        "hasFoundedEvidence": founded,
        "requiredFields": list(OFFER_REQUIRED_FIELDS),
    }


def bind_offer_evidence(
    offer_text: str,
    recent_signals: list[Any],
    budget_signals: list[Any],
    index: int,
) -> dict[str, Any] | None:
    """Relie l'offre à une entrée RÉELLEMENT sourcée de la recherche — le même
    registre de provenance que ``_play_evidence`` (roadmap §14).

    Cherche dans ``recentSignals`` + ``budgetSignals`` (les seules entrées qui
    portent une citation ``source``, et souvent une ``date``) celle qui recouvre
    le mieux le texte de l'offre (titre + douleur + signaux cités par le LLM),
    sinon la i-ème entrée sourcée (provenance distincte par offre). Retourne
    ``None`` — JAMAIS une citation fabriquée (§8) — quand aucune entrée ne porte
    de source réelle. Une source faible/reconstruite est gardée mais flaguée
    ``weak=True`` pour que la complétude marque l'offre ``faible`` (Théo #2)."""
    sourced = [
        s
        for s in (list(recent_signals) + list(budget_signals))
        if isinstance(s, dict) and str(s.get("source") or "").strip()
    ]
    if not sourced:
        return None
    tokens = {t for t in normalize_name(offer_text).split() if len(t) >= 4}
    chosen: dict[str, Any] | None = None
    if tokens:
        best_score = 0
        for entry in sourced:
            haystack = normalize_name(f"{entry.get('signal') or ''} {entry.get('source') or ''}")
            score = sum(1 for t in tokens if t in haystack)
            if score > best_score:
                chosen, best_score = entry, score
    if chosen is None:
        chosen = sourced[index] if index < len(sourced) else sourced[0]
    source = str(chosen.get("source") or "").strip()
    if not source:
        return None
    return {
        "source": source,
        # recentSignals peuvent porter une url ; budgetSignals datent via `timeframe`.
        "url": chosen.get("url") or None,
        "date": chosen.get("date") or chosen.get("timeframe") or None,
        "signal": str(chosen.get("signal") or "").strip(),
        "weak": is_weak_source(source),
    }


def build_commercial_offers(
    offers_to_propose: list[Any],
    account_data: Mapping[str, Any],
) -> list[dict[str, Any]]:
    """Structure les ``offersToPropose`` (sortie LLM validée, dump aliasé) en
    :class:`CommercialOffer` typées — DÉTERMINISTE, aucun appel LLM, ADDITIF
    (la liste legacy reste intacte pour les consommateurs actuels).

    L'effort est dérivé des champs du modèle lui-même (``estimatedTeamSize`` ×
    ``estimatedDuration``), jamais recalculé/inventé ; le raisonnement vient de
    ``estimationHypothesis`` (demandé par le prompt) ; la provenance est reliée
    aux signaux sourcés de la recherche. Une offre sans justification ressort
    ``faible`` — badgée, jamais supprimée."""
    recent = [
        s
        for s in (account_data.get("recentSignals") or account_data.get("recent_signals") or [])
        if isinstance(s, dict)
    ]
    budget = [
        s
        for s in (account_data.get("budgetSignals") or account_data.get("budget_signals") or [])
        if isinstance(s, dict)
    ]

    structured: list[dict[str, Any]] = []
    for i, raw in enumerate(offers_to_propose):
        if not isinstance(raw, Mapping):
            continue
        team = _clean_text(raw.get("estimatedTeamSize"))
        duration = _clean_text(raw.get("estimatedDuration"))
        # Effort = les propres champs du modèle, combinés lisiblement — pas un
        # chiffre recalculé. Rien d'estimable → None (jamais d'invention).
        effort = f"{team} × {duration}" if team and duration else team
        hints = " ".join(
            [
                str(raw.get("title") or ""),
                str(raw.get("painAddressed") or ""),
                *(str(s) for s in (raw.get("justifyingSignals") or []) if s),
            ]
        )
        offer: dict[str, Any] = {
            "title": str(raw.get("title") or "").strip(),
            "description": str(raw.get("pitch") or "").strip(),
            "targetContact": _clean_text(raw.get("targetContact")),
            "painAddressed": _clean_text(raw.get("painAddressed")),
            "estimatedEffort": effort,
            "durationEstimate": duration,
            "estimate": True,
            "hypothesis": _clean_text(raw.get("estimationHypothesis")),
            "editable": True,
            # JAMAIS de tarif inventé : le TJM du LLM n'est PAS repris comme
            # base tarifaire — rateBasis reste None tant que l'utilisateur ne
            # l'a pas relié à SA grille (placeholder éditable, DoD §14).
            "rateBasis": None,
            "provenance": bind_offer_evidence(hints, recent, budget, i),
        }
        offer["completeness"] = evaluate_offer_completeness(offer)
        structured.append(CommercialOffer.model_validate(offer).model_dump(by_alias=True))
    return structured
