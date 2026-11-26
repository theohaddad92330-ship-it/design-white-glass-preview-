"""APEC — offres d'emploi cadres (webservice JSON du site public apec.fr).

Signal recrutement IT complémentaire de France Travail (roadmap §8) : l'APEC
concentre les postes CADRES (chefs de projet, architectes, managers IT) là où
France Travail couvre large. Plus de signaux d'embauche IT = plus de signaux
d'achat.

Accès VÉRIFIÉ le 2026-07-16 :
- ``POST https://www.apec.fr/cms/webservices/rechercheOffre`` (l'endpoint que la
  SPA publique du site utilise) répond 200 avec
  ``{resultats: [{intitule, nomCommercial, lieuTexte, salaireTexte, texteOffre,
  datePublication, numeroOffre, …}], totalCount}``.
- ``robots.txt`` d'apec.fr : ``User-agent: *`` sans aucun ``Disallow`` (crawl
  non restreint).
- Page de détail publique : ``/candidat/recherche-emploi.html/emploi/
  detail-offre/{numeroOffre}`` (vérifiée 200) — sert d'URL canonique (dédup).

Source ACTIVE PAR DÉFAUT (politique zéro-flag : aucune clé requise, aucun flag).
Le webservice est interne (non documenté officiellement) mais public et non
restreint par robots.txt : on reste respectueux — requêtes gentilles (throttle
partagé ``apec``, 20 rpm), User-Agent honnête, échec quelconque → ``[]`` (une
source ne casse JAMAIS la recherche, jamais de donnée inventée).

Comme France Travail : offres RÉCENTES (< ~12 mois, un besoin d'il y a 2 ans
n'est plus un signal), triées de la plus récente à la plus ancienne, filtrées IT
par mots-clés (l'APEC couvre toutes les fonctions cadres).
"""

from __future__ import annotations

import logging
import re
import time
import unicodedata
from datetime import UTC, datetime, timedelta

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.company_filters import public_administration_mismatch
from app.services.company_name_variants import company_name_variants
from app.services.data_sources._http_pool import get_shared_client
from app.services.data_sources.employer_match import same_employer
from app.services.distributed_rate_limiter import get_client, redis_url
from app.services.domain_job_filters import job_filter_for, offer_relevant_to_profile, profile_job_scope
from app.services.internship_posting import drop_internship_postings, is_internship_posting
from app.services.offer_domains.base import normalize_offer_domain
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import error_reason, record_degradation

logger = logging.getLogger(__name__)

# 14/10/2026 — le webservice est désormais derrière DataDome (403 + en-tête
# ``x-datadome: protected``, défi anti-bot), y compris depuis le conteneur IA.
# On ne contourne PAS une protection anti-robot : au premier 403 DataDome la
# source se coupe (log clair), puis ne fait AUCUN appel réseau pendant la pause,
# et se ré-essaie ensuite (APEC peut lever la protection ou ouvrir une API).
_ANTIBOT_PAUSE_S = 6 * 3600.0
_antibot_until: float = 0.0


#: SIGNAUX-OPTI (16/10) point 5 — la coupure est PARTAGÉE entre répliques (Redis, TTL 6 h) :
#: avant, chaque réplique la redéclenchait seule (12:38 puis 12:46). Sans Redis : repli processus.
_ANTIBOT_KEY = "source_pause:apec_antibot"


async def _redis():
    url = redis_url()
    if not url:
        return None
    try:
        return await get_client(url)
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.debug("APEC: Redis indisponible (%s)", exc)
        return None


async def _antibot_paused() -> bool:
    if time.monotonic() < _antibot_until:
        return True
    try:
        r = await _redis()
        return bool(r is not None and await r.exists(_ANTIBOT_KEY))
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.debug("APEC: drapeau anti-bot illisible (%s)", exc)
        return False


async def _note_antibot(resp: httpx.Response) -> bool:
    """``True`` (et la source se coupe) si ``resp`` est un 403 DataDome."""
    global _antibot_until
    if resp.status_code != 403 or not resp.headers.get("x-datadome"):
        return False
    _antibot_until = time.monotonic() + _ANTIBOT_PAUSE_S
    try:
        r = await _redis()
        if r is not None:
            await r.set(_ANTIBOT_KEY, "1", ex=int(_ANTIBOT_PAUSE_S))
    except Exception as exc:  # noqa: BLE001 — le repli processus suffit
        logger.debug("APEC: drapeau anti-bot non posé dans Redis (%s)", exc)
    logger.warning(
        "APEC: webservice protégé par DataDome (HTTP 403, anti-bot) — source COUPÉE %d h, "
        "aucun contournement; agent_docs/env-reference.md",
        int(_ANTIBOT_PAUSE_S // 3600),
    )
    record_degradation(get_correlation_id(), source="apec", reason="HTTP 403 (anti-bot DataDome)")
    return True


def _reset_antibot_for_tests() -> None:
    global _antibot_until
    _antibot_until = 0.0


_SEARCH_URL = "https://www.apec.fr/cms/webservices/rechercheOffre"
_DETAIL_URL = "https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/{numero}"
_TIMEOUT_S = 10.0
_USER_AGENT = "bellum-ia/1.0 (+https://bellum-ai.com)"

# Même règle que France Travail (#4754) : au-delà de ~12 mois l'offre est stockée
# et estampillée ``historical``, jetée seulement au-delà du plafond d'historique.
_MAX_AGE_DAYS = 365

# Filtre IT par mots-clés (l'APEC couvre TOUTES les fonctions cadres — on ne
# garde que le signal IT). Multi-caractères en sous-chaîne (désaccentués) ; les
# sigles courts ambigus exigent une frontière de mot (« data » est dans
# « mandataire »).
_IT_KEYWORDS_SUBSTR = (
    "informatique",
    "logiciel",
    "developpeur",
    "developpement",
    "devops",
    "devsecops",
    "cybersecurite",
    # #4045 (14/10) — parité avec le lexique France Travail (`is_it_offer`,
    # `_IT_TERMS`) : une ESN cyber pure recevait ses propres offres pentest/SOC/
    # RSSI rejetées par APEC (gardées côté France Travail) faute de ces termes
    # ici — deux lexiques du même tri qui divergeaient (GA-26).
    "pentest",
    "analyste soc",
    "rssi",
    "cloud",
    "systeme d'information",
    "systemes d'information",
    "infrastructure",
    "applicatif",
    "progiciel",
    "fullstack",
    "full stack",
    "frontend",
    "front-end",
    "backend",
    "back-end",
    "machine learning",
    "intelligence artificielle",
    "numerique",
)
_IT_WORD_RE = re.compile(
    r"\b(si|dsi|erp|crm|tma|sap|it|data|digital|java|python|react|angular|node|aws|azure|gcp|kubernetes|docker|api|sre|reseau|reseaux)\b"
)


def _clean(value: object) -> str | None:
    s = " ".join(str(value or "").split())
    return s or None


def _deaccent(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn")


def _is_it(offer: dict) -> bool:
    hay = _deaccent(" ".join(str(offer.get(k) or "") for k in ("intitule", "texteOffre"))).lower()
    if any(kw in hay for kw in _IT_KEYWORDS_SUBSTR):
        return True
    return bool(_IT_WORD_RE.search(hay))


def _is_domain_offer(offer: dict, *, pack: str | None = None, all_roles: bool = False) -> bool:
    """L'offre relève-t-elle du domaine que le VENDEUR vend ? Jumeau exact de
    ``france_travail.is_domain_offer`` (#4045, 14/10) — sans pack, avec
    ``esn_it`` ou un pack sans filtre déclaré, c'est le tri IT historique
    (``_is_it``) à l'octet près ; un pack qui a un filtre déclaré
    (``domain_job_filters.job_filter_for``) juge sur SES préfixes ROME et SON
    vocabulaire, sans récupérer les offres IT au passage. ``all_roles``
    court-circuite le tri (#1124) : toute ouverture de poste est une piste."""
    if all_roles:
        return True
    domain_filter = job_filter_for(pack)
    if domain_filter is None:
        return _is_it(offer)
    return domain_filter.matches(offer)


# #4045.1 (14/10) — jumeau exact de `france_travail._resolved_hiring_profile` :
# un profil RÉEL sans `offerDomain` déclaré est l'ESN IT implicite (le défaut du
# produit, jamais écrit faute de case à cocher), pas une absence de profil
# (#3901, « sans profil ⇒ on ne filtre pas »). Recette R7a : « Technicien SAV -
# Frigoriste Cuisiniste » / « Responsable Pays » sortaient encore en RECRUTEMENT
# pour un vrai profil ESN IT. `profile=None` garde le comportement d'avant à
# l'octet près (``test_without_profile_no_role_filter_but_anonymous_still_dropped``).
def _resolved_hiring_profile(profile: dict | None) -> dict | None:
    if profile is None or profile_job_scope(profile) is not None:
        return profile
    resolved = dict(profile)
    resolved["offerDomain"] = normalize_offer_domain(resolved.get("offerDomain"))
    return resolved


def _parse_date(value: object) -> datetime | None:
    s = str(value or "").strip()
    if not s:
        return None
    s = s.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        try:
            dt = datetime.fromisoformat(s[:10])
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


def _geo(lieu_texte: object) -> tuple[str | None, str | None]:
    """(city, department) depuis ``lieuTexte`` — forme observée ``"Ville - 59"``
    (l'inverse de France Travail). Repli : tout le libellé = ville."""
    location = _clean(lieu_texte)
    if not location:
        return None, None
    m = re.match(r"^(.*\S)\s*-\s*(\d{2,3})$", location)
    if m:
        return _clean(m.group(1)), m.group(2)[:2]
    return location, None


def _mentions_company(offer: dict, company: str) -> bool:
    """L'offre est-elle VRAIMENT celle du compte analysé ?

    ⚠️ La recherche se fait en MOTS-CLÉS plein texte : « SNCF » remonte aussi
    les offres d'une ESN qui staffe pour la SNCF, d'un cabinet de recrutement,
    ou d'un hôpital voisin d'une gare. Sur un run réel (11/08/2026), le dossier
    SNCF affichait ainsi comme « recrutements du compte » des postes ouverts par
    trois sociétés qui n'ont rien à voir avec lui.

    Le serveur ne sait pas scoper : on refiltre donc sur ce qu'il RÉPOND —
    l'employeur, sinon l'intitulé, qui porte souvent le nom du donneur d'ordre.
    Même doctrine que le connecteur ATS : un filtre serveur ignoré dégrade la
    couverture, il ne doit JAMAIS produire un faux rattachement.

    #3901 — l'ancien test `needle in haystack` (sous-chaîne sur `nomCommercial`
    OU l'intitulé) rattachait « Mairie de Still » au compte « Still » : on
    compare désormais l'EMPLOYEUR (`nomCommercial`) au compte par
    :func:`same_employer` ; l'intitulé ne prouve plus rien. Les suffixes pays
    et formes juridiques (#3817.1, « JCDecaux France » / « JCDecaux ») sont
    absorbés par la normalisation de `same_employer`.

    Une offre qu'on ne sait pas attribuer est ÉCARTÉE. Un recrutement affiché
    sous le nom d'un compte est lu comme un signal de ce compte : mieux vaut un
    onglet plus court qu'un signal faux.

    #3901 — le sous-chaîne ci-dessus NE DÉPARTAGE PAS un homonyme commune/
    entreprise : « still » est une sous-chaîne vraie de « mairie de still »
    (bêta 08/10/2026, Still 67 vs STILL industriel). Un employeur nommé « Mairie
    de X »/« Commune de X »… est écarté AVANT le sous-chaîne — sauf si c'est
    littéralement l'administration recherchée (`company` lui-même nommé ainsi).

    Une offre dont l'employeur est absent ou différent est ÉCARTÉE.
    """
    if public_administration_mismatch(offer.get("nomCommercial"), company):
        return False
    return same_employer(offer.get("nomCommercial"), company)


@provider_cache.cached_by(
    "jobs:apec",
    # ⚠️ Le PACK entre dans la clé — même raison que son jumeau France Travail
    # (``france_travail.it_job_signals``, DECATHLON 11/10) : sans lui, un
    # vendeur industriel et une ESN IT qui cherchent la même entreprise se
    # partageraient le même cache et le second lirait le tri du premier.
    lambda company, *, limit=12, pack=None, **_: f"{(company or '').strip().lower()}:{limit}:{pack or 'esn_it'}",
    ttl=provider_cache.TTL_JOBS,
    empty_ttl=provider_cache.TTL_EMPTY_JOBS,
)
async def it_job_signals_apec(
    company: str,
    *,
    limit: int = 12,
    pack: str | None = None,
    all_roles: bool = False,
    siren: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Offres cadres récentes mentionnant ``company`` — même contrat de sortie
    que France Travail (``{title, location, date, contractType, skills, company,
    city, department, salary, url, source}``), RÉCENTES (< ~12 mois) et triées de
    la plus récente à la plus ancienne. Active par défaut (aucune clé requise) ;
    ``[]`` sur entrée vide ou toute erreur.

    #4045 (14/10) — ``pack`` : le domaine d'offre déclaré du VENDEUR
    (``domain_job_filters.job_filter_for``). Sans pack, avec ``esn_it`` ou un
    pack sans filtre déclaré, le tri IT historique s'applique à l'octet près
    (``_is_it``) ; un pack qui a un filtre juge sur SON vocabulaire et ne
    récupère pas les offres IT au passage — jumeau exact de
    ``france_travail.it_job_signals``.

    ``all_roles`` (#1124) : pour une ESN qui place des profils EN CDI chez ses
    clients, toute ouverture de poste est une piste — le tri lui cachait
    précisément celles qu'elle vend. ``False`` par défaut ⇒ comportement
    d'avant, à l'octet près.

    #3817.1 — ``motsCles`` est plein texte SERVEUR : un grand groupe enregistré
    sous une raison sociale à suffixe (« JCDecaux France ») peut n'avoir AUCUNE
    offre qui porte ce suffixe mot à mot. Une première requête vide retente donc
    avec les formes réduites du nom (sans suffixe pays, sans forme juridique),
    puis le SIREN — jamais l'inverse : un nom complet qui répond déjà n'est pas
    élargi."""
    cleaned = (company or "").strip()
    if not cleaned or await _antibot_paused():
        return []

    limit = max(1, min(limit, 20))
    # Marge : le filtre IT + récence doit encore laisser ``limit`` offres.
    fetch = min(50, max(limit + 12, 20))

    http = client if client is not None else get_shared_client("apec", timeout=_TIMEOUT_S)
    _min = datetime.min.replace(tzinfo=UTC)
    scored: list[tuple[datetime, dict]] = []

    for variant in company_name_variants(cleaned, siren=siren):
        offers: list[dict] = []
        failed = False
        # #4016 SIG-D3 — `startIndex` est dans le corps vérifié : page 2 quand la 1re
        # est saturée (``fetch`` rendues) et n'a pas rassasié ``limit``.
        for start in (0, fetch):
            # Corps VÉRIFIÉ (2026-07-16) contre le DTO réel du webservice
            # (RechercheOffreCriteriaDto — champs inconnus REJETÉS par l'API, ne rien
            # ajouter sans re-vérifier).
            body = {
                "motsCles": variant,
                "typeClient": "CADRE",
                "pagination": {"range": fetch, "startIndex": start},
                "sorts": [{"type": "DATE", "direction": "DESCENDING"}],
                "activeFiltre": True,
            }
            try:
                async with throttle("apec"):
                    resp = await http.post(
                        _SEARCH_URL,
                        json=body,
                        headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
                    )
                if not resp.is_success:
                    if await _note_antibot(resp):
                        return []
                    if resp.status_code == 429:
                        back_off_provider("apec", retry_after_header(resp))
                    logger.warning("APEC search failed (status %s) for %r", resp.status_code, variant)
                    record_degradation(
                        get_correlation_id(), source="apec", reason=f"HTTP {resp.status_code}"
                    )
                    failed = True
                    break
                payload = resp.json()
            except Exception as exc:  # noqa: BLE001 — a source must never break research
                logger.warning("APEC search failed for %r: %s", variant, exc)
                # Report the REAL cause: without it the run can only say "aucun
                # résultat", which reads identically to a company that genuinely has
                # nothing here — opposite facts, same message.
                record_degradation(get_correlation_id(), source="apec", reason=error_reason(exc))
                failed = True
                break

            page = payload.get("resultats") if isinstance(payload, dict) else None
            offers.extend(page or [])
            scored = _score_offers(offers, cleaned, _min, pack=pack, all_roles=all_roles)
            if len(page or []) < fetch or len(scored) >= limit:
                break
        if failed and not offers:
            continue
        if scored:
            break

    # #4044 — une offre de STAGE n'est jamais un signal (décision Louis 12/10).
    return drop_internship_postings([item for _dt, item in scored[:limit]], title_keys=("title",), contract_keys=("contractType",))


def _score_offers(
    offers: list[dict], cleaned: str, _min: datetime, *, pack: str | None = None, all_roles: bool
) -> list[tuple[datetime, dict]]:
    scored: list[tuple[datetime, dict]] = []
    dropped_unattributed = 0
    for o in offers:
        if not isinstance(o, dict) or not _clean(o.get("intitule")):
            continue
        # #1124 — en placement, on ne trie plus par rôle : toute ouverture de
        # poste chez le compte est une piste. Le scope entreprise, lui, reste —
        # c'est lui qui empêche de ramasser les offres d'un homonyme.
        # #4045 — sinon, le tri suit le PACK du vendeur (jumeau France
        # Travail) : IT par défaut, son propre vocabulaire pour un pack qui en
        # déclare un (ex. ``industrial_engineering``).
        if not _is_domain_offer(o, pack=pack, all_roles=all_roles):
            continue
        # Le scope, que la recherche plein texte ne fait pas.
        if not _mentions_company(o, cleaned):
            dropped_unattributed += 1
            continue
        published = _parse_date(o.get("datePublication"))
        # Lot 762 — plus de borne d'âge de stockage : l'offre ancienne est estampillée ``historical`` ci-dessous.
        city, department = _geo(o.get("lieuTexte"))
        numero = _clean(o.get("numeroOffre"))
        stale = datetime.now(UTC) - timedelta(days=_MAX_AGE_DAYS)
        historical = {"historical": True} if published is not None and published < stale else {}
        scored.append(
            (
                published or _min,
                {
                    # Contrat de rendu partagé avec France Travail (dated_signals).
                    "title": _clean(o.get("intitule")) or "",
                    "location": _clean(o.get("lieuTexte")) or "",
                    "date": _clean(o.get("datePublication")),
                    # ``typeContrat`` APEC = code numérique interne (non lisible) —
                    # on n'invente pas de libellé.
                    "contractType": None,
                    "skills": [],
                    # Enrichissements factuels.
                    "company": _clean(o.get("nomCommercial")),
                    "city": city,
                    "department": department,
                    "salary": _clean(o.get("salaireTexte")),
                    "url": _DETAIL_URL.format(numero=numero) if numero else None,
                    "source": "apec",
                    **historical,
                },
            )
        )

    if dropped_unattributed:
        logger.info("APEC %r: dropped_unattributed=%d (#3901)", cleaned, dropped_unattributed)
    # Sort most-recent first; unparseable dates (``_min``) sink to the end.
    scored.sort(key=lambda t: t[0], reverse=True)
    # #4044 — idem pour le balayage de territoire.
    return drop_internship_postings(scored, title_keys=("title",), contract_keys=("contractType",))


# ───────────────────────────────────────────────────────────────────────────
# #2616.1 — « comptes qui recrutent » (Découvrir v2) élargi au-delà de France
# Travail. `it_job_signals_apec` ci-dessus part d'une ENTREPRISE et cherche ses
# offres ; ici on part du TERRITOIRE, comme `france_travail.list_hiring_
# companies` — même contrat de sortie ROW (``name``/``department``/``city``/
# ``signal``), plus ``sourceLabel`` : #2616.1 attribue CETTE ligne à APEC
# plutôt qu'au libellé par défaut du bucket ``hiring`` côté routeur
# (``discover_signals._Group.absorb``), qui vaudrait sinon toujours « France
# Travail » même pour une ligne qu'elle n'a pas produite.
# ───────────────────────────────────────────────────────────────────────────

#: Terme large par défaut quand l'appelant ne fournit aucun mot-clé — l'APEC
#: n'a pas d'équivalent du domaine « M18 » de France Travail (non vérifié
#: contre le DTO réel, donc pas inventé ici) : une recherche plein-texte sur un
#: terme générique IT est le seul mode de repli honnête.
_BROADCAST_DEFAULT_KEYWORDS = "informatique"


async def list_hiring_companies_apec(
    department: str | None = None,
    keywords: list[str] | None = None,
    since_days: int = 90,
    limit: int = 25,
    *,
    client: httpx.AsyncClient | None = None,
    profile: dict | None = None,
    offset: int = 0,
    page_stats: dict[str, int] | None = None,
) -> list[dict]:
    """Employeurs CADRES ayant publié une offre APEC récente.

    ``offset`` (#4796) : le ``startIndex`` de la page lue ; ``page_stats`` reçoit ``asked``/``raw`` (voir
    ``france_travail.list_hiring_companies``). Défauts : la requête d'avant, octet pour octet.

    Complémentaire de France Travail (large) : l'APEC concentre les postes
    cadres — chefs de projet, architectes, managers IT — que France Travail ne
    classe pas toujours dans son domaine M18. Plus de signaux d'embauche IT =
    plus de signaux d'achat.

    GRACIEUSE PAR CONSTRUCTION, comme :func:`it_job_signals_apec` : aucune clé
    requise, ``[]`` sur TOUTE panne (HTTP, réseau, payload). Ne lève JAMAIS
    :class:`~app.services.data_sources.signal_errors.SignalSourceUnavailable` —
    à la différence de France Travail (identifiants requis), une recherche
    large n'a pas de configuration qui puisse manquer. C'est ce contrat qui
    permet au routeur de ne jamais perdre les lignes déjà collectées par
    France Travail quand APEC, elle, est indisponible (et réciproquement).

    Le webservice ne publie pas de paramètre géographique VÉRIFIÉ (seuls
    ``motsCles``/``typeClient``/``pagination``/``sorts``/``activeFiltre`` sont
    confirmés contre le DTO réel, voir :func:`it_job_signals_apec`) : le
    département filtre donc côté CLIENT, sur ``lieuTexte`` — même repli que
    France Travail quand sa maille fine est refusée.
    """
    if await _antibot_paused():
        return []
    # #4796 — 100 : une page lit 100 annonces (``fetch``) ; couper à 50 jetait la moitié d'une page déjà lue.
    limit = max(1, min(int(limit or 1), 100))
    fetch = min(100, max(limit * 4, 40))
    cleaned_keywords = [k for k in (str(k or "").strip() for k in (keywords or [])) if k]
    mots_cles = " ".join(cleaned_keywords[:8]) if cleaned_keywords else _BROADCAST_DEFAULT_KEYWORDS
    dept = "".join(ch for ch in (department or "") if ch.isalnum()).upper()[:3] or None

    body = {
        "motsCles": mots_cles,
        "typeClient": "CADRE",
        "pagination": {"range": fetch, "startIndex": max(0, int(offset))},
        "sorts": [{"type": "DATE", "direction": "DESCENDING"}],
        "activeFiltre": True,
    }

    http = client if client is not None else get_shared_client("apec", timeout=_TIMEOUT_S)
    try:
        async with throttle("apec"):
            resp = await http.post(
                _SEARCH_URL,
                json=body,
                headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
            )
        if not resp.is_success:
            if await _note_antibot(resp):
                return []
            if resp.status_code == 429:
                back_off_provider("apec", retry_after_header(resp))
            logger.warning("APEC hiring listing failed (status %s)", resp.status_code)
            record_degradation(get_correlation_id(), source="apec", reason=f"HTTP {resp.status_code}")
            return []
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — une source ne casse JAMAIS la recherche
        logger.warning("APEC hiring listing failed: %s", exc)
        record_degradation(get_correlation_id(), source="apec", reason=error_reason(exc))
        return []

    offers = payload.get("resultats") if isinstance(payload, dict) else None
    if page_stats is not None:
        page_stats.update(asked=fetch, raw=len(offers or []))
    cutoff = datetime.now(UTC) - timedelta(days=max(1, int(since_days or 1)))

    # #4045.1 — un profil réel sans `offerDomain` déclaré est l'ESN IT implicite,
    # pas une absence de profil : voir `_resolved_hiring_profile`.
    resolved_profile = _resolved_hiring_profile(profile)
    rows: list[tuple[datetime, dict]] = []
    for o in offers or []:
        if not isinstance(o, dict) or not _clean(o.get("intitule")):
            continue
        if is_internship_posting(o.get("intitule"), o.get("typeContrat")):
            continue  # Louis 12/10 + 14/10 : aucune offre de stage (prédicat #4044, ce chemin n'est pas dans drop_*)
        # #3901 — pertinence selon le PROFIL, plus de filtre IT fixe ; sans profil, on ne filtre pas.
        if not offer_relevant_to_profile(
            {"intitule": o.get("intitule")}, resolved_profile, it_check=lambda _offer, _o=o: _is_it(_o)
        ):
            continue
        employer = _clean(o.get("nomCommercial"))
        if not employer:
            continue  # offre anonymisée — aucun compte à prospecter, on n'invente pas
        published = _parse_date(o.get("datePublication"))
        if published is None or published < cutoff:
            continue  # date obligatoire ET dans la fenêtre demandée
        city, row_dept = _geo(o.get("lieuTexte"))
        if dept and row_dept and row_dept != dept:
            continue
        numero = _clean(o.get("numeroOffre"))
        title = _clean(o.get("intitule"))
        rows.append(
            (
                published,
                {
                    "name": employer,
                    "siren": None,  # le webservice ne donne pas de SIREN — résolu en aval
                    "department": row_dept or dept,
                    "city": city,
                    "sourceLabel": "APEC",
                    "signal": {
                        "type": "hiring",
                        "label": f"Recrutement cadre IT — {title}" if title else "Recrutement cadre IT",
                        "date": published.date().isoformat(),
                        "url": _DETAIL_URL.format(numero=numero) if numero else None,
                        "detail": None,
                    },
                },
            )
        )

    rows.sort(key=lambda t: t[0], reverse=True)
    return [row for _dt, row in rows[:limit]]
