"""#4706 — un siège dans la zone est une implantation dans la zone : « siège » ⊆ « implanté », ligne à ligne.

Mesuré en recette de production le 28/10/2026 (département 92) : « Siège dans la zone » affichait 24 comptes contre 17
pour « Implanté dans la zone ». Le registre ne l'explique pas : sur les MÊMES lignes, le filtre « siège » ne fait que
RETIRER (il ne ramène jamais une ligne que « implanté » écarte). L'écart d'affichage vient donc de la liste coupée à
`limit` après tri (hypothèse non mesurée : on ne peut pas rejouer la prod d'ici) — voir le rapport du lot N1, question
de produit, pas un défaut de filtre.
"""

from __future__ import annotations

from app.services.company_filters import CompanyDiscoveryFilters
from app.services.data_sources.recherche_entreprises import _list_row


def _row(siren: str, name: str, siege_dept: str, others: tuple[str, ...] = ()) -> dict:
    siege = {"code_postal": f"{siege_dept}000", "departement": siege_dept, "libelle_commune": "X", "est_siege": True}
    return {
        "siren": siren,
        "nom_complet": name,
        "siege": siege,
        "matching_etablissements": [
            {"siret": f"{siren}{i:05d}", "code_postal": f"{dept}000", "departement": dept, "libelle_commune": "Y"}
            for i, dept in enumerate((siege_dept, *others))
            if dept == "92"
        ],
    }


PAGE = [
    _row("100000001", "SIEGE DANS LA ZONE", "92"),
    _row("100000002", "SIEGE AILLEURS, SITE DANS LA ZONE", "75", ("92",)),
    _row("100000003", "SIEGE ET SITE DANS LA ZONE", "92", ("92",)),
]


def _kept(headquarters: bool | None) -> set[str]:
    filters = CompanyDiscoveryFilters(department="92", on_headquarters_only=headquarters)
    return {row["siren"] for r in PAGE if (row := _list_row(r, filters))}


def test_le_siege_dans_la_zone_est_un_sous_ensemble_de_l_implantation() -> None:
    presence, headquarters = _kept(None), _kept(True)
    assert headquarters <= presence
    assert headquarters == {"100000001", "100000003"}


def test_le_filtre_siege_ne_ramene_jamais_une_ligne_de_plus() -> None:
    assert _kept(True) - _kept(None) == set()
    assert len(_kept(True)) < len(_kept(None))  # il écarte l'implantation seule : « siège » rend MOINS, sur les mêmes lignes
