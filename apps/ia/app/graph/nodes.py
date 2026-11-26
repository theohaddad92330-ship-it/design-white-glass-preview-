"""Graph nodes — thin async wrappers around the existing phase entrypoints.

Each node builds the phase's request model from graph state, calls the SAME
core function the HTTP router calls, and returns a partial state update. A node
that fails terminally returns ``error`` + ``failed_phase`` instead of raising;
the conditional edges (see :mod:`app.graph.builder`) read ``error`` to early-exit.

Phase functions are referenced as module-level names so tests can patch them.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from jsonschema import ValidationError

from app.agents.classifier import ClassifierAgent
from app.contracts.shared_schemas import validate_step_output
from app.graph.gate import evaluate_research_gate
from app.graph.state import AnalysisState
from app.models.agent_envelope import AgentStatus
from app.models.contacts import ApolloSearchHit, ContactsRequest, SeedContact
from app.models.plan import PlanRequest
from app.models.research import ResearchRequest
from app.routers.phase1_research import _research
from app.routers.phase2_contacts import _contacts, prefetch_apollo_hits
from app.routers.phase4_plan import _plan
from app.services import rag_knowledge
from app.services.assets import website_domain
from app.services.contact_employer import account_domains_from
from app.services.contact_enrich import enrich_top_deciders
from app.services.dataforge_needs import needs_for_owned_account, prescriber_contacts
from app.services.org_anchor import derive_org_anchor
from app.services.org_graph_build import build_org_graph_payload
from app.services.text_norm import normalize_name

logger = logging.getLogger(__name__)

# Statuses that mean "do not proceed to the next phase".
#
# CANCELLED belongs here and its absence was a silent data-loss bug. A cancelled
# agent returns ``data=None``; the node then read its outputs off an empty dict
# and reported a SUCCESSFUL phase carrying zero contacts, marked ``completed``.
# The run continued and produced a dossier with no decision-makers that claimed
# to be finished — an interrupted phase presented as a complete one. Whatever
# stopped the phase (client disconnect, budget), the dossier must say it is
# incomplete rather than quietly ship the remains.
_FAILURE_STATUSES = {
    AgentStatus.TERMINAL_FAILURE,
    AgentStatus.RECOVERABLE_FAILURE,
    AgentStatus.CANCELLED,
}

# The token-usage fields every phase meta carries (zeros where a phase makes no
# Claude calls — e.g. contacts is Apollo-only).
_USAGE_FIELDS = (
    "input_tokens",
    "output_tokens",
    "cost_usd",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
)


def _zero_usage() -> dict[str, Any]:
    return {f: 0 for f in _USAGE_FIELDS}


def _usage_from_metrics(data: dict[str, Any] | None) -> dict[str, Any]:
    """Pull token usage out of a phase's ``data['_api_metrics']['token_usage']``.

    research + plan stash their summed Claude usage there; missing/!dict → zeros.
    """
    raw = data.get("_api_metrics", {}).get("token_usage") if isinstance(data, dict) else None
    if not isinstance(raw, dict):
        return _zero_usage()
    return {f: raw.get(f, 0) for f in _USAGE_FIELDS}


def _usage_from_token_usage(token_usage: Any) -> dict[str, Any]:
    """Normalise an envelope ``TokenUsage`` (classify path) into the usage dict."""
    if token_usage is None:
        return _zero_usage()
    return {f: getattr(token_usage, f, 0) for f in _USAGE_FIELDS}


def _ms_since(t0: float) -> int:
    return int((time.monotonic() - t0) * 1000)


#: Combien de temps l'alimentation de la base de connaissance peut prendre après
#: qu'un plan est écrit. Elle vit dans le budget de la phase de plan, donc sans
#: borne propre elle peut emporter le livrable qu'elle suit.
_RAG_POPULATE_BUDGET_S = 20.0


async def _bounded_best_effort(coro: Any, *, budget_s: float, label: str) -> None:
    """Exécute un travail ACCESSOIRE sous une borne de temps qui lui est propre.

    La règle que ce garde-fou applique : ce qui est déclaré « ne casse jamais le
    run » doit aussi ne jamais le RALENTIR au point de le faire expirer. Au
    dépassement, le travail est annulé et l'analyse continue — le contraire
    (abandonner un dossier complet parce qu'une écriture annexe traînait) est le
    seul résultat que personne ne peut défendre devant un client.

    `TimeoutError` seulement : une annulation venue de dehors (budget de phase,
    requête abandonnée) doit continuer de remonter.
    """
    t0 = time.monotonic()
    try:
        await asyncio.wait_for(coro, budget_s)
    except TimeoutError:
        logger.warning(
            "%s abandonné après %.0fs (budget %.0fs) — l'analyse continue",
            label,
            time.monotonic() - t0,
            budget_s,
            extra={"tags": {"code": "BEST_EFFORT_BUDGET"}},
        )


def _check_contract(step: str, payload: Any) -> None:
    """Validate a phase's output against the SHARED cross-lang JSON Schema (#273).

    Deliberately NON-BLOCKING: ``validate_step_output`` logs the drift through
    ``logger.error`` (→ Sentry via the logging transport, project convention) and
    returns. Rationale — the schemas document the wire for TS/Py consumers; a
    field that changed type is a contract bug worth paging on, but it is NOT a
    reason to throw away a dossier the user already paid a credit and 5 minutes
    for. CI/tests flip ``BELLUM_SCHEMA_STRICT=true`` so the same drift fails the
    build instead. Wrapped defensively on top of that: this hook can never be the
    thing that breaks a run.
    """
    try:
        validate_step_output(step, payload)
    except ValidationError:
        # Strict mode asked for a hard failure — honour it (that's CI/tests).
        raise
    except Exception as exc:  # noqa: BLE001 — observability must never break the pipeline
        logger.warning("Shared-schema check skipped for phase %s: %s", step, exc)


def _phase_trace(phase: str, data: dict[str, Any]) -> list[dict[str, Any]]:
    """Per-phase execution trace: which providers/APIs were called, their status
    and what they brought back. Surfaced in the dashboard so the run is fully
    auditable. Status: ok | down (0 usable items) | skipped (no key / no-op)."""
    m = (data.get("_api_metrics") or {}) if isinstance(data, dict) else {}
    out: list[dict[str, Any]] = []

    def add(provider: str, status: str, detail: str) -> None:
        out.append({"provider": provider, "status": status, "detail": detail})

    def n(key: str) -> int:
        v = data.get(key)
        return len(v) if isinstance(v, list) else 0

    if phase == "research":
        bc = int(m.get("brave_results_count", 0) or 0)
        add("brave", "ok" if bc else "down", f"{bc} résultats")
        fc = int(m.get("firecrawl_pages_scraped", 0) or 0)
        add("firecrawl", "ok" if fc else "down", f"{fc} pages scrapées")
        siren = m.get("pappers_siren")
        add(
            "pappers",
            "ok" if siren else "down",
            f"SIREN {siren} · {int(m.get('pappers_subsidiaries_count', 0) or 0)} filiales"
            if siren
            else "aucune donnée",
        )
        naf = data.get("nafCode") or data.get("naf_code")
        if naf:
            add("insee/recherche-entreprises", "ok", f"NAF {naf}")
        for key, label in (
            ("entitiesExhaustive", "insee-entités"),
            ("legalSignals", "bodacc"),
            ("news", "brave-news"),
            ("itJobSignals", "france-travail"),
            ("beneficialOwners", "inpi-rne"),
        ):
            cnt = n(key)
            add(label, "ok" if cnt else "skipped", f"{cnt}")
        tech = data.get("detectedTechStack") or data.get("detected_tech_stack") or []
        add("tech-detect", "ok" if tech else "skipped", ", ".join(str(t) for t in tech[:5]) or "—")
        tu = m.get("token_usage") or {}
        add("claude", "ok", f"{tu.get('input_tokens', 0)} in / {tu.get('output_tokens', 0)} out")
    elif phase == "contacts":
        cnt = n("contacts")
        add("apollo", "ok" if cnt else "down", f"{cnt} contacts")
    elif phase in ("classify", "plan"):
        tu = m.get("token_usage") or {}
        add("claude", "ok", f"{tu.get('input_tokens', 0)} in / {tu.get('output_tokens', 0)} out")
    return out


def _ok(
    phase: str,
    *,
    duration_ms: int,
    usage: dict[str, Any] | None = None,
    sources: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "phase": phase,
        "ok": True,
        "duration_ms": duration_ms,
        "sources": sources or [],
        **(usage or _zero_usage()),
    }


def _already_done(state: AnalysisState, phase: str) -> bool:
    """True if this phase already succeeded on a prior run of the same thread.

    On resume the checkpointer reloads ``completed``; a done phase short-circuits
    so only the failed phase + downstream re-run (no re-paying Claude/providers).
    """
    return phase in state.get("completed", [])


def _error_message(exc: BaseException) -> str:
    """The most user-facing sentence this exception can offer.

    Typed pipeline errors (``ClaudeError``, ``ResearchGroundingError``…) carry a
    French ``user_message`` written for the person reading the dossier; plain
    exceptions only have ``str()``. This string ends up verbatim in the
    account's ``error_message``, so prefer the written one whenever it exists —
    "Pappers indisponible" is actionable, ``InstructorRetryException(...)`` is
    not. Falls back to the class name when ``str()`` is empty, so the message is
    never blank.
    """
    written = getattr(exc, "user_message", None)
    if isinstance(written, str) and written.strip():
        return written.strip()
    return str(exc).strip() or type(exc).__name__


def _error_code(exc: BaseException) -> str:
    """Stable machine code for the failure — the typed one when declared."""
    declared = getattr(exc, "code", None)
    if isinstance(declared, str) and declared.strip():
        return declared.strip()
    return type(exc).__name__


def _fail(
    phase: str,
    message: str,
    *,
    code: str = "PHASE_FAILED",
    duration_ms: int = 0,
    user_message: str = "",
    debug_message: str = "",
) -> dict[str, Any]:
    """Build the early-exit state update for a failed phase.

    ``message`` keeps its landed meaning: the most user-facing sentence available
    (see ``_error_message``), because it lands verbatim in the account's
    ``error_message``.

    ``user_message`` and ``debug_message`` exist so that choice is no longer a
    LOSS. When a typed error carries a written sentence, ``message`` shows it and
    ``debug_message`` still holds ``str(exc)`` — the layer that cost us days did
    exactly this trade the other way, keeping one string and dropping the other.
    Both are omitted when they would merely repeat ``message``: an error that
    says nothing extra must not look like it does.
    """
    logger.warning(
        "Graph phase failed: phase=%s code=%s msg=%s%s",
        phase,
        code,
        message,
        f" | debug={debug_message}" if debug_message else "",
    )
    error: dict[str, Any] = {"phase": phase, "code": code, "message": message}
    if user_message and user_message != message:
        error["user_message"] = user_message
    if debug_message and debug_message != message:
        error["debug_message"] = debug_message
    return {
        "error": error,
        "failed_phase": phase,
        "envelopes": [{"phase": phase, "ok": False, "duration_ms": duration_ms, **_zero_usage()}],
    }


def _fail_from_exc(phase: str, exc: Exception, *, duration_ms: int = 0) -> dict[str, Any]:
    """Build a failed-phase update that PRESERVES what the exception knew.

    ``ClaudeError`` & co. carry a contract ``code`` (``CLAUDE_OUTPUT_TRUNCATED``,
    ``CLAUDE_BAD_REQUEST``…) and a French ``user_message``. The previous
    ``_fail(phase, str(exc), code=type(exc).__name__)`` threw both away: the code
    became the Python class name — useless to a dashboard grouping by cause —
    and the user-facing sentence vanished. One layer later the remains flattened
    into "research failed", which is the string that cost days of production.

    Untyped exceptions keep the old class-name behaviour: it is the most specific
    thing we honestly have, and inventing a contract code would be worse.

    Delegates the two accessors to ``_error_message`` / ``_error_code`` so there
    is a single definition of "what this exception knows", then keeps the raw
    ``str(exc)`` as ``debug_message`` — choosing between the human sentence and
    the technical one is the trade that made the Sonnet-5 ``temperature`` 400
    unreadable, so we simply stop choosing.
    """
    written = getattr(exc, "user_message", None)
    return _fail(
        phase,
        _error_message(exc),
        code=_error_code(exc),
        duration_ms=duration_ms,
        user_message=written.strip() if isinstance(written, str) else "",
        debug_message=str(exc).strip(),
    )


def pappers_seed_contacts(research: dict[str, Any] | None) -> list[SeedContact]:
    """Extract the Pappers ``executives`` block as typed seed contacts.

    Mirrors ``pappersSeedContacts`` in the NestJS worker so the contacts phase
    anchors the organigramme on the legal dirigeants.
    """
    if not research:
        return []
    raw = research.get("executives")
    if not isinstance(raw, list):
        return []
    seeds: list[SeedContact] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        first = entry.get("first_name")
        last = entry.get("last_name")
        if not first and not last:
            continue
        seeds.append(
            SeedContact(
                first_name=first if isinstance(first, str) else None,
                last_name=last if isinstance(last, str) else None,
                title=entry.get("role") if isinstance(entry.get("role"), str) else None,
                source="pappers",
                is_c_level=bool(entry.get("is_c_level")),
            )
        )
    return seeds


async def research_node(state: AnalysisState) -> dict[str, Any]:
    if _already_done(state, "research"):
        return {}
    t0 = time.monotonic()
    # Guard the one load-bearing input: on a resume with a non-durable
    # checkpointer (MemorySaver) the restored state can be empty. Fail clearly
    # instead of raising a bare KeyError that surfaces as an opaque SSE crash.
    company_name = (state.get("company_name") or "").strip()
    # Latency optimization — "Apollo contacts prefetch". Kick off the FREE Apollo
    # People-Search NOW so it runs concurrently with the (longer) research phase;
    # its ~5-40s latency then comes off the critical path. The search only needs
    # the company name + personas, both already available. Best-effort: if it
    # fails we simply don't stash the hits and contacts_node searches live.
    # L'ancre d'org (#1101/#1102) : le domaine du compte est connu dès maintenant
    # quand il a déjà été renseigné. Apollo scope alors sur la BONNE société au
    # lieu de rapprocher un libellé — « MUTUELLE UNEO » ne ramenait qu'une
    # personne. Domaine absent = recherche par nom, comme avant.
    _prefetch_domain = website_domain(str(state.get("website") or ""))
    apollo_task = asyncio.create_task(
        prefetch_apollo_hits(
            company_name,
            state.get("profile_data", {}),
            [_prefetch_domain] if _prefetch_domain else None,
        )
    )
    if not company_name:
        apollo_task.cancel()
        return _fail(
            "research",
            "Aucun nom d'entreprise dans l'état de reprise (checkpointer non persistant ?).",
            code="MissingCompanyName",
            duration_ms=_ms_since(t0),
        )
    req = ResearchRequest(
        company_name=company_name,
        # Scope lock (Théo p.10) : ancre la recherche sur le SIREN choisi.
        siren=(state.get("siren") or None),
        # Périmètre d'analyse (Théo p.10/21) : biaise la recherche.
        scope_mode=(state.get("scope_mode") or None),
        # #3820 — nom du site/ville, QUAND le cadrage porte `geo_perimeter:
        # "city"` (même champ générique `geo_areas` que #2163.12 « Ville »),
        # jamais un site deviné d'un autre axe de cadrage.
        scope_city=(
            next(iter((state.get("scope_selection") or {}).get("geo_areas") or []), None)
            if (state.get("scope_selection") or {}).get("geo_perimeter") == "city"
            else None
        ),
        # #3288 — palier de profondeur choisi, porté par le cadrage du run.
        depth=((state.get("scope_selection") or {}).get("depth") or None),
        # Cadrage analyse (15/10) — tout le cadrage du run, lu par `run_cadrage`.
        cadrage=(state.get("scope_selection") or None),
        # Marché cible : "FR" par défaut (aucun pack) ; un code non-FR active le
        # country pack correspondant côté _research (si son flag d'env est activé).
        country=(state.get("country") or "FR"),
        website=(state.get("website") or None),
        profile_data=state.get("profile_data", {}),
        user_context=state.get("user_context"),
        account_id=state.get("account_id", ""),
        user_id=state.get("user_id", ""),
        workspace_id=state.get("workspace_id", ""),
        # Couche zéro (annexe méthodo p8) : un compte déjà présent dans le CRM de
        # l'ESN n'est pas froid — l'info entre ici pour que le SalesContext (donc
        # tout l'aval : mouvement, garde-fou board, plan) en tienne compte.
        # "" (défaut) = aucun CRM connecté → salesContext byte-identique.
        crm_presence=state.get("crm_presence", ""),
        internal_history=state.get("internal_history", ""),
        # #4070.1/.4 — l'historique complet du compte et l'analyse précédente entrent en
        # phase 1 : « pourquoi maintenant » lit tout, daté. [] / "" (défaut) = byte-identique.
        account_facts=state.get("account_facts") or [],
        previous_analysis=state.get("previous_analysis", ""),
        # #3753.3 — le ciblage de l'ESN (hypothèses du vendeur) entre en phase 1.
        seller_hypotheses=state.get("seller_hypotheses"),
        # Kanban commercial (annexe méthodo p6) : un compte que le commercial a
        # rangé en « Client » / « Suivi » n'est pas un compte froid. "" (défaut,
        # compte non trié) = SalesContext byte-identique.
        commercial_status=state.get("commercial_status", ""),
        # Axe CHEMIN (#1631.3/.4, #1606.2, lot 14) — voir AnalysisState.market_paths_observed.
        # `None` (défaut) = aucune couverture transmise → axe non mesuré, byte-identique.
        market_paths_observed=state.get("market_paths_observed"),
        market_top_esn=state.get("market_top_esn", ""),
        # #2298.4 — les quatre sources ajoutées à la relation. Défauts
        # `None`/"" (aucun ingrédient transmis) → axe byte-identique.
        relation_missions_count=state.get("relation_missions_count"),
        relation_last_meeting_at=(state.get("relation_last_meeting_at") or None),
        relation_last_email_at=(state.get("relation_last_email_at") or None),
        relation_human_correction=(state.get("relation_human_correction") or None),
        declared_partners=(state.get("declared_partners") or None),
        consultant_history=(state.get("consultant_history") or None),
        declared_signal_present=bool(state.get("declared_signal_present")),
        partner_placements_active=state.get("partner_placements_active"),
        declared_route_signals=state.get("declared_route_signals"),
    )
    try:
        resp = await _research(req)
    except Exception as exc:  # noqa: BLE001 — surface as early-exit, not a crash
        apollo_task.cancel()
        return _fail_from_exc("research", exc, duration_ms=_ms_since(t0))
    data = resp.data or {}
    _check_contract("research", data)
    update: dict[str, Any] = {
        "research": data,
        "seed_contacts": [s.model_dump() for s in pappers_seed_contacts(data)],
        "gate": evaluate_research_gate(data),
        "completed": ["research"],
        "envelopes": [
            _ok(
                "research",
                duration_ms=_ms_since(t0),
                usage=_usage_from_metrics(data),
                sources=_phase_trace("research", data),
            )
        ],
    }
    # Hand the concurrently-prefetched Apollo hits to contacts_node. Best-effort:
    # on any failure we leave the key unset so contacts_node falls back to a live
    # search — the prefetch is a pure latency win, never a correctness dependency.
    try:
        hits = await apollo_task
        update["prefetched_contacts"] = [h.model_dump() for h in hits]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Apollo prefetch failed; contacts will search live: %s", exc)
        apollo_task.cancel()
    return update


def checked_entity_names(scope_selection: dict[str, Any] | None) -> list[str]:
    """Lot 757 — les NOMS des entités du groupe cochées dans le cadrage du run (``contact_entities``, contrat
    ``group-perimeter.ts``). Une entrée sans nom est ignorée, jamais devinée ; absent = ``[]``."""
    raw = (scope_selection or {}).get("contact_entities") or []
    names: list[str] = []
    for entry in raw if isinstance(raw, list) else []:
        if isinstance(entry, dict) and isinstance(entry.get("name"), str) and entry["name"].strip():
            names.append(entry["name"].strip())
    return names


async def contacts_node(state: AnalysisState) -> dict[str, Any]:
    if _already_done(state, "contacts"):
        return {}
    t0 = time.monotonic()
    seeds = [SeedContact(**s) for s in state.get("seed_contacts", [])]
    # Names of entities Phase 1 marked out-of-scope (SGTM, SG Côte d'Ivoire, SPV…)
    # so Phase 2 drops any Apollo hit from a bad-scope BU before it enters the
    # dossier (Théo: mauvais scope).
    out_of_scope = [
        str(e.get("name"))
        for e in (state.get("research", {}) or {}).get("outOfScopeEntities", [])
        if isinstance(e, dict) and e.get("name")
    ]
    # Consume the hits research_node prefetched concurrently (latency win). Key
    # absent = prefetch failed → search live (prefetched_hits stays None). An
    # empty list is a genuine 0-hit prefetch and is passed through as-is.
    prefetched = state.get("prefetched_contacts")
    prefetched_hits = [ApolloSearchHit(**h) for h in prefetched] if prefetched is not None else None
    # Ancres d'org résolues PAR la phase 1 (#1101/#1102) : l'id Apollo du compte
    # (le plus fort) et son domaine. Le préchargement, lui, a tourné en parallèle
    # de la recherche et ne pouvait connaître que ce qui existait à t=0 — d'où la
    # repasse ancrée côté phase 2, qui fusionne au lieu de remplacer.
    _research = state.get("research", {}) or {}
    _apollo_org = _research.get("apolloEnrichment") or {}
    # C.2 (Cédric 20/10) — dérivation PARTAGÉE avec la phase 2 relancée à la demande.
    _anchor = derive_org_anchor(_apollo_org, _research.get("website") or state.get("website"))
    req = ContactsRequest(
        company_name=state.get("company_name", ""),
        profile_data=state.get("profile_data", {}),
        account_id=state.get("account_id", ""),
        user_id=state.get("user_id", ""),
        seed_contacts=seeds,
        out_of_scope_entities=out_of_scope,
        prefetched_hits=prefetched_hits,
        organization_ids=_anchor.organization_ids,
        organization_domains=_anchor.organization_domains,
        preferred_zone=list(state.get("preferred_zone") or []),
        checked_entities=checked_entity_names(state.get("scope_selection")),
    )
    try:
        resp = await _contacts(req)
    except Exception as exc:  # noqa: BLE001
        return _fail_from_exc("contacts", exc, duration_ms=_ms_since(t0))
    data = resp.data or {}
    contacts = data.get("contacts", [])
    # `contacts.schema.json` describes ONE persisted `topContacts[]` row; phase 2
    # emits raw Apollo hits, i.e. the same identity keys (fullName / title /
    # email / linkedinUrl / city / country) BEFORE the classifier reshapes them.
    # The overlap is what gets checked here — a type drift on those keys is
    # caught; the classifier-only fields (decisionRole, message…) are covered by
    # the `classify` check below, not here.
    for row in contacts if isinstance(contacts, list) else []:
        _check_contract("contacts", row)
    # Prospection inversée (annexe p7/p9) : la phase 2 la calcule depuis
    # l'historique de poste Apollo, mais personne ne la lisait — l'angle chaud
    # « ex-collaborateur de la cible » finissait à la poubelle. On la garde dans
    # l'état pour que plan_node l'exploite. Liste vide = état inchangé.
    reverse = data.get("reverseProspects")
    update: dict[str, Any] = {
        "contacts": contacts,
        "reverse_prospects": reverse if isinstance(reverse, list) else [],
        "completed": ["contacts"],
        "envelopes": [
            _ok(
                "contacts",
                duration_ms=_ms_since(t0),
                usage=_usage_from_metrics(data),
                sources=_phase_trace("contacts", data),
            )
        ],
    }
    # « X écartés (hors périmètre) » (Théo P0-03) : la phase 2 retirait des contacts
    # d'entités hors périmètre en le disant seulement aux logs. On fait voyager le
    # décompte + le détail par entité jusqu'au worker, qui les persiste sur le
    # dossier. Absent (rien d'écarté) = état inchangé, aucun événement en plus.
    out_of_scope = data.get("outOfScope")
    if isinstance(out_of_scope, dict) and out_of_scope.get("dropped"):
        update["contacts_out_of_scope"] = out_of_scope
    # #2543.5a — l'état de la source Apollo + la population qu'elle ANNONCE :
    # `_assemble_coverage`/`build_org_graph_payload` (org_graph_assembler.py /
    # org_graph_build.py) acceptent déjà ces deux paramètres — ce sont
    # `classify_node`, plus bas, qui doit les lire ICI et les leur passer.
    # Absent (recherche jamais mesurée cette requête-ci) = clé absente, jamais
    # un « ok » deviné.
    source_status = data.get("sourceStatus")
    if source_status is not None:
        update["apollo_source_status"] = source_status
    source_total_entries = data.get("sourceTotalEntries")
    if source_total_entries is not None:
        update["apollo_total_entries"] = source_total_entries
    # #2543.5b — le repli web mesuré par cette requête (tenté, trouvé, échec
    # nommé) — même convention : absent = clé absente, jamais un défaut deviné.
    fallback = data.get("fallback")
    if fallback is not None:
        update["apollo_fallback"] = fallback
    # #2543.5g — la passe d'élargissement (tenté/stock initial/ajoutés),
    # posée SEULEMENT quand elle a tourné (voir phase2_contacts.py).
    widened = data.get("widened")
    if widened is not None:
        update["apollo_widened"] = widened
    return update


def _reattach_apollo_keys(classified: list[dict[str, Any]], seeds: list[dict[str, Any]]) -> None:
    """Restore the ``apolloId`` / ``linkedinUrl`` the classifier dropped.

    ``EnrichedContact`` (the classifier's output model) carries neither the Apollo
    person id nor, for a search-tier hit, the hidden LinkedIn URL — the LLM never
    emits them. The phase-2 seeds (``state["contacts"]``) DO. Match classified
    contacts back to their seed by normalized full name and copy the missing keys
    across, so the downstream auto-enrich holds the strongest People-Match key.
    Mutates ``classified`` in place; present-only (never clobbers a value already
    on the classified contact). A name that finds no seed is left untouched."""
    by_name: dict[str, dict[str, Any]] = {}
    for seed in seeds:
        key = normalize_name(seed.get("fullName") or "")
        if key:
            by_name[key] = seed
    if not by_name:
        return
    for contact in classified:
        seed = by_name.get(normalize_name(contact.get("fullName") or ""))
        if not seed:
            continue
        if not contact.get("apolloId") and seed.get("apolloId"):
            contact["apolloId"] = seed["apolloId"]
        if not contact.get("linkedinUrl") and seed.get("linkedinUrl"):
            contact["linkedinUrl"] = seed["linkedinUrl"]
        # Carry Apollo's email-availability flag onto the classified contact so the
        # auto-enrich spends a People-Match credit only where an email exists.
        details = seed.get("apolloDetails")
        if "hasEmail" not in contact and isinstance(details, dict) and "hasEmail" in details:
            contact["hasEmail"] = details["hasEmail"]


async def _known_contacts_with_prescribers(state: AnalysisState) -> list[dict[str, Any]]:
    """#4294.9 — les interlocuteurs connus de l'espace (#4070.3), PLUS les prescripteurs des besoins
    passés DU compte (base commune), lus dans l'espace de l'analyse. Un nom déjà connu ne se double
    pas ; sans compte rattaché ni prescripteur, la liste reste exactement celle d'avant."""
    known = list(state.get("known_contacts") or [])
    try:
        historical = await needs_for_owned_account(
            state.get("account_id") or None,
            state.get("user_id") or None,
            workspace_id=state.get("workspace_id") or None,
        )
    except Exception as exc:  # noqa: BLE001 — une classification ne tombe jamais pour un historique
        logger.warning("Besoins historiques indisponibles pour la classification (ignorés) : %s", exc)
        return known
    names = {str(c.get("name") or "").strip().lower() for c in known if isinstance(c, dict)}
    for contact in prescriber_contacts(historical):
        if contact["name"].lower() not in names:
            names.add(contact["name"].lower())
            known.append(contact)
    return known


async def classify_node(state: AnalysisState) -> dict[str, Any]:
    if _already_done(state, "classify"):
        return {}
    t0 = time.monotonic()
    known_contacts = await _known_contacts_with_prescribers(state)
    agent = ClassifierAgent()
    try:
        env = await agent.run(
            state["company_name"],
            state.get("profile_data", {}),
            state.get("research", {}),
            {"contacts": state.get("contacts", [])},
            # Mémoire de corrections (A2) : « contact X signalé parti » conditionne
            # la classification. "" (défaut) = prompts byte-identiques.
            account_feedback=state.get("account_feedback", ""),
            # #4070.3 — les interlocuteurs déjà connus de l'espace départagent la priorité.
            # #4294.9 — y compris les prescripteurs des besoins passés du compte.
            # Clé omise quand il n'y en a pas : l'appel reste celui d'avant le lot.
            **({"known_contacts": known_contacts} if known_contacts else {}),
        )
    except Exception as exc:  # noqa: BLE001
        return _fail_from_exc("classify", exc, duration_ms=_ms_since(t0))
    if env.status in _FAILURE_STATUSES:
        if env.status == AgentStatus.CANCELLED:
            return _fail(
                "classify",
                "Classification des contacts interrompue — le dossier serait sans décideurs. Relancer l'analyse.",
                code="CLASSIFY_CANCELLED",
                duration_ms=_ms_since(t0),
            )
        message = getattr(getattr(env, "error", None), "debug_message", None) or str(env.status)
        return _fail("classify", message, code="CLASSIFY_TERMINAL", duration_ms=_ms_since(t0))
    data: dict[str, Any] = {}
    if env.data is not None:
        data = env.data.model_dump(by_alias=True) if hasattr(env.data, "model_dump") else dict(env.data)
    _check_contract("classify", data)
    usage = _usage_from_token_usage(getattr(getattr(env, "meta", None), "token_usage", None))
    # Reveal email/phone for the top deciders (People-Search only gives names) so
    # the dossier ships exploitable contacts. Best-effort + bounded — never fails.
    contacts = data.get("contacts", [])
    # The classifier rebuilds each contact from the LLM output, which never echoes
    # the Apollo person id (nor a search-tier-hidden LinkedIn URL) — re-attach them
    # from the phase-2 seeds by name so auto-enrich can People-Match BY ID, the only
    # key that survives the search tier obfuscating the last name. Without this the
    # top deciders were enriched with a doomed first-name+org match on an obfuscated
    # name → 0 emails revealed for exactly the contacts this step exists to unlock.
    _reattach_apollo_keys(contacts, state.get("contacts", []))
    contacts = await enrich_top_deciders(
        contacts,
        state["company_name"],
        # LUDB.5 — le domaine du compte : un contact d'un homonyme est écarté.
        account_domains=account_domains_from(state.get("website")),
    )
    # Keep the org graph (everything the classifier produced besides the contacts)
    # so the API can persist it into raw_analysis.org — it was silently dropped.
    # Le calcul vit dans ``org_graph_build`` : la route HTTP /phase/3/classify
    # doit produire EXACTEMENT le même bloc, sinon un enrichissement à la demande
    # laisse la carte d'influence sur le graphe du run initial.
    org_graph = build_org_graph_payload(
        data=data,
        contacts=contacts,
        research=state.get("research", {}) or {},
        graph_version=int(state.get("org_graph_version") or 1),
        rejected_items=state.get("org_rejected_items") or [],
        # TOUT ce que la phase 2 a découvert — pas les seuls survivants du
        # plafond de vague. `contacts` ci-dessus est la vague (ce qui a coûté des
        # crédits) ; celle-ci est le compte. Les confondre est ce qui faisait
        # afficher un organigramme de 50 sur un compte à 2 241 contacts.
        discovered_contacts=state.get("contacts") or [],
        # #2543.5a/.5b/.5g — posés par contacts_node ci-dessus (absent = non mesuré).
        apollo_source_status=state.get("apollo_source_status"),
        apollo_total_entries=state.get("apollo_total_entries"),
        apollo_fallback=state.get("apollo_fallback"),
        apollo_widened=state.get("apollo_widened"),
        # #3742 — la zone géographique choisie au lancement filtre le chemin recommandé.
        scope_selection=state.get("scope_selection") or None,
    )
    return {
        "classified_contacts": contacts,
        "org_graph": org_graph,
        "completed": ["classify"],
        "envelopes": [_ok("classify", duration_ms=_ms_since(t0), usage=usage, sources=_phase_trace("classify", data))],
    }


async def plan_node(state: AnalysisState) -> dict[str, Any]:
    if _already_done(state, "plan"):
        return {}
    t0 = time.monotonic()
    req = PlanRequest(
        account_id=state.get("account_id", ""),
        user_id=state.get("user_id", ""),
        workspace_id=state.get("workspace_id", ""),
        account_data=state.get("research", {}),
        contacts=state.get("classified_contacts", []),
        profile_data=state.get("profile_data", {}),
        # Carry the ESN↔account relationship into the plan so the approach adapts
        # (cold vs re-engagement vs upsell vs incumbent displacement).
        user_context=state.get("user_context"),
        # Mémoire de corrections (A2) : les retours utilisateur du dossier
        # précédent contraignent le nouveau plan. "" (défaut) = byte-identique.
        account_feedback=state.get("account_feedback", ""),
        # Couche zéro (annexe méthodo p7-p9) : « chercher ce qui existe avant de
        # proposer du froid ». Historique CRM + ex-collaborateurs de la cible.
        # Vides (défaut) = prompt du plan byte-identique.
        crm_presence=state.get("crm_presence", ""),
        internal_history=state.get("internal_history", ""),
        # #4070.2/.4 — affaires gagnées/perdues/sommeil, missions, besoins (datés), motifs de
        # perte et analyse précédente : le plan et ses messages les lisent. Vides = byte-identique.
        account_facts=state.get("account_facts") or [],
        lost_deal_rex=state.get("lost_deal_rex", ""),
        previous_analysis=state.get("previous_analysis", ""),
        # Boucle d'apprentissage (§6) : ce que l'équipe a déjà converti priorise
        # le plan. "" (défaut) = prompt byte-identique.
        workspace_learning=state.get("workspace_learning", ""),
        # #3278.3 — les presets de canal cèdent devant le mesuré. [] = byte-identique.
        channel_performance=state.get("channel_performance", []),
        accumulated_route_criteria=state.get("accumulated_route_criteria"),
        # #2451.1 — le mode de contexte du dossier. Absent (état repris) = None.
        context_mode=state.get("context_mode"),
        focus_weights=state.get("focus_weights") or {},
        reverse_prospects=state.get("reverse_prospects", []),
    )
    try:
        resp = await _plan(req)
    except Exception as exc:  # noqa: BLE001
        return _fail_from_exc("plan", exc, duration_ms=_ms_since(t0))
    data = resp.data or {}
    _check_contract("plan", data)
    # Knowledge flywheel (always-on): the analysis is complete here, so distil it
    # into the user's RAG store for future retrievals. Fully guarded + best-effort
    # — a no-op when there is no user / nothing to distil, and it can NEVER fail
    # the run (populate_from_analysis swallows its own errors).
    #
    # « Ne peut jamais faire échouer le run » était vrai des ERREURS, pas du
    # TEMPS : les documents sont écrits un par un (plongement + écriture par
    # document), et cette boucle vit DANS le budget de la phase de plan. Un
    # magasin lent repoussait donc l'échéance sur un plan déjà rédigé. Le
    # remplissage a maintenant sa propre borne : au-delà, on renonce à écrire,
    # jamais à livrer.
    await _bounded_best_effort(
        rag_knowledge.populate_from_analysis(
            state.get("company_name", ""),
            research=state.get("research"),
            plan=data,
            user_id=state.get("user_id", ""),
            workspace_id=state.get("workspace_id", "") or None,
        ),
        budget_s=_RAG_POPULATE_BUDGET_S,
        label="remplissage de la base de connaissance",
    )
    return {
        "plan": data,
        "completed": ["plan"],
        "envelopes": [
            _ok("plan", duration_ms=_ms_since(t0), usage=_usage_from_metrics(data), sources=_phase_trace("plan", data))
        ],
    }
