"""#2648.1 — quand l'accroche ne peut PAS s'écrire, le moteur DOIT dire ce qui
manque, au lieu de laisser Claude deviner (ou de renvoyer une 502 muette pour
un cas qu'on peut pourtant nommer).

Un contact sans poste connu ET sans signal récent n'offre RIEN à quoi
accrocher une accroche personnalisée — écrire quand même produirait du
générique habillé en personnalisé, ou forcerait Claude à broder. Le routeur
refuse ce cas PRÉCIS, nommément (`insufficient_context`), AVANT d'appeler le
modèle. Tout le reste (erreur Claude, panne réseau…) reste une 502 sans raison
inventée — la doctrine ne permet pas de deviner une raison qu'on ne connaît
pas.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient


def _fake_sb(account: dict | None = None) -> MagicMock:
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.maybe_single.return_value = chain
    chain.aexecute = AsyncMock(return_value=MagicMock(data=account or {}))
    sb = MagicMock()
    sb.table.return_value = chain
    return sb


def _patches(contact: dict, account: dict | None = None, claude_return=None, claude_side_effect=None):
    claude_kwargs = {}
    if claude_side_effect is not None:
        claude_kwargs["side_effect"] = claude_side_effect
    else:
        claude_kwargs["return_value"] = (claude_return or {"icebreakers": []}, None)
    return (
        patch("app.routers.icebreaker.get_supabase", return_value=_fake_sb()),
        patch("app.routers.icebreaker.fetch_owned_contact", new_callable=AsyncMock, return_value=contact),
        patch("app.routers.icebreaker.fetch_owned_account", new_callable=AsyncMock, return_value=account or {}),
        patch("app.routers.icebreaker.call_claude", new_callable=AsyncMock, **claude_kwargs),
    )


def test_icebreaker_generate_returns_data_when_contact_has_a_title(client: TestClient) -> None:
    contact = {"full_name": "Jean Dupont", "title": "DSI", "decision_role": None, "account_id": "a1"}
    p1, p2, p3, p4 = _patches(contact, account={"raw_analysis": {}}, claude_return={"icebreakers": [{"text": "Bonjour"}]})
    with p1, p2, p3, p4:
        res = client.post(
            "/icebreaker/generate",
            json={"contact_id": "c1", "user_id": "u1", "profile_data": {"companyName": "Acme"}},
        )
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_icebreaker_generate_returns_data_when_a_recent_signal_exists(client: TestClient) -> None:
    # Aucun poste connu, mais un signal récent : de quoi accrocher une accroche.
    contact = {"full_name": "Jean Dupont", "title": None, "decision_role": None, "account_id": "a1"}
    account = {"raw_analysis": {"recent_signals": [{"title": "Levée de fonds"}]}}
    p1, p2, p3, p4 = _patches(contact, account=account, claude_return={"icebreakers": [{"text": "Bonjour"}]})
    with p1, p2, p3, p4:
        res = client.post(
            "/icebreaker/generate",
            json={"contact_id": "c1", "user_id": "u1", "profile_data": {"companyName": "Acme"}},
        )
    assert res.status_code == 200


def test_icebreaker_generate_422_insufficient_context_when_nothing_to_hook_on(client: TestClient) -> None:
    # Ni poste, ni rôle de décision, ni signal récent : rien à quoi accrocher —
    # le routeur refuse AVANT d'appeler Claude, et NOMME la raison.
    contact = {"full_name": "Jean Dupont", "title": None, "decision_role": None, "account_id": "a1"}
    account = {"raw_analysis": {"recent_signals": []}}
    p1, p2, p3, p4 = _patches(contact, account=account)
    with p1, p2, p3, p4:
        res = client.post(
            "/icebreaker/generate",
            json={"contact_id": "c1", "user_id": "u1", "profile_data": {"companyName": "Acme"}},
        )
    assert res.status_code == 422
    detail = res.json()["detail"]
    assert detail["code"] == "insufficient_context"


def test_icebreaker_generate_does_not_call_claude_when_context_is_insufficient(client: TestClient) -> None:
    contact = {"full_name": "Jean Dupont", "title": None, "decision_role": None, "account_id": "a1"}
    account = {"raw_analysis": {"recent_signals": []}}
    p1, p2, p3, p4 = _patches(contact, account=account)
    with p1, p2, p3, p4 as mocked_claude:
        client.post(
            "/icebreaker/generate",
            json={"contact_id": "c1", "user_id": "u1", "profile_data": {"companyName": "Acme"}},
        )
        mocked_claude.assert_not_called()


def test_icebreaker_generate_502_without_a_fabricated_reason_on_a_claude_failure(client: TestClient) -> None:
    contact = {"full_name": "Jean Dupont", "title": "DSI", "decision_role": None, "account_id": "a1"}
    p1, p2, p3, p4 = _patches(contact, account={"raw_analysis": {}}, claude_side_effect=ValueError("fail"))
    with p1, p2, p3, p4:
        res = client.post(
            "/icebreaker/generate",
            json={"contact_id": "c1", "user_id": "u1", "profile_data": {"companyName": "Acme"}},
        )
    assert res.status_code == 502
    # Une panne de modèle n'est pas une raison NOMMÉE : jamais de code inventé.
    detail = res.json()["detail"]
    assert not (isinstance(detail, dict) and detail.get("code") == "insufficient_context")
