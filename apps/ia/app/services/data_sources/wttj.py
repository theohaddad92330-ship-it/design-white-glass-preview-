"""Welcome to the Jungle — offres d'emploi (NO-OP DOCUMENTÉ par défaut).

Statut d'accès VÉRIFIÉ le 2026-07-16 : WTTJ n'expose AUCUNE API emploi publique
gratuite exploitable proprement.

- ``robots.txt`` (www.welcometothejungle.com) : ``Disallow: /*?`` et
  ``Disallow: */jobs?query=*`` → la recherche d'offres automatisée sur le site
  est explicitement découragée.
- L'accès programmatique officiel est la « Solutions API » partenaire
  (developers.welcomekit.co) — token d'authentification contractuel, ni public
  ni gratuit.
- Le front du site interroge un index Algolia via une clé search embarquée dans
  la page ; réutiliser cette clé reverse-engineered serait contraire à l'esprit
  des ToS et fragile (clé rotative) → cette clé n'est PAS embarquée ici, ni
  aucun défaut d'app-id.

La source est donc un NO-OP STRICT (zéro appel réseau, ``[]``) tant que
l'opérateur ne fournit pas SES PROPRES identifiants Algolia, obtenus
légitimement (partenariat / accord WTTJ) :

    WTTJ_ALGOLIA_APP_ID    (app id Algolia de l'opérateur)
    WTTJ_ALGOLIA_API_KEY   (clé search de l'opérateur)
    WTTJ_ALGOLIA_INDEX     (optionnel, défaut ``wk_cms_jobs_production``)

Quand elle est activée, la requête/réponse suit l'API REST Algolia DOCUMENTÉE
(``POST /1/indexes/{index}/query`` → ``{hits: [...]}``) — rien d'inventé ; le
mapping des hits (``name``/``organization``/``offices``/``published_at``…) est
défensif : champ absent → ``None``, jamais de valeur fabriquée. Même contrat de
sortie et mêmes règles que France Travail : récentes (< ~12 mois), triées
récent-first, échec quelconque → ``[]`` (gracieux).
"""

from __future__ import annotations

import logging
import os
import unicodedata
from datetime import UTC, datetime, timedelta

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.company_filters import public_administration_mismatch
from app.services.company_name_variants import company_name_variants
from app.services.data_sources.employer_match import same_employer
from app.services.data_sources.france_travail import is_it_offer
from app.services.domain_job_filters import offer_relevant_to_profile
from app.services.internship_posting import drop_internship_postings, is_internship_posting
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

_QUERY_URL = "https://{app_id}-dsn.algolia.net/1/indexes/{index}/query"
_JOB_URL = "https://www.welcometothejungle.com/fr/companies/{org_slug}/jobs/{job_slug}"
_DEFAULT_INDEX = "wk_cms_jobs_production"
_TIMEOUT_S = 10.0

# Un besoin de recrutement de plus de ~12 mois n'est plus un signal actionnable
# — même règle que France Travail / APEC.
_MAX_AGE_DAYS = 365


def _creds() -> tuple[str, str, str]:
    return (
        os.environ.get("WTTJ_ALGOLIA_APP_ID", "").strip(),
        os.environ.get("WTTJ_ALGOLIA_API_KEY", "").strip(),
        os.environ.get("WTTJ_ALGOLIA_INDEX", "").strip() or _DEFAULT_INDEX,
    )


def _clean(value: object) -> str | None:
    s = " ".join(str(value or "").split())
    return s or None


def _deaccent(value: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", value) if unicodedata.category(ch) != "Mn")


def _mentions_company(hit: dict, org_name: str | None, company: str) -> bool:
    """L'offre est-elle VRAIMENT celle de l'entreprise cherchée ?

    #3901 — ``query`` est une recherche PLEIN TEXTE côté Algolia, sans AUCUN
    scope serveur sur l'organisation : même doctrine que France Travail/APEC
    (``france_travail._mentions_company`` / ``apec._mentions_company``), y
    compris le filet « Mairie de X »/« Commune de X »… qui départage un
    homonyme commune/entreprise qu'un simple sous-chaîne ne distingue pas
    (bêta 08/10/2026, « Still »).
    """
    if public_administration_mismatch(org_name, company):
        return False
    needles = [_deaccent(v).lower() for v in company_name_variants(company)]
    if not needles:
        return False
    for raw in (org_name, hit.get("name")):
        haystack = _deaccent(_clean(raw) or "").lower()
        if haystack and any(needle in haystack for needle in needles):
            return True
    return False


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


def _contract(value: object) -> str | None:
    """``contract_type`` — chaîne (``"CDI"``) ou dict localisé (``{"fr": "CDI"}``)
    selon la version d'index. Défensif, jamais de libellé inventé."""
    if isinstance(value, dict):
        return _clean(value.get("fr") or value.get("en") or next(iter(value.values()), None))
    return _clean(value)


def _city(hit: dict) -> str | None:
    office = hit.get("office")
    if isinstance(office, dict) and _clean(office.get("city")):
        return _clean(office.get("city"))
    for o in hit.get("offices") or []:
        if isinstance(o, dict) and _clean(o.get("city")):
            return _clean(o.get("city"))
    return None


def _skills(hit: dict) -> list[str]:
    out: list[str] = []
    for s in hit.get("skills") or []:
        name = _clean(s.get("name")) if isinstance(s, dict) else _clean(s)
        if name:
            out.append(name)
    return out[:12]


def _job_url(hit: dict, org: dict) -> str | None:
    org_slug = _clean(org.get("slug"))
    job_slug = _clean(hit.get("slug"))
    if org_slug and job_slug:
        return _JOB_URL.format(org_slug=org_slug, job_slug=job_slug)
    return None


@provider_cache.cached_by(
    "jobs:wttj", lambda company, *, limit=12, **_: f"{(company or '').strip().lower()}:{limit}", ttl=provider_cache.TTL_JOBS
)
async def it_job_signals_wttj(company: str, *, limit: int = 12, client: httpx.AsyncClient | None = None) -> list[dict]:
    """Offres récentes mentionnant ``company`` via l'index Algolia de
    l'opérateur — même contrat de sortie que France Travail. NO-OP STRICT
    (``[]``, zéro réseau) sans ``WTTJ_ALGOLIA_APP_ID`` + ``WTTJ_ALGOLIA_API_KEY``
    (voir le docstring module : pas d'API publique gratuite) ; ``[]`` sur toute
    erreur."""
    app_id, api_key, index = _creds()
    cleaned = (company or "").strip()
    if not app_id or not api_key or not cleaned:
        return []

    limit = max(1, min(limit, 20))
    fetch = min(50, max(limit + 12, 20))

    owns = client is None
    http = client or httpx.AsyncClient(timeout=_TIMEOUT_S)
    try:
        async with throttle("wttj"):
            resp = await http.post(
                _QUERY_URL.format(app_id=app_id, index=index),
                json={"query": cleaned, "hitsPerPage": fetch},
                headers={"x-algolia-application-id": app_id, "x-algolia-api-key": api_key},
            )
        if not resp.is_success:
            if resp.status_code == 429:
                back_off_provider("wttj", retry_after_header(resp))
            logger.warning("WTTJ search failed (status %s) for %r", resp.status_code, cleaned)
            return []
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — a source must never break research
        logger.warning("WTTJ search failed for %r: %s", cleaned, exc)
        # Report the REAL cause: without it the run can only say "aucun
        # résultat", which reads identically to a company that genuinely has
        # nothing here — opposite facts, same message.
        record_degradation(get_correlation_id(), source="welcome_to_the_jungle", reason=str(exc))
        return []
    finally:
        if owns:
            await http.aclose()

    hits = payload.get("hits") if isinstance(payload, dict) else None
    cutoff = datetime.now(UTC) - timedelta(days=_MAX_AGE_DAYS)
    _min = datetime.min.replace(tzinfo=UTC)

    scored: list[tuple[datetime, dict]] = []
    dropped_unattributed = 0
    for hit in hits or []:
        if not isinstance(hit, dict) or not _clean(hit.get("name")):
            continue
        org = hit.get("organization") if isinstance(hit.get("organization"), dict) else {}
        # #3901 — ``query`` ne scope pas sur l'organisation côté serveur : une
        # offre qu'on ne sait pas attribuer VRAIMENT à ``cleaned`` est écartée
        # plutôt que de produire un faux rattachement.
        if not _mentions_company(hit, org.get("name"), cleaned):
            continue
        published = _parse_date(hit.get("published_at"))
        # #3901 — la requête Algolia est plein texte, sans filtre employeur :
        # une offre dont l'organisation est absente ou autre est ÉCARTÉE.
        if not same_employer(org.get("name"), cleaned):
            dropped_unattributed += 1
            continue
        city = _city(hit)
        scored.append(
            (
                published or _min,
                {
                    # Contrat de rendu partagé avec France Travail (dated_signals).
                    "title": _clean(hit.get("name")) or "",
                    "location": city or "",
                    "date": _clean(hit.get("published_at")),
                    "contractType": _contract(hit.get("contract_type")),
                    "skills": _skills(hit),
                    # Enrichissements factuels.
                    "company": _clean(org.get("name")),
                    "city": city,
                    "url": _job_url(hit, org),
                    "source": "wttj",
                    **({"historical": True} if published is not None and published < cutoff else {}),
                },
            )
        )

    if dropped_unattributed:
        logger.info("WTTJ %r: dropped_unattributed=%d (#3901)", cleaned, dropped_unattributed)
    # Sort most-recent first; unparseable dates (``_min``) sink to the end.
    scored.sort(key=lambda t: t[0], reverse=True)
    # #4044 — une offre de STAGE n'est jamais un signal (décision Louis 12/10).
    return drop_internship_postings([item for _dt, item in scored[:limit]], title_keys=("title",), contract_keys=("contractType",))


# ───────────────────────────────────────────────────────────────────────────
# #2616.1 — « comptes qui recrutent » élargi à WTTJ, en plus d'APEC
# (`apec.py::list_hiring_companies_apec`). Mesure en production le 22/09/2026
# (registre `.claude/notes/registre-2026-09-20-discover-recentes.md`) : 58
# liens « Voir la source » sur /discover, 38 apec.fr + 20
# candidat.francetravail.fr, ZÉRO WTTJ — cette fonction n'existait pas, donc
# jamais appelée depuis `discover_signals.py` (CAUSE 1 : pas branché, pas une
# histoire de collecte périmée — le bucket ``hiring`` est une recherche LIVE à
# chaque requête, il n'y a rien à rejouer).
#
# `it_job_signals_wttj` ci-dessus part d'une ENTREPRISE connue et cherche ses
# offres ; ici on part du TERRITOIRE/MOTS-CLÉS, comme `list_hiring_companies_
# apec` — même contrat de sortie ROW (``name``/``department``/``city``/
# ``signal``) plus ``sourceLabel``, que `discover_signals._group_rows` sait
# déjà lire.
# ───────────────────────────────────────────────────────────────────────────

#: Terme large par défaut quand l'appelant ne fournit aucun mot-clé — même
#: repli que l'APEC (`apec._BROADCAST_DEFAULT_KEYWORDS`) : WTTJ n'a pas
#: d'équivalent du domaine « M18 » de France Travail (non vérifié contre le
#: DTO réel, donc pas inventé ici).
_BROADCAST_DEFAULT_KEYWORDS = "informatique"


async def list_hiring_companies_wttj(
    department: str | None = None,
    keywords: list[str] | None = None,
    since_days: int = 90,
    limit: int = 25,
    *,
    client: httpx.AsyncClient | None = None,
    profile: dict | None = None,
) -> list[dict]:
    """Employeurs ayant publié une offre WTTJ récente — le pendant BROADCAST de
    :func:`it_job_signals_wttj`, même principe que
    :func:`app.services.data_sources.apec.list_hiring_companies_apec`.

    NO-OP STRICT (``[]``, zéro appel réseau) sans ``WTTJ_ALGOLIA_APP_ID`` +
    ``WTTJ_ALGOLIA_API_KEY`` (voir le docstring module : pas d'API publique
    gratuite) ; ``[]`` sur toute panne — une source d'appoint ne casse jamais
    la recherche, et ne lève jamais d'exception typée (même contrat que
    l'APEC : le routeur ne doit jamais perdre les lignes déjà collectées par
    les autres sources du bucket ``hiring``).

    WTTJ n'expose AUCUN champ département vérifié (seuls ``office``/
    ``offices`` portent une VILLE, jamais un code département) : la ligne
    porte le département DEMANDÉ, jamais un département déduit d'un champ
    absent — même repli que l'APEC, pour la même raison (« un contrat d'API
    non vérifiable ne se devine pas »).

    Filtre IT partagé avec le connecteur ATS (``is_it_offer``, importé de
    France Travail) plutôt qu'un vocabulaire dupliqué : l'index WTTJ couvre
    TOUS les métiers, pas seulement l'IT.
    """
    app_id, api_key, index = _creds()
    if not app_id or not api_key:
        return []

    limit = max(1, min(int(limit or 1), 50))
    fetch = min(50, max(limit * 4, 20))
    cleaned_keywords = [k for k in (str(k or "").strip() for k in (keywords or [])) if k]
    query_text = " ".join(cleaned_keywords[:8]) if cleaned_keywords else _BROADCAST_DEFAULT_KEYWORDS
    dept = "".join(ch for ch in (department or "") if ch.isalnum()).upper()[:3] or None

    owns = client is None
    http = client or httpx.AsyncClient(timeout=_TIMEOUT_S)
    try:
        async with throttle("wttj"):
            resp = await http.post(
                _QUERY_URL.format(app_id=app_id, index=index),
                json={"query": query_text, "hitsPerPage": fetch},
                headers={"x-algolia-application-id": app_id, "x-algolia-api-key": api_key},
            )
        if not resp.is_success:
            if resp.status_code == 429:
                back_off_provider("wttj", retry_after_header(resp))
            logger.warning("WTTJ hiring listing failed (status %s)", resp.status_code)
            record_degradation(get_correlation_id(), source="welcome_to_the_jungle", reason=f"HTTP {resp.status_code}")
            return []
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — une source ne casse JAMAIS la recherche
        logger.warning("WTTJ hiring listing failed: %s", exc)
        record_degradation(get_correlation_id(), source="welcome_to_the_jungle", reason=str(exc))
        return []
    finally:
        if owns:
            await http.aclose()

    hits = payload.get("hits") if isinstance(payload, dict) else None
    cutoff = datetime.now(UTC) - timedelta(days=max(1, int(since_days or 1)))

    rows: list[tuple[datetime, dict]] = []
    for hit in hits or []:
        if not isinstance(hit, dict):
            continue
        title = _clean(hit.get("name"))
        # #3901 — pertinence selon le PROFIL (domaine d'offre + métiers placés), plus de filtre IT fixe ;
        # sans profil exploitable on ne filtre pas.
        if not title or not offer_relevant_to_profile({"intitule": title}, profile, it_check=is_it_offer):
            continue
        # #4284.5 (#3901.12) — parité avec la recherche publique (`job_search`) : un stage n'est jamais un signal.
        # Les lignes émises ne portent ni `title` ni `contractType` : le filtre de sortie ne lisait rien, on juge ici.
        if is_internship_posting(title, _contract(hit.get("contract_type"))):
            continue
        org = hit.get("organization") if isinstance(hit.get("organization"), dict) else {}
        employer = _clean(org.get("name"))
        if not employer:
            continue  # offre sans organisation nommée — aucun compte à prospecter, on n'invente pas
        published = _parse_date(hit.get("published_at"))
        if published is None or published < cutoff:
            continue  # date obligatoire ET dans la fenêtre demandée
        # #2616.1 — le CDI distinguable : lu ici comme dans la corroboration par
        # candidat (`it_job_signals_wttj`, même `_contract()`), jamais une valeur
        # devinée — `None` quand l'index ne le dit pas.
        contract = _contract(hit.get("contract_type"))
        rows.append(
            (
                published,
                {
                    "name": employer,
                    "siren": None,  # jamais exposé par WTTJ — résolu en aval
                    "department": dept,  # jamais déduit — voir docstring
                    "city": _city(hit),
                    "sourceLabel": "Welcome to the Jungle",
                    "contractCode": contract,
                    "signal": {
                        "type": "hiring",
                        "label": f"Recrutement — {title}",  # #3901.w : pas d'« IT » figé
                        "date": published.date().isoformat(),
                        "url": _job_url(hit, org),
                        "detail": contract,
                    },
                },
            )
        )

    rows.sort(key=lambda t: t[0], reverse=True)
    # #4044 — idem pour le balayage de territoire.
    return drop_internship_postings([row for _dt, row in rows[:limit]], title_keys=("title",), contract_keys=("contractType",))
