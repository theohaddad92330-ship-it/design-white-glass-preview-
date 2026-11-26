"""La profondeur de collecte est une CONSTANTE (recette finale §54, arbitrage Louis 02/08).

Ce fichier testait un réglage d'environnement et ses garde-fous. Le réglage
n'existe plus, et c'est précisément le sujet : une bride posée un jour pour une
raison ponctuelle survit au redéploiement et devient invisible.
``FIRECRAWL_MAX_PAGES=3`` traînait en production, la page équipe / gouvernance
d'un site n'était donc plus jamais lue, l'organigramme perdait sa confirmation
« site officiel », et rien nulle part ne le disait — pas même le WARNING ajouté
pour ça, parce que personne ne lit les logs d'un run qui réussit.

Les tests qui vérifiaient le parsing de la variable ont disparu avec elle. Ceux
qui restent vérifient la seule chose qui compte désormais : que la profondeur ne
dépende plus de l'environnement.
"""

import os

from app.services.research.firecrawl import MAX_PAGES_PER_RUN, _resolve_max_pages


def test_douze_pages_par_run():
    # Trois vagues de cinq à 25 s = 75 s au pire, dans un budget de phase de
    # 180 s. La valeur tient sans garde-fou — c'est ce qui permet de la figer.
    assert MAX_PAGES_PER_RUN == 12
    assert _resolve_max_pages() == 12


def test_aucune_variable_denvironnement_ne_peut_plus_brider_la_collecte(monkeypatch):
    # LE test de ce fichier. Un produit dont la profondeur de collecte dépend
    # d'une variable que personne ne relit n'a pas de profondeur de collecte :
    # il a une loterie. On vérifie donc explicitement que la valeur qui traînait
    # en production n'a plus aucun effet.
    monkeypatch.setenv("FIRECRAWL_MAX_PAGES", "3")
    assert _resolve_max_pages() == 12

    monkeypatch.setenv("FIRECRAWL_MAX_PAGES", "0")
    assert _resolve_max_pages() == 12

    monkeypatch.setenv("FIRECRAWL_MAX_PAGES", "n'importe quoi")
    assert _resolve_max_pages() == 12


def test_la_constante_est_utilisable_sans_environnement(monkeypatch):
    monkeypatch.delenv("FIRECRAWL_MAX_PAGES", raising=False)
    assert _resolve_max_pages() == MAX_PAGES_PER_RUN
    assert "FIRECRAWL_MAX_PAGES" not in os.environ
