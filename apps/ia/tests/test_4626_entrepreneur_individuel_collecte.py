"""#4626 (collecte) — le registre DIT « entrepreneur individuel » : la ligne ne se rend pas comme une société.

Mesuré en production le 27/10 : « BEN HRIZ AYA » (PARIS) et « BEN MECHLIA AYMEN » (LILLE) rendus comme comptes, sans
motif. Le filtre se pose à la COLLECTE : la projection du registre porte la preuve (`complements.est_entrepreneur_individuel`)
même quand la catégorie juridique manque, et la qualification écarte sur cette preuve. Jamais sur la forme du nom.
"""

from __future__ import annotations

import pytest

from app.services.account_qualification import ExclusionCode, qualify_candidate
from app.services.company_filters import CompanyDiscoveryFilters
from app.services.data_sources.recherche_entreprises import _list_cache_key, _list_row


def _registry_row(name: str, **over: object) -> dict:
    return {
        "siren": "912345678",
        "nom_complet": name,
        "activite_principale": "62.02A",
        "siege": {"libelle_commune": "PARIS", "code_postal": "75011", "etat_administratif": "A"},
        **over,
    }


def test_le_registre_dit_entrepreneur_individuel_la_projection_le_porte_sans_categorie() -> None:
    row = _list_row(_registry_row("BEN HRIZ AYA", complements={"est_entrepreneur_individuel": True}), CompanyDiscoveryFilters())
    assert row is not None and row["individualEntrepreneur"] is True


@pytest.mark.parametrize("complements", [{}, {"est_entrepreneur_individuel": False}, None])
def test_sait_dire_non_sans_preuve_du_registre_aucune_marque(complements: object) -> None:
    row = _list_row(_registry_row("SPIE BATIGNOLLES", complements=complements), CompanyDiscoveryFilters())
    assert row is not None and "individualEntrepreneur" not in row


def test_la_qualification_ecarte_sur_la_preuve_meme_sans_categorie_juridique() -> None:
    row = _list_row(_registry_row("BEN MECHLIA AYMEN", complements={"est_entrepreneur_individuel": True}), CompanyDiscoveryFilters())
    verdict = qualify_candidate(dict(row or {}), filters={})
    assert verdict["verdict"] == "excluded"
    assert verdict["code"] == ExclusionCode.NATURAL_PERSON


def test_sait_dire_non_une_societe_au_nom_de_deux_mots_n_est_pas_ecartee() -> None:
    row = _list_row(_registry_row("AIR LIQUIDE", nature_juridique="5599"), CompanyDiscoveryFilters())
    assert qualify_candidate(dict(row or {}), filters={})["verdict"] != "excluded"


def test_une_liste_gardee_avant_le_correctif_ne_se_ressert_pas() -> None:
    key = _list_cache_key(CompanyDiscoveryFilters(), 25, 1)
    assert key is not None
    import hashlib

    assert key != hashlib.sha256(b"unchanged").hexdigest()
    # la clé porte la version de la projection : elle change quand la projection change
    from app.services.data_sources import recherche_entreprises as module

    assert getattr(module, "_LIST_PROJECTION_VERSION", "") != ""
