"""#3864.3 (recette prod 09/10) — « Trouve-moi des besoins » (conv e42507b2…) :
Laura a répondu en TEXTE « la recherche des besoins n'a pas abouti : je n'ai
pas pu lire de résultats dans ce tour… » puis a proposé de « reprendre la
recherche sur les expertises Data, IA… Île-de-France et Grand Est » — ni carte
(une ligne/besoin), ni état vide CONFORME (qui nomme ce qui a été cherché et
propose une stratégie de qualification). Un échec de lecture (pont muet,
erreur réseau) n'est pas plus excusable qu'une absence confirmée : les deux
livrent le MÊME état vide — jamais un simple renvoi à plus tard.
"""

from __future__ import annotations

import pytest

from app.prompts.intent_route import need_discovery_block


@pytest.mark.parametrize("language", ["fr", "en"])
def test_3864_3_un_echec_dappel_nest_pas_une_absence_confirmee(language: str) -> None:
    block = need_discovery_block("Trouve-moi des besoins", language)
    assert block
    if language == "fr":
        assert "n'est PAS une absence confirmée" in block
        assert "retente une fois" in block
    else:
        assert "is NOT a confirmed absence" in block
        assert "retry once" in block


@pytest.mark.parametrize("language", ["fr", "en"])
def test_3864_3_un_simple_renvoi_a_plus_tard_est_explicitement_interdit(language: str) -> None:
    block = need_discovery_block("Trouve-moi des besoins", language)
    if language == "fr":
        assert "« reprendre la recherche » sans plus" in block
        assert "nomme ce que tu as RÉELLEMENT cherché" in block
        assert "MÊME stratégie de qualification que pour une absence confirmée" in block
    else:
        assert '"resume the search" with nothing' in block
        assert "name what you ACTUALLY searched" in block
        assert "SAME qualification strategy as for a confirmed absence" in block
