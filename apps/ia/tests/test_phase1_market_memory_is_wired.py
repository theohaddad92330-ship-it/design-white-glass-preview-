"""#1590 — LE 4ᵉ BLOC ENTRE VRAIMENT DANS LE PROMPT.

─────────────────────────────────────────────────────────────────────────────
LE TROU QUE CE FICHIER BOUCHE
─────────────────────────────────────────────────────────────────────────────
`test_phase1_market_memory_block.py` verrouille DEUX choses : ce que le bloc
DIT (`_market_memory_block`) et ce que la lecture RAPPORTE
(`_fetch_market_memory_context`). Les deux étaient verts alors que rien ne
prouvait la troisième — que le résultat de la seconde arrive dans le prompt de
la première.

C'est le défaut n°1 de ce dépôt, et il a déjà coûté une route entière, un
accès de rendu, une liste d'exclusion et un chemin d'écriture : **du code
juste que personne n'appelle**. Retirer les trois lignes de `_research` qui
concatènent le bloc laisserait ce fichier-ci rouge, et tout le reste vert.

─────────────────────────────────────────────────────────────────────────────
POURQUOI UNE GARDE DE CÂBLAGE, ET PAS UN TEST D'EXÉCUTION
─────────────────────────────────────────────────────────────────────────────
`_research` orchestre Brave, Pappers, Firecrawl, la désambiguïsation et
plusieurs minutes de collecte : l'exécuter pour vérifier une concaténation
demanderait de simuler une dizaine de fournisseurs, et la simulation
deviendrait le sujet du test. Le dépôt a déjà tranché ce compromis pour la
reprise d'import (`resume-reachable.spec.ts`) : on LIT le chemin.

⚠️ Elle lit du CODE, jamais un commentaire — un docblock qui raconte le défaut
suffirait sinon à la garder verte, espèce de garde borgne déjà rencontrée ici.
Les commentaires sont donc retirés avant toute recherche.
"""

from __future__ import annotations

import inspect
import re

from app.routers import phase1_research


def _corps_de_research() -> str:
    """Le corps de `_research`, SANS ses commentaires."""
    source = inspect.getsource(phase1_research._research)
    sans_commentaires = re.sub(r"(?m)^\s*#.*$", "", source)
    return re.sub(r'"""(?:.|\n)*?"""', "", sans_commentaires)


def test_le_corps_lu_nest_pas_vide() -> None:
    """La garde LIT quelque chose — sans ça, tout ce qui suit est un faux vert."""
    corps = _corps_de_research()
    assert len(corps) > 2000
    # Un témoin : les trois blocs voisins que le retour nommait sont bien là.
    assert "BASE DE CONNAISSANCE" in corps
    assert "_scope_directive" in corps


def test_la_lecture_de_la_memoire_marche_est_appelee() -> None:
    assert "_fetch_market_memory_context(" in _corps_de_research()


def test_le_bloc_est_construit_a_partir_de_cette_lecture() -> None:
    assert "_market_memory_block(" in _corps_de_research()


def test_le_bloc_est_CONCATENE_au_contexte_utilisateur() -> None:
    """Le maillon qui manquait : construit ≠ envoyé.

    On vérifie que le texte du bloc rejoint `user_context_str` — la variable
    qui part au modèle. Construire le bloc et ne pas l'ajouter laisserait les
    deux autres gardes vertes, et le prompt byte-identique à avant le lot.
    """
    corps = _corps_de_research()
    assert re.search(r"user_context_str\s*=\s*f?\"[^\"]*\{user_context_str\}[^\"]*\{_market_memory_text\}", corps)


def test_le_bloc_ne_part_QUE_quand_il_existe() -> None:
    """Best-effort strict : un `None` ne doit jamais devenir un bloc vide.

    Sans cette condition, une entité non résolue ou une panne du pont
    injecterait deux sauts de ligne et rien d'autre — un prompt qui n'est plus
    byte-identique à celui d'avant le lot, pour ne rien dire de plus.
    """
    assert re.search(r"if\s+_market_memory_text\s*:", _corps_de_research())
