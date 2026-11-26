"""#4282.9 / #4281.1 — deux LECTURES de Laura sur la base commune : le radar par technologie et les
besoins historiques (par technologie, par compte et son groupe, par personne).

Aucune écriture, aucun crédit. Les deux relaient des fonctions qui existent ailleurs, sans logique
dupliquée (GA-26) : `technology_radar.technology_radar` (la MÊME sortie que Découvrir lit — mêmes
comptes, même ordre) et `dataforge_needs`. Le nom interne du référentiel n'atteint jamais le modèle :
ni ces noms d'outil, ni leurs descriptions, ni ce qu'ils rendent.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from app.services.dataforge_needs import (
    historical_needs,
    need_line,
    needs_for_owned_account,
    needs_for_siren,
    needs_summary,
)
from app.services.technology_radar import resolve_radar_technology, technology_radar
from app.services.workspace_scope import resolve_workspace_id

TECHNOLOGY_RADAR_TOOL: dict[str, Any] = {
    "name": "technology_radar",
    "description": (
        "Le RADAR d'une technologie en France (« radar SAP France », « où placer un consultant maintenant ? », "
        "« quels comptes attaquer sur cette technologie ? ») : missions plaçables, comptes chauds, routes de rang 2, "
        "besoins historiques, relais, empreinte. Lecture seule. `technology` = la technologie "
        "telle que l'utilisateur la nomme. Rends SEPT blocs, dans cet ordre, chacun sous son titre : "
        "1. Missions plaçables maintenant (intitulé, publieur, lieu, TJM SEULEMENT s'il est donné, date, lien) — "
        "quand `targetIsPublisher` est vrai, la cible est le publieur : ne devine JAMAIS le client final ; "
        "2. Comptes les plus chauds (programme nommé, preuve datée et liée, profils, rang) ; "
        "3. Routes de rang 2 (`awardedTender` : le titulaire du marché est la cible) ; "
        "4. Besoins historiques (statut, date, TJM observé, fonction du prescripteur) ; "
        "5. Relais et prescripteurs (date, ou « à revalider ») ; "
        "6. Empreinte : ce sont des PROFILS OBSERVÉS, pas des missions ouvertes — dis-le ; "
        "7. Classement en trois poches (placement immédiat, programmes, rang 2) dans l'ordre RENDU, sans le "
        "retrier. La priorité est un RANG, jamais une probabilité ni un pourcentage. Chaque fait garde sa date "
        "et son lien. Ne nomme JAMAIS d'où viennent les données (ni base, ni site, ni fournisseur). Un bloc vide "
        "se dit vide ; `notEvaluated` se nomme tel quel. Les mêmes comptes, dans le même ordre, sont dans "
        "Découvrir (`discover_path`)."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "technology": {"type": "string", "description": "La technologie (ex. « SAP »)."},
        },
        "required": ["technology"],
    },
}

SEARCH_HISTORICAL_NEEDS_TOOL: dict[str, Any] = {
    "name": "search_historical_needs",
    "description": (
        "Les besoins HISTORIQUES observés dans la base commune Bellum — gagnés, perdus, abandonnés, terminés, "
        "en cours — avec leur date, leur TJM observé et leur prescripteur : « qu'a-t-on déjà fait chez X ? », "
        "« quels besoins SAP chez X ? », « qu'a déjà acheté ce compte ? », « sur quels besoins cette personne "
        "a-t-elle prescrit ? ». Au moins un filtre : `technology`, `account_id` (un compte DÉJÀ lu dans ce fil — "
        "son groupe est inclus), `siren` (une entreprise hors portefeuille, SIREN lu sur sa fiche — jamais "
        "deviné d'un nom) ou `person`. Commence par `summary.line` (gagnés / perdus / terminés, le plus récent, "
        "TJM observé, prescripteurs), puis une carte `file_export`, une ligne par besoin (`line`). "
        "Un besoin passé prouve que l'organisation "
        "a DÉJÀ acheté la compétence, jamais un besoin ouvert aujourd'hui. Un prescripteur « à revalider » se "
        "dit tel quel. `to_verify` (rattachement ambigu) se dit « à vérifier ». Liste vide = rien d'observé — "
        "ne l'invente jamais, ne nomme jamais d'où vient la donnée."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "technology": {"type": "string", "description": "Technologie (ex. « SAP »)."},
            "account_id": {"type": "string", "description": "Identifiant (UUID) d'un compte déjà lu dans ce fil."},
            "siren": {"type": "string", "description": "SIREN (9 chiffres) d'une entreprise hors portefeuille."},
            "person": {"type": "string", "description": "Nom d'un prescripteur."},
        },
    },
}

RADAR_TOOLS: list[dict[str, Any]] = [TECHNOLOGY_RADAR_TOOL, SEARCH_HISTORICAL_NEEDS_TOOL]
RADAR_TOOL_NAMES: frozenset[str] = frozenset(t["name"] for t in RADAR_TOOLS)

_NEEDS_DISPLAY_LIMIT = 15


async def execute_technology_radar(tool_input: dict[str, Any]) -> dict[str, Any]:
    radar = await technology_radar(tool_input.get("technology"))
    if radar is None:
        return {"error": "Il me faut une technologie pour bâtir le radar (ex. SAP)."}
    label = radar["technology"]["label"]
    return {**radar, "discover_path": f"/discover/radar?technology={quote(label)}"}


async def execute_search_historical_needs(tool_input: dict[str, Any], user_id: str) -> dict[str, Any]:
    technology = str(tool_input.get("technology") or "").strip()
    account_id = str(tool_input.get("account_id") or "").strip()
    person = str(tool_input.get("person") or "").strip()
    siren = str(tool_input.get("siren") or "").strip()
    if not (technology or account_id or person or siren):
        return {
            "error": "Il me faut une technologie, un compte déjà lu, un SIREN ou une personne pour chercher des besoins."
        }

    to_verify: str | None = None
    code: str | None = None
    if technology:
        ref = resolve_radar_technology(technology)
        code = ref["code"] if ref else None
        if code is None:
            return {
                "results": [],
                "message": f"« {technology} » n'est pas dans la liste des technologies suivies : aucun besoin classé.",
            }
    if account_id or siren:
        # #4294.9 — le compte se lit dans l'ESPACE du demandeur (un coéquipier le voit), le SIREN dans la
        # seule base commune (fait de marché partagé).
        owned = (
            await needs_for_owned_account(account_id, user_id, workspace_id=await resolve_workspace_id(user_id))
            if account_id
            else await needs_for_siren(siren)
        )
        to_verify = owned["to_verify"]
        needs = [n for n in owned["needs"] if code is None or code in n["technologies"]]
        if person:
            needs = [n for n in needs if person.lower() in str((n.get("prescriber") or {}).get("name") or "").lower()]
    else:
        needs = await historical_needs(technology_code=code, person=person or None, limit=_NEEDS_DISPLAY_LIMIT + 1)

    truncated = len(needs) > _NEEDS_DISPLAY_LIMIT
    rows = [{**n, "line": need_line(n)} for n in needs[:_NEEDS_DISPLAY_LIMIT]]
    out: dict[str, Any] = {
        "results": rows,
        "truncated": truncated,
        "to_verify": to_verify,
        # #4294.9 — calculée sur TOUS les besoins lus, pas sur les seules lignes affichées.
        "summary": needs_summary(needs),
    }
    if not rows:
        out["message"] = "Aucun besoin observé pour cette recherche."
    return out


__all__ = [
    "RADAR_TOOLS",
    "RADAR_TOOL_NAMES",
    "execute_search_historical_needs",
    "execute_technology_radar",
]
