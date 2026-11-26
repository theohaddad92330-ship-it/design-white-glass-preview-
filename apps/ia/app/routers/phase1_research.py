from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

# Side-effect import: binds AgentError.from_claude_error / from_firecrawl_error
# / from_unexpected as classmethods. Required before any conversion call.
import app.models.agent_error_adapters  # noqa: F401
from app.contracts.shared_schemas import SharedSchemasNotFound, conform_to_contract
from app.knowledge.business_rules import business_rules_run_stamp
from app.middleware.correlation_id import get_correlation_id
from app.models.agent_envelope import (
    AgentEnvelope,
    AgentError,
    AgentMeta,
    AgentStatus,
    AgentWarning,
    ErrorService,
    ErrorSeverity,
    SourceHealth,
    TokenUsage,
)
from app.models.analysis_context import render_analysis_context
from app.models.outputs.research import (
    STRATEGY_SECTIONS,
    ResearchFacts,
    ResearchOutput,
    ResearchSignals,
    ResearchStrategy,
    strategy_refusal_sections,
    strategy_sections_that_say_nothing,
)
from app.models.research import ResearchRequest, ResearchResponse
from app.models.research_data import ResearchData
from app.prompts import bellum_facts, bellum_signals, bellum_strategy
from app.prompts.registry import prompt_registry_fingerprint
from app.services import company_domains, rag_knowledge, source_cache, web_documents
from app.services.access_scoring import barrier_for_company
from app.services.account_score_axes import compute_axes
from app.services.account_vocabulary import build_vocabulary, enrich_vocabulary
from app.services.actor_typology import ActorType, classify_actor_type
from app.services.analysis_account_facts import account_facts_block, append_blocks, previous_analysis_block
from app.services.analysis_tool_trace import record_analysis_tool_trace
from app.services.angle_proof_gate import apply_proof_gate
from app.services.angle_score import rank_angles
from app.services.apollo_org import enrich_organization
from app.services.assets import company_logo_url, website_domain
from app.services.cancel import run_or_cancel
from app.services.claude_service import (
    CLAUDE_HAIKU_MODEL,
    CLAUDE_MODEL,
    ClaudeError,
    call_claude,
    phase_token_usage,
    usage_from_failed_structured_call,
)
from app.services.claude_service import TokenUsage as TokenUsageClaude
from app.services.collection_focus import plan_collection
from app.services.confidence import compute_confidence
from app.services.contract_model import observe_contract_model
from app.services.country_packs import collect_country_signals, get_active_pack
from app.services.data_gateway import get_data_gateway
from app.services.data_sources.apec import it_job_signals_apec
from app.services.data_sources.ats_boards import it_job_signals_ats
from app.services.data_sources.bodacc import legal_signals
from app.services.data_sources.brave_news import recent_news
from app.services.data_sources.careers_pages import it_job_signals_careers
from app.services.data_sources.company_events import company_events, merge_company_event_signals
from app.services.data_sources.decp import awarded_it_contracts
from app.services.data_sources.employer_match import EmployerScope
from app.services.data_sources.france_travail import domain_offers, is_it_offer, it_job_signals
from app.services.data_sources.github_org import org_tech_signals
from app.services.data_sources.inpi_rne import beneficial_owners
from app.services.data_sources.job_aggregators import (
    ENOUGH_OFFERS_FOR_NO_PURCHASE,
    drop_known_offers,
    graft_recruiters,
    it_job_signals_aggregators,
    merge_published_technologies,
    published_headcount_label,
)
from app.services.data_sources.job_recruiters import split_job_recruiters
from app.services.data_sources.press_rss import attach_brave_news, merge_press_signals, press_signals
from app.services.data_sources.public_tenders import public_tenders
from app.services.data_sources.recherche_entreprises import fetch_company
from app.services.data_sources.tech_detect import detect_stack
from app.services.data_sources.wttj import it_job_signals_wttj
from app.services.dated_signals import (
    dated_signal_refs,
    ecosystem_signals_merged,
    merge_collector_signals,
    merge_job_signals,
    prefer_recent_offers,
    render_dated_signals,
    stamp_offer_locations,
    stamp_signal_urls,
)
from app.services.discover_carried_offers import carried_skills, carried_unfound_count, with_carried_offers

# #1590 — le seuil transverse de la mémoire marché, MIROIR unique tenu par
# `discover_scoring.py` (lui-même documenté et testé contre la source TS
# `MARKET_MEMORY_MIN_PATHS`). Importé ici, jamais recopié (GA-26) : un second
# `= 3` divergerait en silence le jour où le seuil bouge d'un seul côté.
from app.services.discover_scoring import _MARKET_MEMORY_MIN_PATHS, addressability_for_company
from app.services.domain_focus import looks_like_it_esn
from app.services.domain_job_filters import (
    offer_relevant_to_profile,
    placed_role_terms,
    profile_widens_collection,
    rank_offers_by_placed_roles,
    trade_offer_count,
)
from app.services.entities import (
    annotate_entity_relevance,
    assign_entity_parents,
    derive_allow_international,
    derive_in_scope_families,
    derive_no_go_keywords,
    is_foreign_entity,
    merge_web_subsidiaries,
    partition_subsidiaries,
)
from app.services.entity_identity import resolve_entity_sirens
from app.services.entity_resolution import (
    attach_alias_domain,
    attach_external_company_id,
    attach_former_legal_names,
    attach_legal_category_kind,
    resolve_account_entity,
)
from app.services.entity_type import annotate_entity_type, partition_by_display
from app.services.esn_presence import build_esn_presence
from app.services.esn_profiler import derive_esn_rules
from app.services.firecrawl import EXCLUDED_DOMAINS, FirecrawlScrapeError, _url_priority, run_credit_metrics
from app.services.free_text_facts import stamp_offer_attachments
from app.services.grounding_citations import build_cite_docs, cite_key_facts, ground_facts_v2
from app.services.identity_resolution import assess_identity
from app.services.insee_sirene import (
    closed_establishments,
    denomination_history,
    enrich_entities_naf,
    former_denominations,
    group_it_entities,
    order_sites_for_zone,
    sites_for_siren,
    unite_legale_by_siren,
)
from app.services.internship_posting import drop_internship_postings
from app.services.job_offer_enrichment import enrich_job_offers
from app.services.legal_notice_fields import extract_legal_notice_fields
from app.services.model_policy import model_for
from app.services.offer_domains import normalize_offer_domain
from app.services.offer_pertinence import sort_offers_by_trade
from app.services.offer_requester import stamp_offer_requesters
from app.services.official_directory import collect_official_directory
from app.services.output_hygiene import clean_firmographics
from app.services.pappers import CompanyProfile
from app.services.pappers import budget as pappers_budget
from app.services.perimeter_score import perimeter_score, perimeter_tier, select_priority_perimeters
from app.services.prioritization import assign_priority_tiers, tier_counts, zone_matrix
from app.services.progress import emit_progress
from app.services.provider_footprint_crawl import crawl_footprint_pages
from app.services.provider_footprint_mentions import (
    collect_legal_notice_partners,
    collect_partner_page_mentions,
)
from app.services.provider_footprint_subdomains import collect_subdomain_partners
from app.services.public_facts import cached_fact, company_fact_key, jobs_fact_variant, peek_fact, shared_jobs
from app.services.purchasing_thread import build_purchasing_thread
from app.services.quality_judge import mark_former_leaders
from app.services.research import (
    research_brave,
    research_firecrawl,
    research_pappers,
)
from app.services.research.firecrawl import ResearchBundle
from app.services.research.homonym import resolve_company_identity
from app.services.research.pappers import resolve_pappers_via_web_or_bundle
from app.services.research.sources import SourceCategory
from app.services.research_grounding import (
    PRIMARY_SOURCES,
    ResearchGroundingError,
    down_primary_sources,
    require_grounding,
)
from app.services.run_cadrage import (
    cadrage_directive,
    explicit_request,
    explicit_terms,
    keep_run_role_offers,
    profile_with_run_roles,
    run_role_terms,
)
from app.services.run_metrics import clear_metrics, get_metrics, timed
from app.services.run_metrics import summarise as summarise_metrics
from app.services.sales_context import build_sales_context, classify_account_archetype
from app.services.seller_hypotheses import append_seller_hypotheses
from app.services.signal_coverage import signal_coverage
from app.services.signal_freshness import stamp_signals_freshness
from app.services.signal_layers import build_signal_layers
from app.services.signal_selection import select_signals
from app.services.site_credit_partners import collect_site_credit_partners
from app.services.source_engine import build_research_plan, should_query_family
from app.services.source_health import (
    clear_degradations,
    get_degradations,
    get_public_degradations,
    record_degradation,
)
from app.services.sources import build_facts_sources
from app.services.supabase_client import get_supabase
from app.services.text_norm import dedup_by_name, normalize_name
from app.services.truth_status import category_status_map as truth_status_category_map
from app.services.truth_status import legend as truth_status_legend
from app.services.white_spaces import build_white_spaces
from app.services.workspace_account_match import fetch_workspace_account_candidates, match_workspace_account
from app.services.zero_layer import has_crm_history
from app.services.zone_dossier import dossier_born_from, dossier_zone, zone_first, zone_widened, zone_widening

logger = logging.getLogger(__name__)


def _registry_annuaire_present(annuaire: object, use_registry: bool) -> bool:
    return use_registry and isinstance(annuaire, dict)


router = APIRouter(prefix="/phase/1", tags=["Phase 1 — Research"])


def _headquarters_display(profile: CompanyProfile) -> str | None:
    """Render the headquarters as ``address, postal_code, city, country``.

    Each component is a separate comma-delimited segment so the output is
    unambiguous (postal code keeps its own slot even when the city is
    missing). Empty / None components are dropped.
    """
    hq = profile.headquarters
    parts = [hq.address_line_1, hq.postal_code, hq.city, hq.country]
    rendered = ", ".join(p for p in parts if p)
    return rendered or None


def _french_cities(profile: CompanyProfile) -> list[str]:
    """Unique, sorted list of French cities the entity operates in.

    Pulled from ``etablissements`` so the UI ``villes`` list reflects
    actual physical sites, not Claude's web-scrape guesses. Restricted
    to French branches to match the existing ``sitesFrance`` semantics.
    """
    seen: set[str] = set()
    cities: list[str] = []
    for b in profile.branches:
        city = (b.city or "").strip()
        if not city or city.upper() in seen:
            continue
        seen.add(city.upper())
        cities.append(city.upper())
    cities.sort()
    return cities


def _naf_from_activity_label(activity_label: object) -> str | None:
    """Pull the registry NAF code out of a Pappers ``activity_label`` like
    ``"70.10Z - Activités des sièges sociaux"`` → ``"70.10Z"``. Returns ``None``
    when no leading code is present (Claude-only text)."""
    m = re.match(r"\s*(\d{2}[.\d]*[A-Z]?)", str(activity_label or ""))
    return m.group(1) if m else None


# Périmètre d'analyse (Théo p.10/21) → consigne injectée dans le prompt de
# recherche pour focaliser le dossier. `custom`/`groupe` = neutre (None).
_SCOPE_DIRECTIVES: dict[str, str] = {
    "france": (
        "PÉRIMÈTRE DEMANDÉ : FRANCE UNIQUEMENT. Concentre le dossier sur les entités, "
        "sites et décideurs français. Ignore/écarte les filiales étrangères."
    ),
    "filiales": (
        "PÉRIMÈTRE DEMANDÉ : FILIALES. Priorise les filiales opérationnelles et entités "
        "métier du groupe (pas le seul siège), avec leurs décideurs propres."
    ),
    "it_digital": (
        "PÉRIMÈTRE DEMANDÉ : IT & DIGITAL. Concentre le dossier sur les entités IT / "
        "digitales / data du groupe (DSI, filiales tech, plateformes) et leurs enjeux SI."
    ),
    "startups": (
        "PÉRIMÈTRE DEMANDÉ : STARTUPS / JEUNES ENTITÉS. Priorise les entités récentes, "
        "en croissance ou innovantes du périmètre plutôt que les structures historiques."
    ),
}

# #3820 — un site n'a pas de texte FIXE possible (il se nomme) : consigne
# générée, jamais une entrée statique comme les autres périmètres ci-dessus.
_SITE_DIRECTIVE_NAMED = (
    "PÉRIMÈTRE DEMANDÉ : SITE — {city}. Concentre le dossier sur l'implantation de "
    "{city} et ses décideurs locaux. Ce qui sort de {city} se nomme « hors site » et "
    "ne se présente JAMAIS comme dans le périmètre — mais un siège ou une direction "
    "hors de {city} n'exclut PAS une équipe vérifiée sur place : {city} reste le "
    "filtre, pas le seul siège du groupe."
)
_SITE_DIRECTIVE_UNNAMED = (
    "PÉRIMÈTRE DEMANDÉ : UN SITE PRÉCIS (nom non renseigné). Concentre le dossier sur "
    "l'implantation visée et ses décideurs locaux plutôt que le siège du groupe, sans "
    "présumer laquelle."
)


def _scope_directive(scope_mode: str | None, *, scope_city: str | None = None) -> str | None:
    """Prompt directive for a requested analysis perimeter, or None (neutral).

    #3820 — ``site`` n'a pas de texte fixe : sa consigne se construit, nommant
    la ville/le site (``scope_city``) quand il est connu — jamais un site deviné.
    """
    mode = (scope_mode or "").strip().lower()
    if mode == "site":
        city = (scope_city or "").strip()
        return _SITE_DIRECTIVE_NAMED.format(city=city) if city else _SITE_DIRECTIVE_UNNAMED
    return _SCOPE_DIRECTIVES.get(mode)


# #4432.7 — une ZONE (région(s), département(s)) n'a pas de texte fixe : elle se nomme.
_ZONE_DIRECTIVE = (
    "PÉRIMÈTRE DEMANDÉ : ZONE — {areas}. Retiens EN PRIORITÉ les filiales, établissements, offres de "
    "recrutement et contacts situés dans {areas}. Ce qui est situé ailleurs reste dans le dossier, "
    "NOMMÉ « hors zone » et placé après ; une entité dont le lieu n'est pas établi ne se présente "
    "JAMAIS comme dans la zone."
)


def _scope_directive_for_request(req: ResearchRequest) -> str | None:
    """La consigne de périmètre du run : le mode choisi, sinon la ZONE du cadrage (#4432.7)."""
    directive = _scope_directive(req.scope_mode, scope_city=req.scope_city)
    if directive:
        return directive
    zone = dossier_zone(req.cadrage)
    return _ZONE_DIRECTIVE.format(areas=", ".join(zone.areas)) if zone else None


def _with_scope_directives(user_context_str: str, req: ResearchRequest) -> str:
    """Préfixe au contexte la consigne de périmètre (Théo p.10/21) PUIS celle du
    cadrage du commercial (cadrage analyse 15/10 : ce que tu vends, postes à
    placer, entités ciblées/exclues, thèmes exclus). Rien de posé ⇒ inchangé."""
    for directive in (
        cadrage_directive(req.cadrage),
        _scope_directive_for_request(req),
    ):
        if directive:
            user_context_str = f"{directive}\n\n{user_context_str}".strip()
    return user_context_str


def _rank_and_keep_run_jobs(jobs: list, profile: dict | None, req: ResearchRequest) -> list:
    """Les offres classées par métier placé (11/10) ; si le run porte des postes à
    placer (cadrage analyse 15/10, cas Siemens), celles d'un autre métier SORTENT."""
    # PERTINENCE-PARTOUT (Louis 25/10) — le MÊME tri métier que Découvrir : une offre hors métier ne se liste pas
    # (« Ssiap », « chef de chantier » sur la fiche d'une ESN informatique), et le journal en rend compte.
    jobs, _ = sort_offers_by_trade(jobs, profile, caller="account")
    ranked = rank_offers_by_placed_roles(jobs, profile)
    kept = keep_run_role_offers(ranked, run_role_terms(req.cadrage))
    # #4432.8 — dossier zoné : les offres de la zone en tête ; sans localisation, jamais « dans la zone ».
    return zone_first(kept, dossier_zone(req.cadrage))


def _scope_forces_france_only(scope_mode: str | None) -> bool:
    """#3820 — « france » et « site » forcent le filtre géo dur (aucune filiale
    étrangère à proposer), quel que soit le geoZone déclaré par le profil."""
    return (scope_mode or "").strip().lower() in ("france", "site")


# ── #1590 — le 4ᵉ bloc du prompt d'analyse : MÉMOIRE MARCHÉ ──────────────────
#
# Le diagnostic du 09/09 mesurait « 0 occurrence, les 3 blocs existants
# n'ont pas de 4ᵉ voisin » : rien n'injectait d'observation de mémoire marché
# dans le prompt qui écrit le dossier. Positionné dans le CODE entre le bloc
# BASE DE CONNAISSANCE et le bloc PÉRIMÈTRE (voir `_research`, plus bas) — ce
# sont les deux voisins que le diagnostic cherchait.
#
# Second bloc EN DUR, non négociable, non paramétrable : le retour le demande
# ainsi, et un texte configurable serait un texte qu'un opérateur pourrait
# affaiblir sans le vouloir.
MARKET_MEMORY_WHAT_IT_DOES_NOT_SAY = (
    "----- CE QUE ÇA NE DIT PAS -----\n"
    "Une observation de parcours n'atteste ni qu'une société de services intervient "
    "aujourd'hui chez cette entreprise, ni qu'un poste y est ouvert, ni qu'une technologie "
    "citée est sa pile officielle. C'est une trace agrégée du passé, jamais une photographie "
    "du présent — à qualifier avant toute affirmation. Et l'absence du bloc ci-dessus ne "
    "prouve rien non plus : elle dit seulement que l'observation du marché n'a pas observé assez "
    "de parcours pour se prononcer sur cette entreprise — ce n'est pas une preuve d'absence."
)


def _market_memory_block(paths_observed: int | None, top_esn: str | None) -> str | None:
    """Le 4ᵉ bloc, ou rien.

    ``None`` couvre TROIS cas indiscernables pour le prompt, à dessein — entité
    non résolue, couverture sous ``_MARKET_MEMORY_MIN_PATHS``, lecture en panne
    — dans les trois cas, aucun bloc n'entre dans le prompt, jamais un bloc
    vide ni une erreur (best-effort strict). Le seuil est REVÉRIFIÉ ici même
    si l'appelant (`_fetch_market_memory_context`) l'a déjà appliqué via
    `coverage.covered` : un appelant qui se tromperait un jour ne doit pas
    pouvoir injecter « 1 parcours observé » dans un prompt d'analyse — la
    même garde que `discover_scoring._path_axis` (GA-272).
    """
    if paths_observed is None or paths_observed < _MARKET_MEMORY_MIN_PATHS:
        return None
    who = (top_esn or "").strip() or "des sociétés de services partenaires"
    header = "===== Observation du marché (observations agrégées — jamais une présence actuelle) ====="
    body = (
        f"{paths_observed} parcours observés relient {who} à cet environnement — "
        "affinité structurelle à qualifier, jamais une présence actuelle."
    )
    return f"{header}\n{body}\n\n{MARKET_MEMORY_WHAT_IT_DOES_NOT_SAY}"


async def _fetch_market_memory_context(req: ResearchRequest) -> tuple[int | None, str | None]:
    """Best-effort STRICT : la mémoire marché de l'entreprise analysée, ou
    ``(None, None)``.

    Aucune exception ne traverse cette fonction — une panne du pont
    (non configuré, réseau, lecture en erreur) rend le prompt byte-identique à
    avant ce lot, jamais une erreur qui ferait tomber une analyse de 3-6 min
    pour un bloc d'enrichissement.
    """
    company = (req.company_name or "").strip()
    if not company:
        return None, None
    from app.services import bellum_api

    try:
        # #1590 — la MÊME porte que le plan et les messages (#1611.4/.5) :
        # `market/context`, jamais une seconde route pour la même lecture
        # (GA-258, un seul point d'entrée de résolution). `ref` est libre — il
        # ressort tel quel pour que l'appelant s'y retrouve dans ses logs — et
        # Phase 1 n'a pas d'`accountId` : l'entreprise analysée n'est pas
        # toujours déjà un compte du portefeuille. Le nom fait donc la
        # référence, et il ne sert QU'À ça : la résolution, elle, passe par
        # `companyName` + `website` + `country`, comme partout ailleurs.
        result = await bellum_api.market_memory_context_for(
            req.user_id,
            ref=company,
            company_name=company,
            website=req.website,
            country=req.country,
        )
    except Exception as exc:  # noqa: BLE001 — jamais faire tomber une analyse
        logger.warning("Observation du marché indisponible pour '%s' (ignorée) : %s", company, exc)
        return None, None
    if not isinstance(result, dict) or result.get("status") != "ok":
        return None, None
    coverage = result.get("coverage")
    if not isinstance(coverage, dict) or not coverage.get("covered"):
        return None, None
    # Champs TELS QUE `MarketMemoryCoverage` (contrat TS) les nomme — relayés
    # camelCase depuis le pont, comme `search_market_memory` le fait déjà
    # (c'est `chat_tools.py`, pas `bellum_api.py`, qui reformate en snake_case
    # pour SON appelant ; ici l'appelant est ce fetcher, qui lit la forme
    # d'origine directement).
    paths = coverage.get("marketPaths")
    if not isinstance(paths, int):
        return None, None
    top_esn: str | None = None
    observed = coverage.get("esnObserved")
    if isinstance(observed, list) and observed:
        first = observed[0]
        if isinstance(first, dict):
            name = str(first.get("esnName") or "").strip()
            top_esn = name or None
    return paths, top_esn


def _merge_pappers(analysis: dict, profile: CompanyProfile | None, *, use_registry: bool = True) -> dict:
    """Overlay a typed :class:`CompanyProfile` onto the merged Claude output.

    Wire shape conventions:

    - ``headquarters`` is the human-readable one-liner (string) so the UI
      can render it as-is without re-formatting.
    - ``headquarters_address`` carries the structured fields when a
      consumer needs them (lat/lng, postal code, etc.).
    - ``cities`` lists the deduplicated French cities pulled from
      ``etablissements`` — used by the "sites en France" view.

    ``use_registry=False`` (Company Resolver hard rule, retour Thales) — the
    resolved SIREN is a homonym / uncertain (see ``identity_resolution``): DO NOT
    let the wrong entity's firmo (transports fluviaux, 1-2 salariés…) overwrite
    the web firmo nor flow into the header/scoring. The rejected SIREN is stashed
    for traceability; the dossier stays in "mode groupe web".
    """
    if profile is None:
        return analysis
    if not use_registry:
        return {**analysis, "identityRejectedSiren": profile.siren}

    merged = dict(analysis)
    payload = profile.model_dump(by_alias=False, mode="json")

    # Pappers is the source of truth for revenue, sector, employees and
    # headquarters — Claude is told "Non identifié dans les sources" when
    # nothing matches, so we MUST overwrite those slots whenever Pappers
    # has the data, otherwise the UI shows a fake "non identifié".
    if profile.revenue_latest is not None:
        merged["revenue"] = str(profile.revenue_latest)
    if profile.headcount_label:
        merged["employees"] = profile.headcount_label
    # NAF label is the authoritative sector classification.
    naf_sector = profile.naf_label or profile.activity_domain
    if naf_sector:
        merged["sector"] = naf_sector
    # Registry NAF/APE code (e.g. "62.01Z") — the API persists it so "comptes
    # similaires" (Théo p.41) can seed discovery by NAF proximity. Only stamped
    # when the resolved entity is trusted (use_registry=True); a rejected homonym
    # never leaks its NAF.
    if profile.naf_code:
        merged["nafCode"] = profile.naf_code
    # Headquarters: clean string for the UI + structured object next to it.
    merged["headquarters"] = _headquarters_display(profile) or ""
    merged["headquarters_address"] = payload["headquarters"]
    merged["headquarters_display"] = merged["headquarters"]
    # Cities list (French sites) for the sitesFrance card.
    cities = _french_cities(profile)
    if cities:
        merged["cities"] = cities

    # New typed fields (English keys).
    for key in (
        "siren",
        "legal_name",
        "legal_form",
        "creation_date",
        "activity_label",
        "capital",
        "financials_history",
        "executives",
        "c_level",
        "subsidiaries",
        "branches",
        "branch_count",
        "beneficial_owners",
        "corporate_graph",
        "corporate_purpose",
        "rcs_status",
        "rcs_court",
        "consolidated_status",
        "pappers_url",
    ):
        merged[key] = payload.get(key)

    # #4327 — le registre ne remplace plus ce que le web nomme : une filiale
    # indirecte ou connue par son nom commercial (« Fortuneo ») restait absente
    # dès que le graphe répondait.
    merged["subsidiaries"] = merge_web_subsidiaries(
        payload.get("subsidiaries") or [], analysis.get("subsidiaries") or []
    )

    return merged


# ── Per-prompt max_tokens budgets ─────────────────────────────────────────────
#
# Sized so each prompt's structured output stays well below Claude's cap.
# Bumped from 6k to 12k after observing ``ClaudeIncompleteOutputError`` on
# rich accounts (e.g. SNCF). Sonnet 4 supports 64k output, ``asyncio.gather``
# means wall-time = max() not sum().
#
# Output caps for the 3 research calls. Env-tunable (not silent literals) so we
# can tighten them without a redeploy — today each fills ~10k (< cap), so lowering
# to ~10k would force concision if research output creeps up.
FACTS_MAX_TOKENS = int(os.getenv("FACTS_MAX_TOKENS", "12000"))
SIGNALS_MAX_TOKENS = int(os.getenv("SIGNALS_MAX_TOKENS", "12000"))
STRATEGY_MAX_TOKENS = int(os.getenv("STRATEGY_MAX_TOKENS", "12000"))

# bellum_facts stays on Sonnet (firmographic accuracy — entities, tech, regs).
# bellum_signals is already Haiku (pure list extraction). bellum_strategy (angles
# / pains / RDV / objections + axesEcartes + commentOuvrirCompte = the sellable
# deck) defaults to SONNET: Haiku dropped axesEcartes/commentOuvrirCompte run-to-run
# (schema-adherence variance on the richest prompt). Sonnet fiabilise le deck.
# Env-revertible to Haiku for cost (STRATEGY_MODEL=claude-haiku-4-5).
_STRATEGY_MODEL = os.environ.get("STRATEGY_MODEL") or CLAUDE_MODEL


async def _call_strategy(
    system_prompt: str, user_prompt: str, *, cid: str
) -> tuple[ResearchStrategy, TokenUsageClaude | None, tuple[str, ...]]:
    """Appelle `bellum_strategy` et SURVIT à un refus de schéma.

    Rend `(sortie, usage, sections refusées)`. Le troisième membre est vide sur
    le chemin normal ; non vide, il nomme les sections que le refus a désignées.

    Pourquoi ce détour plutôt que de laisser l'exception remonter : le schéma
    refuse maintenant la sortie vide, et l'appel vit dans le `as_completed` des
    trois prompts parallèles. Une exception y ferait basculer la PHASE ENTIÈRE
    en 502 — alors que faits, signaux, contacts et plan ont abouti, et que le
    dépôt a déjà tranché que le dossier part quand même dans ce cas. Refuser
    bruyamment ne doit pas vouloir dire jeter le travail des deux autres prompts.

    ⚠️ Ce qui n'est PAS un refus de schéma remonte, intact. Une panne réseau, un
    529, un champ de mauvais type : ce sont des échecs, et un échec déguisé en
    dossier dégradé est exactement le défaut qu'on est en train de corriger.
    """
    try:
        out, usage = await call_claude(
            system_prompt, user_prompt,
            response_model=ResearchStrategy,
            max_tokens=STRATEGY_MAX_TOKENS,
            model=_STRATEGY_MODEL,
            prompt_name="bellum_strategy",
            correlation_id=cid,
        )
    except Exception as exc:
        sections = strategy_refusal_sections(exc)
        if not sections:
            raise
        # `logger.error` = remontée Sentry (convention du dépôt). Le nom des
        # sections est ce qui distingue cette ligne de l'ancienne : « la
        # stratégie est vide » ne disait pas QUOI relancer.
        logger.error(
            "bellum_strategy — le schéma a REFUSÉ la sortie (sections vides : %s) "
            "après %s tentative(s) ciblée(s)",
            ", ".join(sections),
            getattr(exc, "n_attempts", "?"),
            extra={
                "tags": {"phase": "research", "code": "STRATEGY_SCHEMA_REFUSED"},
                "contexts": {"strategy": {"empty_sections": list(sections)}},
            },
        )
        # Les jetons des tentatives refusées ont bien été facturés — les perdre
        # ferait mentir la facture du run vers le bas. `None` quand rien n'est
        # mesurable : « non mesuré » n'est pas « 0 ».
        return (
            ResearchStrategy.empty(),
            usage_from_failed_structured_call(exc, _STRATEGY_MODEL),
            sections,
        )
    assert isinstance(out, ResearchStrategy)
    return out, usage, ()

# Global ceilings for the web-collection step. Brave is fast (sub-second per
# query × 5 in parallel), Firecrawl is slow (multi-second per page). The numbers
# are budgets, not deadlines — internal timeouts (``GLOBAL_TIMEOUT_S`` in
# brave_search, ``PER_URL_TIMEOUT_S`` in firecrawl) already cap individual
# calls; these are the safety net.
#
# 180s absorbs the vannes-ouvertes default (FIRECRAWL_MAX_PAGES=12): 12 pages
# at concurrency 5 = 3 waves × 25s/page hard cap = 75s worst case single-run
# (2.4× headroom). Under multi-run rpm contention (firecrawl throttle 20 rpm,
# 30s max wait/slot) the degenerate case is 3 × (30+25) = 165s — still inside
# the budget; a starved slot degrades to a per-URL error, never a phase abort.
BRAVE_PAPPERS_TIMEOUT_S = float(os.getenv("BRAVE_PAPPERS_TIMEOUT_S", "60"))
# 180s was a safety net sized for a 3-concurrency, 15-page era. With 7 pages at
# concurrency 10 the scrape is ONE wave, so the honest budget is roughly
# per-page-timeout + overhead, not three minutes. It matters because Firecrawl
# fully blocks the 3 Claude prompts behind it: every second waiting on a
# straggler page is a second added to the analysis the user is watching. Pages
# that exceed it are dropped and reported via source_health, not silently.
FIRECRAWL_TIMEOUT_S = float(os.getenv("FIRECRAWL_TIMEOUT_S", "75"))


def _registry_identity_overlay(cp_signals: object) -> dict:
    """Flat cross-border registry identity to merge into the research result.

    Dédup internationale des comptes canoniques : quand le country pack du run a
    résolu une identité registre (CIK US / corp id CA / UID CH / BCE BE), on
    l'expose dans le résultat pour que l'API la persiste sur le compte
    (colonnes ``registry_id`` / ``registry_country``) et déduplique le compte
    canonique du workspace dessus — exactement comme le SIREN l'est côté FR.

    Returns ``{}`` when nothing was resolved (FR default → no pack, pack OFF,
    lookup unresolved/failed) so the FR payload stays **byte-identical** — no key
    is ever added. Never invents an identifier: only a non-empty ``registryId``
    + ``country`` pair coming from the pack's registry lookup is surfaced.

    ``countryRegistry`` carries the full :class:`RegistryEntity` (name, legal
    form, seat, official detail URL…) for the dossier/raw payload; the flat
    ``registryId`` / ``registryCountry`` pair is the wire contract the API lifts
    (see ``AnalysisResearchData`` in ``@bellum/contracts``).
    """
    registry = cp_signals.get("registry") if isinstance(cp_signals, dict) else None
    if not isinstance(registry, dict):
        return {}
    registry_id = str(registry.get("registryId") or "").strip()
    country = str(registry.get("country") or "").strip().upper()
    if not registry_id or not country:
        return {}
    return {
        "registryId": registry_id,
        "registryCountry": country,
        "countryRegistry": registry,
    }


def _us_sec_financials_overlay(cp_signals: object) -> dict:
    """Persist the SEC/EDGAR (US) financial snapshot resolved by the US country
    pack into the research result — annual revenues + net income (recorded XBRL
    10-K facts, each dated by its filing), CIK + 10-K filings link, and dated
    full-text-search filings — so the API lands it under
    ``raw_analysis.us_sec_financials`` (the API ``toSnakeCaseKeys`` pass snakes the
    camelCase key) and the account « Financiers SEC (US) » block can show it.

    Constat #540 volet A: these financials were injected into the prompt but never
    persisted (invisible on the fiche compte). ``{}`` when the pack produced none
    (FR default → no pack, non-US country, or a private US company with no SEC
    filing) so the payload stays byte-identical — no key is ever added.
    """
    fin = cp_signals.get("secFinancials") if isinstance(cp_signals, dict) else None
    if not isinstance(fin, dict) or not fin:
        return {}
    return {"usSecFinancials": fin}


def _contract_model_overlay(company: str, jobs: list, tenders: list) -> dict:
    """#2291.2 (lot R, 19/09/2026) — L'OBSERVATION SURVIT à la recherche.

    La même fonction que Découvrir (``contract_model.observe_contract_model``),
    lue sur les MÊMES offres d'emploi et avis BOAMP que la phase 1 a DÉJÀ en
    main pour ce compte (``jobs``/``tenders``, calculés plus haut pour le bloc
    de signaux datés) — zéro appel réseau de plus.

    Toujours posée, JAMAIS ``{}`` : contrairement aux overlays pays ci-dessus
    (qui n'ajoutent une clé que si le pack l'a produite), une analyse qui passe
    la phase de signaux calcule TOUJOURS son modèle de contrat, même quand rien
    n'est attribuable (``None``). C'est ce qui permet au rattrapage
    (``SEGMENT_CAPABILITY_EPOCH.signals`` côté contrats) de distinguer « analysé
    avant cette capacité » (clé absente en base) de « analysé depuis, rien
    observé » (``None`` — jamais un « n'y recourt pas », doctrine c65/GA-259).
    """
    return {"contractModel": observe_contract_model(company, jobs, tenders)}


async def _research(req: ResearchRequest) -> ResearchResponse:
    """Phase 1 business logic — extracted so the router can wrap it in
    ``run_or_cancel`` for client-disconnect handling.

    Full company research, parallelized across 3 Claude prompts.

    Single mono-prompt previously truncated at ``max_tokens=16000`` on rich
    accounts, raising ``IncompleteOutputException`` and triggering ~24 min of
    SDK + instructor + BullMQ retries. Split into BELLUM-FACTS /
    BELLUM-SIGNALS / BELLUM-STRATEGY, each with its own narrow Pydantic model
    and a 6k cap. ``asyncio.gather`` collapses wall-time to the slowest of
    the three.
    """
    company = req.company_name
    # Cadrage analyse (15/10) — les postes à placer du run deviennent les `placedRoles`
    # de CE run : le tri des offres (lot JOBS-CIBLE #4182) les lit par le même contrat.
    profile = profile_with_run_roles(req.profile_data, req.cadrage) or {}
    cb = req.progress_callback

    # C5 — cache sources publiques : ouvre le contexte de run (compteurs hit/miss
    # par source + économie estimée) et décide le bypass automatique — le MÊME
    # compte relancé < 1 h ⇒ lectures cache ignorées (le commercial qui relance
    # veut du frais), le write-through continue de rafraîchir pour les autres.
    # DOIT précéder le fan-out asyncio.create_task ci-dessous : les tâches filles
    # héritent (et partagent) les compteurs via la copie de contexte. Best-effort.
    # VC.3 (18/10) — la veille d'un compte réutilise la collecte publique de la MÊME société faite
    # par n'importe quel espace dans les 24 h (clé SIREN, sinon domaine — jamais une raison sociale) ;
    # sans elle, elle recollecte les sources gratuites. Les critères de l'espace s'appliquent à la lecture.
    await source_cache.begin_run(
        account_id=req.account_id,
        company=company,
        company_key=company_fact_key(siren=req.siren, domain=website_domain(req.website or "")),
        watch=req.watch_refresh,
    )
    # Accept either the typed AnalysisContext (new wire) or the legacy
    # free-text string. Both flow through `render_analysis_context` to
    # produce the prompt-friendly block.
    if isinstance(req.user_context, str):
        user_context_str = req.user_context
    else:
        user_context_str = render_analysis_context(req.user_context)

    # RAG-knowledge v2 (always-on): pull the user's reranked knowledge for this
    # account/target sectors and ADD it to the prompt context. Purely additive —
    # with no user_id / an empty store retrieve_reranked_context returns "" ⇒
    # user_context_str is unchanged; existing context is never removed.
    _profile_sectors = " ".join(str(s) for s in (profile.get("sectors") or [])) if isinstance(profile, dict) else ""
    _knowledge_ctx = await rag_knowledge.retrieve_reranked_context(
        f"{company} {_profile_sectors}".strip(),
        req.user_id,
        sector=_profile_sectors or None,
        workspace_id=req.workspace_id or None,
        account_id=req.account_id or None,  # #2779
    )
    if _knowledge_ctx:
        _kb_header = "===== BASE DE CONNAISSANCE (analyses passées — à exploiter) ====="
        user_context_str = (
            f"{user_context_str}\n\n{_kb_header}\n{_knowledge_ctx}"
            if user_context_str.strip()
            else f"{_kb_header}\n{_knowledge_ctx}"
        )
    # #3586 — savoir métier du Drive interne Bellum, bloc DÉDIÉ (jamais sous « analyses
    # passées »), commun à tous les espaces. Vide ⇒ prompt byte-identique.
    _drive_ctx = await rag_knowledge.retrieve_drive_context(
        f"{company} {_profile_sectors}".strip(), account_id=req.account_id or None
    )
    user_context_str = rag_knowledge.append_drive_block(user_context_str, _drive_ctx)

    # #1590 — LE 4ᵉ BLOC : MÉMOIRE MARCHÉ. Positionné ici dans le CODE, entre
    # le bloc BASE DE CONNAISSANCE ci-dessus et le bloc PÉRIMÈTRE ci-dessous —
    # le diagnostic du 09/09 cherchait ce voisin et n'en trouvait aucun.
    # Best-effort STRICT (voir `_fetch_market_memory_context` et
    # `_market_memory_block`) : entité non résolue, couverture sous le seuil,
    # ou pont en panne rendent tous les trois `None` — le prompt part alors
    # byte-identique à avant ce lot, jamais une erreur ni un bloc vide.
    _mm_paths, _mm_top_esn = await _fetch_market_memory_context(req)
    _market_memory_text = _market_memory_block(_mm_paths, _mm_top_esn)
    if _market_memory_text:
        user_context_str = f"{user_context_str}\n\n{_market_memory_text}"

    # #3753.3 — le ciblage de l'ESN sur ce compte (tier, raison, problématiques,
    # projets IT), sous l'étiquette « hypothèses du vendeur » : fournies, non
    # vérifiées, jamais des faits collectés. Sans ciblage ⇒ contexte inchangé.
    user_context_str = append_seller_hypotheses(user_context_str, req.seller_hypotheses)

    # #4070.1/.4 — l'HISTORIQUE COMPLET du compte (socle #4069 : signaux de tout âge, besoins
    # enregistrés, corrections de l'équipe), décoté par l'âge côté API, TOUJOURS daté, jamais
    # nommé par sa provenance — c'est ce qui nourrit le « pourquoi maintenant » (un besoin qui
    # revient est un signal fort). Puis l'analyse précédente, trace datée dont les corrections
    # humaines gagnent. Ni l'un ni l'autre ⇒ contexte byte-identique (aucun bloc).
    user_context_str = append_blocks(
        user_context_str,
        account_facts_block(req.account_facts, "research"),
        previous_analysis_block(req.previous_analysis),
    )

    # Périmètre d'analyse (Théo p.10/21) : préfixe la consigne de scope au contexte
    # pour que Claude focalise le dossier (France / filiales / IT / startups). Le
    # `france` applique aussi un filtre géo dur plus bas (voir _allow_intl).
    user_context_str = _with_scope_directives(user_context_str, req)

    # Country pack (ADDITIVE, on for its market — zero-flag). Resolved once:
    # non-None ONLY when a registered non-FR country is targeted (CH/BE/LU/US/CA).
    # For the default FR path this is None ⇒ nothing below runs (no vocab change,
    # no task, no network) and the prompt is byte-identical to today.
    country_pack = get_active_pack(req.country)
    if country_pack is not None:
        _country_fragment = country_pack.local_vocabulary().get("prompt_fragment", "")
        if _country_fragment:
            user_context_str = f"{_country_fragment}\n\n{user_context_str}".strip()

    # ── Step 1: kick off Brave + Pappers concurrently ────────────────────────
    # Firecrawl (Step 2) only needs Brave's URLs, so we gate the scrape on Brave
    # alone and let the Pappers calls run concurrently with it (F2). The Pappers
    # name search is the fast path; the SIREN fallback is deferred to after the
    # scrape so it can reuse already-scraped pages instead of re-fetching (F1).
    brave_task = asyncio.create_task(research_brave(company, profile))

    # Désambiguïsation des homonymes (Théo p.10 / homonyme) — scan déterministe des
    # candidats SIREN via la source libre recherche-entreprises (sans clé). Résolu
    # AVANT Pappers pour ancrer la recherche sur le BON SIREN au lieu du 1er hit
    # aveugle de la recherche par nom (deux « THALES » actifs passent le garde de
    # similarité — c'est la taille / le NAF / les établissements qui tranchent).
    #   • siren fourni (scope lock) → court-circuit (statut ``locked``), rien ne change ;
    #   • un candidat DOMINE (unique/selected) → on ancre Pappers dessus ;
    #   • ambigu / aucun → pas d'ancre → Pappers garde son comportement historique
    #     (best-effort), et on expose les candidats scorés pour que l'UI tranche.
    # Un GET libre rapide (fallback gracieux → statut ``none``) : ne casse jamais le run.
    try:
        homonyms = await asyncio.wait_for(
            resolve_company_identity(company, siren=req.siren), BRAVE_PAPPERS_TIMEOUT_S
        )
    except Exception as exc:  # noqa: BLE001 — la désambiguïsation ne doit jamais bloquer
        logger.warning("Homonym disambiguation failed for '%s' (continuing): %s", company, exc)
        homonyms = None
    # Ancre = le SIREN verrouillé par l'utilisateur, sinon le gagnant de la
    # désambiguïsation — mais on ne surclasse la résolution Pappers QUE si on est
    # confiant : un gagnant qui DOMINE (``selected``) ou un match UNIQUE au nom
    # fort. Un unique au nom lâche (0.55–0.79) ne suffit pas → on laisse Pappers
    # résoudre (comportement historique). ``ambiguous``/``none`` → jamais d'ancre.
    _anchor_siren = (req.siren or "").strip()
    if (
        not _anchor_siren
        and homonyms
        and homonyms.selected_siren
        and (homonyms.status == "selected" or (homonyms.status == "unique" and homonyms.confidence >= 0.70))
    ):
        _anchor_siren = homonyms.selected_siren
    if homonyms and homonyms.status in {"selected", "ambiguous"}:
        logger.info(
            "Homonym scan for '%s': status=%s, %d candidats, selected=%s",
            company, homonyms.status, homonyms.candidate_count, homonyms.selected_siren or "—",
        )
    # Scope lock (Théo p.10) : si le commercial a choisi une entité précise (ou si
    # la désambiguïsation a un gagnant net), on ancre Pappers sur ce SIREN au lieu
    # de re-résoudre le nom (ambigu pour un groupe : SG → ~100 SCI).
    pappers_task = asyncio.create_task(research_pappers(company, siren=_anchor_siren or None))
    # Extra free sources kicked off in PARALLEL (they only need the name) — the
    # annuaire registry cross-check and recent press. They run during the scrape
    # + Claude synthesis, so their latency is absorbed (gathered at the end).
    annuaire_task = asyncio.create_task(fetch_company(company))
    news_task = asyncio.create_task(recent_news(company))
    # LOT (15/10) DATA-A point 2 — veille quotidienne : le cache 30 j ne voit plus de nouveauté, on ajoute
    # UN appel Brave News `freshness=pd` (cache 1 j à part). La phase 1 complète reste servie par le cache.
    fresh_news_task = asyncio.create_task(recent_news(company, freshness="pd")) if req.watch_refresh else None
    # #3917/#3925 — presse française par flux RSS publics (signaux typés, datés,
    # avec lien). ADDITIF : exposé sous `result["pressSignals"]` (clé optionnelle),
    # jamais injecté dans les prompts. No-op si PRESS_RSS_ENABLED=false.
    # #4067 DECOUVRIR-COLLECTE — d'abord le cache PARTAGÉ des faits publics, rangé
    # par ENTREPRISE (SIREN, sinon domaine) : ce que Découvrir ou un autre espace a
    # déjà collecté et qui est frais ne se recollecte pas.
    _press_domain = website_domain(req.website or "") or None
    _fact_company = company_fact_key(siren=_anchor_siren, domain=_press_domain)
    # VC.3 (18/10) — cette collecte (analyse, « Actualiser » ou veille) sert la veille des autres
    # espaces pendant 24 h : un tampon VIDE sous la société, jamais l'espace.
    await source_cache.mark_collected(_fact_company)
    # DISCOVER-OFFRES (15/10) — le site du compte, rangé par SIREN : Découvrir en tire le volume d'offres de la carte.
    await company_domains.remember(_anchor_siren, req.website)
    press_task = asyncio.create_task(
        cached_fact(
            "news", _fact_company, "", lambda: press_signals(company, _anchor_siren or None, _press_domain)
        )
    )
    # Le tri des offres suit le domaine que le VENDEUR vend (addendum Stelya §11) :
    # sans pack ou en IT, le tri historique à l'octet près ; pour un vendeur
    # industriel, ses propres familles ROME — sans quoi il lisait des offres de
    # développeurs pendant que ses prompts, eux, parlaient bureau d'études.
    seller_pack = normalize_offer_domain((profile or {}).get("offerDomain"))
    # #1124 — le PLACEMENT est un axe orthogonal au domaine. Une ESN qui place
    # des profils en CDI chez ses clients veut les offres IT (qu'elle a déjà) ET
    # les autres : pour elle, toute ouverture de poste chez un compte est une
    # piste, et le tri par rôle lui cachait précisément celles qu'elle vend.
    # Déclaré dans le profil, jamais déduit — absent ⇒ tri historique.
    #
    # #3901 — les offres PAR COMPTE suivent la MÊME règle que Découvrir : la
    # pertinence dépend du profil (domaine d'offre + métiers placés), pas d'un
    # tri IT fixe. Quand le tri IT de la source n'EST PAS la règle du profil
    # (industrie, BU cyber, placement, profil sans périmètre), on collecte sans
    # ce tri et `offer_relevant_to_profile` juge chaque offre au merge — sans
    # profil exploitable, elle garde tout. Profil IT : tri de la source, inchangé.
    collect_all_roles = profile_widens_collection(profile)

    def _relevant_to_profile(offers: list) -> list:
        return [o for o in offers if offer_relevant_to_profile(o, profile, it_check=is_it_offer)]
    # #3817.1 — l'ancre SIREN (ci-dessus) sert aussi l'appariement des offres :
    # un grand groupe enregistré sous une raison sociale à suffixe (« JCDecaux
    # France ») peut n'avoir aucune offre qui porte ce suffixe mot à mot.
    #
    # DECATHLON 11/10 — les offres se rattachent au GROUPE : les entités que le
    # registre connaît déjà (raison sociale, filiales, leurs SIREN) comptent. La
    # fiche Pappers tourne en parallèle ; on l'attend (sans jamais l'annuler)
    # avant de filtrer — ces offres ne sont lues qu'après le scrape, ça ne coûte rien.
    async def _group_scope() -> EmployerScope:
        try:
            registry = await asyncio.wait_for(asyncio.shield(pappers_task), BRAVE_PAPPERS_TIMEOUT_S)
        except asyncio.CancelledError:
            if not pappers_task.cancelled():
                raise
            registry = None
        except Exception:  # noqa: BLE001 — sans fiche, seul le nom et l'ancre comptent
            registry = None
        return EmployerScope.from_registry(company, siren=_anchor_siren or None, profile=registry)

    group_scope_task = asyncio.create_task(_group_scope())

    # #4045 (14/10) — UN cache des OFFRES par SIREN, partagé avec Découvrir : chaque source
    # écrit sous la variante canonique (`jobs_fact_variant`, même chaîne des deux côtés) et
    # relit avant d'appeler. `read` :
    #   "full"     — lire (le vide aussi) puis écrire : la question posée est celle de Découvrir ;
    #   "nonempty" — la question dépend du SITE du compte (boards ATS, pages carrières) que
    #                Découvrir ne connaît pas : un vide posé par lui ne répond pas pour nous,
    #                seule une ligne rangée est relue ;
    #   "none"     — le GROUPE connu est plus large que le SIREN (filiales) : une réponse plus
    #                étroite ne sert pas une question plus large — on collecte, on range.
    async def _shared_jobs(
        source: str, fetch: Callable[[], Awaitable[list]], *, read: str = "full", watch: bool = False
    ) -> list:
        return await shared_jobs(
            source, _fact_company, fetch, pack=seller_pack, all_roles=collect_all_roles, read=read, watch=watch
        )

    async def _group_read_mode() -> str:
        scope = await group_scope_task
        wide = any(known != scope.siren for known in scope.known_sirens)
        return "none" if wide else "full"

    async def _france_travail_jobs() -> list:
        scope = await group_scope_task
        return await _shared_jobs(
            "france_travail",
            lambda: it_job_signals(
                company, pack=seller_pack, all_roles=collect_all_roles, siren=_anchor_siren or None, scope=scope
            ),
            read=await _group_read_mode(),
        )

    jobs_task = asyncio.create_task(_france_travail_jobs())  # France Travail (no-op without creds)
    # Sources emploi complémentaires (roadmap §8 — ADDITIF, dédup URL au merge) :
    # APEC = actif par défaut (webservice public sans clé, throttle 20 rpm, échec
    # gracieux → []) ; WTTJ = no-op documenté sans identifiants Algolia fournis
    # par l'opérateur (pas d'API publique gratuite — voir data_sources/wttj.py).
    # #4067 — offres cadres : la MÊME question que Découvrir (nom, SIREN, placement),
    # donc le même fait partagé. (Les offres France Travail ci-dessus restent sous
    # leur clé de GROUPE : une question plus large, jamais servie par une plus étroite.)
    apec_jobs_task = asyncio.create_task(
        _shared_jobs(
            "apec",
            lambda: it_job_signals_apec(
                company, pack=seller_pack, all_roles=collect_all_roles, siren=_anchor_siren or None
            ),
        )
    )
    wttj_jobs_task = asyncio.create_task(it_job_signals_wttj(company))
    # #3885 (lot RAS) — agrégateurs à API officielle (Adzuna, Jooble, TheirStack
    # qui couvre LinkedIn/Indeed sous contrat). NO-OP STRICT sans clé. Tri métier
    # = celui de France Travail (domaine du vendeur, placement CDI).
    # SIG-A (A4) — pile et effectif de l'employeur lus dans les offres publiées
    # gardées ; versés plus bas dans `detectedTechStack` et `employees`.
    _published_employer: dict = {}
    # CASCADE-PLANCHER-5 — ce que la cascade des offres a fait (paliers, gains, appels payés) : l'écran le DIT.
    _offers_cascade: dict = {}

    _AGGREGATOR_KEYS = {
        "adzuna": ("ADZUNA_APP_ID", "ADZUNA_APP_KEY"),
        "jooble": ("JOOBLE_API_KEY",),
        "theirstack": ("THEIRSTACK_API_KEY",),
        "fantastic": ("FANTASTIC_JOBS_API_KEY",),
        "mantiks": ("MANTIKS_API_KEY",),
    }

    async def _aggregator_share(source: str, fetch: Callable[[], Awaitable[list]]) -> list:
        """Le fournisseur passe par le cache d'offres partagé. CACHE-SOURCES (15/10) : ce qui s'y
        range est le fait BRUT de l'entreprise (jamais une offre de stage), identique pour tous
        les espaces ; le tri métier du vendeur (pack / all_roles) s'applique ICI, à la lecture."""

        async def _raw() -> list:
            rows = await fetch()
            if not isinstance(rows, list):
                return rows
            return drop_internship_postings(rows, title_keys=("title",), contract_keys=("contractType",))

        def _for_seller(rows: list) -> list:
            if not isinstance(rows, list):
                return rows
            return domain_offers(rows, pack=seller_pack, all_roles=collect_all_roles)

        # Sans clé, le fournisseur ne cherche RIEN : il n'écrit jamais un « cherché, rien
        # trouvé » (il fermerait la porte, 24 h, à l'espace qui a une clé) — il peut
        # seulement RELIRE ce qu'un autre a rangé (aucun appel).
        if not all(os.environ.get(env, "").strip() for env in _AGGREGATOR_KEYS.get(source, ())):
            return _for_seller(
                await peek_fact("jobs", _fact_company, jobs_fact_variant(source, seller_pack, collect_all_roles)) or []
            )
        # VC.1 (18/10) — la veille quotidienne n'achète pas : une source payée n'y est lue qu'en cache.
        return _for_seller(
            await _shared_jobs(source, _raw, read=await _group_read_mode(), watch=req.watch_refresh)
        )

    async def _aggregator_jobs() -> list:
        # DISCOVER-OFFRES (15/10, D) — les offres FUSIONNÉES d'une analyse déjà faite (semis du cache commun)
        # se RELISENT d'abord, sans appel : assez d'offres fraîches → aucune source payante n'est interrogée.
        known = domain_offers(
            await peek_fact("jobs", _fact_company, jobs_fact_variant("merged", seller_pack, collect_all_roles)) or [],
            pack=seller_pack,
            all_roles=collect_all_roles,
        )
        # DECATHLON 30/10 — « assez » se compte dans le MÉTIER du vendeur : 10 offres de vente gardées par un
        # placeur en CDI n'épargnent plus la recherche de ses offres data.
        trade_terms = placed_role_terms(profile)
        if trade_offer_count(known, trade_terms) >= ENOUGH_OFFERS_FOR_NO_PURCHASE:
            return known
        fresh = await it_job_signals_aggregators(
            company,
            # #3901 — même règle que les sources directes.
            keep_title=lambda title: offer_relevant_to_profile({"title": title}, profile, it_check=is_it_offer),
            # DECATHLON 11/10 — le groupe connu et le site du compte.
            scope=await group_scope_task,
            # #4182 — sans site saisi, le site que la fiche a déjà rangé par SIREN (jamais deviné du nom).
            domain=website_domain(req.website or "") or await company_domains.lookup(_anchor_siren) or None,
            employer_facts=_published_employer,
            share=_aggregator_share,
            # CASCADE-PLANCHER-5 — une demande précise du commercial ⇒ la cascade va au bout de ses paliers.
            explicit_request=explicit_request(req.cadrage, carried_skills(req.seller_hypotheses)),
            terms=explicit_terms(req.cadrage, carried_skills(req.seller_hypotheses)),
            cascade_out=_offers_cascade,
            trade_terms=trade_terms,
        )
        return [*known, *drop_known_offers(fresh, known)]

    aggregator_jobs_task = asyncio.create_task(_aggregator_jobs())
    # Boards ATS publics (tome 2 §13) : Greenhouse et Lever hébergent des offres
    # que les agrégateurs ne reprennent pas. Deux API publiques, sans clé. Sans
    # site connu, seul Greenhouse est interrogé — et seulement s'il NOMME
    # l'entreprise : un slug deviné attribuerait à ce compte les offres d'un
    # homonyme. Board absent ⇒ 404 ⇒ `[]`, ce qui est le cas le plus fréquent.
    ats_jobs_task = asyncio.create_task(
        _shared_jobs(
            "ats",
            lambda: it_job_signals_ats(
                company, website=req.website, all_roles=collect_all_roles, siren=_anchor_siren or None
            ),
            read="nonempty",
        )
    )

    # #3925.1 — pages carrières PUBLIQUES du domaine (JSON-LD `JobPosting`).
    # robots.txt respecté, UA honnête, ni cookie ni JS (frontière c79). Sans site
    # connu : `[]` sans réseau. Réglage unique : CAREERS_PAGES_ENABLED (défaut vrai).
    async def _no_careers() -> list:
        return []

    _careers_on = os.environ.get("CAREERS_PAGES_ENABLED", "true").strip().lower() not in ("0", "false", "no", "off")
    careers_jobs_task = asyncio.create_task(
        _shared_jobs(
            "careers",
            lambda: it_job_signals_careers(company, req.website, all_roles=collect_all_roles),
            read="nonempty",
        )
        if _careers_on
        else _no_careers()
    )

    # L'archétype préliminaire PILOTE la collecte (DoD p31 n°3 : « compte public
    # vs startup → SOURCES différentes »). BOAMP (appels d'offres) et DECP
    # (marchés attribués) sont des sources de SECTEUR PUBLIC FRANÇAIS ; elles
    # tournaient inconditionnellement pour tout compte FR, même une startup qui
    # n'a par définition aucun marché public. On les gate sur un archétype dérivé
    # des seuls signaux DÉJÀ résolus ici — pays demandé + NAF/taille du candidat
    # de registre net. Sûreté : on ne skippe QUE pour un siège hors France ou une
    # startup avérée ; tout le reste (dont `inconnu`) garde le comportement
    # historique — on ne présume jamais l'absence de signal.
    _selected_candidate = None
    if homonyms and homonyms.selected_siren:
        _selected_candidate = next(
            (c for c in homonyms.candidates if c.siren == homonyms.selected_siren), None
        )
    _collection_plan = plan_collection(
        country=req.country,
        naf_code=(_selected_candidate.naf_code if _selected_candidate else None),
        sector_text=(_selected_candidate.naf_label if _selected_candidate else None),
        employees=(_selected_candidate.headcount if _selected_candidate else None),
        subsidiary_count=(_selected_candidate.establishment_count if _selected_candidate else None),
    )
    if not _collection_plan.run_public_tenders:
        logger.info(
            "Collecte pilotée par l'archétype '%s' pour '%s' : %s",
            _collection_plan.archetype, company, _collection_plan.reason,
        )
    # #2769/#2289.1/.2/.5/.12 — plan de recherche structuré pour l'objet "appel
    # d'offre" (la famille que BOAMP/DECP servent ici) : nomme la fenêtre de
    # fraîcheur retenue et les 12 familles de sources encore sans connecteur —
    # jamais silencieuses (#2289.3/.4). Depuis le 26/09 ce plan n'est plus
    # seulement journalisé : `should_query_family` en dessous est le second gate
    # (avec l'archétype) que le routeur consulte RÉELLEMENT avant de lancer
    # chaque tâche réseau — un objet dont la sélection change (nouvelle famille
    # câblée, ou retirée) change ce qui est interrogé ici, sans y retoucher.
    _research_plan = build_research_plan("appel d'offre", secteur=None, geo=req.country or "FR")
    logger.info(
        "Plan de recherche '%s' pour '%s' : fenêtre %dj, %d familles sans connecteur (%s)",
        _research_plan.objet, company, _research_plan.freshness_window_days,
        len(_research_plan.families_without_connector), ", ".join(_research_plan.families_without_connector),
    )
    tenders_task = (
        asyncio.create_task(
            cached_fact(
                "tenders",
                company_fact_key(siren=_anchor_siren),
                seller_pack,
                lambda: public_tenders(company, pack=seller_pack, siren=_anchor_siren or None),
            )
        )
        if _collection_plan.run_public_tenders and should_query_family(_research_plan, "appels d'offres en cours")
        else None
    )  # BOAMP marchés publics IT (no key) — gate archétype + gate plan de recherche
    awarded_task = (
        asyncio.create_task(awarded_it_contracts(company, siren=_anchor_siren or None, pack=seller_pack))
        if _collection_plan.run_public_tenders and should_query_family(_research_plan, "marchés attribués")
        else None
    )  # DECP marchés attribués (no key) — gate archétype + gate plan de recherche

    # IA v2 Data Gateway (ADDITIVE, always-on). When a search-provider key
    # (Serper/Tavily/Brave) is present it fetches EXTRA web-search hits (waterfall
    # Serper → Tavily → Brave) that enrich the Brave block below — never replacing
    # an existing source. Kicked off here so its latency overlaps the scrape. With
    # no search key present ``search`` makes no network call and returns [] ⇒
    # nothing is added (graceful no-op, never fabricated data).
    gateway_search_task = asyncio.create_task(get_data_gateway().search(company))

    # Country pack signals (ADDITIVE). Only kicked off when a pack is active
    # (registered non-FR country targeted); the FR default leaves this None ⇒ no
    # task, no network. Its latency overlaps the scrape like the gateway search.
    country_signals_task = (
        asyncio.create_task(collect_country_signals(req.country, company, ident=req.siren))
        if country_pack is not None
        else None
    )

    # #2164.5 — LA RECHERCHE ACTUELLE, NOMMÉE : la recherche web du moment (le
    # `brave_task` lancé plus haut) se dit comme sa propre étape, avant d'être attendue.
    await emit_progress(cb, "research", "current_research", 20, "recherche web en cours")

    try:
        brave_hits = await asyncio.wait_for(brave_task, BRAVE_PAPPERS_TIMEOUT_S)
    except TimeoutError:
        logger.warning("Brave hit the %.0fs timeout — proceeding with no web hits", BRAVE_PAPPERS_TIMEOUT_S)
        brave_hits = []
        record_degradation(
            get_correlation_id(), source="brave", reason=f"timeout {BRAVE_PAPPERS_TIMEOUT_S:.0f}s"
        )

    await emit_progress(cb, "research", "crosscheck", 22, f"web search: {len(brave_hits)} hits")

    # ── Step 2: scrape top URLs from Brave via Firecrawl ─────────────────────
    # B5 degraded mode: Firecrawl is best-effort. Neither a timeout nor a
    # terminal error (credits / auth / rate-limit) kills the analysis — we
    # continue on Brave + Pappers with an empty scrape bundle. The empty bundle
    # drives ``source_health['firecrawl'] = down`` + a warning (so the result is
    # flagged ``partial_success``, never silently degraded). ``logger.error``
    # keeps the underlying cause visible to ops/Sentry (e.g. out of credits).
    bundle = ResearchBundle()
    try:
        async with timed(get_correlation_id(), "firecrawl_phase"), asyncio.timeout(FIRECRAWL_TIMEOUT_S):
            bundle = await research_firecrawl(brave_hits, depth=req.depth)
    except TimeoutError:
        logger.warning(
            "Firecrawl scrape hit the %.0fs timeout — continuing with partial bundle",
            FIRECRAWL_TIMEOUT_S,
        )
        record_degradation(
            get_correlation_id(), source="firecrawl", reason=f"timeout {FIRECRAWL_TIMEOUT_S:.0f}s"
        )
    except FirecrawlScrapeError as exc:
        logger.error(
            "Firecrawl terminal error — degrading to no-scrape, analysis continues: %s",
            exc,
            exc_info=exc,
        )
        record_degradation(get_correlation_id(), source="firecrawl", reason=str(exc))
    except Exception as exc:  # noqa: BLE001
        # B5: Firecrawl is best-effort and must NEVER kill the analysis. Any
        # other error (incl. while building the bundle) degrades to no-scrape
        # instead of bubbling up and orphaning ``pappers_task``.
        logger.error("Firecrawl unexpected error — degrading to no-scrape: %s", exc, exc_info=exc)
        record_degradation(get_correlation_id(), source="firecrawl", reason=str(exc))

    # Pappers ran concurrently with the scrape — collect it now (usually done).
    try:
        pappers_profile = await asyncio.wait_for(pappers_task, BRAVE_PAPPERS_TIMEOUT_S)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Pappers fast path failed/timed out (continuing): %s", exc)
        pappers_profile = None
        record_degradation(get_correlation_id(), source="pappers", reason=str(exc) or "timeout")

    # SIREN fallback (brand ≠ legal name): read it off the pages we already
    # scraped first, only fetching fresh on a miss (F1 — no double scrape).
    # #2284.22 — ce chemin lit le SIREN sur une page dont l'hôte correspond au
    # nom de l'entreprise (mentions légales, ``siren_finder.py``) : une source
    # ``official_site`` déterministe pour ``resolve_account_entity``, distincte
    # du nom-recherche Pappers direct.
    _official_site_match = False
    if pappers_profile is None:
        pappers_profile = await resolve_pappers_via_web_or_bundle(company, bundle.sources)
        _official_site_match = pappers_profile is not None

    # BODACC (legal events) needs the SIREN — kick it off the moment Pappers
    # resolves it so its DATED events can feed the prompts (#5), not just decorate
    # the output. Empty siren → the call itself no-ops (returns []).
    _pre_siren = str(getattr(pappers_profile, "siren", "") or "").strip()
    legal_task = asyncio.create_task(
        cached_fact("legal", company_fact_key(siren=_pre_siren), "", lambda: legal_signals(_pre_siren))
    )

    logger.info(
        "Phase 1 data collection for '%s': brave=%d hits, pappers=%s",
        company, len(brave_hits),
        "OK" if pappers_profile else "EMPTY",
    )

    sources = bundle.sources
    ok_pages = sum(1 for s in sources if s.scrape_status == "ok")

    # Grounding floor. Every collector above soft-fails to empty on purpose, but
    # if Brave AND Firecrawl AND the registry all produced nothing, the prompts
    # below would run on a bare company name and Claude would answer from
    # training recall — i.e. invent the dossier. Fail here, naming the dead
    # providers, rather than persist fiction that looks like a real analysis.
    # Partial loss deliberately does NOT trip this: it is already recorded via
    # record_degradation and shown as a warning on the dossier. See
    # ``research_grounding`` for why the line sits at 3-of-3 and not 2-of-3.
    #
    # #1107/#1108/#1109 — les trois entrées du plancher étaient mal mesurées, et
    # PREVOIR (que le registre libre connaît parfaitement) a échoué trois fois.
    #
    # 1. Le REGISTRE, c'est Pappers OU `recherche-entreprises`. La
    #    désambiguïsation d'homonymes a déjà résolu une identité légale libre
    #    avant Pappers ; l'ignorer faisait échouer un run fondé pendant que la
    #    clé Pappers était à sec — l'état que le module lui-même décrit comme
    #    LIVE en production.
    _registry_siren = _pre_siren or _anchor_siren
    # 2. Le bloc web du prompt reçoit AUSSI les résultats de la Data Gateway
    #    (Serper → Tavily → Brave), récoltés plus bas. On ne l'attend que si le
    #    plancher est SUR LE POINT de tomber : le chemin nominal garde sa
    #    latence à l'octet près, et seul un run qui allait mourir paie l'attente.
    _web_hits = len(brave_hits)
    _floor_about_to_trip = len(
        down_primary_sources(
            web_hits=_web_hits, scraped_pages=ok_pages, has_registry=bool(_registry_siren)
        )
    ) == len(PRIMARY_SOURCES)
    if _floor_about_to_trip:
        try:
            # ``shield`` : un dépassement de délai ne doit pas ANNULER la tâche,
            # qui est ré-attendue plus bas pour enrichir le bloc web. Une tâche
            # annulée y lèverait ``CancelledError``, que le ``except Exception``
            # de ce point-là ne rattrape pas — on échangerait un run refusé
            # contre un run planté.
            _web_hits += len(
                await asyncio.wait_for(asyncio.shield(gateway_search_task), BRAVE_PAPPERS_TIMEOUT_S)
            )
        except Exception as exc:  # noqa: BLE001 — une source d'appoint ne casse jamais un plancher
            logger.warning("Data Gateway indisponible au moment du plancher : %s", exc)
    # 3. Firecrawl lit les URL rendues par la recherche web : sans hit, il n'a
    #    pas été interrogé du tout. Le seuil ne bouge pas, seule l'imputation.
    require_grounding(
        web_hits=_web_hits,
        scraped_pages=ok_pages,
        has_registry=bool(_registry_siren),
        firecrawl_had_urls=bool(brave_hits),
    )

    await emit_progress(cb, "research", "crosscheck", 30, f"{ok_pages} pages scraped")
    logger.info(
        "Phase 1 scraping for '%s': %d sources, %d scrapées, per_category=%s",
        company, len(sources), ok_pages, bundle.status_counts(),
    )

    # ── Step 3: build prompt inputs (shared across the 3 prompts) ────────────
    # Rank + filter the Brave block BEFORE the [:20] cut (was query order, and the
    # excluded-domain filter only applied at the Firecrawl stage): drop LinkedIn/
    # social noise, keep the 20 highest-priority (category + keyword) hits.
    _brave_ranked = sorted(
        (h for h in brave_hits if not any(d in (h["url"] or "").lower() for d in EXCLUDED_DOMAINS)),
        key=lambda h: _url_priority(h["url"], h["category"]),
        reverse=True,
    )
    brave_trimmed: list[dict[str, str]] = []
    for h in _brave_ranked[:20]:
        desc = (h["description"] or "")[:500]
        brave_trimmed.append(
            {
                "title": h["title"],
                "url": h["url"],
                "description": desc,
                "category": h["category"].value,
            }
        )

    # IA v2 Data Gateway enrichment (always-on): APPEND deduped extra web hits
    # AFTER the [:20] cut so existing Brave hits are never pushed out. With no
    # search key the awaited search is [] and nothing is added (graceful no-op).
    try:
        gw_hits = await gateway_search_task
    except Exception as exc:  # noqa: BLE001 — additive enrichment must never break research
        logger.warning("Data Gateway search failed (continuing without it): %s", exc)
        gw_hits = []
        record_degradation(get_correlation_id(), source="data_gateway", reason=str(exc))
    _seen_urls = {h["url"] for h in brave_trimmed}
    _added = 0
    for gh in gw_hits:
        url = gh.get("url")
        if not url or url in _seen_urls:
            continue
        _seen_urls.add(url)
        brave_trimmed.append(
            {
                "title": gh.get("title") or "",
                "url": url,
                "description": (gh.get("description") or "")[:500],
                "category": SourceCategory.OTHER.value,
                "source": gh.get("source") or "data_gateway",
            }
        )
        _added += 1
    if _added:
        logger.info("Data Gateway enriched web block with %d extra hit(s)", _added)

    # Country pack enrichment (ADDITIVE, flag-gated): APPEND the pack's registry /
    # local hits to the web block, deduped by URL (existing hits never pushed out).
    # None task (FR default / pack OFF) ⇒ this block is skipped entirely.
    # ``_cp`` is kept for the whole function: its resolved registry identity is
    # re-exposed on the final result (see ``_registry_identity_overlay`` below).
    _cp: dict | None = None
    if country_signals_task is not None:
        try:
            _cp = await country_signals_task
        except Exception as exc:  # noqa: BLE001 — additive enrichment must never break research
            logger.warning("Country pack enrichment failed (continuing without it): %s", exc)
            _cp = None
        _cp_added = 0
        for cp_hit in (_cp or {}).get("hits", []):
            url = cp_hit.get("url")
            if not url or url in _seen_urls:
                continue
            _seen_urls.add(url)
            brave_trimmed.append(
                {
                    "title": cp_hit.get("title") or "",
                    "url": url,
                    "description": (cp_hit.get("description") or "")[:500],
                    "category": SourceCategory.OTHER.value,
                    "source": cp_hit.get("source") or "country_pack",
                }
            )
            _cp_added += 1
        if _cp_added:
            logger.info("Country pack (%s) enriched web block with %d extra hit(s)", req.country, _cp_added)

    pappers_trimmed: dict = {}
    if pappers_profile:
        pappers_dump = pappers_profile.model_dump(by_alias=False, mode="json")
        pappers_trimmed = {
            k: v for k, v in pappers_dump.items()
            if k not in (
                "branches",
                "beneficial_owners",
                "collective_agreements",
                "corporate_graph",
            )
        }
        if pappers_trimmed.get("financials_history"):
            pappers_trimmed["financials_history"] = pappers_trimmed["financials_history"][:3]
        if pappers_trimmed.get("executives"):
            pappers_trimmed["executives"] = pappers_trimmed["executives"][:10]

    brave_str = json.dumps(brave_trimmed, ensure_ascii=False)
    # Single source of truth for the per-category scrape budget: the bundle reads
    # FIRECRAWL_CHARS_PER_CATEGORY (default 6000). No second hardcoded literal here.
    firecrawl_str = bundle.render_for_prompt()
    pappers_str = json.dumps(pappers_trimmed, ensure_ascii=False)

    # ── Dated signals fed to the prompts (#5, the #1 relevance win) ──────────
    # Presse (Brave News), offres IT (France Travail) et événements légaux
    # (BODACC) étaient collectés mais JAMAIS vus du LLM (ils décoraient la
    # sortie). news_task + jobs_task ne dépendent que du nom et tournent depuis
    # l'étape 1 → après le scrape (multi-s) ils sont finis, awaiter ici coûte ~0.
    # Dégradable : toute exception → la source disparaît du bloc.
    # `tenders_task`/`awarded_task` valent None quand l'archétype a gaté ces
    # sources publiques (siège hors FR / startup) — un coroutine no-op remplace la
    # task absente, de sorte que le gather et l'ordre de dépliage restent
    # inchangés, et que `_dated(..., "boamp")` reçoit une liste vide (aucune perte
    # tracée : la source n'a pas ÉCHOUÉ, elle n'était pas pertinente).
    async def _skipped_source() -> list:
        return []

    # #2164.6 — LA RECHERCHE THÉMATIQUE COMPLÉMENTAIRE, NOMMÉE : offres d'emploi,
    # marchés publics et attributions (les tâches lancées plus haut) sont attendus ici.
    await emit_progress(cb, "research", "thematic_research", 31, "offres, marchés publics, attributions")

    (
        _pre_news,
        _pre_jobs,
        _pre_apec,
        _pre_wttj,
        _pre_ats,
        _pre_careers,
        _pre_legal,
        _pre_tenders,
        _pre_awarded,
        _pre_aggregators,
    ) = await asyncio.gather(
        news_task, jobs_task, apec_jobs_task, wttj_jobs_task, ats_jobs_task, careers_jobs_task, legal_task,
        tenders_task or _skipped_source(), awarded_task or _skipped_source(), aggregator_jobs_task,
        return_exceptions=True,
    )
    # Each of these can vanish from the prompt without a trace — the single
    # biggest reason two runs disagree on "signaux récents". Record the loss so
    # the run reports WHY it is thinner instead of just being thinner.
    def _dated(result: object, source: str) -> list:
        if isinstance(result, list):
            return result
        record_degradation(
            get_correlation_id(),
            source=source,
            reason=str(result) if isinstance(result, BaseException) else "aucun résultat",
        )
        return []

    news = _dated(_pre_news, "brave_news")
    if fresh_news_task is not None:
        _fresh_news = _dated((await asyncio.gather(fresh_news_task, return_exceptions=True))[0], "brave_news_pd")
        _known_news = {str(item.get("url")) for item in news}
        news = news + [item for item in _fresh_news if str(item.get("url")) not in _known_news]
    # Fusion ADDITIVE des sources emploi (France Travail + APEC + WTTJ), dédup
    # par URL — une source en échec/no-op dégrade en [] et disparaît du merge.
    # #3901 — collectées sans tri IT (`collect_all_roles`), les offres sont
    # jugées ici sur le profil ; sinon le tri IT de la source a déjà jugé (le
    # rejouer sur la ligne rendue perdrait l'APEC admise par `texteOffre`). WTTJ
    # n'a aucun tri propre : la règle du profil s'y applique toujours.
    def _by_profile(offers: list) -> list:
        return _relevant_to_profile(offers) if collect_all_roles else offers

    _direct_job_sources = (
        _by_profile(_dated(_pre_jobs, "france_travail")),
        _by_profile(_dated(_pre_apec, "apec")),
        _relevant_to_profile(_dated(_pre_wttj, "welcome_to_the_jungle")),
        # ADDITIF, dédupliqué par URL : une offre reprise par un agrégateur ne
        # compte pas deux fois.
        _by_profile(_dated(_pre_ats, "ats_boards")),
        # #3925.1 — offres JSON-LD des pages carrières du domaine, `sourceUrl` conservé.
        _by_profile(_dated(_pre_careers, "careers_pages")),
    )
    _aggregator_jobs = _dated(_pre_aggregators, "job_aggregators")
    # SIG-B (B2-RESTES, 12/10) — l'équipe de recrutement que l'agrégateur nomme voyage sur l'offre
    # DIRECTE qu'il dupliquait (sinon `drop_known_offers` la perdait avec la copie).
    _direct_job_sources = tuple(graft_recruiters(src, _aggregator_jobs) for src in _direct_job_sources)
    jobs = merge_job_signals(
        *_direct_job_sources,
        # #3885 — les agrégateurs passent EN DERNIER et perdent contre une source
        # directe : leur URL de redirection diffère, donc on dédoublonne aussi
        # par intitulé + ville (`drop_known_offers`).
        drop_known_offers(
            _aggregator_jobs,
            [j for src in _direct_job_sources for j in src],
        ),
    )
    # 11/10/2026 (métiers déduits) — les offres qui recoupent un métier placé
    # (déclaré, sinon déduit du contexte) passent EN TÊTE ; sans métier, la
    # liste revient telle quelle.
    # #4182 — les récentes d'abord : une offre de plus de 90 j ne reste que si rien n'est récent.
    # Puis le contrat du cadrage (15/10) : tri par métier placé, postes à placer du run.
    jobs = _rank_and_keep_run_jobs(prefer_recent_offers(jobs), profile, req)
    # #4646 (Louis 27/10) — les offres qui ont fait sortir le compte de Découvrir restent dans le dossier, en tête,
    # datées ; le rejeu qui ne les retrouve pas ne les efface pas. Hors Découvrir : la même liste.
    # #4646.7 — « found: 0 » avec 5 appels payés alors que Découvrir en avait : le compteur DIT combien d'offres
    # viennent de Découvrir (la collecte ne les a pas retrouvées), au lieu de se contredire en silence.
    if _carried_unfound := carried_unfound_count(jobs, req.seller_hypotheses):
        _offers_cascade["carriedFromDiscover"] = _carried_unfound
    jobs = with_carried_offers(jobs, req.seller_hypotheses)
    # SIG-B — les recruteurs NOMMÉS des offres GARDÉES (tri métier du vendeur,
    # employeur prouvé) sortent des offres : ni le prompt ni `itJobSignals` ne
    # portent une personne ; ils deviennent des contacts candidats côté API.
    jobs, job_recruiters = split_job_recruiters(jobs)
    # #2322.70 — rôle, équipe, compétences et tension (avec sa raison) lus dans le texte de chaque offre ;
    # règles seules, un champ que le texte ne prouve pas ne fait aucune clé.
    jobs = enrich_job_offers(jobs)
    legal_sig = _dated(_pre_legal, "bodacc")
    tenders = _dated(_pre_tenders, "boamp")
    awarded = _dated(_pre_awarded, "decp")
    dated_signals_str = render_dated_signals(news, jobs, legal_sig, tenders, awarded)

    # ── Step 4: call 3 Claude prompts in parallel ────────────────────────────
    cid = get_correlation_id()
    facts_system = bellum_facts.build_system_prompt(profile)
    facts_user = bellum_facts.build_user_prompt(
        target_company=company,
        brave_results=brave_str,
        scraped_content=firecrawl_str,
        pappers_data=pappers_str,
        user_context=user_context_str,
        profile_data=profile,
    )
    signals_system = bellum_signals.build_system_prompt(profile)
    signals_user = bellum_signals.build_user_prompt(
        target_company=company,
        brave_results=brave_str,
        scraped_content=firecrawl_str,
        pappers_data=pappers_str,
        dated_signals=dated_signals_str,
        profile_data=profile,
        internal_knowledge=_drive_ctx,  # #3586
    )
    strategy_system = bellum_strategy.build_system_prompt(profile)
    strategy_user = bellum_strategy.build_user_prompt(
        target_company=company,
        brave_results=brave_str,
        scraped_content=firecrawl_str,
        pappers_data=pappers_str,
        user_context=user_context_str,
        dated_signals=dated_signals_str,
        profile_data=profile,
    )

    await emit_progress(cb, "research", "account_sheet", 33, "Claude analyse en parallèle (3 prompts)…")

    # Run the 3 prompts concurrently and emit one progress event per
    # completion — real progression, no heartbeat asymptote. Span 33→39%
    # (=6%), 3 sub-jobs → each completion bumps by 2 points.
    facts_task = asyncio.create_task(
        call_claude(
            facts_system, facts_user,
            response_model=ResearchFacts,
            max_tokens=FACTS_MAX_TOKENS,
            prompt_name="bellum_facts",
            correlation_id=cid,
            model=model_for("bellum_facts"),
        ),
        name="bellum_facts",
    )
    signals_task = asyncio.create_task(
        # bellum_signals = pure structured extraction (event lists,
        # budget flags…) — Haiku 4.5 hits the schema as well as Sonnet
        # at ~12× lower cost.
        call_claude(
            signals_system, signals_user,
            response_model=ResearchSignals,
            max_tokens=SIGNALS_MAX_TOKENS,
            model=CLAUDE_HAIKU_MODEL,
            prompt_name="bellum_signals",
            correlation_id=cid,
        ),
        name="bellum_signals",
    )
    strategy_task = asyncio.create_task(
        _call_strategy(strategy_system, strategy_user, cid=cid),
        name="bellum_strategy",
    )
    claude_tasks = [facts_task, signals_task, strategy_task]

    try:
        for done_count, fut in enumerate(asyncio.as_completed(claude_tasks), start=1):
            await fut
            percent = 33 + 2 * done_count  # 35 / 37 / 39
            await emit_progress(
                cb, "research", "account_sheet", percent,
                f"Claude: {done_count}/3 prompts done",
            )
    except ClaudeError:
        # Typed Claude failure (output truncated, no tool_use…) — let the
        # FastAPI handler turn it into a typed 422 with user_message so the
        # API worker fails fast instead of looping for 24 min.
        for t in claude_tasks:
            if not t.done():
                t.cancel()
        raise
    except Exception as exc:
        for t in claude_tasks:
            if not t.done():
                t.cancel()
        logger.error("Claude API error in Phase 1 research", exc_info=exc)
        raise HTTPException(status_code=502, detail=f"Claude API error: {exc}") from exc

    (facts_out, _f_usage) = facts_task.result()
    (signals_out, _s_usage) = signals_task.result()
    (strategy_out, _t_usage, _strategy_refused) = strategy_task.result()
    assert isinstance(facts_out, ResearchFacts)
    assert isinstance(signals_out, ResearchSignals)
    assert isinstance(strategy_out, ResearchStrategy)

    # ── La sortie stratégique VIDE ─────────────────────────────────────────
    # Le SCHÉMA la refuse désormais (`ResearchStrategy`), et le refus NOMME les
    # sections vides : `instructor` renvoie ce message au modèle (reask) au lieu
    # de retirer le même prompt à l'identique. Ce bloc-ci n'est donc plus le
    # rattrapage principal, c'est le filet — et un filet ne se retire pas parce
    # qu'un autre garde-fou couvre le cas qu'on a en tête aujourd'hui.
    #
    # Deux chemins, et la différence est un appel payant :
    #
    # - `_strategy_refused` non vide → le refus a DÉJÀ tourné, avec sa raison, et
    #   ses relances ciblées sont épuisées. Retirer le même prompt une fois de
    #   plus à l'AVEUGLE n'apporte rien qu'elles n'aient déjà tenté, avec moins
    #   d'information. On journalise les sections nommées et on livre.
    # - sinon → une sortie vide arrivée autrement (un chemin qui contourne la
    #   validation). Le comportement historique s'applique : une relance, puis on
    #   le DIT. Jamais de contenu de repli — un angle fabriqué serait pire que
    #   l'onglet vide.
    if _strategy_is_empty(strategy_out):
        if _strategy_refused:
            logger.error(
                "bellum_strategy — sortie refusée par le schéma, sections vides : %s. "
                "Le dossier partira sans angle ni défi IT (relance aveugle inutile : "
                "les tentatives ciblées sont épuisées)",
                ", ".join(_strategy_refused),
                extra={
                    "tags": {"phase": "research", "code": "STRATEGY_EMPTY"},
                    "contexts": {"strategy": {"empty_sections": list(_strategy_refused)}},
                },
            )
        else:
            logger.warning(
                "bellum_strategy a rendu une sortie entièrement vide — seconde tentative",
                extra={"tags": {"phase": "research", "code": "STRATEGY_EMPTY_RETRY"}},
            )
            try:
                retry_out, _retry_usage, _retry_refused = await _call_strategy(
                    strategy_system, strategy_user, cid=cid
                )
            except Exception as exc:  # noqa: BLE001 — la relance est un bonus, jamais un risque de plus
                logger.warning("bellum_strategy — seconde tentative en échec : %s", exc)
            else:
                if not _strategy_is_empty(retry_out):
                    strategy_out, _t_usage = retry_out, _retry_usage
            if _strategy_is_empty(strategy_out):
                # `logger.error` = remontée Sentry (convention du dépôt). Le dossier
                # part quand même : faits, signaux, contacts et plan ont abouti, et
                # les jeter reviendrait à punir l'utilisateur d'un défaut de forme.
                logger.error(
                    "bellum_strategy vide après relance — le dossier partira sans angle ni défi IT",
                    extra={
                        "tags": {"phase": "research", "code": "STRATEGY_EMPTY"},
                        "contexts": {
                            "strategy": {
                                "empty_sections": list(
                                    strategy_sections_that_say_nothing(strategy_out)
                                )
                            }
                        },
                    },
                )

    # ── Step 5: merge the 3 outputs + Pappers source-of-truth ───────────────
    merged: dict = {
        **facts_out.model_dump(by_alias=True),
        **signals_out.model_dump(by_alias=True),
        **strategy_out.model_dump(by_alias=True),
    }
    # Round-trip through the unified model so consumers can rely on the full
    # default-filled shape (some fields may be missing from one of the slices).
    result = ResearchOutput(**merged).model_dump(by_alias=True)

    # ── Company Resolver hard rule (retour Thales) ──────────────────────────
    # Before letting the registry overwrite the web firmo, check the resolved
    # legal entity actually IS the target group. Pappers accepts a homonym with
    # an identical legal name (THALES → transports fluviaux, 1-2 salariés) → its
    # firmo would poison the header and the SIREN anchor would inflate confidence
    # to 100/100. ``assess_identity`` compares registry vs web firmo; on a
    # contradiction the dossier switches to "mode groupe web" and stops trusting
    # the registry (identity_resolution).
    _identity = assess_identity(
        target_name=company,
        web={
            "sector": result.get("sector"),
            "employees": result.get("employees"),
            "revenue": result.get("revenue"),
            "description": result.get("businessDescription") or result.get("business_description"),
            "subsidiaries_count": len(result.get("subsidiaries") or []),
            "competitors_count": len(result.get("competitors") or []),
        },
        registry=(
            {
                "legal_name": pappers_profile.legal_name,
                "naf_label": pappers_profile.naf_label or pappers_profile.activity_domain,
                "headcount_label": pappers_profile.headcount_label,
                "headcount_max": pappers_profile.headcount_max,
                "city": pappers_profile.headquarters.city if pappers_profile.headquarters else None,
                "subsidiaries_count": len(pappers_profile.subsidiaries),
                "branch_count": pappers_profile.branch_count,
            }
            if pappers_profile
            else None
        ),
    )
    _use_registry = _identity.use_registry_data
    result["identity"] = _identity.model_dump(by_alias=True)

    # #3917/#3925 — signaux presse (tâche lancée à l'étape 1, déjà finie ici).
    # Clé absente quand il n'y a rien : on n'affiche pas ce qu'on n'a pas.
    _press = (await asyncio.gather(press_task, return_exceptions=True))[0]
    if isinstance(_press, list) and _press:
        result["pressSignals"] = _press

    # Transparence homonymes (Théo p.10) : on expose TOUJOURS le verdict de la
    # désambiguïsation dans le dossier (« j'ai retenu SIREN X parmi N homonymes,
    # confiance Y » / « N homonymes proches — à confirmer »). L'ambiguïté n'est
    # jamais cachée : l'UI peut proposer de relancer sur un SIREN choisi.
    if homonyms is not None:
        result["homonyms"] = homonyms.model_dump(by_alias=True)

    # #2265.2/#2265.11 — un compte DÉJÀ dans ce même espace peut aider la
    # résolution (SIREN partagé, ou nom+domaine quand ni l'un ni l'autre côté
    # ne porte de SIREN) ; jamais une fusion, juste une source nommée
    # (``entity_resolution.resolve_account_entity``). Fail-soft : une lecture
    # qui échoue ne prive le dossier que de CE rapprochement, jamais du reste.
    _workspace_match = None
    try:
        _ws_candidates = await fetch_workspace_account_candidates(get_supabase(), req.workspace_id or None)
        _workspace_match = match_workspace_account(
            candidates=_ws_candidates,
            siren=(pappers_profile.siren if pappers_profile else None),
            domain=website_domain(str(result.get("website") or "")),
            target_name=company,
            exclude_account_id=req.account_id or None,
        )
    except Exception as exc:  # noqa: BLE001 — un rapprochement raté ne coûte que lui-même
        logger.warning("Workspace account match failed for '%s' (continuing): %s", company, exc)

    # #2284 — Entity Resolver P0 : UN verdict d'entité (état × type × sources ×
    # attributs) composé des verdicts ci-dessus, sans rien re-résoudre. Pur et
    # déterministe ; un échec ne coûte que le bloc, jamais le dossier.
    try:
        result["entity_resolution"] = resolve_account_entity(
            target_name=company,
            homonyms=homonyms,
            identity=_identity,
            registry=pappers_profile,
            website=str(result.get("website") or "") or None,
            locked_siren=(req.siren or "").strip() or None,
            now=datetime.now(UTC),
            # #2284.19 — le registre pays (country pack, no-op hors pack actif)
            # déjà collecté plus haut (``_cp``) pour ``req.country``.
            country=req.country,
            foreign_registry=(_cp or {}).get("registry"),
            workspace_match=_workspace_match,
            official_site_match=_official_site_match,
        ).model_dump(mode="json")
    except Exception as exc:  # noqa: BLE001 — le bloc est optionnel, le dossier ne l'est pas
        logger.warning("Entity resolution failed for '%s' (continuing): %s", company, exc)

    result = _merge_pappers(result, pappers_profile, use_registry=_use_registry)
    # SIG-A (A4) — effectif des offres publiées, seulement s'il manque (jamais
    # par-dessus le registre ni une valeur connue).
    if (
        _offers_cascade.get("belowFloor")
        or _offers_cascade.get("explicit")
        or _offers_cascade.get("carriedFromDiscover")
    ):
        result["offersCascade"] = dict(_offers_cascade)
    _published_headcount = published_headcount_label(result.get("employees"), _published_employer)
    if _published_headcount:
        result["employees"] = _published_headcount

    # Hygiène de sortie : la fiche compte ne parle pas de notre plomberie.
    # Le bloc registre est passé au modèle en JSON BRUT, nos noms de champs
    # compris ; il lui arrive donc de signaler ce qui manque AVEC notre
    # vocabulaire — « donnée Pappers "revenue_latest" non disponible », dans le
    # chiffre d'affaires que le commercial montre à son prospect (BlaBlaCar,
    # 10/08). Le filtre est déterministe parce qu'une consigne de prompt oubliée
    # une fois sur cent produit exactement la fiche qu'on ne veut pas montrer.
    # Posé APRÈS la fusion registre : c'est la valeur FINALE qui s'affiche.
    result = clean_firmographics(result)

    # Top-3 plays only (Théo / 03_BUSINESS_RULES §5 + front schema `plays maxItems:3`):
    # a rich analysis surfaces 15 angles, the product keeps ONLY the 3 strongest.
    #
    # "Strongest" used to mean "emitted first" — there is no score on the Angle
    # model, so the ranking signal was the model's output order, which is not
    # merit and shifts run to run. These three become the deck's plays and Phase 4
    # binds each play's strategy, persona and offer from them, so the cut decided
    # the whole outbound plan on nothing. Now scored on axes we can check
    # (concrete offer, persona that resolves to a contact we actually found,
    # developed strategy, deal size, no blocker) with a total order.
    if isinstance(result.get("angles"), list):
        _contact_titles = [
            str(c.get("title") or "")
            for c in (result.get("contacts") or [])
            if isinstance(c, dict)
        ]
        result["angles"] = rank_angles(result["angles"], contact_titles=_contact_titles, limit=3)

    # Tome 5 §32.2 — la PREUVE d'un angle est vérifiée contre les références que
    # l'ESN a DÉCLARÉES, et une preuve que rien n'étaye est effacée.
    #
    # Posé APRÈS le classement, sur les trois plays retenus : c'est la valeur
    # FINALE qui part à l'écran. Le gate n'a jamais supprimé un angle — il retire
    # la phrase invérifiable, pas l'action, exactement comme le tome ne retire
    # que l'accroche. Déterministe, parce qu'une consigne de prompt oubliée une
    # fois sur cent produit la phrase qu'un commercial répétera en rendez-vous.
    if isinstance(result.get("angles"), list):
        result["angles"] = apply_proof_gate(result["angles"], profile)

    # Dedup par nom (#23) : le LLM répète souvent un concurrent ("Capgemini" +
    # "CAPGEMINI") ou une synergie — ça encombre le deck. Dedup au-delà du SIREN
    # (marques sans siren). Premier gagne, ordre préservé.
    def _name_of(d: object) -> object:
        return d.get("name") if isinstance(d, dict) else d

    for _list_key in ("competitors", "esnSynergies"):
        if isinstance(result.get(_list_key), list):
            result[_list_key] = dedup_by_name(result[_list_key], key=_name_of)

    # « Les ESN concurrentes déjà présentes » (Matteo/Théo) : vue actionnable
    # concurrence-ou-partenariat-rang-2 des ESN détectées, croisée avec la
    # battlecard des ESN connues. Déterministe — pas d'appel LLM.
    # La date de DÉTECTION est celle du run, et elle voyage avec l'entrée :
    # sans elle, l'écran ne peut pas dire « information de mars 2026, à
    # revérifier », et une inférence de six mois se lit comme un fait du jour.
    result["esnPresence"] = build_esn_presence(
        result.get("competitors"),
        detected_at=datetime.now(UTC).date().isoformat(),
    )

    # #3095 — call bêta Apricot Labs (24/09/2026) : « voir qui a fait le site,
    # pour comprendre les prestataires du compte ». Seconde méthode de
    # détection, déterministe, sur les pages QUE LE RUN SCRAPE DÉJÀ (voir
    # `site_credit_partners.py`) — fusionnée dans la MÊME liste `esnPresence`,
    # jamais une seconde ("à ÉTENDRE, pas à dupliquer", #3095).
    _scraped_pages = [{"url": s.url, "markdown": s.scraped_markdown} for s in bundle.sources]
    # #3205.1 (épopée #3239) — « crédits de site au-delà de #3095 » : un fetch
    # CIBLÉ des pages légales/crédits du site officiel que Brave n'a pas rendues,
    # sous le MÊME plafond de pages du run ; sans clé Firecrawl = no-op strict.
    _scraped_pages += await crawl_footprint_pages(
        req.website,
        {s.url for s in bundle.sources},
        pages_already_used=len(bundle.sources),
    )
    _detected_at = datetime.now(UTC).date().isoformat()
    site_credits = collect_site_credit_partners(_scraped_pages, detected_at=_detected_at)
    # #3205.1 (épopée #3239) — deux sources de plus, MÊME geste que #3095 :
    # zéro appel réseau supplémentaire, relit les pages déjà scrapées.
    legal_notice_credits = collect_legal_notice_partners(_scraped_pages, detected_at=_detected_at)
    partner_page_mentions = collect_partner_page_mentions(_scraped_pages, detected_at=_detected_at)
    # #4743.2 — la page de mentions légales n'est plus lue puis jetée : ses champs publiés, tels que publiés.
    # Aucun champ publié = clé ABSENTE (jamais une liste vide, jamais « 0 »). Zéro appel réseau.
    legal_notice_fields = extract_legal_notice_fields(_scraped_pages, detected_at=_detected_at)
    if legal_notice_fields:
        result["legalNotice"] = legal_notice_fields
    # #3205.1 (épopée #3239, décision Louis 02/10) — les SOUS-DOMAINES du compte
    # (crt.sh, sans clé) dont le CNAME pointe vers un prestataire connu. Borné par
    # compte ; un timeout est `unknown` (aucune ligne, run intact), le réseau
    # injoignable un no-op. Voir `provider_footprint_subdomains.py`.
    subdomain_footprint = await collect_subdomain_partners(req.website, detected_at=_detected_at)
    all_footprint_mentions = [
        *site_credits,
        *legal_notice_credits,
        *partner_page_mentions,
        *subdomain_footprint.partners,
    ]
    if all_footprint_mentions:
        by_key = {
            normalize_name(entry.get("name")): entry for entry in result["esnPresence"] if isinstance(entry, dict)
        }
        for credit in all_footprint_mentions:
            existing = by_key.get(normalize_name(credit["name"]))
            if existing is None:
                result["esnPresence"].append(credit)
                by_key[normalize_name(credit["name"])] = credit
                continue
            # #1605 — une ligne, toutes ses preuves : chaque mention s'ajoute
            # à l'évidence déjà écrite par `build_esn_presence`, elle ne
            # l'écrase jamais.
            existing["evidence"] = " · ".join(filter(None, [existing.get("evidence"), credit["evidence"]]))
            existing["sourceRefs"] = list({*(existing.get("sourceRefs") or []), credit["evidence"]})

    # Deterministic ESN rules (BELLUM_PROFILER): archetype / entry mode / no-go
    # sectors derived from the profile, surfaced for the front + downstream gates.
    result["esnRules"] = derive_esn_rules(req.profile_data or {})

    # SalesContext (Annexe Méthodologie Sales ESN, Théo 21/07 — contrat PR #661):
    # the deterministic triple (ESN stage × account archetype × relationship state)
    # the scoring / routing / actions phases branch on. Emitted here where the
    # target facts are resolved; prompts untouched (research schema is
    # additionalProperties:true → safe additive key, byte goldens unaffected).
    _sc_ctx = None if isinstance(req.user_context, str) else req.user_context
    result["salesContext"] = build_sales_context(
        req.profile_data or {},
        {
            "sector": result.get("sector") or result.get("businessDescription"),
            "employees": result.get("employees"),
            "country": result.get("registry_country") or result.get("registryCountry"),
            "subsidiary_count": len(result.get("subsidiaries") or []),
            # Code NAF officiel du registre (p5) : signal PRIORITAIRE sur le
            # libellé secteur en texte libre. Absent = dérivation textuelle
            # inchangée.
            "nafCode": result.get("nafCode") or result.get("naf_code"),
        },
        # Kanban commercial du compte (annexe méthodo p6) : ce que le commercial
        # a réellement fait du compte prime sur l'absence de signal. Sans lui, un
        # compte « Client » ou « Suivi » était relu « froid » à chaque run — et
        # tout l'aval (mouvement d'ouverture, sélecteur d'actions, garde-fou
        # board) raisonnait sur une relation fausse. "" / "inbox" = inchangé.
        commercial_status=req.commercial_status or None,
        known_status=getattr(_sc_ctx, "commercialStatus", None),
        context_preset=getattr(_sc_ctx, "preset", None),
        signal_type=getattr(_sc_ctx, "signalType", None),
        last_interaction=getattr(_sc_ctx, "lastInteraction", None),
        # Couche zéro (annexe méthodo p8) : le CRM de l'ESN est la première preuve
        # que le compte n'est PAS froid. Sans CRM connecté (défaut) : "" → relation
        # inchangée, salesContext byte-identique.
        has_crm_presence=has_crm_history(req.crm_presence),
        # #2273.9-.21 — partenaires déclarés en place : rend la route « partenaire » atteignable.
        declared_partners=req.declared_partners,
        # #3278.1 — mission en cours / terminée : rend les routes « consultant » atteignables.
        consultant_history=req.consultant_history,
        # #3278.1 — un signal d'achat DÉCLARÉ existe : rend la route « signal entrant » atteignable.
        declared_signal_present=bool(req.declared_signal_present),
        # #2371.4 — placements en cours chez la relation partenaire : 10e stade.
        partner_placements_active=req.partner_placements_active,
        # #3278.1 — veille / talent / événement / inbound : le plan asynchrone nomme ces routes.
        declared_route_signals=req.declared_route_signals,
    )

    # Logo entreprise (Théo) : dérivé du domaine du site — le front charge l'URL
    # (aucun appel réseau backend), None si pas de domaine exploitable.
    result["companyLogoUrl"] = company_logo_url(result.get("website"))

    # Annuaire officiel (audit organigramme §1.1) : les dirigeants NOMMÉS sur la
    # page équipe / gouvernance / direction DU SITE DU COMPTE. C'est la seconde
    # source, de nature différente (officielle, datable), sans laquelle la vue
    # « organigramme vérifié » (seuil 90) reste structurellement vide — une seule
    # preuve par personne plafonne à 70.
    #
    # Zéro fournisseur nouveau, zéro clé, zéro appel réseau : on relit les pages
    # que le run vient DÉJÀ de scraper (Firecrawl priorise déjà « organigramme /
    # gouvernance / direction » dans HIGH_VALUE_KEYWORDS). La date de collecte est
    # celle du run — le cache de scrape (14 j max) est négligeable devant la
    # fenêtre de fraîcheur p14 (12 mois). Site inconnu, page absente ou scrape en
    # échec ⇒ liste vide, dossier inchangé.
    try:
        result["officialDirectory"] = collect_official_directory(
            [
                {"url": s.url, "title": s.title, "markdown": s.scraped_markdown}
                for s in bundle.sources
                if s.scrape_status == "ok"
            ],
            website=result.get("website"),
            collected_at=datetime.now(UTC).date().isoformat(),
        )
    except Exception as exc:  # noqa: BLE001 — corroboration additive, jamais bloquante
        logger.warning("Official directory extraction failed (continuing): %s", exc)
        result["officialDirectory"] = []

    # Target-aware out-of-sector gate: a BTP/agri/agro entity is only noise when
    # it's OFF the target group's own core business. Derive which excluded
    # families ARE this group's core (VINCI → "btp") from its NAF + the COUNT of
    # its subsidiaries named in that family — NOT free text (a bank's objet social
    # mentioning "construction" must not spare its BTP subs). VINCI has several
    # BTP-named subs → "btp" in-scope; SG has one stray SGTM → stays out_of_sector.
    _target_naf = _naf_from_activity_label(result.get("activity_label") or result.get("activityLabel"))
    _entity_names = [
        (s.get("name") if isinstance(s, dict) else s) for s in (result.get("subsidiaries") or [])
    ]
    in_scope_families = derive_in_scope_families(naf=_target_naf, entity_names=_entity_names)

    # Profile no-go sectors (A2, Théo §9) : demote entities in a sector the ESN
    # declared it never sells to. Empty when the profile declares none → no-op
    # (gate stays profile-neutral). Source = esnRules.noGoSectors (BELLUM_PROFILER).
    _no_go_keywords = derive_no_go_keywords((result.get("esnRules") or {}).get("noGoSectors"))

    # Geographic gate (Théo p.6): unless the ESN profile declares an international
    # scope, foreign entities (Société Générale Côte d'Ivoire, SGTM au Maroc) are
    # off-perimeter. Derived from the questionnaire geoZone; France-only → filter.
    _allow_intl = derive_allow_international(profile.get("geoZone") or profile.get("geo_zone"))
    # Scope selector (Théo p.10/21 ; #3820) : « France » et « site » forcent le
    # filtre géo dur, quel que soit le geoZone du profil (override explicite du run).
    if _scope_forces_france_only(req.scope_mode):
        _allow_intl = False

    # Dé-silo (Drive #9 phase 3): is the ESN itself IT-services? Drives whether the
    # deterministic cartography keeps the IT thumb-on-the-scale (IT arm → auto-P1 /
    # "filiale_strategique" badge). IT ESN or an absent profile → True → historical
    # behaviour byte-identical; only a genuinely non-IT ESN drops the IT-specific boost.
    _it_esn = looks_like_it_esn(profile)

    # Entity relevance: the Pappers corporate graph dumps every legally-linked
    # node (≈100 for a group like SG — mostly SCI / holdings / GIE noise).
    # Strip the noise deterministically so the cartography shows operating
    # entities, keeping the raw list (annotated) for legal traceability.
    _subs = partition_subsidiaries(result.get("subsidiaries") or [], in_scope_families, _no_go_keywords, _allow_intl, it_esn=_it_esn)
    result["subsidiaries"] = _subs["annotated"]
    result["meaningfulSubsidiaries"] = _subs["meaningful"]
    result["subsidiariesSummary"] = _subs["summary"]

    # Priority zones (deck "14 entités · 4 priorités"): tier the entity org map
    # into P1/P2/P3 deterministically by IT-relevance × size. Fall back to the
    # meaningful subsidiaries when the LLM left ``entitiesExhaustive`` empty —
    # otherwise the cartography shows zero zones (P1/P2/P3 = 0) even though we
    # have a clean operating-entity list to prioritise (the Crédit Mutuel case).
    _entities_for_tiers = list(result.get("entitiesExhaustive") or result.get("meaningfulSubsidiaries") or [])
    # Rattachement des entités au registre (recherche-entreprises, GRATUIT, sans
    # clé) AVANT l'enrichissement NAF ci-dessous, qui n'agit que sur les entités
    # portant déjà un SIREN. Sans cette étape, une cartographie produite par le LLM
    # (noms seuls) n'a AUCUN SIREN dès que le graphe Pappers est indisponible —
    # mesuré sur EDF : 6 entités, 0 confirmée, donc `whiteSpaces` vide. Pose les
    # trois états (confirmée / interne / non résolue) ; les unités internes (DSIT,
    # CSIRT) ne sont jamais cherchées — elles n'ont pas de personne morale.
    _siren_resolution = await resolve_entity_sirens(
        _entities_for_tiers,
        company=result.get("companyName") or company,
        # La tête de groupe réutilise le SIREN déjà tranché par le Company Resolver
        # — mais seulement si l'identité est fiable (un homonyme ne doit pas
        # tamponner son SIREN sur la cartographie).
        company_siren=str(result.get("siren") or "") if _use_registry else None,
    )
    result["entitySirenResolution"] = _siren_resolution
    # INSEE NAF enrichment (behind INSEE_API_KEY — a no-op otherwise): the
    # authoritative IT signal. For every entity carrying a SIREN we look up its
    # registry NAF/APE; division 62 (programmation / conseil informatique) and
    # 63.11Z (traitement de données) deterministically mark the IT arm (Crédit
    # Mutuel → GICM, Euro-Information…). Beats name-guessing and catches IT
    # subsidiaries with non-obvious names. Mutates in place: stamps nafCode and
    # upgrades isItEntity → the entity floats to P1 in the tiering below.
    # INSEE I/O — the four registry lookups are independent, so run them
    # CONCURRENTLY instead of one-await-after-another: NAF enrichment of the
    # tiering entities + of the meaningful subsidiaries (both mutate in place),
    # the confederation IT-entity seed (Euro-Information for Crédit Mutuel), and
    # the real établissements/sites. Behind INSEE_API_KEY; each degrades to
    # empty on failure (``return_exceptions`` so one bad call can't sink research).
    _resolved_siren = str(result.get("siren") or "").strip()
    # news / jobs / legal_sig were pre-awaited above (fed to the prompts). BODACC
    # was pre-fetched with the early Pappers siren; if facts resolved a DIFFERENT
    # authoritative siren (rare), re-fetch so the OUTPUT uses the right one.
    if _resolved_siren and _resolved_siren != _pre_siren:
        try:
            legal_sig = await cached_fact(
                "legal", company_fact_key(siren=_resolved_siren), "", lambda: legal_signals(_resolved_siren)
            )
        except Exception as exc:  # noqa: BLE001 — degradable, keep pre-fetched value
            logger.warning("BODACC re-fetch (facts siren %s) failed: %s", _resolved_siren, exc)
    from app.services import bellum_api

    (
        _naf1,
        _naf2,
        seed_entities,
        insee_sites,
        annuaire,
        owners,
        tech,
        gh,
        apollo_org,
        _resolved_unite_legale,
        _alias_domain,
        _denomination_history,
        _closed_establishments,
    ) = await asyncio.gather(
        enrich_entities_naf(_entities_for_tiers),
        enrich_entities_naf(result.get("meaningfulSubsidiaries") or []),
        group_it_entities(company),
        sites_for_siren(_resolved_siren),
        annuaire_task,  # recherche-entreprises (already running)
        beneficial_owners(_resolved_siren),  # INPI RNE — bénéficiaires effectifs
        detect_stack(str(result.get("website") or "")),  # Wappalyzer-lite — real stack
        org_tech_signals(company, result.get("website")),  # GitHub org — eng signal (no key)
        # Apollo Organizations Enrich (logo réel + firmographie) — env-gated sur
        # APOLLO_API_KEY (sans clé = no-op), cache 30 j par domaine, échec = None.
        enrich_organization(website_domain(str(result.get("website") or ""))),
        # #2284.17/.33/.58 — l'unité légale COMPLÈTE (catégorie juridique,
        # dénominations antérieures) de l'entité RÉSOLUE (pas les filiales/tiers
        # ci-dessus), UN SEUL aller-retour Sirene pour les deux capacités.
        # Env-gated sur INSEE_API_KEY (sans clé = no-op).
        unite_legale_by_siren(_resolved_siren),
        # #2284.26 — le domaine que la mémoire marché peut PROUVER par alias
        # (source « alias », jamais un SIREN — le corpus n'en porte aucun).
        # Pont interne, best-effort comme les deux autres appels `bellum_api`.
        bellum_api.market_alias_domain_for(
            req.user_id,
            ref=company,
            company_name=company,
            website=str(result.get("website") or "") or None,
            country=req.country,
        ),
        # #2995/SRC8 — registre légal HISTORIQUE (anciennes dénominations,
        # établissements fermés). Même clé INSEE_API_KEY que `sites_for_siren`
        # au-dessus, sans appel réseau de plus sans elle.
        denomination_history(_resolved_siren),
        closed_establishments(_resolved_siren),
        return_exceptions=True,
    )
    if isinstance(gh, BaseException):
        logger.warning("GitHub org signals failed for %r: %s", company, gh)
        gh = None
    if isinstance(apollo_org, BaseException):
        logger.warning("Apollo org enrichment failed for %r: %s", company, apollo_org)
        apollo_org = None
    if isinstance(_resolved_unite_legale, BaseException):
        logger.warning("INSEE unité légale lookup failed for %r: %s", company, _resolved_unite_legale)
        _resolved_unite_legale = None
    if isinstance(_alias_domain, BaseException):
        logger.warning("Market memory alias domain lookup failed for %r: %s", company, _alias_domain)
        _alias_domain = None
    if isinstance(result.get("entity_resolution"), dict):
        result["entity_resolution"] = attach_legal_category_kind(
            result["entity_resolution"],
            _resolved_unite_legale.legal_category if _resolved_unite_legale else None,
        )
        result["entity_resolution"] = attach_former_legal_names(
            result["entity_resolution"],
            _resolved_unite_legale.former_names if _resolved_unite_legale else None,
        )
        result["entity_resolution"] = attach_alias_domain(result["entity_resolution"], _alias_domain)
    if isinstance(_denomination_history, BaseException):
        logger.warning("INSEE denomination history failed for %r: %s", company, _denomination_history)
        _denomination_history = []
    if isinstance(_closed_establishments, BaseException):
        logger.warning("INSEE closed establishments failed for %r: %s", company, _closed_establishments)
        _closed_establishments = []
    if apollo_org is not None:
        # Bloc firmographique FACTUEL sourcé « Apollo » (rien d'inventé : champ
        # absent = clé absente). Le logo Apollo, quand il existe, remplace l'URL
        # dérivée du domaine comme logo du dossier.
        result["apolloEnrichment"] = apollo_org.model_dump(by_alias=True, exclude_none=True)
        if apollo_org.logo_url:
            result["companyLogoUrl"] = apollo_org.logo_url
        # #2284.21 — l'id d'organisation Apollo comme source de résolution
        # ADDITIONNELLE (jamais seul juge : n'enrichit qu'un verdict déjà ancré).
        if isinstance(result.get("entity_resolution"), dict):
            result["entity_resolution"] = attach_external_company_id(
                result["entity_resolution"], apollo_org.organization_id
            )
    for _label, _res in (("NAF enrichment", _naf1), ("NAF enrichment (subs)", _naf2)):
        if isinstance(_res, BaseException):
            logger.warning("INSEE %s failed for %r: %s", _label, company, _res)
    if isinstance(seed_entities, BaseException):
        logger.warning("INSEE group IT-entity seed failed for %r: %s", company, seed_entities)
        seed_entities = []
    if isinstance(insee_sites, BaseException):
        logger.warning("INSEE sites lookup failed for %r: %s", company, insee_sites)
        insee_sites = []
    # Attach the extra free sources (each degraded to empty/None on failure).

    def _ok_list(x: object) -> list:
        return x if isinstance(x, list) else []

    # Registry-sourced blocks are gated on the identity check (Company Resolver
    # hard rule): a homonym / uncertain SIREN must NOT leak its BODACC, its
    # bénéficiaires effectifs or its annuaire into the dossier.
    # #2995/SRC8 — le registre légal HISTORIQUE rejoint le MÊME `legalSignals`
    # que BODACC (`{date, type, tribunal, label}`, `tribunal: None` — INSEE ne
    # publie aucune juridiction) : les appelants existants (confiance, preuve
    # datée, citations) lisent déjà cette liste, une deuxième liste serait un
    # doublon d'affichage (GA-26). Gaté par `_use_registry` comme BODACC — un
    # homonyme ne doit pas prêter son historique légal à la mauvaise société.
    _registry_history_signals: list[dict] = []
    if _use_registry:
        for _period in former_denominations(_denomination_history):
            _registry_history_signals.append(
                {
                    "date": _period.date_fin or _period.date_debut,
                    "type": "changement de dénomination",
                    "tribunal": None,
                    "label": f"Anciennement « {_period.denomination} »",
                }
            )
        for _etab in _closed_establishments:
            if not _etab.closure_date:
                continue
            _registry_history_signals.append(
                {
                    "date": _etab.closure_date,
                    "type": "établissement fermé",
                    "tribunal": None,
                    "label": f"Établissement fermé — {_etab.city}" if _etab.city else "Établissement fermé",
                }
            )
    result["legalSignals"] = (_ok_list(legal_sig) + _registry_history_signals) if _use_registry else []
    # #3921 — événements OFFICIELS datés (ouverture d'établissement), par SIREN.
    # Gaté par `_use_registry` comme BODACC : un SIREN d'homonyme n'y fuit pas.
    # Clé optionnelle : absente quand vide ou coupée (COMPANY_EVENTS_ENABLED).
    if _use_registry and _resolved_siren:
        try:
            _company_events = await company_events(_resolved_siren)
        except Exception as exc:  # noqa: BLE001 — source gratuite, jamais bloquante
            logger.warning("company_events (siren %s) failed: %s", _resolved_siren, exc)
            _company_events = []
        if _company_events:
            result["companyEvents"] = _company_events
    # Clé optionnelle (contrat partagé : objet) : ABSENTE quand l'annuaire n'a rien
    # rendu ou que le registre est coupé — jamais ``None`` (BELLUM-IA-C).
    if _registry_annuaire_present(annuaire, _use_registry):
        result["registryAnnuaire"] = annuaire
    result["news"] = _ok_list(news)
    # #3917.b — la presse Brave (cherchée par NOM) ne rejoint les signaux récents
    # (API → fiche, fusion plus bas) que RATTACHÉE PAR SIREN : registre de confiance,
    # brève qui nomme cette entité (SIREN, domaine ou nom légal), datée, avec lien.
    _brave_press = attach_brave_news(
        result["news"],
        company=company,
        legal_name=(pappers_profile.legal_name if pappers_profile else None) if _use_registry else None,
        siren=_resolved_siren if _use_registry else None,
        domain=website_domain(req.website or "") or None,
    )
    result["itJobSignals"] = _ok_list(jobs)
    # SIG-B — clé posée seulement quand une offre nomme quelqu'un (sinon byte-identique).
    if job_recruiters:
        result["jobRecruiters"] = job_recruiters
    # Public tenders are name-matched (buyer/objet), NOT SIREN-bound — surface them
    # regardless of the identity gate (a homonym SIREN can't poison a name match).
    result["publicTenders"] = _ok_list(tenders)
    # DECP marchés attribués — also name-matched (acheteur/objet/titulaire), so not
    # gated on identity. Competitive intel: who won which recent IT contract.
    result["awardedContracts"] = _ok_list(awarded)
    # Thread achats (Théo Drive top-3) : consolide les marchés attribués DECP en un
    # fil chronologique + regroupements par titulaire (concurrent en place) et par
    # entité acheteuse. Déterministe, factuel (source DECP, montant absent = non
    # affiché) ; exploité par le prompt de plan pour déloger un titulaire.
    result["purchasingThread"] = build_purchasing_thread(result["awardedContracts"])
    # ── La barrière d'ACHAT estimée (tome 3) ────────────────────────────────
    #
    # Six proxies publics, quatre classes, et « non estimable » quand moins de
    # trois sont mesurables. Elle ne remplace pas l'accessibilité : elle répond
    # à l'autre question — « cette organisation sait-elle acheter à une ESN
    # comme celle-ci ? ». Un compte peut être parfaitement accessible et
    # totalement verrouillé (D71), et c'est le cas qui coûte huit mois.
    _annuaire = annuaire if isinstance(annuaire, dict) else {}
    # Extraits en variables NOMMÉES (31/08 → #1579) : la barrière et
    # l'adressabilité en ont chacune besoin, et une seconde écriture divergerait
    # de la première au premier ajustement — GA-53.
    _access_company = {
        "sizeClass": _annuaire.get("category"),
        "headcountTranche": _annuaire.get("headcountTranche"),
        "headcountRange": _annuaire.get("headcountRange"),
        "establishmentCount": _annuaire.get("etablissementCount"),
        "creationDate": _annuaire.get("creationDate") or result.get("creationDate"),
        "nafCode": _annuaire.get("nafCode") or result.get("nafCode"),
    }
    # #2265.14 (épopée #2851) — même jugement que le badge « intermédiaire, pas
    # client final » de /discover (`discover_signals.py`), sur le MÊME NAF que
    # `_access_company["nafCode"]` juste au-dessus : aucun second appel réseau,
    # aucune donnée de plus. `AccountsService.applyResearch` persiste les deux
    # champs ensemble sur `accounts.actor_type` / `accounts.is_intermediary`.
    _actor_type = classify_actor_type(naf=_access_company["nafCode"], name=result.get("companyName") or company)
    result["actorType"] = _actor_type.value
    result["isIntermediary"] = _actor_type in (ActorType.CABINET_RECRUTEMENT, ActorType.PLATEFORME_INTERMEDIATION)
    # #2625.1 — l'archétype compte du salesContext (calculé plus haut, AVANT
    # que le registre ne soit résolu) est reclassé une fois la catégorie INSEE
    # (PME/ETI/GE) connue : Découvrir la calcule déjà pour ce même compte
    # (`_access_company["sizeClass"]`), et l'analyse doit la RÉEMPLOYER plutôt
    # que retomber sur le seul effectif brut. `classify_account_archetype` est
    # pur et déterministe : mêmes faits qu'à l'appel initial, seul `size_class`
    # change — sans lui, résultat inchangé (byte-identique).
    if isinstance(result.get("salesContext"), dict) and isinstance(result["salesContext"].get("account"), dict):
        _refined_arch, _refined_deriv, _refined_conf, _refined_ev = classify_account_archetype(
            result.get("sector") or result.get("businessDescription"),
            employees=result.get("employees"),
            country=result.get("registry_country") or result.get("registryCountry"),
            subsidiary_count=len(result.get("subsidiaries") or []),
            naf_code=result.get("nafCode") or result.get("naf_code"),
            size_class=_access_company.get("sizeClass"),
        )
        if _refined_arch != result["salesContext"]["account"].get("archetype"):
            result["salesContext"]["account"] = {
                "archetype": _refined_arch,
                "derivation": _refined_deriv,
                "confidence": _refined_conf,
                "evidence": _refined_ev,
            }
    # Un marché ou un appel d'offres à son nom PROUVE qu'il achète en public.
    # Une absence ne prouve rien : le proxy reste non mesuré.
    _access_signals = [
        {"type": "award", "endsOn": a.get("endsOn")} for a in result["awardedContracts"] if isinstance(a, dict)
    ] + [{"type": "tender"} for t in result["publicTenders"] if isinstance(t, dict)]
    result["accessBarrier"] = barrier_for_company(
        _access_company,
        signals=_access_signals,
        # Hors barème : une procédure collective récente est un AVERTISSEMENT.
        # Une entreprise en redressement est souvent très joignable — la ranger
        # « accessible » sans le dire ferait travailler un compte qui ne
        # signera pas.
        legal_signals=result["legalSignals"],
    )
    # ── #1579 — L'ADRESSABILITÉ REJOINT LE PORTEFEUILLE ─────────────────────
    #
    # `discover_scoring.py` savait déjà calculer l'adressabilité d'un candidat
    # de Découvrir (`addressability_for_company`, ex-`_addressability`, rendue
    # PUBLIQUE pour cet appel) ; une fois le compte AJOUTÉ au portefeuille,
    # cette valeur n'était NI persistée NI recalculée comme une donnée du
    # dossier — d'où les « — » vus en Comptes sur des comptes que Bellum avait
    # pourtant déjà des éléments pour évaluer.
    #
    # ⚠️ RÉUTILISE `_access_company` / `_access_signals` / `accessBarrier` —
    # jamais un second calcul de la barrière : « réutiliser la MÊME vérité dans
    # Découvrir ET dans Comptes » (une dérivation vit à un seul endroit).
    #
    # Recalculée à chaque analyse (comme `accessBarrier` juste au-dessus) :
    # une réanalyse dont les preuves ont changé (nouvel appel d'offres, nouveau
    # profil vendeur) écrase l'ancienne valeur — jamais de valeur périmée qui
    # survivrait silencieusement.
    #
    # ⚠️ Les axes non couverts restent NOMMÉS dans `unmeasured`, jamais un `0` :
    # c'est `addressability_for_company` qui tient cette règle, pas ce point
    # d'appel.
    #
    # #1631.5 — LA RELATION. Le seul ingrédient neuf de ce point d'appel, et il
    # était déjà là : `req.crm_presence`, le relevé de la couche zéro rendu côté
    # API, que la ligne ~1287 lit déjà comme un booléen
    # (`has_crm_history(req.crm_presence)`) pour sortir le compte du « froid ».
    # On le PASSE, on ne le relit pas autrement : une seule dérivation, et le
    # texte lui-même ne ressort jamais de l'adressabilité (RBAC — l'analyse est
    # lue par tout l'espace, le relevé est obtenu avec les identifiants d'UNE
    # personne).
    #
    # #1631.3/.4 (lot 14) — L'AXE CHEMIN, enfin transmis. Jusqu'à ce lot, RIEN ne
    # transportait les routes partenaires AGRÉGÉES de la mémoire marché jusqu'ici
    # — ni `ResearchRequest`, ni aucun service de `app/services/` — alors que
    # `_path_axis` savait déjà les CALCULER depuis le lot 13 : le défaut n°1 du
    # dépôt, du code juste que personne n'appelle. `req.market_paths_observed` /
    # `req.market_top_esn` sont résolus côté API par `MarketMemoryService.pathAxisFor`
    # (la SEULE porte vers les tables partagées, GA-258) et arrivent ici EXACTEMENT
    # comme `req.crm_presence` juste au-dessus : on les PASSE, on ne les recalcule
    # pas — les déduire des marchés publics déjà en main (`_access_signals`)
    # serait d'ailleurs un DOUBLE COMPTAGE, `_lock_axis` les consomme déjà pour A1.
    # `None` (aucun ingrédient transmis, cas par défaut avant ce lot ET pour tout
    # appelant qui ne le porte pas encore) laisse l'axe NON MESURÉ, byte-identique.
    result["addressability"] = addressability_for_company(
        _access_company,
        profile,
        _access_signals,
        result["accessBarrier"],
        crm_presence=req.crm_presence,
        market_paths_observed=req.market_paths_observed,
        market_top_esn=(req.market_top_esn or None),
        # #2298.4 — les quatre sources ajoutées à la relation, résolues côté
        # API exactement comme `crm_presence` juste au-dessus. `None`/vide
        # (défaut, aucun ingrédient transmis) laisse l'axe byte-identique.
        missions_count=req.relation_missions_count,
        last_meeting_at=req.relation_last_meeting_at,
        last_email_at=req.relation_last_email_at,
        human_correction=req.relation_human_correction,
    )
    result["beneficialOwners"] = _ok_list(owners) if _use_registry else []
    # SIG-A (A4) — complétée par les technologies des offres publiées (même champ).
    result["detectedTechStack"] = merge_published_technologies(_ok_list(tech), _published_employer)
    # GitHub engineering signal (output-only, not fed to the prompt).
    result["githubSignals"] = gh or {}

    # Inject the seeded IT entity before tiering — deduped by siren AND by name
    # (#23): a seed without a siren, or with a brand-variant name of an entity we
    # already have, must not create a duplicate cartography row.
    _known_sirens = {str(e.get("siren")) for e in _entities_for_tiers if isinstance(e, dict) and e.get("siren")}
    _known_names = {normalize_name(e.get("name")) for e in _entities_for_tiers if isinstance(e, dict)}
    for ent in seed_entities:
        _siren = str(ent.get("siren") or "")
        _name = normalize_name(ent.get("name"))
        if (_siren and _siren in _known_sirens) or (_name and _name in _known_names):
            continue
        _entities_for_tiers.append(ent)
        if _siren:
            _known_sirens.add(_siren)
        if _name:
            _known_names.add(_name)

    # Entity relevance gate (S2): tag every entity operating / noise / out_of_sector
    # + getsPlay (name + registry NAF, isItEntity overrides). Out-of-sector entities
    # (SGTM/BTP, les moulins…) stay in the cartography but are surfaced separately so
    # Phase 4 never builds a full play on them (Matteo's "plays sur le bruit" pépin).
    # Stamp a deterministic parentId tree (Groupe→Filiale→BU) from type + name — never
    # from the undocumented Pappers edge direction (annexe organigramme p6). Additive:
    # consumers that ignore parentId are unaffected; the Phase 2/3 resolver enriches it.
    result["entitiesExhaustive"] = assign_entity_parents(
        [
            # Deux questions distinctes, posées l'une après l'autre : « quelle
            # SORTE d'objet est-ce ? » (recette finale §24) puis « est-ce une
            # cible commerciale ? ». Se tromper sur la première est une erreur
            # de lecture du registre, sur la seconde une erreur de jugement
            # métier — les séparer permet de corriger l'une sans l'autre.
            annotate_entity_type(
                annotate_entity_relevance(e, in_scope_families, _no_go_keywords, _allow_intl, it_esn=_it_esn),
                in_scope=_allow_intl or not is_foreign_entity(str(e.get("name") or "")),
            )
            for e in assign_priority_tiers(_entities_for_tiers, profile=profile)
        ]
    )
    # Les trois paquets du §24 : ce qu'on montre, ce qui reste consultable, et la
    # vue séparée des partenaires. Rendre les trois plutôt que de filtrer permet
    # à l'écran d'écrire « 15 entités masquées » et de les rouvrir — un produit
    # qui perd des entités sans le dire est pire qu'un produit qui en montre trop.
    result["entityDisplayBuckets"] = partition_by_display(result["entitiesExhaustive"])
    result["outOfScopeEntities"] = [e for e in result["entitiesExhaustive"] if not e.get("getsPlay")]
    result["entityTierCounts"] = tier_counts(result["entitiesExhaustive"])
    # Influence × accessibility matrix (deck's 4 zones) — per-entity `zone` +
    # `accessibilityBand` land on each entity via assign_priority_tiers above;
    # this is the group-level count for the cartography header.
    result["entityZones"] = zone_matrix(result["entitiesExhaustive"])
    # Surface the detected IT/digital entity (the ESN's prime P1 target) so the
    # dashboard can flag it explicitly ("entité IT : Euro-Information").
    result["itEntities"] = [e for e in result["entitiesExhaustive"] if e.get("isItEntity")]

    # Signal freshness (Théo p.7/p.12): stamp each recent signal current|archive|
    # undated from its date, so a 2021 press release is an archive, not "à relancer".
    # #3668.7 — la règle du prompt tenue APRÈS le modèle : entité, programme
    # général, doublons. Aucun signal n'est supprimé, il est rangé en contexte.
    # #3922.1 — le lien du signal : retrouvé par son JETON (« [B1] », « [P2] »), jamais deviné.
    # Les collecteurs portaient déjà l'URL ; c'est ici qu'elle rejoint le signal persisté.
    if result.get("recentSignals"):
        result["recentSignals"] = stamp_signal_urls(
            result["recentSignals"],
            {**bundle.ref_urls(), **dated_signal_refs(news, jobs, legal_sig, tenders, awarded)},
        )
        # #4182.5 — le demandeur de chaque offre, lu dans son texte, joint par l'URL seule.
        result["recentSignals"] = stamp_offer_requesters(result["recentSignals"], jobs)
        # #4437.5 — et son rattachement (compétence, famille, type de fait) lu dans l'intitulé : « non classé » sinon.
        result["recentSignals"] = stamp_offer_attachments(result["recentSignals"], jobs)
        # #4816 — et le LIEU de l'offre citée, joint par l'URL : l'axe Zone de l'Historique lit ce champ.
        result["recentSignals"] = stamp_offer_locations(result["recentSignals"], jobs)
    if result.get("recentSignals"):
        _other_names = [c.name for c in (homonyms.candidates if homonyms else []) if c.siren != homonyms.selected_siren]
        if (req.siren or "").strip():
            # Demande ciblée sur UNE entité : les autres entités du groupe ne
            # prêtent pas leurs signaux (jamais le groupe entier par défaut).
            _other_names += [str(e.get("name") or "") for e in result["entitiesExhaustive"]]
        result["recentSignals"], result["signalSelection"] = select_signals(
            result["recentSignals"], target=company, other_entities=_other_names
        )
    # #3921.1 — les événements officiels (ouverture d'établissement) entrent dans les signaux
    # APRÈS la sélection : ils portent un lieu, pas le nom de la cible, et ne doivent pas être
    # rangés « contexte » pour ça. Avant, `companyEvents` n'avait AUCUN lecteur.
    # #3917.1 — idem pour la presse RSS (`pressSignals`, datée et liée) : elle n'avait aucun lecteur.
    if result.get("pressSignals"):
        result["recentSignals"] = merge_press_signals(result.get("recentSignals"), result["pressSignals"])
    # #3917.b — même chemin pour la presse Brave rattachée par SIREN (dédup par lien).
    if _brave_press:
        result["recentSignals"] = merge_press_signals(result.get("recentSignals"), _brave_press)
    if result.get("companyEvents"):
        result["recentSignals"] = merge_company_event_signals(result.get("recentSignals"), result["companyEvents"])
    # #3970 (lot P07) — offres d'emploi, annonces légales, appels d'offres et marchés
    # attribués entrent dans les signaux TYPÉS par ce chemin déterministe : avant, ils
    # n'y arrivaient que si le modèle les citait, et la veille ne portait qu'une nature.
    # APRÈS la sélection, comme la presse : ces collecteurs sont déjà rattachés par
    # SIREN/domaine, et un plafond par nature empêche une famille de noyer les autres.
    if jobs or legal_sig or tenders or awarded:
        result["recentSignals"] = merge_collector_signals(
            result.get("recentSignals"), jobs=jobs, legal=legal_sig, tenders=tenders, awarded=awarded
        )
    # #4734 — ce que les annuaires de l'écosystème startup disent du SIREN d'ancrage (jamais le nom seul) :
    # aucun annuaire déclaré, aucun SIREN ou entreprise absente = aucune ligne, zéro réseau ; une panne
    # d'annuaire rend la liste d'origine (`ecosystem_signals_merged`), jamais un dossier cassé.
    if _anchor_siren:
        result["recentSignals"] = await ecosystem_signals_merged(result.get("recentSignals"), _anchor_siren)
    # #3668.8 — « aucun signal » ne se dit que si les sources ont répondu.
    result["signalCoverage"] = signal_coverage(
        len(result.get("recentSignals") or []), get_degradations(get_correlation_id())
    )
    if result.get("recentSignals"):
        result["recentSignals"] = stamp_signals_freshness(result["recentSignals"])
        # Les trois couches du §25-26 : ce qu'on montre, ce qui attend derrière
        # « Voir les autres », et le contexte historique. La classification de
        # fraîcheur existait déjà et disait juste ; personne ne s'en servait
        # pour ORDONNER, si bien qu'un fait de 2021 occupait une place visible
        # pendant qu'un fait de juillet attendait en dessous. Chaque signal
        # porte en plus son implication commerciale — impact, interlocuteur,
        # action — parce qu'un signal sans implication est une coupure de presse.
        # (calculé juste dessous par `build_signal_layers`, avec les offres.)
    # #4760 — les offres d'emploi passent AUSSI par l'estampillage et par les couches
    # (fenêtre de 180 jours du recrutement) : avant, seules `recentSignals` y passaient et
    # `signal_freshness.py` ne voyait jamais une offre. Clé nommée : `signalLayers.jobOffers`.
    result["itJobSignals"], _layers = build_signal_layers(result.get("recentSignals"), result["itJobSignals"])
    if _layers:
        result["signalLayers"] = _layers

    # Le score en cinq axes (§27-28), calculé et non demandé au modèle : une note
    # rendue par un LLM change d'un run à l'autre sur le même dossier, et deux
    # commerciaux ne lisent alors pas le même compte. Surtout, chaque axe porte
    # sa preuve, son levier, et le fait d'être PLAFONNÉ par ce qu'on ignore
    # plutôt que par le compte — c'est la distinction du §27, celle qui évite
    # d'abandonner un bon compte parce que le profil ESN était vide.
    result["scoreAxes"] = compute_axes(result, profile if isinstance(profile, dict) else {})

    # Leadership dating (Théo p.7): a person shown with a current-leadership title
    # but absent from the live registry (Oudéa, parti de SG en 2023) is dated
    # "(ancien — à vérifier)" instead of surfacing as the current DG. No-op without
    # a registry (homonym / Pappers-less run) — can't tell, so never guesses.
    if _use_registry:
        mark_former_leaders(result)
    # Perimeter Fit Score /20 (03_BUSINESS_RULES §2). Every entity carries its own
    # /20 + tier for the cartographie (page 3.2); priorityPerimeters is the curated
    # top-4 actionable zones — "pas le groupe, les périmètres actionnables".
    # #4432.7 — dossier zoné : filiales et établissements de la zone en tête (hors zone gardés, après ;
    # lieu inconnu jamais « dans la zone »). Avant le score : à score égal, l'ordre départage la coupe.
    _dossier_zone = dossier_zone(req.cadrage)
    if _dossier_zone:
        for _key in ("entitiesExhaustive", "meaningfulSubsidiaries"):
            if isinstance(result.get(_key), list):
                result[_key] = zone_first(result[_key], _dossier_zone)
    for _ent in result["entitiesExhaustive"]:
        if isinstance(_ent, dict):
            _ent["perimeterScore"] = perimeter_score(_ent)
            _ent["perimeterTier"] = perimeter_tier(_ent["perimeterScore"])
    result["priorityPerimeters"] = select_priority_perimeters(result["entitiesExhaustive"])

    # Zones blanches (Théo Drive top-3) : croise les entités CONNUES du groupe
    # (entitiesExhaustive, registre = SIREN) avec les signaux d'achat/activité
    # (marchés attribués DECP, appels d'offres, recrutements IT, presse/budget).
    # Une entité opérante connue sans le moindre signal = opportunité vierge. On
    # ne revendique « blanc » que sur une entité confirmée (SIREN) — sinon inconnu.
    result["whiteSpaces"] = build_white_spaces(
        result["entitiesExhaustive"],
        awarded_contracts=result.get("awardedContracts"),
        tenders=result.get("publicTenders"),
        job_signals=result.get("itJobSignals"),
        recent_signals=result.get("recentSignals"),
        budget_signals=result.get("budgetSignals"),
        target_company=result.get("companyName") or company,
    )

    # Vocabulaire du groupe (Théo) — la grille de lecture par compte, taggée
    # déterministe depuis entités / concurrents / programmes / stack (slice 1 ;
    # le prompt AccountVocabularyBuilder enrichira meaning/commercialWhy).
    result["accountVocabulary"] = build_vocabulary(result)
    # Enrichissement LLM (AccountVocabularyBuilder, always-on) : meaning/commercialWhy +
    # termes ratés par le déterministe. Dégradable : toute erreur (ou clé Anthropic
    # absente) → enrich_vocabulary renvoie le vocabulaire déterministe inchangé.
    _voc_sources = " ".join(
        str(result.get(k) or "")
        for k in ("businessDescription", "concreteActivity", "it_implications_for_esn", "priorityJustification")
    )
    # Launch the LLM vocab enrichment as a task and gather it with the grounding
    # pass below — both are independent, best-effort passes over the finished
    # research result, so running them concurrently makes the tail
    # max(vocab, grounding) instead of the sum. (Nothing between here and the
    # gather reads ``accountVocabulary``.)
    _vocab_task = asyncio.create_task(enrich_vocabulary(result["accountVocabulary"], _voc_sources, company))

    # Real établissements replace the LLM's (invented-risk) sitesFrance — but only
    # when the resolved entity is trusted (a homonym's sites are not the group's).
    if insee_sites and _use_registry:
        # KEVIN-FIX K.10 — un cadrage ville/site ORDONNE les sites (celui de la zone d'abord, le reste « hors site »).
        # `scope_city` n'est posé que pour un cadrage `geo_perimeter == "city"` (voir `graph/nodes.py`).
        result["sitesFrance"] = order_sites_for_zone(insee_sites, req.scope_city)
    # #4432.7 — les établissements de la zone d'abord (cadrage région), les autres gardés après.
    if _dossier_zone and isinstance(result.get("sitesFrance"), list):
        result["sitesFrance"] = zone_first(result["sitesFrance"], _dossier_zone)
    # #4432.9 — le groupe n'a AUCUNE entité dans la zone : on élargit SEUL au palier suivant (région, puis France)
    # et on le DIT — `dossierZoneWidening` voyage jusqu'à l'onglet Sites. Jamais une question, jamais un dossier vide muet.
    # #4432.10 — le dossier DIT de quels critères il est né (sélection Découvrir / carte de Laura, zone du cadrage).
    _born_from = dossier_born_from(req.seller_hypotheses, req.cadrage)
    if _born_from:
        result["dossierBornFrom"] = _born_from
    _widening = zone_widening(_dossier_zone, result)
    if _dossier_zone and _widening:
        result["dossierZoneWidening"] = _widening
        _served = zone_widened(_dossier_zone, _widening)
        for _key in ("entitiesExhaustive", "meaningfulSubsidiaries", "sitesFrance"):
            if isinstance(result.get(_key), list):
                result[_key] = zone_first(result[_key], _served)

    firecrawl_total_chars = sum(len(s.scraped_markdown or "") for s in sources)
    # Wall-clock + money split of the run. Without it "l'analyse est trop longue"
    # is unactionable — a slow Firecrawl, a slow Claude and a wait on our own
    # rate limiter are indistinguishable.
    _cid_metrics = get_correlation_id()
    _provider_metrics = get_metrics(_cid_metrics)
    if _provider_metrics:
        logger.info("Phase 1 provider breakdown [%s]: %s", _cid_metrics, summarise_metrics(_cid_metrics))
        # #2905 / #2442.16 — préalable du rejeu de pipeline : persiste la MÊME
        # répartition que la ligne de log ci-dessus, au lieu de la laisser
        # disparaître avec le worker. Fail-soft, jamais sur le chemin critique.
        await record_analysis_tool_trace(
            _cid_metrics,
            company_name=company,
            account_id=req.account_id or None,
            provider_metrics=_provider_metrics,
        )
    # Pappers is the only source billed per call whose quota can go to zero and
    # take the dossier down with it (401 « plus assez de crédits » en prod). The
    # provider breakdown above lumps every endpoint under "pappers"; this line
    # names them, so a drift shows WHICH call multiplied. Measurement only — no
    # call was refused.
    logger.info("Budget Pappers [%s] : %s", _cid_metrics, pappers_budget.summarise_run(_cid_metrics))
    result["_api_metrics"] = {
        "provider_metrics": _provider_metrics,
        "pappers_calls": pappers_budget.run_metrics(_cid_metrics),
        "brave_results_count": len(brave_hits),
        "brave_per_category": {c.value: n for c, n in bundle.hit_counts().items()},
        "firecrawl_pages_scraped": ok_pages,
        # #4016.D — crédits réellement facturés (metadata.credits_used) + appels réels.
        **run_credit_metrics(_cid_metrics),
        # #4016.7 — documents lus en local (0 crédit) : web_documents_read / _failed.
        **web_documents.run_metrics(),
        "firecrawl_total_chars": firecrawl_total_chars,
        "firecrawl_per_category": {
            c.value: counts for c, counts in bundle.status_counts().items()
        },
        "firecrawl_urls_scraped": [s.url for s in sources if s.scrape_status == "ok"],
        "pappers_siren": pappers_profile.siren if pappers_profile else None,
        "pappers_has_finances": bool(pappers_profile and pappers_profile.financials_history),
        "pappers_executives_count": len(pappers_profile.executives) if pappers_profile else 0,
        "pappers_c_level_count": len(pappers_profile.c_level) if pappers_profile else 0,
        "pappers_branches_count": pappers_profile.branch_count if pappers_profile else 0,
        "pappers_subsidiaries_count": len(pappers_profile.subsidiaries) if pappers_profile else 0,
        "pappers_graph_fetched": pappers_profile.corporate_graph is not None if pappers_profile else False,
        # B1 telemetry: total token cost of this phase = sum of the 3 parallel
        # Claude calls. Surfaced on the envelope meta so the API worker can
        # accumulate it into ``api_cost_euros`` (instead of discarding usage).
        # ``by_phase`` breaks the total down per generation (facts / signals /
        # strategy) — the instrument #274 needs to baseline ``bellum_strategy``.
        # ⚠️ `strategy` est OMISE, pas mise à zéro, quand l'appel a échoué sans
        # rien laisser de mesurable : un `TokenUsage` à zéro se lirait « cet
        # appel n'a rien coûté », ce qui est faux — le refus a été facturé.
        # « Non mesuré » n'est pas « mesuré à zéro ».
        "token_usage": phase_token_usage(
            {
                "facts": _f_usage,
                "signals": _s_usage,
                **({"strategy": _t_usage} if _t_usage is not None else {}),
            }
        ),
        # C5 telemetry — hit/miss du cache sources publiques par source + économie
        # estimée sur CE run (0 partout quand le cache est off / à froid).
        "source_cache": source_cache.run_stats(),
    }
    _sc = result["_api_metrics"]["source_cache"]
    logger.info(
        "Source cache for '%s': %d hit(s) / %d miss(es), ~%.3f € saved%s",
        company,
        _sc["hit_count"],
        _sc["miss_count"],
        _sc["estimated_saved_eur"],
        " [bypass: re-run < 1 h]" if _sc["bypassed"] else "",
    )

    # B3: deterministic source attribution — registry of everything consulted
    # + hard citations (Pappers SIREN, per-subsidiary SIREN) for the facts we
    # can legally prove. Computed, never asked to the LLM.
    result["sources"] = build_facts_sources(
        facts=result,
        brave_hits=brave_hits,
        firecrawl_urls=result["_api_metrics"]["firecrawl_urls_scraped"],
        # A homonym / uncertain SIREN must not be cited as legal proof.
        pappers_siren=pappers_profile.siren if (pappers_profile and _use_registry) else None,
        pappers_url=pappers_profile.pappers_url if (pappers_profile and _use_registry) else None,
    ).model_dump(by_alias=True)

    # The 5 statuts de vérité (cadrage §4): the legend + the deterministic
    # category→status map, so the front can badge every block (fait / signal /
    # hypothèse / recommandation / risque) from one source and never show a
    # hypothesis as a fact. Static, no LLM.
    result["truth_statuses"] = {
        "legend": truth_status_legend(),
        "categories": truth_status_category_map(),
    }

    # B3+: native Anthropic Citations — inhallucinable ``cited_text`` proving the
    # key facts, lifted verbatim from the collected evidence (the registry above
    # says WHICH source; this gives the exact sentence). Best-effort + bounded; its
    # cost folds into the phase token usage so the dashboard counts it.
    #
    # The citable evidence is the REAL collected sources, not the web scrapes
    # alone: revenue/employees/sector/headquarters are registry (Pappers/RNE)
    # values (``_merge_pappers``), so ``build_cite_docs`` prepends a registry
    # document rebuilt from those fields — otherwise the registry-backed facts have
    # no document to cite and the pass sources nothing (0 citations). Web scrapes +
    # news snippets stay in for web-only / homonym-rejected runs.
    _scraped_docs = [
        {"title": s.url or "page", "text": s.scraped_markdown or ""}
        for s in sources
        if s.scrape_status == "ok" and s.scraped_markdown
    ]
    cite_docs = build_cite_docs(result, _scraped_docs, news=brave_hits)
    citations, cite_usage = await cite_key_facts(
        company, result, cite_docs, correlation_id=get_correlation_id() or ""
    )
    if citations:
        result["sources"]["citations"] = citations
    if cite_usage is not None:
        tu = dict(result["_api_metrics"].get("token_usage") or {})
        tu["input_tokens"] = tu.get("input_tokens", 0) + cite_usage.input_tokens
        tu["output_tokens"] = tu.get("output_tokens", 0) + cite_usage.output_tokens
        tu["cost_usd"] = tu.get("cost_usd", 0.0) + cite_usage.cost_usd
        result["_api_metrics"]["token_usage"] = tu

    # B4: deterministic confidence score from objective signals (source
    # coverage, legal anchor, cited extracts (B3), freshness, completeness) —
    # never asked to the LLM.
    result["confidence"] = compute_confidence(
        metrics=result["_api_metrics"], data=result, sources=result["sources"]
    ).model_dump(by_alias=True)

    # ── Grounding v2 (always-on) ─────────────────────────────────────────────
    # ADDITIVE. A DISTINCT native-Citations pass (Citations ⊥ Structured Outputs →
    # parsed robustly first-{-to-last-}) attaches inhallucinable per-fact
    # ``sourceRefs`` + the derived "<5% facts non-sourced" KPI. Best-effort (never
    # breaks research); with nothing to ground ``ground_facts_v2`` returns
    # ``(None, None)`` and no ``grounding`` key is added. Reuses the already-built
    # ``cite_docs``; its cost folds into the phase token usage so the dashboard
    # keeps counting it.
    # Grounding + vocab run concurrently (both best-effort on the finished
    # result); await both here so neither blocks the other on the critical path.
    (grounding, g_usage), _enriched_vocab = await asyncio.gather(
        ground_facts_v2(company, result, cite_docs, correlation_id=get_correlation_id() or ""),
        _vocab_task,
    )
    result["accountVocabulary"] = _enriched_vocab
    if grounding is not None:
        result["grounding"] = grounding
        result["_api_metrics"]["grounding"] = grounding["kpi"]
    if g_usage is not None:
        tu = dict(result["_api_metrics"].get("token_usage") or {})
        tu["input_tokens"] = tu.get("input_tokens", 0) + g_usage.input_tokens
        tu["output_tokens"] = tu.get("output_tokens", 0) + g_usage.output_tokens
        tu["cost_usd"] = tu.get("cost_usd", 0.0) + g_usage.cost_usd
        result["_api_metrics"]["token_usage"] = tu

    # Echo the requested perimeter so the API persists it in raw_analysis and the
    # dossier can show « Périmètre : France » (Théo p.10 : scope persisté dans le run).
    if req.scope_mode:
        result["scopeMode"] = req.scope_mode

    # Dédup internationale des comptes canoniques : expose l'identité registre
    # résolue par le country pack (registryId / registryCountry + l'entité
    # complète sous countryRegistry) pour que l'API la persiste comme le SIREN.
    # ``{}`` sur le chemin FR (pack None) ⇒ payload FR byte-identique.
    result.update(_registry_identity_overlay(_cp))

    # Financiers SEC/EDGAR US (comptes cotés US) — persistés sous
    # ``raw_analysis.us_sec_financials`` (constat #540 volet A : injectés au prompt
    # mais jamais persistés → invisibles sur la fiche). ``{}`` hors US → inchangé.
    result.update(_us_sec_financials_overlay(_cp))

    # #2291.2 (lot R) — le modèle de contrat OBSERVÉ, sur les offres et avis
    # BOAMP déjà lus au §5 (``jobs``/``tenders``) — zéro appel de plus, TOUJOURS
    # posé (voir le docblock de l'overlay pour la raison).
    result.update(_contract_model_overlay(company, jobs, tenders))

    # Reproducibility stamp (Théo p.15): record WHICH prompt versions produced
    # this run — a short content hash per registered system prompt, rendered with
    # this run's profile. Purely additive; lets a dossier be replayed/compared
    # against the golden set before a merge. ``setdefault`` never clobbers existing
    # metrics.
    result.setdefault("_api_metrics", {})["prompt_versions"] = (
        prompt_registry_fingerprint(profile)
    )

    # Same reproducibility idea for the Drive business rules (roadmap §14/§17 P1):
    # stamp WHICH règles métier (et leur version) ont façonné ce run — les règles
    # ACTIVES + le fingerprint par règle — à côté de ``prompt_versions``. Additif ;
    # ``setdefault`` ci-dessus garantit qu'on n'écrase pas les métriques existantes.
    result["_api_metrics"]["business_rules"] = business_rules_run_stamp()

    # #4454 (IA-C) — le contrat partagé se tient CÔTÉ PRODUCTEUR : une dérive de type du modèle sur un champ
    # de premier niveau est ramenée à la forme documentée, plutôt que signalée à chaque run.
    try:
        conform_to_contract("research", result)
    except SharedSchemasNotFound:
        pass  # contrat absent du disque : la validation (nodes._check_contract) le dit déjà, une fois

    return ResearchResponse(success=True, data=result)


# ── Phase-1 → AgentEnvelope wrapper (feature-flagged) ─────────────────────────

PHASE1_AGENT_NAME = "researcher"
PHASE1_AGENT_VERSION = "1.0.0"


def _derive_source_health(metrics: dict, correlation_id: str = "") -> dict[str, SourceHealth]:
    """Best-effort source-health from `_api_metrics`.

    The current phase-1 pipeline already tracks per-source counts; we map them
    back to the contract's 'ok' / 'degraded' / 'down' / 'skipped' tristate.
    Honestly approximate: 'down' here means "produced 0 usable items", which
    isn't quite the same as "the API was unreachable".
    """
    health: dict[str, SourceHealth] = {}
    brave_count = metrics.get("brave_results_count", 0)
    health["brave"] = SourceHealth.OK if brave_count else SourceHealth.DOWN
    firecrawl_count = metrics.get("firecrawl_pages_scraped", 0)
    if firecrawl_count == 0:
        health["firecrawl"] = SourceHealth.DOWN
    else:
        health["firecrawl"] = SourceHealth.OK
    health["pappers"] = (
        SourceHealth.OK if metrics.get("pappers_siren") else SourceHealth.DOWN
    )
    # A recorded failure always wins over a count-based guess: Firecrawl can
    # return a few cached pages and still have lost most of the scrape. This is
    # also the only way the sources the metrics never tracked (the five
    # dated-signal feeds, the Data Gateway) can surface at all.
    # SIG-C — vue PUBLIQUE : un fournisseur d'offres se replie en `job_aggregators`.
    for entry in get_public_degradations(correlation_id):
        health[entry["source"]] = SourceHealth.DOWN
    return health


_WARNING_TEMPLATES: dict[str, str] = {
    "brave": "Recherche web indisponible. Analyse basée sur Firecrawl + Pappers.",
    "firecrawl": "Scraping des sites indisponible. Analyse basée sur les snippets Brave + Pappers.",
    "pappers": "Données légales (Pappers) indisponibles. CA, effectifs et siège peuvent être imprécis.",
    "brave_news": "Actualités récentes indisponibles. Les signaux presse manquent au dossier.",
    "france_travail": "Offres d'emploi IT indisponibles. Les signaux de recrutement manquent au dossier.",
    "apec": "Offres APEC indisponibles.",
    "welcome_to_the_jungle": "Offres Welcome to the Jungle indisponibles.",
    # #3885 — jamais le nom d'un fournisseur à nous : « agrégateurs d'emploi ».
    "job_aggregators": "Une partie des offres d'emploi agrégées est indisponible.",
    "bodacc": "Événements légaux (BODACC) indisponibles.",
    "boamp": "Appels d'offres publics (BOAMP) indisponibles.",
    # #4116 — jamais le nom de la source : « appels d'offres européens ».
    "eu_tenders": "Appels d'offres européens indisponibles — seuls les appels d'offres français sont listés.",
    "decp": "Marchés publics attribués (DECP) indisponibles — concurrents en place non détectés.",
    "data_gateway": "Sources web complémentaires indisponibles.",
    "classify_batch": "Une partie des contacts n'a pas pu être classée — la liste est incomplète.",
    "recherche_entreprises": "Annuaire des entreprises indisponible. Identité légale et dirigeants incomplets.",
    "insee": "Registre INSEE Sirene indisponible. Périmètre du groupe et entités IT moins précis.",
    "inpi": "Bénéficiaires effectifs (INPI) indisponibles.",
    "github": "Signaux techniques GitHub indisponibles.",
    "tech_detect": "Détection de la stack technique du site indisponible.",
    "apollo_enrich": "Enrichissement des emails (Apollo) dégradé. Certains contacts sont livrés sans email.",
    # Structural, not transient: retrying changes nothing, the subscription does.
    "apollo_plan": (
        "Le forfait Apollo ne permet pas de révéler les emails. "
        "Les contacts sont livrés sans email — vérifier l'abonnement Apollo."
    ),
    "rag_documents": "Vos documents (Connaissances) n'ont pas pu être consultés. Le dossier ne s'en inspire pas.",
}


#: Les sections que `bellum_strategy` est SEUL à produire. Toutes vides = la
#: réponse n'a été mappée sur aucun champ (voir l'appel plus haut).
#:
#: ⚠️ La liste vivait ICI ; elle vit désormais dans le MODÈLE, parce que c'est le
#: schéma qui refuse — et un réglage vit à un seul endroit (GA-26). Cet alias
#: garde les lecteurs existants ; il n'y a plus qu'une définition de « vide ».
_STRATEGY_SECTIONS = STRATEGY_SECTIONS


def _strategy_is_empty(strategy: ResearchStrategy) -> bool:
    """Vrai quand AUCUNE section stratégique n'a été renseignée.

    Depuis le refus de schéma, une telle sortie n'arrive plus par la validation :
    elle n'arrive que par `ResearchStrategy.empty()`, le repli sanctionné quand
    le modèle a échoué jusqu'au bout. Le filet reste — un filet qu'on retire
    parce qu'« ça ne peut plus arriver » est un filet qu'on regrette.
    """
    return len(strategy_sections_that_say_nothing(strategy)) == len(STRATEGY_SECTIONS)


def _strategy_warning(data: object) -> list[AgentWarning]:
    """L'avertissement « aucune section stratégique » sur le dossier livré.

    Il est calculé sur la sortie FINALE et non sur la seule réponse du modèle :
    c'est l'état réel du dossier qui compte, et c'est lui qui fait basculer
    l'enveloppe en `partial_success` — « une partie est passée » est la vérité,
    ni un succès ni un échec.

    ⚠️ Il lisait sa PROPRE liste de cinq clés, en simple présence : un dossier
    dont le seul angle s'appelait « » passait donc pour rempli, là où le schéma
    aurait refusé la réponse. Deux définitions de « vide » — exactement ce que
    GA-26 interdit. Il lit maintenant la même que le schéma.
    """
    if not isinstance(data, dict):
        return []
    if len(strategy_sections_that_say_nothing(data)) < len(STRATEGY_SECTIONS):
        return []
    return [
        AgentWarning(
            code="STRATEGY_SECTIONS_EMPTY",
            message=(
                "L'analyse stratégique n'a produit ni angle d'attaque, ni défi IT, ni douleur "
                "pour ce compte. Les autres sections du dossier sont complètes — relance "
                "l'analyse pour retenter cette partie."
            ),
            context={"sections": list(_STRATEGY_SECTIONS)},
        )
    ]


def _warnings_from_health(
    health: dict[str, SourceHealth], correlation_id: str = ""
) -> list[AgentWarning]:
    """One warning per degraded source, carrying the recorded cause when we have
    it. The reason is what turns "le dossier est plus pauvre" into something the
    user can act on ("Firecrawl a timeout" ≠ "Pappers ne connaît pas ce SIREN")."""
    reasons = {e["source"]: e["reason"] for e in get_public_degradations(correlation_id)}
    out: list[AgentWarning] = []
    for source, status in health.items():
        if status not in (SourceHealth.DOWN, SourceHealth.DEGRADED):
            continue
        msg = _WARNING_TEMPLATES.get(source)
        if not msg:
            continue
        reason = reasons.get(source, "")
        context = {"source": source, "status": status.value}
        if reason:
            context["reason"] = reason
        out.append(
            AgentWarning(
                code=f"{source.upper()}_{status.value.upper()}_FALLBACK_USED",
                message=f"{msg} ({reason})" if reason else msg,
                context=context,
            )
        )
    return out


def _token_usage_from_metrics(metrics: dict) -> TokenUsage | None:
    """Build the envelope ``TokenUsage`` from the ``_api_metrics`` blob the
    pipeline stashes. Returns None when usage wasn't tracked."""
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
    source_health: dict[str, SourceHealth] | None = None,
    warnings: list[AgentWarning] | None = None,
    token_usage: TokenUsage | None = None,
) -> AgentMeta:
    return AgentMeta(
        agent_name=PHASE1_AGENT_NAME,
        agent_version=PHASE1_AGENT_VERSION,
        correlation_id=correlation_id,
        started_at=started_at.isoformat(),
        finished_at=datetime.now(UTC).isoformat(),
        duration_ms=int((time.monotonic() - t0_monotonic) * 1000),
        source_health=source_health or None,
        warnings=warnings or None,
        token_usage=token_usage,
    )


def _envelope_response(envelope: AgentEnvelope, *, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=envelope.model_dump(mode="json", exclude_none=True, by_alias=True),
    )


async def _research_with_envelope(
    req: ResearchRequest, request: Request
) -> JSONResponse:
    """Wrap ``_research`` so the response always parses as ``AgentEnvelope``.

    HTTP status codes are preserved (422 for terminal Claude failures, 402 for
    terminal Firecrawl failures, 200 for success, 499 for cancellation) so the
    API worker's existing retry policy keeps working bit-for-bit; the only
    change is the response body shape.
    """
    started_at = datetime.now(UTC)
    t0 = time.monotonic()
    correlation_id = get_correlation_id() or ""
    # A retried run reuses its correlation id; without this it inherits the
    # previous attempt's failures and timings, reporting sources as down that
    # are now fine.
    clear_degradations(correlation_id)
    clear_metrics(correlation_id)

    try:
        response = await run_or_cancel(request, _research(req))
    except HTTPException as exc:
        if exc.status_code == 499:
            envelope = AgentEnvelope[ResearchData](
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
        # Non-499 HTTPException → _research() converts unexpected exceptions to
        # HTTPException(502). Map to a recoverable AgentError so the worker
        # retries (5xx) but keep the envelope shape consistent under the flag.
        retryable = 500 <= exc.status_code < 600 and exc.status_code != 501
        envelope = AgentEnvelope[ResearchData](
            status=(
                AgentStatus.RECOVERABLE_FAILURE
                if retryable
                else AgentStatus.TERMINAL_FAILURE
            ),
            data=None,
            error=AgentError(
                code="HTTP_UNAVAILABLE" if retryable else "HTTP_REJECTED",
                service="internal",
                severity="recoverable" if retryable else "terminal",
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
        envelope = AgentEnvelope[ResearchData](
            status=AgentStatus.TERMINAL_FAILURE,
            data=None,
            error=AgentError.from_claude_error(
                exc, context={"correlation_id": correlation_id}
            ),
            meta=_build_meta(
                started_at=started_at,
                t0_monotonic=t0,
                correlation_id=correlation_id,
            ),
        )
        return _envelope_response(envelope, status_code=422)
    except FirecrawlScrapeError as exc:
        err = AgentError.from_firecrawl_error(
            exc, context={"correlation_id": correlation_id}
        )
        status = (
            AgentStatus.RECOVERABLE_FAILURE
            if err.retryable
            else AgentStatus.TERMINAL_FAILURE
        )
        envelope = AgentEnvelope[ResearchData](
            status=status,
            data=None,
            error=err,
            meta=_build_meta(
                started_at=started_at,
                t0_monotonic=t0,
                correlation_id=correlation_id,
            ),
        )
        http_status = 503 if err.retryable else 402
        return _envelope_response(envelope, status_code=http_status)
    except ResearchGroundingError as exc:
        # Every primary source produced nothing, so the run was stopped BEFORE
        # prompting Claude. Recoverable by construction: recharge the exhausted
        # key (or wait out the outage) and relaunch. ``user_message`` names the
        # dead providers so the account's error_message is actionable instead of
        # the useless "research failed".
        logger.error(
            "Phase 1 stopped — no primary source produced data: %s",
            ", ".join(exc.down),
            exc_info=exc,
        )
        envelope = AgentEnvelope[ResearchData](
            status=AgentStatus.RECOVERABLE_FAILURE,
            data=None,
            error=AgentError(
                code=exc.code,
                service=ErrorService.PRECONDITION,
                severity=ErrorSeverity.RECOVERABLE,
                retryable=True,
                user_message=exc.user_message,
                debug_message=f"no grounding: {', '.join(exc.down)} all returned 0 items",
                context={"correlation_id": correlation_id, "down_sources": exc.down},
            ),
            meta=_build_meta(
                started_at=started_at,
                t0_monotonic=t0,
                correlation_id=correlation_id,
            ),
        )
        # 424 Failed Dependency: this service is healthy, its upstreams are not.
        return _envelope_response(envelope, status_code=424)
    except Exception as exc:  # noqa: BLE001
        logger.error("Phase 1 unexpected failure", exc_info=exc)
        envelope = AgentEnvelope[ResearchData](
            status=AgentStatus.TERMINAL_FAILURE,
            data=None,
            error=AgentError.from_unexpected(exc, agent_name=PHASE1_AGENT_NAME),
            meta=_build_meta(
                started_at=started_at,
                t0_monotonic=t0,
                correlation_id=correlation_id,
            ),
        )
        return _envelope_response(envelope, status_code=500)

    # Success path — derive source health + token cost from _api_metrics.
    metrics = response.data.get("_api_metrics", {}) if isinstance(response.data, dict) else {}
    source_health = _derive_source_health(metrics, correlation_id)
    warnings = _warnings_from_health(source_health, correlation_id) + _strategy_warning(response.data)
    token_usage = _token_usage_from_metrics(metrics)
    envelope_status = (
        AgentStatus.PARTIAL_SUCCESS if warnings else AgentStatus.SUCCESS
    )
    try:
        data = ResearchData.model_validate(response.data)
    except ValidationError as exc:
        # Defence in depth: a contract mismatch must surface as a structured
        # error, never a raw 500 ("Internal Server Error" text). This was the
        # production failure mode on accounts with subsidiaries.
        logger.error("Phase 1 contract validation failed", exc_info=exc)
        envelope = AgentEnvelope[ResearchData](
            status=AgentStatus.TERMINAL_FAILURE,
            data=None,
            error=AgentError.from_unexpected(exc, agent_name=PHASE1_AGENT_NAME),
            meta=_build_meta(
                started_at=started_at,
                t0_monotonic=t0,
                correlation_id=correlation_id,
            ),
        )
        return _envelope_response(envelope, status_code=422)
    envelope = AgentEnvelope[ResearchData](
        status=envelope_status,
        data=data,
        error=None,
        meta=_build_meta(
            started_at=started_at,
            t0_monotonic=t0,
            correlation_id=correlation_id,
            source_health=source_health,
            warnings=warnings,
            token_usage=token_usage,
        ),
    )
    return _envelope_response(envelope, status_code=200)


@router.post("/research")
async def research(req: ResearchRequest, request: Request):
    """Phase 1 HTTP entrypoint — always returns an ``AgentEnvelope``."""
    return await _research_with_envelope(req, request)
