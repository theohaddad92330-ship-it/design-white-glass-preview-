"""#3347.1, .2, .5 (LAU-FINAL-257, retour bêta 29/09) — Laura organise seule
le travail sur une demande large, dès le premier tour.

#3347.3, .4 (ne jamais renvoyer vers un site externe ou un filtre manuel
faute d'outil) restent hors de ce fichier : déjà couverts par #3189.4 (FAIS
LE TRAVAIL, NE L'ENSEIGNE PAS, ``_BLOCK_TOOLS``) et
``COPILOT_MANUAL_REDIRECT_PHRASINGS`` — un second bannissement dupliquerait
l'oracle de ``test_forbidden_phrasings.py``.

⚠️ CE QUE CE TEST PROUVE, ET CE QU'IL NE PROUVE PAS : il tient la RÈGLE
écrite là où le modèle la lit — le prompt système — pas que le modèle
l'applique en conversation réelle (ça reste l'éval en ligne).
"""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_SPONTANEOUS_ORCHESTRATION as BLOCK
from app.prompts.bellum_advisor import build_system_prompt

BARE = build_system_prompt({}, {}, "", "")


def test_the_block_reaches_the_bare_prompt():
    assert BLOCK in BARE


def test_3347_1_laura_organises_the_axes_herself_on_the_first_turn():
    assert "dès le premier tour, tu organises TOI-MÊME le travail" in BLOCK
    for axis in (
        "besoins déjà connus et VÉRIFIÉS",
        "signaux en cours",
        "comptes compatibles nouveaux ou à réactiver",
        "partenaires ou rang 2",
        "observation du marché",
        "relations existantes",
        "rôles à contacter",
    ):
        assert axis in BLOCK


def test_3347_2_never_waits_to_be_told_each_source():
    assert "ne se traite jamais en attendant que la personne te dicte chaque source une par une" in BLOCK


def test_3347_5_caps_blocking_questions_at_two_and_presents_a_strategy():
    assert "Tu présentes une STRATÉGIE, jamais seulement un résultat brut" in BLOCK
    assert "AU MAXIMUM deux questions bloquantes" in BLOCK


# #3347.10/.11/.12 (recette prod 30/09, PARTIEL) — Louis a observé Laura
# organiser seule QUATRE axes (besoins vérifiés, signaux, comptes
# compatibles, partenaires) mais PAS les trois autres nommés par le même
# bloc : relance des comptes à réactiver, rang 2, mémoire marché. Les trois
# outils existent (`search_dormant_network`, `get_esn_on_account`,
# `search_market_memory`) mais le bloc les nommait sans dire QUEL outil ni
# QUAND — `get_esn_on_account` veut un compte déjà identifié,
# `search_market_memory` refuse une recherche sans filtre. Ambigu, un axe se
# lit comme optionnel plutôt que comme un outil précis à appeler.
def test_3347_10_reactivation_names_its_tool():
    assert "comptes compatibles nouveaux ou à réactiver" in BLOCK
    assert "`list_accounts_to_act`" in BLOCK
    assert "`search_dormant_network`" in BLOCK


def test_3347_11_rank2_names_its_tool_and_sequencing():
    assert "partenaires ou rang 2" in BLOCK
    assert "`search_partners`" in BLOCK
    assert "`get_esn_on_account`" in BLOCK
    assert "UNE FOIS un compte identifié" in BLOCK


def test_3347_12_market_memory_names_its_tool_and_the_mandatory_filter():
    assert "observation du marché" in BLOCK
    assert "`search_market_memory`" in BLOCK
    assert "jamais un filtre inventé" in BLOCK
