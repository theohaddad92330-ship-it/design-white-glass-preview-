"""TED — appels d'offres européens (#4116), EN PLUS de BOAMP.

API officielle de l'Office des publications de l'UE, open data, SANS clé :
``POST https://api.ted.europa.eu/v3/notices/search`` (Search API v3, requête
« expert query », corps ``{query, fields, page, limit, scope}``, réponse
``{notices, totalNoticeCount}``). Contrat vérifié sur l'API réelle le 13/10/2026.

Même forme de sortie que ``public_tenders`` (BOAMP) : ``title / buyer / location /
department / publishedDate / deadline / cpv / url``. Ce que TED ne porte pas
(département, SIREN de l'acheteur) reste ``None`` — jamais deviné. La source ne se
nomme jamais à l'écran (famille « eu_tenders », voir ``source_health``).

Une panne LÈVE :class:`TedUnavailable` : l'appelant la signale comme source
dégradée et continue avec BOAMP seul — jamais confondue avec « zéro appel d'offres ».
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime, timedelta

import httpx

from app.services.company_filters import reason_for_exception
from app.services.data_sources import public_tenders as _bo
from app.services.data_sources.employer_match import same_employer
from app.services.distributed_rate_limiter import RateLimitTimeout
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle, wait_budget_active

logger = logging.getLogger(__name__)

SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search"
_TIMEOUT_S = 15.0
_MAX_AGE_DAYS = 730  # 24 mois (décision Louis, #4116)
_PAGE_LIMIT = 100
_MAX_PAGES = 3  # l'ordre serveur n'est pas garanti : on borne puis on trie côté client
_MAX_ITEMS = 8  # même plafond que BOAMP

# CPV demandés au serveur : 72 services informatiques, 48 progiciels, 79 services
# aux entreprises (conseil) ; le tri fin (79 seulement si l'objet est clairement IT)
# est fait ensuite par le tri IT de BOAMP, réutilisé tel quel.
_QUERY_CPV = ("72*", "48*", "79*")

_FIELDS = [
    "publication-number",
    "notice-title",
    "buyer-name",
    "classification-cpv",
    "publication-date",
    "deadline-receipt-tender-date-lot",
    "links",
]


_PLACE_PREFIX_RE = re.compile(r"^France[\w\-’' ]*:\s*")


class TedUnavailable(Exception):
    """TED injoignable ou réponse inexploitable — jamais un « zéro résultat »."""

    def __init__(self, reason: str, *, deferred: bool = False, code: str = "") -> None:
        super().__init__(reason)
        self.reason = reason
        #: DISCOVER-PARTIEL-2 — vrai quand NOTRE limiteur a fait attendre : TED n'a rien refusé.
        self.deferred = deferred
        self.code = code


def _lang_value(value: object, prefer: tuple[str, ...] = ("fra", "eng")) -> str | None:
    """TED sert les textes par langue : ``{"fra": ["…"], "eng": "…"}``."""
    if not isinstance(value, dict):
        return _bo._first(value)
    for lang in (*prefer, *value):
        got = _bo._first(value.get(lang))
        if got:
            return got
    return None


def _clean_title(raw: str | None) -> str:
    """« France – Libellé CPV – Objet » → « Objet » (le préfixe est le CPV en toutes lettres)."""
    # Avis plus anciens : « France-Paris-La-Défense: Services informatiques ».
    raw = _PLACE_PREFIX_RE.sub("", raw or "")
    parts = [p.strip() for p in raw.split(" – ")]
    return _bo._clean(parts[-1] if len(parts) >= 3 else (raw or ""), 300)


def _date10(value: object) -> str | None:
    s = _bo._first(value)
    return s[:10] if s and len(s) >= 10 else None


def _notice_url(notice: dict) -> str | None:
    html = (notice.get("links") or {}).get("html")
    if isinstance(html, dict):
        for lang in ("FRA", "ENG", *html):
            if html.get(lang):
                return str(html[lang])
    number = _bo._first(notice.get("publication-number"))
    return f"https://ted.europa.eu/fr/notice/-/detail/{number}" if number else None


def build_query(company_name: str, since_days: int | None = None) -> str | None:
    """Lot 762 : ``since_days`` absent = AUCUNE borne de date (l'avis ancien est stocké ``historical``)."""
    safe = (company_name or "").replace('"', " ").replace("\\", " ").replace("*", " ").strip()
    if not safe:
        return None
    window = (
        ""
        if since_days is None
        else f" AND publication-date>={(datetime.now(UTC) - timedelta(days=since_days)).strftime('%Y%m%d')}"
    )
    cpv = " OR ".join(f"classification-cpv={c}" for c in _QUERY_CPV)
    return f'buyer-name="{safe}*" AND buyer-country=FRA{window} AND ({cpv})'


async def ted_tenders(
    company_name: str,
    *,
    pack: str | None = None,
    siren: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Appels d'offres IT européens PUBLIÉS PAR l'entreprise (24 mois), récents d'abord.

    Lève :class:`TedUnavailable` sur toute panne (HTTP ≠ 2xx, JSON illisible,
    réponse sans ``notices``)."""
    query = build_query(company_name)
    if query is None:
        return []
    cleaned = company_name.strip()
    http = client if client is not None else _bo._get_shared_client()

    notices: list[dict] = []
    try:
        for page in range(1, _MAX_PAGES + 1):
            body = {"query": query, "fields": _FIELDS, "page": page, "limit": _PAGE_LIMIT, "scope": "ALL"}
            # Sous budget d'attente (Découvrir), un vrai 429 vaut UNE nouvelle tentative :
            # `Retry-After` pose le refroidissement, le créneau suivant l'attend s'il tient
            # dans ce qui reste, sinon `RateLimitTimeout` (différé). Jamais une boucle.
            for _attempt in range(2 if wait_budget_active() else 1):
                async with throttle("ted"):
                    resp = await http.post(SEARCH_URL, json=body, timeout=_TIMEOUT_S)
                if resp.status_code != 429:
                    break
                back_off_provider("ted", retry_after_header(resp))
            resp.raise_for_status()
            payload = resp.json()
            batch = payload.get("notices") if isinstance(payload, dict) else None
            if not isinstance(batch, list):
                raise ValueError("réponse TED sans liste « notices »")
            notices.extend(n for n in batch if isinstance(n, dict))
            total = payload.get("totalNoticeCount")
            if len(batch) < _PAGE_LIMIT or not isinstance(total, int) or len(notices) >= total:
                break
    except RateLimitTimeout as exc:
        logger.info("TED différé pour %r (notre limiteur) : %s", cleaned, exc)
        raise TedUnavailable(str(exc), deferred=True) from exc
    except Exception as exc:  # noqa: BLE001 — la panne est NOMMÉE à l'appelant, pas avalée
        logger.warning("TED tenders failed for %r: %s", cleaned, exc)
        raise TedUnavailable(str(exc) or reason_for_exception(exc), code=reason_for_exception(exc)) from exc

    cutoff = datetime.now(UTC) - timedelta(days=_MAX_AGE_DAYS)
    scored: list[tuple[datetime, dict]] = []
    for n in notices:
        cpvs = _bo._cpv_codes({"code_cpv": n.get("classification-cpv")})
        # dédoublonne les CPV répétés par lot, ordre gardé
        cpvs = list(dict.fromkeys(cpvs))
        title = _clean_title(_lang_value(n.get("notice-title")))
        if not _bo._is_it({"objet": title}, cpvs, pack=pack):
            continue
        buyer = _lang_value(n.get("buyer-name"))
        # TED ne porte pas le SIREN de l'acheteur : contrôle par le NOM seul, jamais deviné.
        if not same_employer(buyer, cleaned, employer_siren=None, company_siren=siren):
            continue
        published = _date10(n.get("publication-date"))
        parsed = _bo._parse_date(published)
        # Lot 762 : plus de borne d'âge de stockage — l'avis ancien est estampillé ``historical``.
        item = {
            "title": title,
            "buyer": buyer,
            "location": None,
            "department": None,
            "publishedDate": published,
            "deadline": _date10(n.get("deadline-receipt-tender-date-lot")),
            "cpv": ", ".join(cpvs[:3]) or None,
            "url": _notice_url(n),
            **({"historical": True} if parsed is not None and parsed < cutoff else {}),
        }
        scored.append((parsed or datetime.min.replace(tzinfo=UTC), item))
    scored.sort(key=lambda t: t[0], reverse=True)
    return [item for _dt, item in scored[:_MAX_ITEMS]]


def _title_key(title: object) -> str:
    return " ".join(_bo._deaccent(str(title or "")).lower().split())[:70]


def merge_tenders(boamp: list[dict], ted: list[dict]) -> list[dict]:
    """BOAMP + TED, un marché publié aux deux = UN signal.

    Même acheteur (``same_employer``) ET même objet (clé de titre normalisée) ⇒
    doublon. BOAMP gagne (il porte le département) ; une échéance absente est
    comblée par celle de TED. Triés par date de publication, récents d'abord."""
    merged = [dict(b) for b in boamp]
    for t in ted:
        key = _title_key(t.get("title"))
        dup = next(
            (
                m
                for m in merged
                if key
                and _title_key(m.get("title")) == key
                and same_employer(m.get("buyer"), t.get("buyer"))
            ),
            None,
        )
        if dup is None:
            merged.append(dict(t))
            continue
        for field in ("deadline", "cpv", "publishedDate"):
            if not dup.get(field) and t.get(field):
                dup[field] = t[field]
    merged.sort(key=lambda m: str(m.get("publishedDate") or ""), reverse=True)
    return merged[:_MAX_ITEMS]
