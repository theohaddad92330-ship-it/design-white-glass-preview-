"""Greenhouse et Lever — les offres qui ne passent pas par les agrégateurs.

Deux API PUBLIQUES, documentées, sans authentification et sans quota déclaré,
VÉRIFIÉES en direct le 2026-08-22 :

    GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=false
        → {"jobs": [{id, title, absolute_url, location:{name}, updated_at,
                     first_published, company_name, metadata:[…]}, …]}

    GET https://api.lever.co/v0/postings/{company}?mode=json
        → [{id, text, hostedUrl, createdAt (epoch ms), country, workplaceType,
            categories:{commitment, department, location}}, …]

Un board inexistant répond **404** (`{"ok": false}` chez Lever) : c'est une
NON-DÉTECTION, pas une panne, et elle ne coûte rien.

LA RÈGLE QUI PORTE CE MODULE — L'ATTRIBUTION
--------------------------------------------
Un board se désigne par un slug, et un slug se devine. Attribuer à un compte les
offres du board d'un homonyme écrirait un signal de recrutement FAUX sur un
compte réel — exactement le genre de donnée inventée que le produit s'interdit.

On n'attribue donc que sur PREUVE, et il y en a deux :

- le slug vient du **domaine de l'entreprise** (`qonto.com` → `qonto`) — c'est
  l'entreprise elle-même qui publie ce domaine ;
- ou la réponse **nomme l'entreprise** : Greenhouse renvoie `company_name`, on
  le compare. Lever ne renvoie aucun nom — donc **sans domaine, on n'appelle pas
  Lever du tout**.

Même contrat de sortie que France Travail, APEC et WTTJ (`title`, `location`,
`date`, `url`, `source`…) : la fusion des sources est déjà écrite
(`dated_signals.merge_job_signals`, dédup par URL), il n'y a rien à réinventer.
Échec quelconque ⇒ ``[]`` : une source d'appoint ne casse jamais une analyse.
"""

from __future__ import annotations

import html
import logging
import re
from datetime import UTC, datetime, timedelta

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.company_name_variants import company_name_variants
from app.services.data_sources._http_pool import get_shared_client
from app.services.data_sources.france_travail import is_it_offer
from app.services.internship_posting import drop_internship_postings
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import record_degradation
from app.services.tech_stack import derive_technologies

logger = logging.getLogger(__name__)

_GREENHOUSE_URL = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
_LEVER_URL = "https://api.lever.co/v0/postings/{slug}"
_TIMEOUT_S = 8.0

# Même règle que France Travail et APEC (#4754) : au-delà d'un an, un besoin de
# recrutement n'est plus FRAIS mais reste un signal historique — stocké et
# estampillé ``historical``, jeté seulement au-delà du plafond d'historique.
_MAX_AGE_DAYS = 365

#: Suffixes de domaine qui ne disent rien de l'entreprise.
_DOMAIN_NOISE = ("www.",)


def _clean(value: object) -> str | None:
    s = " ".join(str(value or "").split())
    return s or None


def _fold(value: object) -> str:
    """Minuscules, sans accents, sans ponctuation — pour comparer deux noms."""
    import unicodedata

    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", "", text)


def _slug(value: str) -> str:
    """« Groupe SII » → ``groupe-sii``. Un slug vide n'est jamais appelé."""
    import unicodedata

    text = unicodedata.normalize("NFD", value)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text)).strip("-")


def _domain_slug(website: str | None) -> str | None:
    """`https://www.groupe-sii.com/carrieres` → ``groupe-sii``.

    La primitive de normalisation de domaine existe déjà côté produit
    (`assets.website_domain`) ; ici on a besoin du LABEL, pas du domaine, et
    d'un repli silencieux : une valeur illisible ne vaut pas un slug inventé.
    """
    raw = (website or "").strip().lower()
    if not raw:
        return None
    raw = re.sub(r"^[a-z]+://", "", raw)
    for noise in _DOMAIN_NOISE:
        if raw.startswith(noise):
            raw = raw[len(noise) :]
    host = raw.split("/")[0].split("?")[0]
    label = host.split(".")[0]
    return _slug(label) or None


def _parse_iso(value: object) -> datetime | None:
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
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _parse_epoch_ms(value: object) -> datetime | None:
    """Lever date en millisecondes depuis l'époque. Une valeur non numérique
    vaut ``None`` — jamais « aujourd'hui »."""
    try:
        ms = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if ms <= 0:
        return None
    try:
        return datetime.fromtimestamp(ms / 1000, tz=UTC)
    except (OverflowError, OSError, ValueError):
        return None


def _is_it_title(title: str | None) -> bool:
    """Le même juge que France Travail, sur le seul champ dont on dispose ici.

    `is_it_offer` lit `intitule` : on lui donne l'intitulé du board plutôt que
    de recopier la liste des termes IT, qui divergerait au premier ajout.
    """
    return is_it_offer({"intitule": title or ""})


async def _get_json(http: httpx.AsyncClient, url: str, bucket: str, params: dict | None = None) -> object | None:
    """Un GET qui ne lève jamais. 404 = board inexistant = non-détection.

    Le seau de débit est appliqué par l'APPELANT, avec une clé littérale : la
    garde `test_upstream_throttle_coverage` lit les sites d'appel dans l'AST, et
    un `throttle(variable)` lui est invisible — c'est exactement la « clé
    fantôme » qu'elle existe pour empêcher.
    """
    try:
        resp = await http.get(url, params=params or {})
        if resp.status_code == 404:
            return None
        if resp.status_code == 429:
            # ``bucket`` EST le nom du throttle appliqué par l'appelant
            # ("greenhouse" / "lever") — pas de littéral à deviner ici.
            back_off_provider(bucket, retry_after_header(resp))
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:  # noqa: BLE001 — une source d'appoint ne casse rien
        logger.warning("ATS board %s failed for %s: %s", bucket, url, exc)
        record_degradation(get_correlation_id(), source=bucket, reason=str(exc))
        return None


#: Un intitulé sans mot IT n'est rattrapé par sa description que s'il en nomme au moins deux.
_MIN_TECHS_TO_RESCUE = 2


def _plain_text(value: object) -> str:
    """Description Greenhouse (HTML échappé) → texte brut."""
    return re.sub(r"<[^>]+>", " ", html.unescape(html.unescape(str(value or ""))))


def _greenhouse_jobs(payload: object, company: str, *, trusted_slug: bool, all_roles: bool = False) -> list[dict]:
    jobs = payload.get("jobs") if isinstance(payload, dict) else None
    if not isinstance(jobs, list) or not jobs:
        return []

    # L'attribution : soit le slug vient du domaine, soit la réponse nomme
    # l'entreprise. `company_name` est le même sur toutes les lignes d'un board.
    if not trusted_slug:
        named = next((_clean(j.get("company_name")) for j in jobs if isinstance(j, dict)), None)
        if not named:
            return []
        wanted, got = _fold(company), _fold(named)
        if wanted not in got and got not in wanted:
            return []

    out: list[dict] = []
    for job in jobs:
        if not isinstance(job, dict):
            continue
        title = _clean(job.get("title"))
        # #4016 SIG-D6 — `content=true` (doc Greenhouse) : la description nourrit les
        # technologies, et rattrape un intitulé maison sans mot IT (≥ 2 technologies).
        techs = derive_technologies(_plain_text(job.get("content")))
        # #1124 — en placement, on ne trie plus par rôle. L'ATTRIBUTION, elle,
        # reste entière : le board vient du domaine du compte ou nomme
        # l'entreprise, et c'est ce qui empêche d'attribuer les offres d'un
        # homonyme.
        if not title or (not all_roles and not _is_it_title(title) and len(techs) < _MIN_TECHS_TO_RESCUE):
            continue
        location = job.get("location")
        published = _parse_iso(job.get("first_published")) or _parse_iso(job.get("updated_at"))
        out.append(
            {
                "title": title,
                "location": _clean(location.get("name")) if isinstance(location, dict) else "",
                "date": published.date().isoformat() if published else None,
                "contractType": None,
                "skills": techs,
                "company": _clean(job.get("company_name")),
                "city": _clean(location.get("name")) if isinstance(location, dict) else None,
                "url": _clean(job.get("absolute_url")),
                "source": "greenhouse",
                "_at": published,
            }
        )
    return out


def _lever_jobs(payload: object, *, all_roles: bool = False) -> list[dict]:
    if not isinstance(payload, list) or not payload:
        return []
    out: list[dict] = []
    for post in payload:
        if not isinstance(post, dict):
            continue
        title = _clean(post.get("text"))
        if not title or (not all_roles and not _is_it_title(title)):
            continue
        categories = post.get("categories") if isinstance(post.get("categories"), dict) else {}
        published = _parse_epoch_ms(post.get("createdAt"))
        location = _clean(categories.get("location"))
        out.append(
            {
                "title": title,
                "location": location or "",
                "date": published.date().isoformat() if published else None,
                "contractType": _clean(categories.get("commitment")),
                "skills": [],
                "company": None,
                "city": location,
                "url": _clean(post.get("hostedUrl")),
                "source": "lever",
                "_at": published,
            }
        )
    return out


@provider_cache.cached_by(
    "jobs:ats",
    lambda company, *, website=None, limit=12, **_: f"{(company or '').strip().lower()}:{(website or '').strip().lower()}:{limit}",
    ttl=provider_cache.TTL_JOBS,
    empty_ttl=provider_cache.TTL_EMPTY_JOBS,  # SIG-C — 404 = pas de board = vide normal
)
async def it_job_signals_ats(
    company: str,
    *,
    website: str | None = None,
    limit: int = 12,
    all_roles: bool = False,
    siren: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Offres IT récentes publiées sur le board Greenhouse ou Lever du compte.

    ADDITIF : la sortie a le contrat de France Travail, et `merge_job_signals`
    déduplique déjà par URL — une offre reprise par un agrégateur ne compte pas
    deux fois. Aucun board trouvé ⇒ ``[]``, ce qui est le cas le plus fréquent
    et ne coûte que deux 404.

    #3817.1 — un slug deviné sur la RAISON SOCIALE (« jcdecaux-france ») peut ne
    jamais exister quand le board publie sous la seule MARQUE (« jcdecaux ») :
    sans domaine connu, on essaie donc aussi les slugs des formes réduites du
    nom, jamais celui du SIREN (un board ne se nomme pas en chiffres).
    """
    cleaned = (company or "").strip()
    if not cleaned:
        return []

    domain_slug = _domain_slug(website)
    name_slugs: list[str] = []
    seen_slugs: set[str] = set()
    for variant in company_name_variants(cleaned, siren=siren):
        if variant == siren:
            continue  # un SIREN ne nomme aucun board — jamais essayé comme slug
        slug = _slug(variant)
        if slug and slug not in seen_slugs:
            seen_slugs.add(slug)
            name_slugs.append(slug)
    limit = max(1, min(limit, 20))

    http = client if client is not None else get_shared_client("ats_boards", timeout=_TIMEOUT_S, follow_redirects=True)
    found: list[dict] = []
    # Greenhouse d'abord : c'est le seul des deux qui NOMME l'entreprise,
    # donc le seul qu'on puisse interroger sur un slug tiré du nom.
    candidates = [(domain_slug, True)] + [(slug, False) for slug in name_slugs]
    for slug, trusted in candidates:
        if not slug or found:
            continue
        async with throttle("greenhouse"):
            payload = await _get_json(http, _GREENHOUSE_URL.format(slug=slug), "greenhouse", {"content": "true"})
        found = _greenhouse_jobs(payload, cleaned, trusted_slug=trusted, all_roles=all_roles)

    # Lever ensuite, et UNIQUEMENT sur le slug du domaine : sa réponse ne
    # porte aucun nom d'entreprise, donc un slug deviné serait une
    # attribution sans preuve.
    if not found and domain_slug:
        async with throttle("lever"):
            payload = await _get_json(http, _LEVER_URL.format(slug=domain_slug), "lever", {"mode": "json"})
        found = _lever_jobs(payload, all_roles=all_roles)

    # #3925 — Workable, SmartRecruiters, Recruitee, Teamtailor, Personio, après
    # Greenhouse/Lever, même attribution stricte (voir `ats_boards_more`).
    # Import tardif : `ats_boards_more` réutilise les helpers de ce module.
    if not found:
        from app.services.data_sources import ats_boards_more

        if ats_boards_more.extra_ats_enabled():
            for adapter in ats_boards_more.EXTRA_ADAPTERS:
                extra = await adapter(cleaned, website=website, http=http, all_roles=all_roles, siren=siren)
                if extra:
                    found = [{**job, "_at": _parse_iso(job.get("date"))} for job in extra]
                    break

    # Lot 762 (décision Louis 31/10 : « pas de limite ») — plus de borne d'âge de STOCKAGE :
    # l'offre ancienne est estampillée ``historical``, jamais jetée.
    fresh_cutoff = datetime.now(UTC) - timedelta(days=_MAX_AGE_DAYS)
    _min =datetime.min.replace(tzinfo=UTC)
    kept = [
        {**j, "historical": True} if j["_at"] is not None and j["_at"] < fresh_cutoff else j
        for j in found
    ]
    kept.sort(key=lambda j: j["_at"] or _min, reverse=True)
    # #4044 — une offre de STAGE n'est jamais un signal (décision Louis 12/10).
    return drop_internship_postings([{k: v for k, v in job.items() if k != "_at"} for job in kept[:limit]], title_keys=("title",), contract_keys=("contractType",))
