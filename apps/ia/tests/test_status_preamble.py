"""#3482 — « Le travail s'est interrompu… » n'ouvre pas chaque réponse de Laura.

Le rappel d'un travail interrompu (`INTERRUPTED_WORK_BLOCK`) est une consigne au
modèle ; la recette du 30/09 a vu 4 réponses sur 4 s'ouvrir sur le gabarit. Le
prompt est corrigé (2d37d6fc) ; ce module ajoute le FILET déterministe : la
phrase de statut est retirée d'une réponse quand rien ne l'a causée.

Elle reste quand (a) un outil de CE tour a réellement échoué ou (b) la personne
demande où en est le travail / de le reprendre.
"""

from __future__ import annotations

import re

import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.services.status_preamble import strip_status_preamble
from tests.test_chat_thread_interrupted_work import _FIXTURE

PREAMBLE = "Le travail s'est interrompu après : la recherche des contacts. Rien n'est confirmé fait. Reprendre ?"
BODY = "Voici les 3 priorités du compte : 1. Relancer le DSI."


def test_a_preamble_on_a_complete_answer_is_removed() -> None:
    out = strip_status_preamble(
        f"{PREAMBLE}\n\n{BODY}", user_message="Donne-moi les 3 priorités", failed_tools=frozenset()
    )
    assert out == BODY


def test_the_curly_apostrophe_and_bold_variants_are_removed_too() -> None:
    reply = "**Le travail s’est interrompu après : l’étape 2.** Rien n’est confirmé fait. Reprendre ?\n\n" + BODY
    assert strip_status_preamble(reply, user_message="Et lui ?", failed_tools=frozenset()) == BODY


def test_no_when_a_tool_really_failed_this_turn() -> None:
    reply = f"{PREAMBLE}\n\n{BODY}"
    assert strip_status_preamble(reply, user_message="Et lui ?", failed_tools=frozenset({"search_contacts"})) == reply


def test_no_when_the_person_asks_where_the_work_stands() -> None:
    reply = f"{PREAMBLE}\n\n{BODY}"
    for message in ("Où en est-on ?", "reprends le travail", "on en était où ?"):
        assert strip_status_preamble(reply, user_message=message, failed_tools=frozenset()) == reply


def test_no_when_nothing_would_remain() -> None:
    assert strip_status_preamble(PREAMBLE, user_message="Et lui ?", failed_tools=frozenset()) == PREAMBLE


def test_a_reply_that_does_not_open_on_the_template_is_untouched() -> None:
    reply = f"{BODY}\n\n{PREAMBLE}"  # en fin de réponse : une ligne séparée est permise par le rappel
    assert strip_status_preamble(reply, user_message="Et lui ?", failed_tools=frozenset()) == reply


def test_the_english_template_is_removed_as_well() -> None:
    reply = "The work was interrupted after: the contact search. Nothing is confirmed done. Resume?\n\nHere you go."
    assert strip_status_preamble(reply, user_message="And him?", failed_tools=frozenset()) == "Here you go."


# ── Le tour rejoué : entrée → modèle qui ouvre sur le gabarit → réponse ───────


def _replay(client: TestClient, message: str, model_reply: str) -> str:
    async def _fake_run(system, user, **kwargs):
        return (model_reply, [])

    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run):
        res = client.post("/chat/message", json={"message": message, "user_id": "u1", "thread_state": _FIXTURE})
    events = [json.loads(b[len("data:") :]) for b in res.text.strip().split("\n\n") if b.startswith("data:")]
    return events[-1]["data"]["reply"]


def test_replayed_turn_the_final_reply_does_not_open_on_the_status_sentence(client: TestClient) -> None:
    reply = _replay(client, "Donne-moi les 3 priorités du compte", f"{PREAMBLE}\n\n{BODY}")
    assert not reply.startswith("Le travail s'est interrompu")
    assert reply == BODY


def test_replayed_turn_asking_where_it_stands_keeps_the_template(client: TestClient) -> None:
    reply = _replay(client, "Où en est-on ?", f"{PREAMBLE}\n\nReprise possible.")
    assert reply.startswith("Le travail s'est interrompu après")


def test_a_first_slice_preamble_is_stripped_from_the_head() -> None:
    from app.services.status_preamble import strip_slice_preamble

    assert strip_slice_preamble("Première tranche : Écarté : « divisé par deux le délai ».") == (
        "Écarté : « divisé par deux le délai »."
    )
    assert strip_slice_preamble("**Première tranche :** Voici le modèle.") == "Voici le modèle."
    assert strip_slice_preamble("Première tranche :") == "partie :"


def test_3437_la_formule_premiere_tranche_ne_sort_jamais_quelle_que_soit_la_tournure() -> None:
    """Recette prod 04/10 : « Cette première tranche couvre… » ouvrait la réponse à « Est-ce que je peux ouvrir SG ? »."""
    from app.services.status_preamble import strip_slice_preamble

    exact = "Cette première tranche couvre la fiche Société Générale. Oui, tu peux ouvrir SG : la fiche est active."
    assert strip_slice_preamble(exact) == "Oui, tu peux ouvrir SG : la fiche est active."
    for variant in (
        "CETTE PREMIÈRE TRANCHE couvre SG. Oui.",
        "Cette premiere tranche couvre SG. Oui.",
        "Cette 1ère tranche couvre SG. Oui.",
        "This first slice covers SG. Oui.",
        "Oui.\n\nVoici la première tranche : SG.\n\nSuite ?",
    ):
        assert not re.search(r"(?i)premi[èe]re\s+tranche|1\s*[èe]?re\s+tranche|first\s+slice", strip_slice_preamble(variant)), variant
    assert strip_slice_preamble("Voici la première tranche du plan.") == "Voici la partie du plan."
    assert strip_slice_preamble("Réponse sans la formule.") == "Réponse sans la formule."
