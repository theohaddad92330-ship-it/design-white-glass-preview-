"""#3243 (recette prod 03/10, CAPGEMINI — 3e fois « réfuté ») : Laura demandait contact et
canal sans nommer le challenge partenariat.

LE CAPS RÉEL : le challenge « partenaire potentiel » n'était rendu que par
`active_challenges_block`, dans le prompt, quand le tour porte un `account_data` (dossier
OUVERT). Posée depuis /chat sans fiche ouverte (« Sur le compte CAPGEMINI : … »), la
question n'avait aucun compte dans le prompt : le détecteur n'était jamais appelé. Le
compte arrive, lui, par l'outil `get_account_contacts` — c'est donc là que le challenge
est évalué, et il voyage dans le résultat que le modèle reçoit.

Le TOUR rejoué, fiche ouverte ou non : question → `get_account_contacts` → pont (profil
d'acteur : NAF) → le résultat remis au modèle porte `commercial_challenges`.

Question exacte à poser en recette : « Sur le compte CAPGEMINI : prépare-moi un message de
prospection pour le contact le plus pertinent » — SANS ouvrir la fiche, puis fiche ouverte.
Laura doit ouvrir sa réponse sur le challenge partenariat, avant toute question de canal.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.services import bellum_api, chat_orchestrator
from tests.test_chat_approved_message_routing_turn_replay import _Recording
from tests.test_chat_dsi_contacts_turn_replay import (
    ACCOUNT,
    USER,
    _FakeClient,
    _parse_sse,
    _patch_env,
    _resp,
    _text,
    _tool_use,
)

__all__ = ["_patch_env"]

_QUESTION = "Sur le compte CAPGEMINI : prépare-moi un message de prospection pour le contact le plus pertinent."


def _bridge(profile: dict | None) -> dict:
    return {
        "contacts": [{"contact_id": "c1", "full_name": "Laroche-Joubert", "channels": ["email"]}],
        "total": 1,
        "truncated": False,
        "account_sector": "Conseil",
        "account_profile": profile,
    }


def _replay(monkeypatch, client: TestClient, profile: dict | None, extra: dict) -> list[dict]:
    async def _contacts(*_a, **_k):
        return _bridge(profile)

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "account_contacts", _contacts)
    sent: list[dict] = []
    fake = _FakeClient([])
    fake.messages = _Recording(
        [
            _resp("tool_use", [_tool_use("get_account_contacts", {"account_id": ACCOUNT}, "t1")]),
            _resp("end_turn", [_text("Avant de rédiger : c'est un partenaire potentiel.")]),
        ],
        sent,
    )
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    res = client.post("/chat/message", json={"message": _QUESTION, "user_id": USER, **extra})
    assert res.status_code == 200
    assert _parse_sse(res.text)[-1]["success"] is True
    return sent


@pytest.mark.parametrize("extra", [{}, {"account_id": ACCOUNT}], ids=["hors_fiche", "fiche_ouverte"])
def test_an_esn_account_named_in_chat_carries_the_partnership_challenge_to_the_model(
    monkeypatch, client: TestClient, extra: dict
) -> None:
    sent = _replay(monkeypatch, client, {"company_name": "CAPGEMINI", "naf_code": "62.02A", "actor_type": None}, extra)
    # Le résultat d'outil remis au modèle porte le challenge, nommé…
    tool_turn = sent[1]["messages"]
    assert "commercial_challenges" in tool_turn
    assert "partenaire existant comme un client" in tool_turn
    # …et le prompt dit de l'ouvrir AVANT toute question.
    assert "commercial_challenges" in sent[0]["system"]


def test_a_client_naf_carries_no_challenge(monkeypatch, client: TestClient) -> None:
    sent = _replay(monkeypatch, client, {"company_name": "TF1", "naf_code": "60.20A", "actor_type": None}, {})
    assert "commercial_challenges" not in sent[1]["messages"]


def test_without_a_profile_the_bridge_result_carries_no_challenge(monkeypatch, client: TestClient) -> None:
    sent = _replay(monkeypatch, client, None, {})
    assert "commercial_challenges" not in json.dumps(sent[1]["messages"])


# ── Recette prod 03/10 (Y23, 4e « réfuté ») — la CAUSE est la DONNÉE, pas le tuyau ──────────────
# Les deux chemins (prompt, fiche ouverte OU compte résolu par son nom côté API ; outil
# `get_account_contacts`) appellent le MÊME détecteur sur le MÊME profil. Capgemini SE porte
# le NAF de SIÈGE (70.10Z) : la Phase 1, qui classe sur le seul NAF, l'a rangée « client final »
# — un NAF de siège ne dit rien du métier. Le détecteur ne partait donc jamais, par aucun chemin.

_HEAD_OFFICE_PROFILE = {"company_name": "CAPGEMINI SE", "naf_code": "70.10Z", "actor_type": "client final"}


@pytest.mark.parametrize("extra", [{}, {"account_id": ACCOUNT}], ids=["hors_fiche", "fiche_ouverte"])
def test_a_head_office_naf_esn_still_carries_the_challenge_in_the_tool_result(
    monkeypatch, client: TestClient, extra: dict
) -> None:
    sent = _replay(monkeypatch, client, dict(_HEAD_OFFICE_PROFILE), extra)
    assert "partenaire existant comme un client" in sent[1]["messages"]


def test_a_head_office_naf_esn_opens_the_system_prompt_on_the_challenge(monkeypatch, client: TestClient) -> None:
    """Fiche ouverte (ou compte nommé, résolu par l'API) : le prompt du TOUR porte le bloc
    « CHALLENGE(S) ACTIF(S) » — le modèle doit l'énoncer AVANT de demander contact et canal."""
    sent = _replay(
        monkeypatch,
        client,
        dict(_HEAD_OFFICE_PROFILE),
        {"account_id": ACCOUNT, "account_data": dict(_HEAD_OFFICE_PROFILE)},
    )
    assert "CHALLENGE(S) ACTIF(S) SUR CE TOUR" in sent[0]["system"]
    assert "partenaire existant comme un client" in sent[0]["system"]


def test_sait_dire_non_a_client_with_a_head_office_naf_and_an_unknown_name_carries_no_challenge(
    monkeypatch, client: TestClient
) -> None:
    sent = _replay(
        monkeypatch,
        client,
        {"company_name": "TF1 HOLDING", "naf_code": "70.10Z", "actor_type": "client final"},
        {"account_id": ACCOUNT, "account_data": {"company_name": "TF1 HOLDING", "naf_code": "70.10Z", "actor_type": "client final"}},
    )
    assert "CHALLENGE(S) ACTIF(S) SUR CE TOUR" not in sent[0]["system"]
    assert "commercial_challenges" not in sent[1]["messages"]
