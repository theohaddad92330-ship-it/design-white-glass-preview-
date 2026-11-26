"""#3983.1 (#3705.3) — siège / implantation / équipe : dire la BASE d'une géographie.

Une recherche « en Auvergne-Rhône-Alpes » ne dit pas la même chose selon que
l'entreprise y a son SIÈGE ou seulement un ÉTABLISSEMENT. Le registre public
« Recherche d'entreprises » (données INSEE, sans clé) matche par établissement
et le DIT : sur chaque entreprise, `siege` (l'adresse du siège) et, quand une
zone département/région est demandée, `matching_etablissements` — les
établissements qui ont fait matcher la zone (`siret`, `est_siege`,
`etat_administratif`, `libelle_commune`, `code_postal`, `region`).
Contrat mesuré sur la vraie réponse le 18/09/2026 (fixture ARQUUS,
`tests/fixtures/discover_establishment/`), rejoué dans `tests/contracts/`.

Trois sens, trois sources :

* SIÈGE — `siege` (ou une ligne `est_siege` dans la zone) ;
* IMPLANTATION — un établissement ACTIF, hors siège, dans la zone ;
* ÉQUIPE — l'effectif LOCAL d'un site : la source ne le publie PAS (elle donne
  une tranche d'effectif de l'ENTREPRISE). Rien ici ne l'invente : aucune clé
  d'effectif dans le bloc, et la phrase ne le prétend jamais.

⚠️ Ce que la source prouve, pas plus : `matching_etablissements` est la liste
que le registre a rendue pour CETTE zone, pas un recensement garanti complet de
l'entreprise. « Aucun établissement listé » est donc un INCONNU, jamais « 0 » :
le bloc est alors absent (on n'affiche pas ce qu'on n'a pas).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.services.company_filters import CompanyDiscoveryFilters, department_from_postal_code
from app.services.discover_request_reading import region_label

#: Combien de sites on porte au plus par entreprise : un groupe en compte des
#: centaines, une carte de liste n'en montre pas dix de plus.
MAX_SITES = 10


def _zone(filters: CompanyDiscoveryFilters) -> tuple[set[str], set[str], set[str]]:
    departments = {*(filters.departments or []), *([filters.department] if filters.department else [])}
    regions = {*(filters.regions or []), *([filters.region] if filters.region else [])}
    # KEVIN-FIX K.4 — la COMMUNE résolue est une zone comme une autre (code INSEE de l'établissement).
    communes = {filters.commune_code} if filters.commune_code else set()
    return {d for d in departments if d}, {r for r in regions if r}, communes


def _in_zone(entry: Mapping[str, Any], departments: set[str], regions: set[str], communes: set[str]) -> bool:
    department = entry.get("departement") or department_from_postal_code(entry.get("code_postal"))
    return bool(
        (department and str(department) in departments)
        or str(entry.get("region") or "") in regions
        or (communes and str(entry.get("commune") or "") in communes)
    )


def _text(value: object) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def site_geography(r: Mapping[str, Any], filters: CompanyDiscoveryFilters) -> dict[str, Any] | None:
    """Le bloc « où » d'une ligne du registre pour la zone demandée, ou ``None``.

    ``None`` sans zone département/région (rien à dire, chemin inchangé), et
    quand la source ne prouve aucun site dans la zone (inconnu, pas zéro).

    ``basis`` : ``"headquarters"`` quand le siège est PROUVÉ dans la zone,
    ``"establishment"`` quand la zone n'est tenue que par des établissements.
    """
    departments, regions, communes = _zone(filters)
    if not departments and not regions and not communes:
        return None
    raw = r.get("matching_etablissements")
    matching = raw if isinstance(raw, list) else []

    siege = r.get("siege") if isinstance(r.get("siege"), Mapping) else {}
    siege_proven = bool(siege) and _in_zone(siege, departments, regions, communes)
    sites: list[dict[str, str | None]] = []
    seen: set[str] = set()
    for entry in matching:
        if not isinstance(entry, Mapping):
            continue
        if str(entry.get("etat_administratif") or "A").strip().upper() == "C":
            continue
        if not _in_zone(entry, departments, regions, communes):
            continue
        if entry.get("est_siege") is True:
            siege_proven = True
            continue
        siret = _text(entry.get("siret"))
        key = siret or f"{entry.get('libelle_commune')}|{entry.get('code_postal')}"
        if key in seen:
            continue
        seen.add(key)
        sites.append(
            {
                "siret": siret,
                "city": _text(entry.get("libelle_commune")),
                "department": _text(entry.get("departement") or department_from_postal_code(entry.get("code_postal"))),
                "region": _text(entry.get("region")),
            }
        )

    if not sites and not siege_proven:
        return None
    return {
        "basis": "headquarters" if siege_proven else "establishment",
        "headquarters": {
            "city": _text(siege.get("libelle_commune")),
            "department": _text(siege.get("departement") or department_from_postal_code(siege.get("code_postal"))),
        },
        "siteCount": len(sites),
        "sites": sites[:MAX_SITES],
        "zoneRegion": next(iter(sorted(regions)), None) if regions and not departments else None,
    }


def siege_in_zone(r: Mapping[str, Any], filters: CompanyDiscoveryFilters) -> bool:
    """Le siège est-il PROUVÉ dans la zone ? Sans zone demandée, rien à filtrer :
    ``True``. Non prouvé (département du siège absent ou hors zone, aucune ligne
    `est_siege` dans la zone) = ``False`` — jamais gardé au bénéfice du doute."""
    departments, regions, communes = _zone(filters)
    if not departments and not regions and not communes:
        return True
    geo = site_geography(r, filters)
    return bool(geo and geo["basis"] == "headquarters")


def _title_city(city: str | None) -> str | None:
    """« VERSAILLES » → « Versailles » ; les tirets et apostrophes gardent leur
    majuscule suivante (« SAINT-ÉTIENNE » → « Saint-Étienne »)."""
    if not city:
        return None
    out: list[str] = []
    capital = True
    for ch in city.lower():
        out.append(ch.upper() if capital else ch)
        capital = ch in "-' "
    return "".join(out)


def describe_geography(geo: Mapping[str, Any] | None, *, zone_label: str | None = None) -> str | None:
    """La phrase qui DIT la base : « siège à Paris (75), 3 établissements en
    Auvergne-Rhône-Alpes ». ``None`` sans bloc.

    ``zone_label`` nomme la zone demandée ; à défaut, le nom de la région quand
    la zone est une région, sinon « dans la zone ». Jamais un effectif local :
    la source n'en publie pas.
    """
    if not isinstance(geo, Mapping):
        return None
    hq = geo.get("headquarters") if isinstance(geo.get("headquarters"), Mapping) else {}
    city = _title_city(hq.get("city"))
    department = hq.get("department")
    where = f"{city} ({department})" if city and department else city
    head = f"siège à {where}" if where else "siège"

    zone = zone_label or region_label(geo.get("zoneRegion"))
    count = geo.get("siteCount") if isinstance(geo.get("siteCount"), int) else 0
    place = f"en {zone}" if zone else "dans la zone"
    if count > 0:
        noun = "établissement" if count == 1 else "établissements"
        return f"{head}, {count} {noun} {place}"
    if geo.get("basis") == "headquarters":
        return f"{head}, {place}"
    return None


def geography_from_signals(
    city: str | None,
    department: str | None,
    zone_department: str | None,
    signals: list[Mapping[str, Any]],
) -> dict[str, Any] | None:
    """#5008.1 — la même base « siège / implantation » pour le chemin SIGNAUX.

    Ce chemin n'a pas `matching_etablissements` : il ne sait que le siège du
    registre et la ville de chaque offre (cherchée dans la zone). Siège dans la
    zone → ``headquarters`` ; sinon des villes d'offres → ``establishment`` ;
    ni l'un ni l'autre → ``None`` (inconnu, jamais « 0 »). Sans zone : ``None``.
    """
    if not zone_department:
        return None
    hq_city = _text(city)
    hq_key = (hq_city or "").casefold()
    siege_proven = bool(department) and str(department) == zone_department
    sites: list[dict[str, str | None]] = []
    seen: set[str] = set()
    for signal in signals:
        site_city = _text(signal.get("siteCity"))
        key = (site_city or "").casefold()
        if not site_city or key == hq_key or key in seen:
            continue
        seen.add(key)
        sites.append({"siret": None, "city": site_city, "department": zone_department, "region": None})
    if not sites and not siege_proven:
        return None
    return {
        "basis": "headquarters" if siege_proven else "establishment",
        "headquarters": {"city": hq_city, "department": _text(department)},
        "siteCount": len(sites),
        "sites": sites[:MAX_SITES],
        "zoneRegion": None,
    }
