"""L'écran Territoire — « je veux ouvrir une ville, qu'est-ce qu'il y a là-bas ? »

Cinq blocs, chacun avec son état. Le service fait le travail ; ce routeur ne
fait que valider l'entrée et transmettre les noms d'ESN déjà connus, que seule
l'API (propriétaire du référentiel) peut fournir.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.data_sources.geo_communes import search_communes
from app.services.data_sources.territory_query import normalize_department
from app.services.territory_overview import MAX_RADIUS_KM, TerritoryScope, territory_overview

router = APIRouter(prefix="/territory", tags=["Territory"])


class TerritoryRequest(BaseModel):
    department: str
    sinceDays: int = Field(default=90, ge=1, le=730)
    #: Les noms d'ESN CONNUS du référentiel, déjà normalisés côté API. C'est ce
    #: qui permet le retournement sans résoudre chaque employeur au registre —
    #: un appel par entreprise et par consultation d'écran serait intenable.
    knownEsnNames: list[str] = Field(default_factory=list, max_length=2000)
    #: LUD.1 — le pack de l'espace : AO et marchés attribués suivent le domaine vendu. Absent = tri IT.
    pack: str | None = Field(default=None, max_length=64)

    # ── La maille : ville, ou cercle autour d'un point (04/09/2026) ──────────
    #
    # `department` reste OBLIGATOIRE même en maille fine, et ce n'est pas de la
    # redondance : c'est la seule maille que les marchés publics savent lire, et
    # le repli de toutes les autres. Une ville sans son département rendrait ces
    # blocs muets.
    #:
    #: Code INSEE de la commune (5 caractères). Le code postal ne conviendrait
    #: pas : Toulouse en porte six, et un code postal rural couvre plusieurs
    #: communes.
    communeCode: str | None = Field(default=None, min_length=2, max_length=5)
    #: Le nom de la commune, tel que l'utilisateur l'a CHOISI dans la liste. Il
    #: sert à NOMMER le territoire à l'écran ; il n'entre dans aucune requête —
    #: c'est le code INSEE qui interroge, jamais le nom.
    communeName: str | None = Field(default=None, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    #: ⚠️ Borné à 50 km parce que L'API DU REGISTRE l'est — mesuré le 04/09/2026,
    #: `radius=51` rend un 400 qui dit lui-même « entre 0.001 et 50 ». La borne
    #: est ici pour que la demande soit refusée AVEC SA RAISON (422 lisible)
    #: plutôt que traduite en « source indisponible ».
    radiusKm: float | None = Field(default=None, gt=0, le=MAX_RADIUS_KM)


@router.post("/overview")
async def overview(req: TerritoryRequest) -> dict:
    department = normalize_department(req.department) or ""
    if not department:
        return {
            "department": req.department,
            "sinceDays": req.sinceDays,
            "market": {"state": "unavailable", "reason": "Département illisible."},
            "competition": {"state": "unavailable", "reason": "Département illisible."},
            "overflow": {"state": "unavailable", "reason": "Département illisible."},
            "accessible": {"state": "unavailable", "reason": "Département illisible."},
            "unknowns": ["Tout — sans département, il n'y a pas de territoire à lire."],
        }
    scope = TerritoryScope(
        department=department,
        commune_code=req.communeCode,
        commune_name=req.communeName,
        latitude=req.latitude,
        longitude=req.longitude,
        radius_km=req.radiusKm,
    )
    return await territory_overview(
        department,
        since_days=req.sinceDays,
        known_esn_names=set(req.knownEsnNames),
        scope=scope,
        pack=req.pack,
    )


@router.get("/communes")
async def communes(q: str = "", limit: int = 8) -> dict:
    """Les communes dont le nom correspond à `q` — pour le champ « ville ».

    Sert le CHOIX, il ne le fait pas : les homonymes restent tous proposés, la
    plus peuplée en tête. Retenir « Toulouse » pour qui a tapé « Toulouse »
    serait juste 99,9 % du temps, et enverrait la recherche à 750 km une fois
    sur mille sans que rien ne le dise.

    Une source muette rend une liste vide : le champ reste alors saisissable en
    département, qui ne dépend d'aucune source.
    """
    return {"communes": await search_communes(q, limit=max(1, min(int(limit or 1), 10)))}
