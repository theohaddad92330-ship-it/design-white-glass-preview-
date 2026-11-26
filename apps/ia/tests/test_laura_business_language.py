"""#3346.2, .4, .6, .7 (LAU-FINAL-256, retour bêta 29/09) — le langage métier.

#3346.1, .3, .5 (« catalogue interne », « workspace account », « mémoire
disponible ») sont prouvés dans ``test_forbidden_phrasings.py`` (les trois
nouveaux ``Ban`` — pas ici, pour ne pas dupliquer l'oracle). Ce fichier
prouve le reste : les trois termes qui restent légitimes UNIQUEMENT
accompagnés (« ton espace », « matching », « mémoire marché », « source
interne ») et le comportement attendu sur « ça veut dire quoi ? ».

⚠️ CE QUE CE TEST PROUVE, ET CE QU'IL NE PROUVE PAS : comme
``test_copilote_error_posture.py``, il tient la RÈGLE écrite là où le modèle
la lit — le prompt système — pas que le modèle l'applique.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.laura_business_language import BLOCK_BUSINESS_LANGUAGE

BARE = build_system_prompt({}, {}, "", "")


def test_the_block_reaches_the_bare_prompt():
    assert BLOCK_BUSINESS_LANGUAGE in BARE


def test_3346_2_ton_espace_stays_legitimate_only_when_precised():
    assert "tes comptes, besoins, consultants et actions enregistrés dans Bellum" in BLOCK_BUSINESS_LANGUAGE


def test_3346_4_matching_is_explained_in_business_terms():
    assert "étape de rapprochement avec des consultants" in BLOCK_BUSINESS_LANGUAGE


def test_3346_5_market_memory_is_named_by_its_nature_never_by_its_product_name():
    # #4074.1 (12/10) revient sur #3346.5 : « mémoire marché » ne se dit plus du tout ;
    # le fait se nomme par sa nature.
    assert "« mémoire marché » ne se dit JAMAIS" in BLOCK_BUSINESS_LANGUAGE
    assert "besoin observé sur le marché" in BLOCK_BUSINESS_LANGUAGE


def test_3346_6_internal_source_is_never_left_bare():
    assert "e-mail, d'un CRM, d'un import, d'une note ou d'un objet créé dans Bellum" in BLOCK_BUSINESS_LANGUAGE


def test_3346_7_asking_what_it_means_gets_one_plain_business_sentence():
    assert "ça veut dire quoi" in BLOCK_BUSINESS_LANGUAGE
    assert "UNE phrase simple" in BLOCK_BUSINESS_LANGUAGE
    assert "jamais avec un nouveau mot technique" in BLOCK_BUSINESS_LANGUAGE
