"""The 5 statuts de vérité (V1-vendable cadrage §4).

A dossier must never present a hypothesis as a fact. Every displayed element
carries exactly one epistemic status, each with a fixed front label:

    Fait          — source identifiable non-registre (web/presse, contact Apollo…)
    Registre      — donnée officielle d'un registre (Pappers/INSEE/INPI/BODACC)
    Signal        — info publique qui peut indiquer qqch mais ne suffit pas seule
    Hypothèse     — interprétation métier de l'IA, à valider
    Recommandation— action conseillée
    Risque        — point qui peut casser la stratégie

This module is the single source of truth for the vocabulary + the deterministic
mapping from an output category to its status, so the API, dashboard and web front
badge each block identically. The front rendering is Mattéo's; this produces the
status + label metadata he binds to.
"""

from __future__ import annotations

# Canonical status keys (lowercase, ascii — stable across langs / storage).
FAIT = "fait"
REGISTRE = "registre"  # 7th (Théo #1) : donnée officielle registre, distincte du fait web.
SIGNAL = "signal"
HYPOTHESE = "hypothese"
RECOMMANDATION = "recommandation"
RISQUE = "risque"
INCONNU = "inconnu"  # 6th status (01_METHOD_CORE §6): data not (yet) determinable.

TRUTH_STATUSES: tuple[str, ...] = (FAIT, REGISTRE, SIGNAL, HYPOTHESE, RECOMMANDATION, RISQUE, INCONNU)

# Exact front labels from the cadrage (§4).
FRONT_LABEL: dict[str, str] = {
    FAIT: "Fait — source visible",
    REGISTRE: "Donnée registre — officielle (Pappers/INSEE)",
    SIGNAL: "Signal détecté — à interpréter",
    HYPOTHESE: "Hypothèse Bellum — à valider",
    RECOMMANDATION: "Recommandation Bellum",
    RISQUE: "Risque à vérifier",
    INCONNU: "Inconnu — donnée manquante",
}

# Deterministic output-category → status. The category keys are the logical blocks
# the front renders (not raw field names) — one badge per block.
_CATEGORY_STATUS: dict[str, str] = {
    # Faits — sourced firmographics / observed data (web / presse / Apollo).
    "identity": FAIT,
    "detected_tech_stack": FAIT,
    "contact_identity": FAIT,  # name / title / entity / email (Apollo)
    # Registre — donnée officielle d'un registre (Théo #1 : distinguer le registre
    # du fait web). Corporate graph Pappers, établissements INSEE, RNE INPI, BODACC.
    "entities": REGISTRE,
    "sites": REGISTRE,
    "beneficial_owners": REGISTRE,
    "legal_signals": REGISTRE,
    # Signaux — public, not yet a conclusion.
    "recent_signals": SIGNAL,
    "budget_signals": SIGNAL,
    "it_job_signals": SIGNAL,
    "news": SIGNAL,
    # Hypothèses — AI interpretation / inference.
    "qualified_hypotheses": HYPOTHESE,
    "organigramme": HYPOTHESE,  # inferred org chart — never the official one
    "entity_zones": HYPOTHESE,  # inferred prioritisation
    "priority_score": HYPOTHESE,
    "business_description": HYPOTHESE,
    "decision_role": HYPOTHESE,  # inferred from title
    # Recommandations — advised actions.
    "score_verdict": RECOMMANDATION,  # GO/PRUDENT/STOP = a call to act or not
    "angles": RECOMMANDATION,
    "action_plan": RECOMMANDATION,
    "offers": RECOMMANDATION,
    "quick_wins": RECOMMANDATION,
    "messages": RECOMMANDATION,
    "next_step": RECOMMANDATION,
    # Risques — what can break the strategy.
    "risks": RISQUE,
    "competitors": RISQUE,  # an incumbent ESN is a risk to defuse
}

# Back-compat with the old 2-tag firmo system (sources.py: PUBLIC / HYPOTHÈSE).
_LEGACY_TAG = {"PUBLIC": FAIT, "HYPOTHÈSE": HYPOTHESE, "HYPOTHESE": HYPOTHESE}


def status_for_category(category: str) -> str | None:
    """The truth status of an output category, or None if unmapped."""
    return _CATEGORY_STATUS.get(category)


def normalise_status(raw: str | None) -> str | None:
    """Map a raw status/legacy tag to a canonical status, or None."""
    if not raw:
        return None
    t = raw.strip().lower()
    if t in TRUTH_STATUSES:
        return t
    return _LEGACY_TAG.get(raw.strip().upper())


def front_label(status: str | None) -> str:
    """The exact front label for a status (empty for unknown)."""
    return FRONT_LABEL.get(normalise_status(status) or "", "")


def legend() -> list[dict[str, str]]:
    """The 5 statuses + labels, in canonical order — for a front/contract legend."""
    return [{"status": s, "label": FRONT_LABEL[s]} for s in TRUTH_STATUSES]


def category_status_map() -> dict[str, dict[str, str]]:
    """category → {status, label} for every mapped output block. Emitted into the
    analysis output so the front badges each section from one deterministic source."""
    return {cat: {"status": st, "label": FRONT_LABEL[st]} for cat, st in _CATEGORY_STATUS.items()}
