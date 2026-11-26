import asyncio
import json
import logging
import os
import time
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Side-effect import — binds AgentError.from_* classmethods.
import app.models.agent_error_adapters  # noqa: F401
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
)
from app.models.contacts import (
    EmploymentFreshnessRequest,
    EmploymentFreshnessResponse,
    ApolloSearchHit,
    ContactsRequest,
    ContactsResponse,
    DiscoverContactsRequest,
    DiscoverContactsResponse,
    EnrichPersonRequest,
    EnrichPersonResponse,
    PersonNameSearchHit,
    RevealPhoneRequest,
    RevealPhoneResponse,
    SearchPeopleByNameRequest,
    SearchPeopleByNameResponse,
)
from app.models.contacts_data import ContactsData, ContactsFallbackOutcome, ContactsWidenOutcome
from app.services import cost_ledger
from app.services.employment_freshness import read_employment_freshness
from app.services.apollo import (
    ORG_ANCHOR_THIN_BELOW,
    ApolloPlanError,
    ApolloSearchStatus,
    ApolloUnavailableError,
    SearchOutcome,
    enrich_person_with_fallback,
    request_phone_reveal,
    search_past_employees,
    search_people,
    search_people_by_name,
    search_people_with_status,
)
from app.services.apollo import (
    hit_identity as _hit_identity,
)
from app.services.apollo import (
    merge_hits as _merge_hits,
)
from app.services.brave_search import search as brave_search
from app.services.brave_snippets import extra_snippets_params, merge_description
from app.services.cancel import run_or_cancel
from app.services.claude_service import CLAUDE_HAIKU_MODEL, call_claude
from app.services.company_filters import DegradeReason, reason_for_status
from app.services.contact_identity import merge_contact_seeds
from app.services.contact_segments import resolve_segment_scope
from app.services.contact_themes import (
    THEME_DICTIONARY_VERSION,
    family_head_scope,
    resolve_theme_scope,
    target_families,
    theme_coverage,
    theme_relaunch_candidates,
    theme_title_match,
)
from app.services.contact_zone import prefer_zone, prefer_zone_seeds
from app.services.web_role_search import merge_web_role_seeds, web_role_search
from app.services.criteria_referential import CRITERIA_WIDEN_MIN_RESULTS
from app.services.current_position import pick_current_position
from app.services.search_hit_employer import account_identity, guard_search_hits
from app.services.enrichment_compliance import without_forbidden_enrichment_fields
from app.services.kill_switch import CONTACTS_AUTO_WIDEN_KILL_SWITCH
from app.services.kill_switch import disabled as _kill_switch_disabled
from app.services.org_anchor import derive_org_anchor
from app.services.person_name_search import search_person_by_name
from app.services.progress import emit_progress
from app.services.rate_limiter import throttle
from app.services.reverse_prospecting import find_reverse_prospects
from app.services.source_health import record_degradation
from app.services.text_norm import normalize_name

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/phase/2", tags=["Phase 2 — Contacts"])

# #2809 (#2293.11, #2294.*) — borne haute d'une découverte fraîche sur UN
# compte. Même rôle que `ANGLE_CANDIDATE_LIMIT` (discover.py) : une sûreté
# d'ingénierie sur la taille de la réponse et le coût fournisseur d'un seul
# geste, pas un fait produit. `search_people_with_status` plafonne déjà une
# page (`max_pages=1` à l'appel) à `APOLLO_SEARCH_PER_PAGE` (100) ; ce plafond
# resserre encore, pour qu'un devis « jusqu'à 25 crédibles » reste lisible à
# l'écran et le crédit débité proportionné à ce qui est réellement montré.
DISCOVER_CONTACTS_MAX_RESULTS = 25

CONTACTS_FALLBACK_SYSTEM = """Tu es un expert en intelligence commerciale B2B.
À partir des résultats de recherche web fournis, identifie les décideurs et contacts clés de l'entreprise cible.
Retourne UNIQUEMENT un JSON valide avec cette structure :
{
  "contacts": [
    {
      "first_name": "Prénom",
      "last_name": "Nom",
      "title": "Titre exact du poste",
      "organization_name": "Entité/filiale",
      "linkedin_url": "URL LinkedIn si trouvée, sinon chaîne vide",
      "city": "Ville si connue",
      "country": "France",
      "source": "brave_search"
    }
  ]
}
Règles :
- Ne retourne QUE des personnes RÉELLES trouvées dans les résultats de recherche
- JAMAIS de données inventées ou fictives
- Privilégie les profils DSI, CTO, Directeur IT, Directeur Digital, RSSI, CDO
- Inclus aussi les dirigeants (DG, PDG, DGA) si trouvés
- Déduplique par nom complet"""

# Below this many Apollo hits, top up with the Brave+Claude fallback. Raised from
# 3 → 5 (env-tunable): with the wide seniority-band default a real account returns
# far more, so this only fires when Apollo is empty/down or the company is tiny.
_MIN_CONTACTS_BEFORE_FALLBACK = int(os.getenv("CONTACTS_MIN_BEFORE_FALLBACK", "5"))

# Sous ce nombre, une recherche PAR TITRES est rejouée en bande de séniorité.
#
# Pourquoi ce garde-fou n'existait pas : la bande large ne s'applique que
# lorsque AUCUN titre n'est posé (Apollo ANDe titres et séniorité, donc les
# combiner re-rétrécit). Un espace dont le profil porte des personas ne pouvait
# donc JAMAIS en bénéficier — et c'est le cas courant.
#
# Pourquoi 25 : mesuré le 28/08/2026 sur les 126 comptes de la base — médiane
# 50 contacts, p25 à 14. Le repli Brave+Claude ne se déclenche que sous 5, si
# bien que **15 % des comptes vivaient entre 5 et 20** : trop peu pour être
# exploitables, trop pour déclencher le secours. 25 couvre cette zone morte avec
# une marge, sans se déclencher sur un compte normalement servi.
#
# Le coût est de la LATENCE, pas des crédits : Apollo People-Search est gratuit
# (seul le dévoilement d'un e-mail est facturé). C'est la même raison qui fait
# déjà repasser la recherche quand une ancre d'org apparaît.
_MIN_CONTACTS_BEFORE_WIDENING = ORG_ANCHOR_THIN_BELOW

# #2290.3 — nombre MAX de familles relancées automatiquement quand une
# recherche générale les trouve non couvertes. Chaque famille = un appel
# People-Search de plus (gratuit en crédits, comme l'élargissement ci-dessus,
# mais coûte de la latence) : borné pour qu'un compte aux 5 familles absentes
# ne déclenche pas 5 appels supplémentaires d'un coup.
#
# #4923.7 (Louis 30/10/2026) : porté de 2 à 6 — la relance ne vise plus « les
# familles non couvertes parmi les 10 » mais les familles CIBLES de la demande
# (``target_families``) qui n'ont pas leur tête (retour Julien Laszlo).
_MAX_AUTO_THEME_RELAUNCH = int(os.getenv("CONTACTS_MAX_AUTO_THEME_RELAUNCH", "6"))
# La MESURE de couverture (2290.2) est toujours calculée sur une recherche
# générale — c'est gratuit, aucun appel réseau de plus. La RELANCE
# automatique (2290.3), elle, coûte jusqu'à _MAX_AUTO_THEME_RELAUNCH appels
# Apollo de plus par recherche générale : sans mesure de coût/latence en
# production pour ce comportement neuf, l'activer par défaut changerait le
# volume d'appels de CHAQUE recherche générale existante. Comme les autres
# clés optionnelles du produit (env-reference.md) : absente = no-op STRICT,
# chemin byte-identique — Louis l'active explicitement quand il le décide.
#
# #4923.7 (Louis 30/10/2026) — REVIREMENT ASSUMÉ : ACTIVE PAR DÉFAUT. Louis l'a
# décidé (« la collecte est poussée au paroxysme ») après le retour de Julien
# Laszlo : sur un grand compte, la relance éteinte laissait Head of Data / Achats /
# DSI groupe introuvables. La variable reste un interrupteur d'ARRÊT : la poser à
# ``false`` éteint la relance (comme la famille « …_DISABLED » plus bas).
_AUTO_THEME_RELAUNCH_ENABLED = os.getenv("CONTACTS_AUTO_THEME_RELAUNCH_ENABLED", "true").lower() != "false"

# #2543.5g — décision Louis 18/09/2026 : une collecte qui reste MINCE (<=
# _MIN_CONTACTS_BEFORE_FALLBACK) même APRÈS le repli web et les amorces du
# registre légal s'élargit UNE FOIS, dans le MÊME run — jamais un cron, jamais
# une relance après la réponse (doctrine « rien n'écrit tout seul » : c'est la
# même collecte qui va plus loin, pas une seconde écriture).
#
# ⚠️ ACTIF PAR DÉFAUT — pas un interrupteur d'allumage. La correction ne
# corrige rien tant qu'elle reste éteinte (ARQUUS : 5 contacts, un rattrapage
# qui ne joue jamais). C'est un COUPE-CIRCUIT, comme le reste de la famille
# « …_DISABLED » de ce dépôt (voir `CONTACTS_SEGMENT_CATCHUP_DISABLED`,
# agent_docs/env-reference.md) : on la pose pour ÉTEINDRE, jamais pour allumer.
# GA-84 (21/09/2026) : la lecture passe par le registre (`kill_switch.disabled`)
# au lieu d'un `os.getenv` direct — sinon cet interrupteur échappe à la
# surface opérateur (`GET /internal/kill-switches`) comme les 23 trouvés au
# balayage du 30/08. Miroir déclaré : `CAPABILITY_KILL_SWITCHES["contacts.auto_widen"]`
# (`kill_switch.py`) et `IA_KILL_SWITCHES` (`common/kill-switches.ts`).
_CONTACTS_AUTO_WIDEN_DISABLED = _kill_switch_disabled(CONTACTS_AUTO_WIDEN_KILL_SWITCH)


class FallbackContact(BaseModel):
    first_name: str = ""
    last_name: str = ""
    full_name: str = ""
    title: str = ""
    organization_name: str = ""
    linkedin_url: str = ""
    city: str = ""
    country: str = "France"
    source: str = "brave_search"


class FallbackContactsOutput(BaseModel):
    contacts: list[FallbackContact] = Field(default_factory=list)


async def _persona_query(client: httpx.AsyncClient, company_name: str, persona: str) -> list[dict]:
    """Une recherche Brave « qui occupe ce poste » pour UN persona.

    Fonction de module (et non plus une fermeture) pour deux raisons : elle passe
    désormais par le limiteur partagé, et un appelant non limité doit pouvoir
    être prouvé par un test — c'est précisément ce qui manquait à #631.

    Débit : ``throttle("brave")``, le MÊME bucket que ``brave_search.py``,
    ``brave_news.py`` et ``data_gateway.py``. Ce chemin-ci tapait
    ``api.search.brave.com`` en direct, hors limiteur, **et en éventail de 5
    personas d'un coup** — la forme #631 exacte, sur une clé payante où le
    dépassement se paie deux fois (429 + quota consommé).

    Toutes les branches d'échec enregistrent la vraie cause : une clé invalide
    (401), un quota épuisé (429) et « personne n'a été nommé à ce poste »
    rendaient le même ``[]``, et les deux premières ne laissaient aucune trace.

    SIG-C (11/10) C5 — JAMAIS cachée : elle rend des noms de personnes, l'arbitrage
    RGPD d'un cache nominatif n'est pas fait (garde ``test_sig_c_persona_non_cachee``).
    """
    api_key = os.environ.get("BRAVE_API_KEY", "")
    try:
        async with throttle("brave"):
            res = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": f"{company_name} {persona} nomination LinkedIn", "count": 10, **extra_snippets_params()},
                headers={"X-Subscription-Token": api_key},
            )
        if res.is_success:
            # LOT (15/10) DATA-A point 7 — chaque recherche persona est payante : au registre de coûts.
            cost_ledger.record("brave_search", "persona_phase2", units=1)
        if not res.is_success:
            logger.warning(
                "Brave persona search failed (status %s) for %r / %r",
                res.status_code,
                company_name,
                persona,
            )
            record_degradation(
                get_correlation_id(),
                source="brave",
                reason=f"recherche persona {persona!r}: HTTP {res.status_code}",
                code=reason_for_status(res.status_code),
            )
            return []
        web = res.json().get("web", {}).get("results", [])
        return [
            {
                "title": r.get("title", ""),
                "description": merge_description(r.get("description", ""), r.get("extra_snippets")),
                "url": r.get("url", ""),
            }
            for r in web
        ]
    except Exception as exc:  # noqa: BLE001 — a persona search must never break the phase
        logger.warning("Brave persona search failed for %r / %r: %s", company_name, persona, exc)
        record_degradation(
            get_correlation_id(),
            source="brave",
            reason=f"recherche persona {persona!r}: {exc}",
            code=DegradeReason.NETWORK_ERROR,
        )
        return []


async def _fallback_brave_claude(company_name: str, personas: list[str], correlation_id: str = "") -> list[dict]:
    """Fallback: use Brave Search + Claude to find contacts when Apollo is unavailable."""
    queries_data = {"personas": personas}
    # Search for decision makers via Brave
    brave_results = await brave_search(company_name, queries_data)

    if not brave_results:
        return []

    # Also search specifically for key people — one query per persona, run
    # concurrently (F4: was a serial await-per-persona loop, ~5× slower).
    async with httpx.AsyncClient(timeout=30.0) as client:
        persona_lists = await asyncio.gather(
            *(_persona_query(client, company_name, p) for p in personas[:5])
        )
    people_results = [r for lst in persona_lists for r in lst]

    all_results = brave_results + people_results
    results_str = json.dumps(all_results[:40], ensure_ascii=False)

    user_prompt = (
        f"Entreprise cible : {company_name}\n"
        f"Personas recherchés : {', '.join(personas)}\n\n"
        f"Résultats de recherche web :\n{results_str}"
    )

    # No explicit max_tokens override: this is the only contact-discovery
    # path on plans without Apollo master-key access, so it has to surface
    # the full list of decision-makers Claude finds in the Brave snippets.
    # 8k truncated to ~25 contacts on rich accounts — the service default
    # (16384) lifts that cap. See DEFAULT_MAX_TOKENS in claude_service.
    # Fallback also does structured extraction from web snippets, no
    # strategic reasoning → Haiku 4.5 is sufficient and much cheaper.
    result, usage = await call_claude(
        CONTACTS_FALLBACK_SYSTEM, user_prompt, response_model=dict,
        model=CLAUDE_HAIKU_MODEL,
        prompt_name="bellum_contacts_fallback", correlation_id=correlation_id,
        domain_knowledge=True,
    )
    parsed = FallbackContactsOutput.model_validate(result)
    return [c.model_dump() for c in parsed.contacts]


def _apollo_details(hit: ApolloSearchHit) -> dict[str, Any]:
    """The rich (free) People-Search fields, camelCased for the seed's
    ``apolloDetails`` so the dashboard shows the maximum per contact."""
    details: dict[str, Any] = {}
    if hit.organization_name:
        details["organization"] = hit.organization_name
    if hit.seniority:
        details["seniority"] = hit.seniority
    if hit.headline:
        details["headline"] = hit.headline
    if hit.departments:
        details["departments"] = hit.departments
    if hit.functions:
        details["functions"] = hit.functions
    if hit.employment_history:
        details["employmentHistory"] = hit.employment_history
    # Availability flags (always emitted, even False) — the web shows an « email
    # dispo » badge before a credit is spent, and the auto-enrich targets only
    # contacts Apollo says actually have an email. Rides raw_data.apolloDetails
    # (jsonb, additionalProperties) — no DB migration, no contract change.
    details["hasEmail"] = hit.has_email
    details["hasPhone"] = hit.has_phone
    # #3911.1 — seulement émis quand VRAI : une absence de clé reste le
    # comportement historique (apolloDetails sans ce champ), jamais un
    # "employerUnverified: false" qui laisserait croire à une vérification
    # positive qu'on n'a pas faite.
    if hit.employer_unverified:
        details["employerUnverified"] = True
    return details


def _drop_out_of_scope_hits(
    hits: list[ApolloSearchHit], out_of_scope_names: list[str]
) -> tuple[list[ApolloSearchHit], list[str]]:
    """Remove Apollo hits whose org is a known out-of-scope entity (Théo: a contact
    from SGTM / SG Côte d'Ivoire must not enter the dossier). Exact normalized-name
    match only — conservative so the target company's own contacts are never
    dropped.

    Returns the kept hits and the ORG LABEL of each removed hit (original
    spelling, one entry per dropped contact — so ``len()`` is the count). The
    labels are what the dossier owes the rep: a stock that silently shrinks reads
    as a broken search, whereas « 3 écartés — SGTM, SG Côte d'Ivoire » reads as
    the perimeter doing its job."""
    banned = {normalize_name(n) for n in out_of_scope_names if n}
    banned.discard("")
    if not banned:
        return hits, []
    kept: list[ApolloSearchHit] = []
    dropped: list[str] = []
    for hit in hits:
        label = hit.organization_name or ""
        if normalize_name(label) in banned:
            dropped.append(label)
        else:
            kept.append(hit)
    return kept, dropped


def _out_of_scope_summary(dropped_labels: list[str]) -> dict[str, Any]:
    """Per-entity breakdown of the contacts dropped for being out of perimeter:
    ``{"dropped": 3, "entities": [{"name": "SGTM", "count": 2}, …]}``.

    Sorted by count desc then name, so two runs over the same data produce the
    same object (a stable dossier diff). Unnamed orgs are counted in ``dropped``
    but carry no entity row — we never invent a label for them."""
    counts: dict[str, int] = {}
    for label in dropped_labels:
        name = (label or "").strip()
        if not name:
            continue
        counts[name] = counts.get(name, 0) + 1
    entities = [
        {"name": name, "count": count}
        for name, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    return {"dropped": len(dropped_labels), "entities": entities}


def _drop_unreachable_hits(hits: list[ApolloSearchHit]) -> tuple[list[ApolloSearchHit], int]:
    """Remove Apollo hits nobody could ever contact.

    Apollo's FREE search tier states up front whether a work email or a direct
    phone EXISTS behind the paywall (``has_email`` / ``has_direct_phone``). A hit
    with neither flag and no LinkedIn URL cannot be reached through any channel we
    have — keeping it would pad the org chart with rows the rep can only look at.
    Costs nothing to check: the flags ride the same free response.

    Only hits that CARRY Apollo flags are judged. A seed from another source
    (Pappers legal reps, Brave web hits) has no flags at all, and a full name is
    already an identity — those are the backbone of the org chart and are kept.

    Returns the kept hits and how many were dropped.
    """
    kept: list[ApolloSearchHit] = []
    dropped = 0
    for hit in hits:
        reachable = hit.has_email or hit.has_phone or bool(hit.linkedin_url.strip())
        # A real surname means the contact is nameable without Apollo (registry /
        # web source): judging it on Apollo's flags would drop it for a reason that
        # does not apply to it.
        apollo_only = not hit.last_name.strip()
        if reachable or not apollo_only:
            kept.append(hit)
        else:
            dropped += 1
    return kept, dropped


def _collected_contacts_payload(seeds: list[dict[str, Any]], reverse: list[Any]) -> dict[str, Any]:
    """La SORTIE de la phase 2 — le seul endroit où les graines quittent ce routeur.

    #2297 (décision Louis 19/09/2026, point 2) : le catalogue des champs
    interdits de l'enrichissement s'applique aussi à la COLLECTE. Filtré ICI,
    une fois, à toute profondeur — le parcours recopie du brut fournisseur, et
    un repli par modèle peut glisser n'importe quelle clé. Le catalogue vit dans
    le contrat (`enrichment-compliance.ts`) ; `enrichment_compliance.py` en est
    le miroir gardé par un test d'égalité. L'API refiltre à l'entrée de
    `bulkInsert` : c'est elle qui tient la base."""
    contacts = without_forbidden_enrichment_fields(seeds)
    return {
        "contacts": contacts,
        "count": len(contacts),
        "reverseProspects": without_forbidden_enrichment_fields(reverse),
    }


def _hit_title(hit: ApolloSearchHit) -> str | None:
    picked = pick_current_position(hit.employment_history, hit.organization_name)
    return (str(picked["title"]).strip() if picked else "") or hit.title or None


def _apollo_hit_to_seed(hit: ApolloSearchHit) -> dict[str, Any]:
    """Normalise an Apollo People-Search hit into the camelCase wire shape the
    API service expects (``AnalysisContactSeed``)."""
    full_name = f"{hit.first_name} {hit.last_name}".strip()
    seed: dict[str, Any] = {
        "fullName": full_name,
        # #4465 — la fonction est l'expérience EN COURS chez l'employeur, pas le titre brut du fournisseur.
        "title": _hit_title(hit),
        "linkedinUrl": hit.linkedin_url or None,
        "photoUrl": hit.photo_url or None,
        "city": hit.city or None,
        "country": hit.country or None,
        "source": "apollo",
        # Apollo person id — the reliable enrich key once the search tier has
        # obfuscated the last name. Persisted so the "Enrichir" button / auto
        # top-decider enrich can People-Match BY ID instead of a doomed name+org.
        "apolloId": hit.id or None,
    }
    # Masked surname — only meaningful while the real one is unknown. Emitted just
    # in that case so the UI shows "Séverine M." instead of "Séverine", and never
    # hides a surname we already hold.
    if hit.last_name_obfuscated and not hit.last_name:
        seed["lastNameObfuscated"] = hit.last_name_obfuscated
    details = _apollo_details(hit)
    if details:
        seed["apolloDetails"] = details
    return seed


def _fallback_contact_to_seed(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalise a Brave+Claude fallback contact (untyped dict from the LLM)
    into the same camelCase wire shape."""
    full_name = (raw.get("full_name") or "").strip()
    if not full_name:
        first = (raw.get("first_name") or "").strip()
        last = (raw.get("last_name") or "").strip()
        full_name = f"{first} {last}".strip()
    return {
        "fullName": full_name,
        "title": raw.get("title") or None,
        "linkedinUrl": raw.get("linkedin_url") or None,
        "city": raw.get("city") or None,
        "country": raw.get("country") or None,
        "source": raw.get("source") or "brave_search",
    }


# Buying-committee titles to target when the ESN profile carries no personas.
# Without a title filter, Apollo returns the company's generically "top" people —
# e.g. Data Scientists at a data-heavy company like Doctolib — instead of the
# buying-committee deciders an ESN actually needs.
#
# This list deliberately spans the WHOLE committee, not just IT: a pure-IT title
# list makes every discovered contact a TECHNICAL_BUYER (seen on the Vinci run —
# 27/27 classified contacts all `technical`, zero economic/procurement), which
# breaks §4 role coverage and the multi-thread plays (§5). So we seed the four
# actionable roles (03_BUSINESS_RULES §4): TECHNICAL (DSI/CTO/RSSI), ECONOMIC
# (DAF/Directeur Financier), PROCUREMENT (Directeur Achats), and CHAMPION/exec
# sponsors (DG, Directeur Transformation). ``decision_role.py`` then classifies
# each into its canonical role. A profile's own personas still override this.
_DEFAULT_DECIDER_TITLES = [
    # TECHNICAL — validate the solution, own the stack.
    "DSI",
    "Directeur des Systèmes d'Information",
    "CTO",
    "Directeur Technique",
    "RSSI",
    "Directeur Digital",
    # ECONOMIC — hold the budget / arbitrate. "Directeur des Achats" reads as
    # economic (budget authority) in decision_role.py, distinct from the
    # procurement gate below.
    "Directeur Financier",
    "DAF",
    "Directeur des Achats",
    # PROCUREMENT — the referencing / sourcing gatekeeper. No "IT" in the title:
    # it would trip the is_it_decider gate and mis-read as TECHNICAL.
    "Responsable Achats",
    # CHAMPION / executive sponsors — carry the deal internally.
    "Directeur de la Transformation",
    "Directeur Général",
]


# Management-layer seniority bands for the WIDE default search (no personas / no
# scope). Apollo's ``person_seniorities`` filter returns everyone from manager up
# across ALL functions (IT, finance, achats, métiers) — hundreds at a large
# account — while excluding individual contributors / interns (the source of the
# old "Apollo returns whoever the company has most of, e.g. Data Scientists" skew
# a bare no-filter search caused). Env tunes it (comma-separated); default spans
# owner→manager. This is THE lever that turns 8-10 contacts into hundreds, and it
# is FREE (People-Search bills no per-contact credit — only email reveal does).
_DEFAULT_DECIDER_SENIORITIES = [
    "owner",
    "founder",
    "c_suite",
    "partner",
    "vp",
    "head",
    "director",
    "manager",
]


# #4923.2 — la passe « dirigeants » : les quatre strates qui portent un rôle de tête.
_LEADERSHIP_SENIORITIES = ["c_suite", "vp", "head", "director"]


def _default_seniorities() -> list[str]:
    raw = os.getenv("APOLLO_DEFAULT_SENIORITIES", "")
    if raw.strip():
        return [s.strip() for s in raw.split(",") if s.strip()]
    return list(_DEFAULT_DECIDER_SENIORITIES)


# The wide seniority-band search used to stop at 5 pages (500 people). Apollo held
# 1379 for Dassault Aviation, so a third of the management layer never reached the
# dossier — for no gain: People-Search bills no per-contact credit, and the
# pagination loop already stops the moment `page × per_page >= total`. The only
# bound left is the shared safety ceiling (``apollo.APOLLO_SEARCH_MAX_PAGES``,
# 50 pages) which exists for accounts Apollo never stops paginating. Downstream
# cost is unchanged: the LLM buying-committee pass still takes the top ~50, the
# rest ship as name/title seeds that fill the org chart for free.


def _default_search_targeting(profile_data: dict) -> tuple[list[str] | None, list[str] | None]:
    """(titles, seniorities) for the no-scope default search.

    The profile's own ``personas`` target precise titles (we know what the ESN
    sells). WITHOUT them, go WIDE by seniority band (the whole management layer)
    rather than the short IT decider title list — so a large account surfaces the
    hundreds of deciders Apollo holds, not the ~10 with an exact title. Mirrors the
    no-scope branch of ``_contacts``. A title filter is NEVER combined with the
    bands (Apollo ANDs them → re-narrows)."""
    personas = profile_data.get("personas") or None
    if personas:
        return personas, None
    return None, _default_seniorities()


async def prefetch_apollo_hits(
    company_name: str,
    profile_data: dict,
    organization_domains: list[str] | None = None,
) -> list[ApolloSearchHit]:
    """Run the FREE Apollo People-Search up-front, off the critical path.

    The graph kicks this off CONCURRENTLY with the (longer) research phase and
    hands the hits to Phase 2 via ``ContactsRequest.prefetched_hits`` — removing
    Apollo's ~5-40s latency from the pipeline. Replicates the wide, no-scope
    search ``contacts_node`` would otherwise run live: personas as titles when the
    profile carries them, else a wide seniority-band search (no title filter).

    ``organization_domains`` (#1101/#1102) : le domaine du compte est connu dès
    t=0 quand il a déjà été analysé, et c'est une ancre d'org EXACTE là où le nom
    est un rapprochement flou. La passer ici ancre le chemin RAPIDE sans coûter
    une milliseconde de plus ; la repasse ancrée de ``_contacts`` ne sert alors
    que de filet quand le domaine n'était pas encore connu. Absente = recherche
    par nom, comportement historique à l'octet près.
    """
    domains = [d.strip() for d in (organization_domains or []) if d and d.strip()] or None
    titles, seniorities = _default_search_targeting(profile_data)
    if titles is None:
        # Wide seniority-band search — the whole management layer, uncapped.
        return await search_people(
            company_name=company_name,
            person_titles=None,
            locations=None,
            seniorities=seniorities,
            organization_domains=domains,
        )
    return await search_people(
        company_name=company_name,
        person_titles=titles,
        locations=None,
        seniorities=None,
        organization_domains=domains,
    )


async def _past_employer_seeds(
    organization_domains: list[str],
    *,
    person_titles: list[str] | None,
    seniorities: list[str] | None,
) -> list[dict[str, Any]]:
    """Les graines de la passe past-employer (#1611.6), dans la forme des autres.

    Best-effort au sens STRICT : une panne d'Apollo ici ne doit pas coûter un
    dossier. Le `try` entoure donc l'appel ET la mise en forme — la porte plus
    étroite que son flux est un défaut déjà payé ici (une normalisation qui
    jette hors du `try` a fait tomber toute une analyse le 11/09).
    """
    if not organization_domains:
        return []
    try:
        hits = await search_past_employees(
            organization_domains,
            person_titles=person_titles,
            seniorities=seniorities,
        )
        return [_apollo_hit_to_seed(hit) for hit in hits]
    except Exception as exc:  # noqa: BLE001 — aucune panne de cette passe n'annule un dossier
        logger.warning("Past-employer pass failed (reverse prospects stay empty): %s", exc)
        return []


#: #4622 — les pannes de fournisseur de contacts qui ne doivent JAMAIS tuer l'analyse.
#: Le vocabulaire est celui d'``ApolloSearchStatus`` : ses propres commentaires classent
#: 5xx/réseau et 429 en « recoverable », l'authentification et le plan en « terminal ».
#: Clé absente = no-op strict (doctrine du dépôt), donc récupérable elle aussi.
_PANNES_RECUPERABLES = frozenset(
    {
        ApolloSearchStatus.DOWN.value,
        ApolloSearchStatus.RATE_LIMITED.value,
        ApolloSearchStatus.UNCONFIGURED.value,
    }
)


def _degrade_ou_releve(exc: ApolloUnavailableError, outcome: SearchOutcome) -> None:
    """#4622 (« l'audit à fail », Louis 26/10) — une panne de la source de contacts
    faisait tomber TOUTE l'analyse : « Analysis failed in phase contacts: HTTPException:
    500: Apollo down ». Deux défauts dans une seule ligne — le dossier entier était perdu
    pour une phase, et le nom de NOTRE fournisseur s'affichait au client (doctrine : on
    nomme ce que l'espace a branché, jamais ce qui nous sert).

    Désormais : une panne RÉCUPÉRABLE dégrade la phase — la recherche rend zéro résultat,
    ``sourceStatus`` DIT pourquoi (jamais un « 0 contact » qui mentirait, GA-18/19), et
    l'analyse va à son terme. Un refus d'authentification ou de plan reste terminal :
    c'est une configuration à réparer, pas un aléa.
    """
    if exc.reason not in _PANNES_RECUPERABLES:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    # Les trois raisons récupérables SONT des membres de l'énumération (c'est elle qui les
    # a produites) : la conversion ne peut pas échouer ici, et un statut inconnu serait
    # déjà parti dans la branche terminale ci-dessus plutôt que d'être deviné.
    if outcome.status is None:
        outcome.status = ApolloSearchStatus(exc.reason)
    logger.warning(
        "contacts : source indisponible (%s) — la phase dégrade, l'analyse continue", exc.reason
    )


def checked_entity_passes(checked: list[str], company: str) -> list[str]:
    """Lot 757 — les noms d'entités cochées à chercher EN PLUS du compte : sans doublon, sans le compte lui-même,
    seize au plus (décision du 10/10)."""
    seen = {company.strip().casefold()}
    out: list[str] = []
    for name in checked:
        clean = str(name or "").strip()
        if clean and clean.casefold() not in seen:
            seen.add(clean.casefold())
            out.append(clean)
    return out[:16]


async def _contacts(req: ContactsRequest) -> ContactsResponse:
    """Phase 2 business logic — extracted so the router can wrap it in
    ``run_or_cancel`` for client-disconnect handling."""
    personas = req.profile_data.get("personas", [])
    # S6 re-run scope: narrow the search to one segment (a persona/role, a BU, a
    # geography, a seniority band) without redoing the whole analysis. Empty scope
    # == the current wide search.
    scope = req.scope
    # Theme re-run (retour Thales) : a free-text theme (cyber, achats, MLOps, DSI
    # France…) expands into Apollo titles / seniorities / geographies so the user
    # relance une brique ciblée. Explicit scope fields still win over the preset.
    _theme_scope = resolve_theme_scope(scope.theme) if (scope and scope.theme) else None
    # #2290.4-.8 — la provenance du thème (famille, terme direct, chemin,
    # version du dictionnaire), rendue sur chaque contact que CETTE recherche
    # trouve. ``None`` pour une recherche non thématisée : on n'invente pas un
    # chemin qu'on n'a pas (absence = non mesuré, jamais un 0 — GA-18/19).
    _theme_match: dict[str, Any] | None = _theme_scope["match"] if _theme_scope else None
    # Rerun ciblé par case de la matrice de couverture (annexe organigramme §6) :
    # « Cyber × N-1 » → les titres réels de cette case ; un niveau seul → la bande
    # de séniorités Apollo. Vient APRÈS le thème dans la précédence : un thème est
    # une demande plus explicite que la case cliquée.
    _segment_scope = (
        resolve_segment_scope(scope.family, scope.level) if (scope and (scope.family or scope.level)) else None
    )

    def _scoped(field: str) -> list | None:
        """Explicit scope list wins, else the theme preset, else the family/level
        segment, else None (wide)."""
        explicit = getattr(scope, field) if scope else None
        return (
            explicit
            or (_theme_scope.get(field) if _theme_scope else None)
            or (_segment_scope.get(field) if _segment_scope else None)
        )

    company = (scope.entity if scope and scope.entity else "") or req.company_name
    # Targeting precedence: explicit scope titles win, else the theme preset, else
    # the profile's personas. When NONE of those narrow the search, go WIDE by
    # seniority band (the whole management layer) instead of a short IT title list —
    # a large account (SNCF…) then yields the hundreds of directors/VPs Apollo
    # holds, not the ~10 people with one of a dozen exact French titles (the root
    # cause of the 8-10-contacts symptom). A title filter is never combined with
    # the bands (Apollo ANDs them → re-narrows). See _DEFAULT_DECIDER_SENIORITIES.
    # Un rerun « niveau seul » (N-1, L2…) veut TOUTE la strate : les personas du
    # profil ne doivent pas se recombiner en filtre de titres, sinon Apollo ANDe
    # titres et bande de séniorité et on retombe sur une poignée de titres exacts.
    _segment_seniorities = bool(_segment_scope and _segment_scope.get("seniorities"))
    _explicit_titles = _scoped("titles")
    person_titles = _explicit_titles or (None if _segment_seniorities else personas) or None
    locations = _scoped("geographies")
    seniorities = _scoped("seniorities") or (None if person_titles else _default_seniorities())
    cb = req.progress_callback

    # Latency optimization — "Apollo contacts prefetch". When the graph already
    # ran the (FREE) People-Search concurrently with research, use its hits and
    # skip the live call. ``None`` = no prefetch → search live; an empty list is a
    # genuine 0-hit prefetch (still skip the search, let the < 3 fallback run).
    # Les ancres d'org (#1101/#1102) : l'id Apollo du compte, sinon son domaine.
    # Apollo les ANDe avec le nom ; c'est ce qui distingue « les gens de CETTE
    # société » d'« un rapprochement flou sur un libellé ».
    _org_ids = [i.strip() for i in req.organization_ids if i and i.strip()]
    _org_domains = [d.strip() for d in req.organization_domains if d and d.strip()]
    # C.2 (Cédric 20/10) — « Agrandir la recherche » part de l'API avec le seul
    # ``profile_data`` (= raw_analysis) : sans ancre explicite, on dérive celle du
    # run complet (``apolloEnrichment``, sinon le site du compte) au lieu de
    # chercher par libellé seul (log prod : org_ids=0 org_domains=0).
    _org_anchor_source = "explicit" if (_org_ids or _org_domains) else "none"
    if not (_org_ids or _org_domains):
        _profile = req.profile_data or {}
        _profile_research = _profile.get("research") if isinstance(_profile.get("research"), dict) else {}
        _anchor = derive_org_anchor(
            _profile.get("apolloEnrichment") or _profile_research.get("apolloEnrichment"),
            _profile.get("website") or _profile_research.get("website"),
        )
        _org_ids = _anchor.organization_ids
        _org_domains = _anchor.organization_domains
        _org_anchor_source = _anchor.source
    logger.info("Contacts org_anchor_source=%s", _org_anchor_source)
    _has_anchor = bool(_org_ids or _org_domains)
    # #2290.4-.8 — provenance par contact, indexée sur l'identité Apollo la plus
    # sûre disponible (même clé que ``_merge_hits`` : id, puis LinkedIn, puis
    # nom+fonction). Une seule notion (GA-26), posée par passe de recherche.
    _provenance_by_hit: dict[str, dict[str, Any]] = {}
    search_kwargs: dict[str, Any] = {
        "company_name": company,
        "person_titles": person_titles,
        "locations": locations,
        "seniorities": seniorities,
        "organization_ids": _org_ids or None,
        "organization_domains": _org_domains or None,
    }
    # #2543.5a — l'état de la source + la population qu'elle ANNONCE pour la
    # recherche PRIMAIRE (celle qui décide si le compte est mince), rempli par
    # ``search_people`` lui-même via son out-param. Reste à ses défauts (None,
    # None = non mesuré) quand aucune recherche live ne part cette requête-ci
    # (préchargement seul, sans ancre à repasser) — jamais un « ok » deviné.
    _source_outcome = SearchOutcome()
    if req.prefetched_hits is not None:
        apollo_hits: list[ApolloSearchHit] = list(req.prefetched_hits)
        # Le préchargement tourne EN PARALLÈLE de la phase 1, donc AVANT que
        # l'identité Apollo du compte ne soit résolue : il ne peut chercher que
        # par nom. Quand la recherche a depuis rendu une ancre, on repasse et on
        # FUSIONNE — People-Search ne facture aucun crédit par contact, la seule
        # dépense est de la latence, et c'est la différence entre « un contact »
        # et la vraie strate de direction. Sans ancre, repasser ne ferait que
        # rejouer la même recherche : on s'en abstient.
        if _has_anchor:
            try:
                _live_hits = await search_people(**search_kwargs, outcome=_source_outcome)
            except ApolloUnavailableError as exc:
                _degrade_ou_releve(exc, _source_outcome)  # #4622
                _live_hits = []
            except ValueError as exc:
                raise HTTPException(status_code=500, detail=str(exc)) from exc
            if _theme_match:
                for _h in _live_hits:
                    _provenance_by_hit.setdefault(_hit_identity(_h), dict(_theme_match))
            apollo_hits = _merge_hits(apollo_hits, _live_hits)
    else:
        try:
            apollo_hits = await search_people(**search_kwargs, outcome=_source_outcome)
        except ApolloUnavailableError as exc:
            _degrade_ou_releve(exc, _source_outcome)  # #4622
            apollo_hits = []
        except ValueError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        if _theme_match:
            for _h in apollo_hits:
                _provenance_by_hit.setdefault(_hit_identity(_h), dict(_theme_match))

    # ÉLARGISSEMENT — un filtre de titres qui ne rend presque rien se rejoue en
    # bande de séniorité, et les deux jeux fusionnent.
    #
    # Mesuré sur SAFRAN AIRCRAFT ENGINES (#1189) : 8 contacts en 228 ms, un seul
    # appel, aucune pagination. Apollo avait résolu le GROUPE (~92 000 personnes)
    # et le filtre de titres l'a ramené à 8 — le « 8-10-contacts symptom » que le
    # commentaire ci-dessus nomme déjà, mais que la bande large ne pouvait pas
    # rattraper puisqu'elle ne s'applique qu'en l'ABSENCE de titres.
    #
    # On ne combine pas les deux dans un même appel (Apollo les ANDe, ce qui
    # re-rétrécit) : c'est une seconde requête, titres retirés, bande posée.
    # ⚠️ JAMAIS quand l'utilisateur a posé LUI-MÊME les titres. Un rerun « la
    # famille Data au niveau N-1 » est une DEMANDE, pas un défaut de ciblage :
    # l'élargir rendrait toute la strate de direction et contredirait en silence
    # ce qui vient d'être demandé. On ne rattrape que le défaut IMPLICITE — les
    # personas du profil, qui s'appliquent sans que personne les ait choisies
    # pour ce compte-là.
    #
    # #4923.2 (Louis 30/10/2026) — REVIENT SUR le seuil : les personas du profil ne
    # filtrent plus seules. La passe « dirigeants » (c_suite, vp, head, director,
    # SANS titres) part TOUJOURS après une recherche personas, et les deux jeux
    # fusionnent — sur un grand compte, l'id rend déjà ≥ 25 personnes au titre exact
    # et le Head of Data / CDO n'a jamais un titre de persona (retour L'Oréal,
    # Decathlon, AXA). Le seuil ne conditionne plus la passe ; il reste le seuil
    # de l'ancrage (``ORG_ANCHOR_THIN_BELOW``, apollo.py).
    if person_titles and not _explicit_titles:
        logger.info(
            "Apollo returned %d contact(s) with the persona title filter for '%s' — "
            "always adding the leadership pass (c_suite/vp/head/director)",
            len(apollo_hits),
            req.company_name,
        )
        try:
            widened = await search_people(
                **{**search_kwargs, "person_titles": None, "seniorities": _LEADERSHIP_SENIORITIES},
                # #4923.9 — passe « rôles de tête » : TOUTES les ancres, fusionnées.
                exhaust_anchors=True,
            )
        except ApolloUnavailableError as exc:
            _degrade_ou_releve(exc, _source_outcome)  # #4622
            widened = []
        except ValueError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        # #2290.8 — cette passe retire le filtre de titres : un résultat qui n'en
        # vient JAMAIS présenté comme une correspondance exacte, même quand un
        # thème avait ciblé la recherche initiale.
        for _h in widened:
            _provenance_by_hit.setdefault(
                _hit_identity(_h),
                {
                    "family": _theme_match["family"] if _theme_match else None,
                    "matchedTerm": None,
                    "matchedVia": "widened_seniority_band",
                    "sectorAssociation": None,
                    "excludedAsFauxAmi": None,
                    "dictionaryVersion": THEME_DICTIONARY_VERSION,
                    "widened": True,
                },
            )
        apollo_hits = _merge_hits(apollo_hits, widened)

    # #2290.2/.3 — après une recherche vraiment GÉNÉRALE (aucun thème, aucun
    # segment, aucun titre explicite posé par l'appelant), mesurer quelles
    # familles cette recherche a su trouver et relancer spécifiquement celles
    # qui ne le sont pas — jamais celles simplement "non mesurées" (une
    # recherche vide ne relance rien : GA-18/19).
    _is_general_search = not (_theme_scope or _segment_scope or _explicit_titles)
    _theme_coverage_result: dict[str, Any] | None = None
    if _is_general_search:
        _preliminary_seeds = [_apollo_hit_to_seed(h) for h in apollo_hits]
        _theme_coverage_result = theme_coverage(_preliminary_seeds)
        # #4923.1/.7/.8 — la relance vise les familles CIBLES de la demande (profil de
        # l'ESN, scope, secteur du compte + socle comité d'achat) qui n'ont pas leur
        # TÊTE — pas les 10. Sans ancre, on relance par nom (``company``) : la
        # relance ne dépend plus de ``_has_anchor``.
        _profile_for_targets = req.profile_data or {}
        _account_sector = next(
            (
                str(_profile_for_targets[k])
                for k in ("sector", "secteur", "industry", "accountSector")
                if isinstance(_profile_for_targets.get(k), str) and _profile_for_targets.get(k)
            ),
            None,
        )
        _targets = target_families(_profile_for_targets, scope, _account_sector)
        _undercovered = theme_relaunch_candidates(_theme_coverage_result, _targets)
        if _undercovered and _AUTO_THEME_RELAUNCH_ENABLED:
            for _family in _undercovered[:_MAX_AUTO_THEME_RELAUNCH]:
                # La relance cherche D'ABORD les rôles de tête (#4923.7).
                _family_scope = family_head_scope(_family)
                if not _family_scope:
                    continue
                logger.info(
                    "Family '%s' has no head role in the general search for '%s' — "
                    "launching a head-role relaunch (anchored=%s)",
                    _family,
                    req.company_name,
                    _has_anchor,
                )
                try:
                    _relaunch_hits = await search_people(
                        company_name=company,
                        person_titles=_family_scope["titles"] or None,
                        # #2655.1 — cette passe reconstruisait ses propres kwargs et
                        # figeait `locations` à `None`, jetant une géographie que le
                        # commercial avait explicitement posée au scope (S6 re-run,
                        # `geographies` ci-dessus) : la recherche primaire ET la
                        # passe d'élargissement (qui réutilisent `search_kwargs`) la
                        # respectaient déjà — seule celle-ci la perdait.
                        locations=locations,
                        seniorities=_family_scope["seniorities"] or None,
                        organization_ids=_org_ids or None,
                        organization_domains=_org_domains or None,
                        # #4923.9 — les entités du groupe : toutes les ancres, fusionnées.
                        exhaust_anchors=True,
                    )
                except ApolloUnavailableError as exc:
                    # Best-effort au sens STRICT (comme la passe past-employer) : la
                    # relance est un BONUS sur des contacts déjà trouvés — sa panne,
                    # même terminale (clé absente), ne coûte jamais le dossier.
                    logger.warning("Head-role relaunch '%s' skipped: source unavailable (%s)", _family, exc.reason)
                    continue
                except ValueError:
                    continue
                # #2290.8 — une famille entière RETROUVÉE par une relance
                # automatique n'est pas un terme direct/synonyme exact : elle
                # est élargie, et le dit.
                for _h in _relaunch_hits:
                    _provenance_by_hit.setdefault(
                        _hit_identity(_h),
                        {
                            "family": _family,
                            "matchedTerm": None,
                            "matchedVia": "family",
                            "sectorAssociation": None,
                            "excludedAsFauxAmi": None,
                            "dictionaryVersion": THEME_DICTIONARY_VERSION,
                            "widened": True,
                        },
                    )
                apollo_hits = _merge_hits(apollo_hits, _relaunch_hits)

    # Lot 757 (arbitrage Louis 31/10) — le commercial a COCHÉ des entités du groupe dans le sélecteur de
    # périmètre : une passe par entité, à son nom tel que le registre le publie, fusionnée aux autres. Chaque
    # contact ainsi trouvé porte l'entité qui l'a fait venir. People-Search ne facture rien : seule la latence
    # coûte. Best-effort STRICT : une source en panne n'ôte rien à ce qui est déjà trouvé. Sans case cochée,
    # aucun appel de plus.
    _checked = checked_entity_passes(req.checked_entities, company)
    for _entity in _checked:
        try:
            _entity_hits = await search_people(
                company_name=_entity,
                person_titles=person_titles,
                locations=locations,
                seniorities=seniorities,
                organization_ids=None,
                organization_domains=None,
            )
        except ApolloUnavailableError as exc:
            logger.warning("Checked-entity pass '%s' skipped: source unavailable (%s)", _entity, exc.reason)
            continue
        except ValueError:
            continue
        for _h in _entity_hits:
            _provenance_by_hit.setdefault(
                _hit_identity(_h),
                {
                    "family": None,
                    "matchedTerm": None,
                    "matchedVia": "checked_entity",
                    "entity": _entity,
                    "sectorAssociation": None,
                    "excludedAsFauxAmi": None,
                    "dictionaryVersion": THEME_DICTIONARY_VERSION,
                    "widened": False,
                },
            )
        apollo_hits = _merge_hits(apollo_hits, _entity_hits)

    # Drop hits whose org is an out-of-scope entity (SGTM, SG Côte d'Ivoire…): a
    # contact from a bad-scope BU must never enter the dossier (Théo). Exact
    # normalized-name match only — conservative, never touches the target org.
    apollo_hits, _dropped_oos = _drop_out_of_scope_hits(
        apollo_hits, [e for e in req.out_of_scope_entities if e not in set(_checked)]
    )
    if _dropped_oos:
        logger.info("Dropped %d out-of-scope contact(s) for '%s'", len(_dropped_oos), req.company_name)

    # #4928.1 — l'employeur de CHAQUE résultat (toutes les passes : générale, élargie, relance, préchargement) doit
    # être celui du compte ou de son groupe ; sinon écarté avec sa raison, compté et journalisé (jamais en silence).
    apollo_hits, _dropped_employer = guard_search_hits(
        apollo_hits, account_identity(company, _org_ids, _org_domains, req.profile_data or {}, extra_names=_checked)
    )
    if _dropped_employer:
        logger.info(
            "Dropped %d contact(s) with %s for '%s': %s",
            len(_dropped_employer),
            _dropped_employer[0][1],
            req.company_name,
            sorted({h.organization_name or "?" for h, _ in _dropped_employer})[:10],
        )

    # Then drop the ones no channel could ever reach (no email, no phone, no
    # LinkedIn). Apollo says so for free, before a single credit is spent.
    apollo_hits, _dropped_unreachable = _drop_unreachable_hits(apollo_hits)
    if _dropped_unreachable:
        logger.info(
            "Dropped %d unreachable contact(s) (no email/phone/LinkedIn) for '%s'",
            _dropped_unreachable,
            req.company_name,
        )

    await emit_progress(cb, "contacts", "decision_makers", 55, f"{len(apollo_hits)} contacts found")

    # LUD.6 — le compte a été ouvert depuis une zone : ses décideurs passent devant (préférence, rien exclu).
    _preferred_zone = req.preferred_zone or list((req.profile_data or {}).get("contactZone") or [])
    if _preferred_zone:
        apollo_hits = prefer_zone(apollo_hits, _preferred_zone)
    seeds: list[dict[str, Any]] = [_apollo_hit_to_seed(h) for h in apollo_hits]
    # #2290.4-.8 — chaque résultat porte le CHEMIN qui l'a trouvé, quand on le
    # connaît. Absent = non mesuré (recherche non thématisée), jamais un défaut
    # inventé.
    for _seed, _hit in zip(seeds, apollo_hits, strict=True):
        _prov = _provenance_by_hit.get(_hit_identity(_hit))
        if _prov:
            _seed["matchProvenance"] = _prov

    # Fallback: if Apollo returns too few contacts, enrich with Brave+Claude.
    # This keeps the output exploitable when Apollo is empty OR sparse.
    # #2543.2 — comparaison INCLUSIVE (<=, pas <) : ARQUUS s'arrête à
    # EXACTEMENT 5 contacts (mesuré le 18/09/2026), donc le repli ne se
    # déclenchait jamais pour ce compte pile sur le seuil.
    fallback_count = 0
    # #2543.5b — le repli se RAPPORTE : tenté ou non, combien trouvés, et un
    # échec NOMMÉ quand `_fallback_brave_claude` lève (l'``except`` ci-dessous
    # continue de journaliser — la collecte ne doit jamais crasher dessus — mais
    # n'avale plus le fait qu'il ait échoué : `_fallback_failure` le porte
    # jusqu'à la réponse). `foundCount` reste `None` tant que le repli n'a pas
    # ABOUTI (pas tenté, ou tenté et levé) — jamais un 0 pour du non mesuré.
    _fallback_attempted = False
    _fallback_found: int | None = None
    _fallback_failure: str | None = None
    if len(seeds) <= _MIN_CONTACTS_BEFORE_FALLBACK:
        _fallback_attempted = True
        logger.info(
            "Apollo returned %d contacts (<=%d), falling back to Brave+Claude for '%s'",
            len(seeds),
            _MIN_CONTACTS_BEFORE_FALLBACK,
            req.company_name,
        )
        # #2532.2 bis — repli THÈME-AWARE (retour BOUYGUES CONSTRUCTION,
        # 19/09/2026 : « Coordinateur de chantier » revenait avec 5 contacts
        # SANS rapport avec le thème). Avant ce correctif, le repli
        # Brave+Claude ignorait totalement le thème demandé et interrogeait
        # les personas GÉNÉRIQUES du profil (DSI, DAF…) — même précédence
        # qu'ailleurs dans cette fonction : un thème explicite gagne sur les
        # personas du profil, qui gagnent sur le défaut buying-committee.
        _fallback_personas = (
            (_theme_scope["titles"] if _theme_scope else None)
            or personas
            or ["DSI", "Directeur Financier", "Directeur des Achats", "Directeur de la Transformation"]
        )
        try:
            fallback_raw = await _fallback_brave_claude(
                req.company_name,
                # Span the buying committee in the fallback too, not just IT —
                # else the Brave+Claude path re-introduces the all-technical skew.
                _fallback_personas,
                correlation_id=get_correlation_id(),
            )
            fallback_seeds = [_fallback_contact_to_seed(r) for r in fallback_raw if r]
            # #2532.2 bis — même en ciblant le repli sur le thème, Brave+Claude
            # n'est pas un filtre exact : un contact de repli dont le TITRE
            # correspond réellement au thème porte la même provenance que les
            # résultats Apollo (marquée `widened` — ce n'est pas le passage
            # exact du dictionnaire, c'est du texte web). Un contact SANS
            # rapport ne reçoit AUCUNE provenance : il n'est pas attribué au
            # thème (voir `themeSearch.outOfThemeCount` plus bas), mais il
            # n'est pas non plus écarté du dossier — on archive, on ne
            # supprime pas.
            if _theme_scope is not None and _theme_match is not None:
                for _fseed in fallback_seeds:
                    if theme_title_match(_fseed.get("title"), _theme_scope):
                        _fseed["matchProvenance"] = {**_theme_match, "widened": True}
            # Merge fallback into the Apollo seeds. Apollo comes FIRST on purpose:
            # merge_contact_seeds keeps the first occurrence and only lets later
            # ones fill gaps, so a thin web-scraped seed can no longer replace a
            # rich Apollo one (it used to — last-write-wins on a bare lowercase
            # name key, which also missed every accent variant).
            seeds = merge_contact_seeds(seeds + fallback_seeds)
            fallback_count = len(fallback_seeds)
            _fallback_found = fallback_count
        except Exception as exc:
            logger.warning("Brave+Claude fallback failed: %s", exc)
            _fallback_failure = str(exc) or exc.__class__.__name__
        await emit_progress(cb, "contacts", "decision_makers", 65, f"{len(seeds)} contacts after fallback")

    # Fold the Pappers ``representants_legaux`` seeds back in so the
    # organigramme always anchors on the legal dirigeants — Apollo /
    # Claude only enrich with web-scraped decision-makers on top.
    # Dedupe by case-insensitive full name to avoid double-rows; the
    # API worker also dedupes on insert.
    pappers_seeds = []
    for pre in req.seed_contacts:
        full_name = f"{pre.first_name or ''} {pre.last_name or ''}".strip()
        if not full_name:
            continue
        pappers_seeds.append({
            "fullName": full_name,
            "title": pre.title,
            "linkedinUrl": None,
            "city": None,
            "country": "France",
            "source": pre.source or "pappers",
        })
    # Same identity rule as above. Registry names are the ones most likely to
    # differ in form from Apollo's ("MARTIN Jean-Pierre" vs "Jean Pierre Martin"),
    # which is exactly what the old lowercase-only key could not see.
    seeds = merge_contact_seeds(seeds + pappers_seeds)

    # #4923.10/.11 — recherche web CIBLÉE PAR RÔLE : pour chaque famille cible encore SANS
    # tête après Apollo, une requête par rôle de tête (« <compte> » « <titre> » site:linkedin.com/in).
    # No-op strict sans SERPER_API_KEY ; Apollo gagne pour les coordonnées, le web n'ajoute
    # que sa provenance (doublon) ou le contact (nouveau). Jamais nommée à l'écran.
    if _is_general_search and seeds:
        _wr_profile = req.profile_data or {}
        _wr_sector = next(
            (str(_wr_profile[k]) for k in ("sector", "secteur", "industry", "accountSector") if isinstance(_wr_profile.get(k), str) and _wr_profile.get(k)),
            None,
        )
        _wr_cov = theme_coverage(seeds)
        _wr_missing = [
            f
            for f in target_families(_wr_profile, scope, _wr_sector)
            if _wr_cov["families"].get(f, {}).get("status") in ("non_couverte", "couverte_partielle")
        ]
        try:
            # Lot 755 — les entités du groupe : la recherche web les interroge aussi (DSI/CDO groupe).
            _wr_group = account_identity(company, _org_ids, _org_domains, _wr_profile, extra_names=_checked).names[1:]  # filiales cochées (recette 31/10)
            _web_seeds = await web_role_search(company, _wr_missing, group_names=_wr_group)
            if _web_seeds:
                seeds = merge_web_role_seeds(seeds, _web_seeds)
        except Exception as exc:  # noqa: BLE001 — la recherche web ne coûte jamais le dossier
            logger.warning("web_role_search skipped: %s", exc)

    # Lot 755 — la zone ORDONNE aussi les contacts sans région Apollo (web, repli, Pappers) : un
    # contact d'un autre pays passe derrière, la ligne dit pourquoi. Rien n'est retiré.
    if _preferred_zone:
        seeds = prefer_zone_seeds(seeds, _preferred_zone)

    logger.info(
        "Phase 2 contacts for '%s': apollo=%d, brave_fallback=%d, pappers_seeds=%d, total=%d",
        req.company_name,
        len(apollo_hits),
        fallback_count,
        len(req.seed_contacts),
        len(seeds),
    )

    # #2543.5g — ÉLARGISSEMENT AUTOMATIQUE, UNE SEULE PASSE. Le repli web et
    # les amorces du registre légal ci-dessus ont déjà eu leur mot ; si le
    # stock reste mince MALGRÉ ÇA, une dernière tentative part avant de rendre
    # la main : personas élargis aux niveaux hiérarchiques (filtre de titres
    # retiré, bande de séniorité complète — même geste que l'ÉLARGISSEMENT
    # ci-dessus) et ancres d'organisation suivantes non encore essayées (la
    # précédence id > domaine > nom est déjà appliquée par
    # ``search_people_with_status``, voir apollo.py #2543.1 — on ne la
    # réimplémente pas ici, on la redéclenche).
    #
    # 🔴 Compteur explicite borné à 1 (pas de boucle) : un compte qui a
    # légitimement peu de monde ne doit pas se faire rejouer éternellement à
    # chaque analyse. ACTIF PAR DÉFAUT — ``CONTACTS_AUTO_WIDEN_DISABLED=true``
    # est le coupe-circuit qui l'ÉTEINT ; posé, aucun appel de plus, chemin
    # byte-identique à avant #2543.5g.
    #
    # ⚠️ THÈME = TITRES EXPLICITES ⇒ PAS D'ÉLARGISSEMENT SÉNIORITÉ (retour
    # BOUYGUES CONSTRUCTION, #2532.2 bis, collision mesurée à l'intégration du
    # 21/09/2026) : cette passe retire le filtre de titres et rouvre toute la
    # bande de séniorité, exactement ce que la recherche par THÈME (ou par
    # segment, ou par titres explicites posés par l'appelant) refuse déjà pour
    # la relance par famille (`_is_general_search` ci-dessus, même garde). Un
    # thème qui ne trouve rien reste mince ET LE DIT (`themeSearch` déjà
    # présent dans la réponse) — il ne se fait pas rattraper en silence par
    # une bande de séniorité qui n'a plus rien à voir avec le thème demandé.
    _widen_attempted = False
    _widen_initial_stock = len(seeds)
    _widen_added: int | None = None
    _widen_failure: str | None = None
    if (
        _is_general_search
        and not _CONTACTS_AUTO_WIDEN_DISABLED
        # #4433.9 — « trop peu de décideurs » = sous LE seuil des critères (GA-26), plus un 5 propre à cette passe.
        and _widen_initial_stock < CRITERIA_WIDEN_MIN_RESULTS
    ):
        _widen_attempted = True
        logger.info(
            "Stock still <%d after fallback+pappers seeds (%d) for '%s' — widening once "
            "(1/1 pass, motif d'arrêt : borne fixe, jamais une boucle)",
            CRITERIA_WIDEN_MIN_RESULTS,
            _widen_initial_stock,
            req.company_name,
        )
        try:
            widen_hits = await search_people(
                company_name=company,
                person_titles=None,
                locations=locations,
                seniorities=_default_seniorities(),
                organization_ids=_org_ids or None,
                organization_domains=_org_domains or None,
            )
        except ValueError as exc:
            logger.warning("Auto-widen search failed for '%s': %s", req.company_name, exc)
            _widen_failure = str(exc) or exc.__class__.__name__
            widen_hits = []
        widen_seeds = [_apollo_hit_to_seed(h) for h in widen_hits]
        seeds = merge_contact_seeds(seeds + widen_seeds)
        _widen_added = len(seeds) - _widen_initial_stock
        logger.info(
            "Auto-widen pass done for '%s': +%d contact(s) — stopping, 1/1 pass used",
            req.company_name,
            _widen_added,
        )

    # Prospection inversée (Théo #5) : parmi les contacts, ceux qui ont un passé
    # (non-current) chez la cible = ex-collaborateurs / consultants sortis de
    # mission = relais chauds.
    #
    # #1611.6 — LE POOL DU DOSSIER NE PEUT PAS EN CONTENIR, ET C'EST STRUCTUREL.
    # `seeds` vient d'une recherche ancrée sur le NOM de la société, qui désigne
    # l'employeur COURANT : tout le monde y travaille encore, donc le filtre
    # écartait 100 % du pool et le bloc agrégé « Ce que Bellum observe dans les
    # trajectoires » ne pouvait jamais s'allumer. La passe past-employer, ancrée
    # sur le DOMAINE seul (le seul paramètre qu'Apollo documente comme couvrant
    # un employeur passé — voir `search_past_employees`), est ce qui NOURRIT ce
    # calcul. Sans domaine connu ou avec `REVERSE_PROSPECT_SEARCH_PAGES=0`, elle
    # ne part pas et on retombe sur le comportement d'avant, à l'octet près.
    #
    # ⚠️ Ces personnes n'entrent JAMAIS dans `contacts` : elles ne travaillent
    # plus là, et le dossier doit rester la strate de décision ACTUELLE. Elles
    # ne servent qu'au calcul ci-dessous — d'où la liste locale.
    past_seeds = await _past_employer_seeds(
        _org_domains,
        person_titles=person_titles,
        seniorities=seniorities,
    )
    reverse_candidates = merge_contact_seeds(seeds + past_seeds) if past_seeds else seeds
    reverse = find_reverse_prospects(reverse_candidates, req.company_name)

    payload = _collected_contacts_payload(seeds, reverse)
    # « X écartés (hors périmètre) » (Théo P0-03) : jusqu'ici le nombre de contacts
    # retirés parce qu'ils appartenaient à une entité hors périmètre n'existait que
    # dans les logs — côté commercial, le stock rétrécissait sans explication. On le
    # fait remonter avec le détail par entité pour que le dossier le DISE.
    # Clé posée SEULEMENT s'il y a eu des écarts : un run sans exclusion garde une
    # réponse byte-identique, et un replan ne peut pas écraser par un zéro.
    if _dropped_oos:
        payload["outOfScope"] = _out_of_scope_summary(_dropped_oos)
    # #2290.2 — la couverture des thèmes, SEULEMENT quand cette recherche était
    # générale (2290.2 le demande explicitement "après une recherche générale") :
    # une clé absente sur une recherche déjà scopée par thème/segment/titres
    # explicites, plutôt qu'une mesure qui ne voudrait rien dire pour ce cas-là.
    if _theme_coverage_result is not None:
        payload["themeCoverage"] = _theme_coverage_result
    # #2543.5a — l'état de la source + la population qu'elle ANNONCE, portés
    # jusqu'à l'écran (via contacts_node -> classify_node -> coverage.sourceStatus
    # / coverage.sourceTotalEntries, voir org_graph_build.py). Clé absente quand
    # aucune recherche live n'a mesuré la source cette requête-ci — jamais un
    # "ok" deviné.
    # C.2 (Cédric 20/10) — d'où vient l'ancre d'organisation de CETTE recherche
    # (enrichment | website | explicit | none) : « none » = recherche limitée au
    # nom de l'entreprise, et l'écran doit le dire.
    payload["orgAnchorSource"] = _org_anchor_source
    if _source_outcome.status is not None:
        payload["sourceStatus"] = _source_outcome.status.value
    if _source_outcome.total_entries is not None:
        payload["sourceTotalEntries"] = _source_outcome.total_entries
    # #2543.5b — le repli web : tenté ou non, combien trouvés, l'échec nommé
    # s'il a levé. "attempted" TOUJOURS présent (TOUJOURS connu, contrairement
    # à sourceStatus qui peut rester non mesuré) — mais foundCount/failure ne
    # se posent QUE quand ils sont mesurés. #2755.1 — ce dict interne (celui
    # que le pipeline graphe stocke tel quel dans raw_analysis, SANS
    # l'`exclude_none` appliqué à l'enveloppe HTTP) posait ces deux clés à
    # `None` inconditionnellement : `orgGraphSchema.safeParse` refusait ce
    # `null` (contrat `.optional()`, pas `.nullish()`) et l'écran affichait
    # « Pas encore de graphe d'organigramme » sur un compte par ailleurs
    # complet (SOPRA STERIA GROUP, 2191 personnes). Absente = non mesuré,
    # jamais un `null` explicite (GA-18/19).
    payload["fallback"] = {"attempted": _fallback_attempted}
    if _fallback_found is not None:
        payload["fallback"]["foundCount"] = _fallback_found
    if _fallback_failure is not None:
        payload["fallback"]["failure"] = _fallback_failure
    # #2532.2 bis — le RÉSULTAT d'une recherche par THÈME se dit, jamais un
    # compteur global qui bouge en silence (retour BOUYGUES CONSTRUCTION,
    # 19/09/2026 : le compteur de contacts passait de 2563 à 2568 sans que
    # l'écran dise rien du thème, et les 5 nouveaux n'avaient aucun rapport
    # avec « Coordinateur de chantier »). ``matchedCount`` = contacts qui
    # portent la provenance de CE thème ; ``outOfThemeCount`` = contacts
    # entrés par cette recherche (Apollo + repli, PAS les représentants
    # légaux Pappers, toujours fusionnés indépendamment du thème) mais sans
    # rapport avec lui — comptés à part, jamais attribués. Absente sur une
    # recherche non thématisée : non mesuré, jamais un 0 inventé (GA-18/19).
    if _theme_scope is not None and scope is not None:
        _theme_candidates = [s for s in seeds if s.get("source") != "pappers"]
        _theme_matched = [s for s in _theme_candidates if s.get("matchProvenance")]
        payload["themeSearch"] = {
            "theme": scope.theme,
            "titles": _theme_scope["titles"],
            "matchedCount": len(_theme_matched),
            "matchedNames": [s["fullName"] for s in _theme_matched if s.get("fullName")][:10],
            "outOfThemeCount": len(_theme_candidates) - len(_theme_matched),
            # #2532.2 (21/09/2026) — un thème SANS preset connu (aucune des 10
            # familles) retombe sur le mot-clé brut + sa variante de genre
            # (``raw_fallback``) : jamais un échec, mais jamais un silence non
            # plus. L'écran DOIT nommer cette limite (« aucun préréglage pour
            # ce thème : recherche sur le mot-clé seul ») plutôt que laisser
            # croire à une expansion sectorielle qui n'a pas eu lieu.
            "presetMatched": _theme_scope["match"]["family"] is not None,
        }
    # #2543.5g — la passe d'élargissement, SEULEMENT quand elle a tourné
    # (interrupteur éteint ou stock déjà suffisant → clé absente, jamais un
    # "non tentée" qui laisserait croire qu'on a réfléchi à la question).
    # ``added`` est toujours un nombre dès que la passe a tourné, même 0 — une
    # passe qui ne trouve rien le DIT au lieu de se taire (GA-18/19).
    if _widen_attempted:
        payload["widened"] = {
            "attempted": True,
            "initialStock": _widen_initial_stock,
            "added": _widen_added,
        }
        if _widen_failure:
            payload["widened"]["failure"] = _widen_failure
    return ContactsResponse(success=True, data=payload)


PHASE2_AGENT_NAME = "contact_hunter"
PHASE2_AGENT_VERSION = "1.0.0"


def _build_meta(
    *,
    started_at: datetime,
    t0_monotonic: float,
    correlation_id: str,
    apollo_health: SourceHealth = SourceHealth.SKIPPED,
    warnings: list[AgentWarning] | None = None,
) -> AgentMeta:
    return AgentMeta(
        agent_name=PHASE2_AGENT_NAME,
        agent_version=PHASE2_AGENT_VERSION,
        correlation_id=correlation_id,
        started_at=started_at.isoformat(),
        finished_at=datetime.now(UTC).isoformat(),
        duration_ms=int((time.monotonic() - t0_monotonic) * 1000),
        source_health={"apollo": apollo_health},
        warnings=warnings or None,
    )


def _envelope_response(envelope: AgentEnvelope, *, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=envelope.model_dump(mode="json", exclude_none=True, by_alias=True),
    )


async def _contacts_with_envelope(
    req: ContactsRequest, request: Request
) -> JSONResponse:
    """Wrap ``_contacts`` so the response always parses as ``AgentEnvelope``.

    The phase-2 production pipeline does more than the ``ContactHunterAgent``
    (Apollo + Brave+Claude fallback + Pappers seeds), so the source_health is
    derived from the resulting seed count: 0 → degraded with APOLLO_EMPTY
    warning; ≥ 1 → ok. Other failure modes (Apollo down, auth) still surface
    through the HTTPException catch.
    """
    started_at = datetime.now(UTC)
    t0 = time.monotonic()
    correlation_id = get_correlation_id() or ""

    try:
        response = await run_or_cancel(request, _contacts(req))
    except HTTPException as exc:
        if exc.status_code == 499:
            envelope = AgentEnvelope[ContactsData](
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
        envelope = AgentEnvelope[ContactsData](
            status=(
                AgentStatus.RECOVERABLE_FAILURE
                if retryable
                else AgentStatus.TERMINAL_FAILURE
            ),
            data=None,
            error=AgentError(
                code="HTTP_UNAVAILABLE" if retryable else "HTTP_REJECTED",
                service=ErrorService.INTERNAL,
                severity=(
                    ErrorSeverity.RECOVERABLE
                    if retryable
                    else ErrorSeverity.TERMINAL
                ),
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
                apollo_health=SourceHealth.DOWN,
            ),
        )
        return _envelope_response(envelope, status_code=exc.status_code)
    except Exception as exc:  # noqa: BLE001
        logger.error("Phase 2 unexpected failure", exc_info=exc)
        envelope = AgentEnvelope[ContactsData](
            status=AgentStatus.TERMINAL_FAILURE,
            data=None,
            error=AgentError.from_unexpected(exc, agent_name=PHASE2_AGENT_NAME),
            meta=_build_meta(
                started_at=started_at,
                t0_monotonic=t0,
                correlation_id=correlation_id,
            ),
        )
        return _envelope_response(envelope, status_code=500)

    seeds = response.data.get("contacts", []) if isinstance(response.data, dict) else []
    count = response.data.get("count", len(seeds)) if isinstance(response.data, dict) else len(seeds)
    apollo_health = SourceHealth.OK if seeds else SourceHealth.DEGRADED
    warnings: list[AgentWarning] | None = None
    envelope_status = AgentStatus.SUCCESS
    if not seeds:
        warnings = [
            AgentWarning(
                code="APOLLO_EMPTY",
                message="Aucun contact trouvé. Repli sur les mentions presse + Pappers.",
                context={"count": 0},
            )
        ]
        envelope_status = AgentStatus.PARTIAL_SUCCESS

    # #2543.5a/.5b/.5c — le geste ciblé (« Enrichir contacts ») passe par CE
    # chemin HTTP (AnalysisOnDemandService.enrichContacts -> IaClient.contacts
    # -> route ci-dessous) : sans ce passage explicite, l'écran perdait l'état
    # de la source et le résultat du repli exactement comme le pipeline en
    # graphe les perdait avant #2543.5a — la même fuite, sur l'autre chemin.
    _raw_data = response.data if isinstance(response.data, dict) else {}
    _fallback_raw = _raw_data.get("fallback")
    # #2543.5g — même geste : la passe d'élargissement mesurée par ``_contacts``
    # doit ressortir sur ce chemin HTTP aussi, pas seulement le pipeline graphe.
    _widened_raw = _raw_data.get("widened")
    data = ContactsData(
        contacts=seeds,
        count=count,
        source_status=_raw_data.get("sourceStatus"),
        org_anchor_source=_raw_data.get("orgAnchorSource"),
        source_total_entries=_raw_data.get("sourceTotalEntries"),
        fallback=ContactsFallbackOutcome(**_fallback_raw) if isinstance(_fallback_raw, dict) else None,
        widened=ContactsWidenOutcome(**_widened_raw) if isinstance(_widened_raw, dict) else None,
    )
    envelope = AgentEnvelope[ContactsData](
        status=envelope_status,
        data=data,
        error=None,
        meta=_build_meta(
            started_at=started_at,
            t0_monotonic=t0,
            correlation_id=correlation_id,
            apollo_health=apollo_health,
            warnings=warnings,
        ),
    )
    return _envelope_response(envelope, status_code=200)


@router.post("/contacts")
async def contacts(req: ContactsRequest, request: Request):
    """Phase 2 HTTP entrypoint — always returns an ``AgentEnvelope``."""
    return await _contacts_with_envelope(req, request)


def _enrich_error(exc: Exception) -> dict[str, str]:
    """Structured body for a failed enrichment — ``{message, code, provider}``.

    ``detail`` used to be ``str(exc)``: an English sentence, and nothing else.
    NestJS could only forward or drop it, and it dropped it — the seller read a
    bare « API error » in a French UI, which is the absence of information
    rendered as information.

    ``code`` comes from the shared :class:`DegradeReason` vocabulary so the web
    can map it to a sentence that says what to DO. Anything untyped is
    ``upstream_error``: we know the call failed, not why, and naming a precise
    cause we cannot prove would be worse than admitting the vagueness.
    """
    reason = getattr(exc, "reason", None)
    return {
        "message": str(exc),
        "code": reason if isinstance(reason, str) and reason else DegradeReason.UPSTREAM_ERROR,
        "provider": "apollo",
    }


@router.post("/enrich", response_model=EnrichPersonResponse)
async def enrich(req: EnrichPersonRequest) -> EnrichPersonResponse:
    """Enrich a single contact (on-demand, paid).

    Match priority: LinkedIn URL, then a full name + org (People-Match). When the
    identity is incomplete (role-persona placeholder / first-name-only) or the
    match misses, falls back to a People-Search by ``organization + title`` to
    resolve the REAL named person in that role — completing the contact's identity
    (see :func:`enrich_person_with_fallback`). Phone reveal is not requested in
    this PR (requires a webhook callback, out of scope).
    """
    try:
        result = await enrich_person_with_fallback(
            # apollo_id (from People-Search) is the strongest key — it unlocks an
            # obfuscated, first-name-only search-tier contact that name+org can't.
            apollo_id=req.apollo_id,
            linkedin_url=req.linkedin_url,
            first_name=req.first_name,
            last_name=req.last_name,
            organization_name=req.organization_name,
            organization_id=req.organization_id,
            organization_domain=req.organization_domain,
            title=req.title,
        )
    except ApolloPlanError as exc:
        # 402 Payment Required — surface the plan/key issue distinctly from
        # transient backend failures so the UI can prompt for an upgrade.
        raise HTTPException(status_code=402, detail=_enrich_error(exc)) from exc
    except ApolloUnavailableError as exc:
        raise HTTPException(status_code=502, detail=_enrich_error(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=_enrich_error(exc)) from exc

    return EnrichPersonResponse(success=True, data=result)


@router.post("/enrich/reveal-phone", response_model=RevealPhoneResponse)
async def enrich_reveal_phone(req: RevealPhoneRequest) -> RevealPhoneResponse:
    """E1 (#3698) — demander le mobile à Apollo, livré plus tard sur le webhook
    signé de l'API. Jamais d'exception : ``requested=False`` + ``reason``."""
    return await request_phone_reveal(
        webhook_url=req.webhook_url,
        apollo_id=req.apollo_id,
        linkedin_url=req.linkedin_url,
        first_name=req.first_name,
        last_name=req.last_name,
        organization_name=req.organization_name,
    )


@router.post("/people/search-by-name", response_model=SearchPeopleByNameResponse)
async def people_search_by_name(req: SearchPeopleByNameRequest) -> SearchPeopleByNameResponse:
    """#2727 — chercher une personne par nom et prénom, voir les homonymes.

    Recherche GRATUITE (tier People-Search) : ``ApolloSearchHit`` porte déjà de
    quoi distinguer des homonymes (organisation, poste, ville) sans révéler
    d'e-mail ni de téléphone — ce reveal reste le geste payant et séparé de
    ``/enrich`` ci-dessus, sur l'homonyme CHOISI. Jamais d'exception nue :
    ``status`` porte toujours un statut typé, y compris sans clé Apollo
    configurée (``unconfigured``) — l'écran dit pourquoi, jamais un 500.
    """
    if req.cascade:
        # #4386 — la cascade multi-sources (base de contacts → registre des
        # dirigeants → recherche web), arrêtée dès qu'un résultat est solide.
        outcome = await search_person_by_name(full_name=req.full_name, organization_name=req.organization_name)
        return SearchPeopleByNameResponse(
            success=True, hits=outcome.hits, status=outcome.status, sources_queried=outcome.sources_queried
        )
    hits, status = await search_people_by_name(
        full_name=req.full_name,
        organization_name=req.organization_name,
    )
    return SearchPeopleByNameResponse(
        success=True, hits=[PersonNameSearchHit(**hit.model_dump()) for hit in hits], status=status.value
    )


@router.post("/people/employment-freshness", response_model=EmploymentFreshnessResponse)
async def people_employment_freshness(req: EmploymentFreshnessRequest) -> EmploymentFreshnessResponse:
    """Apollo Professional (02/11) — le poste d'UN contact relu par People-Match (parcours daté, payant : 1 crédit).

    Geste ciblé (une fiche, une relecture mensuelle), jamais un balayage. Le crédit est tracé par le registre de
    coûts (D19) → en-tête ``x-bellum-costs``. ``status`` dit pourquoi un état manque ; jamais de probabilité."""
    return await read_employment_freshness(
        apollo_id=req.apollo_id, linkedin_url=req.linkedin_url, employer_ref=req.employer_ref
    )


@router.post("/contacts/discover", response_model=DiscoverContactsResponse)
async def discover_contacts(req: DiscoverContactsRequest) -> DiscoverContactsResponse:
    """#2809 (#2293.11, #2294.*) — découverte FRAÎCHE de contacts sur un compte
    déjà connu : des personnes JAMAIS collectées, cherchées par critère
    (rôles), pas un rejeu des personas déjà collectés (``POST
    /analysis/:id/refresh``, axe contacts — ``RefreshContactsDialog`` côté
    web, un moteur DIFFÉRENT, sur des comptes déjà analysés).

    Enveloppe fine sur ``search_people_with_status`` — la primitive déjà
    scopée compte (``organization_ids``/``organization_domains``/
    ``company_name``, cross-comptes par construction : appelée une fois par
    compte sélectionné, jamais liée à une analyse). Aucun moteur neuf : les
    seeds rendus sont la MÊME forme que la collecte Phase 2 normale
    (``_apollo_hit_to_seed``), pour que l'API les persiste par le même chemin
    (``ContactsService.bulkInsert``) — dédup par identité déjà en place,
    jamais de fusion automatique de deux personnes distinctes.

    Sans clé Apollo configurée : ``status='unconfigured'``, ``seeds=[]`` — un
    NO-OP strict, jamais un 500 ni une donnée inventée (``search_people_
    with_status`` porte déjà cette distinction).
    """
    hits, status, _total = await search_people_with_status(
        company_name=req.company_name,
        person_titles=req.titles,
        organization_domains=[req.organization_domain] if req.organization_domain else None,
        organization_ids=[req.organization_id] if req.organization_id else None,
        max_pages=1,
    )
    seeds = [_apollo_hit_to_seed(hit) for hit in hits[:DISCOVER_CONTACTS_MAX_RESULTS]]
    # #2297 — même catalogue de champs interdits que la collecte Phase 2
    # normale (`_collected_contacts_payload`), appliqué ici pour la même
    # raison : l'API le refiltre à l'entrée de `bulkInsert`, mais un routeur
    # qui laisse fuir un champ interdit ne doit compter que sur l'appelant.
    seeds = without_forbidden_enrichment_fields(seeds)
    return DiscoverContactsResponse(success=True, seeds=seeds, status=status.value)
