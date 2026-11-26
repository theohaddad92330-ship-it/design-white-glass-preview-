"""#3427 (recette prod 02/10, Y13) — Laura répondait un message générique (source du
27/09) à « …le message approuvé pour une invitation LinkedIn… », sans dire « bibliothèque
vide » ni nommer d'écartés. Cause : l'outil `select_message_template` n'était annoncé que
par sa description ; le prompt ne disait nulle part « un message approuvé / un modèle se
demande à la bibliothèque, jamais à la mémoire de l'assistant », donc le modèle écrivait
un message libre sans appeler l'outil.

Le TOUR rejoué : question tronquée comme en recette → le prompt système porte la règle de
routage → le modèle appelle l'outil → le résultat que le modèle reçoit dit la bibliothèque
vide.

Question exacte à poser en recette : « Donne-moi le message approuvé pour une invitation
LinkedIn acceptée par un décideur. » (bibliothèque non importée) — Laura doit appeler
`select_message_template` et dire que la bibliothèque est vide, avec le geste d'import.
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.services import bellum_api
from tests.test_chat_dsi_contacts_turn_replay import (
    USER,
    _FakeClient,
    _FakeMessageStream,
    _parse_sse,
    _patch_env,
    _resp,
    _text,
    _tool_use,
)

__all__ = ["_patch_env"]

_EMPTY = {
    "selectedId": None,
    "reasons": ["la bibliothèque de l’espace est vide : aucune séquence n’a été importée"],
    "rejected": [],
    "template": None,
}


class _Recording:
    def __init__(self, responses, sent: list[dict]):
        self._responses = list(responses)
        self._sent = sent

    def stream(self, **kwargs):
        self._sent.append(
            {
                "system": json.dumps(kwargs.get("system"), ensure_ascii=False, default=str),
                "messages": json.dumps(kwargs.get("messages"), ensure_ascii=False, default=str),
            }
        )
        return _FakeMessageStream(self._responses.pop(0))


def test_a_truncated_approved_message_question_is_routed_to_the_library(monkeypatch, client: TestClient) -> None:
    async def _select(*_a, **_k):
        return _EMPTY

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "select_message_template", _select)
    sent: list[dict] = []
    fake = _FakeClient([])
    fake.messages = _Recording(
        [
            _resp(
                "tool_use",
                [
                    _tool_use(
                        "select_message_template",
                        {"channel": "linkedin_draft", "scenario_id": "accepted_connection", "persona": "decideur"},
                        "t1",
                    )
                ],
            ),
            _resp("end_turn", [_text("Ta bibliothèque est vide.")]),
        ],
        sent,
    )
    from app.services import chat_orchestrator

    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)

    res = client.post(
        "/chat/message",
        json={"message": "é pour une invitation LinkedIn acceptée par un décideur.", "user_id": USER},
    )
    assert res.status_code == 200
    assert _parse_sse(res.text)[-1]["success"] is True
    # 1) la règle de routage est dans le prompt du tour…
    assert "select_message_template" in sent[0]["system"]
    assert "message approuvé" in sent[0]["system"]
    # 2) …et le résultat d'outil remis au modèle dit la bibliothèque vide.
    assert "bibliothèque de l’espace est vide" in sent[1]["messages"]


def test_a_follow_up_request_asks_for_step_m2_and_the_library_text_reaches_the_model(
    monkeypatch, client: TestClient
) -> None:
    """#3437 / #3438 / #3440 — rejoue un tour : « la relance à J+7 pour un manager »
    → l'outil est appelé avec `step: M2` → le texte approuvé de la bibliothèque est remis
    au modèle tel quel, et la règle du prompt nomme les étapes.

    Recette /chat — la question exacte à poser : « Donne-moi le message approuvé pour la
    relance à J+7 d'un manager, invitation LinkedIn acceptée. »"""
    asked: dict = {}
    approved = {
        "selectedId": "e-m2",
        "reasons": ["canal=linkedin_draft", "étape=M2"],
        "rejected": [],
        "template": {
            "title": "M2 — Manager — invitation acceptée",
            "step": "M2",
            "text": "{{Prénom}}, j’espère que tout roule de votre côté.",
            "expectedVariables": ["Prénom"],
            "version": 1,
            "usageConstraints": [],
        },
    }

    async def _select(user_id, channel, scenario_id, persona, *args, **kwargs):
        asked.update(channel=channel, scenario_id=scenario_id, persona=persona, kwargs=kwargs)
        return approved

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "select_message_template", _select)
    sent: list[dict] = []
    fake = _FakeClient([])
    fake.messages = _Recording(
        [
            _resp(
                "tool_use",
                [
                    _tool_use(
                        "select_message_template",
                        {
                            "channel": "linkedin_draft",
                            "scenario_id": "accepted_connection",
                            "persona": "manager",
                            "step": "M2",
                        },
                        "t1",
                    )
                ],
            ),
            _resp("end_turn", [_text("Voici le modèle approuvé de l'étape M2.")]),
        ],
        sent,
    )
    from app.services import chat_orchestrator

    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)

    res = client.post(
        "/chat/message",
        json={
            "message": "Donne-moi le message approuvé pour la relance à J+7 d'un manager, invitation LinkedIn acceptée.",
            "user_id": USER,
        },
    )
    assert res.status_code == 200
    assert _parse_sse(res.text)[-1]["success"] is True
    assert "`step` M1 pour l'ouverture" in sent[0]["system"]
    assert asked["persona"] == "manager"
    assert asked["kwargs"] == {"step": "M2"}
    assert "j’espère que tout roule de votre côté" in sent[1]["messages"]


def test_a_rejected_m2_names_the_unsourced_figure_and_the_prompt_forbids_a_preamble(
    monkeypatch, client: TestClient
) -> None:
    """#3437 (recette prod 03/10) — M2 décideur écarté « sans nommer le chiffre non sourcé », avec
    un préambule « Première tranche : » parasite. Le motif d'écart remis au modèle CITE le chiffre,
    et le prompt interdit le préambule et renvoie vers la confirmation dans la bibliothèque.

    Recette /chat — la question exacte : « Donne-moi le message approuvé pour la relance à J+7
    d'un décideur, invitation LinkedIn acceptée. » → Laura nomme « divisé par deux le délai »."""
    rejected = {
        "selectedId": None,
        "reasons": ["canal=linkedin_draft", "étape=M2"],
        "rejected": [
            {
                "title": "M2 — Décideur — invitation acceptée",
                "matchesCriteria": True,
                "reason": "affirmation non soutenue par une donnée réelle et autorisée : « divisé par deux le délai »",
            }
        ],
        "template": None,
    }

    async def _select(*_a, **_k):
        return rejected

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "select_message_template", _select)
    sent: list[dict] = []
    fake = _FakeClient([])
    fake.messages = _Recording(
        [
            _resp(
                "tool_use",
                [
                    _tool_use(
                        "select_message_template",
                        {
                            "channel": "linkedin_draft",
                            "scenario_id": "accepted_connection",
                            "persona": "decideur",
                            "step": "M2",
                        },
                        "t1",
                    )
                ],
            ),
            _resp("end_turn", [_text("Écarté : « divisé par deux le délai » n'est pas sourcé.")]),
        ],
        sent,
    )
    from app.services import chat_orchestrator

    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    res = client.post(
        "/chat/message",
        json={"message": "Donne-moi le message approuvé pour la relance à J+7 d'un décideur.", "user_id": USER},
    )
    assert res.status_code == 200
    assert "« divisé par deux le délai »" in sent[1]["messages"]
    # Le prompt n'AMORCE plus l'interdit (le citer l'ancrait) : il dit où est la première phrase.
    assert "Première tranche" not in sent[0]["system"]
    assert "PREMIÈRE phrase est déjà le contenu" in sent[0]["system"]
    # Le chiffre non sourcé revient au modèle dans un champ dédié, à citer entre guillemets.
    assert "claimsToQuote" in sent[1]["messages"] and "divisé par deux le délai" in sent[1]["messages"]


def test_a_dormant_connection_m2_request_is_not_answered_by_a_scenario_question(
    monkeypatch, client: TestClient
) -> None:
    """#3438.4b (recette prod 03/10) — « message approuvé connexion dormante, étape M2, manager » :
    Laura posait une question de SCÉNARIO (« à froid ou connexion acceptée ? ») au lieu de dire que
    le modèle est à revoir. Cause : le prompt ne disait pas que « connexion dormante » EST le scénario
    `dormant_connection`, ni qu'une étape M2 sur un réseau professionnel fixe le canal ; elle
    demandait donc ce que la phrase portait déjà. La règle du prompt tranche : le scénario se déduit
    des mots, jamais redemandé ; tant que le chiffre n'est pas confirmé, « modèle à revoir » + le chiffre
    non sourcé nommé entre guillemets, jamais une question de scénario à la place.

    Recette /chat — la question exacte : « Donne-moi le message approuvé pour une connexion dormante,
    étape M2, manager. » → Laura dit que le modèle est à revoir et cite le chiffre non sourcé."""
    asked: dict = {}
    to_review = {
        "selectedId": None,
        "reasons": ["canal=linkedin_draft", "scénario=dormant_connection", "étape=M2"],
        "rejected": [
            {
                "title": "M2 — Manager — connexion dormante",
                "matchesCriteria": True,
                "reason": "affirmation non soutenue par une donnée réelle et autorisée : « 6 semaines »",
            }
        ],
        "template": None,
    }

    async def _select(user_id, channel, scenario_id, persona, *args, **kwargs):
        asked.update(channel=channel, scenario_id=scenario_id, persona=persona, kwargs=kwargs)
        return to_review

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "select_message_template", _select)
    sent: list[dict] = []
    fake = _FakeClient([])
    fake.messages = _Recording(
        [
            _resp(
                "tool_use",
                [
                    _tool_use(
                        "select_message_template",
                        {
                            "channel": "linkedin_draft",
                            "scenario_id": "dormant_connection",
                            "persona": "manager",
                            "step": "M2",
                        },
                        "t1",
                    )
                ],
            ),
            _resp("end_turn", [_text("Ce modèle est à revoir : « 6 semaines » n'est pas sourcé.")]),
        ],
        sent,
    )
    from app.services import chat_orchestrator

    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    res = client.post(
        "/chat/message",
        json={"message": "message approuvé connexion dormante, étape M2, manager", "user_id": USER},
    )
    assert res.status_code == 200
    system = sent[0]["system"]
    # la règle de routage : le scénario se déduit des mots, il ne se redemande pas…
    assert "connexion dormante" in system and "dormant_connection" in system
    assert "ne redemandes JAMAIS le scénario" in system
    # …et tant que le chiffre n'est pas confirmé : « modèle à revoir » + chiffre nommé.
    assert "modèle est à revoir" in system
    assert "J'ai vérifié" in system
    # l'outil reçoit le scénario déduit, l'étape et l'interlocuteur de la phrase.
    assert asked["scenario_id"] == "dormant_connection"
    assert asked["persona"] == "manager"
    assert asked["kwargs"] == {"step": "M2"}
    # le motif d'écart (avec le chiffre) est ce que le modèle reçoit.
    assert "« 6 semaines »" in sent[1]["messages"]
