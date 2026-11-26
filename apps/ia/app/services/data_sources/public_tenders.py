"""BOAMP — Marchés publics IT (Bulletin officiel des annonces des marchés publics).

Free, NO key (Opendatasoft Explore v2.1 mirror). Public tenders are an ESN-gold
DATED signal: an "objet" mentioning migration ERP / infogérance / TMA / cloud with
a `datelimitereponse` is a live buying intent, geo-localisée par département — the
"où sont basées les demandes". We keep only IT tenders (CPV 48xx logiciel / 72xx
services informatiques, sinon match mots-clés) et RÉCENTS (< ~18 mois) : un marché
d'il y a 5 ans n'est plus actionnable. Name-matched (buyer/objet), so it runs in
Wave A next to news/jobs and feeds the dated block of the prompts. Empty on any
error so it never breaks research.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from datetime import UTC, datetime, timedelta

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.company_filters import reason_for_exception
from app.services.data_sources.employer_match import same_employer
from app.services.data_sources.signal_errors import SignalSourceUnavailable
from app.services.data_sources.territory_query import normalize_department, since_date
from app.services.domain_market_filters import market_filter_for
from app.services.distributed_rate_limiter import RateLimitTimeout
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import record_deferral, record_degradation

logger = logging.getLogger(__name__)

_BASE = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records"
_TIMEOUT_S = 10.0

# #2604 — un client HTTP RÉUTILISÉ, construit UNE seule fois plutôt qu'à
# chaque appel. `httpx.AsyncClient()` fait un travail SYNCHRONE (contexte SSL,
# pool de connexions), mesuré à 2-12 ms, qui bloquait la boucle d'événements
# AVANT le premier `await` de `public_tenders` — à CHAQUE appel, faute de quoi
# le client était refermé aussitôt. `_candidate_signals` (discover.py) appelle
# cette fonction sans client, une fois par candidat ciblé par
# `_start_signal_tasks` : le coût était donc multiplié par
# `SIGNALS_CANDIDATE_LIMIT`, PENDANT que rien d'autre ne pouvait tourner (ni
# les autres tâches, ni le décompte du budget). Aucun `await` ne sépare la
# vérification de l'affectation ci-dessous : une coroutine qui l'exécute va
# jusqu'au bout sans rendre la main, donc deux tâches lancées côte à côte ne
# peuvent pas s'entrelacer ici — pas de verrou nécessaire.
_shared_client: httpx.AsyncClient | None = None


def _get_shared_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None:
        _shared_client = httpx.AsyncClient(timeout=_TIMEOUT_S)
    return _shared_client

# Un marché de plus de ~18 mois n'est plus une intention d'achat actionnable
# (règle métier : ignorer la donnée d'il y a 5 ans face à la fraîche).
_MAX_AGE_DAYS = 548  # ≈ 18 months

# CPV divisions marquant un besoin IT : 48 = progiciels/logiciels, 72 = services
# informatiques (dev, conseil, infogérance, hébergement…).
_IT_CPV_PREFIXES = ("48", "72")

# Repli mots-clés quand pas de CPV (ou CPV non-IT mais objet clairement IT). Les
# multi-caractères sont cherchés en sous-chaîne (désaccentués) ; les sigles courts
# ambigus (SI, DSI, ERP…) exigent une frontière de mot pour éviter les faux
# positifs (« data » est dans « mandataire »).
_IT_KEYWORDS_SUBSTR = (
    "informatique",
    "logiciel",
    "developpement",
    "cloud",
    "cybersecurite",
    "systeme d'information",
    "infogerance",
    "numerique",
    "applicatif",
    "progiciel",
    "hebergement",
)
_IT_WORD_RE = re.compile(r"\b(erp|crm|tma|dsi|si|data|digital)\b")


def _deaccent(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn")


def _first(value: object) -> str | None:
    """First non-empty stringified item — BOAMP fields are sometimes a list
    (multi-département), sometimes a scalar."""
    if isinstance(value, (list, tuple)):
        for v in value:
            s = str(v or "").strip()
            if s:
                return s
        return None
    s = str(value or "").strip()
    return s or None


def _clean(value: object, limit: int | None = None) -> str:
    s = " ".join(str(value or "").split())
    return s[:limit] if limit else s


def _fields(rec: object) -> dict:
    """v2.1 returns flat records under ``results``; the legacy v1 mirror nests
    them under ``fields``. Accept both."""
    if not isinstance(rec, dict):
        return {}
    inner = rec.get("fields")
    return inner if isinstance(inner, dict) else rec


def _cpv_codes(f: dict) -> list[str]:
    raw = f.get("code_cpv") or f.get("cpv") or f.get("cpv_principal")
    if isinstance(raw, (list, tuple)):
        items = list(raw)
    elif isinstance(raw, str):
        items = re.split(r"[,\s;]+", raw)
    else:
        items = []
    out: list[str] = []
    for it in items:
        digits = "".join(ch for ch in str(it) if ch.isdigit())
        if digits:
            out.append(digits)
    return out


def _is_it(f: dict, cpvs: list[str], *, pack: str | None = None) -> bool:
    """Voir `decp._is_it` : sans pack, le tri IT historique à l'octet près."""
    domain_filter = market_filter_for(pack)
    if domain_filter is not None:
        if any(c.startswith(domain_filter.cpv_prefixes) for c in cpvs):
            return True
        hay = _deaccent(
            " ".join(str(f.get(k) or "") for k in ("objet", "descripteur_libelle", "intitule", "libelle_type_avis"))
        ).lower()
        return any(kw in hay for kw in domain_filter.keywords)

    if any(c.startswith(_IT_CPV_PREFIXES) for c in cpvs):
        return True
    hay = _deaccent(
        " ".join(
            str(f.get(k) or "")
            for k in ("objet", "descripteur_libelle", "intitule", "libelle_type_avis")
        )
    ).lower()
    if any(kw in hay for kw in _IT_KEYWORDS_SUBSTR):
        return True
    return bool(_IT_WORD_RE.search(hay))


def _parse_date(value: object) -> datetime | None:
    s = str(value or "").strip()
    if not s:
        return None
    s = s.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        # Bare YYYY-MM-DD or unexpected shape — try the date head only.
        try:
            dt = datetime.fromisoformat(s[:10])
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


def _location(f: dict) -> tuple[str | None, str | None]:
    """(location_label, department) — geo-localisation de la demande.

    Prefer a human département/région label; fall back to the raw département
    code so the prompt always shows *where* the tender is based (France).
    """
    dept_code = _first(f.get("code_departement") or f.get("dc") or f.get("departement"))
    dept_label = _first(
        f.get("libelle_departement") or f.get("nom_departement") or f.get("nomdepartement")
    )
    region = _first(f.get("region") or f.get("libelle_region") or f.get("nom_region"))
    department = dept_label or dept_code
    loc_parts = [p for p in (department, region) if p]
    location = ", ".join(dict.fromkeys(loc_parts)) or None
    return location, department


def _tender_url(f: dict) -> str | None:
    url = _first(f.get("url_avis") or f.get("url"))
    if url:
        return url
    idweb = _first(f.get("idweb") or f.get("id"))
    return f"https://www.boamp.fr/avis/detail/{idweb}" if idweb else None


@provider_cache.cached_by(
    "marches:boamp",
    # ⚠️ Le PACK entre dans la clé (voir `decp`).
    lambda company_name, *, pack=None, siren=None, **_: (
        f"{(company_name or '').strip().lower()}:{pack or 'esn_it'}:{(siren or '').strip()}"
    ),
    ttl=provider_cache.TTL_SIGNALS,
)
async def public_tenders(
    company_name: str,
    *,
    pack: str | None = None,
    siren: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Appels d'offres IT de l'entreprise : BOAMP + TED (#4116), même schéma.

    Tous les appelants de BOAMP (phase 1, Découvrir, data gateway) reçoivent donc
    les deux sources sans changer. Un marché publié aux deux = un seul signal. TED en
    panne → BOAMP seul continue et la panne est SIGNALÉE (source dégradée
    « ted », repliée à l'écran sous « eu_tenders »), jamais lue comme « zéro AO »."""
    from app.services.data_sources import ted  # import tardif : ted.py importe ce module

    boamp = await _boamp_tenders(company_name, pack=pack, siren=siren, client=client)
    try:
        eu = await ted.ted_tenders(company_name, pack=pack, siren=siren, client=client)
    except ted.TedUnavailable as exc:
        if exc.deferred:  # notre limiteur a fait attendre : TED n'a rien refusé
            record_deferral(get_correlation_id(), source="ted", reason=exc.reason)
        else:
            record_degradation(get_correlation_id(), source="ted", reason=exc.reason, code=exc.code)
        return boamp
    return ted.merge_tenders(boamp, eu) if eu else boamp


async def _boamp_tenders(
    company_name: str,
    *,
    pack: str | None = None,
    siren: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Recent IT public tenders PUBLISHED BY the company, newest first,
    geo-localised by département. Empty on any error.

    #3901 — la recherche plein texte ramasse tout avis dont l'objet CITE le nom ;
    un avis n'est rattaché que si son acheteur EST le compte (SIREN quand les deux
    le portent, sinon `same_employer` sur le nom). Jamais par homonymie."""
    cleaned = (company_name or "").strip()
    if not cleaned:
        return []

    # ODSQL full-text phrase search across buyer + objet. Strip quotes/backslashes
    # so the company name can't break out of the quoted literal.
    safe = cleaned.replace('"', " ").replace("\\", " ").strip()
    if not safe:
        return []
    params = {
        "where": f'"{safe}"',
        "order_by": "dateparution desc",
        "limit": "20",
    }

    http = client if client is not None else _get_shared_client()
    try:
        # BOAMP (Opendatasoft) est public et sans clé : budget par IP, aucun
        # bucket n'existait pour cet hôte.
        async with throttle("boamp"):
            resp = await http.get(_BASE, params=params)
        if resp.status_code == 429:
            back_off_provider("boamp", retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except RateLimitTimeout as exc:
        logger.info("BOAMP différé pour %r (notre limiteur) : %s", cleaned, exc)
        record_deferral(get_correlation_id(), source="boamp", reason=str(exc))
        return []
    except Exception as exc:  # noqa: BLE001 — a free source must never break research
        logger.warning("BOAMP tenders failed for %r: %s", cleaned, exc)
        # Report the REAL cause: without it the run can only say "aucun
        # résultat", which reads identically to a company that genuinely has
        # nothing here — opposite facts, same message.
        record_degradation(get_correlation_id(), source="boamp", reason=str(exc))
        return []

    records = None
    if isinstance(payload, dict):
        records = payload.get("results") or payload.get("records")
    now = datetime.now(UTC)
    cutoff = now - timedelta(days=_MAX_AGE_DAYS)
    _min = datetime.min.replace(tzinfo=UTC)

    scored: list[tuple[datetime, dict]] = []
    for rec in records or []:
        f = _fields(rec)
        if not f:
            continue
        cpvs = _cpv_codes(f)
        if not _is_it(f, cpvs, pack=pack):
            continue
        # #3901 — aucun avis rattaché sans contrôle d'acheteur (nom ou SIREN).
        if not same_employer(
            _first(f.get("nomacheteur") or f.get("acheteur") or f.get("nom_acheteur")),
            cleaned,
            employer_siren=_buyer_siren(f),
            company_siren=siren,
        ):
            continue
        published = _first(f.get("dateparution") or f.get("date_parution"))
        parsed = _parse_date(published)
        # Lot 762 : plus de borne d'âge de stockage — l'avis ancien est estampillé ``historical``.
        location, department = _location(f)
        item = {
            "title": _clean(f.get("objet") or f.get("intitule"), 300),
            "buyer": _first(
                f.get("nomacheteur") or f.get("acheteur") or f.get("nom_acheteur")
            ),
            "location": location,
            "department": department,
            "publishedDate": published,
            "deadline": _first(
                f.get("datelimitereponse")
                or f.get("date_limite_reponse")
                or f.get("datelimitereponse_iso")
            ),
            "cpv": ", ".join(cpvs[:3]) or None,
            "url": _tender_url(f),
            **({"historical": True} if parsed is not None and parsed < cutoff else {}),
        }
        scored.append((parsed or _min, item))

    # Sort parseable-recent first; unparseable (``_min``) sink to the end.
    scored.sort(key=lambda t: t[0], reverse=True)
    return [item for _dt, item in scored[:8]]


# ───────────────────────────────────────────────────────────────────────────
# Prospection INVERSÉE — lister les ACHETEURS qui bougent (Découvrir v2)
#
# `public_tenders` ci-dessus part d'une entreprise et cherche ses AO. Ici on
# part du TERRITOIRE (département + fenêtre de dates) et on remonte la liste
# des acheteurs qui ont publié un AO IT : « qui a un budget MAINTENANT ».
# ADDITIF — le chemin mono-entreprise est inchangé.
# ───────────────────────────────────────────────────────────────────────────

SOURCE_NAME = "BOAMP"


def build_tender_where(department: str | None, since_days: int) -> str:
    """Clause ODSQL : fenêtre de parution + (optionnel) département.

    ``like "*69*"`` volontairement large sur ``code_departement`` (champ
    multivalué, parfois zéro-paddé « 069 ») — le filtre EXACT est réappliqué
    côté client sur le code parsé, donc large ici ne pollue pas le résultat.
    """
    parts = [f"dateparution >= date'{since_date(since_days)}'"]
    dept = normalize_department(department)
    if dept:
        parts.append(f'code_departement like "*{dept}*"')
    return " AND ".join(parts)


def _dept_code(f: dict) -> str | None:
    raw = _first(f.get("code_departement") or f.get("dc") or f.get("departement"))
    return normalize_department(raw)


def _buyer_siren(f: dict) -> str | None:
    """SIREN de l'acheteur quand BOAMP le porte (souvent absent) — jamais deviné."""
    raw = _first(f.get("acheteur_id") or f.get("id_acheteur") or f.get("siret_acheteur"))
    digits = "".join(ch for ch in str(raw or "") if ch.isdigit())
    return digits[:9] if len(digits) >= 9 else None


async def list_tender_buyers(
    department: str | None = None,
    since_days: int = 90,
    limit: int = 25,
    *,
    client: httpx.AsyncClient | None = None,
    pack: str | None = None,
    offset: int = 0,
    page_stats: dict[str, int] | None = None,
) -> list[dict]:
    """Acheteurs publics ayant publié un AO IT récent sur le territoire.

    ``offset`` (#4796) : le décalage ``offset`` de l'API (Opendatasoft) de la page lue ; ``page_stats`` reçoit
    ``asked``/``raw`` (voir ``france_travail.list_hiring_companies``). Défauts : la requête d'avant.

    Chaque ligne : l'identité de l'acheteur telle que la source la donne
    (``name``, ``siren`` quand BOAMP le porte, ``department``, ``city``) + un
    ``signal`` au format ``DiscoverSignal`` (``type='tender'``). Une annonce sans
    date de parution exploitable est écartée : la date EST le « pourquoi
    maintenant » du contrat.

    Lève :class:`SignalSourceUnavailable` si la source est injoignable — jamais
    de liste vide silencieuse (contrat Découvrir v2).
    """
    limit = max(1, min(int(limit or 1), 100))
    dept = normalize_department(department)
    # Marge de fetch : le filtre IT + date + département élague beaucoup.
    fetch = min(100, max(limit * 3, 50))

    # #2604.2 — client de PROCESS partagé (même `_get_shared_client()` que
    # `public_tenders()` ci-dessus) : jamais refermé.
    http = client if client is not None else _get_shared_client()
    params = {
        "where": build_tender_where(dept, since_days),
        "order_by": "dateparution desc",
        "limit": str(fetch),
        **({"offset": str(int(offset))} if offset > 0 else {}),
    }
    try:
        async with throttle("boamp"):
            resp = await http.get(_BASE, params=params)
        if resp.status_code == 429:
            back_off_provider("boamp", retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("BOAMP tender listing failed (dept=%s): %s", dept, exc)
        # #2469 — clé machine ; le détail de l'exception reste au journal, ci-dessus.
        raise SignalSourceUnavailable(SOURCE_NAME, reason_for_exception(exc)) from exc

    records = payload.get("results") or payload.get("records") if isinstance(payload, dict) else None
    if page_stats is not None:
        page_stats.update(asked=fetch, raw=len(records or []))
    cutoff = datetime.now(UTC) - timedelta(days=max(1, int(since_days or 1)))

    rows: list[tuple[datetime, dict]] = []
    for rec in records or []:
        f = _fields(rec)
        if not f:
            continue
        cpvs = _cpv_codes(f)
        # LUD.1 — le pack de l'espace ; sans pack, le tri IT historique.
        if not _is_it(f, cpvs, pack=pack):
            continue
        buyer = _first(f.get("nomacheteur") or f.get("acheteur") or f.get("nom_acheteur"))
        if not buyer:
            continue  # sans acheteur nommé il n'y a pas de compte à prospecter
        parsed = _parse_date(_first(f.get("dateparution") or f.get("date_parution")))
        if parsed is None or parsed < cutoff:
            continue  # date obligatoire ET dans la fenêtre demandée
        row_dept = _dept_code(f)
        if dept and row_dept != dept:
            continue
        objet = _clean(f.get("objet") or f.get("intitule"), 180)
        rows.append(
            (
                parsed,
                {
                    "name": buyer,
                    "siren": _buyer_siren(f),
                    "department": row_dept,
                    "city": None,
                    "signal": {
                        "type": "tender",
                        "label": f"AO IT publié — {objet}" if objet else "AO IT publié",
                        "date": parsed.date().isoformat(),
                        "url": _tender_url(f),
                        "detail": _clean(
                            " · ".join(
                                p for p in (
                                    f"CPV {', '.join(cpvs[:3])}" if cpvs else "",
                                    f"réponse avant le {_first(f.get('datelimitereponse') or f.get('date_limite_reponse'))}"
                                    if _first(f.get("datelimitereponse") or f.get("date_limite_reponse"))
                                    else "",
                                ) if p
                            )
                        )
                        or None,
                    },
                },
            )
        )

    rows.sort(key=lambda t: t[0], reverse=True)
    return [row for _dt, row in rows[:limit]]
