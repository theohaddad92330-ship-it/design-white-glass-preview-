"""La route de recalcul du score (P1-10) — déterministe et gratuite."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_recalcule_les_cinq_axes_sur_lanalyse_fournie():
    res = client.post(
        "/score/axes",
        json={
            "analysis": {"contacts": [{"email": "a@b.fr"}], "sources": [1, 2, 3]},
            "profile": {"offers": ["data"]},
        },
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data["axes"]) == 5
    assert data["max"] == 25


def test_une_correction_fait_bouger_la_note_sans_rerun():
    # C'est tout l'objet du P1-10 : un contact signalé faux ne doit plus compter
    # dans l'accessibilité. Le score suit la donnée corrigée, immédiatement.
    avant = client.post(
        "/score/axes", json={"analysis": {"contacts": [{"email": "a@b.fr"}, {"email": "faux@b.fr"}]}}
    ).json()["data"]
    apres = client.post("/score/axes", json={"analysis": {"contacts": [{"email": "a@b.fr"}]}}).json()["data"]

    acces_avant = next(a for a in avant["axes"] if a["axis"] == "accessibility")["points"]
    acces_apres = next(a for a in apres["axes"] if a["axis"] == "accessibility")["points"]
    assert acces_apres < acces_avant


def test_deux_appels_identiques_donnent_le_meme_score():
    # Un score qui vaut 12 à l'analyse puis 14 après correction, sans que rien
    # d'autre n'ait changé, est pire qu'un score figé.
    payload = {"analysis": {"contacts": [{"email": "a@b.fr"}]}, "profile": {"offers": ["data"]}}
    assert client.post("/score/axes", json=payload).json() == client.post("/score/axes", json=payload).json()


def test_une_charge_vide_ne_leve_pas():
    res = client.post("/score/axes", json={})
    assert res.status_code == 200
    assert res.json()["data"]["total"] >= 0
