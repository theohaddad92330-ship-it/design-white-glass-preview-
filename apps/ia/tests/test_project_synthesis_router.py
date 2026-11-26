"""BELLUM-PROJECT-SYNTHESIS — le routeur qui génère la synthèse en 7 questions
d'une opportunité (#2171.27), même profil que `test_need_play_router.py`."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.prompts.bellum_project_synthesis import build_system_prompt, build_user_prompt
from app.services.model_policy import model_for

client = TestClient(app)

PROJECT = {"label": "Migration ERP", "kind": "program", "detail": "Refonte du SI achats", "stage": "confirmed"}
ACCOUNT = {"company_name": "ACME", "sector": "Industrie", "context": "Plan de transformation 2027"}


def test_refuse_une_opportunite_sans_libelle():
    # Sans sujet, une « synthèse » ne serait qu'un texte générique — donc pire
    # que rien, exactement le garde de `/needs/play`.
    response = client.post("/project-synthesis/generate", json={"project": {"label": "  "}, "account": ACCOUNT})
    assert response.status_code == 422


def test_produit_une_synthese_et_passe_par_la_politique_de_modele():
    with patch("app.routers.project_synthesis.call_claude", new=AsyncMock(return_value=({"problem": "x"}, {}))) as call:
        response = client.post("/project-synthesis/generate", json={"project": PROJECT, "account": ACCOUNT})

    assert response.status_code == 200
    assert response.json() == {"success": True, "data": {"problem": "x"}}
    kwargs = call.await_args.kwargs
    assert kwargs["prompt_name"] == "bellum_project_synthesis"
    # Aucun appel ne part sur un modèle implicite (test_model_policy).
    assert kwargs["model"] == model_for("bellum_project_synthesis")


def test_un_echec_modele_remonte_en_502_pas_en_synthese_vide():
    with patch("app.routers.project_synthesis.call_claude", new=AsyncMock(side_effect=RuntimeError("boom"))):
        response = client.post("/project-synthesis/generate", json={"project": PROJECT, "account": ACCOUNT})

    assert response.status_code == 502


def test_le_prompt_interdit_de_melanger_fait_et_hypothese():
    system = build_system_prompt()
    assert "confirmed" in system
    assert "hypotheses" in system
    assert "JAMAIS" in system


def test_le_prompt_interdit_toute_probabilite_pour_le_decideur():
    system = build_system_prompt()
    assert "jamais une probabilité" in system


def test_le_user_prompt_ne_transporte_que_la_matiere_fournie():
    prompt = build_user_prompt(PROJECT, ACCOUNT, [{"full_name": "Claire Vasseur", "role": "sponsor"}])

    assert "Migration ERP" in prompt
    assert "Claire Vasseur" in prompt
    # L'opportunité est bornée : on n'injecte pas un dossier entier.
    assert len(prompt) < 20000


def test_des_contacts_absents_ne_cassent_pas_le_prompt():
    prompt = build_user_prompt(PROJECT, ACCOUNT, None)
    assert "OPPORTUNITÉ À SYNTHÉTISER" in prompt
