"""#3405.6 — le message d'un compte tient compte du MOTIF DE LA DERNIÈRE PERTE.

`projects.loss_reason` était lu pour le matching consultant (`chat_tools.py`),
jamais par la génération de message : le brouillon d'ouverture pouvait refaire
l'approche qui avait échoué. Le motif est désormais nommé au rédacteur — comme
consigne de NE PAS répéter l'erreur, jamais comme phrase à citer au destinataire.

Sans perte motivée, le prompt est celui d'avant, à l'octet près.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.prompts.bellum_outreach import build_user_prompt, last_loss_block
from app.routers.message import fetch_last_loss

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


def test_sans_perte_le_bloc_est_vide() -> None:
    assert last_loss_block(None) == ""
    assert last_loss_block({"reason": "  ", "closed_on": "2026-05-01"}) == ""


def test_la_perte_est_nommee_avec_sa_date_et_une_consigne_de_ne_pas_la_repeter() -> None:
    block = last_loss_block({"reason": "Prix trop élevé face à un concurrent offshore", "closed_on": "2026-05-01"})
    assert "Prix trop élevé face à un concurrent offshore" in block
    assert "2026-05-01" in block
    assert "ne répète pas" in block.lower()
    # Une consigne au rédacteur, pas une phrase à dire au destinataire.
    assert "ne cite pas" in block.lower()


def test_le_prompt_sans_perte_est_identique_a_celui_d_avant() -> None:
    assert build_user_prompt(**_BASE) == build_user_prompt(**_BASE, last_loss=None)


def test_le_prompt_avec_perte_porte_le_motif() -> None:
    prompt = build_user_prompt(**_BASE, last_loss={"reason": "Budget gelé", "closed_on": None})
    assert "Budget gelé" in prompt


async def test_fetch_last_loss_lit_la_derniere_perte_motivee() -> None:
    sb = MagicMock()
    chain = sb.table.return_value.select.return_value.eq.return_value.eq.return_value
    chain = chain.not_is.return_value.order.return_value.limit.return_value
    chain.aexecute = AsyncMock(
        return_value=MagicMock(data=[{"loss_reason": "Budget gelé", "closed_at": "2026-05-01T10:00:00Z"}])
    )
    assert await fetch_last_loss(sb, "acc-1") == {"reason": "Budget gelé", "closed_on": "2026-05-01"}


class _FakeBuilder:
    """Builder à l'image de `TableQuery` : `not_is`, jamais `filter` ni `not_`."""

    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows
        self.filters: list[tuple] = []

    def table(self, _name: str) -> "_FakeBuilder":
        return self

    def select(self, *_a: object) -> "_FakeBuilder":
        return self

    def eq(self, *_a: object) -> "_FakeBuilder":
        return self

    def not_is(self, *args: object) -> "_FakeBuilder":
        self.filters.append(args)
        return self

    def order(self, *_a: object, **_k: object) -> "_FakeBuilder":
        return self

    def limit(self, *_a: object) -> "_FakeBuilder":
        return self

    async def aexecute(self) -> MagicMock:
        return MagicMock(data=self.rows)


async def test_fetch_last_loss_utilise_not_is_null() -> None:
    sb = _FakeBuilder([{"loss_reason": "Budget gelé", "closed_at": "2026-05-01T10:00:00Z"}])
    assert await fetch_last_loss(sb, "acc-1") == {"reason": "Budget gelé", "closed_on": "2026-05-01"}
    assert ("loss_reason", "null") in sb.filters


async def test_fetch_last_loss_sans_ligne_rend_none() -> None:
    sb = MagicMock()
    chain = sb.table.return_value.select.return_value.eq.return_value.eq.return_value
    chain = chain.not_is.return_value.order.return_value.limit.return_value
    chain.aexecute = AsyncMock(return_value=MagicMock(data=[]))
    assert await fetch_last_loss(sb, "acc-1") is None


async def test_fetch_last_loss_en_echec_ne_bloque_pas_le_message_et_n_invente_rien() -> None:
    sb = MagicMock()
    sb.table.side_effect = RuntimeError("supabase down")
    assert await fetch_last_loss(sb, "acc-1") is None


def test_le_routeur_transmet_la_perte_au_prompt(client: TestClient) -> None:
    captured: dict = {}

    async def fake_claude(system_prompt, user_prompt, **_kwargs):
        captured["user_prompt"] = user_prompt
        return {"subject": "Suite", "body": "Bonjour, un mot sur l'audit SRE."}, None

    with (
        patch("app.routers.message.get_supabase", return_value=MagicMock()),
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
        patch(
            "app.routers.message.fetch_owned_account",
            new_callable=AsyncMock,
            return_value={"company_name": "BNP Paribas", "raw_analysis": {}},
        ),
        patch(
            "app.routers.message.fetch_last_loss",
            new_callable=AsyncMock,
            return_value={"reason": "Budget gelé", "closed_on": "2026-05-01"},
        ),
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
    assert "Budget gelé" in captured["user_prompt"]
