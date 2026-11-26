"""#4421.3 (recette prod 23/10, consultant React) — 10 comptes + offres datées, mais 0 contact en clair et 0
« Préparer le mail ». « Aucun contact connu » ne s'écrit que si le compte n'en a VRAIMENT aucun : un compte
absent de l'espace (jamais analysé) et une lecture qui n'a pas abouti sont deux autres états, NOMMÉS."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.services import bellum_api, chat_tools
from app.services.known_shape_gate import shape_read_from_tool

ACCOUNT_ID = "11111111-1111-4111-8111-111111111111"


def _accounts() -> list[dict[str, Any]]:
    return [{"name": "Alten"}, {"name": "Inconnue SA"}, {"name": "Vide SA"}]


@pytest.fixture
def bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    async def workspace(user_id: str, *, query: str, sector: Any, limit: int) -> dict[str, Any]:
        rows = {"Alten": "a-alten", "Vide SA": "a-vide"}
        return {"accounts": [{"account_id": rows[query], "company_name": query}] if query in rows else []}

    async def contacts(user_id: str, account_id: str, **_k: Any) -> dict[str, Any]:
        if account_id == "a-alten":
            return {"contacts": [{"contact_id": "ct-1", "full_name": "Claire Petit", "title": "Recrutement", "email": "c@alten.fr"}]}
        return {"contacts": []}

    monkeypatch.setattr(bellum_api, "workspace_accounts", workspace)
    monkeypatch.setattr(bellum_api, "account_contacts", contacts)


@pytest.mark.asyncio
async def test_4421_3_les_trois_etats_d_un_compte_sont_nommes(bridge: None) -> None:
    accounts = _accounts()
    await chat_tools._talent_account_contacts("u-1", accounts)
    alten, inconnue, vide = accounts
    assert [c["name"] for c in alten["contacts"]] == ["Claire Petit"] and "contacts_note" not in alten
    # Jamais analysé : ce n'est PAS « aucun contact connu ».
    assert inconnue["contacts_state"] == "not_in_workspace"
    # Dans l'espace, vraiment aucun contact : c'est le seul cas de « Aucun contact connu ».
    assert vide["contacts_state"] == "none_known"
    assert vide["contacts_note"] == "Aucun contact connu — lancer l'analyse."
    assert inconnue["contacts_note"] != vide["contacts_note"]


@pytest.mark.asyncio
async def test_4421_3_une_lecture_coupee_se_dit_jamais_un_silence(monkeypatch: pytest.MonkeyPatch, bridge: None) -> None:
    async def slow(user_id: str, *, query: str, sector: Any, limit: int) -> dict[str, Any]:
        await asyncio.sleep(5)
        return {"accounts": []}

    monkeypatch.setattr(bellum_api, "workspace_accounts", slow)
    monkeypatch.setattr(chat_tools, "_TALENT_CONTACTS_BUDGET_S", 0.05)
    accounts = _accounts()
    await chat_tools._talent_account_contacts("u-1", accounts)
    assert all(a["contacts_state"] == "unread" for a in accounts)


def test_4421_3_la_carte_ne_dit_pas_aucun_contact_pour_un_compte_hors_espace() -> None:
    out = {
        "status": "ok",
        "consultant": {"id": "22222222-2222-4222-8222-222222222222", "name": "Hugo"},
        "accounts": [
            {"name": "Inconnue SA", "why": ["Publie 2 offres citant React."], "contacts": [],
             "contacts_state": "not_in_workspace", "contacts_note": "x"},
            {"name": "Vide SA", "why": ["Publie 1 offre citant React."], "contacts": [],
             "contacts_state": "none_known", "contacts_note": "x"},
            {"name": "Lente SA", "why": ["Publie 1 offre citant React."], "contacts_state": "unread"},
        ],
        "limits": [],
    }
    card = shape_read_from_tool("find_accounts_for_talent", out, language="fr")["blocks"]["account_ranking"]
    inconnue, vide, lente = (" ".join(i["why"]) for i in card["items"])
    assert "Aucun contact connu" not in inconnue and "pas encore dans ton espace" in inconnue.lower()
    assert "Aucun contact connu" in vide
    assert "Aucun contact connu" not in lente and "non lus" in lente
