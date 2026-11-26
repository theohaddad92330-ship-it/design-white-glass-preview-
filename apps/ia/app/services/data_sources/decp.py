"""DECP — Données Essentielles de la Commande Publique (marchés ATTRIBUÉS).

Free, NO key (Opendatasoft Explore v2.1 mirror on ``data.economie.gouv.fr``).
Là où BOAMP (public_tenders) donne les appels d'offres OUVERTS (intention), DECP
donne les marchés ATTRIBUÉS : qui a acheté quoi, POUR COMBIEN, et surtout À QUI
(le titulaire). C'est de l'intel budget + concurrence : le prospect (comme
ACHETEUR) a-t-il récemment attribué des marchés IT, et à quelle ESN rivale ?

On garde les marchés IT (CPV 48xx logiciel / 72xx services info, sinon match
mots-clés) et RÉCENTS (< ~24 mois — un marché attribué reste actionnable un peu
plus longtemps qu'un appel d'offres ouvert), triés du plus récent au plus ancien,
géo-localisés par département. Name-matched (full-text acheteur/objet/titulaire),
donc tourne en Wave A à côté de public_tenders. Empty on any error.

⚠️ Les noms de champs DECP varient selon le millésime / la source : parsing
défensif (aliases camelCase + snake + imbriqués). À vérifier sur la donnée live.
"""

from __future__ import annotations

import calendar
import logging
import re
import unicodedata
from datetime import UTC, date, datetime, timedelta

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.company_filters import reason_for_exception
from app.services.data_sources._http_pool import get_shared_client
from app.services.data_sources.registry_lookup import names_by_siren, to_siren
from app.services.data_sources.signal_errors import SignalSourceUnavailable
from app.services.data_sources.territory_query import normalize_department, since_date
from app.services.domain_market_filters import market_filter_for
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import error_reason, record_degradation

logger = logging.getLogger(__name__)

_BASE = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/decp_augmente/records"
_TIMEOUT_S = 20.0  # SIGNAUX-OPTI 16/10 : 10 s expirait en prod (source gratuite, tâche de fond)

# Un marché attribué de plus de ~24 mois n'est plus une intel budget fraîche.
_MAX_AGE_DAYS = 730  # ≈ 24 months

# CPV divisions marquant un besoin IT : 48 = progiciels/logiciels, 72 = services
# informatiques (dev, conseil, infogérance, hébergement…).
_IT_CPV_PREFIXES = ("48", "72")

# Repli mots-clés (désaccentués). Les sigles courts ambigus exigent une frontière
# de mot pour éviter les faux positifs.
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
    "infrastructure",
    "reseau",
)
_IT_WORD_RE = re.compile(r"\b(erp|crm|tma|dsi|si|data|digital|saas|pki)\b")


def _deaccent(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn")


def _clean(value: object, limit: int | None = None) -> str | None:
    s = " ".join(str(value or "").split())
    if not s:
        return None
    return s[:limit] if limit else s


def _fields(rec: object) -> dict:
    """v2.1 returns flat records under ``results``; a legacy v1 mirror nests them
    under ``fields``. Accept both."""
    if not isinstance(rec, dict):
        return {}
    inner = rec.get("fields")
    return inner if isinstance(inner, dict) else rec


def _deep(f: dict, path: str) -> object:
    """Dotted lookup that also digs into a first list item (``titulaires.0`` shape
    is common in DECP augmenté)."""
    cur: object = f
    for part in path.split("."):
        if isinstance(cur, (list, tuple)):
            cur = cur[0] if cur else None
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _pick(f: dict, *paths: str) -> str | None:
    """First non-empty stringified value among the given (possibly dotted) paths."""
    for p in paths:
        val = _deep(f, p) if "." in p else f.get(p)
        s = _clean(val)
        if s:
            return s
    return None


def _pick_date(f: dict, *paths: str) -> str | None:
    """Première date LISIBLE parmi les chemins donnés, sinon ``None``.

    Incident 24/09 : DECP publie parfois `datepublicationdonnees` comme le TEXTE
    « None ». `_pick` le retenait, et le texte finissait dans une colonne
    timestamptz côté api, qui annulait la transaction de l'analyse. Une date
    illisible est une ABSENCE — jamais le texte brut, jamais une date devinée.
    """
    for p in paths:
        s = _pick(f, p)
        if s and _parse_date(s) is not None:
            return s
    return None


def _cpv_codes(f: dict) -> list[str]:
    raw = _pick(f, "codeCPV", "codecpv", "code_cpv", "cpv", "cpvPrincipal") or ""
    # Also accept a raw list under any of those keys.
    for k in ("codeCPV", "codecpv", "code_cpv", "cpv"):
        v = f.get(k)
        if isinstance(v, (list, tuple)):
            raw = " ".join(str(x) for x in v)
            break
    out: list[str] = []
    for it in re.split(r"[,\s;]+", str(raw)):
        digits = "".join(ch for ch in it if ch.isdigit())
        if digits:
            out.append(digits)
    return out


def _is_it(f: dict, cpvs: list[str], *, pack: str | None = None) -> bool:
    """Le marché relève-t-il du domaine que le VENDEUR vend ?

    Sans pack, en `esn_it` ou avec un pack sans filtre : les divisions CPV 48/72
    et le lexique IT, à l'octet près. Un pack qui a un filtre juge sur SES
    divisions et SON vocabulaire — un marché de services informatiques n'est pas
    le marché d'un bureau d'études, et le compter gonflerait son signal.
    """
    domain_filter = market_filter_for(pack)
    if domain_filter is not None:
        if any(c.startswith(domain_filter.cpv_prefixes) for c in cpvs):
            return True
        hay = _deaccent(
            " ".join(str(f.get(k) or "") for k in ("objet", "objetMarche", "objet_du_marche", "intitule", "nature"))
        ).lower()
        return any(kw in hay for kw in domain_filter.keywords)

    if any(c.startswith(_IT_CPV_PREFIXES) for c in cpvs):
        return True
    hay = _deaccent(
        " ".join(
            str(f.get(k) or "")
            for k in ("objet", "objetMarche", "objet_du_marche", "intitule", "nature")
        )
    ).lower()
    if any(kw in hay for kw in _IT_KEYWORDS_SUBSTR):
        return True
    return bool(_IT_WORD_RE.search(hay))


def _winner(f: dict) -> str | None:
    """Titulaire (the awarded supplier) — the competitive gold. Handles the flat
    aliases, the nested ``titulaire.denominationSociale`` and the exploded
    ``titulaires`` list-of-dicts."""
    direct = _pick(
        f,
        "titulaire_denominationSociale",
        "titulaire_denomination_sociale",
        "titulaire_denominationsociale",
        "titulaireDenominationSociale",
        "denominationSociale",
        "denominationsociale",
        "titulaire_nom",
        "nomtitulaire",
        "nom_titulaire",
        "titulaire.denominationSociale",
        "titulaire.nom",
    )
    if direct:
        return direct
    titulaires = f.get("titulaires")
    if isinstance(titulaires, (list, tuple)):
        for t in titulaires:
            node = t.get("titulaire") if isinstance(t, dict) and isinstance(t.get("titulaire"), dict) else t
            if isinstance(node, dict):
                s = _clean(
                    node.get("denominationSociale")
                    or node.get("denomination_sociale")
                    or node.get("denominationsociale")
                    or node.get("nom")
                    or node.get("id")
                )
                if s:
                    return s
            else:
                s = _clean(node)
                if s:
                    return s
    return None


def _buyer(f: dict) -> str | None:
    return _pick(
        f,
        "acheteur_nom",
        "acheteurNom",
        "acheteurnom",
        "nomacheteur",
        "nom_acheteur",
        "nomAcheteur",
        "acheteur.nom",
        "acheteur",
    )


def _location(f: dict) -> tuple[str | None, str | None]:
    """(location_label, department) — géo-localisation de l'exécution (France)."""
    dept = _pick(
        f,
        "codeDepartement",
        "codedepartement",
        "code_departement",
        "lieuExecution_code",
        "lieuexecution_code",
        "lieuExecution.code",
    )
    if dept:
        dept = "".join(ch for ch in dept if ch.isalnum())[:3] or None
    label = _pick(
        f,
        "lieuExecution_nom",
        "lieuexecution_nom",
        "lieu_execution_nom",
        "nomlieuexecution",
        "lieuExecution.nom",
        "lieuExecution_libelle",
    )
    location = label or dept
    return location, dept


def _duration_months(f: dict) -> int | None:
    """Durée du marché en mois, ou ``None``.

    ⚠️ Le dépôt affirmait que DECP ne publiait pas cette donnée. Vérifié en
    direct le 22/08 sur les deux jeux réellement appelés : `dureemois` existe,
    et 100 marchés IT récents sur 100 le portent. C'est la donnée qui transforme
    « quelqu'un est en place » en « la porte se rouvre le … ».

    Les cellules vides du millésime valent la chaîne ``CDL`` ; une durée nulle ou
    négative n'est pas une durée. Dans les deux cas on rend ``None`` : le marché
    reste « attribué, échéance inconnue », jamais « échu aujourd'hui ».
    """
    raw = _pick(f, "dureeMois", "dureemois", "duree_mois", "duree")
    if not raw:
        return None
    digits = re.match(r"\s*(\d+)", raw)
    if not digits:
        return None
    months = int(digits.group(1))
    return months if months > 0 else None


#: Au-delà, une date de notification n'est pas une date : `decp_augmente` porte
#: des lignes à 2048 (le module le notait déjà). Une échéance calculée sur une
#: date invraisemblable serait une invention DATÉE — la pire espèce, parce
#: qu'elle a l'air vérifiable.
_MAX_FUTURE_NOTIFICATION_DAYS = 31


def _ends_on(notified: object, months: int | None, *, now: datetime | None = None) -> str | None:
    """`datenotification + dureemois` → date de fin ISO, ou ``None``.

    Rend ``None`` dès qu'un des deux termes manque OU que la notification est
    dans le futur : mieux vaut « échéance inconnue » qu'une date fausse.
    """
    if months is None:
        return None
    start = _parse_date(notified)
    if start is None:
        return None
    reference = now or datetime.now(UTC)
    if start > reference + timedelta(days=_MAX_FUTURE_NOTIFICATION_DAYS):
        return None
    year = start.year + (start.month - 1 + months) // 12
    month = (start.month - 1 + months) % 12 + 1
    # Le 31 mars + 1 mois n'existe pas : on retombe sur le dernier jour du mois
    # d'arrivée plutôt que de déborder d'un jour sur le suivant.
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day).isoformat()


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


@provider_cache.cached_by(
    "marches:decp",
    # ⚠️ Le PACK entre dans la clé : deux vendeurs de domaines différents qui
    # cherchent la même entreprise ne doivent pas se partager un tri.
    lambda company_name, *, siren=None, pack=None, **_: (
        f"{(company_name or '').strip().lower()}:{(siren or '').strip()}:{pack or 'esn_it'}"
    ),
    ttl=provider_cache.TTL_SIGNALS,
)
async def awarded_it_contracts(
    company_name: str,
    *,
    siren: str | None = None,
    pack: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Recent IT public contracts AWARDED where the company appears (as buyer /
    in the objet / as titulaire), newest first, geo-localised by département.
    Each row names the WINNER (competitive intel). Empty on any error."""
    cleaned = (company_name or "").strip()
    if not cleaned:
        return []

    # ODSQL full-text phrase search across acheteur + objet + titulaire. Strip
    # quotes/backslashes so the name can't break out of the quoted literal.
    safe = cleaned.replace('"', " ").replace("\\", " ").strip()
    if not safe:
        return []
    # No server-side ``order_by`` on purpose: the DECP field names vary by
    # millésime and an unknown sort field would 400 the whole query (→ silent
    # no-op). We fetch a wide window and sort/filter client-side instead.
    params = {"where": f'"{safe}"', "limit": "100"}

    # #2604.2 — client de PROCESS, partagé par `get_shared_client` : jamais
    # fermé (ni ici, ni ailleurs), donc la passe par SIREN qui suit ne peut
    # plus hériter d'un client clos — c'était le bug trouvé en recette live
    # (voir `test_decp_keeps_its_own_client_open_until_both_passes_are_done`).
    http = client if client is not None else get_shared_client("decp", timeout=_TIMEOUT_S)
    try:
        # data.economie.gouv.fr est public et sans clé : le budget est par IP,
        # partagé par toute l'instance. Aucun bucket n'existait pour cet hôte.
        async with throttle("decp"):
            resp = await http.get(_BASE, params=params)
        if resp.status_code == 429:
            back_off_provider("decp", retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — a free source must never break research
        logger.warning("DECP awarded contracts failed for %r: %s", cleaned, describe_failure(exc))
        # Report the REAL cause: without it the run can only say "aucun
        # résultat", which reads identically to a company that genuinely has
        # nothing here — opposite facts, same message.
        # #3915.decp — `str(exc)` d'un timeout httpx est VIDE : jamais une raison
        # vide ; le code machine sépare l'attente de notre limiteur d'une panne.
        record_degradation(
            get_correlation_id(), source="decp", reason=describe_failure(exc), code=reason_for_exception(exc)
        )
        payload = None

    return await _rank_awards(http, payload, siren, pack=pack)


async def _rank_awards(
    http: httpx.AsyncClient, payload: object, siren: str | None, *, pack: str | None = None
) -> list[dict]:
    """Filtre, date et classe les marchés des DEUX passes (nom puis SIREN)."""
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
        notified = _pick_date(
            f,
            "dateNotification",
            "datenotification",
            "date_notification",
            "datePublicationDonnees",
            "datepublicationdonnees",
            "date_publication_donnees",
        )
        parsed = _parse_date(notified)
        # Lot 762 : plus de borne d'âge de stockage — le marché ancien est estampillé ``historical``.
        location, department = _location(f)
        months = _duration_months(f)
        item = {
            "title": _clean(_pick(f, "objet", "objetMarche", "objet_du_marche", "intitule"), 300),
            "buyer": _buyer(f),
            "winner": _winner(f),
            "amount": _pick(f, "montant", "montantMarche", "valeur", "montant_marche"),
            "location": location,
            "department": department,
            "notifiedDate": notified,
            # La durée BRUTE et l'échéance CALCULÉE voyagent ensemble : l'une est
            # le fait publié, l'autre la déduction, et l'écran doit pouvoir citer
            # la première quand la seconde manque.
            "durationMonths": months,
            "endsOn": _ends_on(notified, months, now=now),
            "cpv": ", ".join(cpvs[:3]) or None,
            "url": _pick(f, "url", "lien", "source", "url_avis"),
            **({"historical": True} if parsed is not None and parsed < cutoff else {}),
        }
        if not item["title"] and not item["buyer"] and not item["winner"]:
            continue
        scored.append((parsed or _min, item))

    # ── Le même acheteur, retrouvé par son SIREN sur le millésime VIVANT ──
    #
    # Trouvé en recette live du tome 2 : une analyse de FRANCE TELEVISIONS n'a
    # ramené aucun marché, alors que la commande publique en portait un de 36
    # mois notifié six jours plus tôt. La recherche ci-dessus interroge
    # `decp_augmente` PAR LE NOM, et ce millésime n'a presque plus de lignes
    # récentes ; le millésime vivant, lui, ne publie AUCUNE raison sociale —
    # seulement des SIRET. Aucun des deux ne suffit seul, et sans les deux le
    # fait de verrouillage du tome 1 ne se déclenche presque jamais.
    #
    # Sans SIREN résolu, on ne tente rien : chercher un acheteur par son nom
    # dans un jeu qui n'en porte pas rendrait n'importe quoi.
    scored.extend(await _awards_by_siren(http, siren, cutoff))

    # Sort most-recent first; unparseable (``_min``) sink to the end.
    scored.sort(key=lambda t: t[0], reverse=True)
    # Dédup : un même marché peut sortir des deux millésimes. La clé est l'objet
    # + la date, les seuls champs que les deux publient à coup sûr.
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for _dt, item in scored:
        key = ((item.get("title") or "").lower()[:80], str(item.get("notifiedDate") or ""))
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique[:6]


async def _awards_by_siren(
    http: httpx.AsyncClient, siren: str | None, cutoff: datetime
) -> list[tuple[datetime, dict]]:
    """Les marchés IT récents attribués par l'acheteur portant ce SIREN.

    Le millésime vivant n'identifie l'acheteur que par son SIRET (`acheteur_id`)
    et ne nomme pas le titulaire : son nom est résolu par le registre libre,
    jamais laissé en SIRET brut — un identifiant affiché comme une raison
    sociale est une donnée fausse, pas une donnée partielle.
    """
    clean = to_siren(siren) if siren else None
    if not clean:
        return []
    params = {
        "where": f"{_odsql_prefix('acheteur_id', clean)} and {_odsql_prefix(_LIST_CPV_FIELD, '72')}",
        "limit": "50",
        "order_by": f"{_LIST_DATE_FIELD} desc",
    }
    try:
        async with throttle("decp"):
            resp = await http.get(_LIST_BASE, params=params)
        if resp.status_code == 429:
            back_off_provider("decp", retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — une source libre ne casse jamais un run
        logger.warning("DECP awards by SIREN failed for %s: %s", clean, describe_failure(exc))
        return []

    rows: list[tuple[datetime, dict]] = []
    pending: set[str] = set()
    records = payload.get("results") if isinstance(payload, dict) else None
    for f in records or []:
        if not isinstance(f, dict):
            continue
        notified = _pick_date(f, _LIST_DATE_FIELD, "dateNotification", "date_notification")
        parsed = _parse_date(notified)
        if parsed is None:
            continue
        months = _duration_months(f)
        vendor_siren = _vendor_siren(f)
        if vendor_siren:
            pending.add(vendor_siren)
        rows.append(
            (
                parsed,
                {
                    "title": _clean(_pick(f, "objet", "objetMarche", "intitule"), 300),
                    "buyer": _buyer(f),
                    "winner": _winner(f),
                    "winnerSiren": vendor_siren,
                    "amount": _pick(f, "montant", "montantMarche", "valeur"),
                    "location": None,
                    "department": _dept_from_place_code(_pick(f, _LIST_PLACE_FIELD)),
                    "notifiedDate": notified,
                    "durationMonths": months,
                    "endsOn": _ends_on(notified, months),
                    "cpv": _pick(f, _LIST_CPV_FIELD, "codeCPV"),
                    "url": None,
                    **({"historical": True} if parsed < cutoff else {}),
                },
            )
        )

    if pending:
        try:
            resolved = await names_by_siren(pending)
        except Exception as exc:  # noqa: BLE001
            logger.warning("DECP vendor name resolution failed: %s", exc)
            resolved = {}
        for _dt, item in rows:
            got = item.pop("winnerSiren", None)
            if not item.get("winner") and got:
                item["winner"] = resolved.get(got)
    else:
        for _dt, item in rows:
            item.pop("winnerSiren", None)
    return rows


# ───────────────────────────────────────────────────────────────────────────
# #3921.10 — les marchés GAGNÉS par une ESN (rôle TITULAIRE)
#
# Décision Louis 16/10/2026 : `esn_directory.public_awards` compte ce que l'ESN a GAGNÉ ; l'acheteur
# reste un signal côté fiche compte, hors de cette colonne (donc aucun nom d'acheteur ici).
# Requête VÉRIFIÉE en direct le 16/10/2026 sur le millésime vivant (`decp-2022-marches-valides`) :
# `titulaire_id_1..3` (SIRET ou « CDL » quand vide), `codecpv`, `datenotification`, `dureemois`, `id`.
# ───────────────────────────────────────────────────────────────────────────

_WON_LIMIT = "100"


async def _won_uncached(siren: str, client: httpx.AsyncClient | None) -> list[dict]:
    http = client if client is not None else get_shared_client("decp", timeout=_TIMEOUT_S)
    titulaire = " or ".join(_odsql_prefix(f"titulaire_id_{n}", siren) for n in (1, 2, 3))
    cpv = " or ".join(_odsql_prefix(_LIST_CPV_FIELD, p) for p in _IT_CPV_PREFIXES)
    params = {
        "where": f"({titulaire}) and ({cpv})",  # lot 762 : aucune borne d'âge de stockage
        "limit": _WON_LIMIT,
        "order_by": f"{_LIST_DATE_FIELD} desc",
    }
    async with throttle("decp"):
        resp = await http.get(_LIST_BASE, params=params)
    if resp.status_code == 429:
        back_off_provider("decp", retry_after_header(resp))
    resp.raise_for_status()
    payload = resp.json()
    records = payload.get("results") if isinstance(payload, dict) else None
    now = datetime.now(UTC)
    out: list[dict] = []
    for f in records or []:
        if not isinstance(f, dict):
            continue
        # Le rôle est re-vérifié sur la ligne : un SIRET d'un autre SIREN n'est jamais compté.
        if siren not in {
            _siren_of(f.get(k)) for k in ("titulaire_id_1", "titulaire_id_2", "titulaire_id_3")
        }:
            continue
        uid = _clean(f.get("id"), 80)
        notified = _pick_date(f, _LIST_DATE_FIELD)
        parsed = _parse_date(notified)
        if not uid or parsed is None or parsed > now + timedelta(days=_MAX_FUTURE_NOTIFICATION_DAYS):
            continue
        months = _duration_months(f)
        out.append(
            {
                "ref": f"decp:{uid}",
                "date": parsed.date().isoformat(),
                "title": _clean(_pick(f, "objet", "objetMarche", "intitule"), 300),
                "durationMonths": months,
                "endsOn": _ends_on(notified, months, now=now),
            }
        )
    return out


async def awards_won_by_siren(siren: str, *, client: httpx.AsyncClient | None = None) -> list[dict]:
    """Les marchés IT récents (24 mois) dont ce SIREN est TITULAIRE, du plus récent au plus ancien.

    LÈVE sur toute panne : un vide qui cache une erreur écrirait « 0 marché gagné » là où la
    vérité est « on n'a pas pu lire » (non mesuré ≠ 0). Cache 7 j par SIREN."""
    s = to_siren(siren)
    if not s:
        return []
    return await provider_cache.cached_json(
        "decp_won", s, lambda: _won_uncached(s, client), ttl=provider_cache.TTL_SIGNALS
    )


# ───────────────────────────────────────────────────────────────────────────
# Prospection INVERSÉE — lister les ACHETEURS qui viennent d'attribuer (v2)
#
# Le marché ATTRIBUÉ est le signal le plus dense de Découvrir : il dit qu'il y
# avait un budget IT, et il NOMME le titulaire — donc le concurrent en place,
# donc l'angle rang-2. ADDITIF : `awarded_it_contracts` est inchangé.
# ───────────────────────────────────────────────────────────────────────────

SOURCE_NAME = "DECP"

# ⚠️ PAS le même dataset que `awarded_it_contracts` ci-dessus. Vérifié en live :
#   decp_augmente             max datenotification 2048-12-06 (aberrant), 51 lignes depuis 2025-02
#   decp-v3-marches-valides   max 2024-02-08,                              0 ligne
#   decp-2022-marches-valides max 2026-07-06,                        312 324 lignes  ← vivant
# `decp_augmente` reste la base du chemin mono-entreprise, qui dépend de ses
# champs ENRICHIS (acheteur_nom, titulaire_denominationSociale) absents ici ;
# la LISTE, elle, a besoin de données fraîches, donc de ce millésime.
_LIST_BASE = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/decp-2022-marches-valides/records"

# Schéma réel de decp-2022-marches-valides : TOUT en minuscules, aucun camelCase
# (`dateNotification` → HTTP 400 "Unknown field"). Ce dataset ne publie AUCUNE
# raison sociale : seulement des SIRET (`acheteur_id`, `titulaire_id_1`) — les
# noms sont résolus par le registre libre, jamais laissés en SIRET brut.
_LIST_DATE_FIELD = "datenotification"
_LIST_PLACE_FIELD = "lieuexecution_code"
_LIST_CPV_FIELD = "codecpv"


def _odsql_prefix(field: str, prefix: str) -> str:
    """Filtre « commence par » en ODSQL.

    ``startswith()`` et NON ``like 'x%'`` : ``%`` n'est pas un joker ODSQL (c'est
    ``*``), et un motif en ``%`` ne provoque AUCUNE erreur — il renvoie 0 ligne.
    C'est le pire mode d'échec possible ici : une source vivante passerait pour
    « aucun résultat » sans jamais apparaître dans ``degraded``. Mesuré :
    ``codecpv like '72%'`` → 0, ``startswith(codecpv,'72')`` → 13 653.
    """
    safe = "".join(ch for ch in str(prefix or "") if ch.isalnum())
    return f"startswith({field},'{safe}')"


def _cpv_prefixes_for(pack: str | None) -> tuple[str, ...]:
    # LUD.1 — les divisions CPV du pack ; sans pack, 48/72 à l'octet près.
    domain_filter = market_filter_for(pack)
    return domain_filter.cpv_prefixes if domain_filter is not None else tuple(_IT_CPV_PREFIXES)


def build_award_where(department: str | None, since_days: int, *, pack: str | None = None) -> str:
    """Clause ODSQL : fenêtre de notification + CPV IT + (optionnel) territoire.

    CPV 72 = services informatiques, 48 = progiciels/logiciels. Le filtre
    territorial porte sur le code commune/postal du lieu d'exécution, préfixé par
    le département ; il est réappliqué EXACTEMENT côté client (``startswith``
    seul laisserait passer 691xx pour un département « 69 » demandé… et surtout
    ne distingue pas 69 de 691 en outre-mer).
    """
    parts = [
        f"{_LIST_DATE_FIELD} >= date'{since_date(since_days)}'",
        "(" + " or ".join(_odsql_prefix(_LIST_CPV_FIELD, p) for p in _cpv_prefixes_for(pack)) + ")",
    ]
    dept = normalize_department(department)
    if dept:
        parts.append(_odsql_prefix(_LIST_PLACE_FIELD, dept))
    return " and ".join(parts)


def _siren_of(value: object) -> str | None:
    """SIREN depuis un identifiant DECP (SIRET 14 ou SIREN 9). None sinon —
    on ne complète JAMAIS un identifiant partiel."""
    return to_siren(value)


def _buyer_siren(f: dict) -> str | None:
    return _siren_of(_pick(f, "acheteur_id", "acheteurId", "acheteurid", "id_acheteur", "acheteur.id"))


def _vendor_siren(f: dict) -> str | None:
    # `titulaire_id_1` est la forme du millésime 2022 (un marché peut avoir
    # plusieurs titulaires : _1, _2, _3 — le mandataire est le premier).
    direct = _siren_of(
        _pick(f, "titulaire_id_1", "titulaire_id", "titulaireId", "titulaire.id", "titulaire_id_2", "titulaire_id_3")
    )
    if direct:
        return direct
    titulaires = f.get("titulaires")
    if isinstance(titulaires, (list, tuple)):
        for t in titulaires:
            node = t.get("titulaire") if isinstance(t, dict) and isinstance(t.get("titulaire"), dict) else t
            if isinstance(node, dict):
                got = _siren_of(node.get("id"))
                if got:
                    return got
    return None


def _dept_from_place_code(code: object) -> str | None:
    """Département depuis un code commune INSEE / code postal (5 caractères).

    Métropole = 2 caractères ('69123' → '69', '2A004' → '2A') ; DOM = 3 ('97411'
    → '974'). Prendre bêtement 3 caractères donnerait '691' — c'est ce qui rend
    le filtre client indispensable derrière un ``startswith`` serveur.
    """
    cleaned = "".join(ch for ch in str(code or "") if ch.isalnum()).upper()
    if not cleaned:
        return None
    return cleaned[:3] if cleaned[:2] in ("97", "98") else cleaned[:2]


async def list_award_buyers(
    department: str | None = None,
    since_days: int = 365,
    limit: int = 25,
    *,
    client: httpx.AsyncClient | None = None,
    pack: str | None = None,
    offset: int = 0,
    name_vendors: bool = True,
    page_stats: dict[str, int] | None = None,
) -> list[dict]:
    """Acheteurs publics ayant ATTRIBUÉ un marché IT récent sur le territoire.

    #4796 — ``offset`` : le décalage de la page lue (Opendatasoft) ; ``page_stats`` reçoit ``asked``/``raw``
    (voir ``france_travail.list_hiring_companies``) ; ``name_vendors=False`` saute la nomination des titulaires
    (un appel registre PAR SIRET, sur le bucket que partage la résolution) : les pages SUIVANTES de Découvrir
    ne la paient pas, le titulaire reste ``None`` — jamais un SIRET brut. Défauts : l'appel d'avant.

    Chaque ligne porte l'acheteur (``siren`` dérivé du SIRET publié, ``name``
    quand le millésime le donne) ET le ``vendor`` retenu — le concurrent en
    place — repris dans ``signal.detail``.

    Le millésime 2022 ne publie QUE des SIRET : les raisons sociales du titulaire
    sont résolues via le registre libre (:func:`names_by_siren`). Un titulaire
    non résolu reste ``None`` — jamais un SIRET brut affiché comme un nom. Le
    nom de l'acheteur, lui, est résolu en aval par le routeur (il connaît déjà
    son SIREN).

    Si la requête complète est refusée, on retente une fois en dégradé (sans le
    filtre territorial, réappliqué côté client). Les deux tentatives échouées
    lèvent :class:`SignalSourceUnavailable` — jamais de vide silencieux.
    """
    limit = max(1, min(int(limit or 1), 100))
    dept = normalize_department(department)
    fetch = min(100, max(limit * 4, 60))

    http = client if client is not None else get_shared_client("decp", timeout=_TIMEOUT_S)
    attempts = [build_award_where(dept, since_days, pack=pack)]
    if dept:
        attempts.append(build_award_where(None, since_days, pack=pack))
    payload: object = None
    last_exc: Exception | None = None
    for where in attempts:
        try:
            async with throttle("decp"):
                resp = await http.get(
                    _LIST_BASE,
                    params={
                        "where": where,
                        "order_by": f"{_LIST_DATE_FIELD} desc",
                        "limit": str(fetch),
                        **({"offset": str(int(offset))} if offset > 0 else {}),
                    },
                )
            if resp.status_code == 429:
                back_off_provider("decp", retry_after_header(resp))
            resp.raise_for_status()
            payload = resp.json()
            last_exc = None
            break
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            logger.warning("DECP award listing failed (where=%r): %s", where, describe_failure(exc))
    if last_exc is not None:
        # #2469 — une clé machine, jamais une phrase : le texte visible vit dans le
        # catalogue i18n du web. Le détail de l'exception reste au journal, ci-dessus.
        raise SignalSourceUnavailable(SOURCE_NAME, reason_for_exception(last_exc)) from last_exc

    records = payload.get("results") or payload.get("records") if isinstance(payload, dict) else None
    if page_stats is not None:
        page_stats.update(asked=fetch, raw=len(records or []))
    now = datetime.now(UTC)
    cutoff = now - timedelta(days=max(1, int(since_days or 1)))

    rows: list[tuple[datetime, dict]] = []
    for rec in records or []:
        f = _fields(rec)
        if not f:
            continue
        cpvs = _cpv_codes(f)
        # LUD.1 — le pack de l'espace ; sans pack, le tri IT historique.
        if not _is_it(f, cpvs, pack=pack):
            continue
        buyer_siren = _buyer_siren(f)
        buyer = _buyer(f)  # absent du millésime 2022 — le SIREN suffit à identifier
        if not buyer and not buyer_siren:
            continue
        parsed = _parse_date(
            _pick(f, _LIST_DATE_FIELD, "dateNotification", "date_notification",
                  "datepublicationdonnees", "datePublicationDonnees")
        )
        if parsed is None or parsed < cutoff:
            continue
        row_dept = _dept_from_place_code(_pick(f, _LIST_PLACE_FIELD, "lieuExecution_code", "lieuExecution.code"))
        if row_dept is None:
            _label, legacy_dept = _location(f)
            row_dept = normalize_department(legacy_dept)
        if dept and row_dept != dept:
            continue
        rows.append(
            (
                parsed,
                {
                    "name": buyer or "",
                    "siren": buyer_siren,
                    "department": row_dept,
                    "city": None,
                    "vendor": _winner(f),  # nom direct si le millésime le porte
                    "vendorSiren": _vendor_siren(f),
                    "objet": _clean(_pick(f, "objet", "objetMarche", "objet_du_marche", "intitule"), 180),
                    "amount": _pick(f, "montant", "montantMarche", "valeur", "montant_marche"),
                    # Même donnée que sur le chemin mono-entreprise : c'est elle
                    # qui dit quand la porte se rouvre, et Découvrir en a autant
                    # besoin qu'un dossier.
                    "durationMonths": _duration_months(f),
                    "endsOn": _ends_on(
                        _pick(f, _LIST_DATE_FIELD, "dateNotification", "date_notification"),
                        _duration_months(f),
                        now=now,
                    ),
                    "url": _pick(f, "url", "lien", "source", "url_avis"),
                },
            )
        )

    rows.sort(key=lambda t: t[0], reverse=True)
    kept = [(dt, row) for dt, row in rows[:limit]]

    # Nommer les titulaires (= les concurrents) — une passe, uniquement pour ceux
    # dont on n'a qu'un SIRET. Échec registre → le nom reste absent, JAMAIS un
    # SIRET brut présenté comme une raison sociale.
    unnamed = (
        {row["vendorSiren"] for _dt, row in kept if row["vendorSiren"] and not row["vendor"]} if name_vendors else set()
    )
    if unnamed:
        try:
            resolved = await names_by_siren(unnamed)
        except Exception as exc:  # noqa: BLE001 — le lookup ne casse jamais la liste
            logger.warning("DECP vendor name resolution failed: %s", exc)
            resolved = {}
        for _dt, row in kept:
            if not row["vendor"] and row["vendorSiren"]:
                row["vendor"] = resolved.get(row["vendorSiren"])

    out: list[dict] = []
    for dt, row in kept:
        objet = row.pop("objet", None)
        amount = row.pop("amount", None)
        url = row.pop("url", None)
        ends_on = row.get("endsOn")
        detail = " · ".join(
            p for p in (
                f"Titulaire : {row['vendor']}" if row["vendor"] else "",
                f"Montant {amount}" if amount else "",
                # L'échéance dit QUAND la porte se rouvre. Absente, on ne dit
                # rien plutôt que « durée inconnue » : le détail d'un signal se
                # lit d'un coup d'œil, une non-information l'encombre.
                f"En cours jusqu'au {ends_on}" if ends_on else "",
            ) if p
        )
        row["signal"] = {
            "type": "award",
            "label": f"Marché IT attribué — {objet}" if objet else "Marché IT attribué",
            "date": dt.date().isoformat(),
            "url": url,
            "detail": detail or None,
        }
        out.append(row)
    return out


# ───────────────────────────────────────────────────────────────────────────
# #3915.decp — le COLLECTEUR continu (décision Louis 16/10/2026)
#
# La veille quotidienne de l'API lit, pour chaque SIREN suivi, les marchés IT
# attribués où ce SIREN est l'ACHETEUR ou un TITULAIRE — sur le millésime vivant
# (`decp-2022-marches-valides`, gratuit, sans clé). JAMAIS par le nom : la
# recherche plein texte de `awarded_it_contracts` rattache n'importe quel marché
# qui CITE le nom (un homonyme, une filiale, une rue), ce qui est tolérable dans
# un prompt d'analyse mais pas dans une table partagée entre espaces.
# ───────────────────────────────────────────────────────────────────────────

#: Les trois titulaires que publie le millésime (le mandataire est le premier).
_TITULAIRE_SLOTS = (1, 2, 3)


def describe_failure(exc: BaseException) -> str:
    """Le message d'une panne, JAMAIS vide.

    #3915.decp — un ``httpx.ReadTimeout`` a un ``str()`` VIDE : le journal
    écrivait « DECP awarded contracts failed for 'X': » et la dégradation une
    raison vide, indiscernable d'un « rien à dire ». Le type de l'exception est
    le seul fait sûr qui reste ; on le dit.
    """
    text = str(exc).strip()
    return text or f"{type(exc).__name__} (aucun détail renvoyé)"


def _executed_in_france(f: dict) -> bool:
    """Un lieu d'exécution donné comme PAYS autre que la France sort ; tous les
    autres types de code (commune, postal, département, région…) sont français."""
    kind = _deaccent(str(f.get("lieuexecution_typecode") or "")).lower()
    if "pays" not in kind:
        return True
    return str(f.get("lieuexecution_code") or "").strip().upper() in ("FR", "FRA")


def _exact_siret_siren(value: object) -> str | None:
    """SIREN d'un SIRET publié EN ENTIER (14 chiffres, rien d'autre). Un
    identifiant tronqué, préfixé (TVA « FR40… ») ou rallongé n'est pas un SIRET."""
    raw = str(value or "").strip()
    return raw[:9] if re.fullmatch(r"\d{14}", raw) else None


def _titulaire_sirens(f: dict) -> list[str]:
    """Les SIREN des titulaires identifiés par SIRET — un identifiant TVA, HORS-UE
    ou RIDET n'est jamais converti en SIREN (ses chiffres ne sont pas un SIREN)."""
    out: list[str] = []
    for slot in _TITULAIRE_SLOTS:
        kind = str(f.get(f"titulaire_typeidentifiant_{slot}") or "").strip().upper()
        if kind and kind != "SIRET":
            continue
        got = _exact_siret_siren(f.get(f"titulaire_id_{slot}"))
        if got:
            out.append(got)
    return out


async def awards_for_siren(
    siren: str,
    *,
    since_days: int = _MAX_AGE_DAYS,
    client: httpx.AsyncClient | None = None,
    pack: str | None = None,
) -> list[dict]:
    """Les marchés IT attribués récents où CE SIREN est acheteur ou titulaire.

    Chaque ligne porte son ``role`` (``buyer`` / ``titulaire``) et la partie
    d'en face nommée par le registre libre quand il la connaît (jamais un SIRET
    brut affiché comme un nom). Un marché exécuté hors de France, non daté ou
    plus vieux que la fenêtre n'est pas rendu.

    Lève :class:`SignalSourceUnavailable` (raison machine, jamais vide) quand
    la source ne répond pas : un vide qui cache une panne n'est pas un relevé.
    ``RateLimitTimeout`` (notre propre limiteur) se propage TEL QUEL — c'est
    une attente, pas une panne, et l'appelant la dit comme telle.
    """
    digits = "".join(ch for ch in str(siren or "") if ch.isdigit())
    if len(digits) not in (9, 14):
        return []
    clean = digits[:9]
    who = " or ".join(
        [_odsql_prefix("acheteur_id", clean)]
        + [_odsql_prefix(f"titulaire_id_{slot}", clean) for slot in _TITULAIRE_SLOTS]
    )
    it = " or ".join(_odsql_prefix(_LIST_CPV_FIELD, p) for p in _cpv_prefixes_for(pack))
    params = {
        "where": f"({who}) and ({it}) and {_LIST_DATE_FIELD} >= date'{since_date(since_days)}'",
        "order_by": f"{_LIST_DATE_FIELD} desc",
        "limit": "100",
    }
    http = client if client is not None else get_shared_client("decp", timeout=_TIMEOUT_S)
    try:
        async with throttle("decp"):
            resp = await http.get(_LIST_BASE, params=params)
        if resp.status_code == 429:
            back_off_provider("decp", retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except SignalSourceUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001
        from app.services.distributed_rate_limiter import RateLimitTimeout

        if isinstance(exc, RateLimitTimeout):
            raise
        logger.warning("DECP awards for SIREN %s failed: %s", clean, describe_failure(exc))
        raise SignalSourceUnavailable(SOURCE_NAME, reason_for_exception(exc)) from exc

    cutoff = datetime.now(UTC) - timedelta(days=max(1, int(since_days or 1)))
    rows: list[tuple[datetime, dict]] = []
    to_name: set[str] = set()
    records = payload.get("results") if isinstance(payload, dict) else None
    for f in records or []:
        if not isinstance(f, dict) or not _executed_in_france(f):
            continue
        if not _is_it(f, _cpv_codes(f), pack=pack):  # LUD.1
            continue
        buyer_siren = _exact_siret_siren(f.get("acheteur_id"))
        titulaires = _titulaire_sirens(f)
        if buyer_siren == clean:
            role = "buyer"
        elif clean in titulaires:
            role = "titulaire"
        else:
            continue  # le préfixe serveur a ramené un voisin : jamais attribué
        notified = _pick_date(f, _LIST_DATE_FIELD)
        parsed = _parse_date(notified)
        if parsed is None or parsed < cutoff or parsed > datetime.now(UTC) + timedelta(days=1):
            continue
        winner_siren = titulaires[0] if titulaires else None
        if role == "buyer" and winner_siren:
            to_name.add(winner_siren)
        if role == "titulaire" and buyer_siren:
            to_name.add(buyer_siren)
        months = _duration_months(f)
        rows.append(
            (
                parsed,
                {
                    "title": _clean(_pick(f, "objet", "objetMarche", "intitule"), 300),
                    "role": role,
                    "buyerSiren": buyer_siren,
                    "winnerSiren": winner_siren,
                    "buyer": None,
                    "winner": None,
                    "amount": _pick(f, "montant"),
                    "department": _dept_from_place_code(_pick(f, _LIST_PLACE_FIELD)),
                    "notifiedDate": str(notified)[:10],
                    "durationMonths": months,
                    "endsOn": _ends_on(notified, months),
                    "cpv": _pick(f, _LIST_CPV_FIELD),
                    "url": None,
                },
            )
        )

    names: dict[str, str] = {}
    if to_name:
        try:
            names = await names_by_siren(to_name)
        except Exception as exc:  # noqa: BLE001 — un nom manquant n'efface pas un fait
            logger.warning("DECP counterpart name resolution failed: %s", describe_failure(exc))
    for _dt, item in rows:
        if item["role"] == "buyer":
            item["winner"] = names.get(item["winnerSiren"] or "")
        else:
            item["buyer"] = names.get(item["buyerSiren"] or "")
    rows.sort(key=lambda t: t[0], reverse=True)
    return [item for _dt, item in rows]
