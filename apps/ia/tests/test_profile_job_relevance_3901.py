"""#3901 — « ce n'est plus offre IT, c'est offre tout court, et ça dépend du
contexte de l'ESN ou de la BU du user » (Louis, 10/10/2026).

La pertinence d'une offre d'emploi se juge sur le PROFIL (domaine d'offre +
métiers placés), jamais sur un filtre IT fixe. Sans profil exploitable : on ne
filtre pas (on n'invente pas de périmètre).
"""

from __future__ import annotations

from app.services.data_sources.france_travail import is_it_offer
from app.services.domain_job_filters import offer_relevant_to_profile, profile_job_scope

DEV = {"intitule": "Développeur Java confirmé"}
CAISSIER = {"intitule": "Caissier / Caissière"}
BUREAU_ETUDES = {"intitule": "Projeteur bureau d'études mécanique"}
SOC = {"intitule": "Analyste SOC N2"}


def test_sans_profil_on_ne_filtre_pas():
    for profile in (None, {}, {"offerDomain": "  "}, {"placed_roles": []}):
        assert profile_job_scope(profile) is None
        assert offer_relevant_to_profile(CAISSIER, profile, it_check=is_it_offer) is True


def test_profil_it_garde_le_tri_it():
    profile = {"offerDomain": "esn_it"}
    assert offer_relevant_to_profile(DEV, profile, it_check=is_it_offer) is True
    assert offer_relevant_to_profile(CAISSIER, profile, it_check=is_it_offer) is False


def test_esn_industrie_voit_l_industrie_pas_le_developpeur():
    profile = {"offerDomain": "industrial_engineering"}
    assert offer_relevant_to_profile(BUREAU_ETUDES, profile, it_check=is_it_offer) is True
    assert offer_relevant_to_profile(DEV, profile, it_check=is_it_offer) is False


def test_metiers_places_pilotent_la_pertinence():
    # cyber -> cyber : le métier placé suffit, sans pack déclaré.
    profile = {"placed_roles": ["Analyste SOC", "Pentester"]}
    assert offer_relevant_to_profile(SOC, profile, it_check=is_it_offer) is True
    assert offer_relevant_to_profile(CAISSIER, profile, it_check=is_it_offer) is False
    assert offer_relevant_to_profile(DEV, profile, it_check=is_it_offer) is False


async def _ft_params(profile):
    from unittest.mock import AsyncMock

    import httpx

    from app.services.data_sources.france_travail import list_hiring_companies

    calls: list[dict] = []
    c = AsyncMock(spec=httpx.AsyncClient)
    ok = AsyncMock()
    ok.status_code = 200
    ok.json = lambda: {"access_token": "tok", "resultats": []}
    ok.content = b"{}"
    c.post = AsyncMock(return_value=ok)

    async def _get(_url, *, params=None, **_kw):
        calls.append(dict(params or {}))
        return ok

    c.get = AsyncMock(side_effect=_get)
    await list_hiring_companies("69", None, 90, 10, client=c, profile=profile)
    return calls[0]


async def test_france_travail_n_impose_le_domaine_m18_qu_a_un_profil_purement_it(monkeypatch):
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")
    assert (await _ft_params({"offerDomain": "esn_it"})).get("domaine") == "M18"
    assert "domaine" not in await _ft_params(None)
    assert "domaine" not in await _ft_params({"offerDomain": "industrial_engineering"})
    assert "domaine" not in await _ft_params({"placed_roles": ["Analyste SOC"]})


def test_placement_en_cdi_garde_toutes_les_offres():
    profile = {"offerDomain": "esn_it", "recruitsForClients": True}
    assert offer_relevant_to_profile(CAISSIER, profile, it_check=is_it_offer) is True


def test_postes_vises_declares_pilotent_le_tri_meme_en_placement_cdi():
    # #4182 — SIEMENS : « Bid Manager », « Technicien GTB » remontaient pour un espace qui place des
    # profils cyber, parce que le placement en CDI gardait TOUT et ignorait les métiers déclarés.
    profile = {"offerDomain": "esn_it", "recruitsForClients": True, "placedRoles": ["Analyste SOC", "Pentester"]}
    soc = {"title": "Analyste SOC N2"}
    bid = {"title": "Chef de projet Appels d'Offres / Bid Manager"}
    assert offer_relevant_to_profile(soc, profile, it_check=is_it_offer) is True
    assert offer_relevant_to_profile(bid, profile, it_check=is_it_offer) is False


def test_placement_cdi_sans_poste_declare_garde_tout():
    profile = {"offerDomain": "esn_it", "recruitsForClients": True}
    assert offer_relevant_to_profile({"title": "Technicien de Maintenance Nucléaire"}, profile, it_check=is_it_offer) is True
