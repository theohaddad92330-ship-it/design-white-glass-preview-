"""#3384 (recette prod 02/10, Y13) — le TOUR entier rejoué : « est-ce que j'ai la capacité
de staffer deux profils Java d'ici un mois ? » → modèle simulé → VRAI outil `get_capacity`
→ pont simulé (jours mesurés) → le résultat d'outil que le modèle reçoit porte AUSSI les
déclarations « consultants en mission » / « vivier actif » du profil.

Cause trouvée : la consigne de nommage vivait seulement dans le prompt système ; or le
modèle répond depuis le RÉSULTAT d'outil (jours dispo, bench), qui ne portait que le
mesuré. Les déclarations n'arrivaient donc jamais dans la matière de la réponse.

Question exacte à poser en recette : dans /chat, sur un espace dont l'onboarding déclare
des consultants en mission et un vivier actif, « est-ce que j'ai la capacité de staffer
deux profils Java d'ici un mois ? » — Laura doit employer « consultants en mission » et
« vivier actif » comme déclarés, à côté des jours mesurés.
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.services import bellum_api
from tests.test_chat_buying_committee_turn_replay import _RecordingMessages
from tests.test_chat_dsi_contacts_turn_replay import (
    USER,
    _FakeClient,
    _parse_sse,
    _patch_env,
    _resp,
    _text,
    _tool_use,
)

__all__ = ["_patch_env"]


def _replay(monkeypatch, client: TestClient, profile: dict) -> str:
    async def _capacity(*_a, **_k):
        return {"capacityDays": 420, "availableDays": 231, "bench": {"rate": None, "measurability": "trop peu"}}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "capacity", _capacity)
    sent: list[dict] = []
    fake = _FakeClient([])
    fake.messages = _RecordingMessages(
        [
            _resp("tool_use", [_tool_use("get_capacity", {}, "t1")]),
            _resp("end_turn", [_text("ok")]),
        ],
        sent,
    )
    from app.services import chat_orchestrator

    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    res = client.post(
        "/chat/message",
        json={
            "message": "est-ce que j'ai la capacité de staffer deux profils Java d'ici un mois ?",
            "user_id": USER,
            "profile_data": profile,
        },
    )
    assert res.status_code == 200
    assert _parse_sse(res.text)[-1]["success"] is True
    return json.dumps(sent[1]["messages"], ensure_ascii=False, default=str)


def test_capacity_tool_result_carries_the_declared_delivery_lines(monkeypatch, client: TestClient) -> None:
    out = _replay(monkeypatch, client, {"consultantsOnMission": "31-80", "consultantsInPipe": "11-30"})
    assert "Consultants en mission" in out and "31-80" in out
    assert "Vivier actif" in out and "11-30" in out
    assert "déclar" in out


def test_capacity_tool_result_is_silent_when_nothing_is_declared(monkeypatch, client: TestClient) -> None:
    out = _replay(monkeypatch, client, {"targetMargin": "18 %"})
    assert "Consultants en mission" not in out
    assert "Vivier actif" not in out


def test_capacity_tool_result_names_what_is_not_declared_when_only_some_is(monkeypatch, client: TestClient) -> None:
    """#3384 (recette Y18) — l'espace ne déclare que l'intercontrat : Laura doit pouvoir
    NOMMER « consultants en mission » et « vivier actif » comme non déclarés (et proposer
    de les renseigner), sans en inventer la valeur."""
    out = _replay(monkeypatch, client, {"availableConsultantsBand": "1-5"})
    assert "Intercontrat déclaré" in out and "1-5" in out
    assert "non_declare" in out
    assert "Consultants en mission" in out and "Vivier actif" in out
    assert "consultantsOnMission" not in out


def test_capacity_tool_result_leads_with_the_sentence_to_say_about_undeclared_lines(
    monkeypatch, client: TestClient
) -> None:
    """#3384 (recette prod Y20) — `non_declare` enfoui en fin de résultat était ignoré : la
    phrase à DIRE vient en TÊTE du résultat, nomme les deux libellés et le geste pour les renseigner."""
    out = _replay(monkeypatch, client, {"availableConsultantsBand": "1-5"})
    assert "a_dire_dans_la_reponse" in out
    assert out.index("a_dire_dans_la_reponse") < out.index("declared_capacity")
    assert "Consultants en mission et Vivier actif ne sont pas déclarés" in out
    assert "Profil ESN" in out


def test_capacity_tool_result_has_no_sentence_when_all_three_are_declared(monkeypatch, client: TestClient) -> None:
    out = _replay(
        monkeypatch,
        client,
        {"availableConsultantsBand": "1-5", "consultantsOnMission": "31-80", "consultantsInPipe": "11-30"},
    )
    assert "a_dire_dans_la_reponse" not in out
