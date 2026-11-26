"""#AM.54 (#4058) — quand une branche ne donne rien d'utile (aucun responsable GRC chez EDF), Laura cherche le périmètre
voisin AUTORISÉ (RSSI, DSI sécurité, conformité) ou dit la limite exacte. Elle ne rend jamais une personne hors
périmètre (un responsable fiscal, des offres électricité) comme si c'était la bonne."""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool
from app.services.perimeter_neighbours import read_perimeter

FISCAL = {"contact_id": "c1", "full_name": "Luc Fisc", "title": "Responsable fiscal"}
RSSI = {"contact_id": "c2", "full_name": "Ana Roy", "title": "RSSI Groupe"}
GRC = {"contact_id": "c3", "full_name": "Bo Li", "title": "Responsable GRC"}
CONFORMITE = {"contact_id": "c4", "full_name": "Cy Day", "title": "Directeur conformité"}
ELEC = {"contact_id": "c5", "full_name": "Di Ox", "title": "Chef de produit offres électricité"}


def test_un_responsable_grc_est_dans_le_perimetre_un_rssi_est_un_voisin():
    reading = read_perimeter("GRC", [FISCAL, RSSI, GRC, CONFORMITE, ELEC])
    assert reading is not None
    assert [row["contact_id"] for row in reading.exact] == ["c3", "c4"]  # la conformité EST le C de GRC
    assert {row["contact_id"]: row["perimeter_fit"] for row in reading.kept} == {
        "c3": "exact",
        "c4": "exact",
        "c2": "neighbour",
    }
    assert reading.dropped == 2  # le fiscal et l'électricité ne sont JAMAIS rendus comme la bonne personne


def test_sans_exact_les_voisins_sont_proposes_et_la_limite_est_nommee():
    reading = read_perimeter("GRC", [FISCAL, RSSI])
    assert reading is not None
    assert reading.exact == []
    assert [row["contact_id"] for row in reading.kept] == ["c2"]
    assert "Aucun responsable GRC" in reading.limit and "RSSI" in reading.limit


def test_ni_exact_ni_voisin_la_limite_exacte_est_dite_et_rien_n_est_rendu():
    reading = read_perimeter("cyber", [FISCAL, ELEC])
    assert reading is not None
    assert reading.kept == []
    assert "2 personnes" in reading.limit and "hors périmètre" in reading.limit


def test_une_fonction_qui_n_est_pas_du_perimetre_cyber_n_est_pas_touchee():
    assert read_perimeter("directeur des achats", [FISCAL, RSSI]) is None
    assert read_perimeter("", [FISCAL]) is None


@pytest.mark.asyncio
async def test_get_account_contacts_applique_le_perimetre(monkeypatch):
    async def account_contacts(*_a, **_k):
        return {"contacts": [dict(FISCAL), dict(RSSI), dict(ELEC)], "total": 3, "account_sector": "Énergie"}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "account_contacts", account_contacts)
    out = await execute_chat_tool(
        "get_account_contacts",
        {"account_id": "11111111-1111-4111-8111-111111111111", "function": "cyber GRC"},
        user_id="u-1",
        profile_data=None,
    )
    assert [c["contact_id"] for c in out["contacts"]] == ["c2"]
    assert out["contacts"][0]["perimeter_fit"] == "neighbour"
    assert "Aucun responsable cyber GRC" in out["perimeter_limit"]
    assert out["presented_count"] == 1
