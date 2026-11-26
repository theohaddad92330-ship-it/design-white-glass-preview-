"""Préremplissage du profil ESN à partir du seul nom de la société.

« Je tape *Kicklox*, le questionnaire d'onboarding arrive déjà rempli. » Le
service collecte en parallèle les sources publiques (registre gratuit, Pappers,
recherche web, stack technique du site) puis produit une valeur PAR CHAMP avec sa
provenance et sa confiance.

Deux étages, volontairement séparés :

* **Déterministe, sans LLM** — nom, tranche d'effectif (codes INSEE), zone géo
  (code postal → département → région) et domaine d'offre (NAF). Ce sont des
  faits registre : un LLM n'y apporterait que du bruit.
* **LLM (Haiku, un seul appel)** — expertises, secteurs cibles, positionnement,
  modèle de staffing, types d'entreprises visées. Le modèle CHOISIT dans le
  catalogue fermé fourni par l'appelant ; tout ce qu'il renvoie est revalidé
  ensuite contre ce catalogue.

Règle projet non négociable : **jamais de donnée fictive**. Un champ que rien ne
fonde reste ABSENT de la réponse (le front l'affiche « à compléter »). Chaque
source échoue indépendamment et silencieusement : une clé manquante ou une API
en carafe dégrade le préremplissage, elle ne casse jamais l'onboarding.
"""

from __future__ import annotations

import asyncio
import logging
import re
import unicodedata
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, Field

from app.prompts.bellum_esn_prefill import LLM_FIELD_KEYS, MULTI_VALUE_KEYS, build_system_prompt, build_user_prompt
from app.services import esn_candidate_ranking, provider_cache
from app.services.claude_service import CLAUDE_HAIKU_MODEL, call_claude
from app.services.data_gateway import brave_search_single
from app.services.data_sources import recherche_entreprises, tech_detect
from app.services.esn_candidate_ranking import EsnCandidate, rank_candidates, should_auto_select

logger = logging.getLogger(__name__)

# Cap contractuel des deux multi-selects groupés (ONBOARDING_MAX_MULTI côté TS).
MAX_MULTI = 5

_CONFIDENCES = ("high", "medium", "low")

# ─────────────────────────────────────────────────────────────────────────────
# Tranches d'effectif salarié INSEE (``tranche_effectif_salarie``) → (min, max).
# « NN » (ou code absent/inconnu) = effectif non renseigné : le champ est alors
# OMIS, jamais rempli par défaut.
# ─────────────────────────────────────────────────────────────────────────────
INSEE_HEADCOUNT_TRANCHES: dict[str, tuple[int, int]] = {
    "00": (0, 0),
    "01": (1, 2),
    "02": (3, 5),
    "03": (6, 9),
    "11": (10, 19),
    "12": (20, 49),
    "21": (50, 99),
    "22": (100, 199),
    "31": (200, 249),
    "32": (250, 499),
    "41": (500, 999),
    "42": (1000, 1999),
    "51": (2000, 4999),
    "52": (5000, 9999),
    "53": (10000, 10000),
}

# Libellé humain de la tranche — affiché tel quel dans l'en-tête de match.
INSEE_HEADCOUNT_LABELS: dict[str, str] = {
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

# Buckets du questionnaire (ESN_ANSWER_OPTIONS.consultant_size), bornes hautes.
_CONSULTANT_SIZE_BUCKETS: tuple[tuple[int, str], ...] = (
    (10, "1-10"),
    (30, "10-30"),
    (80, "30-80"),
    (200, "80-200"),
    (500, "200-500"),
)
_CONSULTANT_SIZE_TOP = "500+"

# ─────────────────────────────────────────────────────────────────────────────
# Département → zone géo du questionnaire. Table EXPLICITE : un département qui
# n'y figure pas (Normandie, Bourgogne-Franche-Comté, Centre-Val de Loire,
# Corse, DOM) ne correspond à AUCUNE des 12 valeurs autorisées → le champ est
# omis. On n'invente surtout pas « National » pour combler.
# ─────────────────────────────────────────────────────────────────────────────
_DEPARTMENT_ZONES: dict[str, str] = {
    **{d: "Paris & Île-de-France" for d in ("75", "77", "78", "91", "92", "93", "94", "95")},
    **{
        d: "Lyon & Auvergne-Rhône-Alpes"
        for d in ("01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74")
    },
    **{d: "Lille & Hauts-de-France" for d in ("02", "59", "60", "62", "80")},
    **{d: "Nantes & Pays de la Loire" for d in ("44", "49", "53", "72", "85")},
    **{
        d: "Bordeaux & Nouvelle-Aquitaine"
        for d in ("16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87")
    },
    **{
        d: "Toulouse & Occitanie"
        for d in ("09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82")
    },
    **{d: "Marseille & PACA" for d in ("04", "05", "06", "13", "83", "84")},
    **{d: "Strasbourg & Grand Est" for d in ("08", "10", "51", "52", "54", "55", "57", "67", "68", "88")},
    **{d: "Rennes & Bretagne" for d in ("22", "29", "35", "56")},
}

# La connaissance NAF « est-ce une ESN ? » (préfixes IT, libellés officiels,
# codes structurellement incompatibles) vit dans ``esn_candidate_ranking``, qui
# en a besoin pour classer les homonymes. Elle n'est PAS dupliquée ici : les deux
# étages doivent répondre exactement la même chose sur un même code.

# Nombre de lignes demandées au registre avant classement. On demande plus large
# que ce qu'on expose (``MAX_CANDIDATES``) : la bonne entité est parfois 6ᵉ dans
# le classement plein-texte du registre, et le tri est fait chez nous.
CANDIDATE_FETCH_LIMIT = 10

# Domaines à ignorer quand on cherche le SITE de la société : annuaires,
# agrégateurs, job boards et réseaux sociaux ne sont pas le site de l'ESN. Le
# match se fait sur le domaine (ou un de ses sous-domaines), JAMAIS en sous-chaîne
# — sinon « kicklox.com » serait rejeté par « x.com ».
_NON_WEBSITE_DOMAINS = frozenset(
    {
        "societe.com",
        "pappers.fr",
        "verif.com",
        "infogreffe.fr",
        "data.gouv.fr",
        "linkedin.com",
        "facebook.com",
        "twitter.com",
        "x.com",
        "instagram.com",
        "youtube.com",
        "tiktok.com",
        "wikipedia.org",
        "indeed.com",
        "indeed.fr",
        "glassdoor.com",
        "glassdoor.fr",
        "welcometothejungle.com",
        "bpifrance.fr",
        "usinenouvelle.com",
        "manageo.fr",
        "lefigaro.fr",
    }
)

# #2640.1 — une boîte mail PERSONNELLE n'identifie aucune entreprise : ces
# domaines ne départagent jamais un site parmi les hits, ils dégradent en
# silence vers le comportement historique (premier hit crédible).
_GENERIC_EMAIL_DOMAINS = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "outlook.com",
        "outlook.fr",
        "hotmail.com",
        "hotmail.fr",
        "yahoo.com",
        "yahoo.fr",
        "icloud.com",
        "me.com",
        "live.com",
        "live.fr",
        "msn.com",
        "free.fr",
        "orange.fr",
        "wanadoo.fr",
        "laposte.net",
        "sfr.fr",
        "aol.com",
        "protonmail.com",
        "gmx.com",
        "gmx.fr",
    }
)


# ─────────────────────────────────────────────────────────────────────────────
# Dérivations déterministes
# ─────────────────────────────────────────────────────────────────────────────


def consultant_size_bucket(headcount: int | None) -> str | None:
    """Bucket ``consultant_size`` pour un effectif. ``None`` reste ``None`` —
    aucune valeur par défaut."""
    if headcount is None or headcount < 0:
        return None
    for upper, bucket in _CONSULTANT_SIZE_BUCKETS:
        if headcount <= upper:
            return bucket
    return _CONSULTANT_SIZE_TOP


def headcount_from_tranche(code: str | None) -> int | None:
    """Effectif représentatif (milieu de tranche) d'un code INSEE
    ``tranche_effectif_salarie``. ``NN`` / code inconnu → ``None``."""
    key = (code or "").strip().upper()
    bounds = INSEE_HEADCOUNT_TRANCHES.get(key)
    if bounds is None:
        return None
    low, high = bounds
    return (low + high) // 2


def department_from_postal_code(postal_code: str | None) -> str | None:
    """Département à partir d'un code postal français. Les codes DOM (97x/98x)
    rendent 3 chiffres, la Corse (20xxx) reste « 20 » — aucun des deux n'étant
    mappé, le champ zone géo sera omis."""
    digits = "".join(ch for ch in (postal_code or "") if ch.isdigit())
    if len(digits) < 2:
        return None
    if digits.startswith(("97", "98")):
        return digits[:3]
    return digits[:2]


def geo_zone_for_department(department: str | None) -> str | None:
    """Zone géo du questionnaire pour un numéro de département (« 75 », « 2A »,
    « 974 »), ou ``None`` quand il ne correspond à aucune des 12 valeurs."""
    key = (department or "").strip().upper()
    return _DEPARTMENT_ZONES.get(key)


def geo_zone_for_postal_code(postal_code: str | None) -> str | None:
    """Zone géo du questionnaire pour un code postal, ou ``None`` si le
    département ne correspond à aucune des 12 valeurs autorisées."""
    return geo_zone_for_department(department_from_postal_code(postal_code))


def is_it_naf(naf_code: str | None) -> bool:
    """``True`` si le code NAF/APE désigne une activité IT (62.0x / 63.1x / 58.2x).
    Tolère les deux écritures registre (``62.02A`` et ``6202A``).

    Booléen strict, contrairement au tri-état ``esn_candidate_ranking.is_esn_naf``
    dont il dérive : ici un code absent vaut « pas IT » parce que l'appelant en
    déduit ``offer_domain``, et un champ non fondé doit rester absent."""
    return esn_candidate_ranking.is_esn_naf(naf_code) is True


def naf_label_for_code(naf_code: str | None) -> str | None:
    """Libellé officiel d'un code NAF IT, ou ``None`` hors périmètre. Tolère les
    deux écritures registre (``62.01Z`` et ``6201Z``)."""
    return esn_candidate_ranking.naf_label_for_code(naf_code)


# ─────────────────────────────────────────────────────────────────────────────
# Collecte des sources (chaque source échoue seule, sans bruit)
# ─────────────────────────────────────────────────────────────────────────────


async def _safe(coro, label: str, fallback):
    try:
        return await coro
    except Exception as exc:  # noqa: BLE001 — une source ne doit jamais casser l'onboarding
        logger.warning("esn_prefill: source %s failed: %s", label, exc)
        return fallback


def _digits(value: object) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


class RegistryResolution(BaseModel):
    """Ce que le registre gratuit nous permet de conclure sur le nom tapé.

    Trois issues, et une seule interdite : choisir en silence.

    * ``chosen`` renseigné, ``ambiguous`` faux — une entité et une seule est
      proposée (SIREN épinglé, candidat unique, ou candidat qui domine).
    * ``ambiguous`` vrai — plusieurs entités plausibles : ``candidates`` part à
      l'UI pour que l'utilisateur tranche, ``chosen`` reste vide.
    * tout vide — le registre ne connaît pas ce nom, ce qui est un cas NORMAL.
    """

    #: Ligne registre normalisée (mêmes clés que l'ancien ``_fetch_registry``).
    chosen: dict | None = None
    candidates: list[EsnCandidate] = Field(default_factory=list)
    ambiguous: bool = False


_EMPTY_RESOLUTION = RegistryResolution()


def _normalize_registry_row(row: dict) -> dict:
    """Ligne ``recherche_entreprises._candidate`` → identité registre du prefill."""
    return {
        "source": row.get("source"),
        "name": row.get("name"),
        "siren": row.get("siren"),
        "nafCode": row.get("nafCode"),
        "nafLabel": row.get("nafLabel"),
        "city": row.get("city"),
        "department": row.get("department"),
        # ``_candidate`` nomme la tranche INSEE ``headcountTranche`` là où
        # ``fetch_company`` dit ``headcountRange`` — on normalise ici.
        "headcountRange": row.get("headcountTranche"),
    }


async def _resolve_registry(name: str, siren: str | None = None) -> RegistryResolution:
    """Résout le nom tapé en UNE entité registre, ou expose l'ambiguïté.

    On passe par ``search_companies`` et NON ``fetch_company`` : seule la
    première mappe ``nafLabel`` / ``city`` / ``department``, précisément les
    champs qui permettent de reconnaître sa boîte — et de dériver la zone géo
    quand Pappers est muet.

    Le classement (``esn_candidate_ranking``) remplace l'ancien « premier
    candidat actif gagne ». Ce top-1 silencieux était faux en pratique : la
    recherche plein-texte du registre renvoie massivement une entité parasite
    (« Carrefour » → une SCI du Cannet, « Alan » → un garage à Mougins).

    Un SIREN épinglé (l'utilisateur a choisi une suggestion d'autocomplétion)
    court-circuite tout le classement : son choix explicite fait autorité, il
    n'y a plus rien à désambiguïser.
    """
    pinned = _digits(siren)
    rows = await recherche_entreprises.search_companies(pinned or name, limit=CANDIDATE_FETCH_LIMIT)
    if not rows:
        return RegistryResolution()

    by_siren = {_digits(row.get("siren")): row for row in rows if _digits(row.get("siren"))}

    if pinned:
        row = by_siren.get(pinned)
        if row is None:
            # Le registre ne retrouve pas ce SIREN : on ne se rabat SURTOUT pas
            # sur un autre candidat. Pappers reste ancré dessus par l'appelant.
            return RegistryResolution()
        scored = esn_candidate_ranking.score_candidate(name, row)
        return RegistryResolution(
            chosen=_normalize_registry_row(row),
            candidates=[scored] if scored else [],
            ambiguous=False,
        )

    ranked = rank_candidates(name, rows)
    if not ranked:
        return RegistryResolution()

    if should_auto_select(ranked):
        row = by_siren.get(ranked[0].siren)
        if row is not None:
            return RegistryResolution(chosen=_normalize_registry_row(row), candidates=[ranked[0]], ambiguous=False)

    return RegistryResolution(candidates=ranked, ambiguous=True)


def _company_group(pappers: Any | None) -> dict[str, Any] | None:
    """#2086.25 — DÉCISION Louis 17/09 : « groupe ou filiale » — les deux
    moitiés du fait de la cartographie Pappers (``parent_companies``,
    ``subsidiaries``, voir ``pappers/cartographie.py``).

    ``None`` dès qu'il n'y a RIEN à dire (pas de Pappers, ou un graphe qui ne
    porte ni parent ni filiale) : un objet `{"parentCompanies": [],
    "subsidiaryCount": 0}` se lirait comme un fait mesuré (« cette société
    n'a ni groupe ni filiale ») là où c'est en réalité un silence de la
    source — la même distinction que `country`/`is_active` ci-dessus.
    """
    if pappers is None:
        return None
    parent_names = [c.name for c in (getattr(pappers, "parent_companies", None) or []) if c.name]
    subsidiary_count = len(getattr(pappers, "subsidiaries", None) or [])
    if not parent_names and subsidiary_count == 0:
        return None
    return {"parentCompanies": parent_names, "subsidiaryCount": subsidiary_count}


async def _fetch_pappers(name: str, siren: str | None) -> Any | None:
    """Profil Pappers, ancré sur un SIREN dès qu'on en connaît un.

    Même logique de « scope lock » que ``research.pappers.research_pappers`` :
    un SIREN connu (épinglé par l'autocomplétion OU remonté par le registre
    gratuit) part DIRECTEMENT en ``get_company`` — jamais par la recherche par
    nom. C'est ce qui débloque le cas le plus courant, la marque qui diffère de
    la raison sociale (« Kicklox » → LINNAEUS) : la recherche par nom tombait
    sous le seuil de similarité et rendait un ``PappersAmbiguousMatchError``, on
    perdait ville, libellé NAF et code postal. La recherche par nom ne reste
    qu'un dernier recours, quand aucun SIREN n'a pu être résolu.

    #2086.25 — DÉCISION Louis 17/09 : ``include_graph=True`` (la cartographie,
    ``/v2/entreprise/cartographie``) pour que la carte de confirmation puisse
    nommer « groupe ou filiale ». Mesuré avant d'activer : ce module n'appelle
    JAMAIS Pappers pour un homonyme non tranché — ``_resolve_registry_and_pappers``
    saute l'appel tant que la résolution reste ambiguë (voir sa docstring) — et
    n'appelle ``_fetch_pappers`` qu'UNE fois le SIREN épinglé (auto-résolu ou
    choisi dans la liste). La cartographie n'est donc PAS multipliée par les
    candidats homonymes : un seul appel, sur le SIREN déjà résolu, parallélisé
    avec l'appel ``/v2/entreprise`` (``get_company``, voir ``detail.py``) —
    déjà payé par la même résolution que ``country``/``city`` ci-dessous.
    """
    from app.services.pappers import get_company, search_company

    anchor = (siren or "").strip()
    if anchor:
        try:
            return await get_company(anchor, include_graph=True)
        except Exception as exc:  # noqa: BLE001 — on retente par le nom plutôt que d'abandonner
            logger.warning("esn_prefill: Pappers get_company(%s) failed, falling back to name search: %s", anchor, exc)

    hit = await search_company(name)
    resolved = (getattr(hit, "siren", "") or "").strip()
    if not resolved:
        return None
    # #2086.25 — même raison que ci-dessus : un seul appel, sur l'unique SIREN
    # que la recherche par nom a résolu.
    return await get_company(resolved, include_graph=True)


async def _resolve_registry_and_pappers(
    name: str, siren: str | None
) -> tuple[RegistryResolution, Any | None]:
    """Registre gratuit + Pappers, en enchaînant SIREN → ``get_company``.

    Quand le SIREN est déjà épinglé par l'appelant, les deux sources partent en
    parallèle (aucune dépendance). Sinon Pappers attend la RÉSOLUTION du registre
    gratuit — et n'est pas appelé du tout quand elle est ambiguë : interroger
    Pappers sur une entité que l'utilisateur n'a pas encore reconnue, ce serait
    payer un appel pour une identité qu'on va probablement jeter.
    """
    pinned = (siren or "").strip()
    if pinned:
        return await asyncio.gather(
            _safe(_resolve_registry(name, pinned), "recherche-entreprises", _EMPTY_RESOLUTION),
            _safe(_fetch_pappers(name, pinned), "pappers", None),
        )

    resolution = await _safe(_resolve_registry(name, None), "recherche-entreprises", _EMPTY_RESOLUTION)
    if resolution.ambiguous:
        return resolution, None
    siren_hint = (resolution.chosen or {}).get("siren")
    pappers = await _safe(_fetch_pappers(name, siren_hint), "pappers", None)
    return resolution, pappers


@provider_cache.cached_by(
    "prefill:web",
    lambda name, **_: (name or "").strip().lower() or None,
    ttl=provider_cache.TTL_SEARCH,
)
async def _fetch_web(name: str) -> list[dict]:
    """Extraits web décrivant la société. Liste vide sans clé Brave (aucun appel
    réseau) — le préremplissage se contente alors du registre."""
    return await brave_search_single(f"{name} ESN société", limit=8)


def _is_directory_host(host: str) -> bool:
    return any(host == bad or host.endswith(f".{bad}") for bad in _NON_WEBSITE_DOMAINS)


def _email_domain(email: str | None) -> str | None:
    """Le domaine d'un e-mail PROFESSIONNEL, ou ``None`` — jamais un domaine
    générique (gmail.com…), qui n'identifie aucune entreprise."""
    if not email or "@" not in email:
        return None
    domain = email.rsplit("@", 1)[-1].strip().lower()
    if not domain or domain in _GENERIC_EMAIL_DOMAINS:
        return None
    return domain


def _identity_words(value: str | None) -> list[str]:
    """Les mots significatifs (≥ 3 caractères) d'un nom, pour comparer une page
    web à l'identité résolue par le SIREN — jamais une égalité stricte : une
    raison sociale et un nom de marque ne s'écrivent jamais pareil sur un site
    (« Kicklox » → LINNAEUS, tome `_fetch_pappers`)."""
    text = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii").lower()
    return [word for word in re.findall(r"[a-z0-9]+", text) if len(word) >= 3]


def _hit_names_identity(hit: dict, identity_words: list[str]) -> bool:
    """Le TITRE (ou la description) du hit porte-t-il tous les mots de
    l'identité résolue ? La correspondance se fait sur l'ENSEMBLE des mots, pas
    une sous-chaîne exacte : l'ordre des mots varie d'un site à l'autre."""
    if not identity_words:
        return False
    haystack = " ".join(str((hit or {}).get(key) or "") for key in ("title", "description"))
    haystack_words = set(_identity_words(haystack))
    return all(word in haystack_words for word in identity_words)


def _credible_website_hits(hits: list[dict]) -> list[tuple[str, dict]]:
    """Les hits web utilisables comme site de la société : une URL valide,
    hors annuaire / réseau social. Factorisé pour que `pick_website` et
    `website_provenance` (#2640.2) résolvent EXACTEMENT le même ensemble."""
    credible: list[tuple[str, dict]] = []
    for hit in hits or []:
        url = str((hit or {}).get("url") or "").strip()
        if not url:
            continue
        parsed = urlparse(url)
        host = (parsed.netloc or "").lower()
        if not host or _is_directory_host(host):
            continue
        credible.append((f"{parsed.scheme or 'https'}://{host}", hit))
    return credible


def website_provenance(
    hits: list[dict], *, email: str | None = None, legal_name: str | None = None
) -> tuple[str, str, str, str] | None:
    """URL du site RETENU, plus D'OÙ elle vient — `(url, source, confidence, rationale)`.

    #2640.2 — `esn_website` (la réponse d'onboarding) doit dire d'où vient sa
    valeur, pas seulement la valeur : `source` suit exactement l'ordre de
    `pick_website` (dont c'est maintenant l'implémentation partagée), et
    `rationale` nomme le critère qui a décidé, verbatim, jamais un texte
    générique qui confondrait un domaine CONFIRMÉ et une simple recherche par
    nom :

    1. **Registre/SIREN** (`source="registry"`, `confidence="high"`) —
       l'identité résolue par le SIREN nomme le hit.
    2. **Domaine d'e-mail** (`source="inference"`, `confidence="medium"`) — le
       domaine PRO du commercial confirme un hit crédible.
    3. **Recherche par nom** (`source="inference"`, `confidence="low"`) —
       aucun des deux ne confirme : le premier résultat crédible, non vérifié.

    Les deux derniers cas partagent `source="inference"` (`PREFILL_SOURCES`
    n'a pas de valeur dédiée à « déduit d'un e-mail » — GA-08, un enum
    n'invente pas une valeur pour un seul appelant) ; `confidence` et
    `rationale` les distinguent toujours pour qui lit le badge.
    """
    credible = _credible_website_hits(hits)

    identity_words = _identity_words(legal_name)
    if identity_words:
        for candidate, hit in credible:
            if _hit_names_identity(hit, identity_words):
                return (
                    candidate,
                    "registry",
                    "high",
                    "Domaine confirmé par la raison sociale résolue via le SIREN.",
                )

    domain = _email_domain(email)
    if domain:
        for candidate, _hit in credible:
            host = urlparse(candidate).netloc.lower()
            if host == domain or host.endswith(f".{domain}"):
                return (
                    candidate,
                    "inference",
                    "medium",
                    "Domaine déduit de l'adresse e-mail professionnelle du commercial.",
                )

    if credible:
        return (
            credible[0][0],
            "inference",
            "low",
            "Premier résultat d'une recherche par nom, jamais vérifié davantage.",
        )

    return None


def pick_website(hits: list[dict], *, email: str | None = None, legal_name: str | None = None) -> str | None:
    """URL du site de la société parmi les hits web.

    #2640.1 — l'ORDRE, écrit une seule fois, jamais dispersé en conditions :

    1. **L'identité résolue par le SIREN** (`legal_name` — raison sociale ou
       nom commercial déjà obtenu via `_resolve_registry_and_pappers`, ANCRÉ
       sur le SIREN dès qu'il est pinné) départage EN PREMIER, dès qu'un hit la
       nomme dans son titre ou sa description. Aucune source de ce dépôt ne
       relie un SIREN à un domaine web (pas de mapping direct) — mais une fois
       l'identité résolue, on sait à qui appartient la page, sans deviner.
    2. Le domaine de l'e-mail PRO du commercial (quand il en porte un)
       départage ENSUITE parmi les hits crédibles : deux sociétés au nom
       proche peuvent apparaître dans une recherche par nom.
    3. Sans les deux — ou sans qu'aucun hit ne les confirme — le comportement
       historique reprend : le premier résultat qui n'est pas un annuaire /
       réseau social. ``None`` si rien de probant — on ne fabrique jamais un
       domaine à partir du nom.

    #2640.2 — implémentée via {@link website_provenance}, qui calcule EN PLUS
    la provenance (`esn_website`, la réponse d'onboarding, en a besoin) ; cette
    fonction garde sa signature d'origine pour ses appelants existants.
    """
    resolved = website_provenance(hits, email=email, legal_name=legal_name)
    return resolved[0] if resolved else None


# ─────────────────────────────────────────────────────────────────────────────
# Validation post-LLM contre le catalogue fermé
# ─────────────────────────────────────────────────────────────────────────────


def _clean_rationale(value: Any) -> str | None:
    text = str(value or "").strip()
    return text[:240] or None


def _clean_confidence(value: Any) -> str:
    candidate = str(value or "").strip().lower()
    return candidate if candidate in _CONFIDENCES else "low"


def cap_inference_confidence(confidence: str) -> str:
    """Un champ déduit par le LLM ne dépasse JAMAIS ``medium``.

    Claude s'auto-attribue volontiers ``high`` sur une lecture de page d'accueil
    (« Régie pure », « Uniquement freelances ») : c'est une interprétation, pas
    un fait registre. Seules les sources ``registry``/``pappers`` ont droit à
    ``high``. Le plafond est appliqué ICI, dans le code — une consigne de prompt
    peut être ignorée, pas une validation.
    """
    return "medium" if confidence == "high" else confidence


def validate_llm_fields(raw: Any, options: dict[str, list[str]]) -> dict[str, dict]:
    """Ne garde que ce qui est EXACTEMENT dans le catalogue.

    Toute valeur inconnue est droppée avec un warning (dérive prompt/contrat à
    surveiller) ; un champ dont tout a été droppé disparaît. Les clés hors
    périmètre LLM (``esn_name``, ``consultant_size``…) sont ignorées : le modèle
    ne peut pas écraser un fait registre.
    """
    payload = raw.get("fields") if isinstance(raw, dict) and isinstance(raw.get("fields"), dict) else raw
    if not isinstance(payload, dict):
        return {}

    out: dict[str, dict] = {}
    for key in LLM_FIELD_KEYS:
        entry = payload.get(key)
        if not isinstance(entry, dict):
            continue
        allowed = options.get(key) or []
        if not allowed:
            continue

        proposed = entry.get("value")
        candidates = proposed if isinstance(proposed, list) else [proposed]
        kept: list[str] = []
        for candidate in candidates:
            if not isinstance(candidate, str):
                continue
            if candidate not in allowed:
                logger.warning("esn_prefill: dropped out-of-catalog value for %s: %r", key, candidate)
                continue
            if candidate not in kept:
                kept.append(candidate)
        if not kept:
            continue

        if key in MULTI_VALUE_KEYS:
            value: str | list[str] = kept[:MAX_MULTI]
        else:
            value = kept[0]

        field = {
            "value": value,
            "confidence": cap_inference_confidence(_clean_confidence(entry.get("confidence"))),
            "source": "inference",
        }
        rationale = _clean_rationale(entry.get("rationale"))
        if rationale:
            field["rationale"] = rationale
        out[key] = field
    return out


async def _map_with_llm(
    *,
    identity: dict,
    web_hits: list[dict],
    tech_stack: list[str],
    options: dict[str, list[str]],
) -> dict[str, dict]:
    """Un seul appel Haiku pour les champs non déductibles mécaniquement. Sans
    clé Anthropic (ou sur échec Claude) : dict vide — on renvoie alors seulement
    les champs déterministes plutôt que de casser l'onboarding."""
    if not any(options.get(key) for key in LLM_FIELD_KEYS):
        return {}
    try:
        result, _usage = await call_claude(
            build_system_prompt(),
            build_user_prompt(identity=identity, web_snippets=web_hits, tech_stack=tech_stack, options=options),
            response_model=dict,
            model=CLAUDE_HAIKU_MODEL,
            max_tokens=1500,
            prompt_name="bellum_esn_prefill",
            domain_knowledge=True,
            # CACHE-LLM (15/10) — classe A : identité publique + extraits web +
            # stack détectée, contre des catalogues fermés ; aucune donnée d'espace.
            response_cache=True,
        )
    except Exception as exc:  # noqa: BLE001 — le préremplissage dégrade, il ne casse pas
        logger.warning("esn_prefill: Claude mapping unavailable: %s", exc)
        return {}
    return validate_llm_fields(result, options)


# ─────────────────────────────────────────────────────────────────────────────
# Orchestration
# ─────────────────────────────────────────────────────────────────────────────


def _put(
    fields: dict[str, dict],
    key: str,
    value: Any,
    *,
    confidence: str,
    source: str,
    rationale: str | None,
    as_of: str | None = None,
) -> None:
    # #2028.8 — la date Pappers (`dernier_traitement`), quand la source la
    # porte. Le registre gratuit n'en a aucune : `as_of` reste `None` plutôt
    # que deviné à « aujourd'hui » (jamais de donnée fictive).
    field: dict[str, Any] = {"value": value, "confidence": confidence, "source": source, "as_of": as_of}
    if rationale:
        field["rationale"] = rationale[:240]
    fields[key] = field


def _in_catalog(options: dict[str, list[str]], key: str, value: str) -> bool:
    """Un champ déterministe est lui aussi confronté au catalogue quand
    l'appelant le fournit : si le contrat TS bouge, la valeur dérivée ici est
    droppée au lieu de polluer la base."""
    allowed = options.get(key)
    if allowed is None:
        return True
    return value in allowed


async def prefill_esn_profile(
    name: str,
    *,
    siren: str | None = None,
    email: str | None = None,
    options: dict[str, list[str]] | None = None,
) -> dict:
    """Préremplit le profil ESN pour ``name``.

    Renvoie ``{"matched": bool, "company": dict | None, "fields": {...},
    "candidates": [...], "ambiguous": bool}`` — la forme exacte du contrat
    ``esnPrefillResponseSchema``. Aucun champ que les sources ne fondent :
    ``fields`` peut être vide, et ``matched=False`` (nom absent des registres)
    est un cas NORMAL, pas une erreur.

    Quand plusieurs entités registre sont plausibles, la réponse porte
    ``ambiguous=True`` + la liste des candidats et RIEN d'autre : on ne
    préremplit jamais un profil à partir d'une entité que l'utilisateur n'a pas
    explicitement reconnue.
    """
    cleaned = (name or "").strip()
    options = options or {}
    empty: dict[str, Any] = {"matched": False, "company": None, "fields": {}, "candidates": [], "ambiguous": False}
    if not cleaned:
        return empty

    # Le web part en parallèle des registres : il ne dépend que du nom tapé.
    # Registre et Pappers sont chaînés (SIREN → get_company) — voir
    # ``_resolve_registry_and_pappers``. Chaque source échoue seule via
    # ``_safe`` : jamais de gather qui remonte une exception.
    (resolution, pappers), web_hits = await asyncio.gather(
        _resolve_registry_and_pappers(cleaned, siren),
        _safe(_fetch_web(cleaned), "web", []),
    )
    web_hits = web_hits if isinstance(web_hits, list) else []

    if resolution.ambiguous:
        # Plusieurs entités plausibles portent ce nom. On s'arrête ICI : ni
        # Claude, ni scrape du site, ni dérivation de champ. L'utilisateur
        # choisit, puis on repart avec son SIREN épinglé.
        return {
            "matched": False,
            "company": None,
            "fields": {},
            "candidates": [c.model_dump() for c in resolution.candidates],
            "ambiguous": True,
        }

    registry = resolution.chosen
    if registry is None and pappers is None:
        # Aucun registre ne connaît ce nom : on ne préremplit rien plutôt que de
        # deviner à partir du seul web.
        return empty

    registry = registry or {}

    # #2640.1 (ordre complété le 21/09/2026) — l'identité résolue par le SIREN
    # (ANCRÉE dessus dès que `_resolve_registry_and_pappers` en connaît un,
    # voir sa docstring) se calcule AVANT `pick_website` : c'est elle qui
    # départage le site en premier, avant le domaine e-mail — voir le
    # docblock de `pick_website` pour l'ordre complet et sa raison.
    legal_name = (
        (getattr(pappers, "commercial_name", None) or getattr(pappers, "legal_name", None))
        if pappers is not None
        else None
    ) or registry.get("name")
    legal_name = str(legal_name or "").strip()

    website_resolved = website_provenance(web_hits, email=email, legal_name=legal_name or None)
    website = website_resolved[0] if website_resolved else None
    tech_stack = await _safe(tech_detect.detect_stack(website), "tech_detect", []) if website else []
    tech_stack = tech_stack if isinstance(tech_stack, list) else []

    fields: dict[str, dict] = {}

    # ── Identité ────────────────────────────────────────────────────────────
    if legal_name:
        _put(
            fields,
            "esn_name",
            legal_name,
            confidence="high",
            source="pappers" if pappers is not None and getattr(pappers, "legal_name", None) else "registry",
            rationale="Raison sociale telle qu'enregistrée au registre du commerce.",
            as_of=getattr(pappers, "last_updated", None) if pappers is not None else None,
        )

    # #2640.2 — `esn_website`, la MÊME réponse d'onboarding que le reste :
    # source ET confiance réelles (`website_provenance` ci-dessus) — `high`
    # quand le registre confirme, `medium` pour un domaine d'e-mail confirmé,
    # `low` pour un premier résultat jamais vérifié (le badge `PrefillBadge.tsx`
    # passe alors en « à vérifier »).
    if website_resolved:
        _, website_source, website_confidence, website_rationale = website_resolved
        _put(
            fields,
            "esn_website",
            website,
            confidence=website_confidence,
            source=website_source,
            rationale=website_rationale,
        )

    # ── Effectif → consultant_size ──────────────────────────────────────────
    tranche_code = str(registry.get("headcountRange") or "").strip().upper()
    headcount: int | None = None
    headcount_origin = ""
    headcount_source = "registry"
    if pappers is not None:
        p_min, p_max = getattr(pappers, "headcount_min", None), getattr(pappers, "headcount_max", None)
        bounds = [b for b in (p_min, p_max) if isinstance(b, int)]
        if bounds:
            headcount = sum(bounds) // len(bounds)
            headcount_origin = f"l'effectif registre de {min(bounds)} à {max(bounds)} salariés"
            headcount_source = "pappers"
    if headcount is None:
        headcount = headcount_from_tranche(tranche_code)
        if headcount is not None:
            headcount_origin = (
                f"la tranche d'effectif officielle « {INSEE_HEADCOUNT_LABELS.get(tranche_code, tranche_code)} »"
            )

    bucket = consultant_size_bucket(headcount)
    if bucket and _in_catalog(options, "consultant_size", bucket):
        _put(
            fields,
            "consultant_size",
            bucket,
            # L'effectif SALARIÉ total n'est pas le nombre de consultants
            # (fonctions support incluses, freelances exclus) — à faire vérifier.
            confidence="medium",
            source=headcount_source,
            rationale=f"Déduit de {headcount_origin} — l'effectif total inclut les fonctions support.",
            as_of=getattr(pappers, "last_updated", None) if headcount_source == "pappers" else None,
        )

    # ── Siège → geo_zones ───────────────────────────────────────────────────
    # Ville et département retombent sur le registre gratuit quand Pappers est
    # indisponible (quota, panne, pas de clé) : ce sont, avec le secteur, les
    # deux infos qui permettent à l'utilisateur de confirmer « oui, c'est bien
    # ma boîte ».
    postal_code = getattr(getattr(pappers, "headquarters", None), "postal_code", None) if pappers else None
    city = (getattr(getattr(pappers, "headquarters", None), "city", None) if pappers else None) or registry.get("city")
    if postal_code:
        # Le code postal Pappers fait autorité : s'il ne mappe sur aucune des 12
        # zones (Rouen…), le champ reste VIDE. On ne se rabat pas sur le
        # département du registre, qui ne ferait que le contredire.
        zone = geo_zone_for_postal_code(postal_code)
        geo_source = "pappers"
    else:
        # Pas de code postal (Pappers indisponible) : le département du siège
        # remonté par le registre gratuit suffit à trancher.
        zone = geo_zone_for_department(registry.get("department"))
        geo_source = "registry"
    if zone and _in_catalog(options, "geo_zones", zone):
        located_at = city or postal_code or f"département {registry.get('department')}"
        _put(
            fields,
            "geo_zones",
            [zone],
            # Le siège social n'est pas la zone de chasse commerciale.
            confidence="medium",
            source=geo_source,
            rationale=f"Siège social à {located_at} — la zone de prospection réelle peut être plus large.",
            as_of=getattr(pappers, "last_updated", None) if geo_source == "pappers" else None,
        )

    # ── NAF : identité et cohérence, JAMAIS le domaine d'offre ──────────────
    #
    # Le préremplissage écrivait ici ``offer_domain = esn_it`` sur tout NAF
    # 62.0x. C'était honnête tant que l'onboarding POSAIT la question : une
    # valeur proposée, visible, avec sa source et sa raison, que l'utilisateur
    # pouvait changer. Depuis que le portefeuille de domaines a remplacé la
    # question (D-DF2), plus aucun écran ne la montre — la proposition est
    # redevenue la présélection SILENCIEUSE que la décision retirait, et elle
    # repilote le prisme d'analyse dès que le portefeuille est vide.
    #
    # Et un code NAF ne saurait de toute façon pas le dire : 62.02A ne
    # distingue pas lequel des vingt domaines Technology l'entreprise vend, et
    # une société de conseil en ingénierie porte un NAF que cette règle
    # n'aurait jamais reconnu. Le NAF sert à ce qu'il PROUVE — la cohérence
    # d'activité (``is_esn_naf``, tri-état) et le départage des homonymes.
    naf_code = (getattr(pappers, "naf_code", None) if pappers else None) or registry.get("nafCode")
    # Dernier recours pour le libellé : décoder le code. ``recherche-entreprises``
    # ne renvoie pas toujours ``libelle_activite_principale`` — sans ça, la carte
    # de confirmation n'afficherait aucun secteur quand Pappers est muet.
    naf_label = (
        (getattr(pappers, "naf_label", None) if pappers else None)
        or registry.get("nafLabel")
        or naf_label_for_code(naf_code)
    )

    # ── Champs interprétatifs → un seul appel Haiku ─────────────────────────
    identity = {
        "Nom": legal_name,
        "SIREN": registry.get("siren") or (getattr(pappers, "siren", None) if pappers else None),
        "Code NAF": naf_code,
        "Libellé NAF": naf_label,
        "Activité": getattr(pappers, "activity_label", None) if pappers else None,
        "Objet social": (getattr(pappers, "corporate_purpose", None) if pappers else None) or None,
        "Effectif": (getattr(pappers, "headcount_label", None) if pappers else None)
        or INSEE_HEADCOUNT_LABELS.get(tranche_code),
        "Ville du siège": city,
        "Site web": website,
    }
    fields.update(await _map_with_llm(identity=identity, web_hits=web_hits, tech_stack=tech_stack, options=options))

    # #2015.3 — raison sociale ET nom commercial, distincts. `legal_name`
    # (ci-dessus) reste le nom AFFICHÉ historique (nom commercial préféré) ;
    # ces deux-là alimentent la ligne secondaire de la carte de confirmation.
    registered_name = (getattr(pappers, "legal_name", None) if pappers is not None else None) or registry.get(
        "name"
    )
    commercial_name_value = getattr(pappers, "commercial_name", None) if pappers is not None else None

    company = {
        "name": legal_name or cleaned,
        "legal_name": registered_name or None,
        "commercial_name": commercial_name_value or None,
        "siren": (registry.get("siren") or (getattr(pappers, "siren", None) if pappers else None)) or None,
        "city": city or None,
        # #2015.5 — le pays du siège. `None` sans Pappers : le registre
        # gratuit ne le porte pas, et deviner "France" serait une donnée
        # fictive pour une ESN future hors France.
        "country": (pappers.headquarters.country if pappers is not None else None) or None,
        "naf_code": naf_code or None,
        "naf_label": naf_label or None,
        # Tri-état assumé : ``False`` signifie « le registre CONTREDIT l'activité
        # d'une ESN » et déclenche l'alerte côté UI ; ``None`` signifie seulement
        # « pas de code NAF » et doit rester silencieux.
        "is_esn_naf": esn_candidate_ranking.is_esn_naf(naf_code),
        "website": website,
        "headcount_label": (getattr(pappers, "headcount_label", None) if pappers else None)
        or INSEE_HEADCOUNT_LABELS.get(tranche_code),
        # #2015.8 — tri-état assumé, comme `is_esn_naf` : `None` sans Pappers
        # (le registre gratuit ne dit rien de l'activité), jamais "active" par
        # défaut sur un silence.
        "is_active": (not pappers.has_ceased) if pappers is not None else None,
        # #2086.25 — DÉCISION Louis 17/09 : « groupe ou filiale », APRÈS
        # confirmation. `None` sans lien capitalistique trouvé (ou sans
        # Pappers) — jamais un groupe inventé sur un silence.
        "group": _company_group(pappers),
    }
    # ``candidates`` porte l'entité retenue : l'UI affiche la même carte qu'elle
    # vienne d'une auto-sélection ou d'un choix dans la liste.
    return {
        "matched": True,
        "company": company,
        "fields": fields,
        "candidates": [c.model_dump() for c in resolution.candidates],
        "ambiguous": False,
    }
