"""Phase 3 — Classification orchestration.

Owns the BELLUM-CONTACTS (batched) + BELLUM-ORGANIGRAMME parallel run that
turns Phase 2's raw contact seeds into a classified list (role + priority
+ summary + whyContact) plus a reconstructed decision graph. The router
is a thin HTTP adapter on top of ``classify_contacts_and_organigramme``.

Naming note: the public-facing step name in the UI (``classification``)
intentionally differs from any Apollo "enrichment" — Apollo People-Match
(email/phone) is on-demand only and lives in a separate endpoint.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections.abc import Mapping
from dataclasses import replace
from typing import Any

from app.middleware.correlation_id import get_correlation_id
from app.models.classify import ClassifyRequest
from app.models.outputs.contacts import ContactsOutput, EnrichedContact, OrganigrammeOutput
from app.prompts import bellum_contacts, bellum_organigramme
from app.services.account_feedback import feedback_directives_block
from app.services.analysis_account_facts import known_contacts_block
from app.services.claude_service import (
    CLAUDE_HAIKU_MODEL,
    ClaudeIncompleteOutputError,
    cache_system_for_fanout,
    call_claude,
)
from app.services.contact_priority_score import (
    SellerContext,
    deterministic_priority,
    seller_context_from_profile,
)
from app.services.contact_ranking import rank_contacts_for_enrichment
from app.services.contact_themes import target_families
from app.services.decision_role import classify_decision_role
from app.services.domain_focus import home_country_for, is_industrial_seller
from app.services.org_context_blocks import (
    direction_scope_block,
    entity_scope_block,
    existing_graph_summary_block,
    graph_coverage_block,
    project_context_block,
    relation_evidence_block,
    workspace_corrections_block,
)
from app.services.progress import emit_progress
from app.services.protected_criteria import strip_protected_criteria
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)


# BELLUM-CONTACTS batch size. 50 → 25 → 12 after successive Haiku 4.5 max_tokens
# truncations: each EnrichedContact grew (careerLevers / implicitFears arrays),
# so a 25-contact batch now generates ~23k output and blows the 16k cap — the
# WHOLE batch is then dropped (observed: 25/30 SG contacts lost). A batch of 12
# stays ~11k out, safely under 16k. Smaller batches = more parallel Haiku calls
# (cheap, and they finish faster than one truncating-to-the-limit call).
#
# Hard ceiling of 15: a stale env override (dev.secret.sh / Railway both had 25)
# silently truncated a whole batch = data loss. The ceiling makes the safe value
# self-applying in prod — the env can only tune DOWN, never back into the danger
# zone. Raise _MAX_SAFE_BATCH only alongside a smaller per-contact output.
_MAX_SAFE_BATCH = 15
CONTACTS_BATCH_SIZE = min(int(os.getenv("CONTACTS_BATCH_SIZE", "12")), _MAX_SAFE_BATCH)

# Cap on how many contacts get the expensive BELLUM-CONTACTS LLM pass. Apollo
# People-Search dumps 100+ people (pool up to 5000); LLM-enriching the whole
# list was the biggest cost + latency sink of a run (classify emitted 53-73k
# output tokens, ~250s). We deterministically rank (decision_role / hierarchy /
# IT-decider, interns excluded) and enrich only the top N; the tail stays seeded
# in the DB from Phase 2 (name / title / Apollo details) with bucket +
# hierarchyLevel computed at telemetry time.
#
# Default 50 (vannes ouvertes — depth by default): covers the full buying
# committee of a large account (comex + DSI + achats + métiers), not just its
# head. Chiffrage (telemetry: batch of 12 ≈ ~11k output ≈ ~917 tok/contact,
# Haiku 4.5 $1/M in $5/M out): 30 contacts ≈ 3 batches ≈ $0.16 ; 50 ≈ 5 batches
# ≈ $0.27 → +$0.11 ≈ +0,10€/run WORST CASE (only when Apollo returns ≥50
# candidates). Wall-time unchanged: batches run in parallel (Claude throttle
# 50 rpm / 10 concurrent admits 5 batches + organigramme in one wave) and the
# organigramme stays the critical path. Set to 0 to disable the cap (enrich
# everything) — the revert switch. Env tunes DOWN for cost if needed.
CONTACTS_ENRICH_MAX = int(os.getenv("CONTACTS_ENRICH_MAX", "50"))


def _chunks(items: list[Any], size: int) -> list[list[Any]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def _usage_field(usage: Any, field: str, default: float = 0) -> float:
    """Read a token-usage field from a TokenUsage object (prod) or dict (tests)."""
    if usage is None:
        return default
    if isinstance(usage, dict):
        return usage.get(field, default)
    return getattr(usage, field, default)


async def _run_contacts_batch(
    *,
    batch_idx: int,
    batch_total: int,
    batch: list[Any],
    company_name: str,
    profile: dict,
    entities_str: str,
    angles_str: str,
    pains_str: str,
    correlation_id: str,
    feedback_block: str = "",
    sector_block: str = "",
    industrial_seller: bool = False,
) -> tuple[list[EnrichedContact], Any]:
    """Run BELLUM-CONTACTS on a single batch. Per-batch failures are logged
    and swallowed — we'd rather return a partial classification than 502
    the whole pipeline. Returns ``(contacts, token_usage)`` so Phase 3 can
    report its real cost (the classify telemetry was blind = $0).

    ``feedback_block`` — bloc « retours utilisateur » (feedback loop A2), déjà
    rendu par ``feedback_directives_block``. "" (défaut) = prompt byte-identique.
    """
    system = bellum_contacts.build_system_prompt(profile) + feedback_block
    user = bellum_contacts.build_user_prompt(
        company_name=company_name,
        contacts=json.dumps(batch, ensure_ascii=False),
        entities=entities_str,
        angles=angles_str,
        pains=pains_str,
        profile_data=profile,
        sector_block=sector_block,
    )
    t0 = time.monotonic()
    try:
        # bellum_contacts = per-contact classification (role / priority
        # / 2-sentence summary). Pure schema-filling, no strategic
        # reasoning — Haiku 4.5 handles it cleanly at ~12× lower cost
        # than Sonnet, which matters most here because this prompt
        # runs N times in parallel (one per batch of 50).
        output, usage = await call_claude(
            system,
            user,
            response_model=ContactsOutput,
            model=CLAUDE_HAIKU_MODEL,
            prompt_name=f"bellum_contacts_batch_{batch_idx + 1}_of_{batch_total}",
            correlation_id=correlation_id,
            # Les N batches partent ensemble avec le MÊME system prompt : seul
            # le premier écrit le cache (les autres ne peuvent pas encore le
            # lire, et le réécrire coûte 1,25× pour rien). L'entrée reste
            # disponible pour le run suivant dans la fenêtre TTL.
            cache_system=cache_system_for_fanout(batch_idx),
        )
    except Exception as exc:
        logger.warning(
            "Phase 3 contacts batch %d/%d failed (%d contacts skipped): %s",
            batch_idx + 1,
            batch_total,
            len(batch),
            exc,
        )
        return [], None
    # call_claude is statically typed as ``T | dict | str`` because the
    # overload covers dict / text variants too — narrow back to the
    # concrete model we requested.
    assert isinstance(output, ContactsOutput)
    # Deterministic override: map the title to the deck decision role
    # (technical / economic / user / champion) when a rule fires, so the roles are
    # consistent regardless of how the LLM worded them — and the "≥1 décideur IT"
    # gate fires reliably. Titles that match no rule keep the LLM role.
    logger.info(
        "Phase 3 timing: contacts batch %d/%d (Haiku, %d contacts) done in %.1fs",
        batch_idx + 1,
        batch_total,
        len(batch),
        time.monotonic() - t0,
    )
    out: list[EnrichedContact] = []
    for c in output.contacts:
        role = classify_decision_role(c.title, industrial=industrial_seller)
        out.append(c.model_copy(update={"role": role}) if role else c)
    return out, usage


async def _run_organigramme(
    *,
    profile: dict,
    company_name: str,
    contacts_str: str,
    entities_str: str,
    angles_str: str,
    pains_str: str,
    correlation_id: str,
    feedback_block: str = "",
    relationship: str = "",
    signals: str = "",
    memory: str = "",
    context_blocks: dict[str, str] | None = None,
) -> tuple[OrganigrammeOutput, Any]:
    """Run BELLUM ACCOUNT MAPPING — single Claude call, reconstructs the
    decision graph from the full contact list. Returns ``(output, usage)``.

    ``feedback_block`` — bloc « retours utilisateur » (A2), "" = byte-identique.
    ``relationship`` / ``signals`` / ``memory`` — les blocs de contexte
    obligatoires de l'annexe p24. Absents, le prompt le DIT au modèle (« non
    fourni ») au lieu de le laisser supposer.
    """
    org_system = bellum_organigramme.build_system_prompt(profile) + feedback_block
    org_user = bellum_organigramme.build_user_prompt(
        company_name=company_name,
        contacts=contacts_str,
        entities=entities_str,
        angles=angles_str,
        pains=pains_str,
        relationship=relationship,
        signals=signals,
        memory=memory,
        # Les sept blocs du FINAL. `{}` = tous absents = « non fourni », ce que
        # le prompt systeme traite deja explicitement.
        **(context_blocks or {}),
    )
    t0 = time.monotonic()
    try:
        output, usage = await call_claude(
            org_system,
            org_user,
            response_model=OrganigrammeOutput,
            prompt_name="bellum_organigramme",
            correlation_id=correlation_id,
            max_tokens=_ORGANIGRAMME_MAX_TOKENS,
            **({"model": _ORGANIGRAMME_MODEL} if _ORGANIGRAMME_MODEL else {}),
        )
    except ClaudeIncompleteOutputError as exc:
        # Troncature (``stop_reason == max_tokens``) : NON-retryable, et surtout
        # pas une raison de faire échouer un dossier par ailleurs complet
        # (contacts, signaux, score déjà persistés). On dégrade comme un batch de
        # contacts (voir ``_run_contacts_batch``) : log bruyant + graphe de
        # décision vide. Les vues organigramme rendent « carte indisponible » au
        # lieu de marquer tout le run en erreur (phase classify) — l'incident FREE.
        # Une panne transitoire (500, timeout) N'est PAS rattrapée ici : elle
        # remonte en terminal_failure pour que l'utilisateur relance.
        logger.warning(
            "Phase 3 organigramme TRONQUÉ (%s, max_tokens=%d) — graphe de décision vide, le dossier part quand même : %s",
            _ORGANIGRAMME_MODEL or "default",
            _ORGANIGRAMME_MAX_TOKENS,
            exc,
        )
        return OrganigrammeOutput(), None
    logger.info(
        "Phase 3 timing: organigramme (%s) done in %.1fs",
        _ORGANIGRAMME_MODEL or "default",
        time.monotonic() - t0,
    )
    assert isinstance(output, OrganigrammeOutput)
    return output, usage


# Progress band for Phase 3: each sub-job (1 organigramme + N batches)
# moves the bar by an equal slice of (PHASE3_END - PHASE3_START). No fake
# heartbeat ticks — if Claude pedals for 60s, the bar stays put.
PHASE3_START = 72
PHASE3_END = 84

# BELLUM-ORGANIGRAMME sits on the Phase-3 critical path (rebuilds the decision
# graph — the slowest single call). Defaults to Haiku: the A/B on Société
# Générale (centralised) and Crédit Mutuel (federated — Euro-Information/GICM +
# Arkéa correctly resolved) showed quality parity with Sonnet at ~half the
# latency (classify 264s→~110-120s), which brings the run under the 5-min target.
# Override via ORGANIGRAMME_MODEL (e.g. claude-sonnet-5) to revert or re-A/B.
_ORGANIGRAMME_MODEL = os.environ.get("ORGANIGRAMME_MODEL") or CLAUDE_HAIKU_MODEL

# Le graphe de décision est le plus gros JSON de la phase 3 (org_chart +
# decisionChain + uncoveredZones + stakeholderMap). Sur un grand compte (FREE,
# CAC40) il dépassait le défaut 16384 → ``ClaudeIncompleteOutputError``. Budget
# explicite plus haut (Haiku 4.5 tient 64k en sortie), env-tunable comme les
# budgets de phase 1. La troncature résiduelle est de toute façon rattrapée plus
# bas (dégradation gracieuse), mais mieux vaut ne pas tronquer du tout.
_ORGANIGRAMME_MAX_TOKENS = int(os.getenv("ORGANIGRAMME_MAX_TOKENS", "24000"))


def org_context_blocks_for(
    req: ClassifyRequest, target: dict[str, Any], *, reaching_model: int
) -> dict[str, str]:
    """Les sept blocs de contexte de l'organigramme, assembles depuis la requete.

    Un seul endroit qui les compose : deux appelants qui les rebatiraient chacun
    de leur cote divergeraient, et le premier a diverger serait celui des
    corrections — c'est-a-dire celui ou une donnee de personne se glisse.

    Tout est optionnel : une requete qui ne porte rien rend sept chaines vides,
    et le prompt ecrit « non fourni ».
    """
    return {
        "graph_coverage": graph_coverage_block(
            # `discovered_people` absent = non mesure. On NE remplace PAS par
            # `len(req.contacts)`, qui compte ce qu'on a envoye, pas ce qui
            # existe : ce serait un chiffre juste repondant a une autre question.
            discovered=req.discovered_people,
            reaching_model=reaching_model,
            already_classified=req.already_classified_people,
        ),
        "entity_scope": entity_scope_block(
            in_scope=target.get("entities") if isinstance(target.get("entities"), list) else None,
            out_of_scope=(
                target.get("outOfScopeEntities")
                if isinstance(target.get("outOfScopeEntities"), list)
                else None
            ),
        ),
        "direction_scope": direction_scope_block(req.direction_scope),
        "project_context": project_context_block(req.project_context),
        "existing_graph_summary": existing_graph_summary_block(req.existing_graph_summary),
        "workspace_corrections": workspace_corrections_block(req.workspace_corrections),
        "relation_evidence": relation_evidence_block(req.relation_evidence),
    }


def relationship_context_line(sales_context: Any) -> str:
    """RELATIONSHIP_CONTEXT (annexe p24) — l'état de la relation au compte, en une
    ligne lisible : ``froid`` / ``connu`` / ``rang2`` / ``besoin_ouvert`` /
    ``client``, sa dérivation et ce qui l'établit.

    C'est le bloc qui décide de la STRATÉGIE (p26 : petite ESN froide = bottom-up
    ; relation forte = top-down contrôlé). Absent = "" → le prompt affiche « non
    fourni », et ses garde-fous demandent de dégrader la confiance plutôt que de
    supposer une relation qui n'existe pas."""
    relationship = (sales_context or {}).get("relationship") if isinstance(sales_context, dict) else None
    if not isinstance(relationship, dict):
        return ""
    state = str(relationship.get("state") or "").strip()
    if not state:
        return ""
    parts = [f"état = {state}"]
    derivation = str(relationship.get("derivation") or "").strip()
    if derivation:
        parts.append(f"dérivation = {derivation}")
    evidence = relationship.get("evidence")
    if isinstance(evidence, list) and evidence:
        parts.append("preuves = " + " ; ".join(str(e) for e in evidence[:3]))
    last = str(relationship.get("lastInteractionAt") or "").strip()
    if last:
        parts.append(f"dernière interaction = {last}")
    return ", ".join(parts)


# Combien de signaux entrent dans le prompt d'organigramme. Les signaux servent
# ici à NOMMER les sujets d'influence (un programme, un budget, un appel
# d'offres) — pas à refaire l'analyse de la phase 1. Les plus récents suffisent,
# et le budget de contexte de Haiku n'est pas extensible.
_ORG_SIGNALS_MAX = 8


def signals_digest(signals: Any, limit: int = _ORG_SIGNALS_MAX) -> str:
    """SIGNALS (p24) — les N premiers signaux, condensés. Vide si aucun."""
    if not isinstance(signals, list) or not signals:
        return ""
    lines: list[str] = []
    for s in signals[:limit]:
        if isinstance(s, dict):
            label = str(s.get("title") or s.get("signal") or s.get("description") or "").strip()
            date = str(s.get("date") or "").strip()
            if label:
                lines.append(f"- {label}" + (f" ({date})" if date else ""))
        elif isinstance(s, str) and s.strip():
            lines.append(f"- {s.strip()}")
    return "\n".join(lines)


def seller_profile_for(req: ClassifyRequest) -> dict[str, Any]:
    """The profile of the ESN **who is selling** — never the target account.

    ``profile_data`` is the target-shaped dict the prompts read their entities /
    angles / pains / company name from. It is NOT the seller: the pipeline merges
    the target's ``companyName`` over the ESN's (``ClassifierAgent._build_service_profile``),
    and the on-demand « Enrichir organigramme » path passes the target's whole
    ``raw_analysis``. Feeding it to the « PROFIL ESN » block told the model the
    seller was TF1 while it classified TF1's own people; feeding it to
    ``seller_context_from_profile`` scored the canonical /100 against a profile
    with no declared expertise (the boost was dead on that path).

    ``esn_profile`` carries the real seller. Empty (the default, and every caller
    that has not been wired yet) → the historical fallback, byte for byte.
    """
    return req.esn_profile or req.profile_data


def _account_sector_text(req: ClassifyRequest) -> str | None:
    """Le secteur du compte CIBLE, lu comme ``account_sector_block`` le lit."""
    raw = req.profile_data or {}
    sector = raw.get("sector") or raw.get("businessDescription")
    return sector if isinstance(sector, str) and sector else None


def account_sector_block(req: ClassifyRequest) -> str:
    """Le playbook sectoriel du compte CIBLE (p15-20 : « règles à injecter dans
    score, CONTACTS, plan et messages »).

    Il n'atteignait que le prompt plan. La priorisation des PERSONNES ignorait
    donc ce que le secteur change : en banque/assurance les rôles risque et
    sécurité pèsent (DORA, panel), dans l'industrie la décision se joue par site,
    dans le public le circuit d'achat prime sur le sponsor métier.

    Le secteur est lu là où il se trouve déjà — ``profile_data`` porte le
    ``raw_analysis`` du compte sur le chemin on-demand. Absent ⇒ "" ⇒ prompt
    byte-identique."""
    from app.knowledge import sector_playbook_block

    raw = req.profile_data or {}
    sector = raw.get("sector") or raw.get("businessDescription")
    return sector_playbook_block(sector if isinstance(sector, str) else None)


def account_relationship_state(req: ClassifyRequest) -> str:
    """L'état de relation AU NIVEAU DU COMPTE, tel que le SalesContext l'a fixé.

    p26 pèse « Accessibilité / relation » comme un facteur ÉLEVÉ du /100 : le même
    décideur est matériellement plus atteignable chez un client actif que chez un
    inconnu. La donnée existe déjà — sur le chemin on-demand, ``profile_data``
    porte le ``raw_analysis`` du compte CIBLE, donc son ``salesContext``. On la
    lit là plutôt que d'ajouter un champ que personne ne renseignerait.

    Absent (chemin pipeline, dossier antérieur) ⇒ ``""`` ⇒ grille historique."""
    for source in (req.account_sales_context, req.profile_data.get("salesContext")):
        if isinstance(source, Mapping):
            state = (source.get("relationship") or {}).get("state")
            if isinstance(state, str) and state:
                return state
    return ""


def reconcile_contact_priorities(
    contacts: list[EnrichedContact],
    profile: Mapping[str, Any] | None,
    relationship_state: str = "",
    seller: SellerContext | None = None,
) -> None:
    """Make the canonical /100 govern the live tri (« capturé ≠ consommé »).

    The LLM classifies each contact with a ``priority`` 1-5, but the deterministic
    Contact Priority Score /100 (``contact_priority_score.py``, the 03_BUSINESS_RULES
    §3 barème) never touched that number — the ranking ran on the model's mood. Here,
    for every contact the model DID classify (``priority >= 1``), we replace its 1-5
    with the rank derived from the /100 (seller boost applied), so ``phase4_plan``'s
    sort is driven by the explained score. Unclassified rows (``priority == 0``) are
    left untouched — 0 stays the "not classified → NULL in DB" sentinel. In place,
    deterministic: same input → same ranks.

    ``seller`` — le contexte DÉJÀ dérivé par l'appelant. Depuis que le pré-tri du
    top-N s'appuie lui aussi dessus, le dériver ici une seconde fois ferait deux
    chemins pour un même réglage : ils divergeraient le jour où l'un des deux
    gagne une règle. Absent ⇒ dérivé du profil, comme avant."""
    if seller is None:
        seller = seller_context_from_profile(profile if isinstance(profile, Mapping) else None)
    if relationship_state:
        seller = replace(seller, relationship_state=relationship_state)
    for c in contacts:
        if c.priority >= 1:
            c.priority = deterministic_priority(c.model_dump(by_alias=True), seller)


async def classify_contacts_and_organigramme(req: ClassifyRequest) -> dict[str, Any]:
    """Classify contacts (batched) + reconstruct the organigramme in parallel.

    ``BELLUM-CONTACTS`` classifies each contact (role / priority / summary
    / whyContact …) and runs as **batches of ``CONTACTS_BATCH_SIZE``** in
    parallel — see ``_run_contacts_batch``. ``BELLUM-ORGANIGRAMME``
    reconstructs the decision graph on the full list in a single call
    (output is shape-bounded, not size-bounded by contact count).

    Progress is driven by ``asyncio.as_completed`` — each sub-job
    completion emits a real ``phase:progress`` event. The UI step is
    ``orga_chain`` until BELLUM-ORGANIGRAMME resolves, then flips to
    ``classification`` for the remaining batches.

    Returns the merged ``ContactsOutput`` + ``OrganigrammeOutput`` payload
    (already ``model_dump(by_alias=True)``-ed). Raises whatever
    ``call_claude`` raises — the router maps it to a 502 ``HTTPException``.
    """
    # Target-shaped slices (what the ACCOUNT looks like) — user prompt material.
    target = req.profile_data
    entities_str = json.dumps(target.get("entities", []), ensure_ascii=False)
    angles_str = json.dumps(target.get("angles", []), ensure_ascii=False)
    pains_str = json.dumps(target.get("pains", []), ensure_ascii=False)
    company_name = target.get("companyName", "N/A")
    # Who is selling — drives the « PROFIL ESN » system block, the domain lens and
    # the /100 seller boost. Falls back to ``target`` when no seller was wired.
    profile = seller_profile_for(req)

    cb = req.progress_callback
    correlation_id = get_correlation_id()
    t_phase = time.monotonic()
    # Mémoire de corrections (A2) : rendue UNE fois, appliquée aux deux prompts
    # système (batches + organigramme). "" sans feedback = prompts byte-identiques.
    feedback_block = feedback_directives_block(req.account_feedback)
    # Deterministic pre-rank + cap: only the top-N deciders reach the (expensive)
    # per-contact LLM classification AND the organigramme. The tail (noise: junior
    # devs, support…) keeps its Phase-2 DB seed; nothing is lost, and neither the
    # batches nor the decision-graph call waste tokens/latency on it.
    # Le domaine du VENDEUR entre AVANT le cap. La chaîne de décision
    # industrielle existait déjà, mais elle ne s'appliquait qu'aux survivants du
    # top-N : le tri lui-même restait à prisme IT, et coupait les décideurs
    # industriels avant qu'ils ne l'atteignent.
    #
    # ⚠️ Le même raisonnement valait pour les THÈMES du vendeur, et il n'était pas
    # tenu : `industrial` est un booléen, il ne distingue pas une ESN data d'une
    # ESN cyber. Le contexte qui le sait — `SellerContext.focus_themes` — n'entrait
    # qu'à la ligne ~657, dans `reconcile_contact_priorities`, donc APRÈS la coupe :
    # il réordonnait les survivants sans pouvoir repêcher un écarté.
    #
    # Mesuré le 03/09/2026 sur le run KNDS de Julien Laszlo (Aquila Data Enabler) :
    # Apollo remonte 293 personnes, le cap en garde 50, et le tri qui décidait de
    # ces 50 ignorait que cette ESN vend de la data. Même `SellerContext`, même
    # tokenisation, une seule dérivation — juste appelée à la bonne porte.
    seller_profile = seller_profile_for(req)
    industrial_seller = is_industrial_seller(seller_profile)
    seller_ctx = seller_context_from_profile(
        seller_profile if isinstance(seller_profile, Mapping) else None
    )
    ranked = rank_contacts_for_enrichment(
        list(req.contacts),
        CONTACTS_ENRICH_MAX,
        industrial=industrial_seller,
        seller=seller_ctx,
        # LUDB.6 — zone française d'un vendeur industriel : la France d'abord.
        home_country=home_country_for(seller_profile if isinstance(seller_profile, Mapping) else None),
        # #4923.13 — les têtes des familles cibles de la demande entrent d'abord dans la vague.
        target_families=target_families(
            seller_profile if isinstance(seller_profile, Mapping) else None,
            None,
            _account_sector_text(req),
        ),
    )
    # Les deux prompts qui suivent NOTENT des personnes : `bellum_contacts` leur
    # attribue une priorité de 1 à 5, un rôle et un niveau d'influence,
    # `bellum_organigramme` reconstruit la chaîne de décision. La graine de la
    # phase 2 porte `photoUrl` (Apollo) et partait telle quelle : le modèle
    # recevait la photo de la personne qu'on lui demandait de classer. Un champ
    # n'a pas besoin d'être multiplié par un poids pour peser dans un classement.
    # Le nettoyage rend des COPIES — la graine garde sa photo pour la FICHE du
    # contact, seul le chemin de notation la perd. Voir `protected_criteria.py`
    # (ce qui reste et pourquoi : l'identité, la ville, le pays) et la garde
    # `tests/test_protected_criteria_scoring.py`.
    to_enrich = strip_protected_criteria(ranked)
    contacts_str = json.dumps(to_enrich, ensure_ascii=False)
    batches = _chunks(to_enrich, CONTACTS_BATCH_SIZE)
    total_jobs = len(batches) + 1  # +1 organigramme
    span = PHASE3_END - PHASE3_START

    logger.info(
        "Phase 3: %d/%d contacts enriched (top-N, max=%d) in %d batch(es) of up to %d + 1 organigramme",
        len(to_enrich),
        len(req.contacts),
        CONTACTS_ENRICH_MAX,
        len(batches),
        CONTACTS_BATCH_SIZE,
    )

    await emit_progress(
        cb, "classify", "orga_chain", PHASE3_START,
        f"Classification ({len(batches)} batches) + organigramme en parallèle…",
    )

    # Tag every task with what kind it is, so as_completed can tell us
    # whether the just-finished job was the organigramme (→ flip step) or
    # a batch (→ stay on current step).
    org_task = asyncio.create_task(
        _run_organigramme(
            profile=profile,
            company_name=company_name,
            contacts_str=contacts_str,
            entities_str=entities_str,
            angles_str=angles_str,
            pains_str=pains_str,
            correlation_id=correlation_id,
            feedback_block=feedback_block,
            # Contexte obligatoire de l'annexe p24. Ce que le pipeline sait
            # vraiment — jamais un remplissage : une clé absente reste absente.
            relationship=relationship_context_line(target.get("salesContext")),
            signals=signals_digest(target.get("signals")),
            memory=req.account_feedback,
            context_blocks=org_context_blocks_for(req, target, reaching_model=len(to_enrich)),
        ),
        name="organigramme",
    )
    async def _tagged_batch(idx: int, batch: list[dict[str, Any]]) -> tuple[int, Any, Any]:
        """Tag each batch result with its index.

        ``as_completed`` below yields in wall-clock completion order, so appending
        straight into a flat list made the contact ORDER vary between two identical
        runs. That order is load-bearing downstream — ``enrich_top_deciders`` takes
        ``[:CONTACTS_ENRICH_MAX]``, Phase 4 slices the top contacts for messages,
        and plays bind to contacts positionally. Same input, different enriched set.
        We keep ``as_completed`` (progress stays reactive) but reassemble by index.
        """
        contacts, usage = await _run_contacts_batch(
            batch_idx=idx,
            batch_total=len(batches),
            batch=batch,
            company_name=company_name,
            profile=profile,
            entities_str=entities_str,
            angles_str=angles_str,
            pains_str=pains_str,
            correlation_id=correlation_id,
            # #4070.3 — les interlocuteurs déjà connus de l'espace (CRM, missions passées)
            # départagent la priorité des contacts ; ils ne filtrent rien. "" = byte-identique.
            feedback_block=feedback_block + known_contacts_block(req.known_contacts),
            # Playbook sectoriel (p15-20) : ce que le secteur change dans la
            # priorisation des personnes. "" sans secteur reconnu.
            sector_block=account_sector_block(req),
            # La chaîne de décision d'un vendeur industriel n'est pas celle d'une
            # ESN IT : bureau d'études, méthodes, qualité et maintenance sont ses
            # décideurs techniques, là où la DSI l'est pour l'autre. Résolu depuis
            # le profil du VENDEUR (`esn_profile`), jamais du compte cible.
            industrial_seller=industrial_seller,
        )
        return idx, contacts, usage

    batch_tasks: list[asyncio.Task[Any]] = [
        asyncio.create_task(_tagged_batch(i, batch), name=f"contacts_batch_{i + 1}")
        for i, batch in enumerate(batches)
    ]
    all_tasks: list[asyncio.Task[Any]] = [org_task, *batch_tasks]

    org_output: OrganigrammeOutput | None = None
    # Index-keyed so the final list is assembled in BATCH order, not completion
    # order. See ``_tagged_batch``.
    batch_results: dict[int, list[EnrichedContact]] = {}
    failed_batches: list[int] = []
    done_count = 0
    batches_done = 0
    organigramme_done = False
    # Accumulate token usage across the organigramme + every batch so Phase 3
    # finally reports its real cost (it was blind = $0 in the telemetry).
    total_in = total_out = total_cache_read = total_cache_creation = 0
    total_cost = 0.0

    try:
        for fut in asyncio.as_completed(all_tasks):
            result = await fut
            # Batches come back index-tagged as ``(idx, contacts, usage)``; the
            # organigramme task keeps the plain ``(payload, usage)`` shape.
            if len(result) == 3:
                batch_idx, payload, usage = result
            else:
                batch_idx, (payload, usage) = None, result
            if usage is not None:
                total_in += _usage_field(usage, "input_tokens")
                total_out += _usage_field(usage, "output_tokens")
                total_cost += _usage_field(usage, "cost_usd", 0.0)
                total_cache_read += _usage_field(usage, "cache_read_tokens")
                total_cache_creation += _usage_field(usage, "cache_creation_tokens")
            done_count += 1
            percent = PHASE3_START + int(span * done_count / total_jobs)

            if isinstance(payload, OrganigrammeOutput):
                org_output = payload
                organigramme_done = True
                await emit_progress(
                    cb, "classify", "classification", percent,
                    f"Organigramme reconstitué ({batches_done}/{len(batches)} batches done)",
                )
            else:
                # Store by index — the flat list is built after the loop, in batch
                # order, so two identical runs emit contacts in the same sequence.
                assert batch_idx is not None
                batch_results[batch_idx] = payload
                # A batch that raised returns [] (see _run_contacts_batch): record it
                # so the run reports degraded coverage instead of silently shrinking
                # the contact list.
                if not payload:
                    failed_batches.append(batch_idx)
                batches_done += 1
                step = "classification" if organigramme_done else "orga_chain"
                await emit_progress(
                    cb, "classify", step, percent,
                    f"Batch {batches_done}/{len(batches)} classé"
                    + ("" if organigramme_done else " (organigramme en cours)"),
                )
    except Exception:
        # Cancel any task still in flight so we don't leak Claude calls.
        for t in all_tasks:
            if not t.done():
                t.cancel()
        raise

    # Defensive: every code path above sets org_output. If we got here
    # without it, asyncio.as_completed lost a task — surface loudly.
    if org_output is None:
        raise RuntimeError("BELLUM-ORGANIGRAMME task never completed")

    merged_contacts: list[EnrichedContact] = [
        c for idx in sorted(batch_results) for c in batch_results[idx]
    ]
    # Drive the live tri with the canonical /100, not the model's mood: reconcile
    # each classified contact's priority with its deterministic Contact Priority Score
    # (seller boost applied). Pure + deterministic, so run order stays stable.
    reconcile_contact_priorities(
        merged_contacts, profile, account_relationship_state(req), seller=seller_ctx
    )
    if failed_batches:
        logger.warning(
            "Phase 3 classify DEGRADED: %d/%d batch(es) returned no contacts (indices %s)",
            len(failed_batches),
            len(batches),
            sorted(failed_batches),
        )
        record_degradation(
            correlation_id,
            source="classify_batch",
            reason=f"{len(failed_batches)}/{len(batches)} batch(es) de classification vides",
        )
    contacts_output = ContactsOutput(contacts=merged_contacts)
    logger.info(
        "Phase 3 timing: classify total (organigramme + %d batch(es) in parallel) = %.1fs, $%.4f",
        len(batches),
        time.monotonic() - t_phase,
        total_cost,
    )
    await emit_progress(
        cb, "classify", "classification", PHASE3_END,
        f"{len(merged_contacts)} contacts classés, organigramme reconstitué",
    )

    return {
        **contacts_output.model_dump(by_alias=True),
        **org_output.model_dump(by_alias=True),
        "_api_metrics": {
            "token_usage": {
                "input_tokens": total_in,
                "output_tokens": total_out,
                "cost_usd": total_cost,
                "cache_read_input_tokens": total_cache_read,
                "cache_creation_input_tokens": total_cache_creation,
            }
        },
    }
