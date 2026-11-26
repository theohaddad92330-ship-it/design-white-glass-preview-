"""#3419.3 — la consigne « accroche alternative » existe dans `/message/generate`.

Le bouton « Autres accroches » du centre d'approbation réutilisait
`/icebreaker` faute de chemin de révision dans `/message`. La demande porte
maintenant un champ `revision` : le rédacteur reçoit le message courant et la
consigne de ne réécrire que l'OUVERTURE, sur un autre élément RÉEL du dossier.

Sans `revision`, le prompt est celui d'avant, à l'octet près.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.prompts.bellum_outreach import alternative_hook_block, build_user_prompt
from app.routers.message import MessageRequest

_CONTACT = {"full_name": "Olivier Martin", "title": "CTO", "account_id": "acc-1"}
_BASE = {
    "contact": _CONTACT,
    "raw_analysis": {},
    "profile": {"companyName": "Acme"},
    "recent_signals": [],
    "channel": "email",
    "context": "audit SRE",
    "company_name": "BNP Paribas",
}
_REVISION = {"kind": "alternative_hook", "current_body": "Bonjour Olivier,\n\nVotre levée récente.\n\nUn mot sur l'audit SRE."}


def test_sans_revision_le_bloc_est_vide_et_le_prompt_inchange() -> None:
    assert alternative_hook_block(None) == ""
    assert build_user_prompt(**_BASE) == build_user_prompt(**_BASE, revision=None)


def test_le_bloc_demande_une_autre_ouverture_sur_un_autre_element_reel() -> None:
    block = alternative_hook_block({"kind": "alternative_hook", "current_body": _REVISION["current_body"]})
    low = block.lower()
    assert "Votre levée récente." in block
    assert "ouverture" in low and "premier paragraphe" in low
    # Une AUTRE accroche : pas la même, pas sur le même élément.
    assert "différent" in low
    # Jamais un fait inventé : pas d'autre élément réel ⇒ on le dit, on ne comble pas.
    assert "n'invente" in low
    assert "aucun autre élément" in low
    # Le reste du message n'est pas réécrit.
    assert "reste du message" in low


def test_les_accroches_deja_proposees_sont_a_eviter() -> None:
    block = alternative_hook_block({**_REVISION, "previous_hooks": ["Votre nouvelle direction data."]})
    assert "Votre nouvelle direction data." in block
    assert "déjà proposé" in block.lower()


def test_le_prompt_avec_revision_porte_le_bloc() -> None:
    assert "Votre levée récente." in build_user_prompt(**_BASE, revision=_REVISION)


def test_la_requete_refuse_une_revision_inconnue_ou_vide() -> None:
    base = {"contact_id": "c1", "user_id": "u1", "channel": "email"}
    with pytest.raises(ValidationError):
        MessageRequest(**base, revision={"kind": "rewrite_everything", "current_body": "x"})
    with pytest.raises(ValidationError):
        MessageRequest(**base, revision={"kind": "alternative_hook", "current_body": "   "})
    assert MessageRequest(**base).revision is None


def test_le_routeur_transmet_la_revision_au_prompt(client: TestClient) -> None:
    captured: dict = {}

    async def fake_claude(system_prompt, user_prompt, **_kwargs):
        captured["user_prompt"] = user_prompt
        return {"subject": "Suite", "body": "Bonjour Olivier, une autre entrée en matière."}, None

    with (
        patch("app.routers.message.get_supabase", return_value=MagicMock()),
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
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
                "revision": _REVISION,
            },
        )
    assert res.status_code == 200, res.text
    assert "Votre levée récente." in captured["user_prompt"]


def test_3419_only_the_opening_survives_and_placeholders_resolve_to_the_real_contact(client: TestClient) -> None:
    """Recette prod nuit 08→09/10 (#3419) — le modèle a réécrit le message ENTIER et laissé
    des placeholders bruts (« [Prénom] [fonction] [coordonnées] »). Même si le modèle
    recommence : seule l'ouverture écrite par le modèle doit survivre, le reste redevient
    `current_body` mot pour mot, et tout gabarit à crochets reconnu devient la vraie
    valeur du contact — jamais laissé brut."""
    contact = {
        "full_name": "Olivier Martin",
        "title": "CTO",
        "account_id": "acc-1",
        "email": "olivier.martin@bnp.example",
        "phone": "0102030405",
    }

    async def fake_claude(system_prompt, user_prompt, **_kwargs):
        return {
            "subject": "Suite",
            "body": (
                "Bonjour [Prénom], en tant que [fonction] je vous recontacte.\n\n"
                "J'ai aussi réécrit CETTE partie, qui ne devait pas bouger.\n\n"
                "Contactez-moi via [coordonnées]."
            ),
        }, None

    with (
        patch("app.routers.message.get_supabase", return_value=MagicMock()),
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=contact),
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
                "revision": _REVISION,
            },
        )
    assert res.status_code == 200, res.text
    body = res.json()["data"]["body"]
    assert body == (
        "Bonjour Olivier, en tant que CTO je vous recontacte.\n\n"
        "Votre levée récente.\n\n"
        "Un mot sur l'audit SRE."
    )
    assert "[" not in body and "]" not in body
