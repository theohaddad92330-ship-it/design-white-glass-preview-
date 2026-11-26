"""Découvrir — recherche de comptes à conquérir.

Contrat : ``agent_docs/discover-v2-contract.md``.

    « Le registre produit la liste. Le LLM ne produit que l'angle commercial. »

Deux routes cohabitent le temps de la bascule d'écran :

``POST /discover/registry`` (v2, la source de vérité)
    Le registre officiel produit la liste ; chaque candidat porte un SIREN réel,
    un score **calculé** et justifié facteur par facteur
    (:mod:`app.services.discover_scoring`), et les sources en panne sont
    **dites** dans ``degraded[]``. Le modèle n'intervient qu'à la fin, sur des
    entreprises déjà résolues, pour l'angle commercial.

``POST /discover/search`` (v1, déprécié)
    Un appel Brave + un appel Claude, où le modèle inventait les noms
    d'entreprises, le score /10 et les « contacts clés ». Conservé pour ne pas
    casser l'écran actuel, à supprimer dès que le front consomme la v2.
"""

from __future__ import annotations

import asyncio
import contextlib
import contextvars
import hashlib
import json
import logging
import math
import os
import re
import time
from collections.abc import Awaitable, Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import partial
from itertools import zip_longest
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.middleware.correlation_id import get_correlation_id
from app.prompts.bellum_discover import (
    build_angle_user_prompt,
    build_legacy_system_prompt,
    build_system_prompt,
    build_user_prompt,
)
from app.services import (
    adzuna_budget,
    company_domains,
    fresh_jobs,
    provider_cache,
    rag_knowledge,
    source_cache,
    source_health,
)
from app.services.account_qualification import VerifyCode, qualify_all
from app.services.application_sector_naf import APPLICATION_SECTOR_NAF, naf_codes_for_sectors
from app.services.actor_typology import actor_fields
from app.services.esn_recognition import offer_says_esn
from app.services.brand_grouping import group_by_brand, keep_named
from app.services.brave_search import search as brave_search
from app.services.cancel import run_or_cancel
from app.services.claude_service import CLAUDE_HAIKU_MODEL, CallMetadata, call_claude
from app.services.company_filters import (
    NO_MATCH_REASON,
    CompanyDiscoveryFilters,
    DegradeReason,
    degraded_entry,
    displayable_headcount,
    tranche_code_for_headcount,
    tranche_codes_union,
)
from app.services.contract_model import observe_contract_model
from app.services.criteria_referential import (
    CRITERIA_WIDEN_MIN_RESULTS,
    _canonical_by_alias,
    expertise_trade_terms,
    normalise_skill_text,
    sector_widening_tiers,
    size_band_of,
    size_widening_tiers,
    skill_widening_tiers,
    widen_target,
)
from app.services.criteria_widening import WideningFetch, exact_first, widen_rows
from app.services.data_sources import recherche_entreprises
from app.services.data_sources.ats_boards import it_job_signals_ats
from app.services.data_sources.bodacc import is_low_value_announcement, legal_signals
from app.services.data_sources.bodacc_capital import capital_increase_signals
from app.services.data_sources.brave_news import recent_news
from app.services.data_sources.dataforge_candidates import dataforge_candidates
from app.services.data_sources.employer_match import EmployerScope
from app.services.data_sources.france_travail import domain_offers, it_job_signals
from app.services.data_sources.funding_feed import funding_signals
from app.services.data_sources.geo_communes import search_communes
from app.services.data_sources.job_aggregators import adzuna_jobs
from app.services.data_sources.listed_companies import listed_sirens
from app.services.data_sources.mantiks_volume import WINDOW_DAYS as OFFERS_WINDOW_DAYS
from app.services.data_sources.mantiks_volume import offer_volumes, root_domain
from app.services.data_sources.press_rss import attach_brave_news, press_signals
from app.services.data_sources.press_rss import load_feeds as load_press_feeds
from app.services.data_sources.public_tenders import public_tenders
from app.services.data_sources.recherche_entreprises import LIST_PAGE_MAX
from app.services.data_sources.signal_errors import settled
from app.services.discover_card_facts import drop_off_card_facts
from app.services.discover_funnel import build_funnel, with_qualification
from app.services.discover_hiring_scope import account_out_of_trade, drop_off_scope_hiring
from app.services.discover_request_reading import RequestReading, read_request, region_label
from app.services.discover_scoring import (
    parse_headcount_range,
    recommended_sort,
    score_candidate,
    sector_matches_profile_targets,
    target_sectors_of,
)
from app.services.discover_signal_grid import arrange_signals
from app.services.discover_single_flight import single_flight
from app.services import discover_skill_offers
from app.services.discover_skill_offers import (
    begin_identity_memo,
    named_pass,
    find_skill_accounts,
    harvest_terms,
    offer_department,
    resolve_employer,
    skill_terms,
    zone_departments,
)
from app.services.domain_job_filters import keyword_terms, recruits_for_clients, signal_matches_keywords
from app.services.esn_candidate_ranking import naf_family_label, naf_label_for_code
from app.services.flexible_search import matches_flexible_query, or_terms
from app.services.free_text_facts import read_offer_title
from app.services.geo_labels import department_name, region_departments, same_place
from app.services.group_link_lookup import attach_group_links
from app.services.group_people import inherit_group_people
from app.services.holding_subsidiary import redirect_holdings
from app.services.internship_posting import drop_internship_postings
from app.services.naf_sections import SECTOR_TO_NAF_SECTION, naf_section_of
from app.services.offer_domains.base import normalize_offer_domain
from app.services.place_resolution import resolve_place
from app.services.public_facts import (
    CACHE_ONLY_JOB_SOURCES,
    RAW_JOBS_SOURCES,
    cached_fact,
    company_fact_key,
    jobs_fact_variant,
    peek_fact,
)
from app.services.rate_limiter import wait_deadline
from app.services.sector_reading import sectors_asked_in_naf
from app.services.space_reserve import cut_with_space_reserve
from app.services.technology_radar import technology_radar
from app.services.text_norm import normalize_name
from app.services.zone_cover import COVER_RADIUS_KM, DISC_RADIUS_KM, cover_centres
from app.services.zone_tiers import (
    DEFAULT_CITY_RADIUS_KM,
    ZONE_TIER_RADIUS_KM,
    ZONE_TIERS,
    auto_cap_reached,
    distance_km,
    needs_zone_widening,
    zone_tiers_after,
    zone_widening_of_list,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/discover", tags=["Discover"])

#: Borne dure sur le nombre de lignes registre demandées — protège le quota de
#: la source. La taille du prompt d'angle, elle, est bornée à part
#: (``ANGLE_CANDIDATE_LIMIT``), quel que soit ``limit``.
#:
#: ⚠️ #4016 L7 — décision Louis 11/10/2026 : Découvrir SANS PALIER. Le volume de
#: la capacité commerciale (10 / 25 / 50) n'est plus qu'un PREMIER LOT ; « Voir
#: plus » relance avec un ``limit`` plus grand. 50 → 200 : une borne TECHNIQUE
#: (budget de temps d'une requête), plus un palier produit. Miroir de
#: ``DISCOVER_MAX_LIMIT`` (``packages/contracts/src/schemas/discover.ts``).
MAX_REGISTRY_LIMIT = 200
#: #4791.2 — combien de noms Market Memory sont tentés au registre par recherche (borne de coût).
MARKET_MEMORY_NAMES_MAX = 30
# #4673 — la cible d'élargissement (25) : un défaut plus bas tronquerait ce que l'élargissement vient de trouver.
DEFAULT_REGISTRY_LIMIT = 25
#: #4016 L7 — combien de pages de la source gratuite une requête lit au plus
#: (``LIST_PAGE_MAX`` lignes chacune) : assez pour ``MAX_REGISTRY_LIMIT``.
MAX_REGISTRY_PAGES = -(-MAX_REGISTRY_LIMIT // LIST_PAGE_MAX)

#: Nombre maximal de secteurs CROISÉS honorés en une requête (rail unifié). Le
#: registre est interrogé une fois par secteur : sans borne, cocher les dix
#: secteurs déclencherait dix waterfalls sous le couperet de 45 s de l'API. Les
#: secteurs au-delà sont écartés et DITS (`degraded`), jamais silencieusement
#: ignorés. Six couvre tous les croisements réalistes tout en restant dans le
#: budget (les sous-requêtes tournent en parallèle).
MAX_CROSSED_SECTORS = 6

#: #4419.1 (Louis 31/10) — le budget d'appels registre d'une recherche, PAR page de profondeur demandée : à 25 comptes
#: (une page), 6 appels, comme avant (#4305 : élargir ne fait jamais exploser le coût) ; à 100 comptes (4 pages), 24.
#: Le registre gratuit seulement — les sources payantes gardent leur plafond nommé de 18 appels et leur cache 30 j.
REGISTRY_CALLS_PER_PAGE_DEPTH = MAX_CROSSED_SECTORS


def registry_call_budget(limit: int) -> int:
    """#4419.1 — combien d'appels registre une recherche de ``limit`` comptes peut dépenser (élargissement, rappel)."""
    pages = min(max(1, -(-int(limit) // LIST_PAGE_MAX)), MAX_REGISTRY_PAGES)
    return REGISTRY_CALLS_PER_PAGE_DEPTH * pages


#: Un SIREN français : exactement 9 chiffres. Tout le reste est écarté — c'est
#: la garde qui interdit de rendre une entreprise non résolue.
_SIREN_RE = re.compile(r"^\d{9}$")

# #2496 bis — budget de temps GLOBAL du moteur, sous le couperet de 45 s posé
# côté proxy (`DISCOVER_CALL_OPTS`, apps/api/.../ia-proxy.controller.ts).
#
# Mesuré en production le 17/09/2026 : « aéronautique » (secteur large) ×
# Toulouse (ville tapée en toutes lettres) échouait après ~25 s — un délai qui
# ne correspond à AUCUN couperet connu (ni les 45 s du proxy, ni le timeout
# d'un fournisseur pris seul, 6 à 15 s). La chaîne est SÉQUENTIELLE : résolution
# de la ville (`geo-communes`) → page 1 du registre → rappel de page 2
# (#2490.9) → angle commercial (Claude). Chaque étape a SON délai ; aucune
# n'avait de budget d'ENSEMBLE, si bien que leurs délais s'additionnent au lieu
# d'être bornés — une recherche parfaitement légitime, juste un peu lente sur
# chaque fournisseur, se comporte alors comme un blocage.
#
# Le budget n'arrête jamais la LISTE elle-même (page 1, déjà en main) : il
# arrête le travail le moins utile en premier — le rappel de page 2, puis
# l'angle — et le dit dans `degraded[]` (`network_error`, déjà mappé côté
# écran sur « injoignable — délai dépassé »). Un résultat partiel se dit, il ne
# se cache pas.
#
# 20 s, pas 40 — sous les 45 s du proxy ET sous les ~25 s observés en
# production : la marge sert à finir AVANT la coupure mesurée, pas seulement
# avant le couperet connu le plus large.
# #4517.13 (Louis 24/10) — 32 s : mesure prod du 24/10, les POST /discover/registry finissaient à 21,6-22,8 s
# (budget de 20 s dépassé, sans coupure) et la résolution des employeurs était coupée à « 5 restants ». Les ~25 s du
# 17/09 venaient de la chaîne séquentielle, bornée depuis (#2496 bis). 13 s de marge sous les 45 s du proxy pour
# l'API (mémoire marché) et le transport.
# #4517.2 (Louis 31/10) — 55 s : revient sur les 32 s de #4517.13. Le volume demandé monte à 100 (#4673.2) et le
# registre lit autant de pages qu'il l'exige (#4419.1) ; toujours UN seul chargement (#4517), sous le couperet de
# 60 s de l'API (`DISCOVER_CALL_OPTS`). La moisson des signaux a sa fenêtre en fin de budget (#4677.1,
# `DISCOVER_LIST_BUDGET_S`).
DISCOVER_TIME_BUDGET_S = 55.0

# #2521 — la PART du budget réservée à l'angle commercial (le modèle).
#
# Mesuré en production le 17/09/2026 : « Ta cible » (cinq secteurs) → 20,6 s,
# « le modèle d'analyse — injoignable — délai dépassé » ; un secteur et une
# ville → 7,3 s, rien de dégradé. Le registre attendait sa sous-requête la plus
# lente, puis le modèle recevait ce qui restait — souvent rien, et il n'était
# même pas appelé.
#
# Le registre travaille donc dans la première moitié : passée cette part, le
# rappel de page 2 n'est plus tenté et les sous-requêtes encore en vol sont
# abandonnées (et DITES) dès qu'une autre a rendu des lignes. Le modèle garde
# le reste. La moitié n'est pas une mesure de sa latence, c'est un partage :
# la liste passe avant l'angle, mais l'angle n'est plus ce qui saute toujours.
# #4519.21 / #4519.22 (24/10) — un tiers au modèle : la liste (résolution registre, ~21 s au débit public de 2 req/s)
# passe avant l'angle ; un angle qui ne tient pas est ABSENT, sans bandeau d'excuse.
DISCOVER_MODEL_SHARE = 1 / 3

# #2490 / #2496 — la PART de la lecture de la demande dans ce budget : la
# résolution du lieu (``geo-communes``, 6 s de délai propre) est la seule étape
# réseau de la lecture. Sans part à elle, une source lente mangeait le budget
# de la liste avant même la première page. Au-delà de cette part, le lieu est
# appliqué en texte (s'il suit une préposition) ou nommé comme non appliqué —
# jamais attendu plus longtemps. Fonction séparée (`_resolve_place_within_share`) :
# la répartition du budget GLOBAL, elle, n'est pas touchée ici.
DISCOVER_READING_BUDGET_S = 4.0

# #2521 (suite) — mesuré en prod le 17/09/2026, recette 13 : « Ta cible » (cinq
# secteurs) → 20,65 s, 24 candidats, AUCUN angle — « le modèle d'analyse — pas
# de réponse dans le temps imparti ». La part réservée au modèle (ci-dessus)
# est un TEMPS, pas une TAILLE : un JSON de 24 entrées (un angle + des rôles
# suggérés chacune) grandit avec le nombre de candidats, la part n'a pas bougé.
#
# Correctif : l'angle n'est demandé que pour les premiers candidats du
# classement DÉTERMINISTE (`angled` est déjà trié par `_rank_key` à ce point).
# Le reste garde son score et son verdict, sans angle — l'écran sait déjà
# afficher un candidat sans angle (`angle: null`), c'est même l'état par défaut
# avant que le modèle ne réponde. 8 couvre large ce qu'un commercial regarde
# réellement en premier (un écran de résultats, pas une liste exhaustive).
ANGLE_CANDIDATE_LIMIT = 8

# `max_tokens` proportionné à `ANGLE_CANDIDATE_LIMIT`, pas à la taille de page
# historique (4000, dimensionné pour ~24 candidats — voir #2500). ~165 tokens
# par candidat (1-2 phrases d'angle + jusqu'à deux rôles suggérés, JSON compris)
# a suffi jusqu'ici ; 250 tokens/candidat garde une marge sans redonner à la
# taille de page ce qu'on vient de lui retirer.
ANGLE_MAX_TOKENS = ANGLE_CANDIDATE_LIMIT * 250

# #2521 (suite) — mesuré en prod : 20,65 s pour un budget de 20 s, soit un
# dépassement de 0,65 s malgré la part réservée au modèle. `remaining` (plus
# bas) compte tout ce qui a DÉJÀ eu lieu (ville, pages, scoring, tri) mais rien
# de ce qui SUIT le retour du modèle — succès, échec ou annulation : rattacher
# l'angle à chaque candidat, construire et sérialiser la réponse. Une marge
# fixe, retranchée de `remaining`, couvre ce reste pour que le dépassement
# mesuré au proxy soit NUL, pas seulement réduit. Petite délibérément : elle
# doit couvrir une sérialisation, pas se substituer à un budget de registre —
# une valeur trop large affamerait le modèle sur une recherche déjà tendue
# (registre lent + petit budget total).
ANGLE_TRAILING_MARGIN_S = 0.15

# Décision Louis, 18/09/2026 — « une recherche d'ENTREPRISES rapporte enfin des
# signaux » : `signals` était posé à `[]` pour CHAQUE candidat du chemin
# registre (les signaux datés vivaient seulement sur `/discover/signals`).
# « ESN à Toulouse » rendait 24 entreprises et zéro signal — le moment précis
# où le commercial veut savoir laquelle recrute ou a gagné un marché.
#
# Borné AVANT tout, comme l'angle ci-dessus : seuls les ``SIGNALS_CANDIDATE_
# LIMIT`` premiers du classement déterministe sont interrogés (« au moins les
# premières », jamais toute la page) — petit et volontairement plus bas que
# l'angle, car CHAQUE candidat y coûte jusqu'à trois appels réseau (une source
# ne sait pas répondre pour plusieurs entreprises à la fois, donc « un seul
# appel groupé » ne s'applique à aucune des trois ici).
#
# #2615.1 (21/09/2026) — monté de 3 à 5 pour les « Comptes prioritaires ».
#
# #4067.c1 DECOUVRIR-COLLECTE (Louis 13/10) — 5 ÉTAIT la cause des cartes vides : sur
# une page de 24 (`DISCOVER_PAGE_SIZE`, `apps/web/.../discover-query.ts`), les
# 19 dernières sortaient `signalsSearched: False` (« Non cherché : offres »),
# mesuré sur `/discover?sectors=fintech,software_tech,automotive&headcount=250-999`.
# Décision : CHAQUE entreprise affichée est interrogée. La borne vaut désormais
# DEUX pages web (une page + un « voir plus ») : au-delà, la ligne reste NON
# MESURÉE et le dit, jamais « aucun signal ». Le coût est tenu par le cache
# partagé des faits publics (un fait frais = aucun appel) et par les limiteurs
# de chaque registre, pas par une coupe arbitraire de la page.
SIGNALS_CANDIDATE_LIMIT = 48

# DECOUVRIR-COLLECTE — le parallèle est BORNÉ à deux niveaux : une page web (24)
# d'entreprises en vol au plus, et sous elles la concurrence propre de chaque
# registre (`rate_limiter._DEFAULTS` : france_travail 5, bodacc 5, boamp 3,
# apec 3), qui ne laisse jamais partir plus d'appels réels que le registre n'en
# accepte (file d'attente FIFO : le haut du classement passe d'abord). Mesuré
# (`tests/perf/mesure_decouvrir_collecte_13_10.py`) : des vagues de 12 coûtaient
# un second tour complet sans épargner un seul appel. Un fait frais en cache ne
# consomme aucune des deux bornes.
SIGNALS_CONCURRENCY = 24

# Les tâches signaux DÉMARRENT avant l'appel modèle et tournent EN PARALLÈLE de
# lui (jamais après). DECOUVRIR-COLLECTE : 3 → 5 s, parce que la page entière
# (24) est interrogée et plus seulement 5 lignes ; mesuré : voir
# `tests/perf/mesure_decouvrir_collecte_13_10.py`. Le budget GLOBAL
# (`DISCOVER_TIME_BUDGET_S`) borne toujours : ce budget ne s'ajoute jamais
# au-delà de lui (#2496 bis). Ce qui n'a pas fini n'est plus JETÉ : la collecte
# finit en arrière-plan (bornée par `SIGNALS_SOURCE_BUDGET_S`) et range ses faits
# dans le cache partagé — la carte dit « non cherché » cette fois, la suivante
# (même recherche, « voir plus », autre espace) les lit sans appel.
SIGNALS_TIME_BUDGET_S = 5.0

#: #4677.1 (Louis 31/10) — les signaux par carte SORTENT du budget de la liste : la liste (registre, coupe, angle)
#: répond sur ``DISCOVER_LIST_BUDGET_S`` ; la moisson garde SA fenêtre (``SIGNALS_TIME_BUDGET_S``) jusqu'au budget
#: total. Une liste lente ne prive plus les signaux de leur temps, et les signaux ne prennent rien à la liste :
#: elle est complète d'abord. Ce qui n'a pas fini continue en arrière-plan (#4067) et range ses faits.
DISCOVER_LIST_BUDGET_S = DISCOVER_TIME_BUDGET_S - SIGNALS_TIME_BUDGET_S


def _signals_reserve_s() -> float:
    """La fenêtre réservée aux signaux en fin de budget : ``SIGNALS_TIME_BUDGET_S``, jamais plus que la même PART du
    budget total (un budget réduit — test, réglage — garde la même proportion, il ne passe pas en négatif)."""
    share = SIGNALS_TIME_BUDGET_S / (DISCOVER_LIST_BUDGET_S + SIGNALS_TIME_BUDGET_S)
    return min(SIGNALS_TIME_BUDGET_S, DISCOVER_TIME_BUDGET_S * share)


SIGNALS_GRACE_S = 0.02
#: DISCOVER-OFFRES (15/10) — combien de temps une carte attend le volume d'offres de la page (un seul aperçu gratuit).
VOLUME_WAIT_S = 3.0

# #4067 — chaque SOURCE d'une carte a son propre plafond : la plus lente (le
# registre d'offres cadres, 20 req/min partagées avec les analyses) est coupée
# seule et DITE (`degraded`, `time_budget`) — elle ne rend jamais toute la carte
# « Non cherché ». Mesuré le 13/10 (conteneur, réseau réel) : AO 0,55-1,23 s,
# annonces légales 0,20-1,12 s, actualités 0,07 s une fois les flux lus (1,9 s,
# une fois par page). C'est la borne de la collecte qui finit en ARRIÈRE-PLAN.
#
# #4677 (L7, Louis 25/10 — la pertinence passe avant le coût) — 6 → 20 s. Ce budget ne vole plus rien à la
# liste : elle ne l'attend jamais (`SIGNALS_TIME_BUDGET_S` + `deadline` bornent son attente, la tâche non
# finie continue ici). 6 s coupait une source froide derrière la file de son registre (48 cartes, 1 req/s
# pour les offres) AVANT qu'elle ait rangé son fait au cache partagé : le travail était perdu et la source
# rappelée pour rien à chaque relecture. 20 s = le délai de relecture du web (`JOBS_RETRY_DELAY_MS`) : la
# relecture suivante trouve la moisson finie. Un réglage, un endroit (GA-26).
SIGNALS_SOURCE_BUDGET_S = 20.0

# #4045.4 (14/10) — fenêtre de REPLI sur la donnée ACCUMULÉE (`public_facts`,
# même clé que le cache normal) quand France Travail/APEC se déclarent en
# ERREUR (429, coupure) plutôt que « rien trouvé » : une offre collectée il y
# a 3 semaines reste un fait plus utile qu'une carte vide. Plus large que la
# fraîcheur normale du cache (`provider_cache.TTL_JOBS`, 30 j) — c'est un
# dernier recours, pas une promesse de fraîcheur.
_JOBS_STALE_FALLBACK_S = 30 * 24 * 3600

#: Sources d'offres qui ne se LISENT ici que dans le cache partagé (jamais d'appel) — le réglage
#: vit dans ``public_facts`` : la veille quotidienne le relit aussi (VC.1, 18/10).
_CACHE_ONLY_JOB_SOURCES = CACHE_ONLY_JOB_SOURCES


def _env_positive_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


# ── Fournisseurs registre (lots voisins) ────────────────────────────────────
# Importés PARESSEUSEMENT, dans le corps de la fonction : ces deux modules sont
# livrés par un autre chantier et peuvent ne pas être encore sur le disque. Un
# import manquant devient une entrée `degraded`, jamais un crash au démarrage
# ni — surtout — un repli silencieux sur du texte généré.


async def _registry_search(
    filters: CompanyDiscoveryFilters, limit: int, degraded: list[dict] | None = None
) -> list[dict]:
    """Source principale : registre Pappers filtré (NAF × géo × effectif × âge)."""
    from app.services.pappers import search_companies_filtered

    return await search_companies_filtered(filters, limit, degraded=degraded)


async def _fallback_search(
    filters: CompanyDiscoveryFilters, limit: int, degraded: list[dict] | None = None
) -> list[dict]:
    """Repli SANS CLÉ : l'API publique recherche-entreprises. Moins riche, mais
    toujours disponible — donc jamais de trou de service."""
    from app.services.data_sources.recherche_entreprises import list_companies

    return await list_companies(filters, limit, degraded=degraded)


async def _fallback_search_page(
    filters: CompanyDiscoveryFilters, limit: int, degraded: list[dict] | None = None, *, page: int = 1
) -> list[dict]:
    """#2490.9 — la page ``page`` du repli sans clé. Une indirection À PART,
    pour que le rappel de page 2 reste visible (et bouchable) dans les tests."""
    from app.services.data_sources.recherche_entreprises import list_companies

    return await list_companies(filters, limit, degraded=degraded, page=page)


# ── Requête / réponse ───────────────────────────────────────────────────────


class DiscoverFilters(BaseModel):
    """Critères structurés. Tous optionnels : sans critère, le registre décide."""

    sector: str | None = None
    #: Secteurs CROISÉS (rail unifié). Quand renseigné, le registre est interrogé
    #: une fois par secteur et les listes sont fusionnées par SIREN — c'est ce qui
    #: rend « secteur × secteur » exprimable dans UNE recherche. Vide/absent =
    #: aucune contrainte. `sector` (singulier) reste le chemin mono-secteur.
    sectors: list[str] | None = None
    nafCode: str | None = None
    department: str | None = None
    #: Territoire à PLUSIEURS départements. Le registre en accepte nativement une
    #: liste, donc un commercial dont le secteur fait trois départements ne fait
    #: plus trois recherches (`departement=31,33` mesuré à 142 le 04/09/2026,
    #: contre 97 et 45 séparément).
    departments: list[str] | None = None
    #: Code de région INSEE. Déjà porté par `CompanyDiscoveryFilters` et déjà
    #: sérialisé par la source gouv.fr — il n'était simplement jamais REÇU de
    #: l'écran, faute de champ ici.
    region: str | None = None
    #: #2642.1 — PLUSIEURS régions cochées ensemble (IDF + Occitanie…), sur le
    #: même modèle que `departments` : le registre gouv.fr en accepte
    #: nativement une liste.
    regions: list[str] | None = None
    #: Chiffre d'affaires. ⚠️ Le module gouv.fr déclarait ces critères « sans
    #: équivalent » ; c'est PÉRIMÉ — `ca_min=50000000` fait tomber la base NAF
    #: 30.30Z de 745 à 38 (04/09/2026). Attention, `tranche_chiffre_affaires`,
    #: lui, est IGNORÉ EN SILENCE : ce n'est pas le bon paramètre.
    revenueMin: int | None = None
    revenueMax: int | None = None
    #: Catégorie INSEE : PME, ETI, GE. Croise effectif, CA et bilan — c'est ce
    #: qui rend « ETI industrielle » exprimable, là où l'effectif seul ne l'est
    #: pas. Choisi par l'utilisateur, JAMAIS appliqué par défaut.
    companyCategory: list[str] | None = None
    #: Catégorie juridique INSEE (`nature_juridique`), ex. 5710 = SAS.
    legalCategory: str | None = None
    city: str | None = None
    #: #3983.2 (#3705.3) — la BASE d'une zone département/région : `headquarters` =
    #: le SIÈGE est dans la zone ; `presence` (ou absent) = au moins un
    #: établissement actif y est — ce que le registre fait déjà, donc le chemin
    #: byte-identique. Sans zone, sans effet (rien à baser).
    siteBasis: Literal["headquarters", "presence"] | None = None
    #: #2642.2 — un CERCLE autour de `city`, en kilomètres. Sans effet SEUL :
    #: un rayon n'a pas de centre sans ville résolue en commune (voir
    #: `_registry_filters`). L'API gouv.fr refuse au-delà de 50 km (mesuré
    #: 04/09/2026 : `radius=51` → 400) : #4641 — un rayon de 51 à 100 km (100 km
    #: est le défaut d'une ville seule) est servi par le recouvrement de sept
    #: cercles de 50 km (:func:`_collect_cover`), JAMAIS envoyé tel quel.
    radiusKm: float | None = Field(default=None, gt=0, le=COVER_RADIUS_KM)
    #: #4429.2 — « revenir à Toulouse seule » : la ville stricte, aucun palier tenté.
    zoneStrict: bool | None = None
    #: #4429.2 (25/10) — « revenir au barreau d'avant » : jusqu'où l'élargissement automatique peut aller
    #: (50 km, le département, ou la région). Absent = toute l'échelle AUTOMATIQUE (jusqu'à la région, c144) ; sans effet avec ``zoneStrict``.
    zoneCeiling: Literal["radius_50", "department", "region"] | None = None
    #: #4433.3 (recette 01/11) — le geste « Élargir la zone » MONTE d'un palier : les paliers sont tentés JUSQU'À celui-ci
    #: (département, puis région) même quand la ville a déjà assez de comptes, chaque compte ajouté porte son palier.
    #: Jamais ``france`` (c144) : un geste de zone ne dépasse pas la région. Sans effet avec ``zoneStrict``.
    zoneRaise: Literal["department", "region"] | None = None
    headcountMin: int | None = None
    headcountMax: int | None = None
    #: #3908 — PLUSIEURS tranches cochées ensemble (10-49 + 250-499…), non
    #: contiguës. `headcountMin`/`headcountMax` ci-dessus ne portent qu'UN
    #: intervalle : les envelopper ferait remonter la tranche intermédiaire
    #: jamais cochée. Additif — un rail qui ne coche qu'une tranche continue
    #: d'envoyer `headcountMin`/`headcountMax` seuls, comportement inchangé.
    headcountRanges: list[dict[str, int]] | None = None
    #: #4361.2 — retirer les sociétés PROUVÉES cotées (index ouvert, voir
    #: `listed_companies.py`). Seul `true` contraint ; une société dont la cotation n'est pas
    #: établie RESTE (non mesuré n'est jamais « non coté ») et la réponse le dit
    #: (`listingFilter`). Jamais envoyé à une source registre : il agit sur ce qu'elle rend.
    excludeListed: bool | None = None
    createdAfter: str | None = None
    createdBefore: str | None = None
    freetext: str | None = None
    #: #4045 — les mots-clés de la recherche : ils TRIENT les signaux de chaque
    #: candidat (le recoupement passe en tête), ils ne retirent aucune entreprise.
    keywords: list[str] | None = None
    #: COMPETENCE-TROUVE (20/10) — les technologies cochées. Avec ``keywords``, une COMPÉTENCE posée :
    #: le tirage part alors des offres qui la citent dans la zone (``discover_skill_offers``).
    technologiesObserved: list[str] | None = None


#: #3704.4 — les sources du waterfall registre, dans l'ordre d'origine. Une SEULE
#: liste : le waterfall (`_collect_registry`) et la reprise la lisent toutes deux.
REGISTRY_SOURCE_NAMES: tuple[str, ...] = ("pappers", "recherche-entreprises")

#: #3704.4 — la REPRISE d'une source : quand la liste est non vide, le waterfall
#: n'interroge QUE ces sources. Une variable de contexte plutôt qu'un paramètre de
#: plus sur six fonctions : elle voyage avec les sous-recherches parallèles
#: (`asyncio.create_task` copie le contexte) et ne vit que le temps d'une requête.
_ONLY_REGISTRY_SOURCES: contextvars.ContextVar[tuple[str, ...]] = contextvars.ContextVar(
    "only_registry_sources", default=()
)


#: #4305 — le COMPTEUR d'appels registre d'UNE recherche (budget « borné et mesuré »). Une liste d'un
#: seul élément plutôt qu'un entier : les sous-recherches parallèles (`asyncio.create_task` copie le
#: contexte) incrémentent le MÊME compteur. Aucun contenu, aucun critère : un nombre.
_REGISTRY_CALLS: contextvars.ContextVar[list[int] | None] = contextvars.ContextVar("registry_calls", default=None)
#: #4677.1 — l'échéance de la moisson des signaux de CETTE recherche (plus tardive que celle de la liste).
_SIGNALS_DEADLINE: contextvars.ContextVar[float | None] = contextvars.ContextVar("signals_deadline", default=None)


def _budget_clocks(started: float) -> tuple[float, float, float]:
    """#4677.1 / #4517.2 — ``(registre, liste, total)`` : le registre travaille dans sa part de la LISTE (#2521),
    la liste finit à ``DISCOVER_LIST_BUDGET_S``, les signaux à ``DISCOVER_TIME_BUDGET_S``."""
    # Le registre garde SA part du budget total (#2521, #4519.21) ; seule la fin de la liste (angle, rattachements)
    # laisse la fenêtre des signaux.
    registry_deadline = started + DISCOVER_TIME_BUDGET_S * (1 - DISCOVER_MODEL_SHARE)
    list_deadline = started + DISCOVER_TIME_BUDGET_S - _signals_reserve_s()
    return registry_deadline, list_deadline, started + DISCOVER_TIME_BUDGET_S


def _signals_deadline(list_deadline: float) -> float:
    """#4677.1 — l'échéance de la moisson : la sienne si la recherche l'a posée, sinon celle reçue (hors requête)."""
    own = _SIGNALS_DEADLINE.get()
    return own if own is not None else list_deadline


def _search_effort(calls: int, *, candidates: int, limit: int, degraded: list[dict]) -> dict[str, Any] | None:
    """#4305.2 — ce que la recherche DIT de son effort : combien de sources interrogées, ce qui l'a arrêtée.

    Le compteur ci-dessus ne faisait que journaliser ; il voyage maintenant dans ``query.searchEffort``.
    Deux faits, jamais un crédit ni un fournisseur : ``stoppedBy`` = ``time`` (le budget de temps a coupé),
    ``limit`` (le volume demandé est atteint) ou ``exhausted`` (les sources n'avaient plus rien à rendre).
    Aucun appel = aucune ligne (``None``), jamais un « 0 source » inventé.
    """
    if calls <= 0:
        return None
    # Le budget des SIGNAUX (`discover-signals`, cartes non enrichies) a sa propre note : il ne dit pas que la LISTE
    # a été coupée. Seul un registre arrêté par le temps est « time ».
    if any(
        entry.get("reason") == DegradeReason.TIME_BUDGET and entry.get("source") != "discover-signals"
        for entry in degraded
    ):
        stopped_by = "time"
    elif candidates >= limit:
        stopped_by = "limit"
    else:
        stopped_by = "exhausted"
    return {"sourcesQueried": calls, "stoppedBy": stopped_by}


def _count_registry_call() -> None:
    counter = _REGISTRY_CALLS.get()
    if counter is not None:
        counter[0] += 1


#: #4429.6 — ce que la résolution du lieu a FAIT (corrigé, homonyme, introuvable) pour UNE recherche.
#: Un dict posé par la requête : les sous-tâches parallèles (contexte copié) écrivent dans le même.
_PLACE_NOTE: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar("place_note", default=None)


def _record_place(note: Mapping[str, Any] | None) -> None:
    holder = _PLACE_NOTE.get()
    if holder is not None and note:
        holder["note"] = dict(note)


#: #4363.1 — la durée de chaque ÉTAPE d'UNE recherche (collecte, élargissement, classement), en ms. Un
#: dictionnaire partagé comme `_REGISTRY_CALLS` ; seuls des noms d'étape et des durées y entrent —
#: jamais un critère, un nom d'entreprise ni un fournisseur.
_STEP_TIMINGS: contextvars.ContextVar[dict[str, float] | None] = contextvars.ContextVar("step_timings", default=None)


@contextlib.contextmanager
def _timed_step(name: str) -> Iterator[None]:
    """Mesure l'étape ``name`` de la recherche en cours ; sans recherche mesurée, ne fait rien."""
    timings = _STEP_TIMINGS.get()
    started = time.monotonic()
    try:
        yield
    finally:
        if timings is not None:
            timings[name] = timings.get(name, 0.0) + (time.monotonic() - started) * 1000


def _format_step_timings(timings: Mapping[str, float]) -> str | None:
    """``discover steps collect_ms=12 rank_ms=4`` ; ``None`` quand rien n'a été mesuré."""
    if not timings:
        return None
    return "discover steps " + " ".join(f"{name}_ms={round(ms)}" for name, ms in timings.items())


def source_resume_token(source: str) -> str:
    """Un identifiant OPAQUE et stable d'une source du registre.

    Nos fournisseurs ne se nomment jamais (ni à l'écran, ni dans un prompt, ni
    à Laura) : la reprise d'UNE source passe par ce jeton, dérivé du nom mais
    qui ne le contient pas et qu'aucun modèle ne sait inverser. Sans état à
    garder entre deux tours : le serveur re-dérive les jetons de ses sources.
    """
    return "src-" + hashlib.sha256(source.encode()).hexdigest()[:8]


def sources_from_resume_tokens(tokens: Sequence[str]) -> tuple[str, ...]:
    """Les sources réelles désignées par ces jetons — un jeton inconnu est ignoré, jamais deviné."""
    wanted = {str(token).strip() for token in tokens}
    return tuple(source for source in REGISTRY_SOURCE_NAMES if source_resume_token(source) in wanted)


class CommonBaseNeed(BaseModel):
    """#4791.2 / #4762.1 — un besoin observé dans la base commune : son libellé et sa DATE (récente ou historique,
    aucune borne d'âge). Sans date, aucun besoin n'est affiché (``_observed_need``)."""

    label: str = Field(default="", max_length=160)
    date: str | None = Field(default=None, max_length=32)
    # #5203 — la NATURE du besoin (recrutement, mission, projet) ; absente = inconnue, jamais devinée.
    nature: str | None = Field(default=None, max_length=16)


class CommonBaseCandidate(BaseModel):
    """#4793.1 / #4791.1 — un compte de la base COMMUNE (partagée entre espaces, GA-16) qui correspond aux critères.
    Posé par l'API (``DiscoverSourcesService.commonBaseCandidates``), jamais un client ; aucun champ d'espace."""

    siren: str = Field(default="", max_length=20)
    name: str = Field(default="", max_length=300)
    city: str | None = Field(default=None, max_length=200)
    sector: str | None = Field(default=None, max_length=200)
    nafCode: str | None = Field(default=None, max_length=10)
    observedNeed: CommonBaseNeed | None = None
    # #5203 — vrai = né des besoins PASSÉS DE L'ESPACE de l'appelant : jamais présenté comme « base commune ».
    fromSpace: bool = False


class MarketMemoryName(BaseModel):
    """#4791.2 — une entreprise lue dans Market Memory (un NOM, jamais un SIREN) et, si l'entrée la porte, la date
    (``YYYY-MM``) de son besoin observé. Posé par l'API ; appariée au registre ici, ou écartée."""

    name: str = Field(default="", max_length=300)
    label: str | None = Field(default=None, max_length=160)
    date: str | None = Field(default=None, max_length=32)
    nature: str | None = Field(default=None, max_length=16)


class DiscoverRegistryRequest(BaseModel):
    filters: DiscoverFilters = Field(default_factory=DiscoverFilters)
    limit: int = DEFAULT_REGISTRY_LIMIT
    profile_data: dict = Field(default_factory=dict)
    #: #3704.4 — reprise ciblée : n'interroger QUE ces sources (noms internes, jamais
    #: envoyés par un client — l'API ne relaie pas ce champ ; le chat les dérive de jetons).
    onlySources: list[str] | None = None
    #: #2489.3/D1 (décision Louis 18/09/2026 après-midi) — le bouton « chercher
    #: hors de ma cible ». La cible déclarée du profil ESN filtre TOUJOURS par
    #: défaut (y compris en texte libre) ; ce booléen, jamais posé par défaut,
    #: est le seul levier qui la fait ignorer.
    #: ⚠️ #3873.6 RENVERSE D1 sur UN point (décision Louis 10/10/2026) : quand
    #: l'utilisateur VIDE explicitement les cases secteurs du rail, l'écran pose
    #: ce même booléen — la cible est levée pour cette recherche. Un rail jamais
    #: touché garde D1 (la cible filtre).
    includeOutOfTarget: bool = False
    #: #4067 (reste) — les SIREN sur lesquels l'ESPACE ACTIF détient un fait (historique, affaires
    #: CRM). Posé par l'API, seule à connaître l'espace ; jamais un client. Sert UNIQUEMENT à ne pas
    #: couper ces candidats à ``limit`` avant que l'API ne mêle leurs faits au rang.
    spaceSirens: list[str] = Field(default_factory=list)
    #: #4793.1 / #4791.1 (Louis 31/10) — les comptes de la base COMMUNE qui correspondent aux critères : des
    #: CANDIDATS, rangés avec ceux du registre et des offres, dédoublonnés par SIREN. Posé par l'API ; rien de
    #: propre à un espace (CRM, comptes suivis, notes) n'y entre jamais (#4791.3 — critère de RANG seulement).
    commonBaseCandidates: list[CommonBaseCandidate] = Field(default_factory=list, max_length=MAX_REGISTRY_LIMIT)
    #: #4791.2 (Louis 31/10) — les entreprises de Market Memory qui correspondent aux critères (NOMS). Appariées à un
    #: SIREN par la résolution d'identité existante ; un nom non apparié avec certitude n'entre PAS.
    marketMemoryNames: list[MarketMemoryName] = Field(default_factory=list, max_length=MARKET_MEMORY_NAMES_MAX)
    #: #4433 — « revenir au strict » : sous le seuil, la recherche s'élargit d'elle-même par paliers
    #: (compétence, secteur, taille) ; ce booléen, posé par le geste de l'écran, la garde exacte.
    strictCriteria: bool = False
    #: #4430 (Louis 21/10) — l'ESPACE qui pose la question, posé par l'API (ou Laura), jamais un client.
    #: Sert UNIQUEMENT au plafond quotidien des offres fraîches (``fresh_jobs``) : il n'entre jamais
    #: dans la clé d'un fait du cache commun. Absent : aucune collecte payée (cache seul, comme avant).
    spaceKey: str | None = None
    #: #4419.7 — l'appelant, posé par l'API (jamais un client) : l'identité d'un employeur se relit d'abord dans les
    #: comptes de SON espace (cloisonnement #4791.3), via le lecteur commun de l'API.
    userId: str | None = None


class TargetSectorFilterInfo(BaseModel):
    """#2489.3/D1 — le compteur n'est PAS décoratif : un écran qui écarte en
    silence ment sur ce qu'il a trouvé. `applied=False` (bouton actionné) et
    `applied=True, excludedCount=0` (le filtre a tourné et n'a rien écarté) ne
    sont PAS le même état, et l'écran ne doit jamais les confondre.

    Absent de `DiscoverRegistryResponse` (jamais cet objet à `excludedCount: 0`)
    quand l'espace n'a déclaré AUCUN secteur cible : une cible non déclarée
    n'est pas une cible vide (GA-18/GA-19), il n'y a alors rien à dire."""

    applied: bool
    excludedCount: int = 0
    #: Les secteurs (libellé candidat, tels que rendus par la source) écartés —
    #: le POURQUOI mesuré en prod le 18/09 (« 9 restauration traditionnelle, 4
    #: restauration rapide, 2 supermarchés… »), jamais une liste des secteurs
    #: cibles déjà connus de l'utilisateur.
    excludedSectors: list[str] = Field(default_factory=list)


class ListingFilterInfo(BaseModel):
    """#4361.2 — ce que « Exclure les sociétés cotées » a fait, dit en nombres.

    Présent UNIQUEMENT quand l'interrupteur est posé (un filtre qui n'a pas tourné n'a pas de
    compteur). ``unknownCount`` = les comptes RESTÉS dont la cotation n'est pas établie : l'index
    prouve « cotée », jamais « non cotée » — aucun compte n'est donc jamais compté « non coté ».
    ``sourceAvailable=False`` : l'index n'a pas répondu, rien n'a été retiré."""

    applied: bool = True
    excludedCount: int = 0
    unknownCount: int = 0
    sourceAvailable: bool = True


class DiscoverRegistryResponse(BaseModel):
    """Forme exacte du contrat — `degraded` est non négociable."""

    candidates: list[dict] = Field(default_factory=list)
    query: dict = Field(default_factory=dict)
    degraded: list[dict] = Field(default_factory=list)
    #: Le tri à PROPOSER d'entrée, déduit de la maturité déclarée de l'ESN
    #: (§8.3). Proposé, jamais imposé : un choix explicite le remplace, et rien
    #: ne le ré-écrase à la requête suivante.
    recommendedSort: str = "balanced"
    #: #2489.3/D1 — absent quand aucune cible n'est déclarée, présent sinon.
    targetSectorFilter: TargetSectorFilterInfo | None = None
    #: #4361.2 — absent quand l'interrupteur « Exclure les sociétés cotées » n'est pas posé.
    listingFilter: ListingFilterInfo | None = None
    #: #4429.2 — la ville seule rendait trop peu de comptes : le palier appliqué (lieu, palier, aire,
    #: exacts, élargis), ÉCRIT au-dessus de la liste. Absent quand rien n'a été élargi.
    zoneWidening: dict | None = None
    #: #4045 (14/10) — des cartes de la page n'ont pas pu être cherchées dans le budget :
    #: leur collecte finit en arrière-plan (cache partagé). Le web relit UNE fois, plus
    #: tard. Indicateur machine : jamais le nom d'une source.
    jobsPending: bool = False
    jobsPendingCount: int = 0
    #: COMPETENCE-TROUVE (20/10) — cabinets de recrutement et ESN qui recrutent sur la compétence posée :
    #: une section à part, jamais la liste principale. Vide hors tirage par compétence.
    skillIntermediaries: list[dict] = Field(default_factory=list)
    #: #4674 — employeurs prouvés par une offre dont l'identité registre est « en cours » : sans SIREN, donc sans action.
    skillPendingEmployers: list[dict] = Field(default_factory=list)


class DiscoverRequest(BaseModel):
    criteria: str
    profile_data: dict = {}


class DiscoverResponse(BaseModel):
    success: bool = True
    data: dict = {}


# ── Helpers ─────────────────────────────────────────────────────────────────


def _clean_siren(value: Any) -> str:
    """Un SIREN réel, ou une chaîne vide. Aucune tolérance : c'est la frontière
    entre « entreprise vérifiée » et « nom sorti d'un modèle »."""
    digits = re.sub(r"[\s.\-]", "", value) if isinstance(value, str) else ""
    return digits if _SIREN_RE.match(digits) else ""


def _text_or_none(value: Any) -> str | None:
    return value.strip() or None if isinstance(value, str) and value.strip() else None


#: #5178 — le vocabulaire qui dit qu'une entité EST de l'immobilier (son nom le porte).
_REAL_ESTATE_NAME_RE = re.compile(
    r"\b(immobili\w*|immo|fonci\w*|sci|scpi|sccv|opci|promotion|promoteur|patrimoine|logements?|habitat|"
    r"residences?|résidences?|syndic|gestion\s+locative|lotissement|am[ée]nageur|nexity|kaufman|icade|gecina|klepierre|"
    r"unibail|cogedim|bouygues\s+immobilier|realty|real\s+estate|property)\b",
    re.IGNORECASE,
)


def _naf_is_group_real_estate(naf_code: str | None, name: str, other_names: Mapping[str, str]) -> bool:
    """NAF de la division 68 (immobilier) sur une entité qui ne se nomme pas comme de l'immobilier."""
    digits = re.sub(r"[^0-9]", "", naf_code or "")
    if not digits.startswith("68"):
        return False
    return not any(_REAL_ESTATE_NAME_RE.search(text) for text in (name, *other_names.values()))


def _registry_row(row: Mapping[str, Any]) -> dict[str, Any] | None:
    """Projette une ligne registre sur les champs FACTUELS du contrat.

    Renvoie ``None`` — donc écarte le candidat — dès que le SIREN n'est pas
    résolu. Accepte les deux conventions de nommage (camelCase du contrat,
    snake_case des sources FR) pour ne pas dépendre du lot voisin.
    """

    def pick(*keys: str) -> Any:
        return next((row[key] for key in keys if row.get(key) not in (None, "")), None)

    siren = _clean_siren(pick("siren"))
    name = _text_or_none(pick("name", "nom_entreprise", "denomination"))
    if not siren or not name:
        return None
    naf_code = _text_or_none(pick("nafCode", "naf_code", "code_naf"))
    # #4285.2 — la raison sociale et l'enseigne du registre, quand elles DIFFÈRENT du nom affiché : la presse
    # écrit l'une ou l'autre, et le rapprochement des levées les compare (même règle que le nom).
    other_names = {
        key: value
        for key, value in (
            ("legalName", _text_or_none(pick("legalName", "nom_raison_sociale"))),
            ("tradeName", _text_or_none(pick("tradeName", "enseigne", "nom_commercial"))),
        )
        if value and value.casefold() != name.casefold()
    }
    # #3907 — « la carte ne dit pas ce que fait l'entreprise » : certaines
    # sources (gouv.fr sans `libelle_activite_principale`) ne publient que le
    # CODE NAF, illisible pour un commercial (« 62.02A »). On ne l'affiche
    # JAMAIS brut : à défaut du libellé fourni par la source, on décode la
    # nomenclature publique (`naf_label_for_code` puis `naf_family_label`,
    # tome 3) — jamais un libellé fabriqué, et un code hors table laisse
    # `sector` vide plutôt qu'un code brut.
    supplied_sector = _text_or_none(pick("sector", "libelle_naf", "activite"))
    # #5178 — le secteur vient de l'entité AFFICHÉE : un NAF 68.xx (immobilier) porté par une entité dont
    # le nom ne dit rien d'immobilier est celui de l'immobilier du groupe (siège de marque : DECATHLON,
    # LISTEN TOO LILLE), pas de ce que fait l'enseigne. Une activité déclarée prime ; à défaut, AUCUN
    # secteur (GA-18/19) plutôt qu'un secteur faux.
    if not pick("sector", "activite") and _naf_is_group_real_estate(naf_code, name, other_names):
        supplied_sector = None
        sector = None
    else:
        sector = supplied_sector or naf_label_for_code(naf_code) or naf_family_label(naf_code)
    # #4358.4 — la carte DIT d'où vient son secteur : le site (seulement si la source le dit), l'activité
    # déclarée (libellé fourni), ou le code NAF décodé. Aucun secteur → aucune provenance.
    if not sector:
        sector_basis = None
    elif supplied_sector and not pick("sector", "activite") and pick("libelle_naf"):
        sector_basis = "naf"  # `libelle_naf` est le libellé de la nomenclature, pas une activité déclarée
    elif supplied_sector:
        sector_basis = "website" if row.get("sectorSource") == "website" else "declared_activity"
    else:
        sector_basis = "naf"
    return {
        "name": name,
        "siren": siren,
        **other_names,
        "nafCode": naf_code,
        "sector": sector,
        **({"sectorBasis": sector_basis} if sector_basis else {}),
        "city": _text_or_none(pick("city", "ville", "commune")),
        "department": _text_or_none(pick("department", "departement")),
        # #4436.3 — le point de passage de TOUTES les sources (nationale, départementale, compétence) :
        # un effectif nul ou un code brut ne sort jamais « 0 salarié » d'ici.
        "headcountRange": displayable_headcount(_text_or_none(pick("headcountRange", "tranche_effectif", "effectif"))),
        "creationDate": _text_or_none(pick("creationDate", "date_creation")),
        # Entrées de la barrière d'achat (tome 3) : la catégorie INSEE, le CODE
        # de tranche (exact, contrairement au libellé) et le nombre
        # d'établissements. Le registre les publie ; personne ne les lisait.
        "sizeClass": _text_or_none(pick("sizeClass", "categorie_entreprise", "category")),
        "headcountTranche": _text_or_none(pick("headcountTranche", "tranche_effectif_salarie")),
        "establishmentCount": pick("establishmentCount", "etablissementCount", "nombre_etablissements"),
        # #2490.1 — la catégorie juridique et l'état administratif. La source les
        # publie, la qualification les lit… et cette projection les jetait : la
        # qualification ne pouvait donc ni écarter une personne physique ni
        # recommander une société — 100 % des lignes sortaient « à vérifier ».
        "legalCategory": _text_or_none(pick("legalCategory", "nature_juridique", "categorie_juridique")),
        # #3705.5 — mandataires personnes morales (indice de rattachement à un groupe).
        "corporateOfficers": [
            str(name).strip() for name in (row.get("corporateOfficers") or []) if isinstance(name, str) and name.strip()
        ][:3],
        "ceased": row.get("ceased") is True,
        # #3983.1 — la base de la géographie (siège / implantation), telle que le
        # registre la prouve ; absente quand il ne prouve rien (jamais « 0 »).
        **({"geography": row["geography"]} if isinstance(row.get("geography"), Mapping) else {}),
        # #4429.2 — la position du site, quand la source la donne : elle mesure « à 38 km de
        # Toulouse » et ne voyage jamais jusqu'à la réponse (`_drop_positions`).
        **{key: row[key] for key in ("latitude", "longitude") if isinstance(row.get(key), (int, float))},
    }


#: Secteur d'écran → section NAF officielle (lettre A-U). C'est la seule
#: traduction fidèle : une section est un fait de la nomenclature, alors qu'un
#: code NAF précis choisi pour « industrie » serait une invention.
# La table a déménagé dans `app/services/naf_sections.py` : elle vivait ici en
# privé, si bien que le mode SIGNAUX ne pouvait pas l'appliquer — il affichait
# les mêmes pastilles de secteur et ne lisait `sector` nulle part. Une
# dérivation vit à un seul endroit ; deux copies divergent.


#: #2490.11 — combien de communes homonymes regarder avant de renoncer à
#: résoudre. Le défaut de `search_communes` (10) suffit très largement : au-delà,
#: aucune n'a de raison objective d'être LA bonne, et on ne choisit pas pour
#: l'utilisateur (voir `geo_communes.py`).
_MAX_COMMUNE_LOOKUPS = 10


async def _resolve_city_commune(city: str, fuzzy: bool = False) -> dict | None:
    """#2490.11 — une ville tapée en toutes lettres, résolue en COMMUNE (code
    INSEE), jamais devinée.

    Un nom qui correspond EXACTEMENT (accents et casse ignorés) est retenu ; mal
    orthographié, il est corrigé par proximité (``fuzzy``, ville tapée comme
    telle) et la correction est NOMMÉE (#4429.6, `place_resolution.py`) —
    proposer Toulon à qui a tapé Toulouse enverrait la recherche à 750 km de là,
    le seuil de proximité l'interdit. Une source muette, ou un nom qui ne
    correspond à aucune commune, rend ``None`` : l'appelant repart alors sur le
    comportement d'avant (recherche plein-texte), et le DIT quand la source a
    répondu.

    N'appelle PAS :func:`app.services.data_sources.geo_communes.resolve_commune_by_name`
    (#3762, même résolution exacte, utilisée par le chat) : ce module teste la
    source via `app.routers.discover.search_communes` (monkeypatché), un alias
    distinct de celui interne à `geo_communes.py` — les deux copies restent en
    phase par la même règle, pas par un appel partagé, pour ne pas casser cette
    frontière de test.
    """
    candidates = await search_communes(city, limit=_MAX_COMMUNE_LOOKUPS)
    # #4429.6 — une ville TAPÉE comme telle (``fuzzy``) est corrigée par proximité ET nommée ; un
    # homonyme prend la plus peuplée et nomme les autres ; rien ne correspond : on le dit.
    commune, note = resolve_place(city, candidates, fuzzy=fuzzy)
    if commune is None:
        _record_place(note)
        return None
    if note:
        commune["resolution"] = note
    return commune


@dataclass(frozen=True)
class _PlaceLookup:
    """Le lieu a déjà été cherché par la lecture de la demande : l'appelant ne
    le cherche pas une seconde fois. ``commune`` vaut ``None`` quand le lieu
    part en texte (source muette ou trop lente)."""

    commune: dict | None


async def _resolve_place_within_share(
    candidates: Sequence[str], deadline: float, *, fuzzy: bool = False
) -> tuple[dict | None, str | None, bool]:
    """#2490 / #2496 — résout des lieux candidats SOUS la part de la lecture.

    Rend ``(commune, candidat retenu, non vérifié)``. « Non vérifié » veut dire
    que la source n'a pas répondu (panne ou part du budget épuisée) : on ne
    sait PAS si le texte est un lieu — ce n'est pas « ce n'est pas un lieu ».
    Les candidats partent ensemble ; le premier (ordre de préférence) qui
    correspond exactement gagne.
    """
    if not candidates:
        return None, None, False
    share = min(DISCOVER_READING_BUDGET_S, deadline - time.monotonic())
    if share <= 0:
        return None, None, True
    resolve = _resolve_city_commune if not fuzzy else partial(_resolve_city_commune, fuzzy=True)
    lookups = asyncio.gather(*(settled(resolve(c)) for c in candidates), return_exceptions=True)
    try:
        results = await asyncio.wait_for(lookups, share)
    except TimeoutError:
        return None, None, True
    unverified = False
    for candidate, result in zip(candidates, results, strict=True):
        if isinstance(result, BaseException):
            logger.warning("discover place lookup unavailable for %r: %s", candidate, result)
            unverified = True
        elif result:
            _record_place(result.get("resolution"))
            return result, candidate, False
    return None, None, unverified


def _dedupe_words(words: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    kept: list[str] = []
    for word in words:
        key = normalize_name(word)
        if key and key not in seen:
            seen.add(key)
            kept.append(word)
    return kept


async def _apply_reading(
    filters: DiscoverFilters, deadline: float
) -> tuple[DiscoverFilters, dict[str, Any] | None, _PlaceLookup | None]:
    """#2490 / #2496 — la demande en langage naturel devient des CRITÈRES.

    Avant : le texte libre partait tel quel dans le plein-texte du registre,
    qui le compare aux noms et aux adresses de tous les établissements —
    « ESN spécialisées cybersécurité à Toulouse » rendait CARGLASS, BNP Paribas
    et le CNRS (production, 17/09/2026).

    Maintenant, ce que la lecture reconnaît (:func:`read_request`) filtre la
    requête, et le texte libre ne part plus en plein-texte. Le rail GAGNE
    toujours : un lieu ou un secteur lu dans le texte ne remplace jamais celui
    qui est coché, il est NOMMÉ comme non appliqué. Rend les filtres effectifs,
    la trace ``reading`` (``None`` pour un simple nom d'entreprise, dont la
    recherche par raison sociale reste celle d'avant) et le lieu déjà cherché.
    """
    reading: RequestReading = read_request((filters.freetext or "").strip())
    rail_zone = _zone_requested(filters)
    rail_activity = bool(filters.nafCode or filters.sector or filters.sectors)
    update: dict[str, Any] = {}
    not_applied: list[str] = [*reading.activity_words_not_applied]
    leftover = list(reading.leftover)
    activities: list[str] = []

    if reading.naf_codes:
        if rail_activity:
            not_applied[:0] = reading.activity_words
        else:
            update["nafCode"] = ",".join(reading.naf_codes)
            activities = list(reading.activities)

    place: str | None = None
    unverified = False
    lookup: _PlaceLookup | None = None
    if rail_zone:
        not_applied.extend(p for p in (reading.place_label, reading.place_after_preposition) if p)
    elif reading.zone_read:
        if reading.region:
            update["region"] = reading.region
        if reading.department:
            update.update(department=reading.department, departments=[reading.department])
        if reading.postal_code:
            update["city"] = reading.postal_code
        place = reading.place_label
    elif reading.place_candidates:
        commune, matched, unverified = await _resolve_place_within_share(reading.place_candidates, deadline)
        after = reading.place_after_preposition
        if not commune and after and not unverified:
            # #4429.6 — « à Tolouse » : le lieu NOMMÉ après une préposition est corrigé par proximité.
            commune, _, unverified = await _resolve_place_within_share([after], deadline, fuzzy=True)
        if commune:
            update["city"] = commune["name"]
            place = commune["name"]
            lookup = _PlaceLookup(commune)
            leftover = [word for word in leftover if word != matched]
        elif after:
            # #2165.60 — RÉFUTÉ EN PRODUCTION le 20/09/2026 : un lieu NOMMÉ
            # explicitement après « à / sur / en » (« à Toulouse ») partait en
            # « non pris en compte » dès que la source répondait SANS trouver
            # de commune exacte homonyme — jamais seulement en cas de panne —
            # et le registre cherchait alors SANS AUCUN lieu (14 résultats hors
            # sujet, aucun à Toulouse ni dans le 31). Un nom posé après une
            # préposition de lieu est un signal trop fort pour être jeté sur un
            # simple aléa de source : dans les DEUX cas (source muette/lente OU
            # source formelle mais sans homonyme), il part en recherche
            # plein-texte d'adresse — jamais la phrase entière. `placeUnverified`
            # continue de distinguer une vraie panne d'un lieu simplement non
            # reconnu comme commune officielle.
            update["city"] = after
            place = after
            lookup = _PlaceLookup(None)

    # #4842.1 — une COMPÉTENCE du référentiel (« talend ») n'est jamais une raison sociale : elle se PROUVE par des
    # offres (chemin compétence). Trouvé par son nom seul, BC TALEND CONSULTING sortait sans aucun besoin observé
    # (prod 29/10). Le mot passe en mots-clés ; un nom qui CONTIENT un mot de compétence (« Python Software ») reste
    # un nom — seul le reste entier, reconnu comme compétence, change de chemin.
    skill_read: list[str] = []
    if leftover and normalise_skill_text(" ".join(leftover)) in _canonical_by_alias():
        skill_read = [" ".join(leftover)]
        leftover = []
        if not any(k.strip().lower() == skill_read[0].lower() for k in filters.keywords or []):
            update["keywords"] = [*(filters.keywords or []), skill_read[0]]

    # #4419.1 — le métier/la techno LUS (« développeur Java ») sont le besoin : mots-clés → chemin OFFRES
    # (`_discover_by_skill`), jamais une raison sociale. La techno du référentiel passe seule ; sans techno, le métier.
    if reading.profile_is_need and not skill_read:
        known = _canonical_by_alias()
        wanted = [w for w in reading.profile_words if normalise_skill_text(w) in known] or [
            " ".join(reading.profile_words)
        ]
        have = {k.strip().lower() for k in [*(filters.keywords or []), *(update.get("keywords") or [])]}
        added = [w for w in wanted if w.strip().lower() not in have]
        if added:
            update["keywords"] = [*(update.get("keywords") or filters.keywords or []), *added]

    if not update and not reading.sentence_like and not skill_read:
        # Un NOM (« Capgemini ») : la recherche par raison sociale d'avant.
        return filters, None, None

    # Un texte COURT (un nom, pas une phrase) garde ses mots non lus comme
    # recherche par raison sociale : « Banque Populaire », que Laura envoie
    # comme nom (`chat_tools._run_account_search`), filtre le secteur ET le nom
    # — jamais toutes les banques. Une PHRASE dont RIEN n'a été compris ne part
    # jamais en plein-texte : ses mots sont nommés, pas envoyés à l'aveugle.
    #
    # #2165.60 — RÉFUTÉ EN PRODUCTION le 20/09/2026 : une PHRASE dont un lieu
    # ET/OU une activité ONT été compris (`update` non vide) jetait quand même
    # le reste (métier/compétence, intention…) au silence — « qui recrute des
    # développeurs Java à Toulouse » filtrait sur Toulouse seul, sans jamais
    # tenir compte de « développeurs »/« Java », qui restaient portés comme
    # « non pris en compte » pendant que le registre répondait quand même. Ce
    # qui reste UNE FOIS un critère réel posé rejoint la recherche par nom,
    # scopée par ce critère — jamais la phrase entière sur un registre non
    # filtré (ce que `sentence_like` évite toujours quand RIEN n'est compris).
    name = (" ".join(leftover) or None) if (update or not reading.sentence_like) else None
    rail_criteria = any(_is_set(value) for key, value in filters.model_dump().items() if key != "freetext")
    trace = {
        "activities": activities,
        "place": place,
        "placeUnverified": unverified,
        "name": name,
        # #4842.1 — la compétence lue dans le texte : cherchée dans les offres, jamais par raison sociale.
        "skillRead": skill_read,
        # #3512 — le métier/la techno recrutés : lus, nommés, jamais un nom.
        "hiringProfile": " ".join(reading.profile_words) or None,
        "notApplied": _dedupe_words([*not_applied, *([] if name else leftover)]),
        # Rien de reconnu, rien de coché : aucune liste plutôt que le registre
        # entier présenté comme une réponse.
        "unreadable": not update and not rail_criteria,
    }
    update["freetext"] = name
    return filters.model_copy(update=update), trace, lookup


def _headcount_tranches_union(ranges: list[dict[str, int]] | None) -> list[str] | None:
    """#3908 — `headcountRanges` (plusieurs tranches cochées) → l'UNION de
    leurs codes INSEE, chaque tranche expansée SÉPARÉMENT (`tranche_codes_union`) :
    un intervalle unique sur la plus basse borne et la plus haute ferait
    remonter une tranche intermédiaire jamais cochée. `None` quand le rail n'a
    coché aucune tranche par ce chemin — `headcountMin`/`headcountMax`
    suffisent alors, comportement inchangé (c'est ce que le rail envoie pour
    une sélection d'une seule tranche : voir `headcountQueryPart`, web).
    """
    if not ranges:
        return None
    bounds = [
        (
            tranche_code_for_headcount(r.get("headcountMin")),
            tranche_code_for_headcount(r.get("headcountMax")),
        )
        for r in ranges
    ]
    return tranche_codes_union(bounds) or None


def _registry_filters(filters: DiscoverFilters, *, commune: Mapping[str, Any] | None = None) -> CompanyDiscoveryFilters:
    """Filtres d'ÉCRAN (camelCase, effectifs en nombre) → filtres de REGISTRE.

    Les deux sources attendent un :class:`CompanyDiscoveryFilters` validé, pas un
    dictionnaire : leur passer le `model_dump()` brut faisait crasher chaque run
    (`'dict' object has no attribute 'q'` côté Pappers, `… 'is_empty'` côté
    recherche-entreprises) et l'écran ne rendait donc jamais que « Résultats
    partiels ».

    Deux critères d'écran n'ont pas d'équivalent registre et sont traités
    honnêtement plutôt que devinés :

    * ``sector`` devient une SECTION NAF — plus large que le libellé d'écran,
      mais exact (Pappers ne l'expose pas : voir :func:`_unsupported_by`) ;
    * ``city`` n'est filtrable qu'en code postal OU en code INSEE de commune.
      Une ville en toutes lettres est résolue en amont (``commune``,
      :func:`_resolve_city_commune`) ; si la résolution échoue, elle part en
      recherche plein-texte (``q``), que seule la source gouv.fr honore
      (:func:`_city_freetext`).

    #2642.2 — ``radiusKm`` dessine un CERCLE autour de la commune RÉSOLUE
    (``commune["latitude"]``/``["longitude"]``, `geo_communes.py`, jamais une
    coordonnée devinée). Sans effet quand la commune n'est PAS résolue — un
    rayon sans centre ne s'applique pas, il ne se rabat pas sur un
    département ; même prudence que ``commune_code``. Sans effet non plus sur
    un CODE POSTAL, déjà un critère exact. Le cercle REMPLACE alors
    ``commune_code`` : `_list_query` bascule sur `/near_point`, qui ignore les
    critères d'aire (département/région) — voir `recherche_entreprises.py`.
    """
    city = (filters.city or "").strip()
    postal_code = city if city.isdigit() and len(city) == 5 else None
    freetext = (filters.freetext or "").strip() or None
    radius_km = filters.radiusKm if (filters.radiusKm and commune and not postal_code) else None
    latitude = commune.get("latitude") if radius_km else None
    longitude = commune.get("longitude") if radius_km else None

    return CompanyDiscoveryFilters(
        q=freetext,
        naf_code=filters.nafCode or None,
        naf_section=SECTOR_TO_NAF_SECTION.get((filters.sector or "").strip().lower()),
        department=filters.department or None,
        departments=filters.departments or None,
        region=filters.region or None,
        regions=filters.regions or None,
        revenue_min=filters.revenueMin,
        revenue_max=filters.revenueMax,
        company_category=filters.companyCategory or None,
        legal_category=filters.legalCategory or None,
        postal_code=postal_code,
        # #2490.11 — le code INSEE de la commune RÉSOLUE, jamais celui d'une
        # commune devinée : `commune` n'est posé que sur un nom qui correspond
        # exactement à ce que l'utilisateur a tapé. #2642.2 — absent quand un
        # cercle est actif : le cercle EST alors la maille demandée.
        commune_code=(commune.get("code") if commune and not postal_code and not radius_km else None),
        latitude=latitude,
        longitude=longitude,
        radius_km=radius_km,
        headcount_tranche_min=tranche_code_for_headcount(filters.headcountMin),
        headcount_tranche_max=tranche_code_for_headcount(filters.headcountMax),
        headcount_tranches=_headcount_tranches_union(filters.headcountRanges),
        creation_date_min=filters.createdAfter or None,
        creation_date_max=filters.createdBefore or None,
        # #3983.2 — « siège dans <zone> » ; `presence` = le défaut du registre.
        # Sans zone département/région il n'y a rien à baser : le critère ne part
        # pas (il enverrait la recherche chez Pappers, payant, pour rien).
        on_headquarters_only=True
        if filters.siteBasis == "headquarters"
        and (
            filters.department
            or filters.departments
            or filters.region
            or filters.regions
            or (commune and not postal_code and not radius_km)
        )
        else None,
    )


def _city_freetext(base: CompanyDiscoveryFilters, filters: DiscoverFilters) -> CompanyDiscoveryFilters:
    """Ville en toutes lettres NON résolue → recherche plein-texte, pour la
    source gouv.fr seule : son ``q`` couvre l'adresse. Chez Pappers, ``q``
    cherche une RAISON SOCIALE — y mettre « Lyon » ramènerait les sociétés
    nommées Lyon, pas les lyonnaises. On préfère le dire (`unsupported_filters`)
    que le fausser.

    #2490.11 — une ville RÉSOLUE (``base.commune_code`` posé) ne repart pas en
    plein-texte : le code INSEE porte déjà le critère, y ajouter ``q`` ne
    ferait que le dupliquer moins bien (le plein-texte matche aussi les noms).
    """
    city = (filters.city or "").strip()
    if not city or base.postal_code or base.commune_code:
        return base
    return base.model_copy(update={"q": " ".join(filter(None, [base.q, city]))})


def _radius_without_center(filters: DiscoverFilters, base: CompanyDiscoveryFilters) -> bool:
    """#4515 — un rayon est demandé sur une ville en toutes lettres, mais la commune n'a pas été résolue."""
    city = (filters.city or "").strip()
    return bool(filters.radiusKm and city and not city.isdigit() and base.radius_km is None)


def _drop_city_note_of_other_sources(degraded: list[dict], answered_by: str) -> None:
    """#4515.3 — « Non appliqué par la source… » sous le champ VILLE ne se dit que si la source qui a RÉPONDU
    l'ignore. Une autre source, essayée avant et muette, qui ne sait pas lire une ville en toutes lettres ne
    doit pas faire écrire « non appliqué » sur une liste que la source répondante a bien filtrée par la ville."""
    for entry in list(degraded):
        fields = entry.get("fields")
        if entry.get("source") == answered_by or entry.get("reason") != DegradeReason.UNSUPPORTED_FILTERS:
            continue
        if not fields or "city" not in fields:
            continue
        rest = [field for field in fields if field != "city"]
        if rest:
            entry["fields"] = rest
        else:
            degraded.remove(entry)


def _zone_fields_kept_here(
    unhonoured: Sequence[str], base: CompanyDiscoveryFilters, commune: Mapping[str, Any] | None
) -> list[str]:
    """Les critères de LIEU qu'une source n'a pas su appliquer et que la projection sait reprendre sur ses lignes.

    Mesuré en production le 27/10/2026 (lot DÉCOUVRIR-ZONE, #4641 #4420) : ``?city=Lille`` rendait 24 comptes dont
    Saint-Jean-de-Luz, Montpellier, Nevers, Arcachon, Calvi — la source gratuite n'avait rien dans les cercles, la
    source qui a RÉPONDU ignore la ville, et la modale avouait « Non appliqué ». Le rayon était affiché, pas appliqué.
    Une ville RÉSOLUE (commune ou cercle), un département, une région se relisent sur la ligne ; une ville en toutes
    lettres non résolue, non (pas de nom canonique : la note « non appliqué » reste dite)."""
    kept: list[str] = []
    if "city" in unhonoured and commune and commune.get("name") and (base.commune_code or base.radius_km):
        kept.append("city")
    kept += [field for field in ("department", "region") if field in unhonoured]
    return kept


def _kept_in_requested_zone(
    rows: list[dict], base: CompanyDiscoveryFilters, commune: Mapping[str, Any] | None, fields: Sequence[str]
) -> list[dict]:
    """Les lignes d'une source qui a ignoré la zone, gardées seulement quand elles SONT dans la zone demandée.

    Une ville : la ligne est DANS la commune (toute commune est dans tout rayon autour d'elle ; une voisine sans
    position mesurée ne se prouve pas). Un département, une région : le département de la ligne en fait partie.
    Une ligne sans lieu ne se devine pas : elle sort. Ce qui reste manquant, l'échelle de zone le cherche — nommé."""
    departments = {d for d in (base.department, *(base.departments or [])) if d}
    region_codes = [r for r in (base.region, *(base.regions or [])) if r]
    in_regions = set().union(*(region_departments(code) for code in region_codes)) if region_codes else set()
    kept: list[dict] = []
    for row in rows:
        if "city" in fields and not same_place(row.get("city"), (commune or {}).get("name")):
            continue
        if "department" in fields and departments and str(row.get("department") or "") not in departments:
            continue
        if "region" in fields and region_codes and str(row.get("department") or "") not in in_regions:
            continue
        kept.append(row)
    return kept


def _unhonoured_by(source: str, base: CompanyDiscoveryFilters, filters: DiscoverFilters) -> list[str]:
    """Les critères d'ÉCRAN que la source ne sait pas exprimer, nommés un par un.

    La source répond quand même : la liste rendue est un SUR-ensemble de ce qui
    a été coché — plus large, jamais plus courte. Nommer le critère (plutôt que
    de dire « unsupported_filters » et de laisser deviner) est ce qui permet à
    l'écran de poser la note À CÔTÉ DU FILTRE concerné, là où l'information est
    actionnable, au lieu d'un bandeau d'alerte en haut de page.

    Les noms rendus sont ceux du contrat d'écran (`sector`, `city`), pas les
    noms internes du registre : c'est l'écran qui les consomme.
    """
    if source != "pappers":
        return []
    unhonoured: list[str] = []
    # Pappers filtre sur un code NAF précis, pas sur la SECTION (facette gouv.fr).
    # #2490.4 — ni, VÉRIFIÉ, sur une LISTE de codes : qu'il la lise comme un OU
    # n'a jamais été mesuré (`pappers/discovery.py` le dit), et sa propre doc
    # annonce que gouv.fr passe devant. Ce routeur le gardait premier quand même.
    if base.naf_section or "," in (base.naf_code or ""):
        unhonoured.append("sector")
    # Pappers ne prend qu'UN département : le reste du territoire sautait.
    if len({*(base.departments or []), *([base.department] if base.department else [])}) > 1:
        unhonoured.append("department")
    # Chez Pappers, `q` cherche une raison sociale : « Lyon » y ramènerait les
    # sociétés NOMMÉES Lyon. Un code postal, lui, passe très bien.
    if (filters.city or "").strip() and not base.postal_code:
        unhonoured.append("city")
    # #2544.1 — réfuté en PRODUCTION le 18/09 au soir : une recherche en région
    # rendait ARQUUS toujours localisé VERSAILLES/78 (le siège), avec le MÊME
    # nombre de résultats filtre région posé ou non. `region=filters.region`
    # part bien vers Pappers (`to_pappers_search_params`), mais ce paramètre
    # n'a JAMAIS été VÉRIFIÉ sur une instance réelle — contrairement à
    # `department`, mesuré le 04/09/2026 — et Pappers n'a aucun équivalent à
    # `_matching_establishment` : sa ligne vient toujours du siège
    # (`pappers/discovery.py::_to_row`). Un contrat d'API non vérifiable ne se
    # devine pas (doctrine) : tant que ``region`` n'est pas mesuré chez
    # Pappers, la source qui SAIT le filtrer et l'afficher — gouv.fr,
    # ``test_discover_establishment_geo.py`` — doit passer devant.
    if base.region or base.regions:
        unhonoured.append("region")
    return unhonoured


def _is_set(value: Any) -> bool:
    """Un critère RÉELLEMENT posé : ni ``None``, ni chaîne vide, ni liste vide."""
    if value is None or value == "":
        return False
    return not (isinstance(value, list) and not value)


def _applied_filters(filters: DiscoverFilters) -> dict[str, Any]:
    """Critères réellement posés (chaînes/listes non vides), pour le score et la
    trace ``query``."""
    return {key: value for key, value in filters.model_dump().items() if _is_set(value)}


def _normalised_query(filters: DiscoverFilters, limit: int) -> dict[str, Any]:
    """Les critères RÉELLEMENT appliqués — le contrat impose de les rendre, pour
    que l'utilisateur voie sur quoi la liste a été construite."""
    return {**_applied_filters(filters), "limit": limit}


def _crossed_sectors(filters: DiscoverFilters) -> list[str]:
    """Secteurs croisés demandés — dédupliqués, ordre stable, ``all``/vides
    écartés. « Tous secteurs » n'est pas une contrainte : on ne le croise pas."""
    kept: list[str] = []
    for raw in filters.sectors or []:
        sector = (raw or "").strip().lower()
        if not sector or sector == "all" or sector in kept:
            continue
        kept.append(sector)
    return kept


def _merge_degraded(target: list[dict], entries: Sequence[dict]) -> None:
    """Ajoute des entrées ``degraded`` en dédupliquant : une même panne répétée
    à travers les secteurs croisés ne s'affiche qu'une fois."""
    seen = {(e.get("source"), e.get("reason"), tuple(e.get("fields") or [])) for e in target}
    for entry in entries:
        key = (entry.get("source"), entry.get("reason"), tuple(entry.get("fields") or []))
        if key not in seen:
            seen.add(key)
            target.append(entry)


def _merge_source_health_degraded(degraded: list[dict], correlation_id: str) -> None:
    """#4045.3 (14/10, recette prod 429335a9c8) — une panne qui n'a jamais LEVÉ
    (chaque source de signaux avale son 429/erreur réseau en interne, par
    `record_degradation`, pour ne jamais faire échouer la recherche : voir
    `france_travail.it_job_signals`, `public_tenders._boamp_tenders`) n'était
    dite NULLE PART à l'écran : elle s'écrit dans `source_health` (journal,
    supervision), mais ni le `isinstance(rows, BaseException)` de
    `_candidate_signals` ni le `TimeoutError` de `_finish_signal_tasks` ne la
    voient jamais, puisqu'elle ne lève pas — mesurée le 14/10 (`/discover?
    sectors=fintech,aerospace&headcount=250-999`) : France Travail en 429 sur
    14 appels d'une recherche, zéro ligne dans le bandeau « Résultats
    partiels », seul BOAMP (en TIME_BUDGET, une cause différente) y figurait.

    Relue UNE fois pour la page entière (comme `_merge_degraded` le fait déjà,
    jamais par carte), seules les entrées à CODE connu (`DegradeReason`)
    passent : un texte libre non traduisible ne doit jamais atteindre l'écran
    — c'est tout le sens de la distinction `code`/`reason` dans
    `source_health.record_degradation`."""
    coded = [e for e in source_health.get_public_degradations(correlation_id) if e.get("code")]
    _merge_degraded(degraded, [degraded_entry(e["source"], e["code"]) for e in coded])


async def _collect_crossed(
    subs: Sequence[DiscoverFilters],
    limit: int,
    degraded: list[dict],
    *,
    recall: bool = False,
    commune: Mapping[str, Any] | None = None,
    deadline: float | None = None,
    hard_deadline: float | None = None,
) -> list[dict]:
    """Un waterfall registre PAR sous-recherche, EN PARALLÈLE, fusionné par SIREN.

    C'est ce qui rend « secteur × secteur » exprimable en UNE recherche : chaque
    sous-recherche ne diffère que par son secteur (le reste des critères — zone,
    effectif, ancienneté — est partagé), les sous-recherches tournent ensemble
    (le wall-time reste celui d'une seule, pas ``N`` fois), et une entreprise
    trouvée par plusieurs secteurs n'est comptée qu'une fois. Les listes
    ``degraded`` par secteur sont fusionnées et dédupliquées.

    Les sous-recherches sont soit les secteurs d'écran croisés (``sectors``),
    soit — #2489.2 — les codes NAF d'une liste regroupés par SECTION.

    ``commune`` (#2490.11) est résolue UNE FOIS par l'appelant — chaque
    sous-recherche partage la même zone, seul le secteur change.

    #2521 — ``deadline`` est la PART du registre, ``hard_deadline`` le budget
    entier. Passée la part, les sous-requêtes encore en vol sont abandonnées si
    une autre a déjà rendu des lignes, et c'est DIT (``time_budget``) : la plus
    lente ne mange plus le temps du modèle. Sans aucune ligne en main, on les
    attend encore, jusqu'au budget entier — la liste passe avant l'angle.
    """
    sinks: list[list[dict]] = [[] for _ in subs]
    # #4016 L7 — la profondeur de pages se PARTAGE entre secteurs croisés : le
    # bassin fusionné en a besoin de `limit`, pas de `limit` par secteur.
    depth = -(-limit // max(1, len(subs)))
    tasks = [
        asyncio.create_task(
            _collect_registry(sub, limit, sinks[i], recall=recall, commune=commune, deadline=deadline, depth=depth)
        )
        for i, sub in enumerate(subs)
    ]

    def has_rows() -> bool:
        return any(t.done() and not t.cancelled() and t.exception() is None and t.result() for t in tasks)

    try:
        await asyncio.wait(tasks, timeout=None if deadline is None else max(0.0, deadline - time.monotonic()))
        while not has_rows() and hard_deadline is not None:
            pending = [t for t in tasks if not t.done()]
            left = hard_deadline - time.monotonic()
            if not pending or left <= 0:
                break
            await asyncio.wait(pending, timeout=left, return_when=asyncio.FIRST_COMPLETED)
        # Une sous-requête terminée en erreur d'ENTRÉE (critère invalide) se
        # propage comme avant : `.result()` la relève, l'appelant rend un 422.
        results = [t.result() if t.done() else [] for t in tasks]
    finally:
        late = [t for t in tasks if not t.done()]
        for task in late:
            task.cancel()
        if late:
            await asyncio.gather(*late, return_exceptions=True)
    if late:
        degraded.append(degraded_entry("recherche-entreprises", DegradeReason.TIME_BUDGET))

    # Fusion round-robin : chaque secteur contribue à tour de rôle, pour qu'un
    # secteur riche ne rafle pas les premières places du BASSIN. Dédup par SIREN.
    # Le bassin n'est plus borné à ``limit`` : le classement, puis la coupe à
    # ``limit``, ont lieu AVANT l'appel modèle (#2490.3) — la taille du prompt
    # d'angle ne dépend plus de celle du bassin.
    merged: dict[str, dict] = {}
    for tier in zip_longest(*results):
        for row in tier:
            if row is not None:
                merged.setdefault(row["siren"], row)
    for sink in sinks:
        _merge_degraded(degraded, sink)
    return list(merged.values())


def _naf_groups(naf_code: str | None) -> list[str]:
    """#2489.2 — une liste de codes NAF, regroupée par SECTION (ordre d'arrivée).

    Mesuré le 17/09/2026 : cinq secteurs du profil envoyés en UN seul OU
    (aéronautique, banque, santé, public, éditeurs) × Haute-Garonne rendent 25
    lignes, toutes banques, organismes publics ou santé — le registre classe par
    taille de réseau, et ces trois-là en ont les plus grands. Une requête par
    section rend à chaque secteur sa propre page. Au-delà de
    ``MAX_CROSSED_SECTORS`` sections, les dernières partagent UNE requête :
    rien n'est retiré, seul le découpage s'arrête.
    """
    groups: dict[str, list[str]] = {}
    for code in (naf_code or "").split(","):
        if code.strip():
            groups.setdefault(naf_section_of(code) or "?", []).append(code.strip())
    lists = list(groups.values())
    if len(lists) > MAX_CROSSED_SECTORS:
        kept = MAX_CROSSED_SECTORS - 1
        lists = [*lists[:kept], [code for group in lists[kept:] for code in group]]
    return [",".join(group) for group in lists]


def _zone_requested(filters: DiscoverFilters) -> bool:
    return bool(
        filters.department
        or filters.departments
        or filters.region
        or filters.regions
        or (filters.city or "").strip()
        or filters.radiusKm
    )


def _activity_requested(filters: DiscoverFilters) -> bool:
    return bool(filters.nafCode or filters.sector or filters.sectors or (filters.freetext or "").strip())


def _dedupe(rows: Sequence[dict]) -> list[dict]:
    seen: set[str] = set()
    kept: list[dict] = []
    for row in rows:
        if row["siren"] not in seen:
            seen.add(row["siren"])
            kept.append(row)
    return kept


async def _read_more_pages(
    source: str,
    source_filters: Any,
    degraded: list[dict],
    last_page: int,
    deadline: float | None,
) -> list[dict]:
    """Les pages 2..``last_page`` de la source gratuite, une à une.

    #2496 bis — chaque page est un appel de plus sur une chaîne déjà
    séquentielle : s'il ne reste plus de budget GLOBAL, on GARDE ce qui est en
    main (vrai) plutôt que d'ajouter un délai, et on le DIT — jamais
    silencieusement. Une page non pleine veut dire « registre épuisé » : on
    s'arrête là. Un appel raté ne jette jamais les pages déjà lues.
    """
    extra: list[dict] = []
    for page in range(2, last_page + 1):
        remaining = None if deadline is None else deadline - time.monotonic()
        if remaining is not None and remaining <= 0:
            degraded.append(degraded_entry(source, DegradeReason.NETWORK_ERROR))
            break
        try:
            _count_registry_call()
            page_call = _fallback_search_page(source_filters, LIST_PAGE_MAX, degraded, page=page)
            page_rows = list(await (page_call if remaining is None else asyncio.wait_for(page_call, remaining)) or [])
        except TimeoutError:
            degraded.append(degraded_entry(source, DegradeReason.NETWORK_ERROR))
            break
        except Exception as exc:  # noqa: BLE001 — un rappel raté ne jette pas les pages lues
            logger.warning("discover registry page-%s recall unavailable: %s", page, exc)
            break
        extra += page_rows
        if len(page_rows) < LIST_PAGE_MAX:
            break
    return extra


async def _collect_registry(
    filters: DiscoverFilters,
    limit: int,
    degraded: list[dict],
    *,
    recall: bool = False,
    commune: Mapping[str, Any] | None = None,
    deadline: float | None = None,
    depth: int | None = None,
) -> list[dict]:
    """Waterfall registre : Pappers d'abord, recherche-entreprises ensuite —
    SAUF quand Pappers ne sait pas honorer un critère réellement demandé.

    Toute source qui échoue — clé absente, quota, HTTP, ou module pas encore
    déployé — est INSCRITE dans ``degraded`` puis contournée. Si les deux
    tombent, on renvoie zéro ligne : l'appelant n'invoquera pas le modèle.

    ## L'ORDRE, et pourquoi il ne peut pas être fixe

    Il l'était, et c'est ce qui produisait « Découvrir me rend des entreprises
    qui n'ont rien à voir avec mes filtres » (retour du 31/08/2026).

    Pappers ne sait pas filtrer sur une SECTION NAF — il la jette, délibérément,
    et son code le dit (``pappers/discovery.py`` : *« intentionally dropped
    rather than approximated »*). Interrogé en premier avec un secteur coché, il
    répondait donc une liste bâtie sur le RESTE des critères, le
    ``if resolved: return resolved`` la rendait, et ``recherche-entreprises`` —
    la SEULE source capable de le faire, via ``section_activite_principale`` —
    n'était jamais appelée. Dès que ``PAPPERS_API_KEY`` est posée, cocher un
    secteur n'avait aucun effet sur les résultats.

    Le comportement était documenté (« la liste est un SUR-ensemble de ce qui a
    été coché ») et honnête sur le principe. Il ne l'était pas en pratique : la
    note « non appliqué » est posée à côté du FILTRE, et c'est la LISTE qu'on
    lit.

    La règle, donc : **une source qui ne sait pas honorer un critère réellement
    demandé ne passe pas devant une source qui le sait.** Le tri est STABLE, si
    bien que sans critère problématique l'ordre reste Pappers d'abord — il est
    plus riche, et le chemin est byte-identique à ce qu'il était.

    Ce n'est pas un remplacement de la note ``unsupported_filters`` : elle reste
    émise pour la source reléguée. Corriger la liste ne dispense pas de dire ce
    que chaque source savait faire.
    """
    base = _registry_filters(filters, commune=commune)

    providers = {"pappers": _registry_search, "recherche-entreprises": _fallback_search}
    only = _ONLY_REGISTRY_SOURCES.get()
    sources = tuple((name, providers[name]) for name in REGISTRY_SOURCE_NAMES if not only or name in only)
    # `sorted` est STABLE : à nombre égal de critères non honorés — le cas
    # courant, zéro partout — l'ordre d'origine est conservé intact.
    ordered = sorted(sources, key=lambda pair: len(_unhonoured_by(pair[0], base, filters)))

    for source, provider in ordered:
        source_filters = base if source == "pappers" else _city_freetext(base, filters)
        unhonoured = _unhonoured_by(source, base, filters)
        # Lot DÉCOUVRIR-ZONE (27/10) — un lieu que la source ignore mais que la ligne porte est REPRIS ici : il est
        # appliqué, l'écran ne dit plus « non appliqué » pour lui. Le reste est dit, comme avant.
        kept_here = _zone_fields_kept_here(unhonoured, base, commune)
        if note := [field for field in unhonoured if field not in kept_here]:
            degraded.append(degraded_entry(source, DegradeReason.UNSUPPORTED_FILTERS, fields=note))
        # #2490.3 — la source gratuite rend une page PLEINE (son maximum) : le
        # classement puis la coupe à ``limit`` se font après, sur un bassin plus
        # large. La source facturée garde ``limit`` : on ne paie pas le bassin.
        page_size = limit if source == "pappers" else max(limit, LIST_PAGE_MAX)
        try:
            _count_registry_call()
            rows = list(await provider(source_filters, page_size, degraded) or [])
        except Exception as exc:  # noqa: BLE001 — une source HS ne doit jamais mentir
            reason = type(exc).__name__ if isinstance(exc, ImportError) else str(exc) or "error"
            logger.warning("discover registry source %s unavailable: %s", source, exc)
            degraded.append({"source": source, "reason": reason[:200]})
            continue
        if source != "pappers" and len(rows) >= LIST_PAGE_MAX:
            # #2490.9 — `departement=31` retient une entreprise dont UN
            # établissement est dans le 31 : la première page est surtout faite de
            # réseaux nationaux au siège ailleurs (10 sièges locaux sur 25 pour
            # l'aéronautique, mesuré le 17/09/2026), et AIRBUS OPERATIONS — siège
            # à Toulouse — n'arrive qu'en page 2. Un appel gratuit de plus.
            #
            # #4016 L7 — « Voir plus » sans palier : au-delà d'une page, la
            # source gratuite est lue sur AUTANT de pages que la profondeur
            # demandée (`depth`, le `limit` ou sa part par secteur croisé),
            # bornée par `MAX_REGISTRY_PAGES`.
            wanted = depth if depth is not None else limit
            last_page = min(max(-(-wanted // LIST_PAGE_MAX), 2 if recall else 1), MAX_REGISTRY_PAGES)
            rows += await _read_more_pages(source, source_filters, degraded, last_page, deadline)
        resolved = _dedupe([projected for row in rows if (projected := _registry_row(row))])
        if kept_here:
            resolved = _kept_in_requested_zone(resolved, base, commune, kept_here)
        if resolved:
            # #4515 — un rayon demandé sans ville RÉSOLUE n'a pas de centre : il n'a pas été appliqué, et la source
            # qui a RÉPONDU le dit sous le champ VILLE (jamais un rayon affiché et silencieusement ignoré).
            if _radius_without_center(filters, base) and not any(
                d.get("source") == source and "city" in (d.get("fields") or []) for d in degraded
            ):
                degraded.append(degraded_entry(source, DegradeReason.UNSUPPORTED_FILTERS, fields=["city"]))
            else:
                _drop_city_note_of_other_sources(degraded, source)
            return resolved
        # « Rien ne correspond » est une RÉPONSE, pas une panne — et c'est le cas
        # courant du waterfall (Pappers ne matche rien, gouv.fr prend le relais).
        # L'entrée reste dite, mais cadrée : la peindre en ambre faisait du
        # bandeau un bruit permanent.
        degraded.append(degraded_entry(source, NO_MATCH_REASON))
    return []


def _drive_query_text(query: Mapping[str, Any], profile_data: Mapping[str, Any]) -> str:
    """Le texte qui interroge le Drive interne : les critères appliqués (texte libre,
    secteurs, zone), à défaut les offres déclarées de l'ESN. Jamais un SIREN."""
    parts: list[str] = []
    for key, value in (query or {}).items():
        if key == "limit":
            continue
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())
        elif isinstance(value, (list, tuple)):
            parts.extend(str(v).strip() for v in value if isinstance(v, str) and v.strip())
    if not parts:
        offers = (profile_data or {}).get("offers")
        if isinstance(offers, (list, tuple)):
            parts.extend(str(v).strip() for v in offers if str(v).strip())
    return "sélection de comptes " + " ".join(parts) if parts else ""


async def _angles_by_siren(
    companies: Sequence[Mapping[str, Any]], profile_data: dict, query: dict, degraded: list[dict]
) -> dict[str, dict]:
    """L'unique appel modèle : l'angle commercial, indexé par SIREN.

    Tout ce que le modèle renvoie hors des SIREN fournis est ignoré, et un
    éventuel score est jeté — le score reste calculé. Un échec dégrade l'angle,
    jamais les faits : les candidats sont déjà vrais sans lui.
    """
    # #3586 — savoir métier du Drive interne : UN appel par requête Découvrir (jamais
    # par SIREN), injecté au prompt d'angle. Vide ⇒ prompt byte-identique.
    drive_context = await rag_knowledge.retrieve_drive_context(_drive_query_text(query, profile_data))
    try:
        result, _usage = await call_claude(
            build_system_prompt(profile_data),
            build_angle_user_prompt(list(companies), query, internal_knowledge=drive_context),
            response_model=dict,
            model=CLAUDE_HAIKU_MODEL,
            # #2521 (suite) — proportionné à `ANGLE_CANDIDATE_LIMIT`, pas à la
            # taille de page : la borne du nombre de candidats est ce qui tient
            # l'appel dans sa part de budget, `max_tokens` suit.
            max_tokens=ANGLE_MAX_TOKENS,
            prompt_name="bellum_discover",
            # #2521 (suite) — file dédiée à l'interactif (déjà éprouvée côté
            # copilote, 16/08/2026) : cet appel tombe dans le MÊME tour HTTP
            # qu'un commercial attend à l'écran, il ne doit pas manger son
            # budget de temps derrière une analyse de fond en cours. Même
            # modèle, même coût — seul le seau de départ change.
            metadata=CallMetadata(prompt_name="bellum_discover", throttle_provider="claude_chat"),
        )
    except Exception as exc:  # noqa: BLE001 — l'angle est un bonus, pas un fait
        logger.warning("discover angle generation failed: %s", exc)
        degraded.append({"source": "claude", "reason": str(exc)[:200] or "error"})
        return {}

    known = {company["siren"] for company in companies}
    angles: dict[str, dict] = {}
    for item in (result or {}).get("angles") or []:
        if not isinstance(item, Mapping):
            continue
        siren = _clean_siren(item.get("siren"))
        if siren not in known:
            # Un SIREN que le modèle a inventé ou déformé : il n'entre pas.
            continue
        roles = [
            {"title": role["title"].strip(), "department": str(role.get("department") or "").strip()}
            for role in item.get("suggestedRoles") or []
            if isinstance(role, Mapping) and isinstance(role.get("title"), str) and role["title"].strip()
        ]
        angles[siren] = {"angle": _text_or_none(item.get("angle")), "suggestedRoles": roles}
    return angles


# ── Routes ──────────────────────────────────────────────────────────────────


@router.post("/registry", response_model=DiscoverRegistryResponse)
async def discover_registry(req: DiscoverRegistryRequest, request: Request = None) -> DiscoverRegistryResponse:  # type: ignore[assignment]
    """Découverte ancrée sur le registre : (secteur ×) NAF × département × effectif × âge."""
    # #3901.14 — deux recherches identiques et simultanées partagent UN travail (pas un cache).
    work = single_flight(req, lambda: _discover_registry_budgeted(req))
    # #4490.2 — « Arrêter » : le client qui se déconnecte coupe le travail (le dernier attendant d'un travail
    # partagé l'arrête, voir `single_flight`) ; aucune étape payante ne part après l'arrêt.
    return await (work if request is None else run_or_cancel(request, work))


async def _discover_registry_budgeted(req: DiscoverRegistryRequest) -> DiscoverRegistryResponse:
    """Louis 01/11/2026 — le budget de crédits TheirStack vit le temps de CETTE requête, toutes moissons confondues."""
    with discover_skill_offers.request_credit_budget():
        return await _discover_registry_once(req)


async def _discover_registry_once(req: DiscoverRegistryRequest) -> DiscoverRegistryResponse:
    limit = max(1, min(req.limit, MAX_REGISTRY_LIMIT))
    degraded: list[dict] = []
    # #2496 bis — l'horloge du budget GLOBAL, posée AVANT la première étape :
    # elle couvre toute la chaîne séquentielle (lecture, ville, page 1, rappel de
    # page 2, angle), pas seulement une partie.
    started = time.monotonic()
    # #2521 — la part du registre (ville, pages, rappel) ; le reste est au modèle.
    # #4677.1 — `deadline` est celle de la LISTE ; la moisson des signaux a la sienne, plus tardive.
    registry_deadline, deadline, signals_deadline = _budget_clocks(started)

    # #2490 / #2496 — la demande en langage naturel est LUE avant le registre :
    # ce qu'elle dit (lieu, secteur, type d'entreprise) filtre la requête, et la
    # phrase ne part plus en plein-texte. Rien de reconnu et rien de coché :
    # AUCUN résultat, avec la raison — jamais le registre entier.
    filters = req.filters
    reading: dict[str, Any] | None = None
    place_lookup: _PlaceLookup | None = None
    place_holder: dict[str, Any] = {}
    place_token = _PLACE_NOTE.set(place_holder)
    if (filters.freetext or "").strip():
        filters, reading, place_lookup = await _apply_reading(filters, registry_deadline)
    query = _normalised_query(filters, limit)
    shown_query = {**query, "reading": reading} if reading is not None else query
    applied = _applied_filters(filters)
    recommended = recommended_sort(req.profile_data)
    if reading is not None and reading["unreadable"]:
        _PLACE_NOTE.reset(place_token)
        return DiscoverRegistryResponse(
            candidates=[], query=shown_query, degraded=degraded, recommendedSort=recommended
        )

    only_token = _ONLY_REGISTRY_SOURCES.set(tuple(req.onlySources or ()))
    calls = [0]
    calls_token = _REGISTRY_CALLS.set(calls)
    signals_token = _SIGNALS_DEADLINE.set(signals_deadline)
    origin_counts: dict[str, int] = {}
    origins_token = _ORIGIN_COUNTS.set(origin_counts)
    step_timings: dict[str, float] = {}
    timings_token = _STEP_TIMINGS.set(step_timings)
    candidates = 0
    try:
        response = await _discover_registry_collected(
            req, filters, place_lookup, limit, degraded, applied, registry_deadline, deadline, query, shown_query
        )
        candidates = len(response.candidates)
        effort = _search_effort(calls[0], candidates=candidates, limit=limit, degraded=degraded)
        if effort is not None:
            response.query = {**response.query, "searchEffort": effort}
        if place_holder.get("note"):
            # #4429.6 — la correction / l'homonyme / l'absence de commune est DITE avec la liste.
            response.query = {**response.query, "placeResolution": place_holder["note"]}
        return response
    finally:
        _PLACE_NOTE.reset(place_token)
        _REGISTRY_CALLS.reset(calls_token)
        _SIGNALS_DEADLINE.reset(signals_token)
        _ORIGIN_COUNTS.reset(origins_token)
        _STEP_TIMINGS.reset(timings_token)
        _ONLY_REGISTRY_SOURCES.reset(only_token)
        # #4305 — le budget d'appels par recherche se MESURE : un compteur, jamais un contenu.
        # #4363.1 — et sa durée : trois nombres (appels, ms, candidats), ni critère, ni nom, ni fournisseur.
        elapsed_ms = round((time.monotonic() - started) * 1000)
        # #4791.5 — et l'ORIGINE des candidats rendus (registre, offres, base commune) : des nombres seulement.
        origins = " ".join(f"{origin}={origin_counts.get(origin, 0)}" for origin in CANDIDATE_ORIGINS)
        # Lot R — quand la base commune ne rapporte rien, le journal dit POURQUOI (jamais un contenu) : l'API n'a
        # rien envoyé (no_rows ; sa panne est journalisée côté API) ou ce qu'elle a envoyé a été écarté (filtered).
        origins += _common_base_reason(len(req.commonBaseCandidates), origin_counts.get("common_base", 0))
        logger.info(
            "discover registry_calls=%d duration_ms=%d candidates=%d %s", calls[0], elapsed_ms, candidates, origins
        )
        steps_line = _format_step_timings(step_timings)
        if steps_line:
            logger.info(steps_line)


async def _discover_registry_collected(
    req: DiscoverRegistryRequest,
    filters: Any,
    place_lookup: _PlaceLookup | None,
    limit: int,
    degraded: list[dict],
    applied: dict[str, Any],
    registry_deadline: float,
    deadline: float,
    query: dict[str, Any],
    shown_query: dict[str, Any],
) -> DiscoverRegistryResponse:
    recommended = recommended_sort(req.profile_data)
    # COMPETENCE-TROUVE — une compétence posée TROUVE les comptes par leurs offres, quel que soit le mode.
    skills = skill_terms(filters.keywords, filters.technologiesObserved)
    if skills:
        return await _discover_by_skill(
            req,
            filters,
            skills,
            limit,
            degraded,
            applied,
            registry_deadline,
            deadline,
            query,
            shown_query,
            place_lookup=place_lookup,
        )
    zone_widening: dict[str, Any] = {}
    with wait_deadline(deadline):
        # #2521 — toute attente d'un limiteur (jeton, créneau, refroidissement
        # après un 429) est bornée par le budget entier : jamais 30 s d'attente
        # pour une recherche qui en a 20. Le modèle, lui, est hors de ce bloc :
        # sa propre attente est déjà bornée par `wait_for` plus bas.
        with _timed_step("collect"):
            companies = await _collect_for_request(
                filters, place_lookup, limit, degraded, applied, registry_deadline, deadline, zone_out=zone_widening
            )
        if not req.strictCriteria:
            with _timed_step("widen"):
                companies, widening = await _widen_registry(
                    filters, companies, place_lookup, limit, degraded, applied, registry_deadline, deadline
                )
            if widening is not None:
                shown_query = {**shown_query, "widening": widening}
    # #4793.1 — la base commune entre ICI, avant le « zéro » : elle est une source, pas une annotation.
    with _timed_step("market_memory"):  # #4617.6 — l'étape se mesure (ms, jamais un contenu)
        await _with_market_memory(req, degraded, deadline=deadline)
    companies = _with_common_base(companies, req, limit)
    if not companies:
        # Zéro source ou zéro correspondance : on rend zéro candidat AVEC la
        # raison. Le modèle n'est pas appelé — on ne lui laisse pas remplir le
        # vide, c'est exactement le bug de la v1.
        # 2710N — « cherché jusqu'à la région, sans compte de plus » se dit même à zéro compte (le seul cas où le
        # bandeau existe sans aucune ligne).
        return DiscoverRegistryResponse(
            candidates=[],
            query=shown_query,
            degraded=degraded,
            recommendedSort=recommended,
            zoneWidening=zone_widening_of_list(zone_widening, []) if zone_widening else None,
        )
    with _timed_step("rank"):
        return await _rank_and_angle(
            req, filters, limit, query, shown_query, applied, degraded, companies, deadline, zone_widening=zone_widening
        )


def _headcount_requested(filters: DiscoverFilters) -> list[tuple[int, int | None]]:
    """Les intervalles d'effectif DEMANDÉS (tranches cochées, sinon min/max) ; ``[]`` = aucun."""
    # #4436 — le contrat envoie `headcountMin`/`headcountMax` par tranche (`discoverRegistryFiltersSchema`) ;
    # `min`/`max` restent lus pour un appelant d'avant.
    ranges = [
        (int(r.get("headcountMin", r.get("min")) or 0), r.get("headcountMax", r.get("max")))
        for r in filters.headcountRanges or []
        if isinstance(r, Mapping)
    ]
    if ranges:
        return ranges
    if filters.headcountMin is not None or filters.headcountMax is not None:
        return [(filters.headcountMin or 0, filters.headcountMax)]
    return []


def _headcount_fits(row: Mapping[str, Any], wanted: list[tuple[int, int | None]]) -> bool:
    """Un effectif INCONNU passe (non mesuré n'est pas « hors tranche ») ; un effectif connu doit recouper."""
    if not wanted:
        return True
    known = parse_headcount_range(row.get("headcountRange"))
    if known is None:
        return True
    low, high = known
    return any((high is None or high >= w_low) and (w_high is None or low <= w_high) for w_low, w_high in wanted)


async def _discover_by_skill(
    req: DiscoverRegistryRequest,
    filters: DiscoverFilters,
    skills: list[str],
    limit: int,
    degraded: list[dict],
    applied: dict[str, Any],
    registry_deadline: float,
    deadline: float,
    query: dict[str, Any],
    shown_query: dict[str, Any],
    place_lookup: _PlaceLookup | None = None,
) -> DiscoverRegistryResponse:
    """COMPETENCE-TROUVE (Louis 20/10) — la liste part des OFFRES qui citent la compétence dans la zone.

    F — le tirage registre (zone × effectif) n'est pas lancé : ses comptes sans preuve de la compétence ne
    s'affichent pas (« on n'affiche pas ce qu'on n'a pas »), et ceux qui en ont une sont déjà trouvés par
    leurs offres — l'appeler ne coûterait que du temps et des appels. L'effectif demandé reste un critère
    (un effectif inconnu passe). Zéro résultat : ``query.skillSearch.emptyCause`` dit pourquoi."""
    zone = zone_departments(
        filters.regions or ([filters.region] if filters.region else []),
        filters.departments or ([filters.department] if filters.department else []),
        filters.city,
    )
    # Recette 21/10 B.3 — une VILLE (pas un code postal) filtre sur la ville, le département n'est que le périmètre de lecture.
    typed_city = (filters.city or "").strip()
    only_city = typed_city if typed_city and not (typed_city.isdigit() and len(typed_city) == 5) else None
    place_lookup, centre, radius_km = await _skill_city_reach(filters, place_lookup, only_city, registry_deadline)
    # #4675 — le rayon part à la source avec la commune RÉSOLUE ; jamais sur un département / une région demandés.
    explicit_zone = bool(filters.departments or filters.department or filters.regions or filters.region)
    commune_code = None if explicit_zone or not centre else str((place_lookup.commune or {}).get("code") or "") or None
    begin_identity_memo()  # lot 789 — un employeur déjà résolu par une passe n'est pas redemandé par la suivante
    found = await find_skill_accounts(
        skills,
        zone,
        req.profile_data,
        deadline=registry_deadline,
        city=only_city,
        commune_code=commune_code,
        limit=limit,  # lot 790 — la passe exacte s'arrête à `limit × 2` comptes confirmés
        **({"user_id": req.userId} if req.userId else {}),
        **_circle(centre, radius_km),
    )
    _say_registry_refused(found.info, degraded)  # #4617 — un registre qui refuse se DIT
    wanted = _headcount_requested(filters)
    # #4420.4 a — un secteur coché FILTRE : les comptes hors secteur sont écartés ET comptés (par SIREN).
    sector_naf = _sector_naf_asked(filters)
    outside_sector: set[str] = set()
    every = _keep_in_sector(_skill_rows(found.accounts), sector_naf, outside_sector)
    # #4420.4 — la section des intermédiaires (ESN, cabinets) est une liste affichée comme une autre : le secteur
    # coché la filtre aussi (mesuré en prod le 29/10 : GIE AXA, « Conseil en systèmes », sortait sous Fintech).
    intermediaries = _keep_in_sector(found.intermediaries, sector_naf, outside_sector)
    companies = [row for row in every if _headcount_fits(row, wanted)]
    info = {**found.info, "outsideHeadcount": len(every) - len(companies)}
    exact_empty = not companies
    widening = None
    zone_widening: dict[str, Any] = {}
    if not req.strictCriteria:
        # #4429.2 — la ZONE s'élargit avant la compétence : « Toulouse » reste le périmètre, exacts en tête.
        companies = await _widen_skill_by_zone(
            skills,
            companies,
            filters,
            place_lookup,
            typed_city,
            wanted,
            req.profile_data,
            registry_deadline,
            zone_widening,
            target=widen_target(limit),
        )
        companies, widening = await widen_rows(
            companies,
            _skill_widening_steps(
                skills,
                zone,
                req.profile_data,
                registry_deadline,
                only_city,
                wanted,
                centre=centre,
                radius_km=radius_km,
                user_id=req.userId,
            )
            + _size_widening_steps_from(every, wanted),
            key=lambda row: str(row.get("siren") or ""),
            # #4419.8 — « Voir 10 de plus » (``limit`` 20) va chercher le palier voisin : le seuil fixe (10)
            # faisait relire la même liste exacte, et la suite n'arrivait jamais.
            min_results=widen_target(limit),
            has_time=lambda: time.monotonic() < registry_deadline,
        )
    if sector_naf:
        companies = _keep_in_sector(companies, sector_naf, outside_sector)
        info["outsideSector"] = len(outside_sector)
    if exact_empty and found.info.get("emptyCause") is None:
        info["emptyCause"] = "outside_headcount"
    if len(companies) < limit and req.spaceKey:
        # #4430 (Louis 21/10) — moins que demandé : Laura et Découvrir VONT CHERCHER, au lieu de rendre
        # zéro. Les comptes de la zone (tirage registre) passent par le plan d'offres fraîches ; seul un
        # compte dont une offre LUE cite la compétence entre, sous les comptes trouvés d'abord.
        companies, info = await _fill_skill_search(
            req,
            filters,
            skills,
            companies,
            info,
            limit,
            degraded,
            applied,
            registry_deadline,
            deadline,
            sector_naf,
            outside_sector,
        )
        if sector_naf:
            info["outsideSector"] = len(outside_sector)  # #4420.4 — « N écartés » inclut ceux du remplissage
    # #4419.8 — une liste courte parce qu'une source n'a pas abouti n'est pas une source ÉPUISÉE : la réponse
    # le dit, et l'écran garde « Voir 10 de plus » (les autres sources et le palier voisin continuent).
    info = {**info, "more": _skill_search_unfinished(info, degraded)}
    skill_query = {**shown_query, "skillSearch": info}
    if funnel := _skill_funnel(info, kept=len(companies) - int(zone_widening.get("widenedCount") or 0)):
        skill_query["funnel"] = funnel
    if widening is not None:
        skill_query["widening"] = widening
    elif not req.strictCriteria and (tried := _skill_widening_tried(skills)):
        # #4434.3 — des voisins ont été TENTÉS et n'ont rien rendu : la réponse les NOMME, elle ne rend pas un zéro sec.
        skill_query["wideningTried"] = tried
    # #4793.1 — même entrée de la base commune sur le chemin compétence.
    with _timed_step("market_memory"):  # #4617.6 — l'étape se mesure (ms, jamais un contenu)
        await _with_market_memory(req, degraded, deadline=deadline)
    companies = _with_common_base(companies, req, limit)
    if not companies:
        return DiscoverRegistryResponse(
            candidates=[],
            query=skill_query,
            degraded=degraded,
            recommendedSort=recommended_sort(req.profile_data),
            skillIntermediaries=intermediaries,
            skillPendingEmployers=found.pending,
        )
    response = await _rank_and_angle(
        req,
        filters,
        limit,
        query,
        skill_query,
        applied,
        degraded,
        companies,
        deadline,
        skill_mode=True,
        zone_widening=zone_widening,
    )
    response.skillIntermediaries = intermediaries
    response.skillPendingEmployers = found.pending
    return response


def _circle(centre: tuple[float, float] | None, radius_km: float | None) -> dict[str, Any]:
    """Les arguments du cercle pour ``find_skill_accounts`` — aucun sans cercle (l'appel reste celui d'avant)."""
    return {"centre": centre, "radius_km": radius_km} if centre and radius_km else {}


async def _skill_city_reach(
    filters: DiscoverFilters, place_lookup: _PlaceLookup | None, only_city: str | None, registry_deadline: float
) -> tuple[_PlaceLookup | None, tuple[float, float] | None, float | None]:
    """#4515 / #4641 — le cercle d'une VILLE sur le chemin compétence : ``(lieu résolu, centre, rayon)``.

    ⚠️ c144 (Louis 27/10/2026 au soir) : une ville cherche dans 100 km par DÉFAUT, puis département, région — paliers
    nommés, l'automatique plafonne à la région (renverse c143, qui allait jusqu'à la France ; les 25 km de #4515 aussi).
    Mesure prod du 27/10 : le rayon affiché « 100 km » n'était jamais lu ici. Le rayon demandé (sinon le défaut) est
    appliqué autour du centre de la commune RÉSOLUE, une fois ; « Lille seule » (``zoneStrict``) n'a pas de cercle, une
    commune sans position non plus (le cercle ne se devine pas : la ville stricte, puis les paliers nommés)."""
    if not only_city:
        return place_lookup, None, None
    if place_lookup is None:
        commune, _, _ = await _resolve_place_within_share([only_city], registry_deadline, fuzzy=True)
        place_lookup = _PlaceLookup(commune)
    commune = place_lookup.commune or {}
    lat, lon = commune.get("latitude"), commune.get("longitude")
    if filters.zoneStrict or not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return place_lookup, None, None
    return place_lookup, (float(lat), float(lon)), float(filters.radiusKm or DEFAULT_CITY_RADIUS_KM)


async def _widen_skill_by_zone(
    skills: Sequence[str],
    exact: list[dict],
    filters: DiscoverFilters,
    place_lookup: _PlaceLookup | None,
    typed_city: str,
    wanted: list[tuple[int, int | None]],
    profile: Mapping[str, Any],
    registry_deadline: float,
    zone_out: dict[str, Any],
    *,
    target: int = CRITERIA_WIDEN_MIN_RESULTS,
) -> list[dict]:
    """#4429.2 — recherche par compétence : sous ``ZONE_WIDEN_MIN_RESULTS`` comptes, la ville s'élargit seule, UN
    barreau à la fois : son département, puis sa région (⚠️ c144, Louis 27/10/2026 au soir : l'automatique plafonne à la
    région, jamais de lecture « France » — renverse c143 ; `ZONE_AUTO_MAX_TIER`, via `_tiers_to_try`).

    Le moteur d'offres lit des départements, pas un cercle : le barreau « 100 km » n'existe pas ici. Les exacts gardent leur place
    en tête ; un compte ajouté porte le premier barreau qui l'a trouvé (``zone``) ; le dernier barreau atteint et la
    liste des barreaux franchis sont écrits dans ``zone_out``. « Toulouse seule » (``zoneStrict``), un rayon, un code
    postal, un département ou une région demandés : rien ne s'élargit (la maille est voulue)."""
    commune = place_lookup.commune if place_lookup else None
    if commune is None and place_lookup is None and typed_city:
        commune, _, _ = await _resolve_place_within_share([typed_city], registry_deadline, fuzzy=True)
    if not typed_city or not _widenable_city(filters, commune) or not commune:
        return exact
    # #4673.1 — la cible est le volume demandé (``target``), plus 25 fixe.
    if not needs_zone_widening(len(exact), target):
        return exact

    department = str(commune.get("department") or "").strip()
    region = str(commune.get("region") or "").strip()
    scopes: list[tuple[str, list[str]]] = []
    if department:
        scopes.append(("department", [department]))
    if region and region_departments(region):
        scopes.append(("region", list(region_departments(region))))
    allowed = _tiers_to_try(filters)
    seen = {row.get("siren") for row in exact}
    added: list[dict] = []
    steps: list[str] = []
    for tier, zone in scopes:
        if tier not in allowed:
            continue
        if time.monotonic() >= registry_deadline:
            break
        with named_pass(f"widen_{tier}"):
            found = await find_skill_accounts(list(skills), zone, profile, deadline=registry_deadline, city=None)
        steps.append(tier)
        fresh = [r for r in _skill_rows(found.accounts) if r.get("siren") not in seen and _headcount_fits(r, wanted)]
        await _locate_rows(fresh, registry_deadline)  # #5069 (lot 777) — distance depuis la commune du compte
        for row in fresh:
            if row.get("siren") in seen:
                continue
            seen.add(row.get("siren"))
            added.append({**row, "zone": _candidate_zone(row, commune, tier)})
        if not needs_zone_widening(len(exact) + len(added), target):
            break
    capped = auto_cap_reached(steps, len(exact) + len(added), target)
    if not steps or not (added or capped):
        return exact
    zone_out.update(
        {
            "place": commune.get("name"),
            "tier": steps[-1],
            "steps": steps,
            "exactCount": len(exact),
            "widenedCount": len(added),
            **({"autoCapReached": True} if capped else {}),
        }
    )
    if area := _tier_area(commune, steps[-1]):
        zone_out["area"] = area
    return exact + added


def _skill_funnel(info: Mapping[str, Any], *, kept: int) -> dict[str, Any] | None:
    """#4419 — l'entonnoir de la recherche par compétence, en EMPLOYEURS : entrés = ceux que les offres ont nommés
    (ville comprise), retenus = ceux qui passent tous les critères ; chaque critère dit ce qu'il a écarté. Les
    comptes que l'élargissement de zone ajoute ensuite ne sont pas des « retenus » : ils sont dits à part
    (``query.zoneWidening``). Un compteur que l'amont n'a pas posé est absent (jamais « 0 »)."""
    found = info.get("employersFound")
    if not isinstance(found, int):
        return None
    outside_city = int(info.get("outsideCityEmployers") or 0)
    outside_zone = int(info.get("outsideZone") or 0)
    return build_funnel(
        entered=found + outside_city + outside_zone,
        kept=max(0, kept),
        rejected={
            "city": outside_city,
            "zone": outside_zone,
            "headcount": info.get("outsideHeadcount"),
            "sector": info.get("outsideSector"),
        },
    )


def _registry_refusals(info: Mapping[str, Any]) -> int:
    """Employeurs que le registre public a REFUSÉ de résoudre (429, panne, circuit ouvert) — un seul prédicat pour
    la ligne ``degraded`` (#4617) et le « recherche inachevée » (#4419.8)."""
    return int((info.get("resolutionFailures") or {}).get("unavailable") or 0)


def _say_registry_refused(info: Mapping[str, Any], degraded: list[dict[str, Any]]) -> None:
    """#4617 / #4518 — des employeurs n'ont pas été identifiés parce que le registre public a REFUSÉ (429, panne,
    circuit ouvert) : l'écran le DIT par la ligne ``degraded`` de la source, au lieu d'une liste courte muette.
    Une seule ligne par source ; aucune quand tout a été lu."""
    if _registry_refusals(info) <= 0 or any(
        entry.get("source") == recherche_entreprises.SOURCE_NAME for entry in degraded
    ):
        return
    degraded.append(degraded_entry(recherche_entreprises.SOURCE_NAME, recherche_entreprises.registry_refusal_reason()))


def _skill_search_unfinished(info: Mapping[str, Any], degraded: Sequence[Mapping[str, Any]]) -> bool:
    """#4419.8 — la recherche par compétence a-t-elle laissé des employeurs NON lus (registre public non joint,
    budget de temps, plafond de résolution, source tombée) ? Oui : une nouvelle demande peut rendre plus."""
    return bool(
        info.get("deadlineCut")
        or int(info.get("beyondCap") or 0) > 0
        or int(info.get("notAttempted") or 0) > 0
        or _registry_refusals(info) > 0
        or any("kind" not in entry for entry in degraded)
    )


def _sector_naf_asked(filters: DiscoverFilters) -> list[str]:
    """#4420.4 a — les codes NAF du secteur coché (l'écran les envoie en ``nafCode`` ; ``sector``/``sectors`` sinon)."""
    codes = [c.strip() for c in (filters.nafCode or "").split(",") if c.strip()]
    if not codes:
        codes = naf_codes_for_sectors([*(filters.sectors or []), *([filters.sector] if filters.sector else [])])
    return [_norm_naf(code) for code in codes]


def _norm_naf(code: object) -> str:
    return str(code or "").replace(".", "").strip().upper()


def _keep_in_sector(rows: list[dict], sector_naf: Sequence[str], outside: set[str]) -> list[dict]:
    """#4420.4 a — garde les comptes du secteur ; un NAF non publié reste (non mesuré n'est pas « hors secteur »)."""
    if not sector_naf:
        return rows
    kept: list[dict] = []
    for row in rows:
        naf = _norm_naf(row.get("nafCode"))
        if naf and not any(naf.startswith(wanted) for wanted in sector_naf):
            outside.add(str(row.get("siren") or ""))
        else:
            kept.append(row)
    return kept


def _skill_rows(accounts: Sequence[Mapping[str, Any]]) -> list[dict]:
    """Les comptes trouvés par leurs offres, au format d'une ligne registre, leur preuve gardée."""
    evidence = {a["siren"]: a["skillEvidence"] for a in accounts}
    rows = [row for row in (_registry_row(a) for a in accounts) if row is not None]
    return [{**row, "skillEvidence": evidence[row["siren"]]} for row in rows]


def _skill_widening_steps(
    skills: Sequence[str],
    zone: Sequence[str],
    profile: Mapping[str, Any],
    deadline: float,
    city: str | None,
    wanted: list[tuple[int, int | None]],
    *,
    centre: tuple[float, float] | None = None,
    radius_km: float | None = None,
    user_id: str | None = None,
) -> list[tuple[str, int, WideningFetch]]:
    """#4434 — les paliers de la PREMIÈRE compétence posée : sa famille, puis son domaine. Chaque palier cherche
    au plus ``SKILL_MAX_TERMS`` termes (même borne d'appels que la recherche exacte). #4515 — dans le MÊME cercle que
    la recherche exacte (``centre``/``radius_km``) : un voisin de compétence ne relâche jamais la zone."""
    from app.services.discover_skill_offers import SKILL_MAX_TERMS

    steps: list[tuple[str, int, WideningFetch]] = []
    # #4519 (moteur) — une EXPERTISE se cherche déjà par ses métiers (``harvest_terms``) : la relâcher par son libellé
    # (domaine « web », ou OU « Data » / « Intelligence ») ramène des comptes hors métier. Aucun palier de libellé.
    if skills and expertise_trade_terms(skills[0]):
        return steps
    tiers = skill_widening_tiers(skills[0]) if skills else []
    # #4400.1 — une saisie de plusieurs mots que le référentiel ne connaît pas (« archi cyber ») : si l'ET strict
    # ne rend rien, le palier OU est tenté — chaque mot seul, sous sa forme étendue ; ce que ça ajoute est
    # étiqueté « proche » (même grammaire que #4433), les comptes exacts restant en tête.
    or_items = [(term, term) for term in or_terms(skills[0])] if skills and not tiers else []
    if or_items:
        tiers = [(1, or_items)]
    for tier, items in tiers:
        terms = items[:SKILL_MAX_TERMS]

        async def fetch(
            terms: list[tuple[str, str]] = terms, label: str = f"widen_skill_t{tier}"
        ) -> list[tuple[dict[str, Any], str | None]]:
            code_of = {search: code for code, search in terms}
            with named_pass(label):
                found = await find_skill_accounts(
                    [search for _, search in terms],
                    zone,
                    profile,
                    deadline=deadline,
                    city=city,
                    **({"user_id": user_id} if user_id else {}),
                    **_circle(centre, radius_km),
                )
            return [
                (row, code_of.get(str(row["skillEvidence"].get("skill") or ""), terms[0][0]))
                for row in _skill_rows(found.accounts)
                if _headcount_fits(row, wanted)
            ]

        steps.append(("skill", tier, fetch))
    return steps


def _skill_widening_tried(skills: Sequence[str]) -> list[dict[str, Any]]:
    """#4434.3 — les paliers de la première compétence que ``_skill_widening_steps`` a cherchés, avec les termes
    lus : ``[{"axis": "skill", "tier": 1, "terms": ["JavaScript", …]}]``. Une compétence hors référentiel n'a
    aucun voisin : ``[]`` (jamais un voisin deviné)."""
    from app.services.discover_skill_offers import SKILL_MAX_TERMS

    tried: list[dict[str, Any]] = []
    if skills and expertise_trade_terms(skills[0]):
        return tried
    for tier, items in skill_widening_tiers(skills[0]) if skills else []:
        tried.append({"axis": "skill", "tier": tier, "terms": [term for _code, term in items[:SKILL_MAX_TERMS]]})
    return tried


def _size_band_of_row(row: Mapping[str, Any]) -> str | None:
    """La tranche maison d'une ligne (borne basse de son effectif publié) ; ``None`` = taille non publiée."""
    known = parse_headcount_range(row.get("headcountRange"))
    return size_band_of(known[0]) if known else None


def _size_widening_steps_from(
    rows: Sequence[dict[str, Any]], wanted: list[tuple[int, int | None]]
) -> list[tuple[str, int, WideningFetch]]:
    """#4436 — en recherche par compétence, la taille voisine se lit dans les comptes DÉJÀ trouvés hors
    tranche : aucun appel de plus. Un effectif non publié n'est jamais « hors tranche » (il est déjà gardé)."""
    steps: list[tuple[str, int, WideningFetch]] = []
    for tier, bands in size_widening_tiers(wanted) if wanted else []:
        codes = {str(band["code"]) for band in bands}

        async def fetch(codes: set[str] = codes) -> list[tuple[dict[str, Any], str | None]]:
            return [(row, band) for row in rows if (band := _size_band_of_row(row)) in codes]

        steps.append(("size", tier, fetch))
    return steps


def _sectors_of_naf(naf_code: str | None) -> list[str]:
    """#4435 — les secteurs partagés DEMANDÉS, relus dans la liste NAF (une seule lecture : ``sector_reading``)."""
    return sectors_asked_in_naf(naf_code)


def _widening_net_of_exclusions(
    query: dict[str, Any], companies: Sequence[Mapping[str, Any]], qualifications: Sequence[Mapping[str, Any]]
) -> dict[str, Any]:
    """#4435.2 — le bandeau annonce ce qui est AFFICHABLE : un compte élargi que le conseil écarte pour un autre
    motif (doublon, hors zone, cessé…) ne compte plus dans « N résultats » — jamais « 66 » au-dessus d'une liste de 1."""
    widening = query.get("widening")
    if not isinstance(widening, Mapping):
        return query
    dropped: dict[tuple[str, int], int] = {}
    exact_dropped = 0
    for company, qualification in zip(companies, qualifications, strict=False):
        by = company.get("widenedBy")
        if qualification.get("verdict") != "excluded":
            continue
        if isinstance(by, Mapping):
            key = (str(by.get("axis")), int(by.get("tier") or 0))
            dropped[key] = dropped.get(key, 0) + 1
        else:
            # #4433.3 — un EXACT écarté est masqué à l'écran : il ne fait pas partie des exacts annoncés.
            exact_dropped += 1
    if not dropped and not exact_dropped:
        return query
    steps = [
        {**step, "added": int(step["added"]) - dropped.get((str(step["axis"]), int(step["tier"])), 0)}
        for step in widening.get("steps") or []
    ]
    steps = [step for step in steps if step["added"] > 0]
    if not steps:
        return {key: value for key, value in query.items() if key != "widening"}
    exact_count = max(0, int(widening.get("exactCount") or 0) - exact_dropped)
    return {**query, "widening": {**widening, "exactCount": exact_count, "steps": steps}}


async def _widen_registry(
    filters: DiscoverFilters,
    companies: list[dict],
    place_lookup: _PlaceLookup | None,
    limit: int,
    degraded: list[dict],
    applied: dict[str, Any],
    registry_deadline: float,
    deadline: float,
) -> tuple[list[dict], dict[str, Any] | None]:
    """#4435 / #4436 — sous ``CRITERIA_WIDEN_MIN_RESULTS`` comptes, les secteurs voisins puis les tranches voisines.

    Chaque palier relance la MÊME collecte registre (mêmes zone, budget, sources), seul l'axe élargi change."""
    # #4673.1 (Louis 31/10) — la cible est le volume DEMANDÉ (``max(25, limit)``) : revient sur le 25 fixe de #4673.
    target = widen_target(limit)
    if len(companies) >= target:
        return companies, None
    steps: list[tuple[str, int, WideningFetch]] = []
    for tier, sectors in sector_widening_tiers(_sectors_of_naf(filters.nafCode)):
        naf_of = {naf: sector for sector in reversed(sectors) for naf in APPLICATION_SECTOR_NAF.get(sector, ())}

        async def fetch_sector(sectors: list[str] = sectors, naf_of: dict[str, str] = naf_of):
            wider = filters.model_copy(update={"nafCode": ",".join(naf_codes_for_sectors(sectors))})
            rows = await _collect_for_request(
                wider, place_lookup, limit, degraded, applied, registry_deadline, deadline
            )
            # Une ligne dont le NAF ne nomme aucun voisin n'est pas ajoutée : on n'invente pas son secteur.
            return [(row, naf_of[naf]) for row in rows if (naf := str(row.get("nafCode") or "").upper()) in naf_of]

        steps.append(("sector", tier, fetch_sector))
    for tier, bands in size_widening_tiers(_headcount_requested(filters)):
        ranges = [
            {
                "headcountMin": int(band["min"]),
                **({"headcountMax": int(band["max"])} if band["max"] is not None else {}),
            }
            for band in bands
        ]
        codes = {str(band["code"]) for band in bands}

        async def fetch_size(ranges: list[dict[str, int]] = ranges, codes: set[str] = codes):
            wider = filters.model_copy(update={"headcountMin": None, "headcountMax": None, "headcountRanges": ranges})
            rows = await _collect_for_request(
                wider, place_lookup, limit, degraded, applied, registry_deadline, deadline
            )
            return [(row, band) for row in rows if (band := _size_band_of_row(row)) in codes]

        steps.append(("size", tier, fetch_size))
    calls = _REGISTRY_CALLS.get()

    def has_budget() -> bool:
        # #4305 — un palier ne part ni hors du temps de la liste, ni une fois le budget d'appels de la
        # recherche atteint (même borne que le croisement de secteurs) : élargir ne fait jamais exploser le coût.
        # #4419.1 (Louis 31/10) — ce budget suit la profondeur demandée (``registry_call_budget``) : 100 comptes
        # = 4 pages par collecte, l'ancien plafond fixe (6) coupait l'élargissement dès la première.
        spent = calls[0] if calls is not None else 0
        return time.monotonic() < registry_deadline and spent < registry_call_budget(limit)

    return await widen_rows(
        companies, steps, key=lambda row: str(row.get("siren") or ""), min_results=target, has_time=has_budget
    )


async def _fill_skill_search(
    req: DiscoverRegistryRequest,
    filters: DiscoverFilters,
    skills: list[str],
    companies: list[dict],
    info: dict[str, Any],
    limit: int,
    degraded: list[dict],
    applied: dict[str, Any],
    registry_deadline: float,
    deadline: float,
    sector_naf: Sequence[str] = (),
    outside_sector: set[str] | None = None,
) -> tuple[list[dict], dict[str, Any]]:
    """#4430 — le remplissage d'une recherche par compétence maigre (voir ``fresh_jobs.fill_skill_accounts``).
    La zone et l'effectif demandés tiennent ; la compétence, elle, se PROUVE par une offre lue.
    #4420.4 — le secteur coché tient AUSSI ici : un compte hors secteur n'entre pas par le remplissage, il est
    écarté et COMPTÉ (``outsideSector``), comme dans la liste trouvée par les offres."""
    fill_started = time.monotonic()
    zone_filters = filters.model_copy(update={"keywords": None, "technologiesObserved": None})
    with wait_deadline(deadline):
        zone = await _collect_for_request(zone_filters, None, limit, degraded, applied, registry_deadline, deadline)
    known = {str(c.get("siren") or "") for c in companies}
    wanted = _headcount_requested(filters)
    pool = [row for row in zone if str(row.get("siren") or "") not in known and _headcount_fits(row, wanted)]
    if sector_naf:
        outside = outside_sector if outside_sector is not None else set()
        pool = _keep_in_sector(pool, sector_naf, outside)
    added, fill = await fresh_jobs.fill_skill_accounts(
        harvest_terms(skills),
        pool,
        space_key=req.spaceKey,
        pack=normalize_offer_domain(req.profile_data.get("offerDomain")),
        all_roles=recruits_for_clients(req.profile_data),
        wait_s=min(SIGNALS_TIME_BUDGET_S, deadline - time.monotonic() - ANGLE_TRAILING_MARGIN_S),
    )
    # Lot 789 (#5212) — même ligne de durée que les passes de ``find_skill_accounts`` (pas d'identité ici : SIREN connus).
    logger.info(
        "discover pass=fill_skill ms=%d offers=%d kept=%d identity_calls=0",
        int((time.monotonic() - fill_started) * 1000),
        fill.get("examined", 0),
        len(added),
    )
    info = {**info, "freshFill": fill}
    if added and info.get("emptyCause"):
        info["emptyCause"] = None
    return [*companies, *added], info


async def _collect_for_request(
    filters: Any,
    place_lookup: _PlaceLookup | None,
    limit: int,
    degraded: list[dict],
    applied: dict[str, Any],
    registry_deadline: float,
    deadline: float,
    *,
    zone_out: dict[str, Any] | None = None,
) -> list[dict]:
    """La collecte registre d'une requête : ville, secteurs croisés, pages.

    ``filters`` sont ceux de la requête APRÈS la lecture de la demande (#2490).
    ``applied`` reçoit le nom canonique de la ville résolue (en place).
    """
    # #2490.11 — la ville tapée en toutes lettres est résolue UNE FOIS, avant
    # les secteurs croisés (qui partagent tous la même zone). Un code postal
    # n'a pas besoin de résolution : il pointe déjà une commune sans ambiguïté.
    # #2496 — sous la part de la LECTURE, jamais sur celle de la liste ; un lieu
    # déjà cherché par la lecture n'est pas cherché une seconde fois.
    raw_city = (filters.city or "").strip()
    commune = place_lookup.commune if place_lookup else None
    if place_lookup is None and raw_city and not (raw_city.isdigit() and len(raw_city) == 5):
        commune, _, _ = await _resolve_place_within_share([raw_city], registry_deadline, fuzzy=True)
    if commune:
        # Le nom CANONIQUE (INSEE), jamais le texte tapé : le registre écrit
        # « SAINT-ETIENNE », l'utilisateur peut avoir tapé « Saint Étienne ».
        # C'est ce nom que la qualification compare au siège de chaque ligne.
        applied["cityCommuneName"] = commune["name"]

    if _served_by_cover(filters, commune):
        # #4641 — 100 km (le défaut d'une ville seule) : le recouvrement du barreau `radius_100`, jamais `radius=100`.
        companies = await _collect_cover(
            filters,
            commune,
            limit,
            degraded,
            registry_deadline,
            deadline,
            enough=lambda found: len(found) >= limit,
            radius_km=float(filters.radiusKm),
        )
    else:
        companies = await _collect_zone(filters, commune, limit, degraded, registry_deadline, deadline)
    # #4429.2 — la ville seule rend trop peu de comptes : paliers suivants, exacts en tête.
    if zone_out is not None and _widenable_city(filters, commune):
        companies = await _widen_by_zone_tiers(
            filters, commune, companies, limit, degraded, registry_deadline, deadline, zone_out, applied
        )
    _drop_positions(companies)

    # #2283.5/.26/.29 (épopée #2983) — SOURCE TOMBÉE : un registre qui n'a rien
    # rendu ET dont la panne est dite (une entrée de `degraded` SANS `kind` : un
    # « rien ne correspond » ou une limite de capacité n'en est pas une) laisse
    # le pack interne prendre la relève au-delà de l'appoint.
    registry_down = not companies and any("kind" not in entry for entry in degraded)
    return await _augment_with_dataforge_candidates(companies, filters, limit, registry_down=registry_down)


async def _collect_zone(
    filters: Any,
    commune: Mapping[str, Any] | None,
    limit: int,
    degraded: list[dict],
    registry_deadline: float,
    deadline: float,
) -> list[dict]:
    """La collecte registre d'UNE maille (secteurs croisés et pages compris)."""
    # Secteurs CROISÉS (rail unifié) : le registre ne sait pas OU-er des sections
    # NAF, alors on l'interroge une fois par secteur et on fusionne. Au-delà de la
    # borne, les secteurs surnuméraires sont écartés et DITS (jamais avalés).
    crossed = _crossed_sectors(filters)
    if len(crossed) > MAX_CROSSED_SECTORS:
        degraded.append(
            degraded_entry("discover", DegradeReason.UNSUPPORTED_FILTERS, fields=crossed[MAX_CROSSED_SECTORS:])
        )
        crossed = crossed[:MAX_CROSSED_SECTORS]
    if crossed:
        subs = [filters.model_copy(update={"sector": sector, "sectors": None}) for sector in crossed]
    else:
        # #2489.2 — une liste de codes couvrant PLUSIEURS sections part en une
        # requête par section (voir `_naf_groups`). Une seule section : inchangé.
        groups = _naf_groups(filters.nafCode)
        subs = [filters.model_copy(update={"nafCode": group}) for group in groups] if len(groups) > 1 else []

    # #2490.9 — le rappel de page 2 : seulement quand une ZONE est demandée (c'est
    # elle qui remplit la page 1 de sièges lointains), qu'une ACTIVITÉ restreint
    # la question (une zone seule rend des réseaux nationaux, page 2 comprise) et
    # que le budget d'appels le permet — au plus MAX_CROSSED_SECTORS appels
    # gratuits par recherche, comme le croisement de secteurs.
    # #4419.1 — même budget nommé que l'élargissement : il suit la profondeur demandée.
    recall = (
        _zone_requested(filters)
        and _activity_requested(filters)
        and 2 * max(1, len(subs)) <= registry_call_budget(limit)
    )

    try:
        return (
            await _collect_crossed(
                subs,
                limit,
                degraded,
                recall=recall,
                commune=commune,
                deadline=registry_deadline,
                hard_deadline=deadline,
            )
            if subs
            else await _collect_registry(
                filters, limit, degraded, recall=recall, commune=commune, deadline=registry_deadline
            )
        )
    except ValueError as exc:
        # Critère invalide (NAF mal formé, département inexistant…) : c'est une
        # erreur d'entrée, pas une panne de source — on la rend telle quelle.
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _tiers_to_try(filters: Any) -> tuple[str, ...]:
    """#4429.2 — les barreaux que cette recherche peut tenter, dans l'ordre : 50 km, le département, la région (Louis 02/11 : 25 → 50 → département → région, aucun 100 km).
    ⚠️ c144 (Louis 27/10/2026 au soir) : l'échelle AUTOMATIQUE s'arrête à la région (`ZONE_AUTO_MAX_TIER`), même à 0
    compte ; elle RENVERSE c143 (jusqu'à la France). La France entière reste une recherche explicite, sans ville.

    ``zoneCeiling`` (le geste « revenir au barreau d'avant ») coupe l'échelle APRÈS le barreau nommé ; ``zoneStrict``
    n'en laisse aucun. #4641 — un barreau « cercle » que le rayon demandé couvre déjà (25 km par défaut) n'est pas
    rejoué."""
    if filters.zoneStrict:
        return ()
    radius = filters.radiusKm or 0
    ladder = zone_tiers_after("city")
    # #4627.1 — le plafond se lit sur l'échelle ENTIÈRE, avant de retirer le cercle déjà couvert : « Revenir à 50 km »
    # depuis le département borne l'échelle à 50 km ; le plafond se lit avant tout retrait.
    ceiling = getattr(filters, "zoneCeiling", None)
    if ceiling in ladder:
        ladder = ladder[: ladder.index(ceiling) + 1]
    return tuple(tier for tier in ladder if ZONE_TIER_RADIUS_KM.get(tier, math.inf) > radius)


def _served_by_cover(filters: Any, commune: Mapping[str, Any] | None) -> bool:
    """#4641 — un rayon au-delà du plafond du registre (50 km) autour d'une commune RÉSOLUE et placée : servi par
    les sept cercles de 50 km (`zone_cover`). Sans centre, le rayon ne s'applique pas (même règle que
    :func:`_registry_filters`, qui ne pose alors aucun cercle)."""
    city = (filters.city or "").strip()
    return bool(
        filters.radiusKm
        and filters.radiusKm > DISC_RADIUS_KM
        and commune
        and commune.get("latitude")
        and commune.get("longitude")
        and not (city.isdigit() and len(city) == 5)
    )


def _widenable_city(filters: Any, commune: Mapping[str, Any] | None) -> bool:
    """#4429.2 — seule une VILLE résolue, sans rayon ni aire cochés, s'élargit par paliers.

    Un code postal, un rayon choisi, un département ou une région demandés sont déjà la maille voulue :
    on ne les touche pas. « Revenir à Toulouse seule » (``zoneStrict``) coupe aussi les paliers.
    """
    raw_city = (filters.city or "").strip()
    return bool(
        commune
        and raw_city
        and not (raw_city.isdigit() and len(raw_city) == 5)
        # #4515.4 / #4641 / #4515 (01/11) — le rayon PAR DÉFAUT (25 km) s'élargit (25 → 50 → département → région) ;
        # 10, 50 et 100 km choisis à la main sont la maille voulue.
        and (not filters.radiusKm or filters.radiusKm == DEFAULT_CITY_RADIUS_KM)
        and not filters.zoneStrict
        and not (filters.department or filters.departments or filters.region or filters.regions)
    )


def _tier_filters(filters: Any, commune: Mapping[str, Any], tier: str) -> tuple[Any, Mapping[str, Any] | None]:
    """Les filtres d'UN barreau d'aire (département, région) — le cercle de 100 km a sa propre voie
    (:func:`_collect_cover`). ``france`` (aucune contrainte de lieu) reste un palier NOMMABLE, mais l'échelle
    automatique n'y monte plus (c144) : ce cas ne sert qu'à une recherche France explicite."""
    wide = {"city": None, "radiusKm": None}
    if tier == "department":
        return filters.model_copy(update={**wide, "department": commune.get("department")}), None
    if tier == "region":
        return filters.model_copy(update={**wide, "region": commune.get("region")}), None
    return filters.model_copy(update=wide), None


def _tier_area(commune: Mapping[str, Any], tier: str) -> str | None:
    if tier == "department":
        return department_name(str(commune.get("department") or "")) or None
    if tier == "region":
        code = str(commune.get("region") or "")
        return region_label(code) if code else None
    return None


def _candidate_zone(row: Mapping[str, Any], commune: Mapping[str, Any], tier: str) -> dict[str, Any]:
    """L'étiquette d'un compte élargi : sa distance (cercle) ou son département (aires)."""
    zone: dict[str, Any] = {"tier": tier}
    if tier in ZONE_TIER_RADIUS_KM:
        if (measured := _row_distance_km(row, commune)) is not None:
            zone["distanceKm"] = round(measured, 1)
        return zone
    # Un département inconnu ne se nomme pas (jamais « 0 », jamais deviné).
    if area := department_name(str(row.get("department") or "")):
        zone["area"] = area
    # #5069 — la distance MESURÉE voyage aussi sur une aire : l'écran sépare ce qui sort du rayon choisi.
    # Sans position publiée par le site : aucune distance (jamais inventée, jamais « 0 »).
    if (measured := _row_distance_km(row, commune)) is not None:
        zone["distanceKm"] = round(measured, 1)
    return zone


async def _locate_rows(rows: list[dict], registry_deadline: float) -> None:
    """#5069 (lot 777) — un compte dont le registre ne publie pas la position prend celle de sa COMMUNE (référentiel
    `geo-communes`) : nom exact (accents, casse, tirets ignorés) ET même département, sinon rien. Jamais de position
    devinée : une commune introuvable ou homonyme sans département concordant laisse la ligne sans distance."""

    def key_of(row: Mapping[str, Any]) -> tuple[str, str]:
        return normalize_name(row.get("city")).replace("-", " "), str(row.get("department") or "").strip()

    def placed(row: Mapping[str, Any]) -> bool:
        return isinstance(row.get("latitude"), (int, float)) and isinstance(row.get("longitude"), (int, float))

    wanted = {key_of(row): str(row["city"]) for row in rows if row.get("city") and not placed(row)}
    if not wanted or time.monotonic() >= registry_deadline:
        return

    async def lookup(city: str, department: str) -> tuple[float, float] | None:
        try:
            candidates = await search_communes(city, limit=_MAX_COMMUNE_LOOKUPS)
        except Exception:  # noqa: BLE001 — une source muette laisse la ligne sans distance
            return None
        folded = normalize_name(city).replace("-", " ")
        same = [
            c
            for c in candidates
            if normalize_name(c.get("name")).replace("-", " ") == folded
            and str(c.get("department") or "") == department
            and isinstance(c.get("latitude"), (int, float))
            and isinstance(c.get("longitude"), (int, float))
        ]
        return (float(same[0]["latitude"]), float(same[0]["longitude"])) if len(same) == 1 and department else None

    keys = list(wanted)
    try:
        found = await asyncio.wait_for(
            asyncio.gather(*(lookup(wanted[key], key[1]) for key in keys)),
            max(0.1, min(DISCOVER_READING_BUDGET_S, registry_deadline - time.monotonic())),
        )
    except TimeoutError:
        return
    located = {key: point for key, point in zip(keys, found, strict=True) if point}
    for row in rows:
        if not placed(row) and (point := located.get(key_of(row))):
            row["latitude"], row["longitude"] = point


def _row_distance_km(row: Mapping[str, Any], commune: Mapping[str, Any]) -> float | None:
    """La distance MESURÉE du site au centre de la commune, ou ``None`` quand le registre ne publie pas sa position."""
    points = (commune.get("latitude"), commune.get("longitude"), row.get("latitude"), row.get("longitude"))
    if all(isinstance(value, (int, float)) for value in points):
        return distance_km(*(float(value) for value in points))
    return None


async def _collect_cover(
    filters: Any,
    commune: Mapping[str, Any],
    limit: int,
    degraded: list[dict],
    registry_deadline: float,
    deadline: float,
    *,
    enough: Callable[[list[dict]], bool],
    radius_km: float = COVER_RADIUS_KM,
    circles: int | None = None,
    skip_centre: bool = False,
) -> list[dict]:
    """Lot S (01/11) — ``circles=1`` = le barreau 50 km : le seul cercle CENTRAL, que `/near_point` sert tel quel.
    #4429.2 (25/10) — les comptes à moins de 100 km de la commune, par sept cercles de 50 km (`zone_cover`).
    #4641 — même voie pour un rayon DEMANDÉ de 51 à 100 km (100 km par défaut) : ``radius_km`` est alors la coupe.

    Le registre plafonne `/near_point` à 50 km : le centre d'abord, puis les six cercles périphériques, du plus proche
    au plus loin. On s'arrête dès que ``enough`` est vrai (pas de parcours complet « pour voir »). Un compte dont la
    distance MESURÉE dépasse 100 km est écarté (les cercles débordent) ; un compte sans position n'est gardé que s'il
    vient du cercle central (≤ 50 km prouvé) — rien ne prouve qu'un autre est dans le rayon."""
    disc = filters.model_copy(update={"radiusKm": DISC_RADIUS_KM})
    kept: list[dict] = []
    seen: set[Any] = set()
    centres = cover_centres(float(commune["latitude"]), float(commune["longitude"]))
    # ``skip_centre`` : le cercle central (50 km) vient d'être interrogé par le barreau 50 km ; ne pas le rejouer.
    for index, (latitude, longitude) in enumerate(centres):
        if (skip_centre and index == 0) or (circles is not None and index >= circles):
            continue
        if time.monotonic() >= registry_deadline:
            break
        rows = await _collect_zone(
            disc,
            {**commune, "latitude": latitude, "longitude": longitude},
            limit,
            degraded,
            registry_deadline,
            deadline,
        )
        for row in rows:
            if row.get("siren") in seen:
                continue
            measured = _row_distance_km(row, commune)
            if (measured is None and index > 0) or (measured is not None and measured > radius_km):
                continue
            seen.add(row.get("siren"))
            kept.append(row)
        if enough(kept):
            break
    return kept


def _enough_for_tier(
    tier: str,
    exact: list[dict],
    exact_sirens: set[Any],
    applied: Mapping[str, Any],
    target: int = CRITERIA_WIDEN_MIN_RESULTS,
) -> Callable[[list[dict]], bool]:
    """Le seuil est-il atteint avec ``found`` en plus des exacts ? Une ligne élargie porte son palier : la
    qualification ne la lit pas « hors zone » (même lecture que l'appelant)."""

    def enough(found: list[dict]) -> bool:
        extra = [{**row, "zone": {"tier": tier}} for row in found if row.get("siren") not in exact_sirens]
        return not needs_zone_widening(_displayable_count(exact + extra, applied), target)

    return enough


async def _widen_by_zone_tiers(
    filters: Any,
    commune: Mapping[str, Any],
    exact: list[dict],
    limit: int,
    degraded: list[dict],
    registry_deadline: float,
    deadline: float,
    zone_out: dict[str, Any],
    applied: Mapping[str, Any],
) -> list[dict]:
    """#4429.2 — ville (25 km) → 50 km → département → région, un barreau à la fois, puis STOP à la région — même à 0
    compte, aucune requête France (⚠️ c144, Louis 27/10/2026 au soir : renverse c143).

    Le barreau suivant n'est tenté que tant que le total reste SOUS ``ZONE_WIDEN_MIN_RESULTS`` (#3876 :
    au-dessus, la requête reste la commune) : jamais de saut, chaque palier franchi est NOMMÉ (``steps``). Les
    exacts gardent leur place en tête et ne portent rien ; un compte ajouté porte le PREMIER barreau qui l'a trouvé.
    Le dernier barreau atteint et les barreaux franchis sont écrits dans ``zone_out`` —
    l'écran et Laura les DISENT, rien n'est élargi en silence. Aucun critère n'est relâché : seule la ZONE grandit.
    """
    # #4429.2 (recette prod 23/10) — le seuil se lit sur les comptes AFFICHABLES : 12 lignes dont 3 sièges hors
    # de la ville (écartés par la qualification) sont 9 comptes à l'écran, donc un élargissement.
    # #4673.1 — la cible est le volume demandé, plus 25 fixe.
    target = widen_target(limit)
    # #4433.3 — le geste « Élargir la zone » (`zoneRaise`) force la montée jusqu'à son palier, même sans manque de comptes.
    raise_to = None if filters.zoneStrict else getattr(filters, "zoneRaise", None)
    if not raise_to and not needs_zone_widening(_displayable_count(exact, applied), target):
        return exact
    exact_sirens = {row.get("siren") for row in exact}
    seen = set(exact_sirens)
    added: list[dict] = []
    steps: list[str] = []
    for tier in _tiers_to_try(filters):
        if time.monotonic() >= registry_deadline:
            break
        if tier in ZONE_TIER_RADIUS_KM:
            if not (commune.get("latitude") and commune.get("longitude")):
                continue  # un cercle sans centre partirait sans zone : jamais
            rows = await _collect_cover(
                filters,
                commune,
                limit,
                degraded,
                registry_deadline,
                deadline,
                enough=_enough_for_tier(tier, exact, exact_sirens, applied, target),
                # Louis 02/11 : 50 km = le cercle central seul, coupé à 50 km (plus de barreau 100 km).
                radius_km=float(ZONE_TIER_RADIUS_KM[tier]),
                circles=1,
            )
        else:
            tier_filters, centre = _tier_filters(filters, commune, tier)
            if (tier == "region" and not tier_filters.region) or (tier == "department" and not tier_filters.department):
                continue  # une aire que la commune ne publie pas ne se devine pas
            rows = await _collect_zone(tier_filters, centre, limit, degraded, registry_deadline, deadline)
            # #5069 (lot 777) — la distance d'un compte d'aire se mesure depuis sa commune quand le site ne publie rien.
            await _locate_rows([row for row in rows if row.get("siren") not in seen], registry_deadline)
        steps.append(tier)
        for row in rows:
            if row.get("siren") in seen:
                continue
            seen.add(row.get("siren"))
            added.append({**row, "zone": _candidate_zone(row, commune, tier)})
        # #4433.3 — tant que le palier demandé par le geste n'est pas atteint, on monte même à volume suffisant.
        owed = bool(raise_to) and ZONE_TIERS.index(tier) < ZONE_TIERS.index(str(raise_to))
        if raise_to and tier == raise_to:
            break  # UN palier par geste : le palier demandé est le dernier tenté
        if not owed and not needs_zone_widening(_displayable_count(exact + added, applied), target):
            break
    # 2710N — « cherché jusqu'à la région, sans compte de plus » est une réponse : le plafond tenté se DIT même quand
    # aucun barreau n'a rien ajouté (``autoCapReached`` = TENTÉ, distinct de ``tier`` = TROUVÉ).
    capped = auto_cap_reached(steps, _displayable_count(exact + added, applied), target)
    if not steps or not (added or capped):
        return exact
    widening: dict[str, Any] = {
        "place": commune.get("name"),
        "tier": steps[-1],
        "steps": steps,
        "exactCount": _displayable_count(exact, applied),
        "widenedCount": len(added),
        **({"autoCapReached": True} if capped else {}),
    }
    if area := _tier_area(commune, steps[-1]):
        widening["area"] = area
    zone_out.update(widening)
    return exact + added


def _displayable_count(rows: list[dict], applied: Mapping[str, Any]) -> int:
    """#4429.2 — les comptes que l'écran montrera : ni exclus par la qualification, ni répétés (SIREN)."""
    verdicts = qualify_all([{**row} for row in rows], filters=dict(applied))
    shown = {
        row.get("siren") or id(row) for row, q in zip(rows, verdicts, strict=True) if q.get("verdict") != "excluded"
    }
    return len(shown)


def _drop_positions(rows: list[dict]) -> None:
    """La position d'un site a servi à mesurer une distance ; elle ne voyage pas plus loin."""
    for row in rows:
        row.pop("latitude", None)
        row.pop("longitude", None)


#: #4793.1 (Louis 31/10) — revient sur ``DATAFORGE_CANDIDATE_APPOINT_LIMIT = 5`` (#2805 / #2291.3) : le plafond
#: d'appoint est LEVÉ, la borne est le volume demandé (``limit``), et le pack entre même quand le registre a rempli
#: la page — le rang tranche, pas l'ordre d'arrivée.

#: Les origines d'un candidat, comptées dans la ligne de journal `discover registry_calls=…` (#4791.5) — jamais
#: affichées, jamais sur une carte (#4791.4 : aucune source nommée).
CANDIDATE_ORIGINS = ("registry", "offers", "common_base")
_COMMON_BASE_SOURCES = frozenset({"dataforge", "common_base"})
_NEED_NATURES = frozenset({"recrutement", "mission", "projet"})


def _observed_need(need: CommonBaseNeed | None) -> dict[str, str] | None:
    """#4791.2 / #4762.1 — « besoin Java, mars 2025 » : un libellé ET une date lisible. Ligne sans date = aucun
    besoin (on n'affiche pas ce qu'on n'a pas) ; aucune source, aucune borne d'âge."""
    if need is None:
        return None
    label = (need.label or "").strip()
    date = (need.date or "").strip()[:10]
    if not label or not re.fullmatch(r"\d{4}-\d{2}(-\d{2})?", date):
        return None
    # #5203 — la nature voyage si elle est connue de la liste fermée ; sinon absente (jamais devinée).
    nature = (need.nature or "").strip()
    return {
        "label": label[:160],
        "date": date,
        **({"nature": nature} if nature in _NEED_NATURES else {}),
    }


#: #4617.6 — la fenêtre de la mémoire de marché : jusqu'à 30 noms résolus au registre APRÈS la collecte, hors de tout
#: budget jusque-là. Mesuré par lecture du code (aucune mesure de prod possible d'ici) : seule étape de la chaîne sans
#: borne de temps, donc seule à pouvoir pousser la réponse au-delà du couperet de l'API (503). Passé cette fenêtre, les
#: noms DÉJÀ résolus entrent et le reste est NOMMÉ dans ``degraded`` (``market-memory`` / ``time_budget``).
MARKET_MEMORY_BUDGET_S = 6.0


async def _market_memory_resolved(
    names: Sequence[MarketMemoryName], *, timeout: float | None = None
) -> tuple[list[CommonBaseCandidate], bool]:
    """#4791.2 — Market Memory comme SOURCE : chaque nom passe par ``resolve_employer`` (cache « nom normalisé →
    identité registre »). Pas de SIREN certain ⇒ le nom n'entre pas (jamais deviné). Le besoin n'est posé que si
    l'entrée porte une date (``_observed_need`` écarte le reste).

    #4617.6 — ``timeout`` borne l'étape : retourne ``(candidats déjà résolus, coupé)`` ; les résolutions en vol sont
    abandonnées. Sans ``timeout``, l'étape attend tout (appelants d'avant)."""
    gate = asyncio.Semaphore(5)

    async def one(item: MarketMemoryName) -> CommonBaseCandidate | None:
        name = (item.name or "").strip()
        if not name:
            return None
        async with gate:
            resolution = await resolve_employer(name)
        identity = resolution.identity or {}
        siren = _clean_siren(identity.get("siren"))
        if not siren:
            return None
        need = (
            CommonBaseNeed(label=item.label or "", date=item.date, nature=item.nature)
            if item.label and item.date
            else None
        )
        return CommonBaseCandidate(
            siren=siren,
            name=str(identity.get("name") or name).strip(),
            city=identity.get("city"),
            sector=identity.get("sector"),
            nafCode=identity.get("nafCode"),
            observedNeed=need,
        )

    tasks = [asyncio.ensure_future(one(n)) for n in list(names)[:MARKET_MEMORY_NAMES_MAX]]
    done, pending = await asyncio.wait(tasks, timeout=timeout)
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)
    found = [t.result() if not t.cancelled() and t.exception() is None else None for t in tasks if t in done]
    return [c for c in found if isinstance(c, CommonBaseCandidate)], bool(pending)


async def _market_memory_candidates(names: Sequence[MarketMemoryName]) -> list[CommonBaseCandidate]:
    """Les candidats résolus, sans borne de temps (forme d'avant #4617.6)."""
    return (await _market_memory_resolved(names))[0]


async def _with_market_memory(
    req: DiscoverRegistryRequest, degraded: list[dict] | None = None, *, deadline: float | None = None
) -> None:
    """#4791.2 — les comptes appariés rejoignent les candidats de la base commune (même entrée, même dédoublonnage).

    #4617.6 — l'étape tient dans ``MARKET_MEMORY_BUDGET_S`` ET avant ``deadline`` (le budget de la liste) : une
    résolution trop lente rend le partiel et se DIT dans ``degraded``, jamais un 503."""
    if req.marketMemoryNames:
        timeout = MARKET_MEMORY_BUDGET_S
        if deadline is not None:
            timeout = max(0.0, min(timeout, deadline - time.monotonic()))
        extra, cut = await _market_memory_resolved(req.marketMemoryNames, timeout=timeout)
        known = {c.siren for c in req.commonBaseCandidates}
        req.commonBaseCandidates = [*req.commonBaseCandidates, *[c for c in extra if c.siren not in known]]
        req.marketMemoryNames = []
        if cut and degraded is not None:
            degraded.append(degraded_entry("market-memory", DegradeReason.TIME_BUDGET))


def _with_common_base(companies: list[dict], req: DiscoverRegistryRequest, limit: int) -> list[dict]:
    """#4793.1 / #4791.1 / #4791.2 — les comptes de la base commune ENTRENT comme candidats, dédoublonnés par SIREN :
    une ligne déjà trouvée (registre, offres) garde sa forme et reçoit seulement le besoin daté ; une ligne neuve
    entre avec ``_source = common_base`` (marqueur INTERNE, retiré avant la réponse). Bornés au volume demandé —
    jamais à la place restante : la coupe se fait au RANG (``_cut_with_space_reserve``)."""
    if not req.commonBaseCandidates:
        return companies
    by_siren = {str(c.get("siren") or ""): c for c in companies}
    merged = list(companies)
    added = 0
    for item in req.commonBaseCandidates:
        siren = _clean_siren(item.siren)
        name = (item.name or "").strip()
        if not siren or not name:
            continue  # pas de SIREN réel, pas de nom : pas de candidat (règle n°1 du registre)
        need = _observed_need(item.observedNeed)
        known = by_siren.get(siren)
        if known is not None:
            if need and not known.get("observedNeed"):
                known["observedNeed"] = need
            continue
        if added >= limit:
            continue
        row: dict[str, Any] = {
            "name": name,
            "siren": siren,
            "nafCode": item.nafCode,
            "sector": item.sector,
            "city": item.city,
            "department": None,
            "headcountRange": None,
            # #5203 — un compte né des besoins passés de l'ESPACE n'est pas « de la base commune » (origine registre).
            "_source": "space_need" if item.fromSpace else "common_base",
            **({"observedNeed": need} if need else {}),
        }
        by_siren[siren] = row
        merged.append(row)
        added += 1
    return merged


def _common_base_reason(sent: int, kept: int) -> str:
    """Lot R — `` common_base_reason=no_rows|filtered`` quand la base commune n'a donné aucun candidat, sinon vide."""
    if kept > 0:
        return ""
    return " common_base_reason=" + ("filtered" if sent > 0 else "no_rows")


def _origin_of(company: Mapping[str, Any], source: str | None) -> str:
    """#4791.5 — l'origine d'une ligne, pour le compteur du journal : base commune, offres, sinon registre."""
    if source in _COMMON_BASE_SOURCES:
        return "common_base"
    if company.get("skillEvidence") is not None:
        return "offers"
    return "registry"


_ORIGIN_COUNTS: contextvars.ContextVar[dict[str, int] | None] = contextvars.ContextVar("origin_counts", default=None)


async def _augment_with_dataforge_candidates(
    companies: list[dict], filters: DiscoverFilters, limit: int, *, registry_down: bool = False
) -> list[dict]:
    """Complète — jamais ne remplace — la liste registre avec des comptes du
    pack ORION (#2805 / #2291.3) : DataForge devient une source de CANDIDATS,
    pas seulement un statut consulté sur un compte déjà connu (`statusFor`/
    `statusForSiren`, inchangés, `orion-accounts.service.ts`).

    APPOINT (`graceful_empty`, `source_registry.py`) : une panne du pont
    interne ou une table vide laisse `companies` intacte — jamais un candidat
    inventé pour compenser. Dédupliqué par SIREN contre ce que le registre a
    déjà rendu ; le registre gagne toujours en cas de doublon, DataForge ne
    fait qu'ajouter des lignes que le registre n'avait pas.

    ``registry_down`` (#2283.5/.26/.29, épopée #2983) : le registre public est
    TOMBÉ (voir l'appelant) — le plafond d'appoint ne s'applique plus, la
    relève prend toute la place ; la panne, elle, reste dans ``degraded``.
    """
    # #4793.1 — la borne est le volume demandé, même page pleine ; ``registry_down`` ne change plus la borne.
    cap = limit
    # #2983 (recette prod 01/10) — le chat pose `sectors` (liste), jamais `sector` :
    # un SEUL secteur déclaré borne le pack comme le chemin mono-secteur.
    pack_sector = filters.sector or (filters.sectors[0] if filters.sectors and len(filters.sectors) == 1 else None)
    extra = await dataforge_candidates(sector=pack_sector, limit=cap)
    if extra and _zone_requested(filters):
        # R22-DV1 — le pack interne est NATIONAL et sans département : il n'entre dans une zone demandée que si
        # le siège qu'il publie se rattache à un département de cette zone (un lieu inconnu ne le prouve pas).
        zone = frozenset(
            zone_departments(
                filters.regions or ([filters.region] if filters.region else []),
                filters.departments or ([filters.department] if filters.department else []),
                filters.city,
            )
        )
        extra = [row for row in extra if offer_department({"city": row.get("city")}) in zone]
    if not extra:
        return companies
    known = {c["siren"] for c in companies}
    # `_source` : marqueur INTERNE lu par `_rank_and_angle` pour que
    # `sources[].name` (le contrat partagé) dise la VRAIE provenance de cette
    # ligne plutôt que le nom du waterfall registre qui ne l'a pas produite —
    # `_rank_and_angle` le retire avant de construire le candidat final, il ne
    # voyage jamais jusqu'à la réponse.
    added = [{**row, "_source": "dataforge"} for row in extra if row["siren"] not in known]
    return companies + added[:cap]


# ── Décision 1 (18/09/2026) — signaux datés des premières lignes rendues ────
#
# La NATURE de la source se nomme (registre officiel, offre d'emploi, appel
# d'offres) — nos fournisseurs eux ne se nomment JAMAIS. Chaque mappeur rend
# `None` plutôt qu'un signal sans date : « un signal sans date n'en est pas
# un » (même règle que `discoverSignalSchema`, contrat partagé).


def _tender_signal(row: Mapping[str, Any]) -> dict[str, Any] | None:
    """BOAMP — appel d'offres IT ouvert mentionnant l'entreprise."""
    date = _text_or_none(row.get("publishedDate"))
    title = _text_or_none(row.get("title"))
    if not date or not title:
        return None
    return {"type": "tender", "label": title[:160], "date": date}


_ESN_OFFER_FLAG = "_esnOffer"


def _hiring_signal(row: Mapping[str, Any]) -> dict[str, Any] | None:
    """France Travail — offre d'emploi IT récente de l'entreprise."""
    date = _text_or_none(row.get("date"))
    title = _text_or_none(row.get("title"))
    if not date or not title:
        return None
    detail = " · ".join(p for p in (_text_or_none(row.get("contractType")), _text_or_none(row.get("location"))) if p)
    signal: dict[str, Any] = {"type": "hiring", "label": title[:160], "date": date, "detail": detail or None}
    # Lot T point 1 — l'offre se dit celle d'une ESN ? Drapeau INTERNE, retiré par `_finish_signal_tasks` avant la réponse.
    if offer_says_esn(title, row.get("description")):
        signal[_ESN_OFFER_FLAG] = True
    # #3408 — les technologies NOMMÉES par l'offre (même lecture que
    # `discover_signals.py`) : la carte en tire son « Périmètre conseillé ».
    # Aucune forme reconnue → la clé n'existe pas (une absence ne fait aucune ligne).
    # Les compétences que l'offre LISTE (`skills[]`, France Travail) sont une source
    # aussi : recette prod 02/10, « Périmètre conseillé » 0/25 alors qu'elles
    # nommaient la pile. Une liste absente ou non textuelle ne donne rien.
    raw_skills = row.get("skills")
    skills = [s for s in raw_skills if isinstance(s, str)] if isinstance(raw_skills, list) else []
    # #4437.5 — l'intitulé LIBRE (« React JS-Python ») porte aussi sa famille et le rattachement lu avec l'offre.
    technologies, job_family = read_offer_title(title, detail, skills, row.get("attached"))
    if technologies:
        signal["technologies"] = technologies
    if job_family:
        signal["jobFamily"] = job_family
    return signal


def _legal_signal(row: Mapping[str, Any]) -> dict[str, Any] | None:
    """BODACC — registre officiel : vie légale récente de l'entreprise."""
    date = _text_or_none(row.get("date"))
    label = _text_or_none(row.get("type"))
    if not date or not label:
        return None
    # #4045.2 — « Modifications diverses », « Dépôts des comptes » : de l'administratif,
    # pas un « Pourquoi maintenant ». Classé ICI, au plus près de la source (le détail
    # du compte garde la vie juridique, il ne passe pas par ce mappeur).
    if is_low_value_announcement(label, _text_or_none(row.get("precision"))):
        return None
    # #3916 — le type PRÉCIS (« modification survenue sur le capital »…) quand
    # l'annonce le porte, et le lien de l'annonce : jamais l'un ni l'autre inventé.
    precision = _text_or_none(row.get("precision"))
    signal: dict[str, Any] = {
        "type": "legal",
        "label": f"{label} — {precision}" if precision else label,
        "date": date,
        "detail": _text_or_none(row.get("tribunal")),
    }
    url = _text_or_none(row.get("url"))
    if url:
        signal["url"] = url
    return signal


# DECOUVRIR-COLLECTE (Louis 13/10) — « offres d'emploi (hors stages) » : un stage
# n'est ni un besoin de prestation ni un budget (`hiring_signal.py` : « stage ≠
# budget prestation »). Lu sur l'intitulé ET le libellé de contrat, en mot entier.
_INTERNSHIP = re.compile(r"\b(?:stages?|stagiaires?|internships?|interns?)\b", re.IGNORECASE)


def _is_internship(row: Mapping[str, Any]) -> bool:
    text = " ".join(str(row.get(key) or "") for key in ("title", "contractType", "contractCode"))
    return _INTERNSHIP.search(text) is not None


def _merged_offers(*batches: object) -> list[dict]:
    """Les offres des deux registres, dédoublonnées par lien (sinon intitulé + date),
    stages retirés. Une source en échec (exception) ne retire rien aux autres."""
    seen: set[str] = set()
    out: list[dict] = []
    for batch in batches:
        if not isinstance(batch, list):
            continue
        for row in batch:
            if not isinstance(row, dict) or _is_internship(row):
                continue
            # #4045.5 — une même offre lue par DEUX registres (France Travail sans lien,
            # Adzuna avec) se reconnaît à son intitulé et son JOUR, pas seulement au lien.
            title_day = f"{str(row.get('title') or '').strip().lower()}|{str(row.get('date') or '')[:10]}"
            keys = {title_day, *([str(row["url"])] if row.get("url") else [])}
            if keys & seen:
                continue
            seen |= keys
            out.append(row)
    return out


def _news_signal(row: Mapping[str, Any]) -> dict[str, Any] | None:
    """DECOUVRIR-COLLECTE — une actualité RATTACHÉE à l'entreprise (`press_signals` :
    nom légal, SIREN ou domaine dans le texte), datée, avec son lien. Une levée
    garde sa nature (`funding`) ; le reste est une actualité (`business`). Le média
    ne se nomme pas (#4068) : la NATURE suffit."""
    date = _text_or_none(row.get("published_at"))
    title = _text_or_none(row.get("title"))
    if not date or not title:
        return None
    signal: dict[str, Any] = {
        "type": "funding" if row.get("type") == "levee" else "business",
        "label": title[:160],
        "date": date[:10],
        "detail": "Actualité",
    }
    url = _text_or_none(row.get("url"))
    if url:
        signal["url"] = url
    return signal


async def _candidate_signals(
    name: str,
    siren: str,
    *,
    pack: str | None = None,
    all_roles: bool,
    press_feeds: Awaitable[dict] | None = None,
    jobs_gate: asyncio.Semaphore | None = None,
    scope_profile: dict | None = None,
    other_names: tuple[str, ...] = (),
    fresh: bool = False,
) -> tuple[list[dict], list[dict], dict | None]:
    """Signaux datés pour UN candidat déjà identifié — jamais un ré-appel au
    registre (SIREN et nom sont déjà résolus par la recherche). Les sources
    tournent en parallèle ; chacune dégrade en liste vide SANS faire échouer les
    autres, et le dit dans le `degraded` rendu (jamais un silence, jamais un 0
    déguisé en mesure).

    DECOUVRIR-COLLECTE (Louis 13/10) — au moins : offres d'emploi des DEUX
    registres d'offres (cadres compris, stages retirés), actualités récentes
    rattachées, en plus des AO, annonces légales et levées.

    #2291.2 — rend AUSSI l'observation du modèle de contrat de la cible
    (`contract_model.observe_contract_model`), lue sur les MÊMES lignes
    d'offres et d'avis : zéro appel de plus. ``None`` = rien d'attribuable
    (« non observé »), jamais une préférence déduite.

    #4430 (Louis 21/10) — ``fresh`` : le plan des offres fraîches a désigné cette carte (cache commun
    de plus de 7 jours, sous les plafonds) ; la cascade payée de la fiche part pour elle, et sa
    collecte finit en arrière-plan (rangée au cache commun) si elle dépasse le budget de la carte."""
    # #4067 (décision Louis 13/10 n°2) — chaque fait public se lit D'ABORD dans le
    # cache PARTAGÉ, rangé par ENTREPRISE (SIREN) et nature : frais = aucun appel,
    # quel que soit l'espace qui l'a collecté (Découvrir ou analyse complète).
    company = company_fact_key(siren=siren)
    roles = "all" if all_roles else "it"
    # #4045 (14/10) — le PACK entre dans la clé du cache PARTAGÉ (comme dans
    # celle, interne, de chaque source) : sans lui, une ESN industrie et une
    # ESN IT qui cherchent la même entreprise se partageraient le tri de l'une
    # des deux.
    pack_key = pack or "esn_it"
    sources: tuple[str, ...] = ("boamp", "france_travail", "bodacc", "funding_feed", "press", "capital")
    # #4045.5 — Adzuna, SECONDE source d'offres, seulement si l'espace l'a branchée
    # (clés ADZUNA_*) : sans clé, ni coroutine ni appel — chemin byte-identique.
    # DISCOVER-OFFRES (15/10, C) — la réserve quotidienne : sous le plafond de Découvrir seulement ;
    # coupé, la source se tait (ni erreur ni bandeau) mais SON CACHE reste relu (aucun appel).
    adzuna_keyed = _adzuna_enabled()
    adzuna_on = adzuna_keyed and await adzuna_budget.discover_allowed()
    if adzuna_on:
        sources = (*sources, "job_aggregators")
    # #4045 (14/10) — deux lectures de plus, SILENCIEUSES (jamais dans `degraded`) : les
    # boards ATS publics (toutes les cartes) et ce que l'analyse ou un autre espace a déjà
    # rangé pour ce SIREN (lecture seule, aucun appel).
    sources = (*sources, "ats", "shared_jobs", "fresh_jobs")
    cache_on = await provider_cache.cache_available()
    # #4045 — vrai quand la source d'offres s'est déclarée en ERREUR pendant la collecte
    # de CETTE carte (429 avalé…) : son vide n'est alors pas une mesure.
    jobs_failed: list[str] = []
    results = await asyncio.gather(
        *(
            _bounded_source(coro)
            for coro in (
                cached_fact("tenders", company, "esn_it", lambda: public_tenders(name, siren=siren or None)),
                _as_queued(
                    cached_fact(
                        "jobs",
                        company,
                        f"ft:{pack_key}:{roles}",
                        lambda: _watched_jobs_fetch(
                            jobs_failed,
                            jobs_gate,
                            lambda: it_job_signals(name, pack=pack, all_roles=all_roles),
                        ),
                        stale_fallback_s=_JOBS_STALE_FALLBACK_S,
                    ),
                    queued=jobs_gate is not None,
                ),
                cached_fact("legal", company, "", lambda: legal_signals(siren)),
                # #3941 / #3091 — les levées de fonds annoncées dans les fils publics de la
                # presse spécialisée (déjà des signaux datés et sourcés ; aucun fil = []).
                funding_signals(name, other_names=other_names),
                # Flux presse lus UNE fois pour toute la page (`press_feeds`), jamais par carte.
                cached_fact("news", company, "", lambda: _press_for(name, siren, press_feeds)),
                # #4285.1 — l'augmentation de capital BODACC de CETTE société (par SIREN), un fait daté
                # « Augmentation de capital » (jamais « levée »). Source d'appoint : un échec se tait, la
                # source BODACC « légale » ci-dessus porte déjà le bandeau.
                _capital_rows(siren),
                *(
                    (
                        cached_fact(
                            "jobs",
                            company,
                            jobs_fact_variant("adzuna", pack_key, all_roles),
                            lambda: _adzuna_for_card(name, siren),
                            stale_fallback_s=_JOBS_STALE_FALLBACK_S,
                        ),
                    )
                    if adzuna_on
                    else ()
                ),
                _quiet_rows(
                    cached_fact(
                        "jobs",
                        company,
                        jobs_fact_variant("ats", pack_key, all_roles),
                        lambda: _ats_for_card(name, siren, pack=pack, all_roles=all_roles),
                    )
                    if cache_on
                    else _ats_for_card(name, siren, pack=pack, all_roles=all_roles)
                ),
                _peek_shared_jobs(company, pack_key, all_roles, include_adzuna=adzuna_keyed and not adzuna_on),
                _fresh_rows(name, siren, pack=pack, all_roles=all_roles) if fresh else _no_rows(),
            )
        ),
        return_exceptions=True,
    )
    degraded: list[dict] = []
    for source, result in zip(sources, results, strict=True):
        if source in ("ats", "shared_jobs", "capital", "fresh_jobs"):
            continue
        if isinstance(result, TimeoutError):
            degraded.append({"source": source, "reason": DegradeReason.TIME_BUDGET})
    results = [[] if isinstance(r, TimeoutError) else r for r in results]
    tenders, jobs, legal, funding, news, capital = results[:6]
    adzuna_offers = results[6] if adzuna_on else []
    if isinstance(adzuna_offers, list):  # CACHE-SOURCES (15/10) : fait brut rangé, tri du vendeur à la lecture
        adzuna_offers = _domain_rows(adzuna_offers, pack=pack, all_roles=all_roles)
    ats_offers = results[-3] if isinstance(results[-3], list) else []
    peeked: dict[str, list[dict] | None] = results[-2] if isinstance(results[-2], dict) else {}
    fresh_offers = _domain_rows(results[-1], pack=pack, all_roles=all_roles) if isinstance(results[-1], list) else []
    if jobs_failed and jobs == []:
        # Un vide issu d'une panne n'est pas « ne recrute pas » : la page le dit
        # (code machine, jamais un nom de fournisseur) et la carte ne se dit pas mesurée.
        _merge_degraded(degraded, [{"source": "france_travail", "reason": jobs_failed[0]}])
    signals: list[dict] = []
    # CACHE-SOURCES (15/10) : les sources à fait BRUT (agrégateurs) sont triées ICI, à la lecture,
    # au domaine du vendeur ; les autres ont été triées dans leur requête.
    shared_offers = [
        _domain_rows(rows, pack=pack, all_roles=all_roles) if source in RAW_JOBS_SOURCES else rows
        for source, rows in peeked.items()
        if rows
    ]
    offers = _merged_offers(jobs, adzuna_offers, ats_offers, fresh_offers, *shared_offers)
    for source, rows in (("france_travail", jobs), ("job_aggregators", adzuna_offers)):
        if isinstance(rows, BaseException):
            degraded.append({"source": source, "reason": DegradeReason.NETWORK_ERROR})
    for source, rows, mapper in (
        ("boamp", tenders, _tender_signal),
        ("offers", offers, _hiring_signal),
        ("bodacc", legal, _legal_signal),
        ("funding_feed", funding, lambda row: row),
        ("press", news, _news_signal),
        ("capital", capital, lambda row: row),
    ):
        if isinstance(rows, BaseException):
            degraded.append({"source": source, "reason": DegradeReason.NETWORK_ERROR})
            continue
        if not isinstance(rows, list):
            continue
        for row in rows:
            if isinstance(row, dict):
                mapped = mapper(row)
                if mapped:
                    signals.append(mapped)
    # #4068 (Louis 13/10) — ce que la carte n'affichera jamais (acte de capital,
    # titre vide, stage) ne compte pas non plus dans le rang : le classement vit
    # dans `discover_card_facts` (jumeau de `classifyCardFact`). L'âge reste à la carte.
    signals = drop_off_card_facts(signals, company_name=name)
    # #3901.p (Louis 16/10) — une offre HORS des métiers de l'ESN ne compte pas : ni carte, ni rang, ni « Ce qui a pesé ».
    signals = drop_off_scope_hiring(signals, scope_profile)
    signals = _dedup_by_url(signals)
    signals.sort(key=lambda s: s["date"], reverse=True)
    contract_model = observe_contract_model(
        name,
        offers,
        tenders if isinstance(tenders, list) else None,
    )
    return signals, degraded, contract_model


async def _no_rows() -> list[dict]:
    return []


async def _fresh_rows(name: str, siren: str, *, pack: str | None, all_roles: bool) -> list[dict]:
    """#4430 — la collecte fraîche d'UNE carte, bornée comme une source d'appoint. ``shield`` : au-delà
    du budget, l'achat n'est PAS annulé (il serait payé sans être rangé) — il finit et range au cache commun."""
    task = asyncio.ensure_future(fresh_jobs.collect_fresh_jobs(name, siren, pack=pack, all_roles=all_roles))
    task.add_done_callback(_forget_result)
    return await _quiet_rows(asyncio.shield(task))


async def _capital_rows(siren: str) -> list[dict]:
    """#4285.1 — l'augmentation de capital BODACC d'une carte, source d'appoint comme `_quiet_rows`, MAIS qui
    finit en arrière-plan au-delà du budget (``shield``, comme `_fresh_rows` #4430) : la lecture partage le seau
    `bodacc` avec la lecture légale de toute la page, sa file dépasse vite le budget d'une carte, et l'annuler
    l'empêchait de jamais se ranger au cache — aucune carte ne portait le fait, à aucune recherche."""
    task = asyncio.ensure_future(capital_increase_signals(siren))
    task.add_done_callback(_forget_result)
    return await _quiet_rows(asyncio.shield(task))


async def _quiet_rows(coro: Awaitable[Any]) -> list[dict]:
    """Une source d'appoint (board ATS) : plafonnée comme les autres, mais son échec ou
    son silence ne dit rien sur la carte — un board absent est le cas le plus fréquent."""
    try:
        # `asyncio.timeout` et non `wait_for` : pas de tâche de plus par carte (le coût de
        # démarrage d'une page entière tient dans la grâce de `_finish_signal_tasks`).
        async with asyncio.timeout(SIGNALS_SOURCE_BUDGET_S):
            rows = await coro
    except Exception:  # noqa: BLE001 — jamais un bandeau « partiel » pour un board qui n'existe pas
        return []
    return rows if isinstance(rows, list) else []


def _domain_rows(rows: list[dict], *, pack: str | None, all_roles: bool) -> list[dict]:
    """Le tri métier du VENDEUR (même règle que France Travail et Adzuna)."""
    return domain_offers(rows, pack=pack, all_roles=all_roles)


async def _ats_for_card(name: str, siren: str, *, pack: str | None, all_roles: bool) -> list[dict]:
    """Les offres des boards ATS publics (sans site connu : Greenhouse, et seulement s'il
    NOMME l'entreprise). Mêmes filtres que les autres sources : secteur de l'ESN, pas de stage."""
    rows = await it_job_signals_ats(name, all_roles=all_roles, siren=siren or None)
    return _domain_rows(rows, pack=pack, all_roles=all_roles)


async def _peek_shared_jobs(
    company: str | None, pack_key: str, all_roles: bool, *, include_adzuna: bool = False
) -> dict[str, list[dict] | None]:
    """Ce que l'ANALYSE (ou un autre espace) a déjà rangé pour ce SIREN, par source :
    liste (éventuellement vide = « cherché, rien ») ou ``None`` (pas d'entrée). Lecture
    seule : aucun appel externe."""
    if not await provider_cache.cache_available():
        return {}
    # Séquentiel, pas `gather` : cinq tâches de plus par carte pour des lectures qui ne
    # suspendent presque jamais ne feraient que coûter à la boucle.
    return {
        source: await peek_fact("jobs", company, jobs_fact_variant(source, pack_key, all_roles))
        for source in (*_CACHE_ONLY_JOB_SOURCES, *(("adzuna",) if include_adzuna else ()))
    }


#: #4677 — l'état d'une carte dont les signaux ne sont pas (encore) là. Trois états, jamais confondus :
#: ``pending`` (en cours : la moisson finit en arrière-plan), ``none`` (cherché, rien trouvé — une mesure),
#: ``unavailable`` (une source n'a pas pu répondre : son vide n'est pas une mesure). Une carte AVEC signaux
#: n'en porte aucun ; une carte jamais ciblée non plus (clé absente = « non cherché », muet).
SIGNALS_STATE_PENDING = "pending"
SIGNALS_STATE_NONE = "none"
SIGNALS_STATE_UNAVAILABLE = "unavailable"


def _jobs_pending_count(candidates: Sequence[Mapping[str, Any]]) -> int:
    """Combien de cartes ont leur collecte EN COURS (arrière-plan) : la page se relit plus tard.
    Une source indisponible ou une ligne jamais ciblée ne rappellent pas la source pour rien."""
    return sum(1 for c in candidates if c.get("siren") and c.get("signalsState") == SIGNALS_STATE_PENDING)


def _jobs_measure_line(candidates: Sequence[Mapping[str, Any]], *, cache: int, network: int) -> str:
    """#4045.7 — la mesure d'une requête, une ligne : où en sont les offres de la page."""
    with_offers = searched_empty = not_searched = 0
    for c in candidates:
        if not c.get("signalsSearched"):
            not_searched += 1
        elif any(s.get("type") == "hiring" for s in c.get("signals") or []):
            with_offers += 1
        else:
            searched_empty += 1
    return (
        f"Découvrir — offres : {with_offers} cartes avec offres / {searched_empty} cherchées vides / "
        f"{not_searched} non cherchées (cache={cache}, réseau={network})"
    )


_JOB_SOURCES = frozenset({"france_travail", "job_aggregators"})

#: #4045 (14/10) — combien d'appels « offres » d'une page attendent EN MÊME TEMPS
#: le registre d'offres : assez pour qu'un créneau ne reste jamais vide pendant
#: l'aller-retour HTTP, pas plus (le registre sert 1 req/s : le reste ne ferait
#: que se disputer, au hasard du rang, les mêmes créneaux).
JOBS_QUEUE_WIDTH = 5


class _QueuedSource:
    """Un fait « offres » dont la collecte passe par la file de la page : elle n'est
    PAS coupée à ``SIGNALS_SOURCE_BUDGET_S`` d'attente (la file est bornée à
    ``DISCOVER_TIME_BUDGET_S``), et ce qui dépasse le plafond continue en
    arrière-plan pour ranger son fait dans le cache partagé."""

    def __init__(self, coro: Awaitable[Any]) -> None:
        # #4447 — l'échec de la file (créneau du limiteur, 400 fournisseur, attente > budget) voyage
        # comme VALEUR : une exception qui sort de la tâche part à Sentry (IA-X/IA-Y/IA-T).
        self.task = asyncio.ensure_future(settled(coro))
        self.task.add_done_callback(_forget_result)


def _as_queued(coro: Awaitable[Any], *, queued: bool) -> Awaitable[Any]:
    return _QueuedSource(coro) if queued else coro


async def _bounded_source(coro: Awaitable[Any] | _QueuedSource) -> Any:
    """Plafonne une source à ``SIGNALS_SOURCE_BUDGET_S`` ; une source en FILE n'est
    pas annulée à l'échéance (elle finit en arrière-plan, #4067) — la carte, elle,
    dit « time_budget ».

    Le dépassement est un cas PRÉVU : il est RENDU (une instance ``TimeoutError``, que
    l'appelant reconnaît déjà), jamais LEVÉ — une exception qui sort d'une tâche asyncio
    est capturée par Sentry (BELLUM-IA-7/8/F), même quand l'appelant la rattrape."""
    try:
        if isinstance(coro, _QueuedSource):
            return await asyncio.wait_for(asyncio.shield(coro.task), SIGNALS_SOURCE_BUDGET_S)
        return await asyncio.wait_for(coro, SIGNALS_SOURCE_BUDGET_S)
    except Exception as exc:  # noqa: BLE001 — #4447 : un échec de source est rendu, dit à l'écran, jamais levé
        return exc


def _adzuna_enabled() -> bool:
    return bool(os.environ.get("ADZUNA_APP_ID", "").strip() and os.environ.get("ADZUNA_APP_KEY", "").strip())


async def _adzuna_for_card(name: str, siren: str) -> list[dict]:
    """Les offres Adzuna d'UNE carte : le fait BRUT de l'entreprise (clé = SIREN, comme
    l'analyse), sans stage. CACHE-SOURCES (15/10) : le tri métier du vendeur
    (``is_domain_offer``) se fait à la lecture, pas ici. La source dégrade en liste vide
    par elle-même."""
    rows = await adzuna_jobs(name, scope=EmployerScope.build(name, siren=siren or None))
    return drop_internship_postings(rows, title_keys=("title",), contract_keys=("contractType",))


async def _watched_jobs_fetch(
    failed: list[bool], gate: asyncio.Semaphore | None, fetch: Callable[[], Awaitable[Any]]
) -> Any:
    """``_queued_jobs_fetch`` + le constat « la source s'est déclarée en erreur »."""
    with source_health.watch_fetch_errors() as errors:
        rows = await _queued_jobs_fetch(gate, fetch)
    if errors and not rows:
        failed.append(_jobs_failure_reason(errors))
    return rows


def _jobs_failure_reason(errors: Sequence[str]) -> str:
    """Pourquoi la collecte d'offres d'une carte est vide : DIFFÉRÉE (notre limiteur ou
    notre budget de temps — rien n'a échoué chez la source) ou vraiment tombée. Une seule
    erreur à code réel suffit à dire « tombée » ; sans code connu, on ne devine pas."""
    codes = [getattr(e, "code", "") for e in errors]
    real = [c for c in codes if c != DegradeReason.TIME_BUDGET]
    if not real:
        return DegradeReason.TIME_BUDGET
    return next((c for c in real if c), DegradeReason.NETWORK_ERROR)


async def _queued_jobs_fetch(gate: asyncio.Semaphore | None, fetch: Callable[[], Awaitable[Any]]) -> Any:
    """Collecte réelle des offres d'UNE entreprise : file FIFO de la page (le haut du
    classement passe d'abord), puis le plafond d'attente du limiteur démarre APRÈS
    l'entrée dans la file, pas avant — l'attente de son tour ne le consomme plus."""
    if gate is None:
        return await fetch()
    async with asyncio.timeout(DISCOVER_TIME_BUDGET_S):
        await gate.acquire()
    try:
        with wait_deadline(time.monotonic() + SIGNALS_SOURCE_BUDGET_S):
            return await fetch()
    finally:
        gate.release()


async def _press_for(name: str, siren: str, feeds: Awaitable[dict] | None) -> list[dict]:
    """Les actualités d'UNE carte, sur les flux lus une fois pour la page. Flux
    illisibles → aucune actualité (la lecture des flux a noté sa dégradation)."""
    loaded: dict | None = None
    if feeds is not None:
        try:
            loaded = await asyncio.shield(feeds)
        except Exception:  # noqa: BLE001 — sans flux, pas d'actualités ; les autres sources tournent
            return []
    rss = await press_signals(name, siren or None, None, feeds=loaded)
    if rss:
        return rss
    # #4284.23 / #4286.3 — les flux RSS ne nomment presque jamais une PME : sans autre source, la carte ne portait que
    # des offres d'emploi. La recherche d'actualités (déjà lue par l'analyse complète, cache 30 j par entreprise) ajoute
    # des brèves DATÉES, mais seulement RATTACHÉES par SIREN (nom légal, SIREN ou domaine dans le texte) : sans SIREN
    # ancré, aucune brève (jamais attribuée sur le seul nom — zéro homonyme). Sans clé, no-op ; une panne = aucune brève.
    if len(re.sub(r"\D", "", siren or "")) != 9:
        return []
    try:
        news = await recent_news(name)
    except Exception:  # noqa: BLE001 — la presse ne fait jamais échouer une carte
        return []
    return attach_brave_news(news, company=name, legal_name=None, siren=siren, domain=None)


def _dedup_by_url(signals: list[dict]) -> list[dict]:
    """Une même annonce lue par deux sources (levée par le fil spécialisé ET par la
    presse) ne fait qu'UNE ligne. Sans lien, rien n'est fusionné."""
    seen: set[str] = set()
    out: list[dict] = []
    for signal in signals:
        url = signal.get("url")
        if url:
            if url in seen:
                continue
            seen.add(url)
        out.append(signal)
    return out


def _rank_signals_by_keywords(signals: list[dict], keywords: Sequence[str] | None) -> list[dict]:
    """#4045.1 — le mot-clé de la recherche TRIE : un signal qui le recoupe passe en
    tête (drapeau ``keywordMatch``, lu par l'écran pour « Correspond à »), les
    autres restent derrière dans leur ordre. Aucun signal retiré. Sans mot-clé,
    la liste est rendue TELLE QUELLE (byte-identique)."""
    terms = keyword_terms(list(keywords or []))
    if not terms:
        return signals

    def _hit(signal: dict) -> bool:
        # #4400.1 — la famille de mots entiers d'avant, OU la lecture souple (préfixe, abréviation, ET).
        if signal_matches_keywords(signal, terms):
            return True
        blob = " ".join(
            [
                str(signal.get("label") or ""),
                str(signal.get("detail") or ""),
                *map(str, signal.get("technologies") or []),
            ]
        )
        return any(matches_flexible_query(k, blob) for k in keywords or [])

    matched = [{**s, "keywordMatch": True} for s in signals if _hit(s)]
    return matched + [s for s in signals if not _hit(s)]


async def domain_of_card(candidate: Mapping[str, Any]) -> str | None:
    """Le domaine racine d'une carte : son site s'il est porté, sinon celui qu'une analyse a rangé pour ce
    SIREN. Jamais deviné depuis un nom — sans site connu, la carte n'a pas de ligne de volume."""
    return root_domain(candidate.get("website")) or await company_domains.lookup(candidate.get("siren"))


async def _page_volumes(targets: Sequence[dict]) -> None:
    """DISCOVER-OFFRES (15/10) — le volume d'offres de TOUTE la page : un seul aperçu gratuit, des
    domaines des cartes. Une carte sans domaine ou sans réponse n'a AUCUNE ligne (jamais « 0 »)."""
    try:
        domains = await asyncio.gather(*(domain_of_card(c) for c in targets))
        by_card = {id(c): d for c, d in zip(targets, domains, strict=True) if d}
        if not by_card:
            return
        volumes = await offer_volumes(set(by_card.values()))
        for card in targets:
            count = volumes.get(by_card.get(id(card), ""))
            if count:
                card["offersVolume"] = {"count": count, "windowDays": OFFERS_WINDOW_DAYS, "country": "FR"}
    except Exception:  # noqa: BLE001 — un volume absent ne casse jamais la page
        logger.warning("Découvrir — volume d'offres indisponible", exc_info=True)


class _SignalTasks(dict[asyncio.Future, dict]):
    """Les tâches de signaux par carte, + la tâche de volume d'offres de la page (attendue à part)."""

    volume: asyncio.Future | None = None


def _start_signal_tasks(
    candidates: list[dict], *, profile_data: dict, space_key: str | None = None
) -> dict[asyncio.Future, dict]:
    """Démarre — SANS attendre — les recherches de signaux des
    ``SIGNALS_CANDIDATE_LIMIT`` premières lignes RENDUES (déjà triées/coupées
    par l'appelant). Appelé tôt : les tâches tournent PENDANT l'appel modèle
    (l'angle, plus bas), jamais EN PLUS de lui — c'est ce qui rend le coût
    quasi nul dans le cas courant (trois sources publiques, rapides).

    Chaque candidat reçoit d'abord ``signalsSearched: False`` — retiré, jamais
    « aucun signal », tant que sa tâche n'a pas réellement abouti.

    #4430 (Louis 21/10) — avec ``space_key`` : UN plan d'offres fraîches pour la page
    (``fresh_jobs.plan_fresh_collection``, dans l'ordre des cartes) ; une carte lue en cache seul
    porte ``jobsAsOf`` (date de ses offres). Sans espace : cache seul, aucun achat."""
    for candidate in candidates:
        candidate.setdefault("signalsSearched", False)
    targets = [c for c in candidates[:SIGNALS_CANDIDATE_LIMIT] if c.get("siren")]
    if not targets:
        return {}
    all_roles = recruits_for_clients(profile_data)
    # #4045 (14/10) — les signaux de recrutement suivent le SECTEUR du vendeur
    # (IT pour une ESN IT, industrie pour une ESN industrie…), jamais un
    # filtre IT codé en dur : le pack déclaré du profil, lu une fois pour
    # toute la page (jumeau de `phase1_research.seller_pack`).
    seller_pack = normalize_offer_domain(profile_data.get("offerDomain"))
    # DECOUVRIR-COLLECTE — toute la page, mais jamais plus de `SIGNALS_CONCURRENCY`
    # entreprises en vol à la fois.
    gate = asyncio.Semaphore(SIGNALS_CONCURRENCY)
    # Les flux presse se lisent UNE fois pour la page, sans faire attendre les
    # autres sources : seule la lecture des actualités d'une carte les attend.
    feeds_task = asyncio.ensure_future(load_press_feeds())
    # #4045 — une file FIFO devant le registre d'offres, partagée par la page.
    jobs_gate = asyncio.Semaphore(JOBS_QUEUE_WIDTH)

    volume_task = asyncio.ensure_future(_page_volumes(targets))
    plan_task = (
        asyncio.ensure_future(fresh_jobs.plan_fresh_collection(targets, space_key=space_key)) if space_key else None
    )

    async def bounded(candidate: dict) -> tuple[list[dict], list[dict], dict | None]:
        fresh = False
        if plan_task is not None:
            try:
                plan = await plan_task
            except Exception:  # noqa: BLE001 — un plan en panne = cache seul, jamais une carte cassée
                plan = fresh_jobs.FreshPlan()
            fresh = candidate["siren"] in plan.to_collect
            if candidate["siren"] in plan.as_of:
                candidate["jobsAsOf"] = plan.as_of[candidate["siren"]]
        async with gate:
            # Une attente de jeton registre qui ne tient pas dans le plafond échoue
            # TOUT DE SUITE (#2521) plutôt que de dormir pour être coupée ensuite.
            with wait_deadline(time.monotonic() + SIGNALS_SOURCE_BUDGET_S):
                return await _candidate_signals(
                    candidate["name"],
                    candidate["siren"],
                    pack=seller_pack,
                    all_roles=all_roles,
                    press_feeds=feeds_task,
                    jobs_gate=jobs_gate,
                    scope_profile=profile_data,
                    other_names=tuple(
                        str(candidate[key]) for key in ("legalName", "tradeName") if isinstance(candidate.get(key), str)
                    ),
                    fresh=fresh,
                )

    # Le volume (un appel pour la page) ne retient JAMAIS une tâche de signaux : celles-ci
    # sont lues sans dépendre de lui, `_finish_signal_tasks` l'attend À PART, borné.
    tasks = _SignalTasks({asyncio.ensure_future(bounded(c)): c for c in targets})
    tasks.volume = volume_task
    return tasks


def _forget_result(task: asyncio.Future) -> None:
    if not task.cancelled():
        task.exception()


async def _await_volume(volume_task: asyncio.Future | None, deadline: float) -> None:
    """Le volume d'offres de la page est attendu un court instant APRÈS les signaux, jamais
    au-delà du budget global (moins marge) : en retard, ses cartes restent sans ligne, et
    aucune carte dont les signaux sont revenus ne perd `signalsSearched` à cause de lui."""
    if volume_task is None or volume_task.done():
        return
    wait = min(VOLUME_WAIT_S, deadline - time.monotonic() - ANGLE_TRAILING_MARGIN_S)
    if wait <= 0.0:
        return
    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(asyncio.shield(volume_task), wait)


async def _finish_signal_tasks(
    tasks: dict[asyncio.Future, dict],
    degraded: list[dict],
    deadline: float,
    *,
    profile_data: Mapping[str, Any],
    filters: Mapping[str, Any],
    keywords: Sequence[str] | None = None,
) -> None:
    """Récupère les tâches démarrées par ``_start_signal_tasks``, bornées au
    PLUS COURT de ``SIGNALS_TIME_BUDGET_S`` (à partir d'ICI, pas depuis leur
    création) ET de ce qu'il reste du budget GLOBAL (``deadline``, #2496 bis).

    Régression du 18/09/2026 (mesurée : sur un budget déjà épuisé par la
    chaîne registre, la requête entière retombait quand même à ~0,2-1,6 s au
    lieu de rester sous le budget) : cette étape attendait toujours jusqu'à
    ``SIGNALS_TIME_BUDGET_S`` de PLUS, sans jamais regarder ``deadline`` —
    les signaux vivaient EN DEHORS du budget global qu'ils sont censés
    respecter comme n'importe quelle autre étape. Une tâche qui n'a pas fini
    est comptée (et finit en arrière-plan, #4067), jamais attendue plus longtemps : la liste ne se
    bloque jamais sur un signal.

    #3089 (mesuré en bêta, Apricot Labs, 24/09/2026) : ``score_candidate``
    n'était appelé qu'une fois, AVANT que cette fonction ne pose
    ``candidate["signals"]`` — le bloc « signaux » (et l'adressabilité, qui en
    dépend) restait donc pour toujours dans ``scoreUnmeasured``, alors même que
    le candidat affichait déjà ses signaux datés juste à côté. Un candidat
    RÉELLEMENT cherché voit donc son score REJOUÉ avec les signaux obtenus."""
    if not tasks:
        return
    # DECOUVRIR-COLLECTE — la page ENTIÈRE est désormais interrogée : attendre
    # jusqu'au `deadline` lui-même ne laissait plus rien au rescoring et à la
    # sérialisation qui suivent. Même marge de queue que l'angle.
    remaining = max(0.0, deadline - time.monotonic() - ANGLE_TRAILING_MARGIN_S)
    # Un budget épuisé laisse quand même quelques tours de boucle : une réponse
    # INSTANTANÉE (un fait frais du cache partagé) n'est jamais jetée faute d'un
    # tour d'ordonnanceur — c'est précisément le cas que le cache doit servir.
    timeout = max(min(SIGNALS_TIME_BUDGET_S, remaining), SIGNALS_GRACE_S)
    done, pending = await asyncio.wait(tasks.keys(), timeout=timeout)
    await _await_volume(getattr(tasks, "volume", None), deadline)
    for task in pending:
        # #4067 — pas annulée : elle finit en arrière-plan (chaque source est déjà
        # bornée à `SIGNALS_SOURCE_BUDGET_S`) et range ses faits publics dans le
        # cache partagé. Son résultat n'est plus lu ici ; son erreur éventuelle est
        # consommée pour ne jamais remonter en « exception jamais récupérée ».
        task.add_done_callback(_forget_result)
        tasks[task]["signalsState"] = SIGNALS_STATE_PENDING
    if pending:
        degraded.append({"source": "discover-signals", "reason": DegradeReason.TIME_BUDGET, "count": len(pending)})
    for task in done:
        candidate = tasks[task]
        try:
            signals, local_degraded, contract_model = task.result()
        except Exception:  # noqa: BLE001 — une tâche qui lève ne doit pas faire échouer les autres
            degraded.append({"source": "discover-signals", "reason": DegradeReason.NETWORK_ERROR})
            continue
        # #4115 — la grille (garder/rejeter par type, 5 forts + 10 contexte,
        # adéquation › fraîcheur › force) passe APRÈS le mot-clé : `keywordMatch`
        # est l'une de ses preuves d'adéquation.
        # Lot T point 1 — les offres qui se disent celles d'une ESN : comptées, le drapeau retiré, puis les champs d'acteur
        # rejoués par LA fonction partagée (GA-26) — un NAF ambigu + assez d'offres concordantes ⇒ « Autres acteurs ».
        esn_offers = sum(1 for s in signals if s.pop(_ESN_OFFER_FLAG, None))
        if esn_offers:
            candidate.update(
                actor_fields(
                    naf=candidate.get("nafCode"),
                    name=candidate.get("name"),
                    siren=candidate.get("siren"),
                    esn_offer_count=esn_offers,
                )
            )
        signals = arrange_signals(_rank_signals_by_keywords(signals, keywords))
        candidate["signals"] = signals
        candidate["signalsSearched"] = True
        # #2291.2 — posé SEULEMENT ici, sur un candidat réellement cherché :
        # clé absente = jamais cherché ; ``None`` = cherché, non observé.
        candidate["contractModel"] = contract_model
        # Recette prod 14/10 — une panne de source vue sur N cartes se dit UNE fois (bandeau
        # « Résultats partiels » répété des dizaines de fois) : jamais `extend` ici.
        _merge_degraded(degraded, local_degraded)
        if not signals and any(e.get("source") in _JOB_SOURCES for e in local_degraded):
            # La source d'offres n'a PAS pu répondre : « aucun signal mesuré » serait
            # faux. La carte redevient « non cherchée » (muette), jamais un 0 déguisé.
            candidate["signalsSearched"] = False
            # Un timeout n'est pas un échec : la source est seulement lente, la moisson la reprend.
            timed_out = all(
                e.get("reason") == DegradeReason.TIME_BUDGET for e in local_degraded if e.get("source") in _JOB_SOURCES
            )
            candidate["signalsState"] = SIGNALS_STATE_PENDING if timed_out else SIGNALS_STATE_UNAVAILABLE
        elif not signals:
            candidate["signalsState"] = SIGNALS_STATE_NONE
        rescored = score_candidate(
            candidate,
            profile=profile_data,
            filters=filters,
            signals=signals,
            degraded=degraded,
        )
        candidate["score"] = rescored["score"]
        candidate["scoreMax"] = rescored["scoreMax"]
        candidate["scoreUnmeasured"] = rescored["unmeasured"]
        candidate["scoreFactors"] = rescored["factors"]
        candidate["dataConfidence"] = rescored["dataConfidence"]
        candidate["addressability"] = rescored["addressability"]


def _apply_target_sector_filter(
    companies: list[dict],
    profile_data: Mapping[str, Any],
    *,
    include_out_of_target: bool,
    explicit_sector: bool = False,
) -> tuple[list[dict], TargetSectorFilterInfo | None]:
    """#2489.3/D1 (décision Louis, 18/09/2026 après-midi puis soir) — la cible
    déclarée du profil ESN FILTRE toujours, y compris une recherche en texte
    libre. Mesuré en PRODUCTION le 18/09 (`474fcfa31`, espace « LouisESN ») :
    `?freetext=entreprises+dans+le+75` rendait 24 résultats, 0 dans les 5
    secteurs cibles déclarés — 9 restauration traditionnelle, 4 restauration
    rapide, 2 supermarchés, 1 hôtellerie, 1 boulangerie.

    Un secteur INCONNU côté candidat (`sector` vide) n'est PAS « hors cible » —
    c'est une affirmation qu'on ne peut pas faire, donc jamais écarté ni compté
    (GA-18/GA-19 : « non mesuré » n'est jamais une valeur basse).

    Point 3 de la décision (18/09 soir) : ``explicit_sector`` — un secteur
    coché dans le rail structuré OU lu dans le texte libre par
    `_apply_reading` — PRIME sur la cible déclarée. La cible ne s'applique
    alors pas du tout : un commercial qui tape « hôtellerie » veut de
    l'hôtellerie, pas ses 5 secteurs cibles silencieusement recroisés dessus.

    ⚠️ #3873.6 revient sur #2489.3/D1, délibérément (Louis 10/10/2026) : un
    vidage EXPLICITE des cases secteurs du rail lève la cible — l'écran pose
    alors ``include_out_of_target`` (même levier que « hors de ma cible »). Le
    rail jamais touché garde le filtre ci-dessus.

    Rend ``(companies_gardées, info)``. ``info`` vaut ``None`` quand l'espace
    n'a déclaré AUCUN secteur cible, OU quand un secteur explicite prime : dans
    les deux cas rien n'est écarté et l'écran n'affiche pas de compteur —
    jamais `{"applied": false, "excludedCount": 0}` qui prétendrait un filtre
    qui n'a pas tourné.
    """
    if explicit_sector:
        return companies, None
    target_sectors = target_sectors_of(profile_data)
    if not target_sectors:
        return companies, None

    kept: list[dict] = []
    excluded_sectors: list[str] = []
    for company in companies:
        activity_text = (company.get("sector") or "").strip()
        if not activity_text:
            # Secteur inconnu : jamais écarté en silence, jamais compté.
            kept.append(company)
            continue
        if sector_matches_profile_targets(activity_text, target_sectors):
            kept.append(company)
            continue
        excluded_sectors.append(activity_text)
        if include_out_of_target:
            kept.append(company)

    info = TargetSectorFilterInfo(
        applied=not include_out_of_target,
        excludedCount=len(excluded_sectors) if not include_out_of_target else 0,
        excludedSectors=sorted(set(excluded_sectors)) if not include_out_of_target else [],
    )
    return kept, info


async def _apply_listing_filter(
    companies: list[dict], *, exclude_listed: bool
) -> tuple[list[dict], ListingFilterInfo | None]:
    """#4361.2 — retire les comptes dont la cotation est PROUVÉE par l'index ouvert.

    Agit sur ce que la recherche rend, AVANT la coupe à ``limit`` : un compte retiré ne prend pas
    la place d'un autre. Un SIREN absent de l'index reste (cotation non établie, comptée à part) ;
    index muet : rien n'est retiré et ``sourceAvailable`` le dit. ``None`` quand l'interrupteur
    n'est pas posé."""
    if not exclude_listed:
        return companies, None
    index = await listed_sirens()
    if index is None:
        return companies, ListingFilterInfo(excludedCount=0, unknownCount=len(companies), sourceAvailable=False)
    kept = [c for c in companies if _clean_siren(c.get("siren")) not in index]
    return kept, ListingFilterInfo(excludedCount=len(companies) - len(kept), unknownCount=len(kept))


async def _rank_and_angle(
    req: DiscoverRegistryRequest,
    filters: Any,
    limit: int,
    query: dict,
    shown_query: dict,
    applied: dict[str, Any],
    degraded: list[dict],
    companies: list[dict],
    deadline: float,
    *,
    skill_mode: bool = False,
    zone_widening: dict[str, Any] | None = None,
) -> DiscoverRegistryResponse:
    """Qualification, score, classement, coupe, puis l'angle dans le temps qui reste.

    ``skill_mode`` (COMPETENCE-TROUVE) — comptes trouvés par leurs offres : les secteurs du profil
    n'écartent rien (E), et le rang porte d'abord le nombre et la fraîcheur des offres."""
    fetched_at = datetime.now(UTC).isoformat()
    # #2521 — une sous-requête abandonnée à la limite de temps n'est pas une
    # source muette : elle ne décide pas de l'attribution des lignes rendues.
    silent = {d["source"] for d in degraded if d.get("reason") != DegradeReason.TIME_BUDGET}
    source_name = next(
        (name for name in ("pappers", "recherche-entreprises") if name not in silent),
        "registre",
    )

    # #2489.3/D1 — la cible déclarée FILTRE toujours, AVANT la qualification et
    # le score : un candidat écarté ici ne coûte ni conseil ni angle. Point 3
    # de la décision (18/09 soir) : un secteur EXPLICITE — coché dans le rail
    # structuré OU lu dans le texte libre par `_apply_reading` (`filters` REÇUS
    # ICI sont déjà ceux d'APRÈS lecture, `discover_registry:975-980`) — PRIME
    # sur la cible ; elle ne s'applique alors pas du tout, l'écran ne prétend
    # pas en appliquer une (même état que « pas de cible déclarée »).
    # COMPETENCE-TROUVE (E) — une compétence posée sans secteur explicite : les secteurs du profil
    # peuvent ORDONNER (ils pèsent dans le score), jamais écarter ce tirage — l'offre est la preuve.
    # Lot Q point 5 (#4892) — une marque cherchée par son NOM est un choix explicite au même titre qu'un secteur :
    # la cible du profil ne jette plus les entités du groupe AVANT le regroupement (« + N entités du groupe »).
    explicit_sector = (
        skill_mode
        or bool(filters.sector or filters.sectors or filters.nafCode)
        or bool((filters.freetext or "").strip())
    )
    companies, sector_filter = _apply_target_sector_filter(
        companies,
        req.profile_data,
        include_out_of_target=req.includeOutOfTarget,
        explicit_sector=explicit_sector,
    )

    # Le CONSEIL DE QUALIFICATION passe avant le score (addendum final p33-40).
    # Le registre répond exactement à la question posée ; ce qui manquait, c'est
    # la question « cette ligne est-elle une organisation à laquelle on peut
    # vendre ? ». Elle est déterministe : aucun appel modèle, aucun réseau.
    # #4361.2 — « Exclure les sociétés cotées » : retrait côté recherche, avant la coupe à `limit`.
    companies, listing_filter = await _apply_listing_filter(companies, exclude_listed=bool(filters.excludeListed))
    if not companies and listing_filter is not None:
        return DiscoverRegistryResponse(
            candidates=[],
            query=shown_query,
            degraded=degraded,
            recommendedSort=recommended_sort(req.profile_data),
            targetSectorFilter=sector_filter,
            listingFilter=listing_filter,
        )
    qualifications = qualify_all(companies, filters=applied)

    # #2614.1 (correction, 21/09/2026) — compté ICI, AVANT toute coupe : le tri
    # plus bas (`_VERDICT_RANK`) place les verdicts EXCLU en dernier, et
    # `candidates[:limit]` les retire donc TOUS dès que la recherche en trouve
    # plus que `limit`. `hiddenCandidatesBreakdown` (écran), qui ne voit que ce
    # qui a survécu à la coupe, retombait alors à zéro alors que des comptes
    # avaient bien été écartés — réfuté en recette écran le 21/09/2026. Ce
    # total voyage dans `query` (même canal que `query.reading`, plus bas) pour
    # ne jamais dépendre de ce qui survit à la limite d'affichage.
    qualification_excluded_total = sum(1 for q in qualifications if q.get("verdict") == "excluded")
    shown_query = _widening_net_of_exclusions(shown_query, companies, qualifications)
    shown_query = with_qualification(shown_query, qualifications)

    candidates = []
    origin_by_siren: dict[str, str] = {}
    for company, qualification in zip(companies, qualifications, strict=True):
        # #2805 (#2291.3) — la VRAIE provenance d'une ligne DataForge, posée par
        # `_augment_with_dataforge_candidates` ; retirée ici, avant que `company`
        # ne soit lu ou étalé, pour ne jamais atteindre la réponse.
        raw_source = company.pop("_source", None)
        origin_by_siren[str(company.get("siren") or "")] = _origin_of(company, raw_source)
        candidate_source = raw_source or source_name
        # Les signaux datés sont produits par `/discover/signals` (lot voisin) ;
        # ici la liste est vide plutôt que devinée.
        signals: list[dict] = []
        scored = score_candidate(
            company,
            profile=req.profile_data,
            # Le score raisonne sur les critères DEMANDÉS (vocabulaire d'écran),
            # pas sur leur traduction registre.
            filters=applied,
            signals=signals,
            degraded=degraded,
        )
        candidates.append(
            {
                **company,
                "score": scored["score"],
                # Le dénominateur RÉEL et les blocs qu'on n'a pas pu mesurer :
                # sans profil ESN ni critère, un candidat n'est pas « 0/100 »,
                # il est « non évalué ». L'UI doit pouvoir faire la différence.
                "scoreMax": scored["scoreMax"],
                "scoreUnmeasured": scored["unmeasured"],
                "scoreFactors": scored["factors"],
                "dataConfidence": scored["dataConfidence"],
                # Le SECOND nombre (§6.4). Séparé du premier, et jamais additionné :
                # « intérêt 68/80 · adressabilité 4/20 » dit qu'un compte est
                # parfait et hors de portée ; un 61 unique ne le dit pas, et
                # c'est lui qui sortirait en tête de liste.
                "addressability": scored["addressability"],
                "signals": signals,
                # #4284.26 (recette 21/10, L3) — le COMPTE hors métier se DIT aussi par la voie registre : son
                # secteur (NAF) contre les métiers de l'ESN, le MÊME prédicat que le mode signaux.
                "outOfTrade": account_out_of_trade(company.get("nafCode"), req.profile_data),
                "angle": None,
                "suggestedRoles": [],
                # L'état portefeuille est résolu par l'API, seule à connaître les
                # comptes de l'appelant. Valeur neutre ici — jamais devinée.
                "portfolioState": "new",
                "accountId": None,
                # Le verdict voyage AVEC le candidat plutôt que de le supprimer :
                # une exclusion silencieuse est invérifiable, et le rapport (p35)
                # demande justement que le produit explique pourquoi un compte
                # est recommandé OU rejeté.
                #
                # # #2614.1 — depuis le 20/09/2026, le FRONT masque désormais les
                # verdicts "excluded" de la liste affichée (compteur nommé,
                # `applyCandidateFilters`/`hiddenCandidatesBreakdown` dans
                # `discover-presentation.ts`). Ce champ continue de voyager ICI,
                # inchangé : sans lui, aucun compteur ne saurait combien a été
                # masqué — masquer sans le dire serait la même faute que
                # « non mesuré » affiché « 0 ».
                "qualification": qualification,
                "sources": [{"name": candidate_source, "fetchedAt": fetched_at}],
                # #4793.1 (recette 01/11) — un compte venu de la base COMMUNE se reconnaît à l'écran : un booléen, jamais
                # le nom d'une source (#4791.4). La ligne du registre qui porte le même besoin garde son origine.
                **(
                    {"fromCommonBase": True}
                    if origin_by_siren[str(company.get("siren") or "")] == "common_base"
                    else {}
                ),
                # Lot Q point 1 (#4746.2, #4814) — les MÊMES champs d'acteur que `/discover/signals`, par la MÊME
                # fonction (GA-26) : c'est eux qui décident « Comptes » ou « Autres acteurs » côté web.
                **actor_fields(naf=company.get("nafCode"), name=company.get("name"), siren=company.get("siren")),
            }
        )

    # L'ordre porte D'ABORD le verdict, ensuite le score. Un compte « à
    # vérifier » avec un bon score reste en dessous d'un recommandé moins bien
    # noté : le score mesure l'intérêt commercial, le verdict dit si la ligne est
    # une cible — et une non-cible bien notée reste une non-cible.
    candidates.sort(key=_rank_key, reverse=True)
    if skill_mode:
        # Tri stable : à offres égales, le rang d'avant (verdict, score, taille) départage.
        candidates.sort(key=_skill_rank_key, reverse=True)
    elif _diversify_sections(filters):
        candidates = _interleave_sections(candidates)
    # #2299.27 — territoire APRÈS secteur : les deux axes sont séparés (jamais
    # composés en une seule clé), et cet ordre est la composition la plus
    # simple à expliquer — le dernier passage porte la promesse « une absence
    # de territoire ne dégrade jamais un rang » jusqu'à l'ordre RÉELLEMENT
    # affiché ; si le secteur tournait après, un candidat sans département
    # connu pourrait encore être déplacé malgré cette promesse.
    if _diversify_territory(filters) and not skill_mode:
        candidates = _interleave_territory(candidates)
    # #4433 — l'exact en tête, l'élargi après (palier 1 puis 2), l'ordre d'avant départage.
    candidates = exact_first(candidates)
    if zone_widening:
        # #4429.2 — tri STABLE : les comptes de la ville demandée restent en tête, chaque palier
        # élargi ensuite, dans l'ordre du classement.
        candidates.sort(key=lambda c: ZONE_TIERS.index(c["zone"]["tier"]) if c.get("zone") else 0)
    # Lot Q point 2 (décision Louis 31/10, brief F §6 bis) — sans NAF ou sans SIREN ⇒ en bas de Comptes, sur
    # TOUTES les pages : le partage est posé AVANT la coupe, jamais par page.
    candidates = _unverified_last(candidates)
    found_before_cut = sum(1 for c in candidates if not _is_excluded(c))
    candidates = _cut_with_space_reserve(candidates, limit, _space_sirens(req))
    # #4706.1 — la coupe à `limit` se DIT : « N affichés sur au moins M trouvés » (même règle que #5009.1 : « au moins »
    # dès que le total est celui d'une lecture par pages). Rien de coupé ⇒ rien n'est écrit. On ne relève pas la limite.
    list_cut = list_cut_note(found_before_cut, sum(1 for c in candidates if not _is_excluded(c)))
    if list_cut is not None:
        shown_query = {**shown_query, "listCut": list_cut}
    # #4791.5 — candidats RENDUS par origine, pour la recette (journal seulement, jamais affiché).
    if (origin_counts := _ORIGIN_COUNTS.get()) is not None:
        for candidate in candidates:
            origin = origin_by_siren.get(str(candidate.get("siren") or ""), "registry")
            origin_counts[origin] = origin_counts.get(origin, 0) + 1

    # #3705.5 — lot RBC (décision Louis 11/10) : le rattachement de groupe se VÉRIFIE par ligne
    # affichée (Pappers, plafonné par recherche, cache par SIREN, sans clé = zéro appel). Un
    # mandataire personne morale du registre vaut indice ET passe aussi par la vérification
    # (renversement Louis 11/10) : c'est elle qui sourcera l'arête holding → filiale (#3983).
    await _attach_group_links(candidates, deadline)
    # #4892.1 — une marque = une ligne : les entités d'une même marque (même ville) sont PROPOSÉES au regroupement
    # d'affichage ; jamais fusionnées en base.
    # #4892.3 / #4842.2 — recherche par NOM : seules les raisons sociales qui le contiennent restent, et elles se
    # regroupent sous une tête (la règle du premier mot ≥ 6 lettres reste pour les listes non nominatives).
    searched_name = (getattr(filters, "freetext", None) or "").strip() or None
    if searched_name:
        candidates = keep_named(candidates, searched_name)
    group_by_brand(candidates, searched=searched_name)

    # Décision 1 (18/09/2026) — démarré ICI, AVANT l'angle, pour tourner
    # PENDANT l'appel modèle plutôt qu'après lui (voir le docstring de la
    # fonction) : récupéré plus bas, une fois l'angle revenu.
    # #4067 — compteurs du cache partagé pour CETTE recherche (journal seulement :
    # combien de faits servis sans appel ; jamais exposé à l'écran, GA-43).
    await source_cache.begin_run(account_id="")
    signal_tasks = _start_signal_tasks(candidates, profile_data=req.profile_data, space_key=req.spaceKey)

    # L'unique appel modèle, APRÈS la coupe (#2490.3) : l'angle n'est écrit que
    # pour les comptes réellement montrés, et jamais pour un compte écarté.
    #
    # #2521 (suite) — ET plafonné à `ANGLE_CANDIDATE_LIMIT` : `angled` est déjà
    # trié par le classement déterministe (`_rank_key`, verdict puis score), la
    # coupe garde donc les MEILLEURS, jamais un sous-ensemble arbitraire. Le
    # reste garde son score et son verdict, sans angle inventé.
    angled = [candidate for candidate in candidates if candidate["qualification"]["verdict"] != "excluded"]
    angled = angled[:ANGLE_CANDIDATE_LIMIT]
    if angled:
        # #2496 bis — dernière étape de la chaîne séquentielle : si le budget
        # global est déjà épuisé (ville + registre + rappel de page 2 lents),
        # on rend la liste SANS angle plutôt que d'ajouter un cinquième délai —
        # les faits (SIREN, score, qualification) restent vrais sans lui.
        #
        # #2521 — la raison est `time_budget`, plus `network_error` : on a CESSÉ
        # D'ATTENDRE un modèle qui n'avait pas fini, on ne l'a pas trouvé
        # « injoignable ». La liste reste classée par le score déterministe.
        #
        # #2521 (suite) — moins `ANGLE_TRAILING_MARGIN_S` : ce qui suit le
        # retour du modèle (rattachement, sérialisation) n'a pas son propre
        # budget, la marge le couvre par avance.
        remaining = deadline - time.monotonic() - ANGLE_TRAILING_MARGIN_S
        angles: dict[str, dict] = {}
        if remaining <= 0:
            degraded.append({"source": "claude", "reason": DegradeReason.TIME_BUDGET})
        else:
            try:
                angle_call = _angles_by_siren(angled, req.profile_data, query, degraded)
                angles = await asyncio.wait_for(angle_call, remaining)
            except TimeoutError:
                degraded.append({"source": "claude", "reason": DegradeReason.TIME_BUDGET})
        for candidate in angled:
            angle = angles.get(candidate["siren"], {})
            candidate["angle"] = angle.get("angle")
            candidate["suggestedRoles"] = angle.get("suggestedRoles", [])

    # Décision 1 (suite) — récupéré APRÈS l'angle : dans le cas courant les
    # tâches sont déjà terminées (trois sources publiques, plus rapides qu'un
    # appel modèle), donc cette étape n'ajoute rien au temps mesuré. ``deadline``
    # passé ici : un budget global déjà épuisé n'accorde plus de temps en plus
    # pour les signaux (#2496 bis).
    # #4677.1 — la fenêtre PROPRE des signaux (``_signals_deadline``), jamais l'échéance de la liste.
    await _finish_signal_tasks(
        signal_tasks,
        degraded,
        _signals_deadline(deadline),
        profile_data=req.profile_data,
        filters=applied,
        keywords=filters.keywords,
    )
    # #4045.3 — les pannes de sources de signaux qui n'ont jamais LEVÉ (voir le
    # docstring de `_merge_source_health_degraded`) ne sont relues qu'ICI, une
    # fois pour toute la page.
    _merge_source_health_degraded(degraded, get_correlation_id())
    searched_cards = list(signal_tasks.values())
    if signal_tasks:
        stats = source_cache.run_stats()
        logger.info(
            "Découvrir — faits publics : %d servis par le cache partagé, %d collectés (%d entreprises)",
            stats["hits"].get("public_facts", 0),
            stats["misses"].get("public_facts", 0),
            len(signal_tasks),
        )
        logger.info(
            _jobs_measure_line(
                searched_cards,
                cache=stats["hits"].get("public_facts", 0),
                network=stats["misses"].get("public_facts", 0),
            )
        )
    jobs_pending = _jobs_pending_count(searched_cards)

    # #2490 — la requête RENDUE porte la lecture de la demande ; celle donnée au
    # modèle (plus haut) reste la requête normalisée.
    # #2614.1 — `qualificationExcludedTotal` voyage ICI, dans `query` (comme
    # `reading`), jamais recalculé depuis `candidates` : lui seul a vu le total
    # AVANT la coupe à `limit`.
    return DiscoverRegistryResponse(
        candidates=candidates,
        query={**shown_query, "qualificationExcludedTotal": qualification_excluded_total},
        degraded=degraded,
        recommendedSort=recommended_sort(req.profile_data),
        targetSectorFilter=sector_filter,
        listingFilter=listing_filter,
        # #4627 — le bandeau de zone se recompte sur ce que la liste RENDUE porte (écartés et coupés ne comptent pas).
        zoneWidening=zone_widening_of_list(zone_widening, candidates) if zone_widening else None,
        jobsPending=jobs_pending > 0,
        jobsPendingCount=jobs_pending,
    )


async def _attach_group_links(candidates: list[dict], deadline: float) -> None:
    """#3705.5 — pose `groupLink` ({kind, entities}) sur les lignes dont un groupe est SOURCÉ.
    Ne dépasse jamais le budget de temps restant ; un échec ne pose rien (jamais un groupe deviné)."""
    rows = [
        {
            "siren": c["siren"],
            # #3705.5 (renversement 11/10) — servent à prioriser les lignes décisives dans le plafond.
            "nafCode": c.get("nafCode"),
            "geography": c.get("geography"),
            "group_link": (
                {"observed_entities": c["corporateOfficers"][:3], "kind": "legal_entity_officer"}
                if c.get("corporateOfficers")
                else None
            ),
        }
        for c in candidates
        if c.get("siren")
    ]
    remaining = deadline - time.monotonic() - ANGLE_TRAILING_MARGIN_S
    edges: set[tuple[str, str]] = set()
    if remaining > 0:
        try:
            edges = await asyncio.wait_for(attach_group_links(rows), remaining)
        except TimeoutError:
            logger.info("discover: vérification de groupe abandonnée au budget de temps")
    links = {row["siren"]: row["group_link"] for row in rows if row["group_link"]}
    for candidate in candidates:
        link = links.get(candidate.get("siren"))
        if link:
            candidate["groupLink"] = {"kind": link["kind"], "entities": link["observed_entities"]}
    # #3983 (reste, Louis 11/10) — une holding hors zone dont une filiale SOURCÉE est dans la zone :
    # la filiale reste la cible, la holding est écartée avec sa raison. Aucun appel en plus.
    redirect_holdings(candidates, edges)
    # #3983.11 (Louis 15/10) — filiale sans dirigeant visible : le dirigeant de la maison mère
    # SOURCÉE, mentionné « dirigeant du groupe ». Registre gratuit, plafonné, jamais bloquant.
    remaining = deadline - time.monotonic() - ANGLE_TRAILING_MARGIN_S
    if edges and remaining > 0:
        try:
            await asyncio.wait_for(
                inherit_group_people(candidates, edges, recherche_entreprises.fetch_people_by_siren), remaining
            )
        except TimeoutError:
            logger.info("discover: dirigeant du groupe abandonné au budget de temps")


_VERDICT_RANK = {"recommended": 2, "to_verify": 1, "excluded": 0}


def _tier_key(candidate: Mapping[str, Any]) -> tuple[int, bool, int]:
    """Le PALIER d'un candidat : son verdict, puis — dans « à vérifier » — la
    force du doute.

    Une ligne dont le texte libre n'est ni dans le nom ni dans l'activité ne
    répond pas à la question posée : elle passe après celles qui y répondent.
    Ensuite, moins de doutes passe devant plus de doutes — une amicale sans
    salarié en porte deux, un bureau d'études au effectif non publié un seul.
    """
    qualification = candidate["qualification"]
    verdict = qualification["verdict"]
    doubts = [qualification.get("code"), *(qualification.get("otherCodes") or [])] if verdict == "to_verify" else []
    doubts = [code for code in doubts if code]
    return (_VERDICT_RANK.get(verdict, 0), VerifyCode.KEYWORD_ELSEWHERE not in doubts, -len(doubts))


def _unverified_last(candidates: list[dict]) -> list[dict]:
    """Lot Q point 2 — un compte dont le NAF ou le SIREN manque ne peut pas être vérifié : il passe après tous ceux
    qui le sont, l'ordre d'avant départageant dans chaque groupe. Jamais retiré. Les comptes EXCLUS par la
    qualification gardent leur place : seuls les comptes non exclus se réordonnent entre eux, dans leurs propres rangs."""

    def excluded(candidate: dict) -> bool:
        return (candidate.get("qualification") or {}).get("verdict") == "excluded"

    slots = [i for i, c in enumerate(candidates) if not excluded(c)]
    live = [candidates[i] for i in slots]
    live.sort(key=lambda c: not (c.get("nafCode") and _clean_siren(c.get("siren"))))
    out = list(candidates)
    for slot, candidate in zip(slots, live, strict=True):
        out[slot] = candidate
    return out


def _skill_rank_key(candidate: Mapping[str, Any]) -> tuple[bool, int, str]:
    """COMPETENCE-TROUVE — un compte écarté par la qualification reste après ; sinon le nombre d'offres
    sur la compétence, puis la plus récente."""
    evidence = candidate.get("skillEvidence") or {}
    latest = evidence.get("latestOffer") or {}
    excluded = (candidate.get("qualification") or {}).get("verdict") == "excluded"
    return (not excluded, int(evidence.get("offerCount") or 0), str(latest.get("date") or ""))


def _space_sirens(req: DiscoverRegistryRequest) -> frozenset[str]:
    """Les SIREN valides transmis par l'API (jamais un SIRET tronqué, jamais un nom)."""
    return frozenset(siren for siren in (_clean_siren(raw) for raw in req.spaceSirens) if siren)


def _is_excluded(candidate: Mapping[str, Any]) -> bool:
    return (candidate.get("qualification") or {}).get("verdict") == "excluded"


def list_cut_note(found: int, shown: int) -> dict[str, Any] | None:
    """#4706.1 — ``{shown, found, isLowerBound}`` quand la liste a été coupée à ``limit`` (found > shown), sinon None.
    ``found`` est une borne BASSE : le registre n'est lu que par pages, le total réel peut être plus grand."""
    if shown < 1 or found <= shown:
        return None
    return {"shown": shown, "found": found, "isLowerBound": True}


def _cut_with_space_reserve(ranked: list[dict], limit: int, space_sirens: frozenset[str]) -> list[dict]:
    """La coupe à ``limit`` du registre, avec la réserve d'espace (#4067) — règle dans
    ``services.space_reserve``, partagée avec le mode Signaux."""
    return cut_with_space_reserve(
        ranked,
        limit,
        space_sirens,
        siren_of=lambda c: c.get("siren"),
        is_excluded=lambda c: (c.get("qualification") or {}).get("verdict") == "excluded",
    )


#: Tranches INSEE qui DÉCLARENT zéro salarié (00) ou « non employeur » (NN).
_DECLARED_EMPTY_TRANCHES = frozenset({"00", "NN"})


def _rank_key(candidate: Mapping[str, Any]) -> tuple:
    """Palier, puis score, puis TAILLE.

    #2490.7 — à score égal, l'employeur le plus gros passe devant : c'est la
    seule mesure d'importance que le registre publie, et l'ordre ne dépend plus
    de la source qui a répondu. Un effectif inconnu passe après — il n'est ni
    petit ni gros, il n'est pas mesuré, et il ne vaut pas « 0 salarié ».
    """
    headcount = parse_headcount_range(candidate.get("headcountRange"))
    verdict_rank, *doubt_keys = _tier_key(candidate)
    return (
        verdict_rank,
        # DISCOVER-TAILLE T.4 — dans un même verdict, l'entreprise qui a des salariés
        # passe devant celle qui DÉCLARE n'en avoir aucun (00) ou rien (NN) : un
        # score ne ressuscite pas une coquille. Jamais exclue — elle reste dans la
        # liste, en bas. Une tranche INCONNUE n'est pas rétrogradée : elle n'est
        # pas mesurée, elle ne vaut pas « 0 salarié ».
        str(candidate.get("headcountTranche") or "").upper() not in _DECLARED_EMPTY_TRANCHES,
        *doubt_keys,
        candidate["score"] is not None,
        candidate["score"] or 0,
        headcount is not None,
        headcount[0] if headcount else 0,
    )


def _diversify_sections(filters: DiscoverFilters) -> bool:
    """#2489.2 — la diversité ne s'applique que quand la question couvre PLUSIEURS
    secteurs (ou aucun) : une recherche mono-secteur garde l'ordre pur du score."""
    crossed = _crossed_sectors(filters)
    if crossed:
        return len(crossed) > 1
    if filters.nafCode:
        return len(_naf_groups(filters.nafCode)) > 1
    return not filters.sector


def _interleave_sections(candidates: list[dict]) -> list[dict]:
    """Tour de rôle entre SECTIONS NAF, à l'intérieur de chaque palier.

    Le palier (verdict, force du doute) reste la première clé ; dans un même
    palier, chaque section avance d'un rang à la fois, dans l'ordre du
    classement. Sans ça, cinq secteurs demandés rendaient la page des trois qui
    ont les plus gros réseaux. Rien n'est retiré : seul l'ordre change.
    """
    ordered: list[dict] = []
    tiers: dict[tuple, list[dict]] = {}
    for candidate in candidates:
        tiers.setdefault(_tier_key(candidate), []).append(candidate)
    for tier_key in sorted(tiers, reverse=True):
        buckets: dict[str, list[dict]] = {}
        for candidate in tiers[tier_key]:
            buckets.setdefault(naf_section_of(candidate.get("nafCode")) or "?", []).append(candidate)
        for turn in zip_longest(*buckets.values()):
            ordered.extend(candidate for candidate in turn if candidate is not None)
    return ordered


def _crossed_territories(filters: DiscoverFilters) -> list[str]:
    """Départements OU régions croisés — dédupliqués, ordre stable.

    Territoire et secteur sont deux axes SÉPARÉS (arbitrage Louis 18/09/2026) :
    ce rail ne lit QUE les champs territoire (`departments`/`regions`), jamais
    `sectors`/`nafCode`. L'écran ne pose jamais les deux listes à la fois ; si
    c'était le cas, `departments` — plus fin — passe devant.
    """
    kept: list[str] = []
    for raw in filters.departments or filters.regions or []:
        value = (raw or "").strip().upper()
        if not value or value in kept:
            continue
        kept.append(value)
    return kept


def _diversify_territory(filters: DiscoverFilters) -> bool:
    """#2299.27 — la diversité territoriale ne s'applique que quand la question
    croise PLUSIEURS territoires (ou aucun) : une recherche mono-territoire
    garde l'ordre pur du score — même garde-fou que `_diversify_sections`."""
    crossed = _crossed_territories(filters)
    if crossed:
        return len(crossed) > 1
    return not (filters.department or filters.region or (filters.city or "").strip())


def _interleave_territory(candidates: list[dict]) -> list[dict]:
    """Tour de rôle entre DÉPARTEMENTS, à l'intérieur de chaque palier —
    #2299.27, à score égal on ne sert pas douze fois la même métropole.

    Même principe que `_interleave_sections`, sur l'axe territoire plutôt que
    secteur : le palier (verdict, force du doute) reste la première clé, et
    dans un même palier chaque département avance d'un rang à la fois.

    Un candidat SANS département connu n'est JAMAIS forcé dans un bucket
    « territoire inconnu » qu'on entrelacerait comme les autres — on n'invente
    pas un territoire (« une valeur absente ne s'affiche jamais 0 », côté
    moteur). Il est retiré de l'entrelacement et réinjecté ensuite À
    L'IDENTIQUE, à l'index qu'il occupait dans le tri par score : une absence
    ne doit ni coûter ni gagner une place.
    """
    ordered: list[dict] = []
    tiers: dict[tuple, list[dict]] = {}
    for candidate in candidates:
        tiers.setdefault(_tier_key(candidate), []).append(candidate)
    for tier_key in sorted(tiers, reverse=True):
        tier = tiers[tier_key]
        known_positions = [i for i, candidate in enumerate(tier) if candidate.get("department")]
        buckets: dict[str, list[dict]] = {}
        for i in known_positions:
            buckets.setdefault(tier[i]["department"], []).append(tier[i])
        interleaved = [c for turn in zip_longest(*buckets.values()) for c in turn if c is not None]
        result = list(tier)
        for position, candidate in zip(known_positions, interleaved, strict=True):
            result[position] = candidate
        ordered.extend(result)
    return ordered


class TechnologyRadarRequest(BaseModel):
    technology: str = Field(..., max_length=80)


@router.post("/technology-radar")
async def discover_technology_radar(req: TechnologyRadarRequest) -> dict:
    """#4282.10 — le radar d'une technologie pour Découvrir : la MÊME sortie que Laura
    (`technology_radar`, contrat `technology-radar.ts`) — mêmes comptes, même ordre, aucun
    retri ici. Collecte publique en cache 30 jours, no-op sans clé."""
    radar = await technology_radar(req.technology)
    if radar is None:
        raise HTTPException(status_code=400, detail="Il me faut une technologie pour bâtir le radar.")
    return radar


@router.post("/search", response_model=DiscoverResponse)
async def discover(req: DiscoverRequest) -> DiscoverResponse:
    """DÉPRÉCIÉ — découverte v1 (Brave + Claude), conservée le temps de la
    bascule. Le modèle y invente encore les noms d'entreprises et le score :
    préférer ``POST /discover/registry``."""
    try:
        brave_results = await brave_search(req.criteria, req.profile_data)
    except Exception as exc:
        logger.warning("Brave search failed for discover: %s", exc)
        brave_results = []

    system = build_legacy_system_prompt(req.profile_data)
    user = build_user_prompt(
        req.criteria,
        json.dumps(brave_results[:20], ensure_ascii=False),
    )

    try:
        # Haiku instead of Sonnet roughly halves discover latency (the run is
        # structured extraction from Brave hits). 7000 tokens leaves room for ~5
        # detailed companies without truncating (3500 truncated → costly retry).
        result, usage = await call_claude(
            system,
            user,
            response_model=dict,
            model=CLAUDE_HAIKU_MODEL,
            max_tokens=7000,
            prompt_name="bellum_discover",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return DiscoverResponse(success=True, data=result)
