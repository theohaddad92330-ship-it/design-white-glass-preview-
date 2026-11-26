"""#4631 — la prose de Laura ne promet jamais une liste que l'écran ne rend pas.

Mesuré en prod le 26/10 : « 10 employeurs avec une offre… » et « les autres comptes ci-dessous », 0 table, 0 carte.
Le décompte qui fait foi est celui de ce qui est RENDU (cartes, tableaux, puces) ; sans rien de rendu, la phrase qui
annonce un volume ou renvoie « ci-dessous » est remplacée par une ligne qui DIT qu'aucune liste n'est affichée.
La garde sait dire NON : une carte rendue, une liste à puces, un nombre sans annonce, une phrase sans nombre."""

from __future__ import annotations

import json

from app.services.prose_card_consistency import drop_prose_promising_missing_list
from app.services.reply_blocks import REPLY_BLOCK_FENCE


def _card(n: int) -> str:
    items = [{"name": f"Compte {i}", "why": ["Raison."]} for i in range(n)]
    return (
        f"```{REPLY_BLOCK_FENCE}\n" + json.dumps({"type": "account_ranking", "axes": ["Axe"], "items": items}) + "\n```"
    )


def test_4631_announced_volume_without_any_list_is_replaced_by_the_truth() -> None:
    reply = "J'ai trouvé 10 employeurs avec une offre de Business Developer datée. ELAN et KATALL recrutent."
    out = drop_prose_promising_missing_list(reply, language="fr")
    assert "10 employeurs" not in out
    assert "aucune liste" in out.lower()
    assert "ELAN et KATALL recrutent." in out


def test_4631_ci_dessous_without_any_list_is_replaced() -> None:
    reply = "Voici Servier. Les autres comptes ci-dessous sont moins mûrs."
    out = drop_prose_promising_missing_list(reply, language="fr")
    assert "ci-dessous" not in out and "aucune liste" in out.lower()
    assert out.startswith("Voici Servier.")


def test_4631_english_parity() -> None:
    out = drop_prose_promising_missing_list("I found 10 employers hiring a Business Developer.", language="en")
    assert "10 employers" not in out and "no list" in out.lower()


def test_4631_a_rendered_card_keeps_the_prose() -> None:
    reply = f"J'ai trouvé 10 employeurs. Les autres comptes ci-dessous.\n\n{_card(10)}"
    assert drop_prose_promising_missing_list(reply, language="fr") == reply


def test_4631_a_bullet_list_counts_as_rendered() -> None:
    reply = "J'ai trouvé 3 comptes :\n- ELAN\n- KATALL\n- Thales"
    assert drop_prose_promising_missing_list(reply, language="fr") == reply


def test_4631_a_markdown_table_counts_as_rendered() -> None:
    reply = "J'ai trouvé 2 comptes :\n\n| Compte | Raison |\n| --- | --- |\n| ELAN | Offre |\n| KATALL | Offre |"
    assert drop_prose_promising_missing_list(reply, language="fr") == reply


def test_4631_a_number_that_announces_nothing_is_kept() -> None:
    reply = "Servier emploie 9 000 personnes et compte 12 filiales."
    assert drop_prose_promising_missing_list(reply, language="fr") == reply


def test_4631_a_single_account_is_not_a_list() -> None:
    reply = "J'ai trouvé 1 compte : Servier."
    assert drop_prose_promising_missing_list(reply, language="fr") == reply


def test_4631_a_count_inside_a_sentence_without_announcement_is_kept() -> None:
    reply = "Sur les 120 entreprises du secteur, aucune ne recrute en ce moment."
    assert drop_prose_promising_missing_list(reply, language="fr") == reply
