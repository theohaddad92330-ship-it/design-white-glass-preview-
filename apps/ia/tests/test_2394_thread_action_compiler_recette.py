"""Épopée #2955 (#2394.52 à .61) — le GATE DE RECETTE à 10 scénarios nommé
par le corps de l'épopée : « un gate de recette couvrant 10 scénarios (thread
long, pièces jointes, réponse partielle, mauvais destinataire, token expiré,
double clic, annulation…) ».

Sept des dix scénarios se jouent côté NestJS, au niveau du DISPATCH
(`apps/api/src/modules/action-router/thread-action-compiler.recette.spec.ts`,
#2394.52/.53/.57/.58/.59/.60/.61). Les TROIS restants sont une question de
FORME du fil telle que `search_mailbox` la rend au modèle — c'est le sujet de
ce fichier, par le seul point d'entrée qui compte : `execute_chat_tool`, pas
`compile_thread` appelé isolément, pour que la frontière D65 (jamais le corps
d'un message) reste sur le chemin réel.

- #2394.54 — un fil LONG (beaucoup de participants, longtemps sans réponse) :
  ne doit ni planter ni tronquer silencieusement les participants (dont
  dépend le refus « mauvais destinataire » de #2394.57, `mail_thread_hints`).
- #2394.55 — un fil avec PIÈCES JOINTES : `has_attachments` doit passer, sans
  jamais que le contenu d'une pièce jointe (ou une liste `attachments` brute)
  n'atteigne le modèle.
- #2394.56 — une RÉPONSE PARTIELLE : un fil quasi vide (pas d'état, pas de
  compte résolu, pas de raison de priorité) ne doit JAMAIS faire deviner une
  action ou un writeback CRM — `None`/`[]`, jamais une valeur inventée.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools
from app.services.compilers.thread_compiler import compile_thread


@pytest.mark.asyncio
async def test_2394_54_fil_long_tous_les_participants_survivent_sans_troncature(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    many_participants = [f"contact{i}@acme.com" for i in range(40)]

    async def fake_search(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "intent": "no_reply",
            "truncated": False,
            "threads": [
                {
                    "threadId": "t-long",
                    "subject": "Fil de discussion prolongé",
                    "counterpart": "jean@acme.com",
                    "otherParticipants": many_participants,
                    "daysSinceLastMessage": 411,
                    "awaitingReply": True,
                    "unread": False,
                    "hasAttachments": False,
                    "state": "awaiting_reply",
                    "priorityReason": "awaiting_reply_late",
                    "account": {"id": "acc-1", "name": "ACME", "via": "domain"},
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "search_mailbox", fake_search)
    result = await chat_tools.execute_chat_tool(
        "search_mailbox", {"intent": "no_reply"}, user_id="u1", profile_data=None
    )

    thread = result["threads"][0]
    # Aucun participant perdu en route — la borne de #2955 (07/09, mailbox.service.ts)
    # coupe la RECHERCHE, jamais la projection d'un fil déjà rendu.
    assert len(thread["other_participants"]) == 40
    assert thread["days_since_last_message"] == 411
    assert thread["suggested_action"] == "relancer"

    # #2394.57 — les 40 participants restent tous des destinataires CONNUS
    # pour la vérification anti-mauvais-destinataire (`mail_thread_hints`).
    search_output = {
        "threads": [{"threadId": "t-long", "otherParticipants": many_participants}]
    }
    hints = chat_tools.mail_thread_hints("search_mailbox", search_output)
    assert hints == [{"thread_id": "t-long", "participants": sorted(many_participants)}]


@pytest.mark.asyncio
async def test_2394_55_pieces_jointes_signalees_jamais_leur_contenu(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake_search(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "intent": "no_reply",
            "truncated": False,
            "threads": [
                {
                    "threadId": "t-attach",
                    "subject": "Devis signé",
                    "counterpart": "jean@acme.com",
                    "hasAttachments": True,
                    # Ce que le pont ne devrait JAMAIS relayer, même s'il le
                    # portait un jour (D65) : le contenu ou la liste des
                    # pièces jointes, pas seulement le corps du message.
                    "attachments": [{"name": "devis-signe.pdf", "bytes": "base64...="}],
                    "state": "unread",
                    "priorityReason": "unread",
                },
                {
                    "threadId": "t-no-attach",
                    "subject": "Relance",
                    "counterpart": "marie@acme.com",
                    "hasAttachments": False,
                    "state": "awaiting_reply",
                    "priorityReason": "awaiting_reply",
                },
            ],
        }

    monkeypatch.setattr(bellum_api, "search_mailbox", fake_search)
    result = await chat_tools.execute_chat_tool(
        "search_mailbox", {"intent": "no_reply"}, user_id="u1", profile_data=None
    )

    with_attachment, without_attachment = result["threads"]
    assert with_attachment["has_attachments"] is True
    assert without_attachment["has_attachments"] is False
    assert "attachments" not in with_attachment
    for thread in result["threads"]:
        assert "bytes" not in str(thread)


def test_2394_56_reponse_partielle_ne_devine_ni_action_ni_writeback() -> None:
    # Un fil quasi vide (état/raison/compte tous absents) — la forme la plus
    # proche d'un message dont on n'a qu'une trace partielle : le compilateur
    # ne doit RIEN inventer, exactement la doctrine « jamais de donnée fictive ».
    partial_thread = {"threadId": "t-partial", "subject": None, "counterpart": None}

    compiled = compile_thread(partial_thread)

    assert compiled["suggested_action"] is None
    assert compiled["suggested_writeback"] is None
    assert compiled["other_participants"] == []
    assert compiled["account"] is None
    assert compiled["basis"] == []

    # Un fil sans AUCUN participant connu ne peut motiver aucun refus « mauvais
    # destinataire » ni aucune proposition — `[]`, jamais un participant deviné.
    hints = chat_tools.mail_thread_hints(
        "search_mailbox", {"threads": [partial_thread]}
    )
    assert hints == []
