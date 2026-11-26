"""#3901 — les offres PAR COMPTE suivent la pertinence au profil, comme Découvrir.

Décision de Louis (10/10/2026) : « ce n'est plus offre IT, c'est offre tout
court, et ça dépend du contexte de l'ESN ou de la BU du user ». Le lot RAD l'a
appliquée aux sources Découvrir ; ces tests tiennent le reste : les offres
collectées PENDANT l'analyse d'un compte (France Travail, APEC, WTTJ, boards
ATS, pages carrières, agrégateurs) passent par la MÊME règle,
``offer_relevant_to_profile`` — jamais par le tri IT fixe propre à chaque source
quand le profil déclare autre chose.

Ils passent par l'APPELANT réel (``POST /phase/1/research``), sources mockées.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.data_sources.france_travail import is_it_offer
from app.services.domain_job_filters import offer_relevant_to_profile, profile_widens_collection
from tests.test_phase1_research import (
    MOCK_BRAVE_RESULTS,
    MOCK_BUNDLE_WITH_CONTENT,
    MOCK_PROFILE,
    _claude_side_effect,
    _facts,
    _signals,
    _strategy,
)

BUREAU_ETUDES = "Projeteur bureau d'études mécanique"
DEV = "Développeur Java confirmé"
CAISSIER = "Caissier / Caissière"
SOC = "Analyste SOC N2"
COMMERCIAL = "Commercial terrain B2B"


def _row(title: str, source: str) -> dict:
    return {"title": title, "url": f"https://jobs.example/{source}/{abs(hash(title))}", "source": source}


def _fake_source(source: str, calls: dict):
    """Une source qui se comporte comme les vraies : tri IT sauf ``all_roles``."""

    async def _src(*_args, all_roles: bool = False, **_kw):
        calls[source] = all_roles
        titles = [BUREAU_ETUDES, DEV, CAISSIER, SOC] if all_roles else [DEV]
        return [_row(t, source) for t in titles]

    return _src


def _run(client: TestClient, profile_data: dict) -> tuple[list[dict], dict, list[str]]:
    calls: dict = {}
    kept_by_aggregators: list[str] = []

    async def _wttj(*_args, **_kw):
        # WTTJ n'a pas de tri IT propre : il rend tout.
        return [_row(COMMERCIAL, "wttj")]

    async def _aggregators(_company, *, keep_title=None, **_kw):
        for title in (BUREAU_ETUDES, DEV, CAISSIER):
            if keep_title is None or keep_title(title):
                kept_by_aggregators.append(title)
        return []

    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=MOCK_PROFILE),
        patch(
            "app.routers.phase1_research.research_firecrawl",
            new_callable=AsyncMock,
            return_value=MOCK_BUNDLE_WITH_CONTENT,
        ),
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(_facts(), _signals(), _strategy()),
        ),
        patch("app.routers.phase1_research.it_job_signals", _fake_source("france_travail", calls)),
        patch("app.routers.phase1_research.it_job_signals_apec", _fake_source("apec", calls)),
        patch("app.routers.phase1_research.it_job_signals_ats", _fake_source("ats", calls)),
        patch("app.routers.phase1_research.it_job_signals_careers", _fake_source("careers", calls)),
        patch("app.routers.phase1_research.it_job_signals_wttj", _wttj),
        patch("app.routers.phase1_research.it_job_signals_aggregators", _aggregators),
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF", "profile_data": profile_data})

    assert res.status_code == 200, res.text
    jobs = res.json()["data"]["itJobSignals"]
    return jobs, calls, kept_by_aggregators


def _titles(jobs: list[dict], source: str) -> set[str]:
    return {j["title"] for j in jobs if j.get("source") == source}


DIRECT_SOURCES = ("france_travail", "apec", "ats", "careers")


def test_esn_industrie_voit_le_bureau_d_etudes_par_compte_pas_le_developpeur(client: TestClient) -> None:
    jobs, calls, aggregated = _run(client, {"offerDomain": "industrial_engineering"})
    for source in DIRECT_SOURCES:
        # Collecte SANS le tri IT de la source, puis la règle du profil.
        assert calls[source] is True, source
        assert _titles(jobs, source) == {BUREAU_ETUDES}, source
    assert _titles(jobs, "wttj") == set()
    assert aggregated == [BUREAU_ETUDES]


def test_bu_cyber_voit_ses_metiers_places(client: TestClient) -> None:
    jobs, calls, _ = _run(client, {"placed_roles": ["Analyste SOC"]})
    for source in DIRECT_SOURCES:
        assert calls[source] is True, source
        assert _titles(jobs, source) == {SOC}, source


def test_metiers_places_tels_que_l_api_les_envoie_comptent_sur_l_analyse(client: TestClient) -> None:
    # La forme du contrat `AnalysisProfileData.placedRoles` (esnAnswersToProfileData),
    # avec un domaine IT : le métier placé élargit au-delà du tri IT, sans tout ouvrir.
    jobs, calls, aggregated = _run(client, {"offerDomain": "esn_it", "placedRoles": ["Analyste SOC"]})
    for source in DIRECT_SOURCES:
        assert calls[source] is True, source
        assert _titles(jobs, source) == {DEV, SOC}, source
    assert aggregated == [DEV]


def test_profil_it_garde_le_tri_it_de_chaque_source(client: TestClient) -> None:
    jobs, calls, aggregated = _run(client, {"offerDomain": "esn_it"})
    for source in DIRECT_SOURCES:
        # Le tri IT de la source EST la règle du profil : chemin historique.
        assert calls[source] is False, source
        assert _titles(jobs, source) == {DEV}, source
    assert _titles(jobs, "wttj") == set()  # « Commercial terrain » n'est pas IT
    assert aggregated == [DEV]


def test_profil_sans_domaine_on_ne_filtre_pas(client: TestClient) -> None:
    jobs, calls, aggregated = _run(client, {})
    for source in DIRECT_SOURCES:
        assert calls[source] is True, source
        assert _titles(jobs, source) == {BUREAU_ETUDES, DEV, CAISSIER, SOC}, source
    assert _titles(jobs, "wttj") == {COMMERCIAL}
    assert aggregated == [BUREAU_ETUDES, DEV, CAISSIER]


def test_placement_en_cdi_garde_ses_metiers_et_ecarte_ce_qu_aucune_esn_ne_place(client: TestClient) -> None:
    # PERTINENCE-PARTOUT (Louis 25/10) : l'analyse de compte applique le MÊME verdict que Découvrir. Un placeur garde
    # toujours « toute autre ouverture » (bureau d'études, SOC, développeur) ; un métier que nul secteur d'ESN ne
    # place (caissier) sort aussi pour lui, comme à Découvrir — jamais une raison de relâcher le tri.
    jobs, calls, _ = _run(client, {"offerDomain": "esn_it", "recruitsForClients": True})
    for source in DIRECT_SOURCES:
        assert calls[source] is True, source
        assert _titles(jobs, source) == {BUREAU_ETUDES, DEV, SOC}, source


# ── La règle unique lit aussi les lignes RENDUES (``title``), pas que l'API brute ──


def test_la_regle_lit_l_intitule_des_lignes_rendues() -> None:
    industry = {"offerDomain": "industrial_engineering"}
    assert offer_relevant_to_profile({"title": BUREAU_ETUDES}, industry, it_check=is_it_offer) is True
    assert offer_relevant_to_profile({"title": DEV}, industry, it_check=is_it_offer) is False
    it = {"offerDomain": "esn_it"}
    assert offer_relevant_to_profile({"title": DEV}, it, it_check=is_it_offer) is True
    assert offer_relevant_to_profile({"title": CAISSIER}, it, it_check=is_it_offer) is False
    # Le libellé ROME rendu (`romeLabel`) compte comme le vocabulaire contrôlé.
    assert (
        offer_relevant_to_profile(
            {"title": "Poste H/F", "romeLabel": "Études et développement informatique"}, it, it_check=is_it_offer
        )
        is True
    )


def test_elargir_la_collecte_seulement_quand_le_tri_it_n_est_pas_la_regle() -> None:
    assert profile_widens_collection(None) is True
    assert profile_widens_collection({}) is True
    assert profile_widens_collection({"offerDomain": "esn_it"}) is False
    assert profile_widens_collection({"offerDomain": "industrial_engineering"}) is True
    assert profile_widens_collection({"placed_roles": ["Pentester"]}) is True
    assert profile_widens_collection({"offerDomain": "esn_it", "recruitsForClients": True}) is True
