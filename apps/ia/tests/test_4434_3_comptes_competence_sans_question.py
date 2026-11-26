"""#4434.3 (recette prod 23/10, FAIL) — « Quels comptes cherchent du React ? » : Laura demandait le périmètre
(IDF / Grand Est / Toute la France / Autre). Doctrine : Laura AGIT — elle prend le périmètre du profil (sinon la
France), le DIT en une ligne, et lance la recherche par compétence (moteur de Découvrir, voisines NOMMÉES)."""

from __future__ import annotations

import pytest

from app.services import chat_orchestrator
from app.services.skill_accounts_request import requested_skill, skill_accounts_note
from tests.test_chat_orchestrator import (  # noqa: F401 — fixtures autouse
    _install_client,
    _patch_env,
    _resp,
    _text,
)


@pytest.mark.parametrize(
    ("message", "skill"),
    [
        ("Quels comptes cherchent du React ?", "React"),
        ("quelles entreprises recrutent du Java en ce moment", "Java"),
        ("Trouve-moi des boîtes qui cherchent des développeurs Python", "Python"),
        ("Quels comptes recrutent en data ?", "data"),
        ("Trouve-moi des comptes data qui recrutent", "data"),
    ],
)
def test_une_demande_de_comptes_par_competence_est_reconnue(message: str, skill: str) -> None:
    assert requested_skill(message) == skill


@pytest.mark.parametrize(
    "message",
    ["Qui est le DSI de Kiabi ?", "Quels comptes cherchent un partenaire ?", "Je cherche du React", ""],
)
def test_le_reste_n_est_pas_reconnu(message: str) -> None:
    assert requested_skill(message) is None


def test_la_consigne_pose_le_perimetre_du_profil_et_le_dit() -> None:
    note = skill_accounts_note("React", "Quels comptes cherchent du React ?", {"geoZone": "Île-de-France"})
    assert '"region": ["11"]' in note
    assert "Périmètre : Île-de-France (ton profil)" in note
    assert "run_account_search" in note


def test_sans_zone_au_profil_la_france_est_posee_et_dite() -> None:
    note = skill_accounts_note("React", "Quels comptes cherchent du React ?", {})
    assert '"region"' not in note
    assert "Périmètre : toute la France" in note


def test_une_zone_dite_dans_la_demande_gagne_sur_le_profil() -> None:
    note = skill_accounts_note("React", "Quels comptes cherchent du React en Occitanie ?", {"geoZone": "Grand Est"})
    assert '"region": ["76"]' in note and "Grand Est" not in note


@pytest.mark.asyncio
async def test_tour_rejoue_aucune_question_de_perimetre(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("ok")])])
    message = "Quels comptes cherchent du React ?"
    await chat_orchestrator.run_chat_with_tools(
        "sys", message, user_id="u1", profile_data={"geoZone": "Île-de-France"}, user_message=message
    )
    first_call = fake.messages.calls[0]
    assert "ask_clarification" not in {tool["name"] for tool in first_call["tools"]}
    assert "Périmètre : Île-de-France (ton profil)" in str(first_call["system"])
