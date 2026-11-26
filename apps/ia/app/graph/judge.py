"""IA v2 anti-hallucination Judge node — always in the graph, advisory.

Runs AFTER the plan phase — the single highest-value checkpoint, where the full
dossier (``research`` + ``contacts`` + ``classified_contacts`` + ``plan``) is on
state. It REVIEWS and FLAGS; it never rewrites, deletes or fabricates. The
verdict is advisory: it records issues + a confidence on state and NEVER blocks
completion (the graph still ends normally). A later increment can promote a
critical verdict to a hard no-go — deliberately kept out here (conservative).

Deterministic by design: rules over the assembled state, zero extra Claude call
(cost stays at 0, CI stays hermetic, NO FAKE). A Haiku-class LLM cross-check can
layer on top later behind its own switch — the model id is already routed
(``CLAUDE_HAIKU_MODEL``); this node deliberately does not call it.

Checks (each FLAGS, never mutates):
  1. grounding  — every hard fact present in research is sourced (tagged PUBLIC
                  or cited). An unsourced hard fact is the #1 hallucination
                  signal → ``critical``.
  2. scores     — confidence / gate / priority scores sit in their valid range
                  and are coherent with the gate decision → ``warning``.
  3. coherence  — the plan only addresses contacts that exist in the enriched
                  dossier (no invented interlocutor) → ``critical``.
  4. contacts   — enriched contacts look real (a name, not a bare placeholder)
                  → ``warning``.
  5. provenance — #4070.5 : aucune source nommée dans ce que le plan écrit à
                  l'utilisateur (fournisseur, système interne, registre public)
                  → ``critical``. Un fait se dit par sa nature et sa date.
  6. freshness  — #4070.5 : un fait ANCIEN du compte (> 90 jours) n'est pas
                  présenté comme récent → ``critical``. Une phrase qui porte son
                  âge ou sa date est datée, donc honnête.
"""

from __future__ import annotations

import logging
import re
import time
import unicodedata
from collections.abc import Mapping, Sequence
from typing import Any

from app.graph.state import AnalysisState
from app.services.analysis_account_facts import KIND_LABEL, age_phrase, iter_texts, normalize_account_facts

logger = logging.getLogger(__name__)

# Severity vocabulary. Only ``critical`` flips ``passed`` to False.
CRITICAL = "critical"
WARNING = "warning"

# Penalty each issue subtracts from the judge's confidence (starts at 1.0).
_PENALTY = {CRITICAL: 0.35, WARNING: 0.12}

# Hard firmographic facts that MUST be sourced when displayed. Mirrors the
# deterministic Quality Judge — an unsourced value here is a hallucination.
_SOURCED_FACT_FIELDS = ("siren", "revenue", "employees", "headquarters", "sector")

# Trust tag meaning "sourced / officially verifiable" (deck p.6).
_TAG_PUBLIC = "PUBLIC"

# Contact names that are placeholders, not real people — allowed in a plan
# (an honest "to be identified") but never counted as a real, grounded contact.
_PLACEHOLDER_CONTACTS = frozenset({"", "A IDENTIFIER", "A QUALIFIER", "A DEFINIR", "A PRECISER", "N/A", "INCONNU"})


def _present(v: Any) -> bool:
    return bool(v) and str(v).strip().lower() not in ("", "non identifié", "non précisé", "n/a", "inconnu")


def _norm(text: str) -> str:
    """Accent-stripped uppercase, for robust name matching (OUDÉA == OUDEA)."""
    decomposed = unicodedata.normalize("NFKD", str(text))
    return "".join(c for c in decomposed if not unicodedata.combining(c)).upper().strip()


def _camel(snake: str) -> str:
    head, *rest = snake.split("_")
    return head + "".join(w.capitalize() for w in rest)


def _tag(tags: Mapping[str, Any], field: str) -> str:
    """Trust tag for ``field`` — tags may be keyed camel or snake, try both."""
    return str(tags.get(field) or tags.get(_camel(field)) or "").upper()


def _contact_name(c: Any) -> str:
    """Best display name for a contact mapping (``fullName`` / first+last)."""
    if not isinstance(c, Mapping):
        return ""
    full = c.get("fullName") or c.get("full_name")
    if _present(full):
        return str(full).strip()
    first = str(c.get("firstName") or c.get("first_name") or "").strip()
    last = str(c.get("lastName") or c.get("last_name") or "").strip()
    return " ".join(p for p in (first, last) if p).strip()


def _issue(kind: str, severity: str, detail: str, *, phase: str) -> dict[str, str]:
    return {"type": kind, "severity": severity, "detail": detail, "phase": phase}


# ── individual checks — each returns the issues it found, never mutates ────────


def _check_grounding(research: Mapping[str, Any]) -> list[dict[str, str]]:
    """Hard facts displayed without a source → hallucination risk (critical)."""
    sources = research.get("sources") if isinstance(research.get("sources"), Mapping) else {}
    tags = sources.get("tags") if isinstance(sources.get("tags"), Mapping) else {}
    citations = sources.get("citations") if isinstance(sources.get("citations"), Mapping) else {}

    unsourced = [
        field
        for field in _SOURCED_FACT_FIELDS
        if _present(research.get(field)) and _tag(tags, field) != _TAG_PUBLIC and field not in citations
    ]
    if not unsourced:
        return []
    return [
        _issue(
            "fact_without_source",
            CRITICAL,
            f"Fait(s) affiché(s) sans source vérifiable : {', '.join(unsourced)}",
            phase="research",
        )
    ]


def _check_scores(research: Mapping[str, Any], gate: Mapping[str, Any]) -> list[dict[str, str]]:
    """Scores in range + coherent with the gate decision (warning)."""
    issues: list[dict[str, str]] = []

    conf = research.get("confidence")
    score = conf.get("score") if isinstance(conf, Mapping) else None
    if isinstance(score, (int, float)) and not (0 <= score <= 100):
        issues.append(
            _issue("score_out_of_range", WARNING, f"Score de confiance hors bornes [0,100] : {score}", phase="research")
        )

    gate_score = gate.get("score")
    if isinstance(gate_score, (int, float)) and not (0 <= gate_score <= 3):
        issues.append(
            _issue("score_out_of_range", WARNING, f"Score de gate hors bornes [0,3] : {gate_score}", phase="research")
        )

    # A no_go gate that nonetheless produced a plan is an internal contradiction.
    if gate.get("decision") == "no_go":
        issues.append(
            _issue(
                "incoherent_gate",
                WARNING,
                "Gate no_go mais phases aval exécutées — incohérence de routage.",
                phase="research",
            )
        )
    return issues


def _known_contact_names(contacts: Sequence[Any]) -> set[str]:
    return {_norm(name) for c in contacts if (name := _contact_name(c))}


_PLAN_CONTACT_KEYS = ("contact", "targetContact", "target_contact", "fullName", "full_name", "name")


def _iter_plan_contacts(plan: Mapping[str, Any]) -> list[str]:
    """Every person a plan action / quick-win / offer is addressed to."""
    names: list[str] = []
    action_plan = plan.get("actionPlan") or plan.get("action_plan") or {}
    phases = action_plan.get("phases") if isinstance(action_plan, Mapping) else []
    candidates: list[Any] = []
    for ph in phases or []:
        if isinstance(ph, Mapping):
            candidates += ph.get("actions") or []
    candidates += plan.get("quick_wins") or plan.get("quickWins") or []
    candidates += plan.get("offersToPropose") or plan.get("offers_to_propose") or []
    for item in candidates:
        if isinstance(item, Mapping):
            for key in _PLAN_CONTACT_KEYS:
                if _present(item.get(key)):
                    names.append(str(item[key]).strip())
                    break
    return names


def _check_coherence(contacts: Sequence[Any], plan: Mapping[str, Any]) -> list[dict[str, str]]:
    """Plan addresses only contacts that exist in the enriched dossier (critical).

    Empty when there are no enriched contacts to check against (no false flag);
    honest placeholders ("à identifier") are allowed.
    """
    known = _known_contact_names(contacts)
    if not known:
        return []
    invented = [
        raw
        for raw in _iter_plan_contacts(plan)
        if (key := _norm(raw)) and key not in _PLACEHOLDER_CONTACTS and key not in known
    ]
    invented = list(dict.fromkeys(invented))  # de-dupe, preserve order
    if not invented:
        return []
    return [
        _issue(
            "contact_not_in_dossier",
            CRITICAL,
            f"Le plan cible un contact absent de la liste enrichie : {', '.join(invented[:5])}",
            phase="plan",
        )
    ]


# A contact whose name is nothing but punctuation / whitespace — not a real name.
_SUSPECT_NAME_RE = re.compile(r"^[\W_]*$")


def _check_contacts(contacts: Sequence[Any]) -> list[dict[str, str]]:
    """Enriched contacts look real — a name, not a bare placeholder (warning)."""
    if not contacts:
        return [_issue("no_contacts", WARNING, "Aucun contact enrichi dans le dossier.", phase="contacts")]
    suspect: list[str] = []
    for c in contacts:
        name = _contact_name(c)
        if not name or _norm(name) in _PLACEHOLDER_CONTACTS or _SUSPECT_NAME_RE.match(name):
            suspect.append(name or "∅")
    if not suspect:
        return []
    return [
        _issue(
            "suspect_contact",
            WARNING,
            f"{len(suspect)} contact(s) sans nom exploitable (placeholder présenté comme réel).",
            phase="contacts",
        )
    ]


# ── #4070.5 — provenance et fraîcheur ────────────────────────────────────────

#: Les noms qu'un texte de sortie ne doit JAMAIS porter comme provenance. Miroir
#: Python de `OUR_SUPPLIERS` (`packages/contracts/src/schemas/tool-naming.ts`) pour
#: les fournisseurs, plus les systèmes internes et les registres publics (décision
#: Louis 12/10 : « aucune source nommée », renverse #2291.3). Les mots ordinaires
#: de `OUR_SUPPLIERS` (Hunter, Brave, Railway) n'y figurent que sous leur forme
#: longue : « Hunter Smith » n'est pas un fournisseur. `HubSpot` & co. n'y sont pas :
#: « votre CRM » est l'outil du client (D354).
_NAMED_SOURCES = (
    "Apollo", "Dropcontact", "SalesQL", r"Hunter\.io", "Lusha", "Kaspr", "FullEnrich", r"Brave[\s_-]+Search",
    "Serper", "Tavily", "Firecrawl", "Pappers", "Adzuna", "Jooble", "TheirStack", "Mantiks", r"Fantastic\.jobs",
    "Maddyness", "FrenchWeb", "Anthropic", "OpenAI", "Supabase",
    "DataForge", "ORION", r"m[ée]moire[\s_-]+march[ée]", r"market[\s_-]+memory", "signal_history", "crm_deal_facts",
    "rag_documents",
    "BODACC", "BOAMP", r"France[\s_-]+Travail", r"P[ôo]le[\s_-]+emploi", "Infogreffe", r"data\.gouv",
)  # fmt: skip
_NAMED_SOURCE_RE = re.compile(r"(?<![\w])(?:" + "|".join(_NAMED_SOURCES) + r")(?![\w])", re.IGNORECASE)
#: Clés techniques d'un plan qui PORTENT une provenance pour la machine, jamais pour l'écran.
_TECHNICAL_KEYS = frozenset(
    {"source", "sources", "provider", "providers", "provenance", "trace", "traces", "citations", "tags",
     "url", "urls", "link", "links", "sourceUrl", "source_url", "id", "ids"}
)  # fmt: skip

#: Au-delà de 90 jours, un fait n'est plus « récent » (la décote est continue, ce seuil
#: ne sert qu'à accuser un ADJECTIF faux — il ne coupe aucun fait de l'analyse).
_RECENT_DAYS = 90
_RECENCY_RE = re.compile(
    r"\b(?:recent|recente|recents|recentes|recemment|tout juste|vient de|viennent de|dernierement|"
    r"cette semaine|ce mois|nouvellement|fraichement|en ce moment|actuellement|actuel|actuelle|"
    r"aujourd'hui|ces derniers jours|ces dernieres semaines)\b"
)
_DATED_RE = re.compile(
    r"il y a \d+|\b(?:19|20)\d{2}\b|\d{1,2}/\d{1,2}/\d{2,4}|depuis \d+ (?:mois|ans?|semaines?)|"
    r"\b(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b"
)
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?;])\s+|\n+")
_STOPWORDS = frozenset({"dans", "avec", "pour", "chez", "sans", "plus", "tout", "cette", "leur", "vers", "sont"})


def _fold(text: str) -> str:
    """Minuscules sans accents : la comparaison ne dépend ni de la casse ni des diacritiques."""
    decomposed = unicodedata.normalize("NFKD", str(text))
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def _plan_texts(plan: Mapping[str, Any]) -> list[str]:
    return list(iter_texts(plan, _TECHNICAL_KEYS))


def _check_provenance(plan: Mapping[str, Any]) -> list[dict[str, str]]:
    """Aucune source nommée dans ce que le plan écrit (critical)."""
    found: list[str] = []
    for text in _plan_texts(plan):
        for match in _NAMED_SOURCE_RE.finditer(text):
            name = match.group(0).strip()
            if name.lower() not in (f.lower() for f in found):
                found.append(name)
    if not found:
        return []
    return [
        _issue(
            "source_named",
            CRITICAL,
            f"Le plan nomme une provenance (« {'», «'.join(found[:5])} ») — un fait se dit par sa nature et sa date.",
            phase="plan",
        )
    ]


def _fact_in_sentence(label: str, sentence_folded: str) -> bool:
    label_folded = _fold(label)
    if label_folded and label_folded in sentence_folded:
        return True
    tokens = [t for t in re.findall(r"[a-z0-9]{4,}", label_folded) if t not in _STOPWORDS]
    if len(tokens) < 2:
        return False
    present = sum(1 for t in tokens if t in sentence_folded)
    return present / len(tokens) >= 0.99


def _check_freshness(plan: Mapping[str, Any], facts: Any) -> list[dict[str, str]]:
    """Un fait ancien du compte présenté comme récent, sans date (critical)."""
    stale_facts = [f for f in normalize_account_facts(facts) if f["age_days"] > _RECENT_DAYS]
    if not stale_facts:
        return []
    flagged: list[str] = []
    for text in _plan_texts(plan):
        for sentence in _SENTENCE_SPLIT_RE.split(text):
            folded = _fold(sentence)
            if not _RECENCY_RE.search(folded) or _DATED_RE.search(folded):
                continue
            for fact in stale_facts:
                if _fact_in_sentence(fact["label"], folded):
                    line = f"« {fact['label']} » ({KIND_LABEL[fact['kind']]}, {age_phrase(fact['age_days'])})"
                    if line not in flagged:
                        flagged.append(line)
    if not flagged:
        return []
    return [
        _issue(
            "stale_fact_as_recent",
            CRITICAL,
            f"Fait ancien présenté comme récent, sans date : {' ; '.join(flagged[:5])}",
            phase="plan",
        )
    ]


def build_verdict(state: Mapping[str, Any]) -> dict[str, Any]:
    """Assemble the judge verdict over the full dossier on ``state``.

    Shape: ``{issues, confidence, passed, verdict, checks, researchConfidence}``.
    ``passed`` is False only when a ``critical`` issue was flagged; the verdict is
    advisory and never blocks completion.
    """
    research = state.get("research") if isinstance(state.get("research"), Mapping) else {}
    gate = state.get("gate") if isinstance(state.get("gate"), Mapping) else {}
    plan = state.get("plan") if isinstance(state.get("plan"), Mapping) else {}
    contacts = state.get("classified_contacts") or state.get("contacts") or []

    issues: list[dict[str, str]] = []
    issues += _check_grounding(research)
    issues += _check_scores(research, gate)
    issues += _check_coherence(contacts, plan)
    issues += _check_contacts(contacts)
    issues += _check_provenance(plan)
    issues += _check_freshness(plan, state.get("account_facts"))

    confidence = 1.0
    for issue in issues:
        confidence -= _PENALTY.get(issue["severity"], _PENALTY[WARNING])
    confidence = round(max(0.0, confidence), 3)

    passed = not any(i["severity"] == CRITICAL for i in issues)

    conf = research.get("confidence") if isinstance(research.get("confidence"), Mapping) else {}
    research_conf = conf.get("score")

    return {
        "issues": issues,
        "confidence": confidence,
        "passed": passed,
        "verdict": "pass" if passed else "flagged",
        "checks": ["grounding", "scores", "coherence", "contacts", "provenance", "freshness"],
        "researchConfidence": research_conf,
    }


def _already_judged(state: AnalysisState) -> bool:
    # Inlined (not imported from nodes) so a sibling PR editing nodes never
    # touches the judge. On resume the completed marker short-circuits a re-run.
    return "judge" in state.get("completed", [])


async def judge_node(state: AnalysisState) -> dict[str, Any]:
    """Validate the assembled dossier and record an advisory verdict on state.

    Deterministic + non-blocking: returns ``judge`` + a zero-cost envelope; it
    NEVER sets ``error`` (the graph still completes). Anti-hallucination flags
    surface for a consumer to act on — nothing is fabricated or dropped.
    """
    if _already_judged(state):
        return {}
    t0 = time.monotonic()
    verdict = build_verdict(state)
    duration_ms = int((time.monotonic() - t0) * 1000)
    if not verdict["passed"]:
        logger.warning(
            "Judge flagged the dossier: %d issue(s), confidence=%.2f",
            len(verdict["issues"]),
            verdict["confidence"],
        )
    return {
        "judge": verdict,
        "completed": ["judge"],
        "envelopes": [
            {
                "phase": "judge",
                "ok": True,
                "duration_ms": duration_ms,
                "input_tokens": 0,
                "output_tokens": 0,
                "cost_usd": 0,
                "cache_read_input_tokens": 0,
                "cache_creation_input_tokens": 0,
            }
        ],
    }
