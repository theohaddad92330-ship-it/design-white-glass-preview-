"""Lot 757 — CONTACTS 3/6 : les contacts sont cherchés sur le groupe ET sur les filiales COCHÉES.

Arbitrage Louis 31/10 (appels Decathlon / Decathlon France, Servier SAS / Institut Servier) : chaque entité
cochée dans le sélecteur de périmètre fait une passe de recherche à son nom (People-Search, gratuite), fusionnée
aux autres, et chaque contact trouvé ainsi porte l'entité qui l'a fait venir. Sans entité cochée : aucun appel
de plus, à l'octet près.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.graph.nodes import checked_entity_names
from app.models.contacts import ApolloSearchHit


@pytest.fixture(autouse=True)
def _passes_annexes_eteintes(monkeypatch) -> None:
    monkeypatch.setattr("app.routers.phase2_contacts._AUTO_THEME_RELAUNCH_ENABLED", False)
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)


def _hit(first: str, org: str) -> ApolloSearchHit:
    return ApolloSearchHit(
        first_name=first,
        last_name="X",
        title="Directeur des systèmes d'information",
        organization_name=org,
        linkedin_url=f"https://linkedin.com/in/{first.lower()}",
        city="Lille",
        country="France",
    )


def _by_company(**kwargs: object) -> list[ApolloSearchHit]:
    name = kwargs.get("company_name")
    if name == "DECATHLON FRANCE":
        return [_hit("Julien", "DECATHLON FRANCE")]
    return [_hit("Anne", "DECATHLON SE"), _hit("Paul", "DECATHLON SE"), _hit("Lea", "DECATHLON SE")]


def test_une_filiale_cochee_fait_sa_passe_et_ses_contacts_portent_son_nom(client: TestClient) -> None:
    with (
        patch("app.routers.phase2_contacts.search_people", new_callable=AsyncMock, side_effect=_by_company) as search,
        patch("app.routers.phase2_contacts._fallback_brave_claude", new_callable=AsyncMock, return_value=[]),
    ):
        res = client.post(
            "/phase/2/contacts",
            json={"company_name": "DECATHLON SE", "checked_entities": ["DECATHLON FRANCE", "DECATHLON SE"]},
        )
    assert res.status_code == 200
    names = [c["fullName"] for c in res.json()["data"]["contacts"]]
    assert "Julien X" in names and "Anne X" in names
    called = [c.kwargs.get("company_name") for c in search.call_args_list]
    # L'entité analysée ne refait pas une passe à son propre nom.
    assert called.count("DECATHLON FRANCE") == 1 and called.count("DECATHLON SE") == 1
    julien = next(c for c in res.json()["data"]["contacts"] if c["fullName"] == "Julien X")
    assert julien["matchProvenance"]["matchedVia"] == "checked_entity"
    assert julien["matchProvenance"]["entity"] == "DECATHLON FRANCE"


def test_sans_case_cochee_aucun_appel_de_plus(client: TestClient) -> None:
    with (
        patch("app.routers.phase2_contacts.search_people", new_callable=AsyncMock, side_effect=_by_company) as search,
        patch("app.routers.phase2_contacts._fallback_brave_claude", new_callable=AsyncMock, return_value=[]),
    ):
        client.post("/phase/2/contacts", json={"company_name": "DECATHLON SE"})
    assert [c.kwargs.get("company_name") for c in search.call_args_list] == ["DECATHLON SE"]


def test_le_cadrage_du_run_donne_les_noms_coches() -> None:
    selection = {"contact_entities": [{"siren": "500569405", "name": "DECATHLON FRANCE"}, {"siren": "x"}, "bad"]}
    assert checked_entity_names(selection) == ["DECATHLON FRANCE"]
    assert checked_entity_names(None) == []
