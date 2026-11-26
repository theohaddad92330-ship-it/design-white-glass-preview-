"""#4334.1 — un message ou un pitch généré suit les trames du Drive interne Bellum.

DIAGNOSTIC (call refonte UX 19/10, 55:22 — « ça s'est pas appuyé sur les protocoles qu'il y a dans le
drive ») : `/message/generate` lisait la méthode intégrée (`method_block_for`) et les documents de
l'ESPACE (`retrieve_message_knowledge`), mais JAMAIS le savoir du Drive interne (#3586,
`rag_knowledge.retrieve_drive_context`) — que le chat, Découvrir, la recherche et le plan d'action
lisaient déjà. Le pitch d'appel partait donc de la consigne générique (`engagement.json`), sans la
trame ni les objections du Drive.

Règles tenues ici :
* le bloc Drive entre dans le prompt de RÉDACTION (consigne, comme la méthode) — jamais dans le texte
  contre lequel les affirmations sont vérifiées : une trame n'est pas une preuve ;
* la requête nomme le CANAL : la trame d'appel n'est pas celle d'un e-mail ;
* sans clé / sans corpus / en panne (`""`) : prompt byte-identique à celui d'avant (no-op strict).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

_CONTACT = {"full_name": "Sophie Durand", "title": "DSI", "entity": "Logis3PL", "account_id": "acc-1"}
_ACCOUNT = {"company_name": "Logis3PL", "sector": "Logistique 3PL", "raw_analysis": {}}
_DRIVE = "SAVOIR MÉTIER BELLUM (INTERNE)\n- [Source : Trame appel] Ouvrir par le signal, puis traiter 4 objections."


def _post(client: TestClient, *, drive: str, channel: str = "phone"):
    captured: dict = {"prompts": []}

    async def fake_claude(system_prompt, user_prompt, **_kwargs):
        captured["prompts"].append((system_prompt, user_prompt))
        return {"subject": None, "body": "Bonjour Sophie, je vous appelle au sujet de votre entrepôt."}, None

    with (
        patch("app.routers.message.get_supabase", return_value=MagicMock()),
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
        patch("app.routers.message.fetch_owned_account", new_callable=AsyncMock, return_value=_ACCOUNT),
        patch("app.routers.message.fetch_last_loss", new_callable=AsyncMock, return_value=None),
        patch("app.routers.message.retrieve_message_knowledge", new_callable=AsyncMock, return_value=("", [])),
        patch("app.routers.message.retrieve_drive_context", new_callable=AsyncMock, return_value=drive) as rd,
        patch("app.routers.message.call_claude", side_effect=fake_claude),
    ):
        res = client.post(
            "/message/generate",
            json={
                "contact_id": "c1",
                "user_id": "u1",
                "channel": channel,
                "context": "audit SRE",
                "profile_data": {"companyName": "Acme"},
            },
        )
    captured["drive"] = rd
    return res, captured


def test_le_pitch_d_appel_recoit_la_trame_du_drive_dans_sa_consigne(client: TestClient) -> None:
    res, cap = _post(client, drive=_DRIVE)
    assert res.status_code == 200, res.text
    system, user = cap["prompts"][0]
    assert "traiter 4 objections" in system
    assert "suis sa trame" in system
    # une trame n'est pas une preuve : elle ne rejoint jamais le texte des faits
    assert "traiter 4 objections" not in user


def test_la_requete_au_drive_nomme_le_canal(client: TestClient) -> None:
    _res, cap = _post(client, drive=_DRIVE, channel="phone")
    query = cap["drive"].await_args.args[0]
    assert "appel" in query


def test_sans_savoir_drive_le_prompt_est_celui_d_avant(client: TestClient) -> None:
    res, cap = _post(client, drive="")
    assert res.status_code == 200, res.text
    system, _user = cap["prompts"][0]
    assert "SAVOIR MÉTIER BELLUM" not in system
    assert "suis sa trame" not in system
