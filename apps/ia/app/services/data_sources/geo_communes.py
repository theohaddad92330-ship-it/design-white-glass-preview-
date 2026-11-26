"""API Découpage administratif — ``geo.api.gouv.fr``.

Libre, SANS clé, servie par la DINUM à partir du COG de l'INSEE. Elle répond à
la seule question que l'écran Territoire ne savait pas poser : **où est cette
ville ?**

─────────────────────────────────────────────────────────────────────────────
POURQUOI CETTE SOURCE, ET PAS UNE TABLE DANS LE DÉPÔT
─────────────────────────────────────────────────────────────────────────────
Il existe 34 875 communes, elles fusionnent et se scindent plusieurs fois par
an, et leurs coordonnées sont ce qui décide de ce qu'un rayon attrape. Une table
figée dans le dépôt serait fausse au premier arrêté de fusion, sans que rien ne
le signale — et c'est exactement la forme de défaut que ce dépôt paie le plus
cher : une donnée juste le jour où on l'écrit, jamais revérifiée.

─────────────────────────────────────────────────────────────────────────────
CE QU'ELLE REND, ET CE QU'ELLE NE REND PAS
─────────────────────────────────────────────────────────────────────────────
Le code INSEE (le pivot des recherches par commune), les codes postaux, le
CENTRE de la commune en WGS84, la population et le département. Rien d'autre —
et surtout aucun établissement : c'est le registre des entreprises qui répond à
« qui est là », cette source-ci répond à « où c'est ».

⚠️ Le centre d'une commune n'est pas son centre-ville : c'est le centre de son
polygone. Sur une commune étendue, un rayon de 5 km depuis ce point n'attrape
pas la même chose qu'un rayon de 5 km depuis la mairie. L'écran parle donc de
« autour de <ville> », jamais de « à moins de N km du centre-ville ».

Sans réponse : ``[]`` et la dégradation enregistrée. Jamais une commune devinée
— proposer « Toulon » à qui a tapé « Toulouse » enverrait la recherche à
750 km de là, sans que rien à l'écran ne le dise.
"""

from __future__ import annotations

import logging

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.data_sources._http_pool import get_shared_client
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

SOURCE_NAME = "geo-communes"

_BASE = "https://geo.api.gouv.fr/communes"
_TIMEOUT_S = 6.0

#: Les champs demandés. Explicites : l'API en rend une trentaine par défaut, et
#: on ne fait voyager que ce que l'écran lit.
_FIELDS = "nom,code,codesPostaux,centre,population,departement,region"

#: Combien de communes proposer. Au-delà d'une dizaine, une liste de choix cesse
#: d'être un choix — et « Saint-Martin » en rend 200.
_MAX_SUGGESTIONS = 10

#: Le découpage administratif ne bouge qu'aux arrêtés de fusion, soit quelques
#: fois par an. Une journée de cache est très conservatrice, et elle évite un
#: appel réseau à chaque frappe dans le champ de recherche.
_CACHE_TTL_S = 24 * 3600


def _commune(raw: object) -> dict | None:
    """Une commune réduite à ce qui sert, ou ``None`` si elle ne sert à rien.

    Une commune SANS centre est écartée : elle ne peut pas ancrer un rayon, et
    la proposer produirait un choix qui échoue au clic suivant. Les collectivités
    d'outre-mer sans géométrie publiée sont dans ce cas.
    """
    if not isinstance(raw, dict):
        return None
    code = str(raw.get("code") or "").strip()
    name = str(raw.get("nom") or "").strip()
    if not code or not name:
        return None
    centre = raw.get("centre")
    coordinates = centre.get("coordinates") if isinstance(centre, dict) else None
    if not isinstance(coordinates, list) or len(coordinates) != 2:
        return None
    try:
        # ⚠️ GeoJSON ordonne [LONGITUDE, LATITUDE] — l'inverse de l'ordre parlé
        # et de l'ordre attendu par le registre des entreprises. Les intervertir
        # place Toulouse en Somalie sans qu'aucune erreur ne soit levée : la
        # recherche rend simplement zéro résultat, ce qui se lit « il n'y a
        # personne ici ».
        longitude, latitude = float(coordinates[0]), float(coordinates[1])
    except (TypeError, ValueError):
        return None
    department = raw.get("departement") if isinstance(raw.get("departement"), dict) else {}
    region = raw.get("region") if isinstance(raw.get("region"), dict) else {}
    population = raw.get("population")
    return {
        "code": code,
        "name": name,
        "postalCodes": [str(cp) for cp in raw.get("codesPostaux") or [] if str(cp).strip()],
        "latitude": latitude,
        "longitude": longitude,
        # `None` et jamais 0 : une commune dont la population n'est pas publiée
        # n'est pas une commune vide.
        "population": int(population) if isinstance(population, (int, float)) else None,
        "department": str(department.get("code") or "") or None,
        "departmentName": str(department.get("nom") or "") or None,
        # #4429.2 — la région de la commune : le palier « région » de l'élargissement (jamais devinée).
        "region": str(region.get("code") or "") or None,
    }


async def search_communes(
    query: str,
    *,
    limit: int = _MAX_SUGGESTIONS,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Les communes dont le nom correspond à ``query``, les plus peuplées d'abord.

    Le tri par population est une décision, pas un détail : l'API classe par
    score de correspondance, si bien que « Toulouse » (514 819 habitants) et
    « Toulouse-le-Château » (204) arrivent l'une derrière l'autre avec des
    scores voisins. Quelqu'un qui tape « Toulouse » veut la première dans 99,9 %
    des cas — mais les deux restent proposées, on ne CHOISIT pas pour lui.

    Une recherche de moins de deux caractères ne part pas : elle rendrait un
    échantillon arbitraire de plusieurs milliers de communes.
    """
    cleaned = " ".join(str(query or "").split())
    if len(cleaned) < 2:
        return []

    bounded = max(1, min(int(limit or 1), _MAX_SUGGESTIONS))
    return await provider_cache.cached_json(
        "geo:communes",
        f"{cleaned.lower()}:{bounded}",
        lambda: _fetch(cleaned, bounded, client),
        ttl=_CACHE_TTL_S,
    )


async def resolve_commune_noted(name: str, *, fuzzy: bool = False) -> tuple[dict | None, dict | None]:
    """#4429.6 — ``(commune, note)`` : la commune tapée, et ce qu'on a fait pour la trouver.

    ``note`` dit une correction par proximité (``fuzzy``), un homonyme départagé par la population, ou
    une absence (``place_resolution.resolve_place``). Elle est ``None`` pour un nom exact et unique.
    """
    from app.services.place_resolution import resolve_place

    cleaned = str(name or "").strip()
    return resolve_place(cleaned, await search_communes(cleaned), fuzzy=fuzzy)


async def resolve_commune_by_name(name: str) -> dict | None:
    """#3762 — une ville TAPÉE EN TOUTES LETTRES, résolue en commune (et son
    département), jamais devinée par qui l'appelle.

    Seul un nom qui correspond EXACTEMENT (accents et casse ignorés) à
    ``name`` est retenu : proposer Toulon à qui a tapé Toulouse enverrait la
    recherche à 750 km de là sans que rien ne le dise. Une source muette ou un
    nom sans correspondance exacte rend ``None`` — jamais un département
    deviné pour compenser (même discipline que :func:`search_communes`). Un
    homonyme rend la plus peuplée, avec sa note sous ``resolution`` (#4429.6) ;
    la correction par proximité est :func:`resolve_commune_noted`.
    """
    commune, note = await resolve_commune_noted(name, fuzzy=False)
    return {**commune, "resolution": note} if commune and note else commune


async def _fetch(cleaned: str, bounded: int, client: httpx.AsyncClient | None) -> list[dict]:
    """L'appel réel. Séparé pour que le cache enveloppe la fonction publique
    sans que celle-ci ait à connaître Redis."""
    http = client if client is not None else get_shared_client("geo_communes", timeout=_TIMEOUT_S)
    try:
        async with throttle(SOURCE_NAME):
            resp = await http.get(
                _BASE,
                # `limit` est demandé plus large que `bounded` : le tri par
                # population se fait CHEZ NOUS, sur ce que l'API a retenu par
                # score. Trier trois lignes déjà coupées à trois ne changerait
                # rien à l'ordre qu'on veut corriger.
                params={"nom": cleaned, "fields": _FIELDS, "limit": str(_MAX_SUGGESTIONS), "boost": "population"},
            )
        if resp.status_code == 429:
            back_off_provider(SOURCE_NAME, retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — une source libre ne casse jamais un écran
        logger.warning("geo.api.gouv.fr commune search failed (q=%s): %s", cleaned, exc)
        record_degradation(get_correlation_id(), source=SOURCE_NAME, reason=str(exc)[:200])
        return []

    rows = [c for c in (_commune(item) for item in payload or []) if c]
    # Population inconnue en dernier : elle vaut `None`, et la ranger à zéro
    # ferait passer une commune non publiée derrière un hameau de 12 habitants.
    rows.sort(key=lambda c: (c["population"] is None, -(c["population"] or 0)))
    return rows[:bounded]
