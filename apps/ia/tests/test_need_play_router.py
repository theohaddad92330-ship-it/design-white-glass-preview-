"""BELLUM-NEED-PLAY — le routeur qui prépare l'attaque d'un besoin.

Ce que le crédit achète (décision Louis 31/07, D9 option A) : une génération
neuve, pas le dévoilement d'un besoin que l'analyse a déjà facturé.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.prompts.bellum_need_play import build_system_prompt, build_user_prompt
from app.services.model_policy import model_for

client = TestClient(app)

NEED = {"label": "Migration ERP", "kind": "program", "detail": "Refonte du SI achats", "urgency": "haute"}
ACCOUNT = {"company_name": "ACME", "sector": "Industrie", "context": "Plan de transformation 2027"}
PROFILE = {"name": "ESN Démo", "offers": ["Data", "ERP"], "references": ["Groupe Helios"]}


def test_refuse_un_besoin_sans_libelle():
    # Sans sujet, un « plan » ne serait qu'un texte générique qui a l'air d'un
    # livrable — donc pire que rien, puisqu'il serait facturé.
    response = client.post("/needs/play", json={"need": {"label": "  "}, "account": ACCOUNT})
    assert response.status_code == 422


def test_produit_un_plan_et_passe_par_la_politique_de_modele():
    with patch("app.routers.need_play.call_claude", new=AsyncMock(return_value=({"angle": "x"}, {}))) as call:
        response = client.post("/needs/play", json={"need": NEED, "account": ACCOUNT, "profile": PROFILE})

    assert response.status_code == 200
    assert response.json() == {"success": True, "data": {"angle": "x"}}
    kwargs = call.await_args.kwargs
    assert kwargs["prompt_name"] == "bellum_need_play"
    # Aucun appel ne part sur un modèle implicite (test_model_policy).
    assert kwargs["model"] == model_for("bellum_need_play")


def test_un_echec_modele_remonte_en_502_pas_en_plan_vide():
    with patch("app.routers.need_play.call_claude", new=AsyncMock(side_effect=RuntimeError("boom"))):
        response = client.post("/needs/play", json={"need": NEED, "account": ACCOUNT})

    assert response.status_code == 502


def test_le_prompt_exige_une_citation_pour_chaque_preuve():
    # Verrou n°1 (le verrou n°2, indépendant, vit côté API dans need-play-guard).
    system = build_system_prompt()
    assert "CITATION EXACTE" in system
    assert "missing" in system


def test_le_prompt_interdit_de_nommer_quelqu_un_hors_dossier():
    system = build_system_prompt()
    assert "jamais un nom inventé" in system


def test_le_user_prompt_ne_transporte_que_la_matiere_fournie():
    prompt = build_user_prompt(NEED, ACCOUNT, PROFILE, [{"full_name": "Claire Vasseur", "role": "DSI"}])

    assert "Migration ERP" in prompt
    assert "Claire Vasseur" in prompt
    assert "Groupe Helios" in prompt
    # Le besoin est borné : on n'injecte pas un dossier entier dans un plan.
    assert len(prompt) < 20000


def test_un_profil_absent_ne_casse_pas_le_prompt():
    # Une ESN qui n'a pas rempli son profil obtient un plan sans preuves, pas une
    # erreur — et surtout pas des preuves inventées.
    prompt = build_user_prompt(NEED, ACCOUNT, None, None)
    assert "BESOIN À ATTAQUER" in prompt
