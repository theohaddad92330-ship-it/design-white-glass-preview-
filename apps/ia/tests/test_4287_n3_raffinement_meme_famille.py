"""#4287.4 (recette 21/10, N3) — un raffinement garde la famille de rendu, quelle que soit sa FORME.

« Cartographie les comptes du département 34 » → carte ; « santé ou industrie » → carte ; « Montpellier »
→ texte brut. Un mot seul (ville, secteur, taille) n'était pas reconnu comme raffinement. Le bloc de forme
nomme maintenant la forme du raffinement (lue sur le message du tour) et la famille à garder."""

from __future__ import annotations

import json

import pytest

from app.prompts.reply_style_continuity import refinement_form, reply_style_block
from tests.test_chat_reply_style_continuity import _MAP_WITH_BADGES as _MAP


def _history() -> list[dict]:
    fenced = "```bellum-block\n" + json.dumps(_MAP, ensure_ascii=False) + "\n```"
    return [
        {"role": "user", "content": "Cartographie les comptes du département 34"},
        {"role": "assistant", "content": fenced},
    ]


@pytest.mark.parametrize(
    ("message", "form"),
    [
        ("Montpellier", "place"),
        ("à Béziers", "place"),
        ("santé ou industrie", "sector"),
        ("plutôt la banque", "sector"),
        ("plus de 200 salariés", "size"),
        ("seulement les PME", "size"),
    ],
)
def test_la_forme_du_raffinement_est_lue_sur_le_message(message: str, form: str) -> None:
    assert refinement_form(message) == form


@pytest.mark.parametrize("message", ["Montpellier", "santé ou industrie", "plus de 200 salariés"])
def test_chaque_forme_de_raffinement_garde_la_carte_account_map(message: str) -> None:
    block = reply_style_block(_history(), message=message)
    assert "RAFFINEMENT" in block
    assert "account_map" in block
    assert "jamais un retour au texte brut" in block


def test_non_une_vraie_question_n_est_pas_un_raffinement() -> None:
    message = "Quel est le chiffre d'affaires de Thales sur les trois dernières années ?"
    assert refinement_form(message) is None
    assert "RAFFINEMENT" not in reply_style_block(_history(), message=message)


def test_non_sans_carte_dans_le_fil_aucun_bloc() -> None:
    assert reply_style_block([{"role": "user", "content": "Montpellier"}], message="Montpellier") == ""


def test_sans_message_le_bloc_d_avant_reste_identique() -> None:
    assert reply_style_block(_history()) == reply_style_block(_history(), message="")
