"""#4792 (épopée #4791) — Laura LIT notre base : les comptes, les besoins et les consultants qu'elle porte.

Le constat qui l'a fait naître (Louis, 29/10/2026) : « trouve-moi les besoins Java sur Lille, la base
m'en remonte 80, et y a 3 600 freelances qui ont bossé sur Lille » — et rien, dans le produit, ne lisait
ça. Découvrir ne regardait que les appels live du moment ; Laura n'avait aucun outil pour interroger la
base par métier et par lieu.

Ce module est le RELAIS de l'unique lecteur (`BaseReaderService`, côté NestJS, #4792) : aucune requête,
aucun calcul, aucun classement ici — l'espace, le périmètre de Business Unit et le cloisonnement sont
résolus côté API, à partir de l'utilisateur. Le relais met en mots ce qu'elle rend.

Les trois refus que ce fichier tient :
  * ZÉRO CRÉDIT — relire ce qui est déjà stocké ne débite rien (doctrine
    `c145_historique_stocke_se_lit_sans_credit`). Cet outil n'appelle AUCUNE source externe ; c'est ce
    qui le distingue de `search_job_offers`, qui achète des offres du marché.
  * AUCUN CHIFFRE INVENTÉ — `total` vient de la base. Une famille vide se DIT vide ; un amont
    injoignable est une erreur claire, jamais une liste vide qui se lirait « il n'y a rien ».
  * AUCUNE SOURCE NOMMÉE — ni base, ni table, ni fournisseur : on nomme la NATURE de la ligne (un besoin
    enregistré, une offre collectée) et sa DATE, jamais d'où elle vient techniquement.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

SEARCH_OUR_BASE_TOOL_NAME = "search_our_base"

#: Lignes rendues au modèle par famille et par appel. La borne se DIT (`hasMore`, `total`) : l'API
#: pagine bien au-delà, mais un contexte de modèle n'a pas besoin de deux cents lignes pour répondre.
_ROWS_IN_CONTEXT = 15

_UNREADABLE = "Je n'arrive pas à lire notre base pour l'instant : je ne te donne donc aucun chiffre."

SEARCH_OUR_BASE_TOOL: dict[str, Any] = {
    "name": SEARCH_OUR_BASE_TOOL_NAME,
    "description": (
        "CE QUE NOTRE PROPRE BASE PORTE DÉJÀ, par métier/compétence, lieu et période : les COMPTES, les "
        "BESOINS (besoins enregistrés et offres déjà collectées) et les CONSULTANTS. À employer pour « quels "
        "besoins Java sur Lille avons-nous ? », « combien de consultants ont travaillé à Lille ? », « qu'est-ce "
        "qu'on a en base sur SAP en Occitanie ? », « nos comptes sur ce métier » — c'est-à-dire chaque fois que "
        "la question porte sur CE QU'ON A, pas sur le marché. Ce n'est PAS `search_job_offers` (qui va chercher "
        "des offres PUBLIÉES du marché, et coûte), ni `search_historical_needs` (les besoins observés du marché "
        "par technologie), ni `find_accounts` (préparer une recherche neuve). Lecture seule, ne débite RIEN : "
        "n'hésite jamais à l'appeler. `terms` = le métier ou la compétence tels que la personne les nomme ; "
        "`city` / `departments` / `regions` = le lieu ; `from` / `to` = la période (sur la date de COLLECTE) ; "
        "`families` = restreindre aux comptes, aux besoins ou aux consultants. Rends les CHIFFRES de l'outil : "
        "`total` par famille est le nombre de lignes qui correspondent, et il peut dépasser de loin les lignes "
        "montrées (`rows`) — dis le total, puis cite des lignes. `truncated` ou `hasMore` vrai : dis qu'il en "
        "reste et propose la suite (`offset`), ne prétends jamais avoir tout listé. CHAQUE ligne porte sa "
        "nature (`source`) et sa DATE de collecte (`collectedAt`) : dis de QUAND date ce que tu montres, et "
        "qu'une ligne sans date n'en a pas — jamais une date devinée. Une famille à `total: 0` se dit vide. "
        "`null` est NON RENSEIGNÉ : ne l'écris jamais « 0 » ni « aucun ». Ne nomme JAMAIS d'où vient la donnée "
        "(ni base, ni table, ni fournisseur) : nomme la nature de la ligne et sa date. Une `error` se dit telle "
        "quelle, sans repli inventé. COMPTES QUI PRENNENT DES PROFILS (« les comptes de la région qui prennent des "
        "développeurs Java ») : ce sont des UTILISATEURS de ces profils, pas des ESN — passe `excludeEsn: true`, "
        "et formule le résultat en « comptes pouvant prendre des développeurs » (leurs besoins en appui), pas "
        "seulement en liste de besoins. L'exclusion se fait sur le code d'activité : un compte sans code reste "
        "listé, dis-le plutôt que d'affirmer qu'aucune ESN n'y figure."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "terms": {
                "type": "array",
                "items": {"type": "string"},
                "description": 'Le métier ou les compétences cherchés (ex. ["Java"]).',
            },
            "city": {"type": "string", "description": "La ville (ex. « Lille »)."},
            "departments": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Départements : code (« 59 », « 2A ») ou nom (« Nord »).",
            },
            "regions": {"type": "array", "items": {"type": "string"}, "description": "Régions (libellé)."},
            "from": {"type": "string", "description": "Début de période (AAAA-MM-JJ), sur la date de collecte."},
            "to": {"type": "string", "description": "Fin de période (AAAA-MM-JJ), sur la date de collecte."},
            "families": {
                "type": "array",
                "items": {"type": "string", "enum": ["accounts", "needs", "consultants"]},
                "description": "Restreindre aux comptes, aux besoins ou aux consultants. Absent : les trois.",
            },
            "excludeEsn": {
                "type": "boolean",
                "description": "Écarter les ESN franches des comptes et des besoins (comptes utilisateurs de profils).",
            },
            "offset": {"type": "integer", "description": "La suite de la liste (0 au départ)."},
        },
    },
}


def _as_list(value: object) -> list[str]:
    """Une liste de mots, quelle que soit la forme reçue — jamais une case vide."""
    if isinstance(value, str):
        return [part.strip() for part in value.replace(";", ",").split(",") if part.strip()]
    if isinstance(value, list | tuple):
        return [str(item).strip() for item in value if str(item or "").strip()]
    return []


def _family_view(payload: Mapping[str, Any] | None) -> dict[str, Any] | None:
    """Une famille telle que le modèle la lit : son total MESURÉ, les lignes montrées, et ce qui reste.

    ``None`` = famille non demandée (et c'est différent d'une famille vide : l'une n'a pas été
    regardée, l'autre n'a rien trouvé)."""
    if not isinstance(payload, Mapping):
        return None
    rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []
    shown = [row for row in rows[:_ROWS_IN_CONTEXT] if isinstance(row, Mapping)]
    total = payload.get("total")
    return {
        # Le total vient de la base. Jamais `len(rows)` : une page pleine ne dit rien du volume.
        "total": int(total) if isinstance(total, int) else 0,
        "offset": payload.get("offset") if isinstance(payload.get("offset"), int) else 0,
        "rows": shown,
        "truncated": len(rows) > len(shown) or bool(payload.get("hasMore")),
        "hasMore": bool(payload.get("hasMore")),
    }


async def execute_search_our_base(tool_input: Mapping[str, Any] | None, *, user_id: str) -> dict[str, Any]:
    """Lit la base par le pont API. Tout échec rend une erreur claire — jamais une liste vide."""
    from app.services import bellum_api

    asked = tool_input or {}
    families = [family for family in _as_list(asked.get("families")) if family in {"accounts", "needs", "consultants"}]
    if not bellum_api.is_configured():
        return {"error": _UNREADABLE}

    result = await bellum_api.search_our_base(
        user_id,
        terms=_as_list(asked.get("terms")),
        city=str(asked.get("city") or "").strip() or None,
        departments=_as_list(asked.get("departments")),
        regions=_as_list(asked.get("regions")),
        period_from=str(asked.get("from") or "").strip() or None,
        period_to=str(asked.get("to") or "").strip() or None,
        families=families,
        offset=asked.get("offset") if isinstance(asked.get("offset"), int) else None,
        exclude_esn=asked.get("excludeEsn") is True,
    )
    if not isinstance(result, Mapping) or result.get("error"):
        return {"error": _UNREADABLE}

    out: dict[str, Any] = {"readAt": result.get("readAt")}
    for family in ("accounts", "needs", "consultants"):
        view = _family_view(result.get(family))
        if view is not None:
            out[family] = view
    if not any(family in out for family in ("accounts", "needs", "consultants")):
        return {"error": _UNREADABLE}
    # « On n'affiche pas ce qu'on n'a pas » : rien trouvé se DIT, et ce n'est pas une panne.
    if all(int(out[family]["total"]) == 0 for family in ("accounts", "needs", "consultants") if family in out):
        out["message"] = "Notre base ne porte rien qui corresponde à ces critères."
    return out


__all__ = [
    "SEARCH_OUR_BASE_TOOL",
    "SEARCH_OUR_BASE_TOOL_NAME",
    "execute_search_our_base",
]
