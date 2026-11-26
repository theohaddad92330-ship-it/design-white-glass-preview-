"""#3418 — « Ce contact est introuvable » en démo alors que la fiche est ouverte.

Cause : `/message/generate` demandait à PostgREST une colonne qui n'existe pas sur
`contacts` (`hierarchy_level`). La requête échouait en 400, `QueryResult` rendait
`data=None`, et `fetch_owned_contact` lisait cette absence comme « pas à toi » : 404
« Contact not found », que le proxy traduit en « Ce contact est introuvable ».

Les tests de routeur mockent `fetch_owned_contact` : aucun ne pouvait le voir. Ici on
compare les colonnes DEMANDÉES au schéma réel (l'entité TypeORM), et on prouve qu'un
échec de lecture n'est plus déguisé en 404.
"""

from __future__ import annotations

import re
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.services.ownership import fetch_owned_account, fetch_owned_contact
from app.services.supabase_client import QueryResult

_ENTITIES = Path(__file__).resolve().parents[2] / "api" / "src" / "database" / "entities"


def _entity_columns(filename: str) -> set[str]:
    source = (_ENTITIES / filename).read_text(encoding="utf-8")
    named = set(re.findall(r"name:\s*'([a-z_0-9]+)'", source))
    props = set(re.findall(r"^\s{2}([a-z][a-z_0-9]*)[!?]?:\s", source, flags=re.MULTILINE))
    return named | props


def test_le_routeur_message_ne_demande_que_des_colonnes_de_contacts(client: TestClient) -> None:
    captured: dict = {}

    async def fake_claude(system_prompt, user_prompt, **_kwargs):
        return {"subject": "Suite", "body": "Bonjour, un mot sur l'audit SRE."}, None

    fetch_contact = AsyncMock(return_value={"full_name": "Olivier Martin", "title": "CTO", "account_id": "acc-1"})
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
            json={"contact_id": "c1", "user_id": "u1", "channel": "email", "context": "audit SRE", "profile_data": {"companyName": "Acme"}},
        )
    assert res.status_code == 200, res.text
    captured["columns"] = fetch_contact.call_args.kwargs["columns"]

    asked = {c.strip() for c in captured["columns"].split(",")}
    unknown = asked - _entity_columns("contact.entity.ts")
    assert not unknown, f"colonnes absentes de `contacts` (PostgREST répondrait 400) : {sorted(unknown)}"


@pytest.mark.asyncio
async def test_un_echec_de_lecture_nest_pas_un_contact_introuvable() -> None:
    sb = MagicMock()
    query = sb.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value
    query.aexecute = AsyncMock(return_value=QueryResult(data=None, error='{"code":"42703"}'))
    with pytest.raises(HTTPException) as err:
        await fetch_owned_contact(sb, "c1", "u1")
    assert err.value.status_code == 503


@pytest.mark.asyncio
async def test_un_echec_de_lecture_nest_pas_un_compte_introuvable() -> None:
    sb = MagicMock()
    query = sb.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value
    query.aexecute = AsyncMock(return_value=QueryResult(data=None, error="boom"))
    with pytest.raises(HTTPException) as err:
        await fetch_owned_account(sb, "a1", "u1")
    assert err.value.status_code == 503


@pytest.mark.asyncio
async def test_une_absence_reelle_reste_un_404() -> None:
    sb = MagicMock()
    query = sb.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value
    query.aexecute = AsyncMock(return_value=QueryResult(data=None, error=None))
    with pytest.raises(HTTPException) as err:
        await fetch_owned_contact(sb, "c1", "u1")
    assert err.value.status_code == 404
