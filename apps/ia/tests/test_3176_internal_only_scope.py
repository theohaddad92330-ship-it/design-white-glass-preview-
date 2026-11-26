"""#3176 — KNOWLEDGE SOURCE PLANNER : mode INTERNAL_ONLY.

Le retour bêta décrit un NO-GO précis : « Laura affirme ne rien connaître
parce que l'information n'était pas déjà injectée dans son contexte
immédiat. » Mesuré : quand la personne dit explicitement qu'elle ne veut PAS
une recherche web (« dans ta mémoire », « sans aller sur le web »…), rien ne
distinguait ce tour d'un tour normal — `web_search` restait un choix libre du
modèle, qui pouvait soit l'appeler par réflexe (contredisant la demande) soit
conclure trop vite qu'il ne sait rien (sans avoir essayé les outils internes).

Même remède que #2721 (actualité publique) et #2679 (préparation de message) :
un marqueur À PART (`asks_for_internal_only_scope`), sa propre consigne
(`internal_only_block`). Le witness montre que le marqueur ne se déclenche
pas sur une phrase qui ne demande rien de tel.
"""

from __future__ import annotations

import pytest

from app.prompts.intent_route import internal_only_block
from app.services.compilers.intent_router import asks_for_internal_only_scope

MEMORY_PHRASE = "Je ne te demande pas une source publique, je te demande ce que tu sais en mémoire."


@pytest.mark.parametrize(
    "message",
    [
        MEMORY_PHRASE,
        "Qu'est-ce que Bellum connaît déjà sur ce compte ?",
        "Cherche dans nos données, sans aller sur le web",
        "Reste dans mon CRM pour cette recherche",
        "What do we already know about this account, without a web search?",
        "Stay in our data, don't go on the web",
    ],
)
def test_3176_une_demande_de_perimetre_interne_est_reconnue(message: str) -> None:
    assert asks_for_internal_only_scope(message)


def test_3176_le_temoin_ne_declenche_rien() -> None:
    assert asks_for_internal_only_scope("Quelles sont les dernières levées de fonds ?") is None
    assert asks_for_internal_only_scope("Bonjour") is None


@pytest.mark.parametrize("language", ["fr", "en"])
def test_3176_le_bloc_interdit_la_recherche_web_et_pointe_les_outils_internes(language: str) -> None:
    block = internal_only_block(MEMORY_PHRASE, language)
    assert block
    assert "`web_search`" in block
    assert "`search_market_memory`" in block
    assert "`find_accounts`" in block
    if language == "fr":
        assert "n'existe pas" not in block  # jamais un aveu par défaut
    else:
        assert "does not exist" not in block


def test_3176_le_bloc_est_vide_sans_marqueur() -> None:
    assert internal_only_block("Bonjour", "fr") == ""
