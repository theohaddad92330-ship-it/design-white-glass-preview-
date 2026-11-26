"""#3176 — KNOWLEDGE SOURCE PLANNER, mode CURRENT_PUBLIC.

Le ticket nomme cinq marqueurs pour CURRENT_PUBLIC : « aujourd'hui », « en ce
moment », « poste actuel », « derniers recrutements », « dernières levées ».

« dernières levées » est déjà couvert par `PUBLIC_NEWS_MARKERS` (#2721/#3091 —
« levee de fonds », « pre-seed »…) : déjà là, pas de doublon. « aujourd'hui »
et « en ce moment » sont écartés : trop génériques (ils attraperaient
« peux-tu m'aider aujourd'hui avec ce compte ? »), même garde que celle déjà
posée sur « mémoire » seul (#3176) ou « contacter » seul (#2679, famille) —
hors lot, dans l'épopée #3176. « poste actuel » et « derniers recrutements »
sont assez spécifiques pour rejoindre `PUBLIC_NEWS_MARKERS` sans faux
positif : un poste ou un recrutement RÉCENT est, comme une levée de fonds,
une actualité publique que Laura ne doit jamais répondre de mémoire.
"""

from __future__ import annotations

import pytest

from app.services.compilers.intent_router import asks_for_public_news


@pytest.mark.parametrize(
    "message",
    [
        "Quel est son poste actuel ?",
        "Quels sont les derniers recrutements chez SG ?",
        "What is their current position?",
        "What are the latest hires at SG?",
    ],
)
def test_3176_une_question_de_fraicheur_recrutement_est_reconnue(message: str) -> None:
    assert asks_for_public_news(message)


def test_3176_le_temoin_ne_declenche_rien() -> None:
    assert asks_for_public_news("Prépare-moi un poste de consultant pour ce besoin") is None
