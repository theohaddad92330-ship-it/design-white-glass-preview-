"""#3385 (recette prod 30/09, « l'effet d'un champ du profil sur Laura n'a pas encore été vu »)
— le TOUR /chat rejoué deux fois, seule la taille de l'ESN (`size`, réponse d'onboarding
« combien de consultants ») change : « Quelle est ma priorité cette semaine ? » → routeur
``/chat/message`` → prompt système RÉEL envoyé au modèle. Les deux prompts diffèrent par le
palier de stade, et le reste de la demande est identique : la réponse du profil modifie le
comportement, ce n'est pas du texte ajouté en fin de prompt.

Question exacte à poser en recette : dans /chat, changer la taille de l'ESN dans Réglages ›
Profil (3 puis 220 consultants), puis demander « Quelle est ma priorité cette semaine ? » — la
réponse doit changer de palier (freelance / très petite structure → grande ESN).
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from tests.test_chat_dsi_contacts_turn_replay import (
    ACCOUNT,
    USER,
    _FakeClient,
    _FakeMessageStream,
    _parse_sse,
    _patch_env,
    _resp,
    _text,
)

__all__ = ["_patch_env"]  # fixture autouse du tour (clé, throttle) rejouée telle quelle


class _SystemRecordingMessages:
    def __init__(self, responses, sent: list[str]):
        self._responses = list(responses)
        self._sent = sent

    def stream(self, **kwargs):
        self._sent.append(json.dumps(kwargs.get("system"), ensure_ascii=False, default=str))
        return _FakeMessageStream(self._responses.pop(0))


def _replay_turn(monkeypatch, client: TestClient, profile_data: dict) -> str:
    from app.services import chat_orchestrator

    sent: list[str] = []
    fake = _FakeClient([])
    fake.messages = _SystemRecordingMessages([_resp("end_turn", [_text("Ta priorité cette semaine.")])], sent)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)

    res = client.post(
        "/chat/message",
        json={
            "message": "Quelle est ma priorité cette semaine ?",
            "user_id": USER,
            "account_id": ACCOUNT,
            "profile_data": profile_data,
        },
    )
    assert res.status_code == 200
    done = _parse_sse(res.text)[-1]
    assert done["type"] == "done" and done["success"] is True, done
    assert len(sent) == 1
    return sent[0]


def test_changing_only_the_esn_size_changes_the_system_prompt_of_the_real_chat_turn(
    monkeypatch, client: TestClient
) -> None:
    base = {"esn_name": "Skaizen", "offers": ["Data"], "sectors": ["Médias"], "sellerRole": "Fondateur / CEO"}
    small = _replay_turn(monkeypatch, client, {**base, "size": "3"})
    large = _replay_turn(monkeypatch, client, {**base, "size": "220"})

    assert small != large
    assert "freelance / très petite structure" in small
    assert "grande ESN" in large
    assert "grande ESN" not in small
    assert "freelance / très petite structure" not in large


def test_weekly_priority_question_forces_the_stage_and_size_into_the_turn_3385_12(
    monkeypatch, client: TestClient
) -> None:
    """Recette prod 04/10 : « Quelle est ma priorité cette semaine ? » répondait
    « aucun ne justifie une priorité » sans stade ni taille alors que le profil dit
    30 à 80 consultants. Le tour porte maintenant une consigne PROPRE à cette question."""
    base = {"esn_name": "Skaizen", "offers": ["Data"], "sectors": ["Médias"], "size": "30-80"}
    system = _replay_turn(monkeypatch, client, base)
    assert "PRIORITÉ DE LA SEMAINE" in system
    assert "30-80" in system

    # Une autre question ne reçoit pas la consigne ; sans taille, rien n'est inventé.
    from app.prompts.laura_operating_context import weekly_priority_turn_block

    assert weekly_priority_turn_block({"size": "30-80"}, "Quel est le SIREN de Thales ?") == ""
    assert weekly_priority_turn_block({}, "Quelle est ma priorité cette semaine ?") == ""
    assert "30-80" in weekly_priority_turn_block({"size": "30-80"}, "Quelle est ma priorité cette semaine ?")


def test_staffing_model_turn_without_declared_mode_carries_the_profile_card_3186(
    monkeypatch, client: TestClient
) -> None:
    """#3186 (recette 04/10) — même tour /chat/message : la carte vers Réglages › Profil
    voyage dans l'événement `done` (`pending_actions`), la consigne dans le prompt."""
    from app.services import chat_orchestrator

    sent: list[str] = []
    fake = _FakeClient([])
    fake.messages = _SystemRecordingMessages([_resp("end_turn", [_text("Le mode n'est pas déclaré.")])], sent)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    res = client.post(
        "/chat/message",
        json={
            "message": "Comment présenter notre modèle de staffing ?",
            "user_id": USER,
            "account_id": ACCOUNT,
            "profile_data": {"esn_name": "Skaizen", "service_types": ["Conseil"]},
        },
    )
    done = _parse_sse(res.text)[-1]
    assert done["type"] == "done" and done["success"] is True, done
    assert "MODE CONTRACTUEL NON DÉCLARÉ" in sent[0]
    pending = done["data"]["context"]["pending_actions"]
    assert [p["route"] for p in pending] == ["/settings/profile"]


_RENDERED_METHOD = (
    "MÉTHODE COMMERCIALE RETENUE POUR CE COMPTE :\n- Niveau d'effort : Sprint court\n- Action suivante : Qualifier"
)


def test_approach_turn_replay_through_chat_message_3390_10(monkeypatch, client: TestClient) -> None:
    from app.services import chat_orchestrator

    sent: list[str] = []
    fake = _FakeClient([])
    fake.messages = _SystemRecordingMessages([_resp("end_turn", [_text("Méthode : …")])], sent)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    res = client.post(
        "/chat/message",
        json={
            "message": "Quelle approche pour ce compte ?",
            "user_id": USER,
            "account_id": ACCOUNT,
            "profile_data": {"esn_name": "Skaizen"},
            "commercial_method_context": _RENDERED_METHOD,
        },
    )
    assert _parse_sse(res.text)[-1]["success"] is True
    assert "BLOC MÉTHODE" in sent[0] and "Niveau d'effort : Sprint court" in sent[0]


def test_opening_question_turn_carries_the_plan_entry_route_3423_8(monkeypatch, client: TestClient) -> None:
    """#3423.8 (recette 04/10) — « Par où j'ouvre ce compte ? » : la voie d'entrée du plan (celle de
    l'onglet Plan) est imposée au tour ; sans voie au plan, Laura le dit."""
    from app.services import chat_orchestrator

    def turn(plan_summary: str, message: str) -> str:
        sent: list[str] = []
        fake = _FakeClient([])
        fake.messages = _SystemRecordingMessages([_resp("end_turn", [_text("ok")])], sent)
        monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
        res = client.post(
            "/chat/message",
            json={
                "message": message,
                "user_id": USER,
                "account_id": ACCOUNT,
                "profile_data": {"esn_name": "Skaizen"},
                "plan_summary": plan_summary,
            },
        )
        assert _parse_sse(res.text)[-1]["success"] is True
        return sent[0]

    plan = '"objectif"\nVOIE D\'ENTRÉE DU PLAN : Directeur Data'
    with_route = turn(plan, "Par où j'ouvre ce compte ?")
    assert "« Directeur Data » — c'est celle que montre l'onglet Plan" in with_route
    without_route = turn('"objectif"', "Par où j'ouvre ce compte ?")
    assert "ne porte pas encore de voie" in without_route
    assert "PAR OÙ OUVRIR CE COMPTE" not in turn(plan, "Quel est le SIREN de Thales ?")


def test_cold_call_turn_opens_the_call_dialog_card_not_a_script_3443(monkeypatch, client: TestClient) -> None:
    """#3443 (recette 04/10) — « Prépare-moi un appel à froid pour Martin » : la consigne du tour
    impose `prepare_cold_call` (la carte) et le tour rejoué ressort avec la carte en action en
    attente — pas de script texte, pas de liste de contacts."""
    from unittest.mock import AsyncMock, patch

    from app.services import chat_orchestrator
    from tests.test_chat_dsi_contacts_turn_replay import _tool_use

    contact = {
        "id": "11111111-1111-4111-8111-111111111111",
        "full_name": "Pierre Martin",
        "title": "DSI",
        "account_id": "22222222-2222-4222-8222-222222222222",
        "email": "p@example.com",
        "entity": "ACME Digital",
    }
    call_input = {
        "contact_id": contact["id"],
        "reason": "Projet cloud documenté.",
        "objective": "Qualifier un besoin.",
        "opening_question": "As-tu 30 secondes ?",
        "next_questions": ["Qui pilote le sujet ?"],
        "objection": "Pas de besoin.",
        "fallback": "Demander qui choisit.",
        "expected_outcome": "Un email de synthèse.",
    }
    sent: list[str] = []
    fake = _FakeClient([])
    fake.messages = _SystemRecordingMessages(
        [
            _resp("tool_use", [_tool_use("prepare_cold_call", call_input, "tu1")]),
            _resp("end_turn", [_text("Le brief d'appel est prêt.")]),
        ],
        sent,
    )
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    with (
        patch("app.services.chat_tools._resolve_owned_contact", AsyncMock(return_value=contact)),
        patch("app.services.chat_tools._account_name_for", AsyncMock(return_value="ACME Digital")),
        patch("app.services.chat_tools._recent_outreach_for_contact", AsyncMock(return_value=None)),
    ):
        res = client.post(
            "/chat/message",
            json={
                "message": "Prépare-moi un appel à froid pour Martin, DSI",
                "user_id": USER,
                "account_id": ACCOUNT,
                "profile_data": {"esn_name": "Skaizen"},
            },
        )
    done = _parse_sse(res.text)[-1]
    assert done["type"] == "done" and done["success"] is True, done
    assert "APPEL À FROID (consigne de ce tour)" in sent[0] and "LEQUEL" in sent[0]
    pending = done["data"]["context"]["pending_actions"]
    assert [p["action"] for p in pending if p["action"] == "prepare_cold_call"] == ["prepare_cold_call"]
    assert "APPEL À FROID (consigne" not in _replay_turn(monkeypatch, client, {"esn_name": "S", "size": "3"})
