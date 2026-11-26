"""#2371.5 — « longueur » : le sixième attribut composé du cadrage.

La longueur d'un canal vivait en prose dans `_CHANNEL_RULES` (bellum_outreach),
illisible comme donnée par `derive_message_brief`. Elle a désormais UNE source
(`app.knowledge.channel_length`) : le prompt l'interpole, le cadrage la rend.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.knowledge.channel_length import CHANNEL_LENGTH
from app.prompts import bellum_outreach
from app.services.message_brief import derive_message_brief

_CONTACT = {"title": "Directeur des systèmes d'information"}


@pytest.mark.parametrize("channel", sorted(CHANNEL_LENGTH))
def test_the_prompt_rule_of_each_channel_carries_its_single_source_length(channel: str):
    # Si quelqu'un réécrit la longueur dans le prompt sans passer par la donnée,
    # ce test dit NON : deux textes divergeraient (GA-26).
    assert CHANNEL_LENGTH[channel] in bellum_outreach._CHANNEL_RULES[channel]


def test_every_channel_of_the_prompt_has_a_length_or_is_named_without():
    # Aucun canal n'est oublié en silence.
    assert set(bellum_outreach._CHANNEL_RULES) == set(CHANNEL_LENGTH)


def test_a_channel_brief_names_its_length_with_its_source():
    brief = derive_message_brief(contact=_CONTACT, relationship_state="froid", angle="", channel="email")
    assert brief["length"] == CHANNEL_LENGTH["email"]
    assert brief["lengthSource"] == "canal"


def test_an_unknown_channel_is_never_guessed():
    brief = derive_message_brief(contact=_CONTACT, relationship_state="froid", angle="", channel="pigeon")
    assert brief["length"] is None
    assert brief["lengthSource"] == "non_mesure"


def test_without_channel_the_brief_is_the_one_from_before_key_for_key():
    brief = derive_message_brief(contact=_CONTACT, relationship_state="froid", angle="")
    assert "length" not in brief
    assert "lengthSource" not in brief


def test_the_channel_rules_text_is_byte_identical_to_before_the_extraction():
    snapshot = Path(__file__).with_name("fixtures") / "channel_rules_2371_5.json"
    before = json.loads(snapshot.read_text(encoding="utf-8"))
    # #2370 — des canaux s'ajoutent ; ceux d'avant l'extraction restent octet pour octet.
    assert before == {channel: bellum_outreach._CHANNEL_RULES[channel] for channel in before}
