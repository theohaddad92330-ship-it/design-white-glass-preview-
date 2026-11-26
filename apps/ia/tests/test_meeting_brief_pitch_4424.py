"""#4424.4 — le PITCH de réunion dans la carte `meeting_brief` rédigée par Laura.

Décision Louis 21/10/2026 : le pitch est une section du brief pour TOUS les
types de rendez-vous — trois à cinq phrases, l'offre de l'ESN croisée avec
l'enjeu du compte, tirées du profil de l'espace et du dossier. Sans profil
d'offre, il n'y a pas de pitch inventé : la carte le NOMME dans `unknowns`.
"""

from __future__ import annotations

from app.models.reply_blocks import validate_reply_block
from app.prompts.reply_formats import REPLY_FORMATS_DIRECTIVE
from app.services.reply_blocks import REPLY_TEXT_LABELS_FR, reply_blocks_as_text
from app.services.reply_layout_classifier import _FAMILY_DIRECTIVE, LayoutFamily

_BRIEF = {
    "type": "meeting_brief",
    "objective": "Obtenir un atelier daté.",
    "talking_points": ["Le programme data annoncé en juillet."],
}
_PITCH = (
    "Nous sommes DataCraft, nous accompagnons nos clients sur la data. "
    "Chez Acme, nous lisons un enjeu : moderniser la plateforme. "
    "Je vous propose un atelier de deux heures pour creuser ce sujet ensemble."
)


def test_the_card_carries_an_optional_pitch() -> None:
    block = validate_reply_block({**_BRIEF, "pitch": _PITCH})
    assert block is not None
    assert block["pitch"] == _PITCH
    # Facultatif : une carte sans pitch reste valide (aucun pitch inventé pour la remplir).
    assert validate_reply_block(_BRIEF) is not None


def test_a_pitch_is_bounded() -> None:
    """SAIT DIRE NON — cinq phrases tiennent en 600 signes ; au-delà, c'est une plaquette."""
    assert validate_reply_block({**_BRIEF, "pitch": "mot " * 200}) is None


def test_the_pitch_reads_back_as_text_right_after_the_objective() -> None:
    text = reply_blocks_as_text("```bellum-block\n" + __import__("json").dumps({**_BRIEF, "pitch": _PITCH}) + "\n```")
    lines = text.split("\n")
    assert lines[0] == "Objectif : Obtenir un atelier daté."
    assert lines[1] == f"{REPLY_TEXT_LABELS_FR['pitch']} {_PITCH}"


def test_the_prompt_asks_for_a_pitch_from_the_profile_and_the_account() -> None:
    line = next(row for row in REPLY_FORMATS_DIRECTIVE.split("\n") if row.startswith("- meeting_brief :"))
    assert "pitch?" in line
    assert "3 à 5 phrases" in line
    assert "profil" in line
    # Sans profil : nommé, jamais inventé.
    assert "unknowns" in line


def test_the_meeting_brief_layout_names_the_pitch() -> None:
    assert "pitch" in _FAMILY_DIRECTIVE[LayoutFamily.MEETING_BRIEF]
