"""#2434.51 — recette prod du 25/09/2026, écran `/chat` : « Lis-moi tout mon
pipeline » faisait rendre à Laura tout le texte agrégé (18 projets / 5 étapes)
sans jamais proposer d'afficher le détail à l'écran — un problème surtout en
mode vocal, où ce texte est ensuite lu intégralement à voix haute.

Même famille que #2679 / #2721 / #2679(relance) : aucune des dix intentions du
routeur ne nomme une demande de LECTURE INTÉGRALE — `intent_route_block` rend
`""` et rien ne pointe le modèle vers un résumé court. Même correctif : un
marqueur DÉTERMINISTE séparé de la table des dix intentions, sa propre
consigne VOLATILE, posée dans le même segment que `public_news_block` /
`message_prep_block`.

Chaque test sait dire NON : un témoin voisin (message sans demande de lecture
intégrale) ne déclenche rien, prompt byte-identique à celui d'avant ce lot.
"""

from __future__ import annotations

import pytest

from app.prompts.intent_route import long_read_block
from app.services.compilers.intent_router import asks_for_a_long_read

PIPELINE_PHRASE = "Lis-moi tout mon pipeline"


@pytest.mark.parametrize(
    "message",
    [
        PIPELINE_PHRASE,
        "lis moi tout mon pipeline",
        "raconte-moi tout sur ma journée de demain",
        "dis-moi tout ce qu'il y a dans mon portefeuille",
        "Can you read me everything in my pipeline?",
        "read it all to me",
    ],
)
def test_2434_51_une_demande_de_lecture_integrale_est_reconnue(message: str) -> None:
    assert asks_for_a_long_read(message)


@pytest.mark.parametrize(
    "message",
    ["Bonjour", "Où en est mon pipe ?", "Lis-moi la fiche de ce contact", "Trouve-moi des comptes intéressants"],
)
def test_2434_51_le_temoin_une_demande_courte_ne_declenche_rien(message: str) -> None:
    assert asks_for_a_long_read(message) is None
    assert long_read_block(message, "fr") == ""


@pytest.mark.parametrize("language", ["fr", "en"])
def test_2434_51_le_bloc_demande_un_resume_court_et_le_detail_a_lecran(language: str) -> None:
    block = long_read_block(PIPELINE_PHRASE, language)
    assert block != ""
    if language == "fr":
        assert "deux" in block.lower() or "2" in block
        assert "détail" in block.lower()
    else:
        assert "two" in block.lower() or "2" in block
        assert "detail" in block.lower()


def test_2434_51_vide_sans_marqueur_prompt_byte_identique() -> None:
    assert long_read_block("Où en est mon pipe ?", "fr") == ""
    assert long_read_block("Où en est mon pipe ?", "en") == ""
