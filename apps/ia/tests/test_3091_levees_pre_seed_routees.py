"""#3091 — « startups ayant levé en pre-seed/seed ces 3 derniers mois » ne
routait vers AUCUN outil : `PUBLIC_NEWS_MARKERS` ne reconnaissait que « levée
de fonds »/« tour de table »/« fundraising », jamais le STADE seul
(pre-seed, seed, amorçage). Laura répondait donc de mémoire, sans
`web_search`, sans source — exactement le défaut déjà mesuré et corrigé pour
« levées de fonds » par #2721/#2678, mais pas pour cette formulation.

Le witness (`asks_for_public_news(message) is None`) montre que le marqueur
ne se déclenche pas sur un mot voisin sans rapport.
"""

from __future__ import annotations

import pytest

from app.prompts.intent_route import public_news_block
from app.services.compilers.intent_router import asks_for_public_news

FUNDING_STAGE_PHRASE = "Startups ayant levé en pre-seed/seed ces 3 derniers mois"


@pytest.mark.parametrize(
    "message",
    [
        FUNDING_STAGE_PHRASE,
        "Quelles startups ont fait un pre-seed récemment ?",
        "Which startups just closed a seed round?",
        "des startups en amorçage en ce moment",
    ],
)
def test_3091_une_question_sur_le_stade_de_levee_est_reconnue(message: str) -> None:
    assert asks_for_public_news(message)


def test_3091_le_temoin_ne_declenche_rien() -> None:
    # « semer le doute » ne parle d'aucun stade de levée.
    assert asks_for_public_news("On sème le doute chez le client") is None
    assert asks_for_public_news("Bonjour") is None


@pytest.mark.parametrize("language", ["fr", "en"])
def test_3091_le_bloc_demande_stade_montant_et_date(language: str) -> None:
    block = public_news_block(FUNDING_STAGE_PHRASE, language)
    assert "`web_search`" in block
    if language == "fr":
        assert "stade" in block and "montant" in block and "date" in block
    else:
        assert "stage" in block and "amount" in block and "date" in block
