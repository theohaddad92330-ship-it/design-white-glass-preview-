"""R40 (Thales) — un mot hébreu parasite « בלבד » au milieu d'une réponse française de Laura.

Le filtre retire un script non latin ISOLÉ d'une réponse FR/EN ; il laisse intacte une réponse réellement écrite
dans une autre langue, et ce que la personne a elle-même écrit dans ce script.
"""

from __future__ import annotations

import pytest

from app.services.foreign_script_guard import find_stray_foreign_script, strip_stray_foreign_script

THALES_REPLY = "Le verdict reste RÉSERVE pour Thales בלבד, faute de signal récent sur le périmètre défense."


def test_the_hebrew_word_is_found() -> None:
    assert find_stray_foreign_script(THALES_REPLY, user_message="Pourquoi le verdict a changé ?") == ["בלבד"]


def test_the_hebrew_word_is_removed_and_the_sentence_stays_clean() -> None:
    out = strip_stray_foreign_script(THALES_REPLY, user_message="Pourquoi le verdict a changé ?")
    assert out == "Le verdict reste RÉSERVE pour Thales, faute de signal récent sur le périmètre défense."


@pytest.mark.parametrize(
    "stray",
    ["только", "فقط", "仅", "เท่านั้น"],
)
def test_other_scripts_are_removed_too(stray: str) -> None:
    out = strip_stray_foreign_script(f"Le compte est prioritaire {stray} cette semaine.", user_message="Et Thales ?")
    assert out == "Le compte est prioritaire cette semaine."


def test_a_clean_french_reply_is_returned_byte_identical() -> None:
    text = "Le verdict est AGIR MAINTENANT — μ-service, 5 Ω, naïf, œuvre, Île-de-France."
    assert strip_stray_foreign_script(text, user_message="") == text


def test_a_reply_really_written_in_another_script_is_left_alone() -> None:
    text = "הדוח מוכן עבור תאלס והמלצה לשבוע הבא"
    assert strip_stray_foreign_script(text, user_message="") == text


def test_what_the_person_wrote_in_that_script_is_kept() -> None:
    out = strip_stray_foreign_script(
        "Tu parles de בלבד dans ta question ; voici le sens.", user_message="que veut dire בלבד ?"
    )
    assert "בלבד" in out


def test_empty_is_empty() -> None:
    assert strip_stray_foreign_script("", user_message=None) == ""


# #4656 (recette prod 27/10) — « כלבד » au milieu d'une phrase française sur EXOTEC : la garde R40 n'était posée que sur
# le chemin orchestrateur ; le repli sans orchestrateur (`call_claude`) servait le texte tel quel, et le cas ne se
# consignait pas. Le NOM PROPRE du compte (présent dans ses données) reste permis.
EXOTEC_REPLY = "Le compte EXOTEC est prioritaire כלבד cette semaine."


def test_4656_the_word_is_removed_with_account_data_that_does_not_carry_it() -> None:
    out = strip_stray_foreign_script(EXOTEC_REPLY, user_message="Et EXOTEC ?", known_text='{"company_name": "EXOTEC"}')
    assert out == "Le compte EXOTEC est prioritaire cette semaine."


def test_4656_a_proper_noun_already_in_the_account_data_is_kept() -> None:
    reply = "Le contact ירון לוי est le décideur."
    out = strip_stray_foreign_script(reply, user_message="", known_text='{"contacts": ["ירון לוי"]}')
    assert "ירון" in out


def test_4656_the_case_is_logged_without_its_content(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level("ERROR"):
        strip_stray_foreign_script(EXOTEC_REPLY, user_message="", known_text="")
    assert any("#4656" in r.getMessage() for r in caplog.records)
    assert not any("כלבד" in r.getMessage() for r in caplog.records)
