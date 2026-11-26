"""France Travail (ex Pôle Emploi) — Offres d'emploi API.

The ESN-gold source: a company's IT job postings are dated signals of where the
budget and the needs are (a DSI hiring 5 devs = a project starting) AND list the
real tech stack (the offers name the technologies). Free; OAuth2 client-credentials
(register on francetravail.io). No-op (empty) without credentials; empty on any
error so it never breaks research. Runs in parallel with the rest of Phase 1.

ÉLARGI (max signal, frais, géo-localisé) : on enrichit chaque offre (type de
contrat, expérience, salaire, ROME, entreprise, ville + département), on DROP les
offres de plus de ~12 mois (un besoin d'il y a 2 ans n'est plus un signal) et on
trie de la plus récente à la plus ancienne. L'API est déjà France-scoped.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
import unicodedata
import weakref
from datetime import UTC, datetime, timedelta

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.company_filters import DegradeReason, public_administration_mismatch, reason_for_exception
from app.services.company_name_variants import company_name_variants
from app.services.data_sources._http_pool import get_shared_client
from app.services.data_sources.employer_match import EmployerScope
from app.services.data_sources.signal_errors import SignalSourceUnavailable, settled
from app.services.data_sources.territory_query import normalize_department
from app.services.domain_job_filters import (
    inferred_role_terms,
    job_filter_for,
    offer_relevant_to_profile,
    profile_job_scope,
)
from app.services.internship_posting import drop_internship_postings
from app.services.offer_domains.base import normalize_offer_domain
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle, wait_budget_active
from app.services.source_health import note_fetch_error, record_degradation
from app.services.zone_tiers import published_position

logger = logging.getLogger(__name__)

_TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token"
_SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search"
_SCOPE = "api_offresdemploiv2 o2dsoffre"
_TIMEOUT_S = 10.0

# Un besoin de recrutement de plus de ~12 mois n'est plus un signal FRAIS (le
# poste est probablement pourvu) — mais il reste un signal HISTORIQUE (#4754) :
# un besoin Java d'il y a un an ouvre une conversation sur un besoin récurrent.
# Au-delà de 12 mois l'offre est donc STOCKÉE et estampillée ``historical``, plus
# jetée ; le plafond dur est celui de ``sinceDays`` (1095 j, un réglage, un lieu :
# GA-26). Au-delà, la source ne le rend de toute façon plus de façon fiable.
_MAX_AGE_DAYS = 365

# Fenêtre de la requête LARGE (sans `domaine`). Elle doit être bien plus grande
# que celle de la requête M18 : ses résultats sont dominés par le bruit (pour
# « Decathlon », les 24 premières lignes sont des postes de caisse et de vente),
# et l'offre IT recherchée est enfouie en 37e position. Prendre un préfixe
# étroit de cette liste revient à filtrer un échantillon non représentatif.
# 150 est le maximum accepté par l'API (`0-199` → HTTP 400) et le surcoût est
# nul : ~0,2 s comme une fenêtre de 24, mesuré.
_BROAD_FETCH = 150


def _creds() -> tuple[str, str]:
    return os.environ.get("FRANCE_TRAVAIL_CLIENT_ID", ""), os.environ.get("FRANCE_TRAVAIL_CLIENT_SECRET", "")


# ───────────────────────────────────────────────────────────────────────────
# Tri IT — pourquoi `domaine=M18` ne suffit pas, et pourquoi on le garde
#
# `domaine=M18` (informatique/télécoms) filtre côté serveur sur le préfixe ROME
# `M18` de l'offre. Mesuré sur 32 entreprises réelles (386 offres hors-M18) :
# le filtre est JUSTE dans l'écrasante majorité des cas — sans lui, « Michelin »
# remonte 21 offres de restaurant étoilé, « Carrefour » 17 postes de caisse et
# boucherie, « Orange » 40 jobs de la VILLE d'Orange (hôtellerie, aide-soignant).
# Le supprimer échangerait un faux négatif contre ~380 faux positifs.
#
# MAIS le ROME est saisi par l'annonceur et il est parfois FAUX : une offre
# « Data Engineer DataIku » classée C1216 (assurance), un « Senior Analytics
# Engineer » classé I1613, un « Ingénieur Systèmes d'Information Industriels »
# classé H1206 — toutes IT, toutes perdues par `domaine=M18`.
#
# Le domaine ne couvre d'ailleurs PAS tout l'IT : `M1419` (« Data analyst ») et
# `I1401` (« Technicien de maintenance en informatique ») sont des ROME IT
# situés HORS de M18 — là ce n'est pas l'annonceur qui se trompe, c'est la
# taxonomie `domaine` elle-même qui est trop étroite.
#
# D'où la stratégie retenue : garder M18 comme requête de référence (haute
# précision) ET lancer en parallèle une requête sans filtre dont les offres ne
# sont admises QUE si leur PROPRE contenu (intitulé + vocabulaire contrôlé de
# l'API) prouve qu'elles sont IT. Le rattrapage doit MÉRITER sa place ; à défaut
# on ne remonte rien plutôt que de l'approximatif.
#
# Le vocabulaire ci-dessous est calibré sur ces 386 offres réelles : chaque
# terme a été vérifié comme ne déclenchant sur AUCUNE offre non-IT du corpus.
# ───────────────────────────────────────────────────────────────────────────

_IT_ROME_PREFIX = "M18"


def _fold(value: object) -> str:
    """minuscules, sans accents, apostrophes normalisées.

    « Développeur » et « Developpeur » matchent pareil. La normalisation des
    apostrophes est indispensable : France Travail publie « Systèmes
    d’Information » avec l'apostrophe typographique U+2019, qui ne matchait pas
    « systemes d'information » — une offre IT réelle perdue pour un caractère.
    """
    s = str(value or "").lower().replace("’", "'").replace("ʼ", "'").replace("`", "'")
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


# Termes NON AMBIGUS : leur présence dans l'intitulé suffit à qualifier l'offre.
# Volontairement ÉTROIT. Les termes écartés après mesure et leur contre-exemple :
#   « integration »  → Airbus « Intégrateur Cabine », Thales « Opérateur Intégration »
#   « architecte »   → architecte du bâtiment (sauf qualifié : voir plus bas)
#   « support »      → Thales « Technicien Support Technique Production »
#   « mes »          → possessif français ; « methodes » → méthodes industrielles
_IT_TERMS = (
    # Métiers du développement
    "developpeur", "developpeuse", "developpement informatique", "developpement logiciel",
    "software engineer", "software developer", "ingenieur logiciel", "genie logiciel",
    "tech lead", "lead technique", "fullstack", "full-stack", "full stack",
    "back-end", "backend", "front-end", "frontend", "webmaster", "integrateur web",
    "etudes et developpement informatique",
    # Data
    "data engineer", "data scientist", "data analyst", "analytics engineer",
    "ingenieur data", "data steward", "machine learning", "intelligence artificielle",
    "big data", "business intelligence", "datawarehouse", "data warehouse",
    # Infra / cloud / prod
    "devops", "devsecops", "site reliability", "sysadmin", "administrateur systeme",
    "administrateur reseau", "administrateur base de donnees", "ingenieur systeme",
    "ingenieur reseau", "ingenieur cloud", "cloud engineer", "kubernetes", "docker",
    "terraform", "ansible", "virtualisation", "datacenter", "data center",
    # Sécurité
    "cybersecurite", "cyber securite", "cybersecurity", "securite informatique",
    "securite des systemes d'information", "pentest", "pentester", "pentesteur", "pentesteuse",
    "analyste soc", "rssi",
    # Systèmes d'information / pilotage IT
    "systeme d'information", "systemes d'information", "informatique", "digital workplace",
    "urbaniste si", "architecte si", "architecte logiciel", "architecte technique",
    "architecte cloud", "architecte solution", "architecte applicatif", "architecte donnees",
    "chef de projet informatique", "chef de projet si", "chef de projet technique",
    "chef de projet digital", "chef de projet applicatif", "chef de projet data",
    "chef de projet web", "directeur des systemes d'information",
    # Progiciels / éditeurs
    "erp", "sap", "salesforce", "servicenow", "sharepoint", "dynamics 365",
    "progiciel", "microsoft 365", "office 365",
    # Langages / plateformes
    "javascript", "typescript", "angular", "react", "vue.js", "node.js", "symfony",
    "python", "golang", ".net", "c#", "php", "java", "sql", "powerbi", "power bi",
    # Qualité / méthodes IT
    "testeur logiciel", "qa engineer", "scrum master", "product owner",
    "ingenieur test logiciel", "recette applicative",
    # Support IT
    "help desk", "helpdesk", "support informatique", "technicien informatique",
    "technicien de maintenance informatique", "hotline informatique",
)

# Frontières de mot OBLIGATOIRES : sans elles « erp » matche « powERPlant » et
# « PERPignan », « java » matche « javascript ». Mesuré : 2 faux positifs sur le
# corpus réel avant l'ajout des lookarounds.
_IT_TERM_RE = re.compile(
    r"(?<![a-z0-9])(?:" + "|".join(re.escape(t) for t in _IT_TERMS) + r")(?![a-z0-9])"
)

# Les compétences et domaines de formation ont été ÉCARTÉS comme source de
# preuve : mesurés sur le corpus, ils n'apportent aucune offre IT réelle et
# créent 3 faux positifs — « Utilisation de l'outil informatique » est une
# compétence générique de réceptionniste, et « langage de programmation » est
# demandé aux régleurs sur commande numérique. Le titre et le vocabulaire
# contrôlé de France Travail suffisent.


def is_it_offer(offer: dict) -> bool:
    """L'offre est-elle une offre IT, jugée sur son PROPRE contenu ?

    Deux niveaux de preuve :

    1. ``romeCode`` en ``M18*`` — le verdict de France Travail elle-même ;
    2. un terme IT non ambigu dans l'intitulé, ou dans le vocabulaire CONTRÔLÉ
       de l'API (``appellationlibelle`` / ``romeLibelle``), qui rattrape les
       intitulés maison mal classés.

    Aucune preuve ⇒ ``False``. On préfère ne rien remonter plutôt que du bruit :
    une offre de caissier n'est pas un signal de budget IT.
    """
    if not isinstance(offer, dict):
        return False

    if (str(offer.get("romeCode") or "")).upper().startswith(_IT_ROME_PREFIX):
        return True

    blob = _fold(
        f"{offer.get('intitule') or ''} {offer.get('appellationlibelle') or ''} {offer.get('romeLibelle') or ''}"
    )
    return bool(_IT_TERM_RE.search(blob))


def is_domain_offer(offer: dict, *, pack: str | None = None, all_roles: bool = False) -> bool:
    """L'offre relève-t-elle du domaine que le VENDEUR vend ?

    Sans pack, avec ``esn_it`` ou avec un pack sans filtre déclaré, c'est le tri
    IT historique — à l'octet près. Un pack qui a un filtre (aujourd'hui
    l'ingénierie industrielle) juge sur SES préfixes ROME et SON vocabulaire, et
    ne récupère PAS les offres IT au passage : les offres de la DSI d'un
    industriel ne sont pas le marché d'un bureau d'études, et les compter
    gonflerait son signal.

    ``all_roles`` (#1124) court-circuite le tri : pour une ESN qui place des
    profils EN CDI chez ses clients, toute ouverture de poste est une piste,
    quel que soit le rôle — et c'est précisément celles que le tri IT lui
    cachait. L'axe est ORTHOGONAL au pack : il élargit, il ne remplace pas, donc
    un placeur informatique garde ses offres IT et gagne les autres.
    ``False`` par défaut ⇒ comportement d'avant.
    """
    if all_roles:
        return True
    domain_filter = job_filter_for(pack)
    if domain_filter is None:
        return is_it_offer(offer)
    return domain_filter.matches(offer)


def domain_offers(rows: list[dict], *, pack: str | None = None, all_roles: bool = False) -> list[dict]:
    """Le tri métier du VENDEUR (``is_domain_offer``) appliqué à des offres au contrat
    commun (``title``) : la règle unique des sources rangées au cache partagé (#4045)."""
    return [
        row
        for row in rows
        if isinstance(row, dict) and is_domain_offer({**row, "intitule": row.get("title")}, pack=pack, all_roles=all_roles)
    ]


def _clean(value: object) -> str | None:
    s = " ".join(str(value or "").split())
    return s or None


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


def _geo(lieu: dict) -> tuple[str | None, str | None, str | None]:
    """(location_label, department, city) — géo-localisation précise (France).

    ``lieuTravail.libelle`` a la forme ``"75 - PARIS 01"`` ; on en tire la ville
    (partie après le tiret) et, à défaut de ``codePostal``/``commune``, le
    département (les 2 premiers chiffres devant le tiret).
    """
    location = _clean(lieu.get("libelle"))
    code_postal = _clean(lieu.get("codePostal"))
    commune = _clean(lieu.get("commune"))
    # Département : codePostal[:2] > code INSEE commune[:2] > préfixe du libellé.
    department: str | None = None
    for candidate in (code_postal, commune):
        if candidate and len(candidate) >= 2 and candidate[:2].isdigit():
            department = candidate[:2]
            break
    city: str | None = None
    if location:
        m = re.match(r"^\s*(\d{2,3})\s*-\s*(.+)$", location)
        if m:
            if department is None:
                department = m.group(1)[:2]
            city = _clean(m.group(2))
        else:
            city = location
    return location, department, city


# #4045 (14/10) — le jeton OAuth vit ~25 min (``expires_in``) mais était redemandé
# à CHAQUE appel — et il consomme un créneau du limiteur (1 req/s) : une
# entreprise coûtait 3 requêtes dont 1 pour rien, et sur 36 entreprises la page
# s'épuisait avant d'avoir interrogé la moitié. Cache processus + Redis partagé
# (``provider_cache``) jusqu'à ``expires_in − 60 s`` (repli 1 200 s) ; un seul
# appelant concurrent renouvelle. Jamais loggé.
_TOKEN_SAFETY_S = 60.0
_TOKEN_FALLBACK_TTL_S = 1200.0
_TOKEN_NAMESPACE = "france_travail:oauth"
_token_cache: dict[str, object] = {}
_token_locks: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Lock] = weakref.WeakKeyDictionary()


def _now() -> float:
    return time.monotonic()


# R17 15/10 (#3901) — disjoncteur court : un OAuth refusé (401/403, clé invalide ou expirée)
# ne se rappelle pas à chaque carte / chaque page. Le refus est dit UNE fois (dégradation
# `unauthorized`), puis la source se tait cinq minutes sans aucun appel réseau.
_AUTH_DENIED_PAUSE_S = 300.0
_auth_denied_until: float = 0.0
# #4284.8 (#3901.15) — POURQUOI le dernier jeton n'est pas venu. Sans ça, tout échec (429, 5xx, délai) se lisait
# « accès refusé — clé invalide ou expirée » : un faux diagnostic. `None` = pas d'échec connu.
_token_failure: str | None = None


def token_failure_reason() -> str:
    """La cause (code `DegradeReason`) du dernier jeton manquant ; `unauthorized` quand aucune n'est connue."""
    return _token_failure or DegradeReason.UNAUTHORIZED


def _auth_denied() -> bool:
    return _now() < _auth_denied_until


def _reset_token_cache_for_tests() -> None:
    global _auth_denied_until, _token_failure
    _token_failure = None
    _token_cache.clear()
    _token_locks.clear()
    _auth_denied_until = 0.0


def _token_lock() -> asyncio.Lock:
    loop = asyncio.get_running_loop()
    lock = _token_locks.get(loop)
    if lock is None:
        lock = _token_locks[loop] = asyncio.Lock()
    return lock


def _cached_token() -> str | None:
    token = _token_cache.get("token")
    if isinstance(token, str) and token and _now() < float(_token_cache.get("exp") or 0.0):  # type: ignore[arg-type]
        return token
    return None


def invalidate_token() -> None:
    """Un 401 dit que le jeton gardé est mort : on l'oublie (processus ET Redis)."""
    _token_cache.clear()


async def _forget_shared_token(client_id: str) -> None:
    try:
        await provider_cache.set_json(_TOKEN_NAMESPACE, client_id, {"t": ""}, 1)
    except Exception:  # noqa: BLE001 — le cache partagé est best-effort
        pass


async def _token(
    http: httpx.AsyncClient, client_id: str, client_secret: str, *, force: bool = False
) -> str | None:
    if not force:
        cached = _cached_token()
        if cached:
            return cached
    if _auth_denied():
        _set_token_failure(DegradeReason.UNAUTHORIZED)
        record_degradation(
            get_correlation_id(),
            source="france_travail",
            reason="OAuth refusé (source hors circuit)",
            code=DegradeReason.UNAUTHORIZED,
        )
        return None
    async with _token_lock():
        if not force:
            cached = _cached_token()
            if cached:
                return cached
            try:
                shared = await provider_cache.get_json(_TOKEN_NAMESPACE, client_id)
            except Exception:  # noqa: BLE001
                shared = None
            if isinstance(shared, dict) and isinstance(shared.get("t"), str) and shared["t"]:
                ttl_left = float(shared.get("exp_wall") or 0) - time.time()
                if ttl_left > 0:
                    _token_cache.update(token=shared["t"], exp=_now() + ttl_left)
                    return str(shared["t"])
        token, ttl = await _request_token(http, client_id, client_secret)
        if token:
            _token_cache.update(token=token, exp=_now() + ttl)
            try:
                await provider_cache.set_json(_TOKEN_NAMESPACE, client_id, {"t": token, "exp_wall": time.time() + ttl}, int(ttl))
            except Exception:  # noqa: BLE001
                pass
        return token


def _set_token_failure(reason: str | None) -> None:
    global _token_failure
    _token_failure = reason


async def _request_token(
    http: httpx.AsyncClient, client_id: str, client_secret: str
) -> tuple[str | None, float]:
    try:
        # Le token compte dans le quota au même titre qu'une recherche.
        #
        # #4045.2 (14/10) — sous le budget d'un appelant interactif (Découvrir),
        # un 429 vaut UNE nouvelle tentative : `throttle()` attend le
        # refroidissement posé par `back_off_provider` (lu sur `Retry-After`)
        # s'il tient dans ce qui reste (#2521), et lève `RateLimitTimeout`
        # sinon. Jamais une boucle. Hors budget (collecte de fond), le chemin
        # est inchangé : un 429 est dit, pas retenté — même doctrine que
        # `recherche_entreprises.list_companies`.
        attempts = 2 if wait_budget_active() else 1
        for _attempt in range(attempts):
            async with throttle("france_travail"):
                resp = await http.post(
                    _TOKEN_URL,
                    params={"realm": "/partenaire"},
                    data={
                        "grant_type": "client_credentials",
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "scope": _SCOPE,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
            if resp.status_code != 429:
                break
            back_off_provider("france_travail", retry_after_header(resp))
        resp.raise_for_status()
        body = resp.json()
        token = str(body.get("access_token") or "") or None
        if token is None:
            note_fetch_error("france_travail: réponse OAuth sans jeton")
            _set_token_failure(DegradeReason.INVALID_RESPONSE)
            return None, 0.0
        _set_token_failure(None)
        try:
            lifetime = float(body.get("expires_in"))
        except (TypeError, ValueError):
            lifetime = _TOKEN_FALLBACK_TTL_S + _TOKEN_SAFETY_S
        return token, max(1.0, lifetime - _TOKEN_SAFETY_S)
    except Exception as exc:  # noqa: BLE001
        global _auth_denied_until
        _set_token_failure(reason_for_exception(exc))
        if reason_for_exception(exc) == DegradeReason.UNAUTHORIZED:
            _auth_denied_until = _now() + _AUTH_DENIED_PAUSE_S
            logger.warning(
                "France Travail: OAuth refusé (401/403) — source mise hors circuit %d s", int(_AUTH_DENIED_PAUSE_S)
            )
        logger.warning("France Travail token failed: %s", exc)
        # An OAuth refusal and "cette entreprise ne recrute pas" produced the same
        # empty list. They are opposite facts: one is our credentials, the other
        # is a finding about the target.
        record_degradation(
            get_correlation_id(),
            source="france_travail",
            reason=f"OAuth token refusé: {exc}",
            # #4045.3 — code MACHINE (`DegradeReason`), relu par `discover.py`
            # pour nourrir `degraded[]` : un texte libre n'y est jamais affiché.
            code=reason_for_exception(exc),
        )
        return None, 0.0


async def _search(http: httpx.AsyncClient, token: str, params: dict[str, str]) -> list[dict]:
    """Un appel /offres/search → la liste brute des offres. Lève en cas d'échec.

    #4045.2 (14/10) — même retry-dans-le-budget que ``_token`` ci-dessus : un
    429 sous un budget interactif (Découvrir) vaut une seconde tentative,
    jamais plus, jamais hors budget."""
    attempts = 2 if wait_budget_active() else 1
    for _attempt in range(attempts):
        async with throttle("france_travail"):
            resp = await http.get(
                _SEARCH_URL, params=params, headers={"Authorization": f"Bearer {token}"}
            )
        if resp.status_code != 429:
            break
        back_off_provider("france_travail", retry_after_header(resp))
    if resp.status_code in (204, 206):
        payload = resp.json() if resp.content else {}
    else:
        resp.raise_for_status()
        payload = resp.json()
    offres = payload.get("resultats") if isinstance(payload, dict) else None
    return [o for o in (offres or []) if isinstance(o, dict)]


async def _no_rows() -> list[dict]:
    return []


async def _search_authed(
    http: httpx.AsyncClient, params: dict[str, str], client_id: str, client_secret: str
) -> list[dict]:
    """``_search`` avec le jeton en cache ; un 401 l'invalide et rejoue UNE fois."""
    token = await _token(http, client_id, client_secret)
    if not token:
        raise RuntimeError("France Travail: jeton indisponible")
    try:
        return await _search(http, token, params)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code != 401:
            raise
        invalidate_token()
        await _forget_shared_token(client_id)
        fresh = await _token(http, client_id, client_secret, force=True)
        if not fresh:
            raise
        return await _search(http, fresh, params)


def _dedup_key(offer: dict) -> object:
    """Identité d'une offre — ``id`` quand l'API le fournit, sinon intitulé+date.

    Les deux requêtes (M18 et large) se recouvrent : la même offre revient dans
    les deux, elle ne doit être comptée qu'une fois.
    """
    oid = _clean(offer.get("id"))
    if oid:
        return oid
    return (_fold(offer.get("intitule")), str(offer.get("dateCreation") or ""))


def _mentions_company(offer: dict, company: str) -> bool:
    """L'offre est-elle VRAIMENT celle de l'entreprise cherchée ?

    #3901 — ``motsCles`` est une recherche PLEIN TEXTE côté France Travail,
    sans AUCUN scope serveur sur l'employeur (contrairement à l'intuition
    qu'on pourrait avoir d'une « recherche par entreprise ») : « Still »
    remonte aussi bien la société industrielle STILL que la MAIRIE DE STILL
    (Bas-Rhin) — même nom, deux entités sans rapport (bêta 08/10/2026). Même
    doctrine que le connecteur APEC (``apec._mentions_company``) : on refiltre
    sur ce que la source RÉPOND (nom de l'entreprise, sinon l'intitulé), et un
    employeur nommé « Mairie de X »/« Commune de X »… est écarté d'entrée,
    sauf si c'est littéralement l'administration cherchée.

    Une offre qu'on ne sait pas attribuer est ÉCARTÉE : mieux vaut un onglet
    plus court qu'un signal faux.
    """
    entreprise = offer.get("entreprise") if isinstance(offer.get("entreprise"), dict) else {}
    employer_name = entreprise.get("nom")
    if public_administration_mismatch(employer_name, company):
        return False
    needles = [_fold(v) for v in company_name_variants(company)]
    if not needles:
        return False
    for raw in (employer_name, offer.get("intitule")):
        haystack = _fold(raw)
        if haystack and any(needle in haystack for needle in needles):
            return True
    return False


@provider_cache.cached_by(
    "jobs:france_travail",
    # ⚠️ Le PACK entre dans la clé : sans lui, un vendeur industriel et une ESN
    # IT qui cherchent la même entreprise se partageraient le même cache et le
    # second lirait le tri du premier.
    # DECATHLON 11/10 — et ce qu'on sait du GROUPE (le résultat en est filtré) ;
    # préfixe `g2` : les résultats d'avant le rattachement groupe ne sont plus relus.
    lambda company, *, limit=12, pack=None, scope=None, siren=None, **_: (
        f"g2:{(company or '').strip().lower()}:{limit}:{pack or 'esn_it'}"
        f":{scope.fingerprint() if scope is not None else (siren or '')}"
    ),
    ttl=provider_cache.TTL_JOBS,
    empty_ttl=provider_cache.TTL_EMPTY_JOBS,
)
async def it_job_signals(
    company: str,
    *,
    limit: int = 12,
    pack: str | None = None,
    all_roles: bool = False,
    siren: str | None = None,
    scope: EmployerScope | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Recent IT job postings mentioning the company — enriched (contrat, salaire,
    expérience, ROME, entreprise, ville/département) + stack, RÉCENTES (< ~12 mois)
    et triées de la plus récente à la plus ancienne. Empty without credentials or
    on any error.

    DEUX requêtes en parallèle (voir le bloc « Tri IT » plus haut) :

    * ``domaine=M18`` — le tri IT de France Travail, haute précision : tout est gardé ;
    * sans filtre — rattrapage des offres IT au ROME mal saisi ; une offre n'est
      admise QUE si :func:`is_it_offer` le prouve sur son propre contenu.

    Si une des deux requêtes échoue, l'autre est quand même exploitée (on ne perd
    pas tout pour une erreur partielle) ; si les deux échouent, liste vide comme
    avant. Une entreprise qui ne recrute réellement pas reste à zéro — jamais de
    résultat approximatif pour combler un vide.

    #3817.1 — ``motsCles`` est un ET plein texte : un grand groupe enregistré
    sous une raison sociale à suffixe (« JCDecaux France ») peut n'avoir AUCUNE
    offre qui porte ce suffixe mot à mot, alors qu'il recrute réellement. Une
    première requête vide retente donc avec les formes réduites du nom (sans
    suffixe pays, sans forme juridique), puis le SIREN quand il est connu —
    jamais l'inverse : un nom complet qui répond déjà n'est pas élargi.
    """
    client_id, client_secret = _creds()
    cleaned = (company or "").strip()
    if not client_id or not client_secret or not cleaned:
        return []

    limit = max(1, min(limit, 20))
    # Fetch a bit of headroom so the recency filter still leaves ``limit`` items.
    fetch = min(50, max(limit + 12, 20))
    rng = f"0-{fetch - 1}"

    http = client if client is not None else get_shared_client("france_travail", timeout=_TIMEOUT_S)
    try:
        token = await _token(http, client_id, client_secret)
        if not token:
            # Le jeton refusé / absent n'est PAS « cette entreprise ne recrute pas » :
            # `_request_token` a déjà noté l'erreur (record_degradation), on le
            # redit ici pour le cas où le cache a rendu None sans avoir appelé.
            note_fetch_error("france_travail: jeton indisponible")
            return []
    except Exception as exc:  # noqa: BLE001 — a source must never break research
        logger.warning("France Travail search failed for %r: %s", cleaned, exc)
        record_degradation(
            get_correlation_id(), source="france_travail", reason=str(exc), code=reason_for_exception(exc)
        )
        return []

    domain_filter = job_filter_for(pack)
    strict_res: list[dict] | BaseException = []
    broad_res: list[dict] | BaseException = []
    for variant in company_name_variants(cleaned, siren=siren):
        try:
            # Domaine M18 = informatique / télécoms. ``motsCles`` matches the company.
            #
            # Pour un pack NON-IT, la requête stricte n'a pas d'équivalent côté
            # serveur : le paramètre `domaine` attend un code du référentiel France
            # Travail, et en inventer un rendrait silencieusement zéro offre. On garde
            # donc la seule requête LARGE et le filtre du pack juge côté client — le
            # mécanisme de rattrapage qui existait déjà, appliqué à un autre métier.
            broad_params = {"motsCles": variant, "range": f"0-{_BROAD_FETCH - 1}"}
            # #1124 — en placement, la requête M18 n'a plus de sens : elle BIAISE
            # vers l'informatique le lot qu'on veut justement large. On garde la
            # seule requête large, comme pour un pack non-IT.
            if domain_filter is None and not all_roles:
                strict_params = {"motsCles": variant, "domaine": "M18", "range": rng}
                if wait_budget_active():
                    # #4045 (14/10) — sous le budget interactif de Découvrir, le
                    # limiteur sert 1 req/s : la requête M18 (haute précision,
                    # l'offre IT arrive en tête) est la plus informative par
                    # créneau ; la large (150 lignes dominées par le bruit,
                    # filtrées côté client) double le coût pour un rattrapage
                    # de ROME mal saisis. Une seule requête = deux fois plus de
                    # cartes interrogées avant la fin du budget.
                    strict_res, broad_res = await asyncio.gather(
                        settled(_search_authed(http, strict_params, client_id, client_secret)), _no_rows(),
                        return_exceptions=True,
                    )
                else:
                    strict_res, broad_res = await asyncio.gather(
                        settled(_search_authed(http, strict_params, client_id, client_secret)),
                        settled(_search_authed(http, broad_params, client_id, client_secret)),
                        return_exceptions=True,
                    )
            else:
                strict_res = []
                broad_res = await _search_authed(http, broad_params, client_id, client_secret)
        except Exception as exc:  # noqa: BLE001 — a source must never break research
            logger.warning("France Travail search failed for %r: %s", variant, exc)
            # Report the REAL cause: without it the run can only say "aucun
            # résultat", which reads identically to a company that genuinely has
            # nothing here — opposite facts, same message.
            record_degradation(
                get_correlation_id(), source="france_travail", reason=str(exc), code=reason_for_exception(exc)
            )
            strict_res, broad_res = [], []
            continue

        if isinstance(strict_res, BaseException):
            logger.warning("France Travail M18 search failed for %r: %s", variant, strict_res)
            # #4045.3 — une des DEUX requêtes parallèles (gather) peut échouer sans
            # jamais traverser le `except` ci-dessus : sans ce rappel, un 429 sur
            # la seule requête M18 (l'autre réussissant) ne remontait NULLE PART —
            # ni `degraded[]` du routeur, ni même ce `note_fetch_error`.
            record_degradation(
                get_correlation_id(),
                source="france_travail",
                reason=str(strict_res),
                code=reason_for_exception(strict_res),
            )
            strict_res = []
        if isinstance(broad_res, BaseException):
            logger.warning("France Travail broad search failed for %r: %s", variant, broad_res)
            record_degradation(
                get_correlation_id(),
                source="france_travail",
                reason=str(broad_res),
                code=reason_for_exception(broad_res),
            )
            broad_res = []
        # #4016 SIG-D3 — page 1 saturée (150 rendues) : l'offre utile peut être plus loin.
        # Même syntaxe `range=a-b` que la page 1 ; un échec ne perd pas la page 1.
        if len(broad_res) >= _BROAD_FETCH:
            try:
                broad_res = [
                    *broad_res,
                    *await _search_authed(
                        http,
                        {"motsCles": variant, "range": f"{_BROAD_FETCH}-{2 * _BROAD_FETCH - 1}"},
                        client_id,
                        client_secret,
                    ),
                ]
            except Exception as exc:  # noqa: BLE001 — la 2e page est un bonus
                logger.warning("France Travail broad page 2 failed for %r: %s", variant, exc)
        if strict_res or broad_res:
            break

    if not strict_res and not broad_res:
        return []

    # Les offres M18 sont acquises (France Travail les a elle-même classées IT) ;
    # celles de la requête large doivent prouver qu'elles sont IT.
    #
    # #3901 — ``motsCles`` ne scope PAS sur l'employeur côté serveur : chaque
    # offre (M18 incluse) doit en plus prouver qu'elle appartient VRAIMENT à
    # ``cleaned`` (``_mentions_company``), jamais à un homonyme administratif
    # ou sans rapport — même doctrine que le connecteur APEC.
    seen: set[object] = set()
    offres: list[dict] = []
    for offer in strict_res:
        key = _dedup_key(offer)
        if key not in seen and _mentions_company(offer, cleaned):
            seen.add(key)
            offres.append(offer)
    for offer in broad_res:
        key = _dedup_key(offer)
        if key not in seen and is_domain_offer(offer, pack=pack, all_roles=all_roles) and _mentions_company(
            offer, cleaned
        ):
            seen.add(key)
            offres.append(offer)

    fresh_cutoff = datetime.now(UTC) - timedelta(days=_MAX_AGE_DAYS)
    _min = datetime.min.replace(tzinfo=UTC)

    scored: list[tuple[datetime, dict]] = []
    dropped_unattributed = 0
    # DECATHLON 11/10 — rattachement au niveau du GROUPE (subdivisions nommées,
    # entités connues du registre, SIREN) : 31 offres « non attribuées » sur le run
    # 9c76e009 étaient celles d'entités du groupe.
    group = scope if scope is not None else EmployerScope.build(cleaned, siren=siren)
    for o in offres or []:
        if not isinstance(o, dict):
            continue
        lieu = o.get("lieuTravail") if isinstance(o.get("lieuTravail"), dict) else {}
        entreprise = o.get("entreprise") if isinstance(o.get("entreprise"), dict) else {}
        # #3901 — `motsCles` est plein texte, sans filtre employeur : une offre
        # dont l'employeur est absent ou autre (« Mairie de Still » pour le
        # compte « Still ») est ÉCARTÉE, jamais rattachée.
        if not group.matches(entreprise.get("nom"), employer_siren=entreprise.get("siret")):
            dropped_unattributed += 1
            continue
        salaire = o.get("salaire") if isinstance(o.get("salaire"), dict) else {}
        skills = [c.get("libelle") for c in (o.get("competences") or []) if isinstance(c, dict) and c.get("libelle")]

        created = _parse_date(o.get("dateCreation"))
        updated = _parse_date(o.get("dateActualisation"))
        # Recency reference = the freshest of creation / last-update.
        ref = max([d for d in (created, updated) if d is not None], default=None)
        # RECENCY: au-delà du plafond d'historique seulement ; entre 12 mois et le plafond,
        # l'offre est gardée et estampillée (#4754). Une date illisible reste gardée.
        # Lot 762 : plus de borne d'âge de stockage (« pas de limite »).
        historical = {"historical": True} if ref is not None and ref < fresh_cutoff else {}

        location, department, city = _geo(lieu)
        # #2322.70 — « tension » = l'offre que la SOURCE signale en manque de
        # candidats (`offresManqueCandidats`). Posée seulement quand elle le dit
        # vrai : faux ou absent ne fait aucune clé, jamais une tension devinée.
        tension = {"tension": True} if o.get("offresManqueCandidats") is True else {}
        scored.append(
            (
                ref or _min,
                {
                    **tension,
                    **historical,
                    # Existing keys (kept verbatim for backward compat).
                    "title": str(o.get("intitule") or "").strip(),
                    "location": location or "",
                    "date": o.get("dateCreation"),
                    "contractType": o.get("typeContratLibelle") or o.get("typeContrat"),
                    # #2291.2 — le CODE natif (MIS, LIB, CDI…), à côté du
                    # libellé : l'observation du modèle de contrat
                    # (`contract_model.py`) classe le code, jamais le libellé.
                    "contractCode": _clean(o.get("typeContrat")),
                    "skills": skills[:12],
                    # Enriched keys (max signal).
                    "updatedDate": o.get("dateActualisation"),
                    "experience": _clean(o.get("experienceLibelle")),
                    "salary": _clean(salaire.get("libelle")),
                    "romeCode": _clean(o.get("romeCode")),
                    # #4469 — le texte de l'offre : la recherche par compétence y re-vérifie le mot (hors lieu).
                    "description": _clean(o.get("description")),
                    "romeLabel": _clean(o.get("romeLibelle")),
                    "company": _clean(entreprise.get("nom")),
                    "department": department,
                    "city": city,
                },
            )
        )

    if dropped_unattributed:
        logger.info("France Travail %r: dropped_unattributed=%d (#3901)", cleaned, dropped_unattributed)
    # Sort most-recent first; unparseable dates (``_min``) sink to the end.
    scored.sort(key=lambda t: t[0], reverse=True)
    # #4044 — une offre de STAGE n'est jamais un signal (décision Louis 12/10).
    return drop_internship_postings([item for _dt, item in scored[:limit]], title_keys=("title",), contract_keys=("contractType",))


# ───────────────────────────────────────────────────────────────────────────
# Prospection INVERSÉE — lister les EMPLOYEURS qui recrutent IT (Découvrir v2)
#
# `it_job_signals` part d'une entreprise et cherche ses offres. Ici on part du
# TERRITOIRE (département + fenêtre) et on remonte les employeurs : un compte
# qui ouvre 5 postes data a un projet qui démarre. ADDITIF — le chemin
# mono-entreprise est inchangé.
# ───────────────────────────────────────────────────────────────────────────

SOURCE_NAME = "France Travail"


def _offer_url(o: dict) -> str | None:
    origine = o.get("origineOffre") if isinstance(o.get("origineOffre"), dict) else {}
    return _clean(origine.get("urlOrigine")) or _clean(o.get("url"))


#: Offres demandées à France Travail par la recherche d'un compte « par métier » (plafond de l'API : 150).
_ACCOUNT_TERM_FETCH = 150


async def account_term_offers(
    company: str, term: str, *, limit: int = 50, client: httpx.AsyncClient | None = None
) -> list[dict] | None:
    """Louis 30/10 — les offres de ``company`` pour le métier ``term`` (vide : tous métiers), au plus ``limit``.

    La recherche « par métier » de la fiche compte : sans quota partagé (le quota Adzuna du jour, épuisé à 13 h
    le 30/10, la rendait muette). ``motsCles`` = nom + métier, puis l'employeur se PROUVE (``_mentions_company``) —
    jamais un homonyme. ``None`` = la source n'a pas pu partir (sans identifiants, jeton refusé, panne) : une liste
    vide ne se lit jamais « aucune offre »."""
    client_id, client_secret = _creds()
    cleaned = (company or "").strip()
    if not client_id or not client_secret or not cleaned:
        return None
    wanted = " ".join((term or "").split())
    http = client if client is not None else get_shared_client("france_travail", timeout=_TIMEOUT_S)
    params = {"motsCles": f"{cleaned} {wanted}".strip(), "range": f"0-{_ACCOUNT_TERM_FETCH - 1}"}
    try:
        raw = await _search_authed(http, params, client_id, client_secret)
    except Exception as exc:  # noqa: BLE001 — une source ne casse jamais l'écran
        logger.warning("France Travail account_term_offers failed for %r: %s", cleaned, exc)
        return None
    rows: list[dict] = []
    for o in raw:
        if not _mentions_company(o, cleaned):
            continue
        entreprise = o.get("entreprise") if isinstance(o.get("entreprise"), dict) else {}
        lieu = o.get("lieuTravail") if isinstance(o.get("lieuTravail"), dict) else {}
        location, _department, city = _geo(lieu)
        rows.append(
            {
                "title": str(o.get("intitule") or "").strip(),
                "company": _clean(entreprise.get("nom")),
                "city": city or location or None,
                "url": _offer_url(o),
                "date": o.get("dateCreation"),
                "contractType": o.get("typeContratLibelle") or o.get("typeContrat"),
                "source": "france_travail",
            }
        )
    rows.sort(key=lambda r: str(r.get("date") or ""), reverse=True)
    return drop_internship_postings(rows, title_keys=("title",), contract_keys=("contractType",))[:limit]


# #4045.1 (14/10) — recette R7a : « Technicien SAV - Frigoriste Cuisiniste » et
# « Responsable Pays » sortaient encore en RECRUTEMENT pour un profil ESN IT RÉEL.
# Cause : `profile_job_scope` traite un profil sans `offerDomain` déclaré comme
# une ABSENCE de profil (#3901, « sans profil ⇒ on ne filtre pas »). Or un vrai
# profil d'espace (nom, zones…) qui ne déclare pas `offerDomain` n'est pas
# anonyme : c'est l'ESN IT IMPLICITE, le défaut du produit — jamais écrit dans
# le profil parce qu'il n'y a rien à cocher. `seller_pack` (`discover.py`,
# `phase1_research.py`) le résout déjà ainsi pour `it_job_signals` via
# `normalize_offer_domain` ; cette moisson par territoire (`list_hiring_
# companies`) recevait le profil BRUT, jamais résolu. `profile=None` (aucun
# profil DU TOUT — territoire exploré sans contexte commercial) garde le
# comportement d'avant à l'octet près : rien n'est écarté (#3901, test déjà
# gardé : ``test_list_hiring_companies_it_label.py``).
def _resolved_hiring_profile(profile: dict | None) -> dict | None:
    if profile is None or profile_job_scope(profile) is not None:
        return profile
    resolved = dict(profile)
    resolved["offerDomain"] = normalize_offer_domain(resolved.get("offerDomain"))
    return resolved


def _header_of(resp: object, name: str) -> str | None:
    headers = getattr(resp, "headers", None)
    try:
        value = headers.get(name) if headers is not None else None
    except Exception:  # noqa: BLE001 — un en-tête illisible = pas de total, jamais une panne
        return None
    return value if isinstance(value, str) and value.strip() else None


def content_range_total(value: object) -> int | None:
    """#5009.1 — le TOTAL d'un en-tête ``Content-Range`` (« offres 0-149/412 » → 412 ; « offres */0 » → 0).
    ``*`` ou absent ou illisible : ``None`` — jamais estimé."""
    match = re.search(r"/\s*(\d+)\s*$", value.strip()) if isinstance(value, str) else None
    return int(match.group(1)) if match else None


async def list_hiring_companies(
    department: str | None = None,
    keywords: list[str] | None = None,
    since_days: int = 90,
    limit: int = 25,
    *,
    commune_code: str | None = None,
    distance_km: int | None = None,
    client: httpx.AsyncClient | None = None,
    profile: dict | None = None,
    offset: int = 0,
    page_stats: dict[str, int] | None = None,
) -> list[dict]:
    """Employeurs ayant publié une offre récente sur le territoire, pertinente pour le PROFIL (#3901).

    ``page_stats`` (#4796) : si fourni, reçoit ``asked`` (la plage demandée) et ``raw`` (les offres rendues par
    l'API, avant tout filtre local) — c'est ce qui dit à la pagination de Découvrir si la page était pleine.

    ``offset`` (#4419.2) : le début de la plage d'offres lue (``range`` documenté de l'API) — la lecture
    nationale de Découvrir par compétence lit ainsi sa page suivante. Défaut 0 : requête inchangée.

    Chaque ligne : l'employeur tel que France Travail le nomme (``name``,
    ``department``, ``city`` ; l'API ne donne PAS de SIREN — il est résolu en
    aval, jamais inventé) + un ``signal`` ``DiscoverSignal`` (``type='hiring'``).
    Les offres anonymisées (aucun employeur nommé) sont écartées.

    Sans identifiants (FRANCE_TRAVAIL_CLIENT_ID/SECRET) : **aucun appel réseau**
    et :class:`SignalSourceUnavailable` — la source apparaît en ``degraded``,
    elle n'est jamais confondue avec « aucun résultat ».

    ─────────────────────────────────────────────────────────────────────────
    LA MAILLE FINE : ``commune_code`` (+ ``distance_km``)
    ─────────────────────────────────────────────────────────────────────────
    L'écran Territoire sait désormais désigner une VILLE ou un CERCLE, pas
    seulement un département. L'API porte les paramètres correspondants
    (``commune``, code INSEE, et ``distance`` en km), mais **nous n'avons pas pu
    les vérifier sur une instance réelle** — il faut des identifiants, et un
    contrat d'API non vérifiable ne se devine pas.

    D'où la forme retenue : on TENTE la maille fine, et si la requête est
    refusée on rejoue UNE fois à la maille département, en posant
    ``coarseFallback`` sur chaque ligne. L'appelant sait alors que ce qu'il a
    n'est pas ce qu'il a demandé, et l'écran le DIT — au lieu d'étiqueter un
    département entier « à 12 km de Toulouse ».

    ⚠️ Un refus n'est pas une panne : si le repli répond, la source n'est PAS
    indisponible. Les confondre ferait disparaître un marché qui existe.
    """
    client_id, client_secret = _creds()
    if not client_id or not client_secret:
        # #2469 — clé machine, jamais une phrase : l'écran traduit et accorde.
        # Le nom des variables d'environnement n'a rien à faire sous les yeux d'un
        # commercial ; il est dans `agent_docs/env-reference.md`, pour l'opérateur.
        raise SignalSourceUnavailable(SOURCE_NAME, DegradeReason.MISSING_API_KEY)

    # #4420 — la plage lue (``fetch``) va jusqu'à 150 offres : un plafond de 100 jetait les plus anciennes d'une page déjà payée.
    limit = max(1, min(int(limit or 1), 150))
    dept = normalize_department(department)
    days = max(1, int(since_days or 1))
    # ``minCreationDate`` et ``maxCreationDate`` sont DÉPENDANTS côté API : envoyer
    # l'un sans l'autre renvoie un 400 (« doivent être renseignés ensemble »), pas
    # une plage ouverte. La borne haute est donc « maintenant ».
    now = datetime.now(UTC)
    min_creation = (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    max_creation = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    # Marge de fetch : beaucoup d'offres sont anonymisées ou dupliquées par employeur.
    fetch = min(150, max(limit * 4, 50))

    http = client if client is not None else get_shared_client("france_travail", timeout=_TIMEOUT_S)
    token = await _token(http, client_id, client_secret)
    if not token:
        # #4284.8 — la VRAIE cause : « accès refusé » ne se dit que d'un refus (401/403), pas d'un 429 ni d'un 5xx.
        raise SignalSourceUnavailable(SOURCE_NAME, token_failure_reason())
    params: dict[str, str] = {
        "minCreationDate": min_creation,
        "maxCreationDate": max_creation,
        "range": f"{max(0, int(offset))}-{max(0, int(offset)) + fetch - 1}",
    }
    # #3901 — « ce n'est plus offre IT, c'est offre tout court » : le domaine M18 (informatique /
    # télécoms) ne part QUE si le profil déclare un périmètre purement IT. Sans profil, ou pour une
    # ESN industrie / cyber / métiers placés, on ne cache pas les offres côté serveur ; la
    # pertinence se juge ensuite sur le profil (`offer_relevant_to_profile`).
    scope = profile_job_scope(profile)
    # 11/10/2026 — un métier DÉDUIT (cyber, industrie…) lève aussi le M18 : il élargit.
    if scope is not None and not scope.any_role and not scope.role_terms and not inferred_role_terms(profile) and all(
        job_filter_for(p) is None for p in scope.packs
    ):
        params["domaine"] = "M18"
    if dept:
        params["departement"] = dept
    cleaned_keywords = [k for k in (str(k or "").strip().lower() for k in (keywords or [])) if k]
    if cleaned_keywords:
        params["motsCles"] = ",".join(cleaned_keywords[:8])

    # La maille FINE, en premier essai. `commune` remplace `departement` :
    # les envoyer ensemble laisserait l'API choisir, et on ne saurait pas
    # lequel a gagné.
    fine = dict(params)
    if commune_code:
        fine.pop("departement", None)
        fine["commune"] = str(commune_code)
        if distance_km:
            fine["distance"] = str(max(0, int(distance_km)))

    coarse_fallback = False
    retried_401: list[bool] = []
    #: #5009.1 — le total « trouvées » que l'API publie dans ``Content-Range`` de la réponse reçue (zéro appel de plus).
    content_range: list[str | None] = [None]

    async def _call(query: dict[str, str]):
        nonlocal token
        # ⚠️ lot 16 / GA-322 : cette fermeture est le SEUL appelant
        # France Travail à ne pas passer par le limiteur partagé, alors
        # que _token/_search juste au-dessus le font — la forme « voisin
        # non limité » exacte de PR #631, sur une clé qui l'a déjà payée.
        #
        # #4045.2 — même retry-dans-le-budget que ``_search``/``_token``.
        attempts = 2 if wait_budget_active() else 1
        for _attempt in range(attempts):
            async with throttle("france_travail"):
                resp = await http.get(_SEARCH_URL, params=query, headers={"Authorization": f"Bearer {token}"})
            if resp.status_code != 429:
                break
            back_off_provider("france_travail", retry_after_header(resp))
        if resp.status_code == 401 and not retried_401:
            # Jeton gardé mort : on l'oublie et on rejoue UNE fois avec un neuf.
            retried_401.append(True)
            invalidate_token()
            await _forget_shared_token(client_id)
            fresh = await _token(http, client_id, client_secret, force=True)
            if fresh:
                token = fresh
                return await _call(query)
        content_range[0] = _header_of(resp, "content-range")
        if resp.status_code in (204, 206):
            if resp.status_code == 204:
                content_range[0] = "offres */0"  # 204 : la source dit « aucun résultat »
            return resp.json() if resp.content else {}
        resp.raise_for_status()
        return resp.json()

    try:
        payload = await _call(fine)
    except Exception as exc:  # noqa: BLE001
        if fine is params or not commune_code:
            logger.warning("France Travail hiring listing failed (dept=%s): %s", dept, exc)
            # #2469 — clé machine ; le détail de l'exception reste au journal, ci-dessus.
            raise SignalSourceUnavailable(SOURCE_NAME, reason_for_exception(exc)) from exc
        # ⚠️ Le refus peut venir des paramètres FINS que nous n'avons pas pu
        # vérifier. On rejoue à la maille département AVANT de déclarer la
        # source morte — un marché qui existe ne doit pas disparaître parce
        # qu'on a demandé trop précis.
        logger.info(
            "France Travail: maille fine refusée (commune=%s distance=%s) — repli département %s : %s",
            commune_code, distance_km, dept, exc,
        )
        try:
            payload = await _call(params)
            coarse_fallback = True
        except Exception as coarse_exc:  # noqa: BLE001
            logger.warning("France Travail hiring listing failed (dept=%s): %s", dept, coarse_exc)
            # #2469 — clé machine ; le détail de l'exception reste au journal, ci-dessus.
            raise SignalSourceUnavailable(SOURCE_NAME, reason_for_exception(coarse_exc)) from coarse_exc

    offres = payload.get("resultats") if isinstance(payload, dict) else None
    if page_stats is not None:
        page_stats.update(asked=fetch, raw=len(offres or []))
        total = content_range_total(content_range[0])
        if total is not None:
            page_stats["total"] = total
    cutoff = datetime.now(UTC) - timedelta(days=days)

    # #4045.1 — un profil réel sans `offerDomain` déclaré est l'ESN IT implicite,
    # pas une absence de profil : voir `_resolved_hiring_profile`.
    resolved_profile = _resolved_hiring_profile(profile)
    rows: list[tuple[datetime, dict]] = []
    for o in offres or []:
        if not isinstance(o, dict):
            continue
        if not offer_relevant_to_profile(o, resolved_profile, it_check=is_it_offer):
            continue  # #3901 — hors du périmètre du profil (sans profil : rien n'est écarté)
        entreprise = o.get("entreprise") if isinstance(o.get("entreprise"), dict) else {}
        employer = _clean(entreprise.get("nom"))
        if not employer:
            continue  # offre anonymisée — aucun compte à prospecter, on n'invente pas
        # SIMON-FIX S.14 — la date affichée est celle de PUBLICATION de l'offre (``dateCreation``), jamais
        # celle de sa dernière actualisation : une offre rafraîchie chaque nuit se lisait « datée du jour ».
        created = _parse_date(o.get("dateCreation"))
        if created is None or created < cutoff:
            continue  # date de publication obligatoire ET dans la fenêtre demandée
        _location, row_dept, city = _geo(o.get("lieuTravail") if isinstance(o.get("lieuTravail"), dict) else {})
        row_dept = normalize_department(row_dept)
        if dept and row_dept and row_dept != dept:
            continue
        title = _clean(o.get("intitule"))
        detail = " · ".join(
            p for p in (
                _clean(o.get("typeContratLibelle") or o.get("typeContrat")) or "",
                _clean(o.get("romeLibelle")) or "",
            ) if p
        )
        # #3097 — même champs que `it_job_signals` (offres PAR compte) : le
        # niveau d'expérience et le salaire, seulement quand LA SOURCE les
        # affiche (`_clean` rend `None` sinon) — jamais un TJM/une séniorité
        # estimés. Portés à côté de `signal`, comme `contractCode` ci-dessus :
        # ce sont des faits sur L'OFFRE, pas le texte affiché à l'écran.
        salaire = o.get("salaire") if isinstance(o.get("salaire"), dict) else {}
        rows.append(
            (
                created,
                {
                    "name": employer,
                    "siren": None,  # l'API n'expose pas de SIREN — résolu en aval
                    "department": row_dept or dept,
                    "city": city,
                    # #4515 (lot DÉCOUVRIR-MOTEUR, 27/10) — la position du lieu de travail, quand l'offre la publie :
                    # le rayon d'une ville s'y mesure (Découvrir par compétence). Absente : aucune clé.
                    **published_position(o.get("lieuTravail") if isinstance(o.get("lieuTravail"), dict) else {}),
                    # La maille demandée a-t-elle été obtenue ? `True` = non :
                    # l'API a refusé `commune`/`distance` et ces lignes couvrent
                    # le DÉPARTEMENT. L'écran le dit ; sans ce drapeau il
                    # étiquetterait un département « à 12 km de Toulouse ».
                    "coarseFallback": coarse_fallback,
                    # #2291.2 — le CODE natif de contrat (MIS, LIB, CDI…) :
                    # l'observation du modèle de contrat de l'employeur se lit
                    # dessus (`discover_signals._build_candidates`), zéro appel
                    # de plus. Jamais le libellé (`detail`, ci-dessous).
                    "contractCode": _clean(o.get("typeContrat")),
                    # #3901.w — le métier de l'offre, tel que la source le publie : l'affichage
                    # décide du secteur (profil déclaré), pas l'IA.
                    "romeCode": _clean(o.get("romeCode")),
                    "romeLabel": _clean(o.get("romeLibelle")),
                    # #4469 — le texte de l'offre voyage : la recherche par compétence (``_france_travail_read``)
                    # y relit le mot ; sans lui, elle ne lisait que l'intitulé.
                    "description": _clean(o.get("description")),
                    # #3097 — voir le commentaire juste au-dessus.
                    "experienceLabel": _clean(o.get("experienceLibelle")),
                    "salaryLabel": _clean(salaire.get("libelle")),
                    "signal": {
                        "type": "hiring",
                        # #3901.v/.w — l'IA ne fige JAMAIS « IT » : l'étiquette de secteur se
                        # décide à l'AFFICHAGE par le profil déclaré (`placed_roles`) ; le code
                        # ROME voyage à côté (`romeCode`/`romeLabel`), jamais un secteur deviné.
                        "label": f"Recrutement — {title}" if title else "Recrutement",
                        "date": created.date().isoformat(),
                        "url": _offer_url(o),
                        "detail": detail or None,
                    },
                },
            )
        )

    rows.sort(key=lambda t: t[0], reverse=True)
    # #4044 — idem pour le balayage de territoire : un stage ne désigne aucun compte à prospecter.
    return drop_internship_postings([row for _dt, row in rows[:limit]], title_keys=("title",), contract_keys=("contractType",))
