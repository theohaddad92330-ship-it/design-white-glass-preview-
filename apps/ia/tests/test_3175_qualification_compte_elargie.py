"""#3175 — COMMERCIAL INTENT RESOLVER.

Le retour bêta décrit un NO-GO précis : « Laura répond correctement à la
phrase mais n'aide pas l'utilisateur à décider quoi faire. » Exemple du
ticket : « SG travaille avec des consultants ? » a une réponse littérale
(une preuve publique de recours au conseil), mais la décision commerciale
sous-jacente porte sur bien plus — adéquation avec l'activité de l'ESN,
références bancaires existantes, relations déjà présentes dans le workspace,
anciens consultants passés par ce groupe, partenaires ou ESN référencées,
barrières achats, entités plus accessibles, coût d'opportunité.

Construire l'objet ``CommercialIntent`` complet à treize champs, câblé sur le
routeur, les outils, le vérificateur final ET la télémétrie, est un système
de plusieurs jours (hors lot, épopée #3175). La tranche livrée ici est la
plus petite qui ferme le NO-GO mesurable sur la RECETTE du ticket : une
question de QUALIFICATION D'UN COMPTE NOMMÉ (« X prend des consultants ? »,
« je peux ouvrir X ? », « tu penses quoi de X ? ») reçoit la liste des
dimensions à vérifier avant de répondre, au lieu de s'arrêter à la question
littérale.

Même remède que #2721 / #2679 / #2434.51 / #3176 : un marqueur À PART, sa
propre consigne.
"""

from __future__ import annotations

import pytest

from app.prompts.intent_route import account_qualification_widening_block
from app.services.compilers.intent_router import asks_to_qualify_a_named_account

RECETTE_PHRASES = [
    "Est-ce que BNP prend des freelances ?",
    "Est-ce que je peux ouvrir Airbus ?",
    "Où sont passés les consultants chez SG ?",
    "Tu penses quoi de Carrefour ?",
    "Does Airbus work with consultants?",
    "Can I open Airbus as an account?",
    "What do you think of Carrefour?",
    # #3513 (recette prod 02/10) — la question de recette : sans marqueur, Laura
    # répondait sans appeler `get_account_suitability_verdict` (ni verdict ni carte).
    "Faut-il aller chez LVMH ?",
    "Faut il aller chez LVMH ?",
    "Quel est ton verdict d'adéquation sur le compte LVMH ?",
    "Est-ce que je dois prospecter LVMH ?",
    "Should I go after LVMH?",
    "Is LVMH worth going after?",
]


@pytest.mark.parametrize("message", RECETTE_PHRASES)
def test_3175_une_question_de_qualification_litterale_est_reconnue(message: str) -> None:
    assert asks_to_qualify_a_named_account(message)


def test_3175_le_temoin_ne_declenche_rien() -> None:
    # Une demande de DÉCOUVERTE (pas de compte nommé) ne porte pas ce marqueur.
    assert asks_to_qualify_a_named_account("Tu connais des boîtes cyber ?") is None
    assert asks_to_qualify_a_named_account("Bonjour") is None


@pytest.mark.parametrize("language", ["fr", "en"])
def test_3175_le_bloc_liste_les_dimensions_sous_jacentes(language: str) -> None:
    block = account_qualification_widening_block("Est-ce que SG travaille avec des consultants ?", language)
    assert block
    if language == "fr":
        for dimension in (
            "activité",
            "références bancaires",
            "relations",
            "workspace",
            "anciens consultants",
            "partenaires",
            "barrières achats",
            "entités plus accessibles",
            "coût d'opportunité",
        ):
            assert dimension in block, dimension
        # Doctrine : aucune probabilité affichée (chance de closing).
        assert "%" not in block
        assert "probabilit" not in block.lower()
    else:
        for dimension in (
            "activity",
            "existing bank references",
            "workspace",
            "past consultants",
            "partners",
            "procurement barriers",
            "more accessible entities",
            "opportunity cost",
        ):
            assert dimension in block, dimension


def test_3175_le_bloc_est_vide_sans_marqueur() -> None:
    assert account_qualification_widening_block("Bonjour", "fr") == ""


@pytest.mark.parametrize("language", ["fr", "en"])
def test_185_13_le_bloc_force_la_consultation_du_verdict_avant_de_proposer_une_cible(language: str) -> None:
    """#3242 (#185.13) — le NO-GO du retour #3179 : « Laura transforme
    systématiquement toute entreprise demandée en cible à prospecter ».
    `get_account_suitability_verdict` (#3179, livré sur la branche sœur
    feat/lau-185-186-28-09, fusionnée comme socle de ce lot) existe
    maintenant comme outil ; la tranche la plus petite et prouvable qui ferme
    ce NO-GO pour le point d'entrée du ticket lui-même (« je peux ouvrir
    Airbus ? », « tu penses quoi de Carrefour ? ») est de le nommer,
    explicitement, dans la consigne qui accompagne déjà toute qualification
    littérale d'un compte nommé — plutôt que de laisser Laura répondre à la
    question posée et enchaîner sur une proposition de prospection sans
    l'avoir consulté.
    """
    block = account_qualification_widening_block("Est-ce que SG travaille avec des consultants ?", language)
    assert "get_account_suitability_verdict" in block
    if language == "fr":
        # Le NOT_EVALUABLE (compte sans analyse) ne se transforme jamais
        # silencieusement en feu vert — doctrine « non mesuré ≠ 0 ».
        assert "NOT_EVALUABLE" in block
        assert "avant" in block.lower()
        assert "%" not in block
        assert "probabilit" not in block.lower()
    else:
        assert "NOT_EVALUABLE" in block
        assert "before" in block.lower()
