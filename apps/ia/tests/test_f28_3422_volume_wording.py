"""#3422.1 — recette prod 03/10, réserve de libellé : sur « fondateur d'une ESN
de 3 consultants. Trouve-moi 100 comptes », la réponse ouvrait par « Je peux
te sortir les 100 comptes » et la carte s'intitulait « 100 comptes à explorer —
sprint exécutable », alors que la recherche n'en avait réellement rendu que 20.

Le nombre DEMANDÉ n'est pas un nombre TROUVÉ : ni l'ouverture, ni le titre de
la carte ne peuvent affirmer le premier quand seul le second est en main."""

from __future__ import annotations

from app.models.reply_blocks import validate_reply_block
from app.services.chat_tools import volume_sprint_handoff


def _card(**overrides) -> dict:
    block = {
        "type": "account_volume_sprint",
        "full_list_count": 20,
        "sprint": [{"name": f"Compte {i}"} for i in range(10)],
        "focus": [],
    }
    block.update(overrides)
    return block


def test_the_opening_names_what_is_in_hand_when_less_than_requested() -> None:
    out = volume_sprint_handoff(requested_count=100, criteria={}, returned_count=20)
    assert out is not None
    text = out["instruction"]
    assert "Je peux te sortir les 100" not in text
    assert "20" in text and "100" in text
    assert "jamais" in text  # la consigne nomme l'interdit : ne pas annoncer 100


def test_the_opening_keeps_the_promise_when_the_search_returned_the_requested_volume() -> None:
    out = volume_sprint_handoff(requested_count=30, criteria={}, returned_count=30)
    assert out is not None
    assert "Je peux te sortir les 30" in out["instruction"]


def test_the_opening_before_the_search_is_unchanged() -> None:
    out = volume_sprint_handoff(requested_count=100, criteria={}, returned_count=None)
    assert out is not None
    assert "Je peux te sortir les 100" in out["instruction"]


def test_a_card_title_claiming_the_requested_count_loses_its_title_not_the_card() -> None:
    block = validate_reply_block(_card(title="100 comptes à explorer — sprint exécutable"))
    assert block is not None
    assert "title" not in block  # l'écran retombe sur son intitulé neutre
    assert block["full_list_count"] == 20


def test_a_card_title_with_the_real_count_is_kept() -> None:
    block = validate_reply_block(_card(title="20 comptes à explorer — sprint exécutable"))
    assert block is not None
    assert block["title"] == "20 comptes à explorer — sprint exécutable"


def test_a_card_title_without_any_number_is_kept() -> None:
    block = validate_reply_block(_card(title="Sprint exécutable"))
    assert block is not None
    assert block["title"] == "Sprint exécutable"
