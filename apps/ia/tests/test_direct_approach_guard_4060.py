"""#4060 (R13, prod 15/10) — pas de question de redirection dans une approche directe / vers un décideur."""

import pytest

from app.services.direct_approach_guard import (
    strip_redirect_question,
    strip_redirect_question_when_direct,
    wants_direct_approach,
)

OBSERVED_REPLY = (
    "Bonjour Cindy,\n\n"
    "Nous accompagnons les directions financières sur la trajectoire de leurs systèmes. "
    "Seriez-vous disponible pour un échange de 20 minutes ?\n\n"
    "À qui me conseillez-vous de m'adresser chez Servier pour avancer sur ce sujet ?\n\n"
    "Bien cordialement"
)
OBSERVED_REQUEST = (
    "Rédige un e-mail d'approche directe à Cindy Tsai (Head of Finance, SERVIER, décideur économique), ne l'envoie pas"
)


def test_the_observed_prod_draft_loses_its_redirection_question() -> None:
    out = strip_redirect_question_when_direct(OBSERVED_REPLY, user_message=OBSERVED_REQUEST)
    assert "m'adresser" not in out and "À qui" not in out
    assert "échange de 20 minutes" in out  # l'offre reste
    assert out.startswith("Bonjour Cindy,") and out.endswith("Bien cordialement")
    assert "\n\n\n" not in out


@pytest.mark.parametrize(
    "request_text",
    ["Rédige une approche directe pour Paul", "Écris au décideur de Servier", "Un mail direct à la DAF"],
)
def test_direct_or_decision_maker_requests_are_detected(request_text: str) -> None:
    assert wants_direct_approach(request_text)


def test_indirect_approach_keeps_the_redirection_question() -> None:
    # Contact non décideur, approche indirecte : la question d'aiguillage est LÉGITIME.
    request = "Rédige un e-mail à Marc, chargé de mission achats chez Servier"
    assert not wants_direct_approach(request)
    assert strip_redirect_question_when_direct(OBSERVED_REPLY, user_message=request) == OBSERVED_REPLY


def test_declared_direct_overrides_a_request_that_does_not_say_it() -> None:
    out = strip_redirect_question_when_direct(OBSERVED_REPLY, user_message="Rédige un mail", direct=True)
    assert "m'adresser" not in out


@pytest.mark.parametrize(
    "sentence",
    [
        "Vers qui dois-je me tourner chez Servier ?",
        "Pourriez-vous m'orienter vers la bonne personne ?",
        "Qui serait la bonne personne pour en parler ?",
        "Si ce n'est pas vous, qui ?",
    ],
)
def test_other_redirection_phrasings_are_removed(sentence: str) -> None:
    out = strip_redirect_question(f"Bonjour,\n\nNotre offre en deux lignes.\n\n{sentence}\n\nCordialement")
    assert sentence.split()[0] not in out.split("\n\n")[2] if out.count("\n\n") >= 2 else True
    assert "Notre offre en deux lignes." in out and "Cordialement" in out
    assert sentence not in out


def test_a_text_made_only_of_the_question_is_left_alone() -> None:
    only = "À qui me conseillez-vous de m'adresser ?"
    assert strip_redirect_question(only) == only


def test_a_qualifying_question_is_not_a_redirection() -> None:
    text = "Bonjour,\n\nQuel est votre calendrier pour la refonte du SI finance ?\n\nCordialement"
    assert strip_redirect_question(text) == text


@pytest.mark.asyncio
async def test_prepare_mail_draft_direct_drops_the_redirection_question() -> None:
    from app.services import chat_tools

    result = await chat_tools.execute_chat_tool(
        "prepare_mail_draft",
        {"to": "cindy@servier.com", "subject": "Vos systèmes finance", "body": OBSERVED_REPLY, "approach": "direct"},
        user_id="u1",
        profile_data=None,
    )
    assert "m'adresser" not in result["proposal"]["body"]
    assert "échange de 20 minutes" in result["proposal"]["body"]


@pytest.mark.asyncio
async def test_prepare_mail_draft_indirect_keeps_it() -> None:
    from app.services import chat_tools

    result = await chat_tools.execute_chat_tool(
        "prepare_mail_draft",
        {"to": "marc@servier.com", "subject": "Achats", "body": OBSERVED_REPLY, "approach": "indirect"},
        user_id="u1",
        profile_data=None,
    )
    assert "m'adresser" in result["proposal"]["body"]
