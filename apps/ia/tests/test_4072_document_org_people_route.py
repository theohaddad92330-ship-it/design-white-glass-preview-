"""#4072.1 — l'APPELANT de `extract_org_people` : `POST /org/document-people`.

Le module d'extraction était orphelin. Ces tests prouvent le flux : la route lit
les documents de l'espace (portée du demandeur), n'en garde que les
organigrammes, rend une PROPOSITION datée — et dit « rien lu » plutôt qu'une
liste vide muette quand la lecture tombe en panne.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

ORG_DOC = {
    "id": "d1",
    "title": "Organigramme DSI Sanofi",
    "content": "Organigramme au 12/03/2023\nMarie Durand — Directrice des SI\nJean Petit — Data (rattaché à Marie Durand)",
    "created_at": "2026-09-02T10:00:00+00:00",
}
OTHER_DOC = {"id": "d2", "title": "Compte rendu", "content": "Paul Martin — Directeur", "created_at": None}


def test_la_route_lit_les_documents_de_l_espace_et_rend_les_personnes_datees():
    fetch = AsyncMock(return_value=[ORG_DOC, OTHER_DOC])
    with patch("app.routers.org_declare.fetch_org_chart_documents", fetch):
        res = client.post(
            "/org/document-people",
            json={"user_id": "u1", "workspace_id": "w1", "account_id": "00000000-0000-0000-0000-000000000001"},
        )
    assert res.status_code == 200
    data = res.json()["data"]
    assert [p["fullName"] for p in data["people"]] == ["Marie Durand", "Jean Petit"]
    assert data["people"][1]["managerName"] == "Marie Durand"
    assert data["people"][0]["documentDate"] == "2023-03-12"
    assert data["documents_read"] == 1
    fetch.assert_awaited_once()
    assert fetch.await_args.args[:2] == ("u1", "w1")


def test_NON_sans_utilisateur_aucune_lecture():
    fetch = AsyncMock(return_value=[ORG_DOC])
    with patch("app.routers.org_declare.fetch_org_chart_documents", fetch):
        res = client.post("/org/document-people", json={"user_id": ""})
    assert res.status_code == 422
    fetch.assert_not_awaited()


def test_une_lecture_en_panne_est_dite_pas_rendue_comme_aucun_organigramme():
    with patch("app.routers.org_declare.fetch_org_chart_documents", AsyncMock(side_effect=RuntimeError("db down"))):
        res = client.post("/org/document-people", json={"user_id": "u1"})
    assert res.status_code == 502
