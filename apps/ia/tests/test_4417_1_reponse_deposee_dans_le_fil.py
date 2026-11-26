"""#4417.1 (FAIL prod 25/10) — « réponds au dernier mail de DHRU Khakhariya » : Laura lisait le fil puis RÉDIGEAIT
la réponse DANS LE CHAT, sans brouillon rattaché au fil. Le dépôt existe (`prepare_mail_draft` → carte →
`PendingActions.tsx` → `mailboxApi.createDraft({threadId})`) : ce qui manquait, c'est qu'il soit APPELÉ et DIT.

Doctrine : le copilote n'envoie JAMAIS ; il prépare un brouillon rattaché au fil d'origine, dit où, et ne recopie
pas la réponse dans le chat. Le corps du fil ne sort pas : aucun corps de mail ici.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services import chat_orchestrator, chat_tools
from app.services.chat_tools import CHAT_TOOLS
from app.services.chat_turn_plan import plan_turn
from app.services.mail_reply_request import mail_reply_note
from tests.test_chat_orchestrator import (  # noqa: F401 — fixtures autouse
    _install_client,
    _patch_env,
    _resp,
    _text,
)

REQUEST = "réponds au dernier mail de DHRU Khakhariya"
_REPO = Path(__file__).resolve().parents[3]


def test_la_consigne_impose_le_chemin_et_interdit_la_reponse_dans_le_chat() -> None:
    note = mail_reply_note()
    for name in ("search_mailbox", "read_mail_thread", "prepare_mail_draft", "thread_id"):
        assert name in note
    assert "AUCUNE question" in note
    assert "ne recopies JAMAIS la réponse dans le chat" in note
    assert "/mailbox?thread=" in note
    assert "n'envoies jamais" in note


@pytest.mark.asyncio
async def test_le_tour_retire_la_clarification_et_porte_la_consigne(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("ok")])])
    await chat_orchestrator.run_chat_with_tools(
        "sys", REQUEST, user_id="u1", profile_data={}, user_message=REQUEST
    )
    first_call = fake.messages.calls[0]
    assert "ask_clarification" not in {tool["name"] for tool in first_call["tools"]}
    assert "RÉPONDRE À UN MAIL (#4417.1)" in str(first_call["system"])


@pytest.mark.asyncio
async def test_la_proposition_dit_ou_le_brouillon_est_depose_avec_le_lien_du_fil() -> None:
    result = await chat_tools.execute_chat_tool(
        "prepare_mail_draft",
        {"to": "dhru@bouygues-construction.com", "subject": "Re: InMail", "body": "Bonjour, merci pour votre message.",
         "thread_id": "th-42"},
        user_id="u1",
        profile_data=None,
    )
    note = result["proposal"]["note_pour_laura"]
    assert "/mailbox?thread=th-42" in note
    assert "ne recopie pas" in note.lower()


@pytest.mark.asyncio
async def test_un_destinataire_sans_adresse_oriente_vers_celle_du_fil_au_lieu_d_une_impasse() -> None:
    result = await chat_tools.execute_chat_tool(
        "prepare_mail_draft",
        {"to": "DHRU Khakhariya", "subject": "Re: InMail", "body": "Bonjour.", "thread_id": "th-42"},
        user_id="u1",
        profile_data=None,
    )
    assert "counterpart" in result["error"] and "search_mailbox" in result["error"]
    assert "chat" in result["error"]  # jamais « rédige-la dans le chat »


def test_le_budget_laisse_un_tour_de_reprise() -> None:
    assert plan_turn(REQUEST, None).tool_rounds >= 4


def test_garde_l_appelant_du_depot_ne_se_perd_pas() -> None:
    """Le dépôt de brouillon n'est utile que tant que quelqu'un l'appelle : on prouve la chaîne entière."""
    assert "prepare_mail_draft" in {str(t["name"]) for t in CHAT_TOOLS}
    orchestrator = (_REPO / "apps/ia/app/services/chat_orchestrator.py").read_text(encoding="utf-8")
    assert "mail_reply_note(" in orchestrator and "is_mail_reply_request(" in orchestrator
    catalog = (_REPO / "apps/api/src/modules/action-os/copilot-card-catalog.ts").read_text(encoding="utf-8")
    assert "case 'prepare_mail_draft'" in catalog and "threadId: action.thread_id" in catalog
    pending = (_REPO / "apps/web/src/features/chat/view/PendingActions.tsx").read_text(encoding="utf-8")
    assert "threadId: action.thread_id" in pending and "createDraft" in pending


@pytest.mark.asyncio
async def test_l_outil_prepare_une_carte_a_valider_il_ne_depose_ni_n_envoie_rien(monkeypatch: pytest.MonkeyPatch) -> None:
    """Droits : hors geste du commercial, rien n'est écrit dans la boîte. L'outil rend une PROPOSITION (jamais un dépôt)."""
    import httpx

    async def _no_network(*args: object, **kwargs: object) -> None:
        raise AssertionError("prepare_mail_draft ne doit écrire nulle part : le dépôt se fait au clic")

    monkeypatch.setattr(httpx.AsyncClient, "post", _no_network)
    monkeypatch.setattr(httpx.AsyncClient, "request", _no_network)
    result = await chat_tools.execute_chat_tool(
        "prepare_mail_draft",
        {"to": "dhru@bouygues-construction.com", "subject": "Re: InMail", "body": "Bonjour, merci pour votre message.",
         "thread_id": "th-42"},
        user_id="u1",
        profile_data=None,
    )
    proposal = result["proposal"]
    assert proposal["action"] == "prepare_mail_draft"
    assert not any(key in {**result, **proposal} for key in ("sent", "draft_id", "message_id"))
