"""#2679 (famille) — RELANCER UN CONTACT écrit sa précision de CANAL en texte.

Recette prod du 23/09/2026 (sha servi 4a4e9e07d), sur `/chat`, SANS compte
actif : « Prépare-moi un message pour relancer » — Laura pose bien une
précision (trois options : e-mail, LinkedIn, téléphone) mais l'écrit en
MARKDOWN (`<p><span>`), aucun `<button>`.

Cause mesurée, même famille que #2679 / #2721 : aucune des dix intentions du
routeur (`CHAT_INTENT_ROUTING_TABLE`) ne nomme la RELANCE d'un contact — la
demande reste `non_declaree`, `intent_route_block` rend `""`, et rien ne
pointe le modèle vers `offer_reply_options` au moment précis où il choisit le
canal. Même correctif que #2721 (actualité publique) : un marqueur
DÉTERMINISTE séparé de la table des dix intentions, sa propre consigne
VOLATILE, posée dans le même segment que `public_news_block`. Renforcé en
plus dans la description de l'outil `prepare_message_for_contact` — la
description pèse au moment précis où le modèle regarde SON outil, un
paragraphe de prompt général ne suffit pas toujours (mesuré ici deux fois de
suite sur la même famille de précision).

Chaque test sait dire NON : un témoin voisin (message sans relance) ne
déclenche rien.
"""

from __future__ import annotations

import pytest

from app.prompts.intent_route import message_prep_block
from app.services.chat_tools import PREPARE_MESSAGE_TOOL, REPLY_OPTIONS_TOOL_NAME
from app.services.compilers.intent_router import asks_to_prepare_a_message

RELANCE_PHRASE = "Prépare-moi un message pour relancer"


@pytest.mark.parametrize(
    "message",
    [RELANCE_PHRASE, "il faut que je relance ce contact", "Can you write a follow-up message?"],
)
def test_2679_une_demande_de_relance_est_reconnue(message: str) -> None:
    assert asks_to_prepare_a_message(message)


@pytest.mark.parametrize(
    "message",
    ["Bonjour", "Quelles sont mes dernières actions ?", "Trouve-moi des comptes intéressants"],
)
def test_2679_le_temoin_une_demande_sans_relance_ne_declenche_rien(message: str) -> None:
    assert asks_to_prepare_a_message(message) is None
    assert message_prep_block(message, "fr") == ""


@pytest.mark.parametrize("language", ["fr", "en"])
def test_2679_le_bloc_de_relance_nomme_offer_reply_options(language: str) -> None:
    block = message_prep_block(RELANCE_PHRASE, language)
    assert f"`{REPLY_OPTIONS_TOOL_NAME}`" in block
    assert ("cliqu" in block) if language == "fr" else ("click" in block)


def test_2679_loutil_de_message_rappelle_la_precision_cliquable() -> None:
    """La description de l'outil pèse au moment où le modèle la regarde, en
    plus du paragraphe de prompt général (`_BLOCK_TOOLS`) qui, mesuré deux
    fois en recette prod, n'a pas suffi seul sur cette famille."""
    assert f"`{REPLY_OPTIONS_TOOL_NAME}`" in PREPARE_MESSAGE_TOOL["description"]
