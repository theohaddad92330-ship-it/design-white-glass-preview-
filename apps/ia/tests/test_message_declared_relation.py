"""#3231 / #219.8 — rejoue le tour « Contacter » de bout en bout côté IA : la relation
DÉCLARÉE sur la fiche contact (« Relation avec l'entreprise ») change le message.

Recette prod 01/10 : le sélecteur est présent sur la fiche, mais l'effet sur le message
n'avait jamais été rejoué. Ici : entrée (`POST /message/generate`, contact déclaré
ex-salarié) → colonne lue (`declared_person_company_relation`) → prompt envoyé au modèle
→ brouillon rendu. Sans déclaration, le prompt est celui d'avant.

Question à poser en recette : sur un contact dont « Relation avec l'entreprise » est
« Ancien salarié », cliquer « Contacter » — le brouillon ne doit pas affirmer qu'il travaille
encore dans l'entreprise ; remis sur « Non renseigné », la prudence disparaît.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

_CONTACT = {"full_name": "Olivier Martin", "title": "CTO", "account_id": "acc-1"}


def _generate(client: TestClient, contact: dict) -> tuple[dict, dict]:
    captured: dict = {}

    async def fake_claude(system_prompt, user_prompt, **_kwargs):
        captured["user_prompt"] = user_prompt
        return {"subject": "Suite", "body": "Bonjour, un mot sur l'audit SRE."}, None

    fetch_contact = AsyncMock(return_value=contact)
    with (
        patch("app.routers.message.get_supabase", return_value=MagicMock()),
        patch("app.routers.message.fetch_owned_contact", fetch_contact),
        patch(
            "app.routers.message.fetch_owned_account",
            new_callable=AsyncMock,
            return_value={"company_name": "BNP Paribas", "raw_analysis": {}},
        ),
        patch("app.routers.message.fetch_last_loss", new_callable=AsyncMock, return_value=None),
        patch("app.routers.message.call_claude", side_effect=fake_claude),
    ):
        res = client.post(
            "/message/generate",
            json={
                "contact_id": "c1",
                "user_id": "u1",
                "channel": "email",
                "context": "audit SRE",
                "profile_data": {"companyName": "Acme"},
            },
        )
    assert res.status_code == 200, res.text
    return captured, fetch_contact.call_args.kwargs


def test_le_routeur_lit_la_colonne_declaree(client: TestClient) -> None:
    _, kwargs = _generate(client, _CONTACT)
    assert "declared_person_company_relation" in kwargs["columns"]


def test_un_ex_salarie_declare_change_le_message(client: TestClient) -> None:
    captured, _ = _generate(client, {**_CONTACT, "declared_person_company_relation": "employee_former"})
    assert "n'est plus salariée" in captured["user_prompt"]


def test_sans_declaration_le_message_ne_porte_aucune_prudence(client: TestClient) -> None:
    captured, _ = _generate(client, _CONTACT)
    assert "RELATION PERSONNE" not in captured["user_prompt"]
