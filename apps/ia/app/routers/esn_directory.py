"""Étage 1 du référentiel ESN — résoudre un nom brut au registre (tome 4 §17).

Le fichier d'origine porte 477 NOMS et rien d'autre : ni SIREN, ni ville, ni
effectif. Tant qu'un nom n'a pas de SIREN, il n'ouvre aucune des huit autres
sources — c'est le goulot du chantier entier.

Trois règles portent l'honnêteté de cet étage :

1. **Une entrée non résolue est CONSERVÉE, avec sa raison.** La supprimer
   perdrait le nom, qu'on ne saurait pas retrouver, et ferait croire que le
   référentiel est plus propre qu'il ne l'est.
2. **Le NAF départage, il ne sélectionne pas.** Quand deux entités portent le
   même nom et qu'une seule est une ESN, c'est un départage légitime. Quand
   AUCUNE n'en est une, on ne force pas : le nom reste ambigu.
3. **Une société étrangère est reconnue à sa forme juridique**, avant tout appel
   réseau — chercher « MANAVA LTD » dans le registre français ne peut que
   rendre « introuvable », ce qui se lirait comme une erreur de notre part.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.esn_naf import is_esn_naf_code
from app.services.research.homonym import resolve_company_identity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/esn", tags=["ESN directory"])

#: Formes juridiques qui désignent une société non française. Le registre
#: français ne les porte pas : les y chercher rend « introuvable », ce qui se
#: lirait comme une panne alors que c'est un fait.
FOREIGN_SUFFIXES: tuple[str, ...] = (
    " ltd",
    " limited",
    " gmbh",
    " bv",
    " b.v.",
    " nv",
    " inc",
    " inc.",
    " llc",
    " plc",
    " ag",
    " srl",
    " spa",
    " oy",
    " ab",
)

#: Combien de résolutions en parallèle. Le registre est public et sans clé :
#: le budget est par IP et partagé par toute l'instance, d'où une borne basse.
_CONCURRENCY = 4


class EsnResolveRequest(BaseModel):
    names: list[str] = Field(default_factory=list, max_length=50)


class EsnResolved(BaseModel):
    inputName: str
    status: str
    reason: str | None = None
    siren: str | None = None
    legalName: str | None = None
    nafCode: str | None = None
    sizeClass: str | None = None
    headcountTranche: str | None = None
    headcountRange: str | None = None
    establishmentCount: int | None = None
    creationDate: str | None = None
    city: str | None = None
    department: str | None = None


class EsnResolveResponse(BaseModel):
    entries: list[EsnResolved] = Field(default_factory=list)


def looks_foreign(name: str) -> bool:
    """La forme juridique dit-elle une société non française ?"""
    lowered = f" {str(name or '').strip().lower()}"
    return any(lowered.endswith(suffix) for suffix in FOREIGN_SUFFIXES)


def _facts(candidate: object) -> dict[str, object | None]:
    get = lambda key: getattr(candidate, key, None)  # noqa: E731
    return {
        "siren": get("siren"),
        "legalName": get("legal_name") or get("name"),
        "nafCode": get("naf_code"),
        "sizeClass": get("size_class"),
        "headcountTranche": get("headcount_tranche"),
        "headcountRange": get("headcount_range"),
        "establishmentCount": get("establishment_count"),
        "creationDate": get("creation_date"),
        "city": get("city"),
        "department": get("department"),
    }


async def resolve_one(name: str) -> EsnResolved:
    """Un nom brut → un verdict de résolution, jamais une exception."""
    cleaned = str(name or "").strip()
    if not cleaned:
        return EsnResolved(inputName=name, status="unresolved", reason="Nom vide.")
    if looks_foreign(cleaned):
        return EsnResolved(
            inputName=cleaned,
            status="foreign",
            reason="Forme juridique étrangère — absente du registre français, les sources FR ne s'appliquent pas.",
        )

    # `strict` : ce routeur ÉCRIT un verdict durable dans le référentiel. Un
    # registre qui refuse de répondre doit lever, pas rendre « aucun résultat »
    # — sinon un « 429 Too Many Requests » s'inscrit « cette ESN n'existe pas au
    # registre français » et le nom n'est plus jamais retenté (mesuré en
    # production le 23/08/2026, en rafale pendant le remplissage).
    resolution = await resolve_company_identity(cleaned, strict=True)
    selected = None
    if resolution.selected_siren:
        selected = next(
            (c for c in resolution.candidates if str(getattr(c, "siren", "")) == resolution.selected_siren),
            None,
        )
        return EsnResolved(inputName=cleaned, status="resolved", **_facts(selected))  # type: ignore[arg-type]

    if resolution.status == "ambiguous":
        # Le NAF DÉPARTAGE quand une seule des homonymes est une ESN. Il ne
        # sélectionne pas quand aucune ne l'est : forcer un choix produirait un
        # SIREN faux, et tout le référentiel s'appuierait dessus.
        esn_only = [c for c in resolution.candidates if is_esn_naf_code(getattr(c, "naf_code", None))]
        if len(esn_only) == 1:
            return EsnResolved(inputName=cleaned, status="resolved", **_facts(esn_only[0]))  # type: ignore[arg-type]
        return EsnResolved(
            inputName=cleaned,
            status="ambiguous",
            reason=(
                f"{len(resolution.candidates)} entités portent ce nom au registre"
                + (f", dont {len(esn_only)} en NAF informatique" if esn_only else "")
                + " — aucune ne domine, aucun SIREN retenu."
            ),
        )

    return EsnResolved(
        inputName=cleaned,
        status="unresolved",
        reason="Aucune entité du registre français ne correspond à ce nom.",
    )


@router.post("/resolve", response_model=EsnResolveResponse)
async def resolve_esn_names(req: EsnResolveRequest) -> EsnResolveResponse:
    """Résout un LOT de noms. Le lot est petit et la concurrence bornée : le
    référentiel se remplit en tâche de fond, il n'y a rien à gagner à saturer
    un registre public que tout le monde partage."""
    semaphore = asyncio.Semaphore(_CONCURRENCY)

    async def guarded(name: str) -> EsnResolved:
        async with semaphore:
            try:
                return await resolve_one(name)
            except Exception as exc:  # noqa: BLE001 — un nom qui échoue n'arrête pas le lot
                logger.warning("ESN resolve failed for %r: %s", name, exc)
                return EsnResolved(
                    inputName=str(name),
                    status="pending",
                    reason="Le registre n'a pas répondu — à retenter, ce n'est pas un verdict.",
                )

    entries = await asyncio.gather(*(guarded(n) for n in req.names))
    return EsnResolveResponse(entries=list(entries))
