"""#O8 — recette Loïc 21/10 : l'analyse OGF finissait « Terminé » avec 0 message préparé.

Prod : ``bellum_messages`` reçoit 7079 tokens et en rend 21 (modèle léger) ; le routeur
faisait ``msg_out.get("messages", [])`` et transformait la réponse vide en ``[]`` sans
AUCUN log. Désormais : UNE reprise avec le modèle principal, puis un échec NOMMÉ.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.claude_service import CLAUDE_MODEL

from tests.test_phase4_plan import _TRUNCATION_ACCOUNT_PAYLOAD, _claude_return, _plan_dispatch

_MSG = {
    "messages": [
        {"contact_name": "Jean Dupont", "email_message": "Bonjour Jean", "linkedin_message": "Salut", "phone_script": "Allô"}
    ]
}


def _run(client: TestClient, messages_answers: list[dict], payload: dict | None = None):
    """Joue le plan ; chaque appel ``bellum_messages`` consomme la réponse suivante."""
    answers = list(messages_answers)
    msg_calls: list[dict] = []
    base = _plan_dispatch()

    async def dispatch(*args, **kwargs):
        if kwargs.get("prompt_name") == "bellum_messages":
            msg_calls.append(kwargs)
            return _claude_return(answers.pop(0) if answers else {})
        return await base(*args, **kwargs)

    with patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, side_effect=dispatch):
        res = client.post("/phase/4/plan", json=payload or _TRUNCATION_ACCOUNT_PAYLOAD)
    assert res.status_code == 200
    return res.json(), msg_calls


def test_o8_reponse_vide_deux_fois_est_nommee_jamais_silencieuse(client: TestClient) -> None:
    # #O8 — recette Loïc 21/10
    body, calls = _run(client, [{"messages": []}, {"messages": []}])
    assert len(calls) == 2, "UNE reprise exactement, jamais une boucle"
    assert calls[0].get("model"), "le premier essai reste sur le modèle léger"
    # Modèle nommé explicitement : test_model_policy refuse un site d'appel sans modèle.
    assert calls[1].get("model") == CLAUDE_MODEL, "la reprise passe par le modèle PRINCIPAL du plan"
    assert calls[1].get("model") != calls[0].get("model")
    degraded = body["data"]["planDegradedSections"]
    entry = [d for d in degraded if d["section"] == "bellum_messages"]
    assert len(entry) == 1 and entry[0]["code"] == "empty_output"
    assert "message" in entry[0]["message"].lower()
    assert body["data"]["contactMessages"] == []


def test_o8_enveloppe_data_non_deballee_ou_cle_absente_se_reprend(client: TestClient) -> None:
    # #O8 — recette Loïc 21/10
    body, calls = _run(client, [{"data": {"autre": 1}}, _MSG])
    assert len(calls) == 2
    assert len(body["data"]["contactMessages"]) == 1
    assert not [d for d in body["data"].get("planDegradedSections", []) if d["section"] == "bellum_messages"]


def test_o8_la_reprise_reussit_et_produit_des_messages(client: TestClient) -> None:
    # #O8 — recette Loïc 21/10
    body, calls = _run(client, [{"messages": []}, _MSG])
    assert len(calls) == 2
    assert body["data"]["contactMessages"] == _MSG["messages"]
    assert not [d for d in body["data"].get("planDegradedSections", []) if d["section"] == "bellum_messages"]


def test_o8_sans_contact_aucun_appel_aucune_entree_degradee(client: TestClient) -> None:
    # #O8 — recette Loïc 21/10
    body, calls = _run(client, [], {**_TRUNCATION_ACCOUNT_PAYLOAD, "contacts": []})
    assert calls == []
    assert not [d for d in body["data"].get("planDegradedSections", []) if d["section"] == "bellum_messages"]


def test_o8_messages_presents_un_seul_appel(client: TestClient) -> None:
    # #O8 — recette Loïc 21/10
    body, calls = _run(client, [_MSG])
    assert len(calls) == 1
    assert len(body["data"]["contactMessages"]) == 1
