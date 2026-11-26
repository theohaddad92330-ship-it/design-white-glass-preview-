"""Native Anthropic Citations grounding for the key firmographic facts.

The deterministic source registry (``sources.py``) says WHICH source backs a
fact; this adds Claude-verified, inhallucinable ``cited_text`` — the exact
sentence in a source document that proves each fact. Best-effort + bounded (a few
top docs + the key facts only); never breaks research.

Why it used to source ~nothing (0 citations, KPI never met)
-----------------------------------------------------------
The pass can only cite text that is actually inside the documents it is given.
But the firmographic facts it grounds are **registry** values: ``_merge_pappers``
overwrites ``revenue`` with ``str(revenue_latest)`` (a bare integer like
``"300000000"``), ``employees`` with the Pappers effectif tranche
(``"250 à 499 salariés"``), ``sector`` with the NAF label and ``headquarters``
with a formatted address. The caller, however, built the citable documents from
the **Firecrawl web scrapes only** — the registry (the real source of those
facts) was in no document, and the normalized values don't appear verbatim in
web prose. Result: nothing to cite.

The fix (:func:`build_cite_docs` + :func:`registry_evidence_doc`) rebuilds a
citable **registry document** from those same registry fields, so each
registry-backed fact has an inhallucinable verbatim quote to cite, and keeps the
web scrapes + news for web-only runs. Matching (:func:`_citation_supports`) also
tolerates digit-grouping and multi-word labels so a real citation isn't dropped.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Mapping
from typing import Any

from app.services.claude_service import TokenUsage, call_claude_with_citations
from app.services.kill_switch import GROUNDING_KILL_SWITCH, disabled
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)

# Concrete, single-value firmographic facts (the canonical hard-fact set of the
# faithfulness KPI, ``eval.metrics.HARD_FACT_FIELDS``). Deliberately NO
# ``businessDescription`` — it is a multi-sentence LLM synthesis with no single
# citable span, so it could never be sourced and, being 1/N of the KPI
# denominator, made ``kpiMet`` mathematically unreachable.
_GROUNDED_FACTS = ("siren", "revenue", "employees", "headquarters", "sector")
_MAX_DOCS = 6
_MAX_DOC_CHARS = 6000

_SYSTEM = (
    "Tu vérifies des faits sur une entreprise UNIQUEMENT à partir des documents fournis. "
    "Pour CHAQUE fait, recopie MOT POUR MOT le passage source exact qui le prouve. "
    "N'invente RIEN : si un fait n'est pas dans les documents, dis-le explicitement."
)


def _prepare_docs(documents: list[dict[str, str]] | None) -> list[dict[str, str]]:
    """Non-empty docs, char-capped and doc-capped — the bounded input the
    Citations call actually sees."""
    return [
        {"title": d.get("title") or "page", "text": (d.get("text") or "")[:_MAX_DOC_CHARS]}
        for d in (documents or [])
        if (d.get("text") or "").strip()
    ][:_MAX_DOCS]


def _fact_pairs(facts: Mapping[str, Any]) -> list[str]:
    """The grounded facts present in ``facts``, as ``- field : value`` lines."""
    return [f"- {field} : {facts.get(field)}" for field in _GROUNDED_FACTS if facts.get(field)]


def registry_evidence_doc(facts: Mapping[str, Any]) -> dict[str, str] | None:
    """A citable text document rebuilt from the deterministic registry fields
    already merged into ``facts``.

    ``_merge_pappers`` overwrote ``revenue`` / ``employees`` / ``sector`` /
    ``headquarters`` with Pappers/RNE values and stamped ``siren`` — but only when
    the resolved entity is trusted. Feeding this back as a Citations *document*
    gives the API an inhallucinable verbatim quote to attach to each
    registry-backed fact (without it the registry — the real source of those
    facts — is in no document, so the pass can cite nothing).

    Gated on ``siren``: it is stamped iff ``use_registry`` was true, so its
    presence means these values genuinely come from the registry (never a
    homonym-rejected / web-only run, whose web values must not be dressed up as
    "registre légal"). Returns ``None`` otherwise.
    """
    siren = str(facts.get("siren") or "").strip()
    if not siren:
        return None

    lines: list[str] = []

    def add(label: str, value: object) -> None:
        text = str(value).strip() if value not in (None, "") else ""
        if text:
            lines.append(f"{label} : {text}")

    legal_name = facts.get("legalName") or facts.get("legal_name") or facts.get("companyName")
    add("Dénomination légale", legal_name)
    add("SIREN", siren)
    add("Forme juridique", facts.get("legal_form") or facts.get("legalForm"))
    add("Date de création", facts.get("creation_date") or facts.get("creationDate"))
    add("Code NAF/APE", facts.get("nafCode") or facts.get("naf_code"))
    add("Activité (NAF)", facts.get("activity_label") or facts.get("activityLabel"))
    add("Secteur d'activité (NAF)", facts.get("sector"))
    add("Effectif", facts.get("employees"))
    revenue = facts.get("revenue")
    if revenue not in (None, ""):
        add("Chiffre d'affaires (dernier exercice)", f"{revenue} €")
    add("Siège social", facts.get("headquarters"))
    capital = facts.get("capital")
    if capital not in (None, ""):
        add("Capital social", f"{capital} €")
    add("Objet social", facts.get("corporate_purpose") or facts.get("corporatePurpose"))

    if not lines:
        return None
    header = f"Fiche registre légal — {legal_name or 'entreprise'}"
    return {"title": "Registre légal", "text": header + "\n" + "\n".join(lines)}


def build_cite_docs(
    facts: Mapping[str, Any],
    scraped_docs: list[dict[str, str]] | None,
    news: list[Mapping[str, Any]] | None = None,
) -> list[dict[str, str]]:
    """Assemble the citable evidence: the **registry document first** (highest
    signal for the firmographic facts, so the ``_MAX_DOCS`` cap never drops it),
    then the scraped web pages, then news snippets. This is the real collected
    evidence — the previous caller passed the web scrapes only, which is why the
    registry-backed facts had nothing to cite."""
    docs: list[dict[str, str]] = []
    registry = registry_evidence_doc(facts)
    if registry:
        docs.append(registry)
    for d in scraped_docs or []:
        if (d.get("text") or "").strip():
            docs.append({"title": d.get("title") or "page", "text": d.get("text") or ""})
    for hit in news or []:
        title = str(hit.get("title") or "").strip()
        desc = str(hit.get("description") or "").strip()
        text = " — ".join(part for part in (title, desc) if part)
        if text:
            docs.append({"title": str(hit.get("url") or title or "actualité"), "text": text})
    return docs


async def cite_key_facts(
    company: str,
    facts: dict[str, Any],
    documents: list[dict[str, str]],
    *,
    correlation_id: str = "",
) -> tuple[list[dict[str, Any]], TokenUsage | None]:
    """Claude-cited proof (verbatim ``cited_text``) for the key facts.

    Returns ``(citations, usage)``. Best-effort: any failure → ``([], None)``.

    LOT 13 (D169, 12/09/2026 — revirement) : a first pass at this lot left this
    function uncovered and documented the asymmetry instead of fixing it
    (extending a kill-switch's scope looked like a product call). Louis
    overruled that: an incident switch must cut what its NAME says, because
    it's posed under pressure with no time to remember it only covers half.
    Break-glass ``GROUNDING_DISABLED=true`` (``kill_switch.py``) now
    short-circuits **both** Citations passes — this one and
    :func:`ground_facts_v2` below — to their empty-result shape with zero
    Claude call. A dossier built during the outage losing its citations is the
    INTENDED effect, not a side effect. Guarded by GA-315
    (``tests/test_grounding_kill_switch_both_passes.py``), which proves the
    two passes go silent together and stay byte-identical when the switch is
    absent.
    """
    if disabled(GROUNDING_KILL_SWITCH):
        return [], None
    docs = _prepare_docs(documents)
    if not docs:
        return [], None
    pairs = _fact_pairs(facts)
    if not pairs:
        return [], None

    question = f"Entreprise : {company}\n\nFaits à vérifier (cite le passage source exact pour chacun) :\n" + "\n".join(
        pairs
    )
    try:
        _answer, citations, usage = await call_claude_with_citations(
            _SYSTEM,
            question,
            docs,
            model=model_for("grounding_citations"),
            max_tokens=900,
            prompt_name="grounding_citations",
            correlation_id=correlation_id,
            domain_knowledge=True,
        )
        return citations, usage
    except Exception as exc:  # noqa: BLE001 — grounding must never break research
        logger.warning("Citations grounding failed for %r: %s", company, exc)
        return [], None


# ── Grounding v2 (always-on) ──────────────────────────────────────────────────
#
# ADDITIVE layer on top of the deterministic source registry (``sources.py``) and
# the flat ``cite_key_facts`` grounding above: a DISTINCT native-Citations pass
# that ties each key fact to an INHALLUCINABLE ``cited_text`` — lifted verbatim
# from the collected evidence by Anthropic, never authored by the model — plus a
# derived "<5% facts non-sourced" KPI. Best-effort: with no docs/facts it returns
# ``(None, None)`` and the caller adds nothing (see ``ground_facts_v2``).
#
# Citations ⊥ Structured Outputs (mission audit caveat), so this can't go through
# instructor: the model answers as free-form JSON that we parse ROBUSTLY (first
# ``{`` .. last ``}``, repo convention). Crucially the JSON only tells us WHICH
# fact a quote belongs to; every ``source_ref`` is built from the API's verified
# citation list, so a hallucinated model quote can never fabricate a source.

# KPI target: fewer than 5% of the key facts may be left without a source.
KPI_MAX_NON_SOURCED_RATIO = 0.05

_GROUNDING_V2_SYSTEM = (
    "Tu vérifies des faits sur une entreprise UNIQUEMENT à partir des documents fournis. "
    "Pour CHAQUE fait, recopie MOT POUR MOT le passage exact du document qui le prouve "
    "(c'est cette citation littérale qui compte). N'invente RIEN : si aucun document ne "
    'prouve un fait, indique "supported": false. Termine par un objet JSON, au format : '
    '{"facts": [{"field": "<nom du fait>", "value": "<valeur>", '
    '"supported": true|false, "quote": "<passage source exact recopié, ou vide>"}]}'
)

_STOPWORDS = {
    "de", "la", "le", "les", "des", "du", "et", "en", "au", "aux", "un", "une",
    "pour", "dans", "sur", "par", "avec", "sas", "sasu", "sarl",
}
_NUMERIC_VALUE = re.compile(r"^[\d\s., ]+\s*[€$%]?$")
_TOKEN_SPLIT = re.compile(r"[^0-9a-zàâäéèêëîïôöùûüç]+")


def _extract_json_object(text: str) -> dict[str, Any]:
    """Robustly pull the first ``{`` .. last ``}`` JSON object out of a
    non-structured Claude response (repo convention — Citations ⊥ Structured
    Outputs). Returns ``{}`` on any failure — never raises."""
    if not text:
        return {}
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return {}
    try:
        parsed = json.loads(text[start : end + 1])
    except (json.JSONDecodeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _norm(text: object) -> str:
    """Whitespace-collapsed, lowercased form for tolerant substring matching."""
    return re.sub(r"\s+", " ", str(text or "")).strip().lower()


def _digits(text: object) -> str:
    """Digit-only form — makes ``300000000`` match ``300 000 000 €`` (registry
    integers vs grouped prose)."""
    return re.sub(r"\D", "", str(text or ""))


def _significant_tokens(value_norm: str) -> list[str]:
    """Content tokens (len ≥ 4, no stopwords) of a value — for tolerant matching
    of multi-word labels (e.g. a NAF sector) when the wording differs slightly."""
    return [t for t in _TOKEN_SPLIT.split(value_norm) if len(t) >= 4 and t not in _STOPWORDS]


def _ref(citation: dict[str, Any]) -> dict[str, Any]:
    """A front-facing (camelCase) source_ref built ONLY from an API-verified
    citation — the ``cited_text`` is Anthropic's verbatim extract, so it is
    inhallucinable by construction."""
    return {
        "citedText": citation.get("cited_text"),
        "documentTitle": citation.get("document_title"),
        "documentIndex": citation.get("document_index"),
    }


def _citation_supports(value: object, quote_norm: str, cited_norm: str) -> bool:
    """Does this verified (inhallucinable) citation corroborate the fact?

    Conservative — a hallucinated model quote that matches no verified citation
    still yields nothing:

    * the model's claimed ``quote`` overlaps the verbatim citation, OR
    * the fact value appears verbatim in the citation, OR
    * for a purely-numeric value, its digit sequence appears in the citation's
      digits (``300000000`` ↔ ``300 000 000 €``), OR
    * every content token of a multi-word value appears in the citation.
    """
    value_norm = _norm(value)
    if quote_norm and (quote_norm in cited_norm or cited_norm in quote_norm):
        return True
    if value_norm and value_norm in cited_norm:
        return True
    if value_norm and _NUMERIC_VALUE.match(value_norm):
        value_digits = _digits(value_norm)
        if len(value_digits) >= 3 and value_digits in _digits(cited_norm):
            return True
    tokens = _significant_tokens(value_norm)
    return len(tokens) >= 2 and all(t in cited_norm for t in tokens)


def _refs_for_field(
    value: object,
    quote_norm: str,
    citations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Verified source_refs for one fact. The ref is always taken from the API
    citation, so a hallucinated quote — one that matches no verified citation —
    yields no ref (the fact stays non-sourced)."""
    seen: set[str] = set()
    refs: list[dict[str, Any]] = []
    for c in citations:
        cited_norm = _norm(c.get("cited_text"))
        if not cited_norm or cited_norm in seen:
            continue
        if _citation_supports(value, quote_norm, cited_norm):
            seen.add(cited_norm)
            refs.append(_ref(c))
    return refs


async def ground_facts_v2(
    company: str,
    facts: dict[str, Any],
    documents: list[dict[str, str]],
    *,
    correlation_id: str = "",
) -> tuple[dict[str, Any] | None, TokenUsage | None]:
    """GROUNDING_V2 pass: attach inhallucinable per-fact ``sourceRefs`` + a
    derived "<5% facts non-sourced" KPI to the key firmographic facts.

    Best-effort: nothing to ground (no docs / no facts) or any failure returns
    ``(None, None)`` and the caller leaves the research output untouched. The
    returned dict is additive and never mutates ``facts``. Break-glass
    ``GROUNDING_DISABLED=true`` (kill_switch.py) short-circuits to ``(None,
    None)`` with zero Claude call — no ``grounding`` key is added. LOT 13
    (D169) : :func:`cite_key_facts` above carries the same short-circuit — the
    switch now covers both Citations passes, not just this one.
    """
    if disabled(GROUNDING_KILL_SWITCH):
        return None, None
    docs = _prepare_docs(documents)
    considered = [field for field in _GROUNDED_FACTS if facts.get(field)]
    if not docs or not considered:
        return None, None

    pairs = [f"- {field} : {facts.get(field)}" for field in considered]
    question = f"Entreprise : {company}\n\nFaits à sourcer (cite le passage source exact pour chacun) :\n" + "\n".join(
        pairs
    )
    try:
        answer, citations, usage = await call_claude_with_citations(
            _GROUNDING_V2_SYSTEM,
            question,
            docs,
            model=model_for("grounding_v2"),
            max_tokens=1200,
            prompt_name="grounding_v2",
            correlation_id=correlation_id,
            domain_knowledge=True,
        )
    except Exception as exc:  # noqa: BLE001 — grounding must never break research
        logger.warning("Grounding v2 failed for %r: %s", company, exc)
        return None, None

    parsed = _extract_json_object(answer)
    parsed_by_field = {_norm(item.get("field")): item for item in (parsed.get("facts") or []) if isinstance(item, dict)}

    source_refs: dict[str, list[dict[str, Any]]] = {}
    for field in considered:
        item = parsed_by_field.get(_norm(field)) or {}
        refs = _refs_for_field(facts.get(field), _norm(item.get("quote")), citations)
        if refs:
            source_refs[field] = refs

    total = len(considered)
    sourced = sum(1 for field in considered if source_refs.get(field))
    non_sourced = total - sourced
    non_sourced_ratio = round(non_sourced / total, 4) if total else 0.0
    kpi = {
        "factsConsidered": total,
        "factsSourced": sourced,
        "factsNonSourced": non_sourced,
        "nonSourcedRatio": non_sourced_ratio,
        "targetMaxNonSourcedRatio": KPI_MAX_NON_SOURCED_RATIO,
        "kpiMet": non_sourced_ratio < KPI_MAX_NON_SOURCED_RATIO,
    }
    logger.info(
        "Grounding v2 '%s' cid=%s: %d/%d facts sourced (non-sourced %.1f%%, target <%.0f%%) kpi_met=%s",
        company,
        correlation_id,
        sourced,
        total,
        non_sourced_ratio * 100,
        KPI_MAX_NON_SOURCED_RATIO * 100,
        kpi["kpiMet"],
    )
    grounding = {
        "flag": "GROUNDING_V2",
        "sourceRefs": source_refs,
        "citations": [_ref(c) for c in citations],
        "kpi": kpi,
    }
    return grounding, usage
