"""LAU-FINAL-253 (#3343) — recherche de second passage automatique.

Laura a expliqué que la mémoire marché n'avait trouvé aucune piste avec les
filtres Data, rôle Data et Paris/Lille, et s'est arrêtée après ce constat.

`THREAD_CONTINUITY_BLOCK` porte déjà, depuis #3183 (LAU-FINAL-189), la règle
GÉNÉRALE « approfondir au lieu de répéter ou d'abandonner » — mais ses neuf
déclencheurs (`test_lau_final_189_second_pass.py::
test_names_the_nine_triggers_from_the_issue`) ne nomment pas explicitement le
cas RIEN TROUVÉ, ni les exemples concrets d'élargissement de cette issue, ni
le comportement si le second passage échoue aussi. Ce fichier verrouille ce
qui est NEUF dans #3343, sans toucher à la règle générale déjà livrée."""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.thread_state import THREAD_CONTINUITY_BLOCK


def test_zero_results_never_ends_the_work():
    """#3343.1 — un premier passage sans résultat appelle immédiatement un second passage."""
    assert "UNE RECHERCHE SANS AUCUN RÉSULTAT NE MET JAMAIS FIN AU TRAVAIL" in THREAD_CONTINUITY_BLOCK


def test_names_concrete_widening_examples():
    """#3343.2 — les exemples concrets d'élargissement de l'issue, nommés."""
    for example in (
        "une ville vers sa région",
        "un intitulé vers ses intitulés voisins",
        "le lieu du siège vers le lieu de mission",
        "un rôle nommé vers un programme qui le contient",
        "des comptes ou partenaires implantés sur la zone",
        "des équipes ayant historiquement eu recours à des externes",
        "une compatibilité historique confrontée à un signal actuel",
        "des besoins proches encore à qualifier",
    ):
        assert example in THREAD_CONTINUITY_BLOCK, f"exemple d'élargissement absent : {example!r}"


def test_never_silently_drops_a_strong_constraint_and_explains_the_widening():
    """#3343.3 — les contraintes fortes ne se suppriment jamais silencieusement, et le geste est expliqué."""
    assert "tu ne supprimes JAMAIS silencieusement une contrainte forte" in THREAD_CONTINUITY_BLOCK
    assert "dis ce que tu élargis et pourquoi" in THREAD_CONTINUITY_BLOCK
    assert "Le premier passage strict Paris/Lille + Data Manager n'a rien donné" in THREAD_CONTINUITY_BLOCK


def test_names_what_to_say_when_the_second_pass_also_fails():
    """#3343.4 — si le second passage échoue aussi, dire ce qui a été cherché et proposer une autre stratégie."""
    assert "Si ce second passage échoue aussi" in THREAD_CONTINUITY_BLOCK
    assert "dis ce qui a été cherché, ce qui n'a rien produit" in THREAD_CONTINUITY_BLOCK
    assert "quelle autre stratégie tu préfères" in THREAD_CONTINUITY_BLOCK


def test_names_the_four_forbidden_reflexes():
    """#3343.5 — les quatre réflexes à ne plus appliquer."""
    assert "jamais une répétition de la même recherche" in THREAD_CONTINUITY_BLOCK
    assert "jamais une déclaration implicite qu'aucun marché n'existe" in THREAD_CONTINUITY_BLOCK
    assert "tu n'attends jamais que l'utilisateur invente lui-même de nouveaux filtres" in THREAD_CONTINUITY_BLOCK


def test_ga259_coverage_word_still_avoided():
    """Garde GA-259 (c65_couverture_nest_pas_un_fait_de_marche) : ce bloc ne
    parle jamais d'un TAUX DE COUVERTURE de marché — déjà vérifié par #3183,
    reconfirmé après l'ajout de #3343 pour ne pas régresser en silence."""
    assert "couvertur" not in THREAD_CONTINUITY_BLOCK.lower()


def test_the_rule_reaches_the_real_system_prompt():
    """Une règle qui n'atteint jamais `build_system_prompt` n'est pas livrée."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "UNE RECHERCHE SANS AUCUN RÉSULTAT NE MET JAMAIS FIN AU TRAVAIL" in prompt
