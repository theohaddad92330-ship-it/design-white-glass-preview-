"""INSEE Sirene API — the authoritative French company registry (free, official).

Pappers already resells per-company INSEE/INPI data, so this is NOT a duplicate
enrichment. Its two unique values for BellumAI:

  1. **Multi-entity name search** — list ALL ``unités légales`` matching a name.
     "Crédit Mutuel" → Arkéa, Alliance Fédérale, the federations… AND
     **Euro-Information** (its own SIREN). Lets us disambiguate a confederation
     and surface the IT-bearing branch instead of locking onto the first Pappers
     hit (Arkéa).
  2. **The NAF/APE code** — division **62** (programmation / conseil
     informatique) and **63.11Z** (traitement de données, hébergement)
     deterministically mark an IT entity (Euro-Information, GICM…). Hard signal,
     not name-guessing.

Auth: the INSEE portal (portail-api.insee.fr) issues an API key sent as the
``X-INSEE-Api-Key-Integration`` header. Base URL, header name and key are all
env-configurable so a scheme change needs no code edit. **No key → every public
function is a graceful no-op** (``[]`` / ``None``); the pipeline runs exactly as
before, so this is safe to ship before the key is provisioned.
"""

from __future__ import annotations

import logging
import os
import re
import unicodedata
from dataclasses import dataclass

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

# Env-configurable so the current INSEE scheme (or a future one) can be set
# without touching code. Defaults target the Sirene 3.11 API on the new portal.
_DEFAULT_BASE = "https://api.insee.fr/api-sirene/3.11"
_TIMEOUT_S = 20.0

# IT-services NAF/APE prefixes. Codes look like "6201Z", "6202A", "6311Z".
#   62.xx → programmation, conseil et autres activités informatiques
#   63.11Z → traitement de données, hébergement
_IT_NAF_PREFIXES = ("62", "6311")

# SIREN are batched into one ``siren:(a OR b OR …)`` query to keep the call count
# (and INSEE quota use) low. 30 keeps the q string well under any length limit.
_SIREN_BATCH = 30

#: Tranches d'effectif INSEE — table OFFICIELLE, recopiée telle quelle. Le code
#: ("12") n'est pas un effectif : c'est l'intervalle « 20 à 49 salariés ». Les
#: écrire l'un pour l'autre affiche un chiffre faux, et crédible.
#: `NN` (non renseigné) n'y figure pas : c'est une réponse, pas un intervalle.
_HEADCOUNT_BAND_LABELS: dict[str, str] = {
    "00": "0 salarié",
    "01": "1 à 2 salariés",
    "02": "3 à 5 salariés",
    "03": "6 à 9 salariés",
    "11": "10 à 19 salariés",
    "12": "20 à 49 salariés",
    "21": "50 à 99 salariés",
    "22": "100 à 199 salariés",
    "31": "200 à 249 salariés",
    "32": "250 à 499 salariés",
    "41": "500 à 999 salariés",
    "42": "1 000 à 1 999 salariés",
    "51": "2 000 à 4 999 salariés",
    "52": "5 000 à 9 999 salariés",
    "53": "10 000 salariés et plus",
}


def headcount_band_label(code: object) -> str:
    """Code de tranche INSEE → libellé lisible. `""` quand le code est inconnu.

    Rendre `""` plutôt que le code : un effectif absent est une information,
    « 12 » affiché à la place de « 20 à 49 salariés » est une erreur.
    """
    return _HEADCOUNT_BAND_LABELS.get(str(code or "").strip(), "")


def insee_api_key() -> str:
    return os.environ.get("INSEE_API_KEY", "")


def _base_url() -> str:
    return os.environ.get("INSEE_API_BASE", _DEFAULT_BASE).rstrip("/")


def _auth_headers() -> dict[str, str]:
    header = os.environ.get("INSEE_API_KEY_HEADER", "X-INSEE-Api-Key-Integration")
    return {header: insee_api_key(), "Accept": "application/json"}


def is_it_naf(code: str | None) -> bool:
    """True when a NAF/APE code marks an IT-services activity (div. 62 or 63.11)."""
    c = (code or "").replace(".", "").replace(" ", "").upper()
    return bool(c) and any(c.startswith(p) for p in _IT_NAF_PREFIXES)


@dataclass(frozen=True)
class InseeUniteLegale:
    """A normalized INSEE ``unité légale`` (one legal company)."""

    siren: str
    denomination: str
    naf_code: str | None
    naf_is_it: bool
    headcount_range: str | None
    legal_category: str | None
    is_active: bool
    #: #2284.33/.58 — les dénominations ANTÉRIEURES, telles que le registre les
    #: a portées (``periodesUniteLegale[1:]``), distinctes de la dénomination
    #: ACTUELLE et entre elles, les plus récentes d'abord. ``()`` sans
    #: changement de nom connu — jamais devinée sur une correction CRM.
    former_names: tuple[str, ...] = ()


def _parse_unite(unite: object) -> InseeUniteLegale | None:
    """Normalize a Sirene ``uniteLegale`` node. The time-varying fields
    (denomination, NAF, état) live in ``periodesUniteLegale[0]`` (most recent)."""
    if not isinstance(unite, dict):
        return None
    siren = str(unite.get("siren") or "").strip()
    if not siren:
        return None
    periods = unite.get("periodesUniteLegale")
    current = periods[0] if isinstance(periods, list) and periods and isinstance(periods[0], dict) else {}

    denomination = (
        current.get("denominationUniteLegale")
        or unite.get("denominationUniteLegale")
        # personne physique fallback: nom + prénom
        or " ".join(
            x for x in (current.get("prenom1UniteLegale"), current.get("nomUniteLegale")) if x
        ).strip()
        or ""
    )
    naf = current.get("activitePrincipaleUniteLegale") or unite.get("activitePrincipaleUniteLegale")
    etat = current.get("etatAdministratifUniteLegale") or unite.get("etatAdministratifUniteLegale")
    # #2284.17 — la catégorie juridique est HISTORISÉE comme la dénomination, le
    # NAF et l'état (une SARL qui devient SAS change de catégorie) : même repli
    # ``current`` puis racine que les trois champs ci-dessus, jamais la racine
    # seule (silencieusement vide sur tout payload qui la porte sous période).
    legal_category = current.get("categorieJuridiqueUniteLegale") or unite.get("categorieJuridiqueUniteLegale")
    current_name = str(denomination).strip()
    # #2284.33/.58 — les PÉRIODES SUIVANTES (``periods[1:]``, plus anciennes en
    # premier) portent les dénominations antérieures du MÊME SIREN. Distinctes
    # entre elles et de la dénomination actuelle, ordre le plus récent d'abord
    # (l'ordre naturel de ``periodesUniteLegale``) — jamais une correction CRM.
    former_names: list[str] = []
    for period in (periods[1:] if isinstance(periods, list) else [])[:]:
        if not isinstance(period, dict):
            continue
        name = str(period.get("denominationUniteLegale") or "").strip()
        if name and name != current_name and name not in former_names:
            former_names.append(name)
    return InseeUniteLegale(
        siren=siren,
        denomination=current_name,
        naf_code=naf,
        naf_is_it=is_it_naf(naf),
        headcount_range=unite.get("trancheEffectifsUniteLegale"),
        legal_category=legal_category,
        is_active=(etat or "A") == "A",
        former_names=tuple(former_names),
    )


async def search_unites_legales(
    name: str,
    *,
    limit: int = 20,
    client: httpx.AsyncClient | None = None,
) -> list[InseeUniteLegale]:
    """Search active ``unités légales`` by denomination. Returns [] when no key
    is configured or the name is empty — never raises on a registry hiccup."""
    key = insee_api_key()
    cleaned = (name or "").strip()
    if not key or not cleaned:
        return []

    # Sirene query: the denomination is a HISTORIZED field, so it must be wrapped
    # in ``periode(...)`` — a bare ``denominationUniteLegale:X`` is a 400 syntax
    # error. Quote the phrase so a multi-word name isn't split into an OR.
    safe = cleaned.replace('"', " ").strip()
    params = {"q": f'periode(denominationUniteLegale:"{safe}")', "nombre": str(max(1, min(limit, 100)))}

    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=_TIMEOUT_S)
    try:
        async with throttle("insee"):
            resp = await http.get(f"{_base_url()}/siren", params=params, headers=_auth_headers())
        if resp.status_code == 404:
            # Sirene returns 404 for "no result" — a normal empty, not an error.
            # Deliberately NOT a degradation: recording one here would be the
            # mirror of the bug we are fixing (excusing a real absence with an
            # imaginary outage).
            return []
        if resp.status_code == 429:
            # Le plafond Sirene est bas (30/min) — le jeton acquis ne dit rien
            # du débit réel qu'il accepte. Voir la note sur etablissements_by_siren.
            back_off_provider("insee", retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — registry must never break research
        logger.warning("INSEE Sirene search failed for %r: %s", cleaned, exc)
        record_degradation(get_correlation_id(), source="insee", reason=str(exc))
        return []
    finally:
        if owns_client:
            await http.aclose()

    units = payload.get("unitesLegales") if isinstance(payload, dict) else None
    if not isinstance(units, list):
        return []
    parsed = [_parse_unite(u) for u in units]
    return [u for u in parsed if u is not None]


async def find_it_entities(name: str, *, client: httpx.AsyncClient | None = None) -> list[InseeUniteLegale]:
    """The IT-bearing ``unités légales`` (NAF 62 / 63.11) matching ``name`` — the
    ESN's prime targets inside a group/confederation (Crédit Mutuel →
    Euro-Information). Active entities only. Empty without a key."""
    candidates = await search_unites_legales(name, client=client)
    return [u for u in candidates if u.naf_is_it and u.is_active]


async def unites_legales_by_sirens(
    sirens: object, *, client: httpx.AsyncClient | None = None
) -> dict[str, InseeUniteLegale]:
    """Map ``{siren: InseeUniteLegale}`` for the given SIREN via batched Sirene
    lookups — the SHARED primitive behind ``naf_by_sirens`` (NAF/APE only) and
    ``legal_category_by_siren`` (#2284.17 : catégorie juridique INSEE). Empty
    without a key, and a registry hiccup on one batch is logged and skipped
    (never raises)."""
    key = insee_api_key()
    uniq = list(dict.fromkeys(s for s in (str(x).strip() for x in (sirens or [])) if s))
    if not key or not uniq:
        return {}

    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=_TIMEOUT_S)
    out: dict[str, InseeUniteLegale] = {}
    try:
        for i in range(0, len(uniq), _SIREN_BATCH):
            batch = uniq[i : i + _SIREN_BATCH]
            params = {"q": "siren:(" + " OR ".join(batch) + ")", "nombre": str(len(batch))}
            try:
                async with throttle("insee"):
                    resp = await http.get(
                        f"{_base_url()}/siren", params=params, headers=_auth_headers()
                    )
                if resp.status_code == 404:
                    # Aucun des SIREN du lot n'est connu — vraie absence.
                    continue
                if resp.status_code == 429:
                    back_off_provider("insee", retry_after_header(resp))
                resp.raise_for_status()
                payload = resp.json()
            except Exception as exc:  # noqa: BLE001 — one bad batch must not sink the rest
                logger.warning("INSEE unites-legales batch failed (%d sirens): %s", len(batch), exc)
                # Le ``continue`` seul était muet, et ce silence coûte cher : le
                # NAF est ce qui pose ``isItEntity``, le drapeau qui décide en
                # aval si une filiale est la cible n°1 de l'ESN ou du bruit. Un
                # lot perdu dégradait la cartographie sans laisser de trace —
                # « cette filiale n'est pas une entité IT » et « on n'a pas pu
                # demander » devenaient le même résultat.
                record_degradation(
                    get_correlation_id(),
                    source="insee",
                    reason=f"lot unités légales de {len(batch)} SIREN perdu: {exc}",
                )
                continue
            units = payload.get("unitesLegales") if isinstance(payload, dict) else None
            for u in units or []:
                parsed = _parse_unite(u)
                if parsed:
                    out[parsed.siren] = parsed
    finally:
        if owns_client:
            await http.aclose()
    return out


async def naf_by_sirens(sirens: object, *, client: httpx.AsyncClient | None = None) -> dict[str, str]:
    """Map ``{siren: naf_code}`` for the given SIREN via batched Sirene lookups.
    The authoritative NAF/APE for each entity — empty without a key, and a
    registry hiccup on one batch is logged and skipped (never raises)."""
    units = await unites_legales_by_sirens(sirens, client=client)
    return {siren: unit.naf_code for siren, unit in units.items() if unit.naf_code}


async def unite_legale_by_siren(siren: str | None, *, client: httpx.AsyncClient | None = None) -> InseeUniteLegale | None:
    """L'unité légale COMPLÈTE (catégorie juridique, dénominations antérieures…)
    d'UN SIREN déjà résolu — la primitive commune derrière
    ``legal_category_by_siren`` et le rattachement ``former_legal_names``
    (#2284.17/.33/.58), un SEUL aller-retour Sirene pour les deux. ``None`` sans
    clé, sans SIREN, ou registre muet sur ce SIREN."""
    clean = (siren or "").strip()
    if not clean:
        return None
    units = await unites_legales_by_sirens([clean], client=client)
    return units.get(clean)


async def legal_category_by_siren(siren: str | None, *, client: httpx.AsyncClient | None = None) -> str | None:
    """#2284.17 — la catégorie juridique INSEE (le CODE numérique, ex. ``5710``
    pour une SAS, ``7210`` pour une commune) de l'entité déjà résolue, via le
    MÊME registre officiel que ``naf_by_sirens``. Jamais devinée : ``None`` sans
    clé, sans SIREN, ou quand le registre ne connaît pas ce SIREN — un repli qui
    reste ``legal_entity`` (``entity_resolution._kind_of``), jamais un type
    d'entité affirmé sur un silence."""
    unit = await unite_legale_by_siren(siren, client=client)
    return unit.legal_category if unit else None


async def enrich_entities_naf(entities: object, *, client: httpx.AsyncClient | None = None) -> int:
    """Stamp each entity (that carries a SIREN) with its registry ``nafCode`` and,
    when that NAF is IT-services (div. 62 / 63.11), set ``isItEntity=True`` — the
    authoritative signal, catching IT subsidiaries with non-obvious names. Only
    UPGRADES to IT (never demotes a name-based flag). Returns the count newly
    flagged. Mutates the dicts in place; a no-op without a key."""
    targets = [e for e in (entities or []) if isinstance(e, dict) and str(e.get("siren") or "").strip()]
    if not targets:
        return 0
    units = await unites_legales_by_sirens([e.get("siren") for e in targets], client=client)
    flagged = 0
    for e in targets:
        unit = units.get(str(e.get("siren") or "").strip())
        if unit is None:
            continue
        # #4294.7 — « secteur public » relié à une SOURCE : la catégorie juridique (7xxx) que le même aller-retour
        # Sirene porte déjà. Un hôpital public (NAF 8610Z) n'est pas en division 84 mais EST une personne publique ;
        # le cadrage d'analyse (`entityIsPublicSector`, API) la lit avant le NAF. Registre muet : clé ABSENTE.
        if unit.legal_category:
            e["legalCategory"] = unit.legal_category
        naf = unit.naf_code
        if not naf:
            continue
        e["nafCode"] = naf
        if is_it_naf(naf) and not e.get("isItEntity"):
            e["isItEntity"] = True
            flagged += 1
    return flagged


# ── Confederation → IT entity seed ──────────────────────────────────────────
#
# Verified live: neither an INSEE name search nor Pappers' relevance ranking can
# surface a federated mutual's IT arm. "Crédit Mutuel" returns 3000+ local caisses
# (INSEE) and ranks Arkéa #1 (Pappers) — a branch that does NOT own the prominent
# IT entity, and Euro-Information isn't *named* "Crédit Mutuel" (its parent is
# BFCM / Alliance Fédérale). So for these well-known groups we seed the IT arm's
# NAME and let INSEE resolve + verify it by NAF (62 / 63.11) — curated, but never
# blind: a wrong/stale seed simply yields no IT-NAF match and injects nothing.
_GROUP_IT_ENTITY_NAMES: dict[str, str] = {
    "credit mutuel": "Euro-Information",
    # Extend with other federated FR groups as needed, e.g.:
    # "credit agricole": "Crédit Agricole Technologies et Services",
    # "bpce": "BPCE Infogérance et Technologies",
}


def _normalize(value: str | None) -> str:
    """Lowercase, strip accents, collapse whitespace — for group-name matching."""
    text = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    return " ".join(text.lower().split())


@provider_cache.cached_by("insee:group_it", lambda company_name, **_: (company_name or "").strip().lower(), ttl=provider_cache.TTL_FIRMO)
async def group_it_entities(company_name: str, *, client: httpx.AsyncClient | None = None) -> list[dict]:
    """For a known federated group (Crédit Mutuel…), return its IT/digital arm as
    cartography entities — resolved + verified via INSEE (NAF 62/63.11). Empty for
    an unknown group or without a key. Lets the prominent IT entity surface even
    when the resolved SIREN anchored on a branch that doesn't own it."""
    norm = _normalize(company_name)
    for key, it_name in _GROUP_IT_ENTITY_NAMES.items():
        if key in norm:
            units = await find_it_entities(it_name, client=client)
            return [to_entity_dict(u) for u in units]
    return []


@dataclass(frozen=True)
class InseeEtablissement:
    """A normalized INSEE ``établissement`` (one physical site of a company)."""

    siret: str
    city: str
    postal_code: str
    is_headquarters: bool
    headcount_range: str
    is_active: bool
    # #2995/SRC8 — la date à laquelle la période COURANTE a commencé. Pour un
    # établissement fermé (``is_active is False``), c'est la date à laquelle
    # Sirene a enregistré la fermeture — pas une date « estimée », le début de
    # la période que le registre porte réellement. ``None`` sur un
    # établissement actif : ce champ ne répond qu'à « depuis quand fermé ? ».
    closure_date: str | None
    # #3921 — le MÊME ``dateDebut`` que ``closure_date``, mais lu sur TOUTE
    # période (active ou non) : la date à laquelle Sirene a enregistré le
    # début de l'état courant. Sur un établissement actif, c'est la seule date
    # d'ouverture que le registre publie — jamais « aujourd'hui », qui serait
    # la date où NOUS avons regardé, pas celle où le site a ouvert.
    period_start_date: str | None = None


def _parse_etablissement(etab: object) -> InseeEtablissement | None:
    if not isinstance(etab, dict):
        return None
    siret = str(etab.get("siret") or "").strip()
    if not siret:
        return None
    adr = etab.get("adresseEtablissement") if isinstance(etab.get("adresseEtablissement"), dict) else {}
    periods = etab.get("periodesEtablissement")
    current = periods[0] if isinstance(periods, list) and periods and isinstance(periods[0], dict) else {}
    etat = current.get("etatAdministratifEtablissement")
    is_active = (etat or "A") == "A"
    return InseeEtablissement(
        siret=siret,
        city=str(adr.get("libelleCommuneEtablissement") or "").strip(),
        postal_code=str(adr.get("codePostalEtablissement") or "").strip(),
        is_headquarters=bool(etab.get("etablissementSiege")),
        headcount_range=str(etab.get("trancheEffectifsEtablissement") or "").strip(),
        is_active=is_active,
        closure_date=(str(current.get("dateDebut")).strip() or None) if not is_active and current.get("dateDebut") else None,
        period_start_date=(str(current.get("dateDebut")).strip() or None) if current.get("dateDebut") else None,
    )


async def closed_establishments(
    siren: str, *, client: httpx.AsyncClient | None = None
) -> list[InseeEtablissement]:
    """Les établissements FERMÉS d'un SIREN — #2995/SRC8, « registre légal
    historique ». Même appel que :func:`etablissements_by_siren` (Sirene rend
    déjà les sites fermés, ``sites_for_siren`` les filtrait pour l'onglet
    actif) : aucun coût réseau de plus, un filtre en plus. Vide sans clé."""
    etabs = await etablissements_by_siren(siren, client=client)
    return [e for e in etabs if not e.is_active]


async def etablissements_by_siren(
    siren: str,
    *,
    limit: int = 100,
    client: httpx.AsyncClient | None = None,
) -> list[InseeEtablissement]:
    """All établissements (physical sites) of a SIREN. Empty without a key; a
    registry hiccup degrades to empty, never raises."""
    return await etablissements_reading(siren, limit=limit, client=client) or []


async def etablissements_reading(
    siren: str,
    *,
    limit: int = 100,
    client: httpx.AsyncClient | None = None,
) -> list[InseeEtablissement] | None:
    """Comme :func:`etablissements_by_siren`, mais une PANNE rend ``None`` —
    jamais ``[]``. #3921.a : le relevé quotidien de la veille est comparé au
    relevé d'hier ; une panne stockée comme « aucun établissement » ferait
    rater toute ouverture survenue pendant le trou. Sans clé : ``[]``
    (l'appelant décide du no-op en lisant :func:`insee_api_key`)."""
    key = insee_api_key()
    s = str(siren or "").strip()
    if not key or not s:
        return []

    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=_TIMEOUT_S)
    try:
        async with throttle("insee"):
            resp = await http.get(
                f"{_base_url()}/siret",
                params={"q": f"siren:{s}", "nombre": str(max(1, min(limit, 1000)))},
                headers=_auth_headers(),
            )
        if resp.status_code == 404:
            # Aucun établissement pour ce SIREN — vraie absence, pas une panne.
            return []
        if resp.status_code == 429:
            back_off_provider("insee", retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — registry must never break research
        logger.warning("INSEE établissements lookup failed for %r: %s", s, exc)
        # Ce résultat alimente ``sitesFrance``, une liste AFFICHÉE dans le
        # dossier. Un 429 (le plafond Sirene est bas : 30/min) rendait le même
        # ``[]`` que « cette société n'a qu'un seul site » — le dossier
        # affirmait alors une implantation géographique fausse à partir d'une
        # panne. La liste reste vide (on n'invente aucun site), mais elle le dit.
        record_degradation(get_correlation_id(), source="insee", reason=str(exc))
        return None
    finally:
        if owns_client:
            await http.aclose()

    etabs = payload.get("etablissements") if isinstance(payload, dict) else None
    parsed = [_parse_etablissement(e) for e in etabs or []]
    return [e for e in parsed if e is not None]


@provider_cache.cached_by(
    "insee:sites", lambda siren, *, max_sites=20, **_: f"{''.join(c for c in str(siren or '') if c.isdigit())}:{max_sites}", ttl=provider_cache.TTL_FIRMO
)
async def sites_for_siren(siren: str, *, max_sites: int = 20, client: httpx.AsyncClient | None = None) -> list[dict]:
    """Authoritative ``sitesFrance`` for a SIREN — active établissements, HQ first,
    deduped by city, capped. Mapped to the cartography's site shape (replaces the
    LLM's invented sites). Empty without a key."""
    etabs = await etablissements_by_siren(siren, client=client)
    active = [e for e in etabs if e.is_active and e.city]
    # Siège first (stable), then dedupe by city so one bank's 200 branches in Paris
    # don't crowd out the geographic spread.
    active.sort(key=lambda e: (not e.is_headquarters))
    out: list[dict] = []
    seen: set[str] = set()
    for e in active:
        key = e.city.lower()
        if key in seen:
            continue
        seen.add(key)
        # ⚠️ `headcount_range` est un CODE de tranche INSEE ("12"), pas un
        # effectif. Écrit tel quel — ce qu'on faisait — l'onglet Sites affichait
        # « 12 » pour un établissement de 20 à 49 personnes : un chiffre FAUX, et
        # d'autant plus crédible qu'il ressemble à un effectif. On rend donc le
        # libellé officiel de la tranche, et rien du tout quand le code est
        # inconnu (l'absence est une réponse, un code brut n'en est pas une).
        # #4436.3 — « 00 » a un libellé officiel (« 0 salarié »), mais sur une carte c'est
        # un effectif non publié, pas un zéro mesuré (GA-18/19) : le masque est ICI, à l'affichage.
        hc = "" if str(e.headcount_range or "").strip() == "00" else headcount_band_label(e.headcount_range)
        out.append(
            {
                "city": e.city,
                "postal_code": e.postal_code or None,
                "type": "siège" if e.is_headquarters else "établissement",
                "importance": "strategique" if e.is_headquarters else "moyenne",
                "estimated_headcount": hc,
                "notes": (f"CP {e.postal_code} · " if e.postal_code else "") + "source officielle",
            }
        )
        if len(out) >= max_sites:
            break
    return out


def _fold_city(value: object) -> str:
    plain = unicodedata.normalize("NFD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", plain.lower()).strip()


def order_sites_for_zone(sites: list[dict], zone_city: str | None) -> list[dict]:
    """KEVIN-FIX K.10 — le cadrage ville/site ORDONNE les sites : celui de la zone d'abord (priorité
    « haute »), le reste NOMMÉ « hors site (<ville>) » — rien n'est retiré, un siège hors zone reste
    un fait (importance inchangée). Sans ville, ou sans site PROUVÉ dans la zone, la liste est rendue
    telle quelle : on ne prétend jamais « dans la zone » sans preuve."""
    zone = _fold_city(zone_city)
    label = str(zone_city or "").strip()
    if not zone or not sites:
        return sites
    in_zone = [s for s in sites if _fold_city(s.get("city")) == zone]
    if not in_zone:
        return sites

    def _note(site: dict, status: str) -> str:
        base = str(site.get("notes") or "").strip()
        return f"{base} · {status} ({label})" if base else f"{status} ({label})"

    zoned = [{**s, "importance": "haute", "notes": _note(s, "dans la zone")} for s in in_zone]
    outside = [
        {
            **s,
            "importance": s["importance"] if s.get("type") == "siège" else "basse",
            "notes": _note(s, "hors site"),
        }
        for s in sites
        if _fold_city(s.get("city")) != zone
    ]
    return [*zoned, *outside]


# ── #2995/SRC8 — REGISTRE LÉGAL HISTORIQUE ──────────────────────────────────
#
# `search_unites_legales` interroge le registre par NOM (`periode(denomination
# UniteLegale:"…")`) et ne rend que la période COURANTE de chaque résultat
# (`_parse_unite` ne lit que `periodesUniteLegale[0]`). Aucun appelant existant
# ne demande l'HISTORIQUE d'un SIREN déjà connu — anciennes dénominations,
# formes juridiques successives. C'est le manque nommé par `SOURCES-28-09.md`
# (point A : donnée absente, pas une source à créer) : Sirene le publie déjà,
# dans LA MÊME ressource `periodesUniteLegale[]`, simplement jamais lue au-delà
# du premier élément. On AJOUTE la lecture, pas un second client.
#
# `/siren/{siren}` (une ressource, un SIREN exact) rend `{"uniteLegale": {…}}`
# — au singulier, contrairement à `/siren?q=…` qui rend `{"unitesLegales": […]}`.
# Les deux endpoints du MÊME Sirene V3 renvoient des `uniteLegale` de MÊME
# forme, ``_parse_unite`` sur la période courante suffit donc à valider le
# SIREN demandé avant d'en lire tout l'historique.


@dataclass(frozen=True)
class DenominationPeriod:
    """Une période de vie d'une ``unité légale`` : sa dénomination et sa forme
    juridique SUR CETTE PÉRIODE — jamais recopiées de la période courante."""

    denomination: str
    legal_category: str | None
    is_active: bool
    date_debut: str | None
    date_fin: str | None


def _parse_period(period: object) -> DenominationPeriod | None:
    if not isinstance(period, dict):
        return None
    denomination = str(
        period.get("denominationUniteLegale")
        or " ".join(x for x in (period.get("prenom1UniteLegale"), period.get("nomUniteLegale")) if x).strip()
        or ""
    ).strip()
    if not denomination:
        # Une période sans dénomination lisible ne prouve rien qu'on afficherait
        # — mieux vaut une ligne d'historique en moins qu'une ligne vide.
        return None
    etat = period.get("etatAdministratifUniteLegale")
    return DenominationPeriod(
        denomination=denomination,
        legal_category=period.get("categorieJuridiqueUniteLegale"),
        is_active=(etat or "A") == "A",
        date_debut=_clean_date(period.get("dateDebut")),
        date_fin=_clean_date(period.get("dateFin")),
    )


def _clean_date(value: object) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


async def denomination_history(siren: str, *, client: httpx.AsyncClient | None = None) -> list[DenominationPeriod]:
    """Toutes les périodes de vie d'un SIREN — anciennes dénominations ET
    formes juridiques successives, dans l'ordre Sirene (la plus RÉCENTE
    d'abord). Vide sans clé, SIREN illisible, ou 404 (SIREN inconnu — une
    vraie absence, pas une panne). Une seule période ⇒ aucun changement connu,
    ce n'est pas une erreur.
    """
    key = insee_api_key()
    s = "".join(ch for ch in str(siren or "") if ch.isdigit())
    if not key or len(s) != 9:
        return []

    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=_TIMEOUT_S)
    try:
        async with throttle("insee"):
            resp = await http.get(f"{_base_url()}/siren/{s}", headers=_auth_headers())
        if resp.status_code == 404:
            # SIREN inconnu du registre — vraie absence, pas une panne.
            return []
        if resp.status_code == 429:
            back_off_provider("insee", retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — registry must never break research
        logger.warning("INSEE denomination history failed for %r: %s", s, exc)
        record_degradation(get_correlation_id(), source="insee", reason=str(exc))
        return []
    finally:
        if owns_client:
            await http.aclose()

    unite = payload.get("uniteLegale") if isinstance(payload, dict) else None
    periods = unite.get("periodesUniteLegale") if isinstance(unite, dict) else None
    if not isinstance(periods, list):
        return []
    parsed = [_parse_period(p) for p in periods]
    return [p for p in parsed if p is not None]


def former_denominations(history: list[DenominationPeriod], *, current: str | None = None) -> list[DenominationPeriod]:
    """Les périodes qui portent un nom DIFFÉRENT de l'actuel — écarte les
    périodes qui n'ont fait bouger que la forme juridique, pour ne montrer
    « anciennement connue sous » que quand le NOM a vraiment changé."""
    current_norm = _normalize(current) if current else (_normalize(history[0].denomination) if history else "")
    seen: set[str] = {current_norm}
    out: list[DenominationPeriod] = []
    for period in history:
        norm = _normalize(period.denomination)
        if norm in seen:
            continue
        seen.add(norm)
        out.append(period)
    return out


def to_entity_dict(unite: InseeUniteLegale) -> dict:
    """Map an INSEE IT entity to the cartography's entity shape (flagged so the
    tiering floats it to P1 and the dashboard badges it)."""
    return {
        "name": unite.denomination,
        "type": "GIE informatique" if unite.naf_is_it else "filiale",
        "siren": unite.siren,
        "nafCode": unite.naf_code,
        "isItEntity": unite.naf_is_it,
        "source": "insee",
    }
