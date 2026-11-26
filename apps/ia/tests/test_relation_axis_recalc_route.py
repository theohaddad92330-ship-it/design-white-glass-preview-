"""#2298.4 (19/09/2026, lot I3) — la route du rejeu gratuit de l'axe relation.

Déterministe, sans modèle, sans crédit — même discipline que `/score/axes`
(P1-10, `test_score_axes_route.py`)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_no_source_returns_relation_unmeasured() -> None:
    res = client.post("/score/addressability-relation", json={})
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["score"] is None
    assert data["unmeasured"] == ["relation"]


def test_a_signed_mission_measures_the_axis() -> None:
    res = client.post("/score/addressability-relation", json={"missions_count": 2})
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["score"] == 3
    assert data["unmeasured"] == []
    assert "2 missions" in data["factors"][0]["evidence"]


def test_never_accepts_a_crm_presence_field() -> None:
    # Preuve ROUGE : un `crm_presence` glissé dans le corps est ignoré par le
    # schéma (Pydantic `extra` par défaut = ignore les champs inconnus) — la
    # route ne peut structurellement pas s'en servir, donc pas d'appel sortant
    # caché derrière ce chemin gratuit.
    res = client.post("/score/addressability-relation", json={"crm_presence": "CRM connecté"})
    assert res.status_code == 200
    assert res.json()["data"]["unmeasured"] == ["relation"]


def test_known_contacts_count_measures_the_axis() -> None:
    # #4680 — la route reçoit le NOMBRE de contacts connus rattachés au compte.
    res = client.post("/score/addressability-relation", json={"known_contacts_count": 2})
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["score"] == 3
    assert data["unmeasured"] == []
    assert "2 contacts connus" in data["factors"][0]["evidence"]


def test_zero_known_contacts_stays_unmeasured_never_a_zero() -> None:
    res = client.post("/score/addressability-relation", json={"known_contacts_count": 0})
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["score"] is None
    assert data["unmeasured"] == ["relation"]
