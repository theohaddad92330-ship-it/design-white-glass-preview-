"""Corpus terrain #2796 — les 11 demandes de #1948 qui exigeaient un CORPUS
RÉEL (604 réponses terrain, 100 sujets P1, 50 P2, 60 requêtes utilisateur,
25 triggers, formulations verbatim, parcours Laura, protocole de recette
bêta) plutôt qu'un chiffre recopié sans son contenu.

Chaque fichier ``*_2026.json`` de ce paquet est un EXTRAIT anonymisé d'une des
deux sources suivantes (lues par chemin absolu, hors dépôt, gitignorées) :

- ``BellumAI_Meta_Analyse_Besoins_Utilisateurs_2026.pdf`` (30 p. — personas,
  parcours multi-outils, bibliothèque de requêtes)
- ``BellumAI_Meta_Analyse_Besoins_Workflows_Requetes.pdf`` (25 p. — audit
  terrain 58 répondants, 100+50 besoins priorisés, 60+30 requêtes, 25
  triggers, protocole de recette PASS/FAIL)

Voir ``loader.py`` pour les accesseurs typés et ``apps/ia/tests/
test_terrain_corpus_2796.py`` pour ce qui les consomme. #1948.6 (usages
Market Memory) N'A PAS de fichier ici : ce catalogue ne vit dans AUCUNE des
deux sources lues pour #2796 — l'écrire à partir d'un comptage serait la
donnée fictive que CLAUDE.md interdit.
"""
