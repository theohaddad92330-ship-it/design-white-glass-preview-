from __future__ import annotations

import asyncio
import dataclasses
import json
import logging
import os
import time
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

# Side-effect import — binds AgentError.from_* classmethods.
import app.models.agent_error_adapters  # noqa: F401
from app.knowledge import (
    competitor_intel_block,
    esn_positioning_block,
    regulatory_awareness_block,
    sector_playbook_block,
)
from app.knowledge.buying_committee import assemble_buying_committee, committee_prompt_block
from app.middleware.correlation_id import get_correlation_id
from app.models.agent_envelope import (
    AgentEnvelope,
    AgentError,
    AgentMeta,
    AgentStatus,
    AgentWarning,
    ErrorService,
    ErrorSeverity,
    TokenUsage,
)
from app.models.analysis_context import render_analysis_context
from app.models.outputs.plan import ActionPlanOutput, Cockpit, Play
from app.models.plan import PlanRequest, PlanResponse, StrategyScope
from app.models.strategy_data import StrategyData
from app.prompts import bellum_messages
from app.prompts.bellum_plan import (
    ACTION_PLAN_PHASES,
    build_action_plan_meta_prompt,
    build_action_plan_phase_prompt,
    build_plan_shared_context,
    build_subsection_user_prompt,
    build_system_prompt,
    market_memory_directive_block,
)
from app.services import bellum_api, rag_knowledge, rag_service
from app.services.account_feedback import feedback_directives_block
from app.services.account_score import (
    SCORE_AXES,
    cap_score_for_quality,
    clamp_axis,
    legacy_global_score,
    legacy_go_no_go,
    score25_from_global_score,
    score_from_breakdown,
    verdict_for_score,
)
from app.services.action_recommender import group_actions_by_horizon, recommend_actions_from_context
from app.services.analysis_account_facts import (
    account_facts_block,
    has_positive_rex_from_facts,
    lost_deal_motifs_block,
    previous_analysis_block,
    sector_referential_block,
)
from app.services.cancel import run_or_cancel
from app.services.claude_service import (
    CLAUDE_HAIKU_MODEL,
    CLAUDE_MODEL,
    TRUNCATION_RETRY_CAP,
    ClaudeError,
    ClaudeIncompleteOutputError,
    cache_system_for_fanout,
    call_claude,
)
from app.services.cold_account_playbook import cold_account_opening_block, cold_account_playbook_block
from app.services.company_archetype import account_decision_structure_block, archetype_verdict_from_account_data
from app.services.company_archetype_playbook import (
    archetype_buyer_block,
    archetype_buyer_hint,
    archetype_commercial_hint,
    is_partnership_candidate_archetype,
)
from app.services.context_mode import analysis_context_mode_block
from app.services.dataforge_needs import historical_needs_block
from app.services.dated_proof import stamp_dated_proof
from app.services.delivery_capacity import delivery_capacity_block
from app.services.domain_focus import is_industrial_seller
from app.services.dossier_read import (
    DOSSIER_AXIS_WEIGHT,
    DOSSIER_SCORE_ALGORITHM_VERSION,
    DOSSIER_SCORE_AXES,
    access_path_block,
    normalize_dossier_read,
    profile_incompleteness,
    reconcile_competition_axis,
    scoring_objectives,
)
from app.services.entities import annotate_entity_relevance
from app.services.esn_fit import apply_esn_fit_caps
from app.services.execution_trace import stamp_execution_id
from app.services.focus_weights import resolve_focus_weights
from app.services.group_relationship import detect_insider, insider_directive
from app.services.internal_client import internal_client_block
from app.services.market_memory_angle import reinforced_expertises
from app.services.method_consumers import method_block_for
from app.services.offer_provenance import build_commercial_offers
from app.services.opening_movement import (
    attach_plan_followed_signal,
    channel_prompt_block,
    movement_prompt_block,
    recommend_movement_from_context,
    recommended_route_for_plan,
    with_fresh_route_inputs,
    with_route_signals,
)
from app.services.person_relation_proof import person_relation_plan_block
from app.services.play_coherence import enforce_play_coherence
from app.services.play_completeness import evaluate_play_completeness
from app.services.progress import emit_progress
from app.services.purchasing_thread import render_purchasing_thread_block
from app.services.quality_judge import judge_quality
from app.services.recommendation_specificity import (
    STATUS_SPECIFIC,
    SpecificityRegistry,
    assess_specificity,
    registry_from_inputs,
)
from app.services.relationship_playbook import relationship_state_from_context, revenue_model_from_context
from app.services.score_axes import build_score_axes
from app.services.self_consistency import measure_self_consistency
from app.services.source_quality import is_weak_source
from app.services.team_routines import team_routines_block
from app.services.text_norm import normalize_name
from app.services.white_spaces import render_white_spaces_block
from app.services.workspace_learning import workspace_learning_block
from app.services.zero_layer import summarize_reverse_prospects, zero_layer_block

# axis key → (max, label) for backfilling the model's breakdown from the canonical grid.
_AXIS_META = {k: (m, label) for k, label, m in SCORE_AXES}

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/phase/4", tags=["Phase 4 — Plan"])


# Whitelist of ResearchOutput keys that actually drive BELLUM-PLAN. The full
# Phase-1 dump carries entities, sites, technology stack, raw API metrics,
# etc. — sending everything pushed the prompt past Claude's 200k input ceiling
# on rich accounts (Orange: 203k > 200k). The keys below are everything the
# plan prompt and its JSON schema reference; the rest is for phases 2-3 only.
_PLAN_RELEVANT_KEYS: frozenset[str] = frozenset(
    {
        "businessDescription",
        "sector",
        "employees",
        "revenue",
        "headquarters",
        "website",
        "isPublic",
        # NB: `subsidiaries` (the FULL annotated Pappers graph — ~98 SCI/holding/GIE
        # nodes for a group like SG) is deliberately EXCLUDED: it's pure noise in the
        # ~11×-cache-read plan block, redundant with the gated `entitiesExhaustive`
        # (cap 8, play-eligible) + `priorityPerimeters` (top 4), and unused by the
        # plan schema. Dropping it lifts signal-to-noise and cuts cache-read tokens.
        "entitiesExhaustive",
        "priorityPerimeters",
        "priorityScore",
        "priorityJustification",
        "budgetSignals",
        "recentSignals",
        "competitors",
        "peopleMentioned",
        "itChallenges",
        "pains",
        "angles",
        "commentOuvrirCompte",
        "rdvScript",
        "powerQuestions",
        "objections",
    }
)

# Caps on list-of-records fields. This block is cached and re-read by all 11
# plan sub-calls, so every item here is paid ~11× as cache-read (SG: ~910k
# cache-read tokens ≈ $0.27). The plan only needs the top items to build a
# focused action plan — Phase 1 already sorts by relevance, so a tight cap keeps
# the strongest signals and drops the long tail the plan would ignore anyway.
# ⚠️ Les valeurs ne vivent plus ici : elles vivent dans le CONTRAT
# (`packages/contracts/src/schemas/org-focus-weights.ts`), dont
# `app/services/focus_weights.py` est la copie embarquée — un seuil vit à un seul
# endroit (GA-26), et la garde `tests/test_focus_weights.py` fait tomber la CI si
# la copie dérive du contrat.
#
# Ils sont désormais RÉGLABLES PAR ESPACE. Le défaut reste exactement la table
# d'avant : un espace qui n'a rien réglé obtient un plan byte-identique. Ce qui
# change, c'est qu'une ESN qui ne vend pas d'IT peut retirer `itChallenges` de
# son plan — jusqu'à 0. « Jamais un prisme IT par défaut. »


# Max out-of-scope entities echoed back to the plan (transparency, not a play).
_OUT_OF_SCOPE_CAP = 10


# Budgets de sortie du plan d'action, en tokens.
#
# Un plafond trop bas ne coûte pas « une réponse plus courte » : la réponse est
# COUPÉE en plein JSON, facturée en entier, jetée, puis rejouée au budget doublé
# (`claude_service._call_structured`). Mesuré en production le 16/08/2026 sur
# `bellum_plan_action_plan_meta` : 1500 → troncature systématique → 72 s pour un
# appel qui en demande 20, et une génération payée pour rien.
#
# 3000 est la valeur qui a RÉUSSI lors de cette reprise, pas une marge choisie au
# doigt mouillé. Le relever ne coûte rien tant que le modèle écrit court : la
# facturation porte sur les tokens réellement produits, jamais sur le plafond.
ACTION_PLAN_META_MAX_TOKENS = 3000
ACTION_PLAN_PHASE_MAX_TOKENS = 2500

# #2501 — dernier filet sur une troncature (max_tokens) d'un sous-appel de la
# phase plan : UNE reprise, jamais une boucle. `_call_dict` a déjà doublé le
# budget jusqu'à `TRUNCATION_RETRY_CAP` avant de céder — retenter au même
# plafond ne changerait rien ; on ajoute une consigne de brièveté et on
# démarre directement au plafond, pour que cette seconde tentative ait la
# meilleure chance de tenir sans redoubler elle-même.
_CONCISION_DIRECTIVE = (
    "\n\nATTENTION : ta réponse précédente a été tronquée (max_tokens atteint). "
    "Réponds cette fois BEAUCOUP plus court — une phrase par champ texte, "
    "aucun développement au-delà du minimum demandé par le schéma."
)


def _entity_gets_play(entity: Any) -> bool:
    """Whether an entitiesExhaustive entry is a valid commercial-play candidate.
    Trusts the ``getsPlay`` tag stamped in Phase 1; falls back to classifying on
    the spot so the gate holds even on older/partial payloads. Benefit of the
    doubt: an entity we CAN'T classify (no name) is kept — the gate only drops
    entities positively identified as noise / out-of-sector, never over-filters."""
    if not isinstance(entity, dict):
        return False
    if "getsPlay" in entity:
        return bool(entity["getsPlay"])
    name = entity.get("name")
    if not (isinstance(name, str) and name.strip()):
        return True
    return bool(annotate_entity_relevance(entity).get("getsPlay"))


def _executive_summary(data: dict[str, Any], account_data: dict[str, Any], contacts: list[Any]) -> list[str]:
    """5-line decisional summary for the Vue d'ensemble (00_MASTER §5
    `executiveSummary`). Assembled deterministically from verdict + reason + top
    angle + top contact + next action — no extra LLM call."""
    evaluation = data.get("evaluation") or {}
    verdict = evaluation.get("verdict") or "UNKNOWN"
    company = account_data.get("company_name") or account_data.get("companyName") or "Le compte"
    lines = [f"{company} — verdict {verdict} ({evaluation.get('score', '?')}/25)."]
    reason = evaluation.get("justification") or account_data.get("priorityJustification")
    if reason:
        lines.append(str(reason))
    angles = account_data.get("angles") or []
    if angles and isinstance(angles[0], dict) and angles[0].get("title"):
        lines.append(f"Angle recommandé : {angles[0]['title']}.")
    top_contact = next(
        (
            c.get("fullName") or c.get("full_name")
            for c in contacts
            if isinstance(c, dict) and (c.get("fullName") or c.get("full_name"))
        ),
        None,
    )
    if top_contact:
        lines.append(f"Contact prioritaire : {top_contact}.")
    nba = data.get("nextBestAction") or {}
    if nba.get("action"):
        lines.append(f"Action immédiate : {nba['action']}")
    return lines[:5]


def _next_best_action(data: dict[str, Any], registry: SpecificityRegistry | None = None) -> dict[str, Any] | None:
    """The single most useful next move — top quick win, else the first concrete
    action of the IMMEDIAT phase. Deterministic (00_MASTER §5 `nextBestAction`).

    #1925 — with a ``registry`` (the plan request's structured data), each
    candidate is judged by ``assess_specificity``: the FIRST specific one wins
    (same order as before), else the first candidate is kept and flagged. The
    verdict rides along as ``specificity``. Re-picking among candidates the plan
    ALREADY generated costs nothing — no regeneration, no extra model call."""
    quick_wins = data.get("quick_wins") or []
    action_plan = data.get("actionPlan")
    phases = action_plan.get("phases") if isinstance(action_plan, dict) else None
    # Quick wins only compete when the TOP one is actionable (the historical rule).
    top_quick_win = bool(quick_wins) and isinstance(quick_wins[0], dict) and bool(quick_wins[0].get("action"))
    candidates = [
        *(quick_wins if top_quick_win else ()),
        *(action for phase in phases or [] if isinstance(phase, dict) for action in phase.get("actions") or []),
    ]
    moves = (
        {"action": c.get("action"), "contact": c.get("contact"), "channel": c.get("channel")}
        for c in candidates
        if isinstance(c, dict) and c.get("action")
    )
    if registry is None:
        return next(moves, None)
    # Stop at the first specific candidate — usually the top quick win.
    fallback: dict[str, Any] | None = None
    for move in moves:
        move["specificity"] = assess_specificity([move["action"], move["contact"]], registry)
        if move["specificity"]["status"] == STATUS_SPECIFIC:
            return move
        fallback = fallback or move
    return fallback


# Accent/case-blind name match (shared helper — see app/services/text_norm.py):
# "VINCI Énergies" == "VINCI Energies", so a play binds its contact instead of
# falling to "à identifier".
_norm_entity = normalize_name


def _entity_matches(perimeter_name: str, contact_entity: object) -> bool:
    """Does a contact's entity belong to this perimeter? Normalized equality, or
    a whole-word prefix in either direction — but only when the shorter name has
    ≥2 tokens, so a bare "VINCI" perimeter doesn't grab every "VINCI …" contact
    (audit: naive substring over-matched across BUs)."""
    p, e = _norm_entity(perimeter_name), _norm_entity(contact_entity)
    if not p or not e:
        return False
    if p == e:
        return True
    shorter = p if len(p) <= len(e) else e
    if len(shorter.split()) < 2:
        return False
    return e.startswith(p + " ") or p.startswith(e + " ")


def _play_priority(contact: dict[str, Any]) -> int:
    """Sort key for picking a perimeter's target contact: the classified
    ``priority`` (1 = top decider … 5), 0/unset = unclassified → sorts last."""
    p = contact.get("priority")
    return p if isinstance(p, int) and 1 <= p <= 5 else 99


def _play_contact_sort_key(contact: dict[str, Any]) -> tuple[bool, int]:
    """Rank a play's candidate contacts. A weak/reconstructed source sorts AFTER
    any real-source contact (Théo #2 — ne pas bâtir une reco sur une source faible),
    then by decision priority. A weak contact is still used if nothing better exists."""
    return (is_weak_source(contact.get("source")), _play_priority(contact))


def _play_contact_for_perimeter(perimeter_name: str, contacts: list[Any]) -> dict[str, Any] | None:
    """Top-priority contact for the perimeter (1 = best). Preference order:
    1. a contact sitting IN the perimeter's entity (accent-insensitive);
    2. a GROUP-level contact tagged with the shared parent token (e.g. "VINCI"
       for perimeter "VINCI Construction") — the common case, since the pipeline
       runs ONE group-level search so most contacts carry the parent name.
    We still never borrow a contact from a DIFFERENT specific BU (§8), so the
    fallback only matches the bare parent, not "VINCI Energies". None when
    neither exists → the play honestly shows "à identifier"."""
    dicts = [c for c in contacts if isinstance(c, dict)]
    in_entity = [c for c in dicts if _entity_matches(perimeter_name, c.get("entity"))]
    if in_entity:
        return min(in_entity, key=_play_contact_sort_key)
    tokens = _norm_entity(perimeter_name).split()
    parent = tokens[0] if tokens else ""
    if parent:
        group = [c for c in dicts if _norm_entity(c.get("entity")) == parent]
        if group:
            return min(group, key=_play_contact_sort_key)
    return None


def _play_angle_for_perimeter(perimeter_name: str, angles: list[dict[str, Any]], index: int) -> dict[str, Any] | None:
    """Angle whose title mentions the perimeter, else the angle at ``index`` (so
    three plays draw three distinct angles), else the first."""
    key = (perimeter_name or "").strip().lower()
    if key:
        for a in angles:
            if key in (str(a.get("title") or "") + " " + str(a.get("rationale") or "")).lower():
                return a
    if index < len(angles):
        return angles[index]
    return angles[0] if angles else None


def _ready_message_for_contact(
    contact: dict[str, Any] | None, messages: list[dict[str, Any]]
) -> tuple[str | None, str | None]:
    """The ready-to-send M1 message generated for the play's target contact,
    joined onto the play so the chain closes end-to-end: perimeter → signal →
    contact → action → MESSAGE (Théo §3). Matched by ``contactName`` with the
    same accent/case-blind normalisation the API worker uses in ``applyMessages``.
    Channel preference LinkedIn opener → email → phone. Returns ``(None, None)``
    (never fabricated, §6/§8) when there is no contact or no message for them."""
    if not contact:
        return None, None
    name = _norm_entity(contact.get("fullName") or contact.get("full_name"))
    if not name:
        return None, None
    for m in messages:
        if _norm_entity(m.get("contactName") or m.get("contact_name")) != name:
            continue
        for channel, key in (("linkedin", "linkedinMessage"), ("email", "emailBody"), ("phone", "phoneOpener")):
            val = str(m.get(key) or "").strip()
            if val:
                return val, channel
        return None, None  # message row exists but is empty — honest None
    return None, None


def _bind_to_perimeter(
    seq: list, text_of: Any, perimeter_name: str, index: int, exclude: frozenset[str] = frozenset()
) -> Any:
    """Pick the sequence item that NAMES this perimeter (semantic binding for
    play coherence, Théo §3), else the i-th item (positional fallback, so three
    plays still draw three distinct pains/actions). Only BU-DISTINCTIVE tokens
    drive the match: ``exclude`` carries the shared parent token ("vinci") that
    appears in several perimeters — without excluding it, a parent-level signal
    scored 1 for every perimeter and collapsed all plays onto the same item."""
    if not seq:
        return None
    ptokens = {t for t in _norm_entity(perimeter_name).split() if len(t) >= 4 and t not in exclude}
    if ptokens:
        best, best_score = None, 0
        for item in seq:
            score = sum(1 for t in ptokens if t in _norm_entity(text_of(item)))
            if score > best_score:
                best, best_score = item, score
        if best is not None:
            return best
    return seq[index] if index < len(seq) else seq[0]


def _play_evidence(
    perimeter_name: str,
    recent_signals: list[Any],
    budget_signals: list[Any],
    index: int,
    exclude_tokens: frozenset[str],
) -> dict[str, Any] | None:
    """SalesConnect ``preuve`` (roadmap §14) : tie the play's signal to a REAL
    sourced entry. Searches the research's ``recentSignals`` + ``budgetSignals``
    (which carry a ``source``, and often a ``date``) for the entry that names this
    perimeter, else the i-th sourced entry (distinct proof per play). Returns
    ``None`` — NEVER a fabricated citation (§8) — when no entry carries a real
    source. A weak / reconstructed source is kept but flagged ``weak=True`` so the
    completeness gate marks the play faible (Théo #2)."""
    sourced = [
        s
        for s in (list(recent_signals) + list(budget_signals))
        if isinstance(s, dict) and str(s.get("source") or "").strip()
    ]
    if not sourced:
        return None
    chosen = _bind_to_perimeter(
        sourced,
        lambda s: f"{s.get('signal') or ''} {s.get('source') or ''}",
        perimeter_name,
        index,
        exclude_tokens,
    )
    if not isinstance(chosen, dict):
        return None
    source = str(chosen.get("source") or "").strip()
    if not source:
        return None
    return {
        "source": source,
        # recentSignals may carry a url; budgetSignals use `timeframe` as the date.
        "url": chosen.get("url") or None,
        "date": chosen.get("date") or chosen.get("timeframe") or None,
        "signal": str(chosen.get("signal") or "").strip(),
        "weak": is_weak_source(source),
    }


def _plays(
    data: dict[str, Any],
    account_data: dict[str, Any],
    contacts: list[Any],
    messages: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """≤3 consolidated plays (03_BUSINESS_RULES §5). Each play bundles the required
    components — perimeter, pain/signal, PREUVE (cited source), ESN offer, target
    contact, angle, first action, evidence level, risk, ready message — assembled
    DETERMINISTICALLY from the perimeters + angles + offers + contacts + signals +
    plan already computed (no extra LLM call). A component we can't source is left
    explicit ("à qualifier" / "à identifier") per the 70% rule (§6) — never
    fabricated (§8). Every play then carries a SalesConnect completeness verdict
    (roadmap §14): the 6 fields (signal/preuve/contact/action/message/risque) +
    a founded preuve → `complete`, else `faible` (flagged, not dropped)."""
    perimeters = [
        p
        for p in (account_data.get("priorityPerimeters") or account_data.get("priority_perimeters") or [])
        if isinstance(p, dict)
    ]
    angles = [a for a in (account_data.get("angles") or []) if isinstance(a, dict)]
    esn_rules = account_data.get("esnRules") or account_data.get("esn_rules") or {}
    default_offers = esn_rules.get("offers") if isinstance(esn_rules, dict) else []
    pains = [str(p.get("pain") or p) for p in (account_data.get("pains") or []) if p]
    risks = [r for r in ((data.get("evaluation") or {}).get("risks") or []) if isinstance(r, dict)]
    # SalesConnect `preuve` sources (roadmap §14): the research's sourced signals —
    # the ONLY entries that carry a citation (`source`, `date`). A play's proof is
    # bound from here, never invented (§8).
    recent_signals = [
        s
        for s in (account_data.get("recentSignals") or account_data.get("recent_signals") or [])
        if isinstance(s, dict)
    ]
    budget_signals = [
        s
        for s in (account_data.get("budgetSignals") or account_data.get("budget_signals") or [])
        if isinstance(s, dict)
    ]
    quick_wins = [q for q in (data.get("quick_wins") or []) if isinstance(q, dict)]
    nba = data.get("nextBestAction") or {}
    msgs = [m for m in (messages or []) if isinstance(m, dict)]
    confidence_tier = (
        (account_data.get("confidence") or {}).get("tier") if isinstance(account_data.get("confidence"), dict) else None
    )

    # Tokens shared by ≥2 of the plays' perimeters (e.g. the group parent "vinci")
    # are NOT discriminative — exclude them from the semantic binding so a
    # parent-level pain doesn't bind every play to the same item.
    _tok_counts: dict[str, int] = {}
    for _p in perimeters[:3]:
        for t in {t for t in _norm_entity(_p.get("name")).split() if len(t) >= 4}:
            _tok_counts[t] = _tok_counts.get(t, 0) + 1
    common_tokens = frozenset(t for t, c in _tok_counts.items() if c >= 2)

    def _real_offer(v: object) -> bool:
        # Skip a whatToSell the model couldn't source ("Non identifié dans les
        # sources — …") — for a homonym entity it reads as that company's own
        # description, not an ESN offer. Fall back to the ESN's real offers.
        s = str(v or "").strip()
        return bool(s) and not s.lower().startswith(("non identifi", "n/a", "à qualifier"))

    plays: list[dict[str, Any]] = []
    for i, p in enumerate(perimeters[:3]):
        name = str(p.get("name") or "").strip()
        contact = _play_contact_for_perimeter(name, contacts)
        angle = _play_angle_for_perimeter(name, angles, i)
        offer = next(
            (o for o in (p.get("whatToSell") or p.get("what_to_sell") or []) if _real_offer(o)),
            None,
        ) or next((o for o in (default_offers or []) if _real_offer(o)), None)
        pain = _bind_to_perimeter(pains, lambda s: s, name, i, common_tokens)
        risk = _bind_to_perimeter(risks, lambda r: r.get("risk") if isinstance(r, dict) else r, name, i, common_tokens)
        qw = _bind_to_perimeter(
            quick_wins, lambda q: q.get("action") if isinstance(q, dict) else q, name, i, common_tokens
        )
        first_action = (qw.get("action") if isinstance(qw, dict) else None) or nba.get("action")
        ready_message, ready_channel = _ready_message_for_contact(contact, msgs)
        # SalesConnect `preuve` : the cited source grounding this play's signal —
        # None (not fabricated) when no real source backs it → marked faible below.
        preuve = _play_evidence(name, recent_signals, budget_signals, i, common_tokens)
        plays.append(
            {
                "perimeter": name or "à qualifier",
                "tier": p.get("tier"),
                "painSignal": pain or "à qualifier",
                "preuve": preuve,
                "esnOffer": offer or "à qualifier",
                # IA contact shape (EnrichedContact.model_dump(by_alias=True)):
                # name = fullName, role = role (not decisionRole).
                "targetContact": (contact and (contact.get("fullName") or contact.get("full_name"))) or "à identifier",
                "targetContactRole": (contact.get("role") or contact.get("bucket") or None) if contact else None,
                "angle": (angle.get("title") if angle else None) or "à définir",
                "firstAction": first_action or "à définir",
                "evidenceLevel": p.get("confidence") or confidence_tier or "hypothese",
                "risk": (risk.get("risk") if isinstance(risk, dict) else None)
                or "Accès au bon interlocuteur à confirmer.",
                # C1 (§3): the ready-to-send M1 for this play's contact — the chain's
                # last link. None (not fabricated) when no contact / no message.
                "readyMessage": ready_message,
                "readyMessageChannel": ready_channel,
            }
        )
    # Coherence judge (retour Thales) : the chain périmètre→signal→offre→contact→
    # action→message→preuve→risque must tell one story. Recadre an action that
    # names a contact other than the play's own, flag missing links. Then enforce
    # the typed Play contract (prep chatbot/mémoire V2, Théo #7) so the object a
    # future chatbot reads is stable; round-trips by alias (no key change).
    coherent = [enforce_play_coherence(p, contacts) for p in plays]
    # SalesConnect completeness (roadmap §14): flag whether each play carries the 6
    # fields (signal/preuve/contact/action/message/risque) AND a founded preuve.
    # Computed on the coherent dict (after any firstAction repair) so the status
    # reflects the play as shipped — a play without a real proof is marked faible,
    # never dropped.
    for p in coherent:
        p["completeness"] = evaluate_play_completeness(p)
    return [Play.model_validate(p).model_dump(by_alias=True) for p in coherent]


def _apply_strategy_scope(account_data: dict[str, Any], scope: StrategyScope | None) -> dict[str, Any]:
    """ "Changer de stratégie" (Théo P3): reorder angles + perimeters so the
    user's chosen strategy LEADS. The chosen angle becomes ``angles[0]`` (so the
    recommended angle, the executiveSummary and the plays all anchor on it); the
    focus entity's perimeter floats to the top. Deterministic, non-destructive
    (shallow copy, nothing dropped) — an empty/absent scope is a no-op."""
    if scope is None or not (scope.angle or scope.focus_entity):
        return account_data
    out = dict(account_data)
    if scope.angle:
        key = scope.angle.strip().lower()
        angles = [a for a in (out.get("angles") or []) if isinstance(a, dict)]
        chosen = [a for a in angles if key in str(a.get("title") or "").lower()]
        if chosen:
            out["angles"] = chosen + [a for a in angles if a not in chosen]
    if scope.focus_entity:
        key = scope.focus_entity.strip().lower()
        for pk in ("priorityPerimeters", "priority_perimeters"):
            pers = [p for p in (out.get(pk) or []) if isinstance(p, dict)]
            focus = [p for p in pers if key in str(p.get("name") or "").lower()]
            if focus:
                out[pk] = focus + [p for p in pers if p not in focus]
    return out


def _strategy_directive(scope: StrategyScope | None) -> str:
    """Prompt directive telling BELLUM-PLAN to build the whole plan around the
    user's chosen strategy — so the LLM narrative follows the same override as
    the deterministic reorder above. Empty when no strategy is imposed."""
    if scope is None:
        return ""
    parts: list[str] = []
    if scope.angle:
        parts.append(f"l'angle « {scope.angle} »")
    if scope.entry_mode:
        parts.append(f"le mode d'entrée {scope.entry_mode}")
    if scope.focus_entity:
        parts.append(f"le périmètre « {scope.focus_entity} »")
    if not parts:
        return ""
    return (
        "\n\n===== STRATÉGIE IMPOSÉE PAR L'UTILISATEUR =====\n"
        "Construis TOUT le plan (plays, actions, messages, ordre d'attaque) autour de "
        + ", ".join(parts)
        + ". Écarte les autres angles/périmètres sauf s'ils servent celui-ci. Si ce choix "
        "est faible ou risqué pour le profil ESN, dis-le honnêtement dans la justification."
    )


def _trim_account_data(account_data: dict[str, Any], focus_weights: Any = None) -> dict[str, Any]:
    """Whitelist + cap the research payload before sending to BELLUM-PLAN."""
    trimmed: dict[str, Any] = {k: v for k, v in account_data.items() if k in _PLAN_RELEVANT_KEYS}

    # Entity gate (S2): noise / out-of-sector entities (SGTM/BTP, les moulins…)
    # must NOT reach the plan as play candidates — they'd otherwise get a full
    # 30/60/90 play + messages. Keep only play-eligible entities; the excluded
    # ones stay in the dossier via a separate labelled list the plan won't build on.
    entities = trimmed.get("entitiesExhaustive")
    if isinstance(entities, list):
        trimmed["entitiesExhaustive"] = [e for e in entities if _entity_gets_play(e)]
        excluded = [e for e in entities if isinstance(e, dict) and not _entity_gets_play(e)]
        if excluded:
            trimmed["outOfScopeEntities"] = [
                {
                    "name": e.get("name"),
                    "relevance": e.get("relevance"),
                    "relevanceReason": e.get("relevanceReason"),
                }
                for e in excluded
            ][:_OUT_OF_SCOPE_CAP]

    for key, cap in resolve_focus_weights(focus_weights).items():
        value = trimmed.get(key)
        if isinstance(value, list) and len(value) > cap:
            # Sort by relevance BEFORE truncating so the cap drops the tail, not
            # the freshest signal / most urgent pain (was truncated in LLM order).
            trimmed[key] = _sort_for_cap(key, value)[:cap]
    return trimmed


_URGENCY_ORDER = {"critique": 0, "haute": 1, "moyenne": 2, "basse": 3}


# Freshness rank for the top-signal cap: a current signal always outranks an
# archive, so a 2021 press release never becomes the "signal principal" even when
# its date string sorts oddly ("1 janv. 2026" vs "2023-2024"). Théo p.7/p.12.
_FRESHNESS_RANK = {"current": 0, "undated": 1, "archive": 2}


def _sort_for_cap(key: str, items: list[Any]) -> list[Any]:
    """Relevance sort before a cap: signals by freshness then newest-first, pains
    by urgency. Untouched (stable) for other keys or non-dict items."""
    if not all(isinstance(i, dict) for i in items):
        return items
    if key in ("recentSignals", "budgetSignals"):
        # Stable: date-desc first, then freshness (current above archive) on top.
        by_date = sorted(items, key=lambda x: str(x.get("date") or ""), reverse=True)
        return sorted(by_date, key=lambda x: _FRESHNESS_RANK.get(str(x.get("freshness") or "").lower(), 1))
    if key == "pains":
        return sorted(items, key=lambda x: _URGENCY_ORDER.get(str(x.get("urgency") or "").lower(), 9))
    return items


def _normalize_plan_scores(merged: dict[str, Any], sales_context: dict[str, Any] | None = None) -> None:
    """Turn the model's per-axis scoreBreakdown into the V1-vendable verdict.

    The score (/25) and the GO/PRUDENT/STOP verdict are RULES, not the model's
    free choice (cadrage §3.1): recompute the total from the clamped axes and band
    it deterministically. Also backfill the axis ``max`` + ``label`` and the legacy
    goNoGo / globalScore(/10) fields so old consumers keep working. Mutates in place.

    ``sales_context`` (optionnel) fait entrer le PROFIL ESN dans la règle : la
    grille p25 met la taille du vendeur dans l'axe Accessibilité et son delivery
    dans l'axe Capacité, donc un freelance ne peut pas afficher 5/5 sur un grand
    groupe au panel fermé (DoD p31 n°1, moitié SCORE). Sans contexte de vente —
    ou sans stade/archétype connus — le score est celui d'avant, au point près.
    """
    evaluation = merged.get("evaluation")
    if not isinstance(evaluation, dict):
        return
    breakdown = evaluation.get("scoreBreakdown")
    if isinstance(breakdown, list):
        # Clamp + backfill each axis (max/label from the canonical grid).
        for item in breakdown:
            if isinstance(item, dict):
                key = str(item.get("axis") or "")
                item["points"] = clamp_axis(key, item.get("points"))
                meta = _AXIS_META.get(key)
                if meta:
                    item["max"], item["label"] = meta
        # Plafonds de fit ESN — appliqués APRÈS le clamp (donc sur des points
        # valides) et AVANT la somme, pour que score, bande, verdict et /10
        # dégradent ensemble. `esnFitNotes` cite la règle au commercial.
        sc = sales_context or {}
        capped, notes = apply_esn_fit_caps(
            breakdown,
            esn_stage=(sc.get("esnProfile") or {}).get("stage"),
            account_archetype=(sc.get("account") or {}).get("archetype"),
        )
        if notes:
            evaluation["scoreBreakdown"] = capped
            evaluation["esnFitCapped"] = True
            evaluation["esnFitNotes"] = notes
            breakdown = capped
        score = score_from_breakdown(breakdown)
    else:
        # No breakdown (older/partial output): fall back to any legacy /10 score,
        # mapped BAND-FAITHFULLY to /25 so the verdict matches verdict_from_global_score
        # (a linear rescale would put 7/10 in PRUDENT while the /10 cutoff says GO).
        legacy = evaluation.get("globalScore")
        score = (
            score25_from_global_score(float(legacy))
            if isinstance(legacy, (int, float)) and not isinstance(legacy, bool)
            else 0
        )
    verdict = verdict_for_score(score)
    evaluation["score"] = score
    evaluation["verdict"] = verdict
    # Legacy back-compat for not-yet-migrated consumers.
    evaluation["goNoGo"] = legacy_go_no_go(verdict)
    evaluation["globalScore"] = legacy_global_score(score)


def _normalize_dossier_read_block(
    merged: dict[str, Any], profile: dict[str, Any] | None, competitors: Sequence[Any] = ()
) -> None:
    """#2118 — la lecture du dossier, ramenée à ce que le contrat accepte.

    Deux gestes, et un seul endroit pour les faire :

    1. NORMALISER ce que le modèle a rendu (`normalize_dossier_read`). Sans ça,
       un `value: 0` posé sur un axe « inconnu » fait refuser le bloc ENTIER
       côté lecture (`dossier_read` est en `.catch(null)` dans `plan.ts`) : la
       lecture disparaîtrait de l'écran à cause d'un zéro de trop.
    2. POSER `profile_incomplete` (#2118.20) depuis le profil ESN réel, pas
       depuis l'avis du modèle — c'est un fait qu'on connaît, et un fait
       vérifiable ne se demande pas à un générateur.

    Mutation en place, comme `_normalize_plan_scores` juste au-dessus. Aucun
    bloc n'est CRÉÉ : un dossier dont le modèle n'a rien rendu n'en gagne pas
    un vide — l'écran retombe sur `bellum_read`, puis sur `justification`.
    """
    evaluation = merged.get("evaluation")
    if not isinstance(evaluation, dict):
        return
    block = normalize_dossier_read(evaluation.get("dossier_read") or evaluation.get("dossierRead"))
    evaluation.pop("dossierRead", None)
    if block is None:
        evaluation.pop("dossier_read", None)
        return
    missing_profile_fields = profile_incompleteness(profile)
    # #4323.2 — les concurrents IDENTIFIÉS de l'analyse sont l'unique source : l'axe Concurrence s'y aligne.
    reconcile_competition_axis(
        block, [c.get("name") if isinstance(c, dict) else c for c in competitors if isinstance(c, (dict, str))]
    )
    block["profile_incomplete"] = bool(missing_profile_fields)
    block["profile_incomplete_fields"] = missing_profile_fields
    # #2306.16 — les objectifs commerciaux NOMMÉS actifs au moment du scoring.
    block["scoring_objectives"] = scoring_objectives(profile)
    # #2306.22/.23 — poids (égal, explicite) et version de la règle qui a
    # produit CE bloc, conservés quel que soit le profil.
    block["axis_weights"] = {key: DOSSIER_AXIS_WEIGHT for key in DOSSIER_SCORE_AXES}
    block["algorithm_version"] = DOSSIER_SCORE_ALGORITHM_VERSION
    evaluation["dossier_read"] = block


def _apply_quality_cap(evaluation: object, quality_verdict: str | None) -> None:
    """Cap the /25 account score to the band the Quality-Judge verdict allows so a
    hallucination / trop_faible dossier can't ship a confident GO. Mutates the
    evaluation dict in place; no-op when there is nothing to degrade. Keeps score,
    verdict, goNoGo and the /10 globalScore mutually consistent, and flags the cap
    (``qualityCapped`` / ``qualityCapReason``) so the front can badge it."""
    if not isinstance(evaluation, dict):
        return
    raw = evaluation.get("score")
    if not isinstance(raw, (int, float)) or isinstance(raw, bool):
        return
    capped = cap_score_for_quality(int(raw), quality_verdict)
    # trop_faible = livrables cœur absents = DONNÉES MANQUANTES : le compte n'est pas
    # un STOP par mauvais fit, c'est un EXPLORER (« potentiel mais collecter l'info »,
    # annexe méthodo p25) dès qu'il reste du potentiel. On re-verdicte donc même quand
    # le cap n'abaisse pas le score, pour router vers EXPLORER.
    data_missing = (quality_verdict or "").strip().lower() == "trop_faible"
    if capped >= int(raw) and not data_missing:
        return
    verdict = verdict_for_score(capped, data_complete=not data_missing)
    evaluation["score"] = capped
    evaluation["verdict"] = verdict
    evaluation["goNoGo"] = legacy_go_no_go(verdict)
    evaluation["globalScore"] = legacy_global_score(capped)
    evaluation["qualityCapped"] = True
    evaluation["qualityCapReason"] = quality_verdict


# How many contacts get a ready-to-send message set. Bounded for V1 cost: one
# Claude call writes messages for the best-ranked contacts only (priority 1 = top),
# not all of them — the long tail rarely gets cold-contacted first.
_MESSAGES_CONTACT_LIMIT = 6

# How many contacts go into the CACHED plan context (re-read by all 11 sub-calls).
# The plan assigns actions/messages to named deciders — it needs the top of the
# list, not all 82. Sending everyone bloated the ~11× cache-read for no gain.
_PLAN_CONTEXT_CONTACT_LIMIT = 15


def _rank_named_contacts(contacts: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """The best-ranked named contacts (priority asc, 1 = top), capped to ``limit``."""

    def _rank(c: dict[str, Any]) -> int:
        p = c.get("priority")
        return p if isinstance(p, int) and p >= 1 else 99

    named = [c for c in contacts if (c.get("fullName") or c.get("full_name"))]
    # Total order. `priority` is LLM-emitted and takes six values, so on a large
    # account dozens of contacts tie at 1 and the cut — literally which humans
    # receive a generated message — fell to classification emission order.
    return [named[i] for i in sorted(range(len(named)), key=lambda i: (_rank(named[i]), i))][:limit]


def _usable_messages(out: Any) -> bool:
    """#O8 — recette Loïc 21/10 : la réponse porte-t-elle au moins un message exploitable ?

    Liste vide, clé absente ou enveloppe ``{"data": ...}`` non déballée = non.
    """
    if not isinstance(out, dict):
        return False
    msgs = out.get("messages")
    return isinstance(msgs, list) and any(isinstance(m, dict) and m for m in msgs)


def _merge_usage(first: Any, second: Any) -> Any:
    """Somme deux usages (essai + reprise) pour que le coût de la reprise reste compté."""
    if first is None or second is None:
        return first if second is None else second
    return dataclasses.replace(
        first,
        input_tokens=first.input_tokens + second.input_tokens,
        output_tokens=first.output_tokens + second.output_tokens,
        cache_read_tokens=first.cache_read_tokens + second.cache_read_tokens,
        cache_creation_tokens=first.cache_creation_tokens + second.cache_creation_tokens,
        cost_usd=first.cost_usd + second.cost_usd,
    )


def _top_contacts_for_messages(contacts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The best-ranked named contacts to write messages for (priority asc, 1 = top)."""
    return _rank_named_contacts(contacts, _MESSAGES_CONTACT_LIMIT)


def _self_consistency_budget_s() -> float:
    """Combien de temps la mesure de self-consistency peut prendre, au plus.

    Elle tourne DANS le budget de la phase (`PHASE_PLAN_TIMEOUT_S`, 260 s) alors
    que le plan est déjà écrit. Sans borne propre, une mesure lente emporte le
    livrable : c'est ce qui s'est produit sur un run réel. 60 s couvrent
    largement trois appels concurrents ; au-delà, la mesure ne vaut pas le
    dossier. Une valeur non numérique ou ≤ 0 retombe sur le défaut — un réglage
    cassé ne doit pas désarmer la borne.
    """
    raw = os.getenv("SELF_CONSISTENCY_BUDGET_S", "")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 60.0
    return value if value > 0 else 60.0


async def _measure_self_consistency_bounded(
    *,
    system_prompt: str,
    company_name: str,
    profile: dict,
    account_data: dict[str, Any],
    evaluation: dict[str, Any] | None,
    plays: list[Any],
    contacts: list[Any],
    correlation_id: str,
) -> tuple[dict[str, Any] | None, list[Any]]:
    """La mesure de self-consistency, sous SON budget.

    Au dépassement, les 2e passes en vol sont annulées (elles facturent) et on
    rend « pas de mesure » — exactement ce que le module rend déjà quand une
    section échoue. Le plan, lui, part.
    """
    budget = _self_consistency_budget_s()
    t0 = time.monotonic()
    try:
        return await asyncio.wait_for(
            measure_self_consistency(
                llm_call=call_claude,
                system_prompt=system_prompt,
                company_name=company_name,
                profile_data=profile,
                account_data=account_data,
                evaluation=evaluation,
                plays=plays,
                contacts=contacts,
                correlation_id=correlation_id,
            ),
            budget,
        )
    # `TimeoutError` SEULEMENT : `wait_for` traduit l'annulation qu'il provoque
    # lui-même en `TimeoutError`. Attraper `CancelledError` ici avalerait
    # l'annulation VENUE DE DEHORS (budget de phase, requête abandonnée) et
    # désarmerait la garde qu'on est en train de renforcer.
    except TimeoutError:
        logger.warning(
            "Self-consistency abandonnée après %.0fs (budget %.0fs) — le plan part sans mesure",
            time.monotonic() - t0,
            budget,
            extra={"tags": {"phase": "plan", "code": "SELF_CONSISTENCY_BUDGET"}},
        )
        return None, []


async def _market_memory_reinforced_expertises(
    *,
    account_id: str,
    user_id: str,
    company_name: str,
    website: str | None,
    offers: list[str],
    version_sink: list[str] | None = None,
) -> list[str]:
    """#1611.4 / #1611.5 — la SEULE porte par laquelle le plan et les messages
    voient la mémoire marché.

    Best-effort et jamais bloquant : le plan et les messages ont toujours
    existé sans ce signal, une mémoire marché indisponible ne doit donc jamais
    les faire échouer ni les ralentir au-delà d'un appel réseau. Sans expertise
    déclarée par l'ESN, la question ne se pose même pas (`reinforced_expertises`
    rendrait `[]` de toute façon) — on économise l'appel.
    """
    if not offers:
        return []
    try:
        context = await bellum_api.market_memory_context_for(
            user_id, ref=account_id, company_name=company_name, website=website or None
        )
    except Exception as exc:  # noqa: BLE001 — un plan ne tombe jamais pour ce signal
        logger.warning("Marché mémoire indisponible pour le plan: %s", exc)
        return []
    if not isinstance(context, dict) or context.get("status") != "ok":
        return []
    coverage = context.get("coverage")
    if not isinstance(coverage, dict) or not coverage.get("covered"):
        return []
    # #3235 / #3212.3 — la version du jeu de données que CETTE lecture a
    # réellement rendu. Déposée seulement ici, après une couverture avérée : un
    # run ne se dit jamais nourri par une source qu'il n'a pas consultée.
    dataset_version = coverage.get("datasetVersion")
    if version_sink is not None and isinstance(dataset_version, str) and dataset_version.strip():
        version_sink.append(dataset_version.strip())
    observed_stack = coverage.get("observedStack")
    try:
        return reinforced_expertises(observed_stack if isinstance(observed_stack, list) else [], offers)
    except Exception as exc:  # noqa: BLE001 — la promesse du docblock, tenue jusqu'au bout
        # Le `try` d'origine n'entourait QUE l'appel réseau : une forme
        # inattendue de `profile['offers']` (un objet au lieu d'une chaîne)
        # remontait donc jusqu'à faire échouer la phase `plan` entière. Un
        # dossier de 3-6 minutes perdu pour un signal d'enrichissement, c'est
        # exactement ce que « best-effort et jamais bloquant » interdit.
        logger.warning("Rapprochement d'expertises impossible pour le plan (ignoré) : %s", exc)
        return []


async def _account_has_positive_rex(*, account_id: str | None, user_id: str) -> bool:
    """#2424.10 — au moins un REX RÉELLEMENT recueilli sur ce compte porte un
    « ce qui a marché ». `bellum_api.has_positive_rex` est déjà best-effort
    (`_post` avale toute panne et rend `None`) : indisponible → `False`,
    jamais un signal deviné, jamais un plan qui échoue pour ce signal.
    """
    if not account_id:
        return False
    try:
        return await bellum_api.has_positive_rex(user_id, account_id)
    except Exception as exc:  # noqa: BLE001 — un plan ne tombe jamais pour ce signal
        logger.warning("REX positif indisponible pour le plan (ignoré) : %s", exc)
        return False


async def _account_historical_needs(
    account_id: str | None, user_id: str | None, workspace_id: str | None = None
) -> dict[str, Any]:
    """#4281.2 — les besoins historiques DU compte (base commune, datés, prescripteur et sa fraîcheur).
    #4294.9 — lus dans l'ESPACE de l'analyse : le compte d'un coéquipier n'est plus muet.
    Best-effort : compte inconnu, non rattaché ou panne → aucun besoin, prompt byte-identique."""
    try:
        from app.services.dataforge_needs import needs_for_owned_account

        return await needs_for_owned_account(account_id, user_id, workspace_id=workspace_id or None)
    except Exception as exc:  # noqa: BLE001 — un plan ne tombe jamais pour un historique
        logger.warning("Besoins historiques indisponibles pour le plan (ignorés) : %s", exc)
        return {"needs": [], "to_verify": None, "source_ids": []}


async def _sector_referential_chunks(sector_text: str, account_source_id: str | None = None) -> list[dict[str, Any]]:
    """#4070.2 — les repères du SECTEUR du compte (référentiel sectoriel Bellum, corpus
    partagé du marché — jamais le contenu d'un compte). Best-effort : sans clé
    d'embedding, sans secteur ou en panne → ``[]``, ZÉRO appel réseau sans clé, et le
    plan part byte-identique. #4281.2 — scopé au compte du référentiel SEULEMENT quand son
    SIREN l'y rattache sans ambiguïté (`needs_for_owned_account`) ; sinon tout le corpus,
    jamais un rattachement deviné."""
    query = " ".join(sector_text.split())[:300]
    if not query:
        return []
    try:
        from app.services.dataforge_rag_chunks import search_dataforge_rag_chunks

        # #4281.2 — scopé au compte du référentiel quand le SIREN l'a rattaché sans ambiguïté
        # (`needs_for_owned_account`) : la pertinence se resserre, les alertes qualité globales
        # restent joignables (garantie du RPC, pas de ce module).
        return list(await search_dataforge_rag_chunks(query, account_source_id, 3))
    except Exception as exc:  # noqa: BLE001 — un plan ne tombe jamais pour un repère de secteur
        logger.warning("Repères sectoriels indisponibles pour le plan (ignorés) : %s", exc)
        return []


async def _delivery_capacity_of(user_id: str) -> dict[str, Any] | None:
    """#3226 (#3202.6) — la capacité de delivery de l'espace, best-effort : pont
    éteint, sans user_id ou en panne → `None`, le plan n'écrit aucune ligne."""
    if not user_id:
        return None
    try:
        return await bellum_api.delivery_capacity(user_id)
    except Exception as exc:  # noqa: BLE001 — un plan ne tombe jamais pour ce signal
        logger.warning("Capacité de delivery indisponible pour le plan (ignorée) : %s", exc)
        return None


def _route_sales_context_of(req: PlanRequest) -> dict[str, Any] | None:
    """#3278 — le SalesContext du dossier + les signaux de route relus par l'API."""
    return with_fresh_route_inputs(
        req.account_data.get("salesContext"),
        declared_partners=req.declared_partners,
        consultant_history=req.consultant_history,
        declared_signal_present=req.declared_signal_present,
        declared_route_signals=req.declared_route_signals,
    )


async def _plan(req: PlanRequest) -> PlanResponse:
    """Phase 4 business logic — split BELLUM-PLAN generation with checkpoints."""
    profile = req.profile_data
    # "Changer de stratégie" (Théo P3): if the user imposed an angle / entry mode
    # / entity, reorder the research so that strategy leads — the LLM plan and the
    # deterministic executiveSummary/plays all anchor on it. No-op when absent.
    account_data = _apply_strategy_scope(req.account_data, req.strategy_scope)
    account_analysis_str = json.dumps(_trim_account_data(account_data, req.focus_weights), ensure_ascii=False)
    # Only the top-ranked deciders go into the cached context (re-read ~11×). The
    # message-writing call still ranks/caps independently below.
    contacts_str = json.dumps(_rank_named_contacts(req.contacts, _PLAN_CONTEXT_CONTACT_LIMIT), ensure_ascii=False)

    cb = req.progress_callback
    company_name = profile.get("companyName", "N/A")
    # Relationship context drives the APPROACH: a cold first touch, a re-engagement
    # of a former account, or an upsell to an existing client are different plays.
    if isinstance(req.user_context, str):
        relationship_str = req.user_context
    else:
        relationship_str = render_analysis_context(req.user_context)
    # Logique Axians (Théo #4) : si l'ESN vendeuse appartient au groupe cible, le
    # plan se positionne en COMPLÉMENT de l'IT interne, jamais frontal. Directive
    # déterministe préfixée à la relation ; le flag est surfacé sur la sortie.
    insider = detect_insider(profile, account_data)
    _insider_directive = insider_directive(insider)
    if _insider_directive:
        relationship_str = (
            f"{_insider_directive}\n\n{relationship_str}" if relationship_str.strip() else _insider_directive
        )
    # The account analysis + contacts are the same ~20k-token block for all 11
    # calls. Putting them in the (cached) system prompt — instead of repeating
    # them in each user prompt — lets calls read them from the prompt cache at
    # ~0.1× input. The ``meta`` call below is awaited FIRST to warm that cache,
    # so the 10 parallel calls that follow hit it (firing all 11 at once would
    # instead make 10 simultaneous cache WRITES at 1.25× — the opposite of the
    # win). Cuts the live Phase-4 input from ~238k to ~60k effective tokens.
    # RAG grounding (niveau 3) : injecte les docs pertinents de l'utilisateur dans
    # le plan (dégradable — "" si pas d'user_id / pas de docs / erreur backend).
    _knowledge_query = (
        f"{account_data.get('company_name') or account_data.get('companyName') or company_name} "
        f"{account_data.get('sector', '')} plan de compte"
    )
    # Sentry IA-K — ces récupérations sont INDÉPENDANTES (même requête, aucune ne
    # lit le résultat d'une autre) : lancées ensemble, pas en « Consecutive HTTP ».
    # Pas de return_exceptions : une exception se propage comme avant.
    # #1611.4 / #1611.5 — la mémoire marché CHOISIT l'angle, elle n'entre jamais
    # dans le contenu. La seule chose qui traverse jusqu'au prompt est la liste
    # des expertises DÉCLARÉES par l'ESN qui recoupent l'environnement observé
    # du compte — jamais un nom de société de services, jamais un comptage de
    # parcours (voir `app/services/market_memory_angle.py`).
    _market_memory_versions: list[str] = []
    (
        plan_knowledge,
        _reranked,
        _drive_ctx,
        _market_memory_reinforced,
    ) = await asyncio.gather(
        rag_service.retrieve_knowledge_context(
            _knowledge_query,
            req.user_id,
            workspace_id=req.workspace_id or None,
            # #2779 — les documents rattachés à CE compte, jamais à un autre.
            account_id=req.account_id or None,
        ),
        # RAG-knowledge v2 (always-on): swap in the RERANKED retrieval — a better-ordered
        # pull from the SAME store. Additive + degradable: with no user_id / an empty
        # store the reranked pull is "" and we keep the plain result (no regression).
        # ⚠️ `workspace_id` n'est pas facultatif ici. Sans lui, la récupération
        # retombe sur le filtre par UTILISATEUR : la base de connaissance que l'ESN
        # a déposée — un actif d'équipe — cesse d'alimenter le plan dès qu'elle a
        # été déposée par un collègue. Ce chemin GAGNE quand il rend quelque chose.
        rag_knowledge.retrieve_reranked_context(
            _knowledge_query,
            req.user_id,
            sector=account_data.get("sector"),
            workspace_id=req.workspace_id or None,
            account_id=req.account_id or None,  # #2779
        ),
        # #3586 — savoir métier du Drive interne Bellum : bloc DÉDIÉ, commun à tous les
        # espaces, calculé UNE fois pour le plan ET les messages contacts. Vide ⇒ byte-identique.
        rag_knowledge.retrieve_drive_context(_knowledge_query, account_id=req.account_id or None),
        _market_memory_reinforced_expertises(
            version_sink=_market_memory_versions,
            account_id=req.account_id,
            user_id=req.user_id,
            company_name=company_name,
            website=account_data.get("website"),
            offers=list(profile.get("offers") or []),
        ),
    )
    if _reranked:
        plan_knowledge = _reranked
    plan_knowledge = rag_knowledge.append_drive_block(plan_knowledge, _drive_ctx)
    market_memory_block = market_memory_directive_block(_market_memory_reinforced)
    system_prompt = (
        build_system_prompt(profile)
        + "\n\n"
        + build_plan_shared_context(
            company_name,
            account_analysis_str,
            contacts_str,
            relationship_str,
            plan_knowledge,
            market_memory_block,
        )
    )
    # #3202.6 (épopée #3226) — le mode de décision (directe/collective) que
    # l'archétype de la CIBLE implique structurellement, sur le même pont NAF
    # que `_search_item` (chat_tools.py, GA-26) : jamais un second calcul de
    # l'archétype, jamais deviné quand l'archétype ne le détermine pas seul.
    system_prompt += account_decision_structure_block(
        naf_code=account_data.get("nafCode") or account_data.get("naf_code"),
        company_name=company_name,
    )
    # Grounding: the research tagged each key fact PUBLIC (sourced) vs HYPOTHÈSE
    # (AI guess). Tell the plan which fields are unverified so it hedges them
    # instead of presenting a guess as an established fact (anti-hallucination).
    tags = (req.account_data.get("sources") or {}).get("tags") or {}
    hypotheses = [field for field, tag in tags.items() if tag == "HYPOTHÈSE"]
    if hypotheses:
        system_prompt += (
            "\n\n## GROUNDING — champs NON vérifiés (hypothèses)\n"
            f"Ces champs sont des hypothèses IA à confirmer, PAS des faits établis : {', '.join(hypotheses)}.\n"
            "Ne les présente pas comme certains : formule-les au conditionnel ou propose de les vérifier."
        )
    # Curated ESN intel (harvested from the old data/ RAG seed): a compact,
    # deterministic sector playbook (decision chain, entry strategy, regulations,
    # dos/donts) + a competitor battlecard when a known ESN is the incumbent. This
    # grounds the plays in France-specific ESN knowledge the pipeline doesn't
    # generate — injected once into the cached context, so ~free across the calls.
    # The raw ``sector`` is often an unhelpful INSEE/NAF label ("Autres
    # intermédiations monétaires"); the businessDescription actually says "banque".
    # Match against both.
    sector_hint = " ".join(
        str(req.account_data.get(k) or "") for k in ("sector", "businessDescription", "concrete_activity")
    )
    sector_block = sector_playbook_block(sector_hint)
    # #3226 (#3202.6) — calculé UNE fois (GA-26), lu par les messages (angle)
    # ET par nextActions (partenariat) plus bas dans cette même fonction.
    _archetype_verdict = archetype_verdict_from_account_data(req.account_data)
    # #3226 (#3202.6) — interlocuteurs + cycle : la nature commerciale ne parle que
    # si le calibrage taille/secteur (`salesContext.account.archetype`) est absent.
    system_prompt += archetype_buyer_block(
        archetype_buyer_hint(
            _archetype_verdict,
            ((req.account_data.get("salesContext") or {}).get("account") or {}).get("archetype"),
        ),
        company_name,
    )
    # #3231 (#219.6) — client interne DÉCLARÉ sur la fiche compte (jamais deviné) :
    # nomme le COMPTE cible (`company_name` ci-dessus est l'ESN vendeuse).
    system_prompt += internal_client_block(
        req.account_data,
        str(req.account_data.get("company_name") or req.account_data.get("companyName") or "ce compte"),
    )
    # #3231 (#219.8) — contacts à relation DÉCLARÉE passée : jamais acteurs actuels du plan.
    system_prompt += person_relation_plan_block(req.contacts)
    # #3226 (#3202.6) — la capacité de delivery de l'espace (mesurée côté API).
    system_prompt += delivery_capacity_block(
        await _delivery_capacity_of(req.user_id),
        company_name,
        partnership_candidate=is_partnership_candidate_archetype(_archetype_verdict),
    )
    if sector_block:
        system_prompt += "\n\n" + sector_block
    competitor_names = [
        (c.get("name") if isinstance(c, dict) else str(c)) for c in (req.account_data.get("competitors") or [])
    ]
    competitor_block = competitor_intel_block([n for n in competitor_names if n])
    if competitor_block:
        system_prompt += "\n\n" + competitor_block
    # Intelligence concurrentielle ESN (Drive #11) : angles d'entrée vs les grandes
    # ESN (Capgemini, Sopra, Atos…), matchés au secteur du compte (sinon pack
    # général) — ADDITIF, déterministe, pour que les plays référencent un concurrent
    # et par où l'attaquer. + Awareness réglementaire (Drive #14) : carte secteur →
    # réglementation (banque→DORA, santé→HDS, +NIS2/RGPD transverses) comme signal
    # d'achat / angle conformité. Injectés dans le contexte caché, ~gratuit par call.
    positioning_block = esn_positioning_block(sector_hint, [n for n in competitor_names if n])
    if positioning_block:
        system_prompt += "\n\n" + positioning_block
    regulatory_block = regulatory_awareness_block(sector_hint)
    if regulatory_block:
        system_prompt += "\n\n" + regulatory_block
    # Intel achats & zones blanches (Théo Drive top-3) — ADDITIF, déterministe,
    # factuel (source DECP + structure groupe). Le thread achats nomme les
    # titulaires en place (concurrents ayant déjà vendu au groupe) → angle de
    # DÉLOGEMENT ; les zones blanches nomment les entités CONNUES sans signal →
    # angle d'OUVERTURE sur du vierge. Bloc vide quand il n'y a pas de donnée réelle
    # (le prompt ne grossit pas). N'écrase pas le plan : ajoute deux leviers de reco.
    intel_blocks = [
        render_purchasing_thread_block(req.account_data.get("purchasingThread")),
        render_white_spaces_block(req.account_data.get("whiteSpaces")),
    ]
    intel_body = "\n\n".join(b for b in intel_blocks if b)
    if intel_body:
        system_prompt += (
            "\n\n===== INTEL ACHATS & ZONES BLANCHES (factuel — à EXPLOITER dans les plays) =====\n" + intel_body
        )
    # Comité d'achat (Knowledge Pack v2) : le comité typé (rôle + quadrant
    # Pouvoir/Intérêt par contact) pour que chaque action/message vise le BON membre
    # — décideurs pour le budget/la validation, champions pour pousser en interne,
    # relais terrain pour faire remonter la douleur. Déterministe, calculé sur les
    # mêmes contacts, injecté dans le contexte caché (~gratuit sur les 11 calls).
    # Le prisme du VENDEUR (et non de la cible) : `profile_data` est le profil ESN
    # sur ce chemin — c'est celui que `resolve_domain_focus` lit déjà pour bâtir le
    # prompt juste au-dessus. Sans lui, le comité rangeait un directeur d'usine en
    # relais terrain chez une société qui vend de l'ingénierie industrielle.
    committee_block = committee_prompt_block(
        assemble_buying_committee(req.contacts or [], industrial=is_industrial_seller(profile))
    )
    if committee_block:
        system_prompt += "\n\n" + committee_block
    # Mémoire de corrections (feedback loop A2) : les retours utilisateur du
    # dossier précédent, cités tels quels, contraignent le nouveau plan (« play X
    # hors sujet — ne pas re-proposer », « contact Y parti »…). ADDITIF : "" sans
    # feedback → prompt byte-identique.
    system_prompt += feedback_directives_block(req.account_feedback)
    # Couche zéro (Annexe méthodo p7-p9) : ce qui EXISTE déjà sur ce compte, avant
    # tout froid — l'historique du CRM connecté de l'ESN (relevé réel, jamais
    # inventé) et les ex-collaborateurs de la cible (canal d'acquisition n°3).
    # Sans CRM connecté ET sans ex-collaborateur (cas par défaut), le bloc est ""
    # → prompt byte-identique. Runtime-only : n'affecte pas les prompts golden.
    _reverse_prospects = summarize_reverse_prospects(req.reverse_prospects)
    system_prompt += zero_layer_block(req.crm_presence, _reverse_prospects, req.internal_history)
    # #4070.2/.4 — ce que l'espace sait de ce compte, DATÉ : affaires gagnées / perdues / en
    # sommeil, missions passées chez ce client, besoins, corrections de l'équipe (le drapeau
    # unique `has_positive_rex` ne les disait pas), les motifs de perte déclarés, les repères
    # du secteur, puis l'analyse précédente en trace dont les corrections humaines gagnent.
    # Jamais nommés par leur provenance ; rien de tout cela ⇒ prompt byte-identique.
    system_prompt += account_facts_block(req.account_facts, "plan")
    system_prompt += lost_deal_motifs_block(req.lost_deal_rex)
    # #4281.2 — les besoins historiques DU compte (base commune), datés, avant les repères du secteur.
    _historical = await _account_historical_needs(req.account_id, req.user_id, req.workspace_id)
    system_prompt += historical_needs_block(_historical)
    _source_ids = _historical.get("source_ids") or []
    system_prompt += sector_referential_block(
        await _sector_referential_chunks(sector_hint, _source_ids[0] if len(_source_ids) == 1 else None)
    )
    system_prompt += previous_analysis_block(req.previous_analysis)
    # Boucle d'apprentissage (§6) : ce que cette ESN a DÉJÀ converti — ou jugé
    # obsolète — sur ses dossiers précédents. Sert à PRIORISER à faits égaux ;
    # ne dit rien de la cible. ADDITIF : "" tant que l'équipe n'a rien déplacé
    # → prompt byte-identique. Runtime-only : n'affecte pas les prompts golden.
    system_prompt += workspace_learning_block(req.workspace_learning)
    # #2451.1 / #2453.7 — le mode de contexte du dossier : "" hors mode
    # (« Mon activité ») → prompt byte-identique. Runtime-only.
    system_prompt += analysis_context_mode_block(req.context_mode)
    # Mouvement d'ouverture recommandé (Annexe méthodo p13, TABLE C) — déterministe,
    # dérivé du SalesContext (stade ESN × archétype compte × relation). Remplace le
    # réflexe générique : petite ESN froide → bottom-up, rang 2 → par le delivery,
    # public → voie contractuelle, relation forte → top-down… ADDITIF : bloc vide si
    # aucun salesContext (prompt inchangé) ; runtime-only → n'affecte pas les goldens.
    # Le bloc vit dans `opening_movement` (et non ici) pour que les goldens de la
    # DoD p31 assertent la différence petite/grande ESN sur le TEXTE DE PROD.
    _movement = recommend_movement_from_context(req.account_data.get("salesContext"))
    # #2273 — la route tient aussi compte des contacts NOMMÉS du dossier (sponsor
    # connu, manager joignable) : même SalesContext, enrichi de ses signaux.
    _route_sales_context = _route_sales_context_of(req)
    _route_context = with_route_signals(_route_sales_context, req.contacts)
    system_prompt += movement_prompt_block(_route_context, req.channel_performance, req.accumulated_route_criteria)
    # Playbook d'ouverture compte froid (#2314.1) : assemble volume premier tour
    # (#2314.33/.35/.36), plafond de qualification (#2314.37), déclencheur
    # sponsor/achats (#2314.10) et familles de rôles terrain (#2314.5) en UN bloc
    # nommé. ADDITIF : "" sur un compte chaud ou sans SalesContext (même garde
    # que `governance_guard`) → prompt inchangé ; runtime-only.
    _sales_context_for_cold_open = req.account_data.get("salesContext") or {}
    system_prompt += cold_account_opening_block(
        (_sales_context_for_cold_open.get("esnProfile") or {}).get("stage"),
        relationship_state_from_context(req.account_data.get("salesContext")),
    )
    # Playbook compte froid bottom-up (issue #2314, LAU-FINAL-055) : étapes,
    # objectif du premier échange, questions par persona, routes sectorielles —
    # recopiées verbatim depuis le corps de l'issue (voir le docstring de
    # `cold_account_playbook`). ADDITIF : "" tant que `relationship.state` n'est
    # pas "froid" (aucun contact connu sur ce compte) → prompt inchangé pour
    # tout dossier déjà relié à un contact ; runtime-only, sans effet sur les
    # goldens.
    system_prompt += cold_account_playbook_block(req.account_data.get("salesContext"), account_data.get("sector"))
    # Routine commerciale (cluster D §17) : le plan se dimensionnait sur le nombre
    # de CONSULTANTS, jamais sur la structure de vente — un fondateur qui vend seul
    # recevait le même volume d'actions qu'une équipe de 5. Le bloc borne le volume,
    # les threads et l'owner sur `salesTeamSize` (SalesContext émis, sinon profil).
    # Questionnaire non renseigné → bloc "" → prompt byte-identique ; runtime-only,
    # donc sans effet sur les goldens.
    system_prompt += team_routines_block(profile, req.account_data.get("salesContext"))
    # "Changer de stratégie": append the user's imposed-strategy directive last,
    # so the LLM builds the whole plan around it (recency = salience).
    system_prompt += _strategy_directive(req.strategy_scope)
    # #3670.5 — la méthode validée structure le diagnostic de compte et la première
    # action (périmètre accessible, interlocuteur utile) ; elle ne fournit aucun fait.
    system_prompt += await method_block_for(
        "analyse_compte",
        situation_terms="ouvrir un compte accès relais compte fermé grand groupe",
        user_id=req.user_id,
        sector=account_data.get("sector"),
        relationship_state=relationship_state_from_context(req.account_data.get("salesContext")),
    )
    # Simple one-call sections. ``action_plan`` is handled separately below: it
    # is the meaty narrative (~8600 output tokens) that, as a single call,
    # truncated its budget and restarted at double — 339s, the whole Phase-4
    # wall time. It is now split into a small ``meta`` call + one call per
    # temporal phase, all gathered with these sections.
    sections = [
        ("offers", 92, 3000),
        ("quick_wins", 94, 2000),
        ("if_no_response", 96, 3000),
        ("evaluation", 97, 2000),
        ("competitive_strategy", 98, 3000),
    ]
    # Structured / list-y sub-calls that don't need Sonnet's reasoning move to
    # Haiku (default; revert with PLAN_LIGHT_MODEL=claude-sonnet-5). quick_wins +
    # if_no_response are checklists; messages is KB-driven templating (like the
    # Haiku classify). The narrative reasoning (action_plan phases, offers,
    # evaluation GO/NO-GO, competitive_strategy) stays on Sonnet.
    _light_model = os.environ.get("PLAN_LIGHT_MODEL") or CLAUDE_HAIKU_MODEL
    _light_sections = {"quick_wins", "if_no_response"}
    # Le cache prompt est indexé PAR MODÈLE : le warm-up ``meta`` plus bas est un
    # appel Sonnet, donc les sections Haiku ne peuvent rien y lire — elles
    # écrivaient chacune leur propre entrée, jamais relue (amortissement 0,27×
    # mesuré côté Haiku). On leur applique la règle du fan-out : la première
    # écrit, les suivantes non.
    _light_order = [name for name, _, _ in sections if name in _light_sections]

    cid = get_correlation_id()

    # #2501 — sections de la phase plan dont un sous-appel a dû dégrader vers
    # un résultat vide après une troncature persistante. Lu par l'appelant pour
    # rendre l'état « plan absent/dégradé » lisible (ni un run marqué en échec,
    # ni un défaut silencieux).
    degraded: list[dict[str, Any]] = []

    async def _run_call(
        prompt_name: str,
        user_prompt: str,
        max_tokens: int,
        progress: int,
        label: str,
        model: str | None = None,
        cache_system: bool = True,
    ) -> tuple[dict, Any]:
        await emit_progress(cb, "plan", "messages", progress, f"Claude génère: {label}…")
        logger.info("Phase4 call start: account_id=%s name=%s", req.account_id, prompt_name)
        out, usage = await call_claude(
            system_prompt,
            user_prompt,
            response_model=dict,
            max_tokens=max_tokens,
            prompt_name=prompt_name,
            correlation_id=cid,
            cache_system=cache_system,
            **({"model": model} if model else {}),
        )
        logger.info("Phase4 call done: account_id=%s name=%s", req.account_id, prompt_name)
        return out, usage

    async def _run_call_resilient(
        prompt_name: str,
        user_prompt: str,
        max_tokens: int,
        progress: int,
        label: str,
        model: str | None = None,
        cache_system: bool = True,
    ) -> tuple[dict, Any]:
        """``_run_call`` avec UNE reprise (jamais une boucle) sur troncature.

        `_call_dict` a déjà doublé le budget jusqu'à `TRUNCATION_RETRY_CAP`
        avant de laisser passer ``ClaudeIncompleteOutputError`` — la remonter
        telle quelle faisait échouer TOUTE l'analyse (#2501 : le bandeau brut
        « InstructorRetryException: The output is incomplete... » vu par
        Louis, alors que recherche/contacts/classify avaient déjà réussi).
        Une seconde tentative, au plafond et avec une consigne de brièveté,
        récupère la plupart des cas ; si elle échoue aussi, la section dégrade
        vers un résultat vide et NOMMÉ (précédent : f139b814d, #761,
        organigramme), jamais silencieux et jamais une exception qui remonte.
        """
        try:
            return await _run_call(
                prompt_name,
                user_prompt,
                max_tokens,
                progress,
                label,
                model=model,
                cache_system=cache_system,
            )
        except ClaudeIncompleteOutputError as exc:
            logger.warning(
                "Phase4 %s tronqué (max_tokens=%d) — reprise UNIQUE avec consigne de concision",
                prompt_name,
                exc.max_tokens,
            )
            try:
                return await _run_call(
                    prompt_name,
                    user_prompt + _CONCISION_DIRECTIVE,
                    TRUNCATION_RETRY_CAP,
                    progress,
                    label,
                    model=model,
                    cache_system=cache_system,
                )
            except ClaudeIncompleteOutputError as retry_exc:
                logger.error(
                    "Phase4 %s tronqué à nouveau après la reprise concise — section "
                    "dégradée (vide), le plan continue sans elle : %s",
                    prompt_name,
                    retry_exc.user_message,
                )
                degraded.append({"section": prompt_name, "code": retry_exc.code, "message": retry_exc.user_message})
                return {}, None

    def _section_coro(section: str, progress: int, section_max_tokens: int):
        is_light = section in _light_sections
        return _run_call_resilient(
            f"bellum_plan_{section}",
            build_subsection_user_prompt(company_name=company_name, section=section, profile_data=profile),
            section_max_tokens,
            progress,
            section,
            model=_light_model if is_light else None,
            # Sections Sonnet : elles LISENT le cache écrit par le warm-up meta
            # → on garde. Sections Haiku : fan-out sur un cache que le warm-up
            # Sonnet n'a pas pu remplir → seule la première l'écrit.
            cache_system=(cache_system_for_fanout(_light_order.index(section)) if is_light else True),
        )

    async def _gen_messages() -> tuple[dict, Any]:
        """Ready-to-send M1 messages for the top contacts — KB-driven (personas,
        8 rules, banned phrases). Own system prompt (not the plan's), runs in the
        same gather so it adds no wall-time. Bounded to the best-ranked contacts."""
        top = _top_contacts_for_messages(req.contacts)
        if not top:
            return {"messages": []}, None
        await emit_progress(cb, "plan", "messages", 95, "Claude rédige les messages contacts…")
        messages_system = (
            # Mémoire de corrections (A2) : un contact signalé parti ne doit pas
            # recevoir de message prêt à envoyer. "" sans feedback = byte-identique.
            bellum_messages.build_system_prompt(profile)
            + feedback_directives_block(req.account_feedback)
            # #4070.2 — la couche zéro des messages : les faits DATÉS du compte (jamais le corps
            # d'un message) et l'analyse précédente. Vides = byte-identique.
            + account_facts_block(req.account_facts, "messages")
            + previous_analysis_block(req.previous_analysis)
        )
        messages_user = bellum_messages.build_user_prompt(
            company_name,
            account_analysis_str,
            top,
            # Relation au compte (annexe méthodo p6) — DERNIER maillon du
            # trajet du kanban : `accounts.commercial_status` → phase 1 →
            # `salesContext.relationship.state` → ici. Le mouvement d'ouverture
            # et le sélecteur d'actions branchaient déjà dessus ; les messages,
            # non : un client actif recevait le M1 d'un inconnu, « zéro mention
            # de l'ESN » comprise. Compte froid / sans SalesContext → bloc vide
            # → prompt byte-identique.
            relationship_state=relationship_state_from_context(req.account_data.get("salesContext")),
            # #2645.2 — le modèle de revenu de l'ESN module les ÉCHÉANCES de la
            # séquence (un revenu ponctuel resserre les relances et repousse la
            # dernière touche après livraison). Il voyage par le même chemin que
            # la relation ci-dessus, pour que le texte rédigé annonce la date
            # sous laquelle la carte l'affichera. Non déclaré → byte-identique.
            revenue_model=revenue_model_from_context(req.account_data.get("salesContext")),
            # Playbook sectoriel (p15-20 : « règles à injecter dans score,
            # contacts, plan ET MESSAGES »). Il n'atteignait que le prompt
            # plan — un message vers une banque et un message vers une
            # startup partageaient donc le même vocabulaire et les mêmes
            # leviers. "" sans secteur reconnu → prompt byte-identique.
            sector_block=sector_block,
            # #1611.5 — le MÊME signal structurel que le plan (angle
            # UNIQUEMENT, jamais le contenu du message). Sans corroboration
            # marché, bloc vide → prompt byte-identique.
            market_memory_block=bellum_messages.market_memory_angle_block(_market_memory_reinforced),
            # #3259 (BEL-SC-230) NO-GO : « Laura génère immédiatement un email
            # alors que la meilleure route est une introduction ou un
            # partenaire. » Le canal à privilégier suit la même route
            # commerciale que le mouvement d'ouverture ci-dessus, jamais un
            # second calcul. Sans SalesContext → bloc vide → byte-identique.
            channel_block=channel_prompt_block(_route_context, req.channel_performance),
            # #3226 (#3202.6) — l'archétype du compte cible (ESN, cabinet de
            # conseil, éditeur…), lu sur `actorType` déjà résolu par
            # `phase1_research.py` (GA-26, jamais recalculé ici). Sans
            # archétype établi ou sans jugement écrit pour lui → bloc vide →
            # prompt byte-identique.
            archetype_block=bellum_messages.account_archetype_message_block(
                archetype_commercial_hint(_archetype_verdict)
            ),
            # #2947 (#2204.7/.11/.15) — la stratégie CHOISIE par l'utilisateur
            # (`req.strategy_scope`, lu aussi par `_strategy_directive` pour le plan)
            # cadre aussi les messages prêts à envoyer, contraintes de forme
            # comprises. Sans stratégie imposée → bloc vide → prompt byte-identique.
            scope_block=bellum_messages.strategy_scope_message_block(req.strategy_scope),
            # #2947 (#2204.10) — la voie d'accès probable (Q6 du dossier),
            # MÊME lecture synchrone que `message.py` (`evaluation.dossier_read
            # .access_path`) : déjà calculée à l'analyse et portée par
            # `req.account_data`, jamais un second appel dans ce `gather` (les
            # lots précédents la croyaient concurrente — elle ne l'est pas,
            # c'est une donnée déjà en main). Sans valeur → bloc vide →
            # prompt byte-identique.
            # #2947 (#2204.11) — l'OBJECTIF choisi dans le même dialogue rejoue
            # M1-M2-M3 pour lui (règles du composer, à l'octet). Sans objectif →
            # bloc vide → prompt byte-identique.
            objective_block=bellum_messages.message_objective_block(
                req.strategy_scope.objective if req.strategy_scope else None,
                relationship_state_from_context(req.account_data.get("salesContext")),
            ),
            access_path_block_text=access_path_block(
                ((req.account_data.get("evaluation") or {}).get("dossier_read") or {}).get("access_path")
                if isinstance(req.account_data, dict)
                else None
            ),
        )
        # #3586 — le même bloc Drive que le plan (déjà calculé, aucun second embedding).
        messages_user = rag_knowledge.append_drive_block(messages_user, _drive_ctx)
        # #2501 — même dégradation gracieuse que les autres sous-appels de la
        # phase : une troncature persistante sur les messages n'efface plus le
        # reste du plan, elle prive seulement de messages prêts à envoyer.
        async def _ask_light() -> tuple[dict, Any]:
            try:
                return await call_claude(
                    messages_system,
                    messages_user,
                    response_model=dict,
                    max_tokens=4000,
                    prompt_name="bellum_messages",
                    correlation_id=cid,
                    # KB-driven templating (personas + rules) — Haiku hits it like the
                    # classify contact pass. Env-revertible via PLAN_LIGHT_MODEL.
                    model=_light_model,
                )
            except ClaudeIncompleteOutputError as exc:
                logger.warning(
                    "Phase4 bellum_messages tronqué (max_tokens=%d) — reprise UNIQUE avec consigne de concision",
                    exc.max_tokens,
                )
                try:
                    return await call_claude(
                        messages_system,
                        messages_user + _CONCISION_DIRECTIVE,
                        response_model=dict,
                        max_tokens=TRUNCATION_RETRY_CAP,
                        prompt_name="bellum_messages",
                        correlation_id=cid,
                        model=_light_model,
                    )
                except ClaudeIncompleteOutputError as retry_exc:
                    logger.error(
                        "Phase4 bellum_messages tronqué à nouveau après la reprise concise — "
                        "messages contacts dégradés (vides), le plan continue sans eux : %s",
                        retry_exc.user_message,
                    )
                    degraded.append(
                        {"section": "bellum_messages", "code": retry_exc.code, "message": retry_exc.user_message}
                    )
                    return {"messages": []}, None

        out, usage = await _ask_light()
        if _usable_messages(out) or usage is None:
            # Réponse exploitable — ou dégradation déjà nommée par la troncature (usage None).
            return out, usage
        # #O8 — recette Loïc 21/10 : des contacts nommés, mais aucune réponse exploitable
        # (liste vide, clé absente, enveloppe non déballée). Prod OGF : 7079 tokens en entrée,
        # 21 en sortie sur le modèle léger. UNE reprise sur le modèle PRINCIPAL du plan.
        logger.warning(
            "Phase4 bellum_messages vide malgré %d contact(s) — reprise UNIQUE sur le modèle principal [cid=%s]",
            len(top),
            cid,
        )
        try:
            out2, usage2 = await call_claude(
                messages_system,
                messages_user,
                response_model=dict,
                max_tokens=4000,
                prompt_name="bellum_messages",
                correlation_id=cid,
                model=CLAUDE_MODEL,
            )
        except ClaudeIncompleteOutputError as exc:
            out2, usage2 = {}, None
            logger.warning("Phase4 bellum_messages : reprise tronquée : %s", exc.user_message)
        if _usable_messages(out2):
            return out2, _merge_usage(usage, usage2)
        logger.error(
            "Phase4 bellum_messages vide après reprise — %d contact(s) sans message prêt à envoyer [cid=%s]",
            len(top),
            cid,
        )
        degraded.append(
            {
                "section": "bellum_messages",
                "code": "empty_output",
                "message": (
                    "Les messages prêts à envoyer n'ont pas pu être rédigés : "
                    "le modèle n'a rendu aucun message, même après une seconde tentative. "
                    "Relancez l'analyse pour les obtenir."
                ),
            }
        )
        return {"messages": []}, _merge_usage(usage, usage2)

    # action_plan, split: one small header call (strategy + justification) and
    # one call per temporal phase. Le découpage devait suffire à sortir du
    # chemin de troncature-doublement de l'appel monolithique ; la production a
    # montré que non pour l'en-tête (voir ACTION_PLAN_META_MAX_TOKENS), dont la
    # « stratégie + justification » est plus longue que 1500 tokens.
    n_phases = len(ACTION_PLAN_PHASES)

    # Warm the prompt cache: the meta call runs FIRST and writes the shared
    # account+contacts block (in the cached system) once. Only then do the 10
    # remaining calls fire concurrently — they read that block from cache.
    meta_result = await _run_call_resilient(
        "bellum_plan_action_plan_meta",
        build_action_plan_meta_prompt(company_name=company_name),
        ACTION_PLAN_META_MAX_TOKENS,
        90,
        "action_plan (stratégie)",
    )

    # C4: every call below is independent (same inputs, no call consumes
    # another's output), so they run concurrently. ``asyncio.gather`` collapses
    # wall-time to the slowest single call; the shared Claude rate-limiter
    # (``throttle`` inside ``call_claude``) bounds real provider concurrency.
    rest_coros = [
        _run_call_resilient(
            f"bellum_plan_action_plan_phase_{idx}",
            build_action_plan_phase_prompt(company_name=company_name, phase_name=phase_name),
            ACTION_PLAN_PHASE_MAX_TOKENS,
            91,
            f"action_plan · {phase_name}",
        )
        for idx, phase_name in enumerate(ACTION_PLAN_PHASES)
    ]
    rest_coros += [_section_coro(*s) for s in sections]
    rest_coros.append(_gen_messages())

    # Cancel the in-flight calls if one fails: a bare ``gather`` leaves the other
    # ~10 Claude calls running (and billing) in the background after the first
    # error. Phases 1 and 3 already cancel on failure — mirror that here.
    rest_tasks = [asyncio.ensure_future(c) for c in rest_coros]
    try:
        rest_results = await asyncio.gather(*rest_tasks)
    except BaseException:
        for t in rest_tasks:
            if not t.done():
                t.cancel()
        raise
    phase_results = rest_results[:n_phases]
    section_results = rest_results[n_phases : n_phases + len(sections)]
    msg_out, msg_usage = rest_results[-1]

    merged: dict[str, Any] = {}
    total_input = total_output = 0
    total_cache_read = total_cache_creation = 0
    total_cost = 0.0

    def _accumulate(usage: Any) -> None:
        nonlocal total_input, total_output, total_cache_read, total_cache_creation, total_cost
        if usage is not None:
            total_input += usage.input_tokens
            total_output += usage.output_tokens
            total_cache_read += usage.cache_read_tokens
            total_cache_creation += usage.cache_creation_tokens
            total_cost += usage.cost_usd

    for out, usage in section_results:
        _accumulate(usage)
        merged.update(out)

    # Reassemble actionPlan from its split parts: header (strategy/justification)
    # + the phases in their fixed temporal order.
    meta_out, meta_usage = meta_result
    _accumulate(meta_usage)
    action_plan: dict[str, Any] = {
        "strategy": meta_out.get("strategy", ""),
        "justification": meta_out.get("justification", ""),
        "phases": [],
    }
    for (out, usage), phase_name in zip(phase_results, ACTION_PLAN_PHASES, strict=False):
        _accumulate(usage)
        phase = out.get("phase") if isinstance(out.get("phase"), dict) else out
        if isinstance(phase, dict):
            phase.setdefault("name", phase_name)
            action_plan["phases"].append(phase)
    merged["actionPlan"] = action_plan

    # Ready-to-send contact messages: generated by _gen_messages above (KB-driven,
    # bounded to the top contacts) and surfaced as ``contactMessages`` so the API
    # worker persists them onto each contact (email_message / linkedin_message /
    # phone_script) — the headline "messages prêts à envoyer" deliverable.
    _accumulate(msg_usage)
    contact_messages = msg_out.get("messages", []) if isinstance(msg_out, dict) else []
    merged.setdefault("prioritySubAccounts", [])
    # Lu ici (et non plus bas) parce que le PROFIL ESN entre dans le /25 : la
    # normalisation du score a besoin du stade et de l'archétype.
    _sales_context = req.account_data.get("salesContext")
    _normalize_plan_scores(merged, _sales_context)
    _normalize_dossier_read_block(merged, profile, req.account_data.get("competitors") or [])

    # Self-consistency (A1) : snapshot du jugement de score de la PASSE 1 tel que
    # normalisé (clamp + somme /25 + bande) et AVANT le cap qualité — le cap est
    # une gate déterministe, pas un jugement LLM : comparer la passe 2 (non
    # cappée) à une passe 1 cappée fabriquerait une fausse divergence.
    _pass1_evaluation = (
        {"score": merged["evaluation"].get("score"), "verdict": merged["evaluation"].get("verdict")}
        if isinstance(merged.get("evaluation"), dict)
        else None
    )

    # SalesContext-driven deterministic layer (P2/P3, Annexe méthodo) — additive,
    # never rewrites the LLM plan. Movement = the opening (TABLE C p13) ; nextActions
    # = the 3-5 hierarchised moves (MOTEUR rule p28), keyed on the verdict + the
    # relationship + whether data is missing (EXPLORER / trop_faible → collect info).
    _plan_verdict = merged.get("evaluation", {}).get("verdict") if isinstance(merged.get("evaluation"), dict) else None
    _data_missing = (merged.get("evaluation", {}).get("qualityCapReason") == "trop_faible") or (
        _plan_verdict == "EXPLORER"
    )
    # #3278.b — le signal suivi (daté au jour) se NOMME sur le plan, avec ou sans SalesContext.
    attach_plan_followed_signal(merged, account_data)
    if _sales_context:
        merged["recommendedMovement"] = _movement
        # #2959 (recette prod 02/10) — la route calculée voyage aussi dans le plan
        # RENDU : jusqu'ici elle n'entrait que dans le prompt, aucun écran ne la
        # montrait. Même signaux que le bloc de prompt (`_route_context`).
        _route_payload = recommended_route_for_plan(
            _route_sales_context,
            req.contacts,
            accumulated_criteria=req.accumulated_route_criteria,
            account_data=account_data,
        )
        if _route_payload:
            merged["recommendedRoute"] = _route_payload
        # #2424.10 — câblage restant : `salesContext.account.hasPositiveRex`
        # n'est ÉMIS nulle part (phase1_research ne lit aucune donnée REX), donc
        # jamais vrai en pratique côté `recommend_actions_from_context`. Lu ICI,
        # au moment du plan, plutôt que dans la recherche externe (phase 1,
        # verrouillée par des goldens octet-identiques) : un appel de PLUS,
        # best-effort et jamais bloquant — un REX indisponible reste le
        # comportement d'avant (réflexe générique `foisonner_bu`), jamais un
        # signal deviné.
        # #4070.2 — le drapeau ne dit plus tout seul : une affaire gagnée ou une mission menée
        # chez ce client (de tout âge, le prompt la date) est un REX positif.
        _has_positive_rex = has_positive_rex_from_facts(req.account_facts) or await _account_has_positive_rex(
            account_id=req.account_id, user_id=req.user_id
        )
        merged["nextActions"] = recommend_actions_from_context(
            _sales_context,
            verdict=_plan_verdict,
            has_missing_data=bool(_data_missing),
            horizon="7j",
            has_positive_rex=_has_positive_rex,
            # #3226 (#3202.6) — voir le calcul de `_archetype_verdict` plus haut.
            target_is_partnership_candidate=is_partnership_candidate_archetype(_archetype_verdict),
        )
        # Horizons 7/30/60/90 (p27) : les actions retenues sont AUSSI livrées
        # rangées par échéance, dans l'ordre de rang à l'intérieur de chaque
        # bucket — le commercial voit « cette semaine » avant « ce trimestre »
        # au lieu d'une liste plate. Les buckets vides sont omis (jamais de
        # section creuse). `nextActions` est inchangé : la vue groupée s'ajoute.
        merged["nextActionsByHorizon"] = {
            horizon: actions for horizon, actions in group_actions_by_horizon(merged["nextActions"]).items() if actions
        }

    plan_output = ActionPlanOutput.model_validate(merged)
    await emit_progress(cb, "plan", "messages", 99, "Plan d'action prêt")
    data = plan_output.model_dump(by_alias=True)
    # Carried outside ActionPlanOutput (not part of the plan schema) — the worker
    # reads data.contactMessages and applies it to the persisted contacts.
    data["contactMessages"] = contact_messages
    # #3777 / #3717.7 — l'identifiant d'exécution PARTAGÉ : le plan multi-semaines et « Prochaines
    # actions » sortent de ce même passage, Laura le restitue (`build_account_briefing`).
    stamp_execution_id(data, cid)
    # Output-contract objects (bellum_front_payload_v1 / 00_MASTER §5), computed
    # deterministically (no LLM). Assembled BEFORE the Quality Judge so the judge
    # gates them too:
    # - nextBestAction: the single most useful next move for the Vue d'ensemble.
    # - executiveSummary: the 5-line decision header.
    # - plays: the ≤3 consolidated plays (§5); uses the strategy-scoped
    #   account_data so plays anchor on the chosen angle.
    # #1925 — the headline move is judged on the request's structured data
    # (profile, research, contacts, ex-collaborators): see _next_best_action.
    data["nextBestAction"] = _next_best_action(
        data,
        registry_from_inputs(
            profile=profile,
            research=account_data or {},
            contacts=req.contacts or [],
            reverse_prospects=req.reverse_prospects or [],
        ),
    )
    data["executiveSummary"] = _executive_summary(data, account_data or {}, req.contacts or [])
    data["plays"] = _plays(data, account_data or {}, req.contacts or [], contact_messages)
    # Offres commerciales structurées (roadmap §14 — « EJM et durées sans
    # provenance claire ») : chaque offre devient une CommercialOffer typée —
    # estimation d'effort/durée TOUJOURS marquée hypothèse (estimate=true +
    # raisonnement en clair), editable=true (signal UI), rateBasis=None (à
    # relier aux tarifs du client, JAMAIS un tarif inventé), provenance reliée
    # aux signaux sourcés de la recherche (le même registre que _play_evidence)
    # + verdict de complétude (offre sans justification → faible, jamais
    # supprimée). ADDITIF : offersToPropose reste inchangé pour les
    # consommateurs existants. Assemblé AVANT le Quality Judge (comme plays).
    data["commercialOffers"] = build_commercial_offers(data.get("offersToPropose") or [], account_data or {})
    # Logique Axians (Théo #4): surface the insider/complement relationship so the
    # front can badge it ("complément du groupe, pas frontal").
    if insider:
        data["groupRelationship"] = insider
    # Couche zéro (annexe p7/p9) : les ex-collaborateurs de la cible étaient
    # calculés en phase 2 puis JETÉS — un angle chaud à la poubelle. On les fait
    # voyager avec le plan pour que l'API les persiste (raw_analysis.plan) et que
    # le dossier les affiche. Clé posée seulement s'il y en a : un replan sans
    # ce signal ne doit pas effacer une liste déjà persistée, et le front ne doit
    # rien afficher quand la donnée n'existe pas.
    if _reverse_prospects:
        data["reverseProspects"] = _reverse_prospects
    # Typed decision Cockpit (Théo #7) — aggregates the decision surfaces into ONE
    # typed object the future chatbot / mémoire continue reads (single anchor,
    # validated shape). Snapshot view; the per-field surfaces above stay for the
    # current front.
    data["cockpit"] = Cockpit(
        executiveSummary=data["executiveSummary"],
        nextBestAction=data["nextBestAction"],
        plays=data["plays"],
        groupRelationship=insider,
    ).model_dump(by_alias=True)
    # Quality Judge (V1-vendable §9.8/§10.12): deterministic LAST gate over the
    # FULLY assembled dossier — runs after plays/executiveSummary/nextBestAction so
    # a forbidden-as-fact hook (§8: stale dirigeant, exact budget) that surfaces in
    # a play card or the exec summary is caught, not just claims in the raw research
    # (red-team: the two headline surfaces used to bypass the judge entirely).
    data["quality"] = judge_quality(
        research=req.account_data or {},
        contacts=req.contacts or [],
        plan=data,
    )
    # missingData: what the user must still verify (from the Quality Judge).
    data["missingData"] = {
        "factsMissingSource": data["quality"].get("factsMissingSource") or [],
        "hypothesesToVerify": data["quality"].get("hypothesesToVerify") or [],
    }
    # Quality gate DEGRADES the account verdict (Théo restitution §6/§7 : "Score
    # doit être recalculé après gates qualité" ; gate G6 : "Blocage ou dégradation
    # si incohérence, obsolescence ou faible confiance"). The judge used to only
    # produce a verdict that nobody read back into the score — a hallucination /
    # trop_faible dossier still shipped a GO. Runs BEFORE the /25↔/10 reconciliation
    # below so priorityScore inherits the cap.
    _apply_quality_cap(data.get("evaluation"), data["quality"].get("verdict"))
    # - Score reconciliation (§1): the canonical account score is the /25 verdict
    #   computed here (plan.evaluation). Phase-1 persisted its own /10 priorityScore
    #   from a separate scorer, so the two could disagree (Vinci: /10=4 vs 17/25).
    #   Derive the /10 from the /25 via the shared band map so the account bucket
    #   (chaud/moyen/froid) and the verdict never contradict each other.
    _eval = data.get("evaluation") or {}
    _eval_score = _eval.get("score")
    _eval_reason = _eval.get("justification")
    # Reconcile on a VALID /25 score alone (>= 1) — decoupled from the
    # justification (red-team: a valid PRUDENT/25 with an empty justification used
    # to skip the write and keep the stale phase-1 /10, re-creating the exact
    # /25↔/10 contradiction this reconciliation kills). The justification rides
    # along when present, else the phase-1 reason is kept (COALESCE in applyPlan).
    if isinstance(_eval_score, (int, float)) and _eval_score >= 1:
        data["priorityScore"] = legacy_global_score(int(_eval_score))
        if _eval_reason:
            data["priorityJustification"] = _eval_reason
    # Two explicit score axes (Théo P1 « Score et quick wins ») — surface the
    # business fit (commercialScore /100, band-faithful with the verdict just
    # reconciled above) SEPARATELY from how trustworthy the underlying data is
    # (dataConfidence /100, reused from the Phase-1 confidence), and attach the
    # evidence list: each factor tied to a proof (signal/source/contact/profile/
    # business_rule). Deterministic, runs AFTER the quality cap + reconciliation
    # so both axes reflect the final verdict.
    _axes = build_score_axes(
        evaluation=data.get("evaluation") or {},
        confidence=(req.account_data or {}).get("confidence") or {},
    )
    data["commercialScore"] = _axes["commercialScore"]
    data["dataConfidence"] = _axes["dataConfidence"]
    data["scoreFactors"] = _axes["scoreFactors"]
    # Quick wins et risques DATÉS + reliés à une preuve (Théo p28 : « recalculés
    # après chaque enrichissement, avec preuve et date »). Post-traitement
    # déterministe de la sortie du modèle — les prompts ne bougent pas (golden
    # tests) et la taxonomie de preuve est celle des facteurs de score
    # (signal/source/contact/profile/business_rule). Un item qu'on ne peut relier
    # à aucune donnée réelle du dossier reste SANS preuve plutôt qu'avec une
    # citation inventée (§8). Tourne en dernier pour dater l'état FINAL des
    # risques (après le plafonnement qualité).
    _stamped_at = datetime.now(UTC).isoformat()
    stamp_dated_proof(
        data.get("quick_wins") or [],
        account_data=account_data or {},
        contacts=req.contacts or [],
        computed_at=_stamped_at,
    )
    stamp_dated_proof(
        (data.get("evaluation") or {}).get("risks") or [],
        account_data=account_data or {},
        contacts=req.contacts or [],
        computed_at=_stamped_at,
    )
    # ── Self-consistency (A1, ON par défaut — kill-switch SELF_CONSISTENCY_DISABLED)
    # Double dérivation des 3 jugements clés (score /25 + verdict, top-3 plays,
    # top-5 contacts) : 2e appels indépendants + comparaison déterministe →
    # confiance par section + divergences flaggées. La valeur RETENUE reste la
    # passe 1 (rien au-dessus n'est modifié) ; la passe 2 mesure. Échec gracieux
    # (« non mesurée »), jamais un run cassé. ``call_claude`` est passé depuis les
    # globals du module pour que les tests qui le patchent restent hermétiques.
    #
    # ⚠️ Cette mesure part APRÈS `emit_progress(… 99, "Plan d'action prêt")` et
    # elle appelle `call_claude` par paramètre : elle n'écrit donc AUCUNE ligne
    # « Phase4 call start/done » et ne bouge plus la barre. Vu de dehors, la
    # phase ne fait plus rien — alors qu'elle relance jusqu'à trois appels
    # portant chacun le bloc compte complet. Sur un gros compte (SNCF), ces
    # appels ont consommé ~2 minutes du budget de phase et l'ont fait expirer :
    # une mesure CONSULTATIVE tuait le livrable qu'elle mesure. D'où son propre
    # budget : au-delà, on abandonne la mesure, pas le plan.
    _sc_block, _sc_usages = await _measure_self_consistency_bounded(
        system_prompt=system_prompt,
        company_name=company_name,
        profile=profile,
        account_data=account_data or {},
        evaluation=_pass1_evaluation,
        plays=data.get("plays") or [],
        contacts=req.contacts or [],
        correlation_id=cid,
    )
    if _sc_block is not None:
        data["selfConsistency"] = _sc_block
    # Le coût de la 2e passe compte dans le coût de la phase (→ cost_eur côté worker).
    for _sc_usage in _sc_usages:
        _accumulate(_sc_usage)
    # B1 telemetry: total token cost across the 6 sequential section calls,
    # surfaced on the envelope meta so the API worker accumulates it into
    # ``api_cost_euros``.
    data["_api_metrics"] = {
        "token_usage": {
            "input_tokens": total_input,
            "output_tokens": total_output,
            "cost_usd": total_cost,
            "cache_read_input_tokens": total_cache_read,
            "cache_creation_input_tokens": total_cache_creation,
        }
    }
    if _market_memory_versions:
        data["_api_metrics"]["market_memory_version"] = _market_memory_versions[0]
    # #2501 — sections dégradées (troncature persistante après la reprise
    # concise) : le dossier part quand même, mais l'état n'est pas silencieux.
    # Additif, jamais présent quand tout a réussi.
    if degraded:
        data["planDegradedSections"] = degraded
    return PlanResponse(success=True, data=data)


PHASE4_AGENT_NAME = "strategist"
PHASE4_AGENT_VERSION = "1.0.0"


def _token_usage_from_metrics(metrics: dict) -> TokenUsage | None:
    """Build the envelope ``TokenUsage`` from the stashed ``_api_metrics``."""
    raw = metrics.get("token_usage")
    if not isinstance(raw, dict):
        return None
    return TokenUsage(
        input_tokens=raw.get("input_tokens", 0),
        output_tokens=raw.get("output_tokens", 0),
        cost_usd=raw.get("cost_usd", 0.0),
        cache_read_input_tokens=raw.get("cache_read_input_tokens", 0),
        cache_creation_input_tokens=raw.get("cache_creation_input_tokens", 0),
    )


def _build_meta(
    *,
    started_at: datetime,
    t0_monotonic: float,
    correlation_id: str,
    token_usage: TokenUsage | None = None,
    warnings: list[AgentWarning] | None = None,
) -> AgentMeta:
    return AgentMeta(
        agent_name=PHASE4_AGENT_NAME,
        agent_version=PHASE4_AGENT_VERSION,
        correlation_id=correlation_id,
        started_at=started_at.isoformat(),
        finished_at=datetime.now(UTC).isoformat(),
        duration_ms=int((time.monotonic() - t0_monotonic) * 1000),
        prompt_name="bellum_plan",
        token_usage=token_usage,
        warnings=warnings,
    )


def _envelope_response(envelope: AgentEnvelope, *, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=envelope.model_dump(mode="json", exclude_none=True, by_alias=True),
    )


async def _plan_with_envelope(req: PlanRequest, request: Request) -> JSONResponse:
    """Wrap ``_plan`` so the response always parses as ``AgentEnvelope``.

    Preserves HTTP status codes (422 / 402 / 499 / 5xx) the API worker
    already understands; only the body shape changes under the flag.
    """
    started_at = datetime.now(UTC)
    t0 = time.monotonic()
    correlation_id = get_correlation_id() or ""

    if not req.account_data:
        envelope = AgentEnvelope[StrategyData](
            status=AgentStatus.TERMINAL_FAILURE,
            data=None,
            error=AgentError(
                code="AGENT_PRECONDITION_FAILED",
                service=ErrorService.PRECONDITION,
                severity=ErrorSeverity.TERMINAL,
                retryable=False,
                user_message="Données d'analyse manquantes pour générer le plan d'action.",
                debug_message="Phase 4 requires non-empty account_data (research output); got an empty payload.",
                context={"missing": "account_data"},
            ),
            meta=_build_meta(
                started_at=started_at,
                t0_monotonic=t0,
                correlation_id=correlation_id,
            ),
        )
        return _envelope_response(envelope, status_code=412)

    try:
        response = await run_or_cancel(request, _plan(req))
    except HTTPException as exc:
        if exc.status_code == 499:
            envelope = AgentEnvelope[StrategyData](
                status=AgentStatus.CANCELLED,
                data=None,
                error=None,
                meta=_build_meta(
                    started_at=started_at,
                    t0_monotonic=t0,
                    correlation_id=correlation_id,
                ),
            )
            return _envelope_response(envelope, status_code=499)
        retryable = 500 <= exc.status_code < 600 and exc.status_code != 501
        envelope = AgentEnvelope[StrategyData](
            status=(AgentStatus.RECOVERABLE_FAILURE if retryable else AgentStatus.TERMINAL_FAILURE),
            data=None,
            error=AgentError(
                code="HTTP_UNAVAILABLE" if retryable else "HTTP_REJECTED",
                service=ErrorService.INTERNAL,
                severity=(ErrorSeverity.RECOVERABLE if retryable else ErrorSeverity.TERMINAL),
                retryable=retryable,
                user_message=(
                    "Service indisponible. Nouvelle tentative en cours."
                    if retryable
                    else "Le service a refusé la requête. L'équipe a été notifiée."
                ),
                debug_message=f"HTTP {exc.status_code}: {exc.detail}",
                context={"status": exc.status_code},
            ),
            meta=_build_meta(
                started_at=started_at,
                t0_monotonic=t0,
                correlation_id=correlation_id,
            ),
        )
        return _envelope_response(envelope, status_code=exc.status_code)
    except ClaudeError as exc:
        envelope = AgentEnvelope[StrategyData](
            status=AgentStatus.TERMINAL_FAILURE,
            data=None,
            error=AgentError.from_claude_error(exc, context={"correlation_id": correlation_id}),
            meta=_build_meta(
                started_at=started_at,
                t0_monotonic=t0,
                correlation_id=correlation_id,
            ),
        )
        return _envelope_response(envelope, status_code=422)
    except Exception as exc:  # noqa: BLE001
        logger.error("Phase 4 unexpected failure", exc_info=exc)
        envelope = AgentEnvelope[StrategyData](
            status=AgentStatus.TERMINAL_FAILURE,
            data=None,
            error=AgentError.from_unexpected(exc, agent_name=PHASE4_AGENT_NAME),
            meta=_build_meta(
                started_at=started_at,
                t0_monotonic=t0,
                correlation_id=correlation_id,
            ),
        )
        return _envelope_response(envelope, status_code=500)

    metrics = response.data.get("_api_metrics", {}) if isinstance(response.data, dict) else {}
    token_usage = _token_usage_from_metrics(metrics)
    data = StrategyData.model_validate(response.data) if response.data else None
    # #2501 — une ou plusieurs sections ont dégradé (troncature persistante) :
    # succès partiel NOMMÉ plutôt qu'un succès silencieux ou un échec total.
    # Voir agent_docs/agent-contract.md §2 (AgentStatus.PARTIAL_SUCCESS).
    degraded_sections = response.data.get("planDegradedSections") if isinstance(response.data, dict) else None
    if degraded_sections:
        envelope = AgentEnvelope[StrategyData](
            status=AgentStatus.PARTIAL_SUCCESS,
            data=data,
            error=None,
            meta=_build_meta(
                started_at=started_at,
                t0_monotonic=t0,
                correlation_id=correlation_id,
                token_usage=token_usage,
                warnings=[
                    AgentWarning(
                        code="PLAN_SECTION_TRUNCATED",
                        message=str(item.get("message") or "Section du plan tronquée."),
                        context={"section": item.get("section"), "code": item.get("code")},
                    )
                    for item in degraded_sections
                ],
            ),
        )
        return _envelope_response(envelope, status_code=200)
    envelope = AgentEnvelope[StrategyData](
        status=AgentStatus.SUCCESS,
        data=data,
        error=None,
        meta=_build_meta(
            started_at=started_at,
            t0_monotonic=t0,
            correlation_id=correlation_id,
            token_usage=token_usage,
        ),
    )
    return _envelope_response(envelope, status_code=200)


@router.post("/plan")
async def plan(req: PlanRequest, request: Request):
    """Phase 4 HTTP entrypoint — always returns an ``AgentEnvelope``."""
    return await _plan_with_envelope(req, request)
