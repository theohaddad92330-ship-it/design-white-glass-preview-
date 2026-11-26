"""Annuaire des Entreprises — ``recherche-entreprises.api.gouv.fr``.

Free, NO key, SIRENE/RNE-backed. A robust registry source that runs in parallel
with Brave/Pappers/INSEE during Phase 1: company identity, NAF, effectif bracket,
établissement count, and the legal dirigeants (with their qualité) — a free
cross-check / fallback for the Pappers profile. Degrades to ``None`` on any error
so it can never slow or break research.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import random
import time
from collections.abc import Mapping

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.company_filters import (
    CompanyDiscoveryFilters,
    DegradeReason,
    degraded_entry,
    department_from_postal_code,
    headcount_label,
    plausible_creation_date,
    tranche_codes_between,
)
from app.services.data_sources._http_pool import get_shared_client
from app.services.data_sources.signal_errors import SignalSourceUnavailable, settled
from app.services.rate_limiter import RateLimitTimeout, get_throttle, throttle, wait_budget_active, wait_time_left
from app.services.site_geography import siege_in_zone, site_geography
from app.services.source_health import record_degradation
from app.services.tool_circuit_breaker import ToolCircuitBreaker

logger = logging.getLogger(__name__)

SOURCE_NAME = "recherche-entreprises"

_BASE = "https://recherche-entreprises.api.gouv.fr/search"
#: L'endpoint VOISIN, pour une recherche « autour d'un point ». Même source, même
#: forme de résultat (mesuré le 04/09/2026 : `siege`, `dirigeants`, `finances`,
#: `categorie_entreprise` — identiques à `/search`), mêmes filtres d'activité et
#: d'effectif. Seul le critère géographique change de nature : `lat`/`long`/`radius`
#: au lieu de `departement`/`code_commune`.
_NEAR_BASE = "https://recherche-entreprises.api.gouv.fr/near_point"

#: Le rayon maximal que l'API accepte, EN KILOMÈTRES. Ce n'est pas une prudence
#: de notre part : mesuré le 04/09/2026, `radius=51` rend un 400 dont le corps
#: est « Veuillez indiquer un paramètre `radius` entre `0.001` et `50`, par
#: défaut `5` ». On borne donc AVANT l'appel — un 400 remonterait à l'écran
#: comme « le registre n'a pas répondu », ce qui est faux et indébogable.
MAX_RADIUS_KM = 50.0
_TIMEOUT_S = 8.0


def _shared_http() -> httpx.AsyncClient:
    """Le client partagé du registre — UN seul endroit (GA-26).

    # #4448 — ``follow_redirects=True`` : un 302 du registre (IA-R/S/W/Z) faisait lever
    ``raise_for_status()`` (un 3xx n'est pas un succès pour httpx) alors que la réponse
    existait à l'adresse suivante."""
    return get_shared_client("recherche_entreprises", timeout=_TIMEOUT_S, follow_redirects=True)


# The gouv.fr API caps a page at 25 results.
_MAX_PER_PAGE = 25
#: Public alias — Découvrir asks for a full page (#2490.3).
LIST_PAGE_MAX = _MAX_PER_PAGE


#: Combien de temps se taire quand le registre renvoie un 429 sans nous dire
#: combien de temps attendre.
#:
#: #2521 — c'était trente secondes, « assez pour que la fenêtre glissante d'un
#: limiteur par minute se vide à moitié ». L'hypothèse est réfutée par la
#: documentation de l'API (openapi.json, lu le 17/09/2026) : « au maximum 7
#: requêtes par seconde par adresse IP » — la fenêtre est d'UNE seconde. Trente
#: secondes de silence partagé dépassaient le budget entier de Découvrir (20 s),
#: si bien que chaque sous-requête attendait jusqu'à la coupure. Deux secondes :
#: deux fenêtres de la limite publiée.
_DEFAULT_BACKOFF_S = 2.0


def _back_off_from(resp: httpx.Response) -> None:
    """Fait taire le seau partagé, en suivant `Retry-After` s'il est donné."""
    delay = _DEFAULT_BACKOFF_S
    header = resp.headers.get("retry-after")
    if header:
        try:
            delay = max(1.0, float(header))
        except ValueError:
            # `Retry-After` peut porter une DATE. On ne la parse pas : mal la
            # lire produirait une attente absurde, et le défaut est correct.
            delay = _DEFAULT_BACKOFF_S
    # #4617 — du jitter (≤ 25 %) : deux répliques refroidies au même instant repartiraient ensemble.
    delay += random.uniform(0.0, delay * _JITTER_RATIO)
    get_throttle("recherche_entreprises").back_off(delay)


#: #4617 — la part de jitter ajoutée à une attente de refroidissement.
_JITTER_RATIO = 0.25
#: #4617 — au-delà, un 429 n'est PAS réessayé en ligne (jamais dormir plus longtemps qu'un appel interactif) :
#: il est dit, et le cache de 30 jours prend le relais s'il a quelque chose.
_MAX_INLINE_RETRY_WAIT_S = 10.0
#: #4617 — la taille du corps d'un refus qu'on journalise.
_REFUSAL_BODY_LOG_CHARS = 300

#: #4617 / #4518 — le coupe-circuit du registre. 909 refus 429 en production : une recherche par compétence résout
#: jusqu'à 150 employeurs, et chacun rappelait le registre qui venait de refuser le précédent. Après ce nombre de
#: refus CONSÉCUTIFS (429, 5xx, réseau — jamais un 4xx : c'est notre requête), le circuit OUVRE : plus aucun appel
#: ne part (le cache de 30 jours répond, l'écran dit « trop de requêtes »), et après le refroidissement UN essai
#: décide de refermer. Par PROCESSUS, perdu au redémarrage — même patron que ``tool_circuit_breaker``.
REGISTRY_FAILURE_THRESHOLD = 5
#: Trente secondes : au-delà d'une recherche Découvrir (budget ~32 s), la suivante retente le registre.
REGISTRY_COOLDOWN_S = 30.0
REGISTRY_BREAKER = ToolCircuitBreaker(failure_threshold=REGISTRY_FAILURE_THRESHOLD, cooldown_s=REGISTRY_COOLDOWN_S)
_BREAKER_KEY = "recherche_entreprises"
#: La nature du DERNIER refus : ce que l'écran dit quand le circuit est ouvert (jamais « trop de requêtes » pour
#: une panne réseau).
_breaker_last_reason: str = DegradeReason.RATE_LIMITED


class RegistryCircuitOpen(Exception):
    """#4617 — le circuit du registre est ouvert : l'appel n'est pas parti."""

    def __init__(self, reason: str) -> None:
        super().__init__(f"circuit ouvert ({reason})")
        self.reason = reason


def registry_refusal_reason() -> str:
    """#4617 — la nature du dernier refus du registre (``rate_limited`` par défaut), pour le dire à l'écran."""
    return _breaker_last_reason


def _breaker_admit() -> None:
    """Lève :class:`RegistryCircuitOpen` si le circuit est ouvert — AUCUN appel réseau."""
    if not REGISTRY_BREAKER.allow(_BREAKER_KEY):
        raise RegistryCircuitOpen(_breaker_last_reason)


#: Lot R (#4519) — une VAGUE de délais réseau ne compte qu'UN échec. Cause tracée : la résolution des employeurs lance
#: ``_RESOLVE_CONCURRENCY`` (8) appels à la fois ; un registre lent (8 s) les fait tous échouer ensemble, donc les cinq
#: échecs du circuit tombent en UNE vague, vers 16-24 s, et les ~140 employeurs restants sont refusés sans appel :
#: « Data & IA » rendait 0 compte + « Résultat non vérifiable ». Les refus 429/5xx, eux, restent comptés un à un.
_NETWORK_FAILURE_WAVE_S = 2.0
_last_network_failure_at: float | None = None


def _breaker_fail(reason: str) -> None:
    global _breaker_last_reason, _last_network_failure_at
    _breaker_last_reason = reason
    if reason == DegradeReason.NETWORK_ERROR:
        now = time.monotonic()
        merged = _last_network_failure_at is not None and now - _last_network_failure_at < _NETWORK_FAILURE_WAVE_S
        _last_network_failure_at = now
        if merged:
            REGISTRY_BREAKER.release(_BREAKER_KEY)  # la vague a déjà été comptée ; ne laisse pas l'essai demi-ouvert pendre
            return
    REGISTRY_BREAKER.record_failure(_BREAKER_KEY)


def _breaker_judge(resp: httpx.Response) -> None:
    """Le verdict d'une réponse : 429 et 5xx comptent comme refus ; tout le reste (200, 4xx) dit que le registre
    RÉPOND et remet le compte à zéro."""
    if resp.status_code == 429:
        _breaker_fail(DegradeReason.RATE_LIMITED)
    elif resp.status_code >= 500:
        _breaker_fail(DegradeReason.UPSTREAM_ERROR)
    else:
        REGISTRY_BREAKER.record_success(_BREAKER_KEY)


def _may_retry_429(attempt: int) -> bool:
    """Un 429 se réessaie UNE fois, et seulement si l'attente est BORNÉE : sous le budget d'un appelant
    interactif (le limiteur lève ``RateLimitTimeout`` si ça ne tient pas), ou, hors budget, si le
    refroidissement demandé par le registre reste court. Jamais une boucle serrée (#4617, #4518.2)."""
    if attempt != 0:
        return False
    if wait_budget_active():
        return True
    left = get_throttle("recherche_entreprises")._cooldown_until - time.monotonic()
    return left <= _MAX_INLINE_RETRY_WAIT_S


def _log_http_refusal(resp: httpx.Response, where: str) -> None:
    """Journalise le CORPS d'une réponse HTTP d'erreur, tronqué (#4617) — le fournisseur y nomme le champ
    fautif ; c'est ce qui a manqué sur Fantastic.jobs. Jamais l'URL (elle peut porter une clé), jamais le
    texte d'une exception."""
    try:
        body = resp.text
    except Exception:  # noqa: BLE001 — journaliser ne casse jamais l'appel
        body = ""
    logger.warning(
        "recherche-entreprises %s refused status=%s body=%s",
        where,
        resp.status_code,
        " ".join((body or "(corps vide)").split())[:_REFUSAL_BODY_LOG_CHARS],
    )


def _safe_reason(exc: BaseException) -> str:
    """Le TYPE de l'erreur, plus le statut HTTP s'il y en a un — jamais ``str(exc)`` (il porte l'URL)."""
    if isinstance(exc, httpx.HTTPStatusError):
        return f"HTTP {exc.response.status_code}"
    return type(exc).__name__


def _dirigeant(d: object) -> dict | None:
    if not isinstance(d, dict):
        return None
    name = " ".join(x for x in (d.get("prenoms"), d.get("nom")) if x).replace(",", " ").strip()
    name = " ".join(name.split()) or (d.get("denomination") or "")
    name = str(name).strip()
    if not name:
        return None
    return {"name": name, "role": str(d.get("qualite") or "").strip()}


@provider_cache.cached_by(
    "registry:recherche_entreprises", lambda name, **_: (name or "").strip().lower(), ttl=provider_cache.TTL_FIRMO
)
async def fetch_company(name: str, *, client: httpx.AsyncClient | None = None) -> dict | None:
    """Top registry match for a company name — identity + dirigeants. ``None``
    when the name is empty or the lookup fails.

    Même bucket que :func:`search_companies` et :func:`list_companies` : les
    trois tapent le MÊME hôte, et le plafond de ``recherche-entreprises`` est par
    IP — il ne distingue pas nos fonctions. #631 a limité les deux autres et
    laissé celle-ci dehors ; c'est exactement le trou par lequel le bug était
    entré (un appelant non limité à côté d'appelants limités, invisible parce que
    le chemin limité, lui, marche).
    """
    cleaned = (name or "").strip()
    if not cleaned:
        return None

    http = client if client is not None else _shared_http()
    try:
        async with throttle("recherche_entreprises"):
            resp = await http.get(_BASE, params={"q": cleaned, "page": "1", "per_page": "1"})
        if resp.status_code == 429:
            # Même hôte, même bucket que _search_page/list_companies : le
            # laisser dehors serait le trou exact par lequel #631 est entré.
            _back_off_from(resp)
        if resp.status_code >= 400:
            _log_http_refusal(resp, "fetch_company")
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — a free source must never break research
        # #4617 — le TYPE de l'erreur, jamais `str(exc)` (httpx y met l'URL).
        logger.warning("recherche-entreprises failed for %r: %s", cleaned, _safe_reason(exc))
        record_degradation(get_correlation_id(), source="recherche_entreprises", reason=_safe_reason(exc))
        return None

    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list) or not results or not isinstance(results[0], dict):
        return None
    r = results[0]
    dirigeants = [d for d in (_dirigeant(x) for x in (r.get("dirigeants") or [])) if d]
    return {
        "source": "recherche-entreprises",
        "name": r.get("nom_complet") or r.get("nom_raison_sociale"),
        "siren": r.get("siren"),
        "nafCode": r.get("activite_principale"),
        "category": r.get("categorie_entreprise"),
        "headcountRange": r.get("tranche_effectif_salarie"),
        # Le CODE INSEE, nommé pour ce qu'il est (#3504) : sans lui, la barrière
        # d'achat lisait « 53 » de `headcountRange` comme 53 salariés.
        "headcountTranche": r.get("tranche_effectif_salarie"),
        # OUVERTS et non total (même règle que `_list_row`) : un total qui
        # compte les sites fermés fait passer pour décentralisée une
        # entreprise qui ne l'est plus, et baisse la barrière estimée.
        "etablissementCount": r.get("nombre_etablissements_ouverts"),
        "creationDate": plausible_creation_date(r.get("date_creation")),
        # ── Ce que le siège porte, et que personne ne lisait ─────────────────
        # `siege` voyage dans la MÊME réponse depuis toujours : l'adresse, la
        # commune, le code postal. L'écran Territoire ouvre désormais une fiche
        # gratuite sur chaque entreprise du marché — sans ces trois champs elle
        # dirait « Airbus, 62.02A » et rien sur l'endroit où aller.
        #
        # ⚠️ Aucun repli, aucune déduction : un siège sans adresse publiée rend
        # `None`, il ne rend pas la commune du département. Une adresse devinée
        # se lit comme une adresse vraie.
        #
        # #3876 (VU EN PASSANT, 08/10) — la commune se lit sous `libelle_commune`,
        # comme partout ailleurs dans ce fichier (`_candidate`, `_list_row`) :
        # `commune` n'existe pas dans la réponse réelle, `city` rendait donc
        # toujours `None` même quand le siège a une commune connue.
        "address": _clean((r.get("siege") or {}).get("adresse")) if isinstance(r.get("siege"), dict) else None,
        "city": _clean((r.get("siege") or {}).get("libelle_commune")) if isinstance(r.get("siege"), dict) else None,
        "postalCode": _clean((r.get("siege") or {}).get("code_postal")) if isinstance(r.get("siege"), dict) else None,
        # La forme juridique, en CLAIR quand le registre la libelle. Le code nu
        # (« 5710 ») ne dit rien à un commercial.
        "legalForm": _clean(r.get("nature_juridique") or None),
        "dirigeants": dirigeants[:25],
    }


def _site_establishments(r: dict, department: str) -> int:
    """#4712 — combien d'établissements ACTIFS l'entité compte dans ``department`` (le registre les publie dans
    ``matching_etablissements`` quand la requête porte ``departement``). Le siège compte comme les autres."""
    matching = r.get("matching_etablissements")
    if not isinstance(matching, list):
        return 0
    return sum(
        1
        for entry in matching
        if isinstance(entry, dict)
        and str(entry.get("etat_administratif") or "A").strip().upper() != "C"
        and department_from_postal_code(entry.get("code_postal")) == department
    )


def _candidate(r: object, department: str | None = None) -> dict | None:
    """Normalize one search result into a homonym CANDIDATE (identity facts only,
    no dirigeants). ``None`` when the row carries no SIREN (can't be selected).

    ``department`` (#4712) : le département de l'offre — le candidat porte alors ``siteEstablishments``, le nombre
    de ses établissements actifs SUR PLACE. Absent quand aucun lieu n'a été demandé (jamais un « 0 » d'ignorance)."""
    if not isinstance(r, dict):
        return None
    siren = str(r.get("siren") or "").strip()
    if not siren:
        return None
    siege = r.get("siege") if isinstance(r.get("siege"), dict) else {}
    # A company is active unless its head office is administratively ceased ("C").
    etat = str(siege.get("etat_administratif") or "A").strip().upper()
    on_site = {"siteEstablishments": _site_establishments(r, department)} if department else {}
    return {
        **on_site,
        "source": "recherche-entreprises",
        "siren": siren,
        "name": r.get("nom_complet") or r.get("nom_raison_sociale") or "",
        # The RAISON SOCIALE alongside the (often brand-flavoured) ``nom_complet``.
        # The two routinely differ — « Kicklox » is the brand, LINNAEUS the legal
        # name — so a scorer that only sees one of them drops the right entity.
        "legalName": r.get("nom_raison_sociale") or "",
        "nafCode": r.get("activite_principale"),
        "nafLabel": r.get("libelle_activite_principale") or siege.get("libelle_activite_principale"),
        "sizeClass": r.get("categorie_entreprise"),
        "headcountTranche": r.get("tranche_effectif_salarie"),
        "establishmentCount": r.get("nombre_etablissements_ouverts"),
        # Discriminating fact on the disambiguation list: two namesakes are much
        # easier to tell apart when one was created in 1998 and the other in 2023.
        "creationDate": plausible_creation_date(r.get("date_creation")),
        "city": siege.get("libelle_commune"),
        "department": siege.get("departement"),
        "isActive": etat != "C",
    }


# ── Rappel par TAILLE — la seconde question posée au registre ────────────────
#
# Mesuré le 30/08/2026 sur la production : ``q=ROCHE`` rend **10 000** résultats,
# et le tri par défaut de la source ne tient AUCUN compte de la taille. Les 25
# premières lignes sont des SCI, de l'immobilier et du commerce de détail ; le
# laboratoire Roche (SIREN 552012031, ETI, 500 à 999 salariés) n'y figure pas.
#
# Deux replis évidents, et pourquoi aucun des deux ne marche :
#
# * **rendre plus de lignes** — le laboratoire n'est dans aucune des 25 ;
# * **mieux classer** — un classement n'ordonne que ce que la source a rendu.
#   Classer parfaitement 25 SCI donne 25 SCI.
#
# Et le troisième, ``categorie_entreprise=ETI,GE``, remonterait ROCHE au premier
# rang en CASSANT tout le reste : les clients d'une ESN ne sont pas tous des ETI,
# et une PME de 200 personnes est une cible parfaitement légitime. Un filtre dur
# est le mauvais correctif.
#
# D'où ce rappel : la MÊME question, posée une seconde fois, restreinte aux
# entités qui DÉCLARENT dix salariés ou plus. C'est un ADDITIF — rien n'est
# retiré de la page historique, on lui ajoute ce que son tri enterrait. Le
# critère est la tranche d'effectif et non la catégorie, précisément pour que la
# PME de 200 personnes en fasse partie.
#
#: Première tranche INSEE « avec des salariés » au sens qui compte ici :
#: 10 salariés et plus. En dessous (00/01/02/03) on est dans le régime de la
#: coquille, de la SCI et de la micro-entreprise — celui que le tri par défaut
#: du registre remonte déjà en masse, et qui n'a donc aucun besoin d'un rappel.
STAFFED_RECALL_MIN_TRANCHE = "11"


def staffed_recall_tranches() -> list[str]:
    """Les codes de tranche du rappel. Dérivés de ``tranche_codes_between``, pas
    recopiés : la liste des tranches INSEE vit à UN seul endroit."""
    return tranche_codes_between(STAFFED_RECALL_MIN_TRANCHE, None)


def _looks_like_siren(query: str) -> bool:
    """Neuf chiffres, espaces admis — un SIREN posé en texte libre.

    Le registre le résout tel quel, et il ne rend qu'UNE entité : il n'y a rien à
    élargir, et poser le rappel serait un appel réseau de plus à chaque frappe.
    """
    digits = "".join(ch for ch in query if ch.isdigit())
    return len(digits) == 9 and all(ch.isdigit() or ch.isspace() for ch in query)


def merge_registry_pages(*pages: list[dict]) -> list[dict]:
    """Union de plusieurs pages registre, dédoublonnée par SIREN.

    L'ordre de la PREMIÈRE page est préservé et ses lignes passent devant : c'est
    la réponse historique de la source, et le rappel ne doit rien lui retirer —
    il n'a le droit que d'AJOUTER. Une ligne vue deux fois garde sa première
    occurrence (les deux portent les mêmes faits registre).
    """
    out: list[dict] = []
    seen: set[str] = set()
    for page in pages:
        for row in page or []:
            siren = str((row or {}).get("siren") or "").strip()
            if not siren or siren in seen:
                continue
            seen.add(siren)
            out.append(row)
    return out


async def _search_page(
    http: httpx.AsyncClient,
    query: str,
    *,
    per_page: int,
    tranches: list[str] | None = None,
    department: str | None = None,
) -> list[dict]:
    """Une page de candidats. Lève — l'appelant décide quoi faire de l'échec."""
    params: dict[str, str] = {"q": query, "page": "1", "per_page": str(max(1, min(per_page, _MAX_PER_PAGE)))}
    if tranches:
        params["tranche_effectif_salarie"] = ",".join(tranches)
    if department:
        # #4712 — le registre filtre par ÉTABLISSEMENT, pas seulement par siège : le lieu part à la recherche.
        params["departement"] = department
    _breaker_admit()  # #4617 — circuit ouvert : rien ne part
    judged = False
    try:
        for attempt in range(2):
            try:
                async with throttle("recherche_entreprises"):
                    resp = await http.get(_BASE, params=params)
            except httpx.TransportError:
                # #4518.15 — mesure prod 24/10 : 16 échecs, tous des délais de 8 s en rafale (0 réponse 429). Sous un
                # budget de recherche, un délai réseau est retenté UNE fois si ce qui reste couvre un second appel.
                left = wait_time_left()
                if attempt == 0 and left is not None and left >= _TIMEOUT_S:
                    continue
                judged = True
                _breaker_fail(DegradeReason.NETWORK_ERROR)
                raise
            if resp.status_code == 429:
                # Le fournisseur nous dit d'attendre : on l'écoute. Sans ça, le
                # reste du lot part quand même et récolte le même refus — c'est ce
                # qu'on a mesuré en production, des 429 groupés à la seconde.
                _back_off_from(resp)
                # #4518.15 / #4617 — la 429 est retentée UNE fois : ``throttle`` attend le refroidissement (jitter
                # compris), ou lève ``RateLimitTimeout`` tout de suite s'il ne tient pas dans le budget. Hors budget,
                # seulement si ce refroidissement reste court (``_may_retry_429``).
                if _may_retry_429(attempt):
                    continue
            break
        judged = True
        _breaker_judge(resp)
    finally:
        if not judged:
            # #4617 — l'appelant a cessé d'attendre (budget, limiteur) : pas un verdict sur le registre.
            REGISTRY_BREAKER.release(_BREAKER_KEY)
    if resp.status_code >= 400:
        _log_http_refusal(resp, "search")
    resp.raise_for_status()
    payload = resp.json()
    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list):
        return []
    return [c for c in (_candidate(r, department) for r in results) if c is not None]


@provider_cache.cached_by(
    "registry:recherche_entreprises:candidates",
    # ⚠️ Le drapeau de rappel FAIT PARTIE de la clé. Sans lui, la requête large et
    # la requête historique se répondraient l'une pour l'autre dans le cache, et
    # le défaut réapparaîtrait une frappe sur deux — invisible en test, fatal en
    # production.
    lambda name, *, limit=8, staffed_recall=False, department=None, **_: (
        f"{(name or '').strip().lower()}:{limit}{':staffed' if staffed_recall else ''}"
        f"{f':dept={department}' if department else ''}"
    ),
    ttl=provider_cache.TTL_FIRMO,
)
async def search_companies(
    name: str,
    *,
    limit: int = 8,
    client: httpx.AsyncClient | None = None,
    strict: bool = False,
    staffed_recall: bool = False,
    department: str | None = None,
) -> list[dict]:
    """ALL top registry matches for a name — the homonym candidate set.

    Unlike :func:`fetch_company` (top-1 identity + dirigeants) this returns the
    first ``limit`` matches with just the disambiguation facts (siren, NAF,
    effectif bracket, catégorie, établissement count, siège, statut) so
    ``homonym_disambiguation`` can score them. Free / no key. Degrades to ``[]``
    on any error — never slows or breaks research.

    Passe par le limiteur PARTAGÉ (même bucket que :func:`list_companies`, même
    hôte). Sans lui, un appelant qui résout un LOT de noms — ``/discover/signals``
    en lance jusqu'à 120 par vagues de 6 — se faisait renvoyer des 429 en rafale.
    Chaque 429 devient ici un ``[]``, donc un verdict ``none``, donc un candidat
    écarté : la source était saine, c'est nous qui la martelions.

    ``staffed_recall`` ajoute le RAPPEL PAR TAILLE décrit plus haut : une seconde
    requête, même ``q``, restreinte aux tranches d'effectif de dix salariés et
    plus, dont l'union avec la page historique forme le bassin rendu. Absent
    (le défaut, et donc tous les appelants historiques) ⇒ requête et résultat
    byte-identiques. Son échec à LUI n'est jamais fatal, même sous ``strict`` :
    un rappel qui ne répond pas rend la liste historique, jamais une erreur — il
    ne peut qu'ajouter, il ne peut rien retirer.
    """
    cleaned = (name or "").strip()
    if not cleaned:
        return []

    # Un SIREN posé en texte libre ne rend qu'une entité : rien à élargir.
    recall = staffed_recall and not _looks_like_siren(cleaned)

    http = client if client is not None else _shared_http()
    try:
        # Les deux questions partent ENSEMBLE : le rappel ne doit rien coûter en
        # latence à une liste déroulante qui se rafraîchit à la frappe.
        page, recalled = await asyncio.gather(
            settled(_search_page(http, cleaned, per_page=limit, department=department)),
            settled(_search_page(http, cleaned, per_page=limit, tranches=staffed_recall_tranches()))
            if recall
            else _noop_page(),
            return_exceptions=True,
        )
        if isinstance(page, BaseException):
            raise page
        if isinstance(recalled, BaseException):
            # Le rappel est ADDITIF : son échec retire zéro ligne. Le dire dans
            # les journaux, ne rien changer au verdict.
            logger.warning("recherche-entreprises staffed recall failed for %r: %s", cleaned, _safe_reason(recalled))
            recalled = []
        return merge_registry_pages(page, recalled)
    except Exception as exc:  # noqa: BLE001 — a free source must never break research
        logger.warning("recherche-entreprises multi-search failed for %r: %s", cleaned, _safe_reason(exc))
        # Report the REAL cause: without it the run can only say "aucun
        # résultat", which reads identically to a company that genuinely has
        # nothing here — opposite facts, same message.
        record_degradation(get_correlation_id(), source="recherche_entreprises", reason=_safe_reason(exc))
        # ─────────────────────────────────────────────────────────────────
        # `strict` — quand une liste vide serait prise pour un VERDICT
        # ─────────────────────────────────────────────────────────────────
        # Mesuré en production le 23/08/2026 : le registre renvoyait des « 429
        # Too Many Requests » en rafale pendant le remplissage du référentiel
        # ESN. Chaque 429 devenait `[]`, donc « aucune entité du registre
        # français ne correspond à ce nom », donc une ligne marquée
        # DÉFINITIVEMENT non résolue et jamais retentée. Une limite de débit
        # s'inscrivait comme un fait sur une société qui existe.
        #
        # Le défaut par défaut reste `[]` : le chemin d'analyse ne doit jamais
        # tomber pour une source gratuite. Seul un appelant qui va TRANCHER sur
        # la réponse passe `strict=True` et reçoit l'échec.
        if strict:
            raise SignalSourceUnavailable("recherche_entreprises", _safe_reason(exc)) from exc
        return []


async def _noop_page() -> list[dict]:
    """La branche « pas de rappel » de la paire lancée en parallèle. Une coroutine
    plutôt qu'un ``if`` autour du ``gather`` : le chemin sans rappel reste alors
    la MÊME suite d'instructions, et il ne peut pas diverger de l'autre."""
    return []


# ── List-building (Découvrir v2) ─────────────────────────────────────────────
#
# ``fetch_company`` (per_page=1) and ``search_companies`` (name → homonyms) both
# start from a KNOWN company. Découvrir needs the opposite: « give me the
# companies matching these criteria », from a source that needs NO key so the
# screen still works when Pappers is tokenless or rate-limited.
#
# Filters this API natively supports are pushed upstream; the ones it does not
# are either applied client-side (creation date) or declared in ``degraded`` so
# the caller knows the result set is broader than requested. Nothing is invented
# and nothing is silently swallowed.

# Criteria the gouv.fr API cannot express and we cannot faithfully reproduce
# client-side (the payload carries neither financials nor registry publications).
#: Ce que gouv.fr ne sait TOUJOURS pas filtrer — re-mesuré le 04/09/2026, pas
#: recopié. `revenue_min`, `revenue_max` et `legal_category` en SONT SORTIS : le
#: registre les honore désormais (`ca_min`, `ca_max`, `nature_juridique`), et les
#: y laisser envoyait chez Pappers, facturé à l'appel, des recherches que la
#: source gratuite savait faire.
#:
#: ⚠️ Cette liste se re-mesure, elle ne se déduit pas : un paramètre inconnu est
#: ignoré EN SILENCE par ce registre, donc « ça marche » et « c'est ignoré » se
#: ressemblent. Le témoin est un paramètre bidon — s'il change le total, la
#: mesure est fausse.
_UNSUPPORTED_FIELDS = (
    "capital_min",
    "capital_max",
    "corporate_purpose",
    "publication_type",
    "publication_date_min",
    "publication_date_max",
)


def covers_filters(filters: CompanyDiscoveryFilters) -> bool:
    """Can THIS free source answer ``filters`` in full, with nothing approximated?

    When it can, calling Pappers first buys nothing: both sources return the same
    row shape from the same underlying SIRENE/RNE data, and one of them is billed
    per call while the other has no key and no quota. That is the whole basis for
    the free-first ordering in ``POST /companies/discover``.

    ``False`` — i.e. Pappers stays first — as soon as the caller asked for
    something this API does not carry:

    * the financial and legal criteria in :data:`_UNSUPPORTED_FIELDS` (chiffre
      d'affaires, capital, catégorie juridique, objet social, publications au
      registre): the gouv.fr payload simply has no such fields, and returning a
      broader result set as if it matched would be answering a question nobody
      asked;
    * ``on_headquarters_only``: Pappers restricts the MATCH to head offices,
      this API has no equivalent query param — filtering client-side on the rows
      that came back would silently shrink an already-truncated page;
    * an empty criteria set: there is nothing to route, and neither source should
      be asked to produce an arbitrary list.

    Everything else (texte libre, NAF code/section, département, région, code
    postal, tranche d'effectifs, fenêtre de création) is either pushed natively
    upstream or applied faithfully row by row — see :func:`_list_query` and
    :func:`_list_row`.
    """
    if filters.is_empty():
        return False
    # #3983.2 — « siège dans <zone> » se tient ICI quand une zone département/région
    # est demandée : le registre rend le siège et les établissements de la zone,
    # `_list_row` écarte les lignes dont le siège n'est pas prouvé dedans. Sans
    # zone il n'y a rien à filtrer côté registre : Pappers garde ce critère.
    if filters.on_headquarters_only is not None and not (filters.on_headquarters_only is False or _has_zone(filters)):
        return False
    return all(getattr(filters, field) is None for field in _UNSUPPORTED_FIELDS)


def _has_zone(filters: CompanyDiscoveryFilters) -> bool:
    return bool(
        filters.departments or filters.department or filters.regions or filters.region or filters.commune_code
    )


def geo_endpoint(filters: CompanyDiscoveryFilters) -> tuple[str, dict[str, str]]:
    """L'URL à interroger et les paramètres GÉOGRAPHIQUES qui vont avec.

    Le registre a deux portes, et une seule répond à « autour de ce point » :
    `/search` filtre par département / commune / code postal, `/near_point`
    filtre par cercle. Elles ne se combinent pas — un `departement` envoyé à
    `/near_point` est simplement ignoré, ce qui rendrait un cercle nommé
    « Haute-Garonne » sans qu'aucune erreur ne le dise.

    Ce choix vit ICI, à un seul endroit : `count_companies` et `list_companies`
    le refaisaient sinon chacune de leur côté, et divergeraient au premier
    critère ajouté (GA-26).

    ⚠️ Le rayon est BORNÉ avant de partir. L'API refuse au-delà de 50 km avec un
    400, et un 400 remonte à l'écran comme « source indisponible » — soit
    exactement le contraire de la vérité, qui est « ta demande dépasse ce que
    cette source sait faire ». L'écran, lui, borne AUSSI son curseur et le DIT :
    la borne est ici pour que l'API ne soit jamais celle qui refuse.
    """
    if filters.latitude is not None and filters.longitude is not None and filters.radius_km is not None:
        radius = min(float(filters.radius_km), MAX_RADIUS_KM)
        return _NEAR_BASE, {
            "lat": f"{filters.latitude:.6f}",
            "long": f"{filters.longitude:.6f}",
            "radius": f"{radius:g}",
        }
    return _BASE, {}


def _list_query(filters: CompanyDiscoveryFilters, limit: int, page: int = 1) -> dict[str, str]:
    """Native gouv.fr query params. Absent criteria are never serialized."""
    params: dict[str, str] = {"page": str(max(1, int(page))), "per_page": str(max(1, min(int(limit), _MAX_PER_PAGE)))}
    if filters.q:
        params["q"] = filters.q
    if filters.naf_code:
        params["activite_principale"] = filters.naf_code
    if filters.naf_section:
        params["section_activite_principale"] = filters.naf_section
    # Le registre accepte une LISTE de départements (mesuré le 04/09/2026 :
    # `departement=31,33` → 142, contre 97 et 45 pris séparément). Un territoire
    # de trois départements tient donc en UNE requête.
    # ⚠️ En mode CERCLE, les critères d'aire ne partent pas : `/near_point` les
    # ignore en silence, et les envoyer ferait croire à une recherche
    # « département ET rayon » que la source ne fait pas.
    url, geo = geo_endpoint(filters)
    circling = url is _NEAR_BASE
    params.update(geo)
    departments = [code for code in (filters.departments or []) if code]
    if filters.department and filters.department not in departments:
        departments = [filters.department, *departments]
    if departments and not circling:
        params["departement"] = ",".join(departments)
    # #2642.1 — même mécanisme que les départements : le registre accepte une
    # LISTE de régions (`region=11,76` mesuré à 341, contre 220 et 156 pris
    # séparément) — un commercial qui coche IDF ET Occitanie ne fait plus deux
    # recherches.
    regions = [code for code in (filters.regions or []) if code]
    if filters.region and filters.region not in regions:
        regions = [filters.region, *regions]
    if regions and not circling:
        params["region"] = ",".join(regions)
    if filters.postal_code and not circling:
        params["code_postal"] = filters.postal_code
    # La VILLE, par son code INSEE. Le code postal ne la désigne pas : Toulouse
    # en porte six, et un code postal rural couvre plusieurs communes. Mesuré le
    # 04/09/2026 : `code_commune=31555` + NAF ESN + tranche ≥ 3 → 965.
    if filters.commune_code and not circling:
        params["code_commune"] = filters.commune_code
    # The API takes an explicit list of INSEE tranche codes, not a min/max range.
    # #3908 — ``headcount_tranches`` porte déjà l'UNION de plusieurs tranches
    # NON CONTIGUËS (10-49 + 250-499…) : l'envelopper dans un seul min/max
    # ferait remonter la tranche intermédiaire jamais cochée. Prioritaire sur
    # l'intervalle unique ci-dessous quand il est posé.
    tranches = filters.headcount_tranches or tranche_codes_between(
        filters.headcount_tranche_min, filters.headcount_tranche_max
    )
    if tranches:
        params["tranche_effectif_salarie"] = ",".join(tranches)

    # ── Trois critères que ce module déclarait « sans équivalent gouv.fr » ────
    #
    # Ils en ont un depuis. Mesuré le 04/09/2026 sur la base NAF 30.30Z (745
    # établissements), avec `parametre_bidon=42` comme TÉMOIN de la méthode —
    # un paramètre inconnu est ignoré en silence et rend la base inchangée :
    #
    #   parametre_bidon=42          → 745   (témoin : ignoré)
    #   ca_min=50000000             →  38   ✓
    #   ca_max=10000000             → 133   ✓
    #   nature_juridique=5710       → 400   ✓
    #   categorie_entreprise=ETI    →  52   ✓
    #
    # Restent SANS équivalent, vérifiés au même passage et donc toujours dans
    # `_UNSUPPORTED_FIELDS` : `capital_min`, `capital_max` et `objet_social`,
    # tous les trois à 745 — ignorés.
    if filters.revenue_min is not None:
        params["ca_min"] = str(filters.revenue_min)
    if filters.revenue_max is not None:
        params["ca_max"] = str(filters.revenue_max)
    if filters.legal_category:
        params["nature_juridique"] = filters.legal_category
    # ⚠️ `categorie_entreprise` n'est PAS un défaut, et ne doit jamais le
    # devenir : le §« pourquoi une seconde requête » plus haut a refusé
    # `categorie_entreprise=ETI,GE` comme correctif au tri de la source, parce
    # que « les clients d'une ESN ne sont pas tous des ETI, et une PME de 200
    # personnes est une cible parfaitement légitime ». Ce refus tient toujours.
    # Ici le critère est CHOISI par l'utilisateur, à la main, sur son écran —
    # c'est l'inverse d'un filtre dur appliqué à son insu.
    categories = [code for code in (filters.company_category or []) if code]
    if categories:
        params["categorie_entreprise"] = ",".join(categories)
    return params


def _matching_establishment(r: Mapping[str, object], filters: CompanyDiscoveryFilters) -> Mapping[str, object] | None:
    """#2544.1 — l'établissement qui a fait matcher la ligne sur la zone
    DÉPARTEMENT/RÉGION demandée, quand il diffère du siège.

    Retour bêta Ludovic Marx (#2544) : une recherche calibrée sur la
    Bourgogne-Franche-Comté a rendu un dirigeant PARISIEN du groupe — « je veux
    les équipes réellement implantées sur le territoire, pas le siège ». Son
    exemple : « Arquus en Bourgogne ».

    Mesuré sur l'API réelle le 18/09/2026 : ``departement=21,25,39,58,70,71,
    89,90`` (Bourgogne-Franche-Comté) rend ARQUUS — siège à VERSAILLES (78,
    hors zone) — avec ``matching_etablissements`` = UNE ligne, l'établissement
    de GARCHIZY (58, Nièvre, DANS la zone). Le registre matche par
    établissement, pas seulement par siège (même mécanisme que
    ``departement=31`` pour AIRBUS OPERATIONS, #2490.9) ; jusqu'ici la
    projection ignorait ce champ et rendait toujours le siège, si bien que le
    conseil de qualification (``account_qualification.qualify_candidate``)
    comparait le département du SIÈGE à la zone demandée et excluait la ligne
    — « hors du périmètre demandé » — pour la cible que la recherche avait
    justement trouvée.

    ``None`` quand aucune zone département/région n'est demandée, ou quand
    aucun établissement du champ ne matche RÉELLEMENT cette zone (la source ne
    prouve rien qu'on devrait alors garder le siège muni de son propre code).

    ⚠️ Ne s'applique PAS à une commune précise (``commune_code``) : #2490.11 a
    délibérément choisi, à cette maille-là, de ne garder que les sièges dans la
    commune tapée (Blagnac ≠ Toulouse) — ce choix n'est pas remis en cause ici.
    """
    departments = {*(filters.departments or []), *([filters.department] if filters.department else [])}
    # #2642.1 — une zone région peut porter PLUSIEURS codes.
    regions = {*(filters.regions or []), *([filters.region] if filters.region else [])}
    # KEVIN-FIX K.4 — la COMMUNE résolue suit la même base que département/région : `presence` par défaut
    # (le registre matche par établissement), le siège seul sur demande (`on_headquarters_only`).
    communes = {filters.commune_code} if filters.commune_code and filters.on_headquarters_only is not True else set()
    if not departments and not regions and not communes:
        return None
    matching = r.get("matching_etablissements")
    if not isinstance(matching, list):
        return None
    for entry in matching:
        if not isinstance(entry, Mapping):
            continue
        if str(entry.get("etat_administratif") or "A").strip().upper() == "C":
            continue
        dept = department_from_postal_code(entry.get("code_postal"))
        if (
            (dept and dept in departments)
            or (str(entry.get("region") or "") in regions)
            or (communes and str(entry.get("commune") or "") in communes)
        ):
            return entry
    return None


#: #2544.2 — combien de personnes une ligne de liste porte au plus. Le registre
#: en publie jusqu'à plusieurs dizaines (commissaires aux comptes, mandataires
#: successifs) ; une liste de découverte n'en montre pas trente, et les faire
#: voyager coûterait sur chacune des 25 lignes d'une page.
DISCOVER_PEOPLE_LIMIT = 5


def _registry_person(d: object, observed_at: str) -> dict | None:
    """Un mandataire PUBLIÉ, en fait attesté (`discoverPersonSchema`) — ou ``None``.

    Mesuré le 18/09/2026 sur la réponse réelle : chaque entrée de ``dirigeants``
    porte ``nom``, ``prenoms``, ``annee_de_naissance``, ``date_de_naissance``,
    ``qualite``, ``nationalite`` et ``type_dirigeant``. Deux conséquences, et
    aucune n'est négociable :

    * **AUCUN lieu de travail n'en sort.** Il n'y a, sur un dirigeant, ni
      adresse, ni établissement, ni SIRET : le mandat est attaché à l'unité
      légale. Dire « ce dirigeant travaille à Garchizy » parce que Garchizy est
      l'établissement qui a fait matcher la zone serait une donnée inventée —
      le contrat REFUSE d'ailleurs un `workplace` d'origine `registry`.
    * **Aucun attribut protégé ne franchit cette frontière** : ni l'âge, ni la
      nationalité, que la source publie pourtant. Une liste de personnes EST un
      classement (registre de doctrine, c58).

    Une ``personne morale`` (le commissaire aux comptes, une holding) n'est pas
    quelqu'un à appeler : la ranger parmi les gens ferait apparaître un cabinet
    d'audit comme un interlocuteur.
    """
    if not isinstance(d, dict):
        return None
    if str(d.get("type_dirigeant") or "").strip().lower() != "personne physique":
        return None
    # #3819 — « Thierry, Philippe » (liste de prénoms) : la virgule se retire.
    name = " ".join(
        " ".join(part.replace(",", " ").split())
        for part in (_clean(d.get("prenoms")), _clean(d.get("nom")))
        if part
    ).strip()
    if not name:
        return None
    person: dict = {"name": {"value": name, "origin": "registry", "observedAt": observed_at}}
    # Le mandat, quand il est libellé. ABSENT = inconnu : l'écran le NOMME
    # manquant plutôt que d'écrire « dirigeant » par défaut.
    if role := _clean(d.get("qualite")):
        person["role"] = {"value": role, "origin": "registry", "observedAt": observed_at}
    return person


async def fetch_people_by_siren(siren: str) -> list[dict]:
    """#3983.11 — les mandataires PHYSIQUES publiés d'une société (sa maison mère), en faits attestés.
    Même discipline que `_list_row` : sans `date_mise_a_jour_rne`, le constat ne se date pas → personne.
    Gratuit, même limiteur partagé ; une erreur rend ``[]`` (jamais de dirigeant deviné)."""
    digits = "".join(ch for ch in str(siren) if ch.isdigit())
    if len(digits) != 9:
        return []
    http = _shared_http()
    try:
        async with throttle("recherche_entreprises"):
            resp = await http.get(_BASE, params={"q": digits, "page": "1", "per_page": "1"})
        if resp.status_code == 429:
            _back_off_from(resp)
        if resp.status_code >= 400:
            _log_http_refusal(resp, "people")
        resp.raise_for_status()
        results = resp.json().get("results")
    except Exception as exc:  # noqa: BLE001 — free source, never breaks research
        logger.warning("recherche-entreprises people lookup failed for %s: %s", digits, _safe_reason(exc))
        return []
    r = results[0] if isinstance(results, list) and results and isinstance(results[0], dict) else None
    if r is None or str(r.get("siren") or "") != digits:
        return []
    observed_at = _clean(r.get("date_mise_a_jour_rne"))
    if not observed_at:
        return []
    persons = (_registry_person(x, observed_at) for x in (r.get("dirigeants") or []))
    return [p for p in persons if p][:DISCOVER_PEOPLE_LIMIT]


_AUDITOR_ROLES = ("commissaire aux comptes", "commissaire")


def _corporate_officers(raw: object) -> list[str]:
    """#3705.5 — dénominations des personnes morales mandataires, hors commissaires aux comptes
    (un cabinet d'audit n'est pas une maison mère)."""
    if not isinstance(raw, list):
        return []
    names: list[str] = []
    for entry in raw:
        if not isinstance(entry, dict) or str(entry.get("type_dirigeant") or "").strip().lower() != "personne morale":
            continue
        if any(word in str(entry.get("qualite") or "").lower() for word in _AUDITOR_ROLES):
            continue
        name = _clean(entry.get("denomination"))
        if name and name not in names:
            names.append(name)
    return names[:3]


def _list_row(r: object, filters: CompanyDiscoveryFilters) -> dict | None:
    """Registry half of ``DiscoverCandidate``. ``None`` when the row cannot be a
    candidate: no SIREN (« Pas de SIREN = candidat écarté »), administratively
    ceased, or outside an explicitly requested creation-date window."""
    if not isinstance(r, dict):
        return None
    siren = str(r.get("siren") or "").strip()
    name = str(r.get("nom_complet") or r.get("nom_raison_sociale") or "").strip()
    if not siren or not name:
        return None

    siege = r.get("siege") if isinstance(r.get("siege"), dict) else {}
    # A company is active unless its head office is administratively ceased.
    ceased = str(siege.get("etat_administratif") or "A").strip().upper() == "C"
    if ceased and filters.has_ceased is not True:
        return None

    created = r.get("date_creation")
    created = str(created).strip() if created else None
    if filters.creation_date_min or filters.creation_date_max:
        # No date = the row cannot be PROVEN to match the window the caller asked
        # for, so it is dropped rather than assumed in-range.
        if not created:
            return None
        if filters.creation_date_min and created < filters.creation_date_min:
            return None
        if filters.creation_date_max and created > filters.creation_date_max:
            return None

    # #2544.1 — le SITE qui a fait matcher la zone demandée, quand il y en a
    # un ; le siège sinon (comportement d'avant, byte-identique sans zone).
    located = _matching_establishment(r, filters) or siege
    postal_code = located.get("code_postal")

    # #3983.2 — « siège dans <zone> » (≠ « implantation dans <zone> », le défaut) :
    # le siège doit être PROUVÉ dans la zone, sinon la ligne sort.
    if filters.on_headquarters_only is True and not siege_in_zone(r, filters):
        return None
    # #3983.1 — la BASE de la géographie (siège / implantation), seulement quand
    # une zone est demandée et que la source prouve quelque chose.
    geography = site_geography(r, filters)

    # #2544.2 — LES PERSONNES QUE LE REGISTRE NOMME, avec leur date de constat.
    #
    # `date_mise_a_jour_rne` est la date à laquelle le registre national des
    # entreprises — celui qui porte les mandataires — a été mis à jour pour
    # cette société. C'est le SEUL constat datable dont on dispose sur un
    # mandat. Sans elle, le fait ne peut pas vieillir : lui coller la date du
    # jour ferait passer un mandat de 2011 pour un constat frais, ce que la
    # provenance est justement censée empêcher. On ne rend donc PERSONNE plutôt
    # que de dater à la louche.
    observed_at = _clean(r.get("date_mise_a_jour_rne"))
    people = (
        [p for p in (_registry_person(x, observed_at) for x in (r.get("dirigeants") or [])) if p][
            :DISCOVER_PEOPLE_LIMIT
        ]
        if observed_at
        else []
    )

    return {
        "source": SOURCE_NAME,
        "name": name,
        "siren": siren,
        "nafCode": r.get("activite_principale"),
        "sector": r.get("libelle_activite_principale") or siege.get("libelle_activite_principale"),
        "city": located.get("libelle_commune"),
        "department": located.get("departement") or department_from_postal_code(postal_code),
        "headcountRange": headcount_label(r.get("tranche_effectif_salarie")),
        "creationDate": created,
        # Deux champs que le registre donne et qu'on jetait — ce sont ceux qui
        # permettent de dire qu'une ligne est une PERSONNE plutôt qu'une
        # organisation (`legalCategory`), ou une coquille sans salarié
        # (`headcountTranche`). Sans eux, l'écran affichait « BONILLA
        # CHRISTOPHE » comme un compte à conquérir. Absents de la réponse =
        # absents ici : rien n'est deviné, et la qualification le dit.
        "legalCategory": _clean(r.get("nature_juridique")),
        # #4626 — le registre DIT « entrepreneur individuel » (`complements`) : la preuve voyage même quand la catégorie
        # juridique manque, et la qualification écarte la ligne (une personne n'est pas un compte). Posée seulement si
        # le registre l'affirme : jamais déduite de la forme du nom.
        **(
            {"individualEntrepreneur": True}
            if isinstance(r.get("complements"), dict) and r["complements"].get("est_entrepreneur_individuel") is True
            else {}
        ),
        "headcountTranche": _clean(r.get("tranche_effectif_salarie")),
        # Les deux entrées de la BARRIÈRE d'achat (tome 3). Le registre les
        # publie sur chaque ligne et cette projection les jetait, si bien que
        # deux proxies sur six seulement étaient mesurables et que Découvrir
        # affichait « non estimable » partout. Les champs étaient pourtant
        # threadés dans le routeur — ils n'arrivaient jamais jusqu'à lui.
        "sizeClass": _clean(r.get("categorie_entreprise")),
        # Les établissements OUVERTS, jamais le total : celui-ci compte aussi
        # les sites fermés, et les prendre rendrait « décentralisée » une
        # entreprise qui ne l'est plus — dans le sens qui BAISSE la barrière.
        # Absent = non mesuré, jamais un repli sur le total.
        "establishmentCount": r.get("nombre_etablissements_ouverts"),
        # #2544.2 — les personnes NOMMÉES par le registre. Liste VIDE = on a
        # regardé et le registre n'a nommé personne (ou n'a pas daté son
        # constat) ; ce n'est pas la même chose que l'absence de clé, qui dit
        # « ce chemin ne regarde pas les personnes ». Aucune n'a de lieu de
        # travail : le registre n'en donne pas, et on n'en invente pas.
        "people": people,
        # #3705.5 — les PERSONNES MORALES qui dirigent la société (holding, société mère),
        # telles que le registre les publie. Seul indice de rattachement à un groupe que
        # la source donne ; absent = non observé, jamais « indépendante ».
        "corporateOfficers": _corporate_officers(r.get("dirigeants")),
        "ceased": ceased,
        **({"geography": geography} if geography else {}),
        # #4429.2 — la position du site retenu (le registre la publie en texte) : elle mesure la
        # distance d'un compte élargi (« à 38 km de Toulouse »). Absente = non publiée, jamais 0.
        **_position(located),
    }


def _position(entry: Mapping[str, object]) -> dict[str, float]:
    try:
        latitude, longitude = float(str(entry.get("latitude"))), float(str(entry.get("longitude")))
    except ValueError:
        return {}
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return {}
    return {"latitude": latitude, "longitude": longitude}


def _clean(value: object) -> str | None:
    """Chaîne non vide, ou ``None`` — jamais la chaîne « None » dans un JSON."""
    text = str(value).strip() if value is not None else ""
    return text or None


async def count_companies(
    *,
    department: str | None = None,
    commune_code: str | None = None,
    near: tuple[float, float, float] | None = None,
    naf_codes: tuple[str, ...] | None = None,
    tranches: tuple[str, ...] | None = None,
    client: httpx.AsyncClient | None = None,
) -> int | None:
    """Combien d'entreprises le registre compte pour ces critères.

    On lit `total_results` plutôt que de compter des lignes : l'API rend 25
    résultats par page et compter les pages ferait 180 appels pour un chiffre
    qu'elle donne en un seul. `None` — jamais 0 — quand elle ne répond pas :
    « zéro ESN dans ce département » et « le registre est muet » mènent à deux
    décisions opposées.

    Trois mailles géographiques, exclusives dans cet ordre : ``near``
    (latitude, longitude, rayon en km) l'emporte, puis ``commune_code``, puis
    ``department``. Elles ne se combinent PAS — `/near_point` ignore les
    critères d'aire, et les envoyer quand même ferait croire à un filtre qui
    n'existe pas.
    """
    params: dict[str, str] = {"page": "1", "per_page": "1"}
    url = _BASE
    if near is not None:
        latitude, longitude, radius_km = near
        url = _NEAR_BASE
        params["lat"] = f"{latitude:.6f}"
        params["long"] = f"{longitude:.6f}"
        # Borné ICI comme dans `geo_endpoint`, et pour la même raison : au-delà
        # de 50 km l'API rend un 400 que l'appelant lirait « registre muet ».
        params["radius"] = f"{min(float(radius_km), MAX_RADIUS_KM):g}"
    elif commune_code:
        params["code_commune"] = commune_code
    elif department:
        params["departement"] = department
    if naf_codes:
        # Le registre n'accepte QUE des codes complets (« 62.02A »), et il en
        # accepte plusieurs séparés par une virgule. Un préfixe rend un 400.
        params["activite_principale"] = ",".join(naf_codes)
    if tranches:
        params["tranche_effectif_salarie"] = ",".join(tranches)

    http = client if client is not None else _shared_http()
    try:
        async with throttle("recherche_entreprises"):
            resp = await http.get(url, params=params)
        if resp.status_code == 429:
            _back_off_from(resp)
        if resp.status_code >= 400:
            _log_http_refusal(resp, "count")
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — une source libre ne casse jamais un écran
        logger.warning("Registry count failed (dept=%s naf=%s): %s", department, naf_codes, _safe_reason(exc))
        return None
    total = payload.get("total_results") if isinstance(payload, dict) else None
    return int(total) if isinstance(total, (int, float)) else None


def _refusal_reason(resp: httpx.Response) -> str:
    """Le motif que le registre donne à un refus (``{"erreur": "…"}``), borné — jamais le corps entier."""
    try:
        body = resp.json()
    except ValueError:
        return "(corps illisible)"
    reason = body.get("erreur") if isinstance(body, dict) else None
    return str(reason)[:300] if reason else "(sans motif)"


#: #4617 / #4518.3 — les raisons pour lesquelles le registre n'a PAS pu répondre : le cache de 30 jours prend alors
#: le relais. « request_rejected » (notre requête est fautive) et « empty_query » n'en sont pas : un cache ne répare pas ça.
_REFUSED_REASONS = frozenset(
    {DegradeReason.RATE_LIMITED, DegradeReason.UPSTREAM_ERROR, DegradeReason.NETWORK_ERROR, DegradeReason.TIME_BUDGET}
)
_LIST_CACHE_NAMESPACE = "registry:recherche_entreprises:list"
#: #4626 — la projection d'une ligne a changé (``individualEntrepreneur``) : une liste gardée avant ne se ressert pas
#: (correctif de collecte qui RATTRAPE l'existant). À changer à chaque évolution de ``_list_row``.
_LIST_PROJECTION_VERSION = "p2"


def _list_cache_key(filters: CompanyDiscoveryFilters, limit: int, page: int) -> str | None:
    """La clé du cache d'une liste : l'URL ET les paramètres réellement envoyés, hachés (aucun secret n'y entre)."""
    try:
        url, _ = geo_endpoint(filters)
        params = _list_query(filters, limit, page)
    except Exception:  # noqa: BLE001 — pas de clé = pas de cache, jamais une erreur
        return None
    raw = _LIST_PROJECTION_VERSION + "|" + url + "|" + "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def list_companies(
    filters: CompanyDiscoveryFilters,
    limit: int = 25,
    *,
    degraded: list[dict[str, str]] | None = None,
    client: httpx.AsyncClient | None = None,
    page: int = 1,
) -> list[dict]:
    """La liste du registre, avec le cache de 30 jours en secours (#4617, #4518.3).

    Une réponse non vide est gardée 30 jours. Quand le registre REFUSE (429, 5xx, réseau, délai), la dernière
    liste connue est servie plutôt qu'un vide — et l'entrée ``degraded`` du refus RESTE : l'écran dit que le
    registre n'a pas répondu, jamais une liste ancienne présentée comme fraîche. Rien en cache = ``[]`` + la
    dégradation, comme avant. Un vide n'est jamais gardé.
    """
    local: list[dict[str, str]] = []
    rows = await _list_companies_live(filters, limit, degraded=local, client=client, page=page)
    if degraded is not None:
        degraded.extend(local)
    key = _list_cache_key(filters, limit, page)
    if key is None:
        return rows
    if rows:
        await provider_cache.set_json(_LIST_CACHE_NAMESPACE, key, {"rows": rows}, provider_cache.TTL_FIRMO)
        return rows
    if any(entry.get("reason") in _REFUSED_REASONS for entry in local):
        cached = await provider_cache.peek_json(_LIST_CACHE_NAMESPACE, key)
        cached_rows = cached.get("rows") if isinstance(cached, Mapping) else None
        if isinstance(cached_rows, list) and cached_rows:
            logger.info("recherche-entreprises list refused: serving the cached list (%d rows)", len(cached_rows))
            return list(cached_rows)
    return rows


async def _list_companies_live(
    filters: CompanyDiscoveryFilters,
    limit: int = 25,
    *,
    degraded: list[dict[str, str]] | None = None,
    client: httpx.AsyncClient | None = None,
    page: int = 1,
) -> list[dict]:
    """List companies matching ``filters`` from the free gouv.fr registry.

    #4429.2 — une liste visée par taille reste UNE requête : aucun rappel silencieux sur d'autres
    tranches. Une taille voisine passe par les paliers étiquetés (``widenedBy``) de Découvrir.

    ``page`` (#2490.9) lets Découvrir read the SECOND page of a zone search:
    ``departement`` matches any establishment, so the first page is mostly
    national networks headquartered elsewhere. Default 1 = byte-identical.

    Same output shape as :func:`app.services.pappers.search_companies_filtered`
    (name, siren, nafCode, sector, city, department, headcountRange,
    creationDate + ``source``) so the two are interchangeable — this one is the
    fallback when Pappers is tokenless or rate-limited, and needs NO API key.

    Never raises and never invents: on an empty criteria set, a rate limit, a
    transport failure or an unparseable payload it returns ``[]`` and appends one
    ``{source, reason}`` entry to ``degraded`` (when a sink is provided). A
    criterion this API cannot express also yields an ``unsupported_filters``
    entry so the caller knows the rows are broader than requested.
    """
    sink = degraded if degraded is not None else []

    if filters.is_empty():
        logger.info("recherche-entreprises list skipped: no criterion")
        sink.append(degraded_entry(SOURCE_NAME, DegradeReason.EMPTY_QUERY))
        return []

    if unhonoured := [field for field in _UNSUPPORTED_FIELDS if getattr(filters, field) is not None]:
        # Nommés un par un : le caller (et l'écran) doivent savoir QUEL critère
        # a sauté, pas seulement qu'il y en a eu un. Ces noms-là sont ceux du
        # registre — l'écran Découvrir ne les expose pas encore, il retombera
        # donc sur sa phrase générique plutôt que d'en inventer un libellé.
        logger.info("recherche-entreprises cannot honour every requested filter: %s", ", ".join(unhonoured))
        sink.append(degraded_entry(SOURCE_NAME, DegradeReason.UNSUPPORTED_FILTERS, fields=unhonoured))

    http = client if client is not None else _shared_http()
    real_429 = False  # un VRAI refus HTTP a-t-il été vu ? (sinon l'attente est la nôtre)
    try:
        # ⚠️ L'URL VIENT DES FILTRES. Poser `_BASE` en dur ici marcherait
        # jusqu'au jour où quelqu'un demande un rayon : la requête partirait sur
        # `/search`, qui ignore `lat`/`long`/`radius` en silence et rendrait le
        # département entier sous l'étiquette « à 5 km de Toulouse ».
        url, _ = geo_endpoint(filters)
        params = _list_query(filters, limit, page)
        # #2521 — sous le budget d'un appelant interactif (Découvrir), un 429
        # vaut UNE nouvelle tentative : `throttle()` attend le refroidissement
        # s'il tient dans ce qui reste, et lève `RateLimitTimeout` sinon (→ la
        # dégradation dite ci-dessous). Jamais une boucle. Hors budget (fonds),
        # le chemin est inchangé : un 429 est dit, pas retenté.
        # #4617 — la nouvelle tentative suit `_may_retry_429` : sous budget, ou hors budget si le
        # refroidissement demandé reste court (≤ 10 s) ; une seule, jamais une boucle serrée.
        _breaker_admit()  # #4617 — circuit ouvert : rien ne part, le cache de 30 jours répond
        judged = False
        try:
            for _attempt in range(2):
                async with throttle("recherche_entreprises"):
                    resp = await http.get(url, params=params)
                if resp.status_code != 429:
                    break
                real_429 = True
                _back_off_from(resp)
                if not _may_retry_429(_attempt):
                    break
            judged = True
            _breaker_judge(resp)
        except (httpx.HTTPError, OSError):
            judged = True
            _breaker_fail(DegradeReason.NETWORK_ERROR)
            raise
        finally:
            if not judged:
                REGISTRY_BREAKER.release(_BREAKER_KEY)

        if resp.status_code == 429:
            _log_http_refusal(resp, "list")
            sink.append(degraded_entry(SOURCE_NAME, DegradeReason.RATE_LIMITED))
            return []
        if not resp.is_success:
            # #4518 — un 4xx (hors 429, traité plus haut) est NOTRE requête refusée : le registre répond, c'est
            # elle qui est fautive. #4617 — le CORPS du refus (tronqué, il nomme le paramètre invalide) est au
            # journal ; jamais l'URL.
            ours = 400 <= resp.status_code < 500
            _log_http_refusal(resp, "list")
            # #4541 — l'URL et les paramètres RESTENT au journal : c'est ce qui dit QUELLE requête a
            # été refusée (garde `test_cause_1_the_failed_url_is_logged_without_secret`). Ce registre
            # est SANS clé — `_list_query` ne sérialise aucun identifiant — et le filtre du dépôt
            # (`redact_secrets`) masquerait une valeur de clé si un jour il en arrivait une.
            logger.warning(
                "recherche-entreprises list failed (status %s) url=%s params=%s",
                resp.status_code,
                url,
                params,
            )
            sink.append(
                degraded_entry(SOURCE_NAME, DegradeReason.REQUEST_REJECTED if ours else DegradeReason.UPSTREAM_ERROR)
            )
            return []

        payload = resp.json()
    except RegistryCircuitOpen as exc:
        # #4617 — le registre vient de refuser plusieurs fois d'affilée : on ne l'appelle pas, on le DIT.
        logger.info("recherche-entreprises list skipped: %s", exc)
        sink.append(degraded_entry(SOURCE_NAME, exc.reason))
        return []
    except RateLimitTimeout as exc:
        # DISCOVER-PARTIEL-2 — « trop de requêtes » n'est dit que si le registre a RÉELLEMENT
        # répondu 429. Sinon c'est NOTRE limiteur qui a fait attendre : on a cessé d'attendre.
        logger.warning("recherche-entreprises list rate-limit deadline: %s", exc)
        sink.append(degraded_entry(SOURCE_NAME, DegradeReason.RATE_LIMITED if real_429 else DegradeReason.TIME_BUDGET))
        return []
    except (httpx.HTTPError, OSError) as exc:
        logger.warning("recherche-entreprises list transport failure: %s", _safe_reason(exc))
        sink.append(degraded_entry(SOURCE_NAME, DegradeReason.NETWORK_ERROR))
        return []
    except ValueError as exc:  # non-JSON body
        logger.error("recherche-entreprises list returned a non-JSON body: %s", _safe_reason(exc))
        sink.append(degraded_entry(SOURCE_NAME, DegradeReason.INVALID_RESPONSE))
        return []

    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list):
        logger.error("recherche-entreprises list payload has no `results` list")
        sink.append(degraded_entry(SOURCE_NAME, DegradeReason.INVALID_RESPONSE))
        return []

    rows = [row for row in (_list_row(r, filters) for r in results) if row is not None]
    return rows[:limit]
