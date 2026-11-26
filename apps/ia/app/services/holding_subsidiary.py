"""#3983 (reste) — « holding → filiale » dans une recherche par zone.

DÉCISION Louis 11/10 : « ça dépend du type de boîte aussi : si c'est une holding et qu'elle est à
Paris mais les boîtes dans le Sud, c'est les boîtes du Sud qui comptent et où les gens vont
recruter ». Le critère est l'entité qui recrute, pas le siège du groupe.

La règle, sur les lignes AFFICHÉES d'une recherche (Découvrir et `run_account_search` de Laura) :

- la ligne H est une HOLDING — un fait de la nomenclature, jamais deviné au nom : NAF 64.20Z
  (activités des sociétés holding) ou 70.10Z (activités des sièges sociaux). Une société mère
  OPÉRATIONNELLE recrute elle-même : elle n'est pas concernée ;
- son siège n'est PAS prouvé dans la zone (`geography.basis == "establishment"`) ;
- une autre ligne F, PROUVÉE dans la zone (bloc `geography`), non écartée, est sa filiale par un
  lien capitalistique SOURCÉ (arête `(H, F)` rendue par `group_link_lookup.attach_group_links`, à
  partir d'appels déjà faits — aucun appel en plus).

Alors H est écartée (`excluded`, code `holding_subsidiary_in_zone`, la filiale NOMMÉE) et F porte
« Filiale de H ». Sans arête sourcée, rien ne bouge : un mandataire personne morale n'est qu'un
indice. Le module ne supprime rien : l'écran masque une ligne écartée avec un compteur nommé.
"""

from __future__ import annotations

from collections.abc import Iterable, MutableMapping
from typing import Any

HOLDING_CODE = "holding_subsidiary_in_zone"

#: NAF 64.20Z « Activités des sociétés holding », 70.10Z « Activités des sièges sociaux ».
_HOLDING_NAF = frozenset({"6420Z", "7010Z"})


def _naf(value: Any) -> str:
    return str(value or "").replace(".", "").replace(" ", "").upper()


def is_holding(row: MutableMapping[str, Any]) -> bool:
    return _naf(row.get("nafCode")) in _HOLDING_NAF


def _in_zone(row: MutableMapping[str, Any]) -> bool:
    geo = row.get("geography")
    return isinstance(geo, dict) and geo.get("basis") in ("headquarters", "establishment")


def _excluded(row: MutableMapping[str, Any]) -> bool:
    qualification = row.get("qualification")
    return isinstance(qualification, dict) and qualification.get("verdict") == "excluded"


def redirect_holdings(rows: list[MutableMapping[str, Any]], edges: Iterable[tuple[str, str]]) -> None:
    """Applique la règle EN PLACE sur `rows` ; `edges` = paires `(détenteur, détenue)` sourcées."""
    held_by: dict[str, set[str]] = {}
    for holder, held in edges:
        held_by.setdefault(holder, set()).add(held)
    if not held_by:
        return
    for holding in rows:
        siren = str(holding.get("siren") or "")
        geo = holding.get("geography")
        if not (siren in held_by and is_holding(holding) and isinstance(geo, dict)):
            continue
        if geo.get("basis") != "establishment":
            continue
        subsidiaries = [
            row
            for row in rows
            if row is not holding
            and str(row.get("siren") or "") in held_by[siren]
            and _in_zone(row)
            and not _excluded(row)
        ]
        if not subsidiaries:
            continue
        holding_name = str(holding.get("name") or "").strip()
        names = [str(row.get("name") or "").strip() for row in subsidiaries]
        previous = holding.get("qualification") if isinstance(holding.get("qualification"), dict) else {}
        other_codes = [c for c in [previous.get("code"), *(previous.get("otherCodes") or [])] if c]
        holding["qualification"] = {
            "verdict": "excluded",
            "code": HOLDING_CODE,
            "reason": (
                "Holding dont le siège est hors de la zone : sa filiale "
                + ", ".join(names[:3])
                + " y est implantée (lien capitalistique sourcé) et sort comme cible à sa place."
            ),
            "otherCodes": other_codes,
            "subsidiaries": [{"name": row.get("name"), "siren": row.get("siren")} for row in subsidiaries[:3]],
        }
        for row in subsidiaries:
            link = row.get("groupLink")
            if not (isinstance(link, dict) and link.get("kind") == "capital_link") and holding_name:
                row["groupLink"] = {"kind": "capital_link", "entities": [holding_name]}
