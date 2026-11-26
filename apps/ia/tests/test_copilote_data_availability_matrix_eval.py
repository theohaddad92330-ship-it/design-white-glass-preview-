"""#3396 — LA MATRICE DE COMPORTEMENT SELON LES DONNÉES ET OUTILS DISPONIBLES.

Retour bêta du 30/09/2026 (#3396, recette prod) : dix cas minimaux (aucun
connecteur, profil ESN seul, CRM connecté, e-mail connecté, calendrier
connecté, vivier rempli, missions présentes, mémoire marché disponible,
données contradictoires, outil indisponible ou en erreur) et cinq choses que
Laura doit savoir dire pour chacun (ce qu'elle peut faire maintenant, ce
qu'elle ne peut pas vérifier, ce qu'une connexion améliorerait, ce qui se
prépare sans exécution, ce qui exige une validation) — plus deux doctrines :
une panne ne devient jamais un zéro, une absence de donnée ne devient jamais
une absence de fait.

CE QUE CE FICHIER FAIT, ET CE QU'IL NE FAIT PAS. Chaque brique existait déjà,
chacune pour sa propre raison, éparpillée dans plusieurs modules — cette
garde les réunit en UNE preuve que les dix cas trouvent, dans le prompt
assemblé ou dans le comportement mesuré des fonctions concernées, le
mécanisme qui gouverne le comportement attendu. Elle ne réimplémente rien
qu'une garde existante prouve déjà mieux : les cinq cas gouvernés par un état
RÉEL (CRM, e-mail, calendrier connectés ou non, une lecture qui échoue) sont
déjà couverts, valeur par valeur, par `test_context_transparency.py` et
`test_knowledge_receipt.py` — ce fichier les CITE plutôt que de les répéter.
Il ajoute la preuve manquante : les cinq cas gouvernés par un texte STATIQUE
du prompt (toujours vrai, quel que soit l'état), qu'aucun fichier ne réunissait
encore en un seul endroit lisible comme la matrice du retour.
"""

from __future__ import annotations

import pytest

from app.prompts.bellum_advisor import (
    _BLOCK_CONSULTANT_BENCH_STRATEGY,
    _BLOCK_DURABLE_CONTEXT,
    _BLOCK_MARKET_MEMORY,
    _BLOCK_RENEWAL_RECOMMENDATION,
    _BLOCK_TOOLS,
    build_system_prompt,
)
from app.prompts.laura_data_unknown import BLOCK_DATA_UNKNOWN

BARE = build_system_prompt({}, {}, "", "")


class Case:
    """Un des dix cas minimaux du retour, et le bloc STATIQUE qui le gouverne."""

    def __init__(self, name: str, block: str, fragment: str) -> None:
        self.name = name
        self.block = block
        self.fragment = fragment


# ── Les cinq cas gouvernés par un texte STATIQUE (toujours dans le prompt) ──
STATIC_CASES: tuple[Case, ...] = (
    # AUCUN CONNECTEUR — ce qui reste possible sans lui, ce qu'une connexion
    # ajouterait, continuer sans (jamais un péage), l'intention gardée.
    # ⚠️ Le fragment est le contenu du protocole, pas son intitulé : « CONNECTEUR
    # MANQUANT » est aussi un RENVOI depuis `laura_unknown_request.py` (nature
    # 6), qui survivrait au retrait du bloc et rendrait la garde borgne.
    Case("AUCUN_CONNECTEUR", _BLOCK_TOOLS, "CE QUI RESTE POSSIBLE SANS LUI"),
    # PROFIL ESN SEULEMENT (aucun compte, aucun contact, aucun consultant) —
    # dire ce qu'il faudrait dans l'espace, et le geste qui le comble.
    Case("PROFIL_ESN_SEUL", _BLOCK_DURABLE_CONTEXT, "QUAND IL TE MANQUE DE QUOI AIDER"),
    # VIVIER REMPLI — un consultant disponible change le travail : plan en
    # cinq temps, jamais une simple liste de besoins compatibles.
    # ⚠️ Fragment = le contenu du protocole, pas son intitulé : « STRATÉGIE
    # CONSULTANT SUR LE BENCH » est aussi un RENVOI depuis le bloc de mise en
    # relation (SENS 2), qui survivrait au retrait du bloc (garde borgne).
    Case("VIVIER_REMPLI", _BLOCK_CONSULTANT_BENCH_STRATEGY, "tu construis un plan commercial complet, en cinq temps"),
    # MISSIONS PRÉSENTES — une recommandation de renouvellement ou de
    # repositionnement porte toujours à qui, sur quoi, la preuve.
    Case("MISSIONS_PRESENTES", _BLOCK_RENEWAL_RECOMMENDATION, "RECOMMANDER D'ENGAGER UN RENOUVELLEMENT"),
    # MÉMOIRE MARCHÉ DISPONIBLE — hiérarchie de vérité par provenance : la
    # mémoire marché a son rang, jamais confondue avec un fait du dossier.
    Case("MEMOIRE_MARCHE", _BLOCK_MARKET_MEMORY, "HIÉRARCHIE DE VÉRITÉ SUR UN COMPTE"),
    # DONNÉES CONTRADICTOIRES — raison n°6 des sept raisons d'un manque :
    # plusieurs valeurs candidates se contredisent, aucune ne l'emporte seule.
    Case("DONNEES_CONTRADICTOIRES", BLOCK_DATA_UNKNOWN, "donnée ambiguë"),
    # OUTIL INDISPONIBLE OU EN ERREUR — raison n°5 : la source qui la
    # porterait est en panne, jamais transformée en un « non » ferme.
    Case("OUTIL_INDISPONIBLE", BLOCK_DATA_UNKNOWN, "source indisponible"),
)


@pytest.mark.parametrize("case", STATIC_CASES, ids=[c.name for c in STATIC_CASES])
def test_case_is_governed_by_its_block_in_the_assembled_prompt(case: Case) -> None:
    assert case.fragment in case.block, f"le fragment n'est même plus dans SON propre bloc : {case.name}"
    assert case.fragment in BARE, f"absent du prompt assemblé : {case.name}"


@pytest.mark.parametrize("case", STATIC_CASES, ids=[c.name for c in STATIC_CASES])
def test_case_disappears_without_its_block(case: Case) -> None:
    """Anti-garde-borgne : sans son bloc, le fragment ne doit survivre nulle part ailleurs."""
    degraded = BARE.replace(case.block, "")
    assert case.block not in degraded
    assert case.fragment not in degraded, f"trouvé ailleurs que dans son bloc : {case.name}"


# ── Les cinq comportements que Laura doit savoir dire (#3396) ──────────────
# Quatre sont STATIQUES (toujours dans le prompt) ; le cinquième (« ce qu'elle
# ne peut pas vérifier ») est VOLATIL par construction — `SOURCES NON
# DISPONIBLES` n'apparaît QUE quand `not_consulted` porte une donnée réelle
# (`test_context_transparency.py::test_prompt_surfaces_not_consulted_as_a_guardrail`) :
# un bare prompt sans rien à ne pas consulter n'affiche aucun en-tête fantôme.
_FOUR_STATIC_BEHAVIOURS: tuple[str, ...] = (
    # ce qu'elle peut faire maintenant
    "CE QUI RESTE POSSIBLE SANS LUI",
    # ce qu'une connexion améliorerait
    "CE QUE LA CONNEXION AJOUTERAIT",
    # ce qui se prépare sans exécution (le copilote prépare, ne l'envoie jamais)
    "PRÉVISUALISATION",
    # ce qui exige une validation
    "APPROBATION",
)


def test_the_four_static_behaviours_are_all_named_in_the_assembled_prompt() -> None:
    missing = [b for b in _FOUR_STATIC_BEHAVIOURS if b not in BARE]
    assert not missing, f"comportements absents du prompt assemblé : {missing}"


def test_the_fifth_behaviour_surfaces_only_when_there_is_something_not_consulted() -> None:
    """Ce qu'elle ne peut pas vérifier : rendu depuis une DONNÉE réelle
    (`not_consulted`), jamais un en-tête statique — la même garde que
    `test_context_transparency.py`, revérifiée ici comme cas #3396."""
    assert "SOURCES NON DISPONIBLES" not in BARE
    with_gap = build_system_prompt({}, {}, "", "", "", not_consulted=["Aucun CRM connecté"])
    assert "SOURCES NON DISPONIBLES" in with_gap
    assert "Aucun CRM connecté" in with_gap


# ── Les deux doctrines fermant #3396 ────────────────────────────────────────


def test_a_failure_never_becomes_a_zero() -> None:
    """#3396 — « Une panne ne doit jamais devenir une valeur zéro. »"""
    assert "source indisponible" in BLOCK_DATA_UNKNOWN
    assert "n'inventes JAMAIS une valeur" in BLOCK_DATA_UNKNOWN


def test_missing_data_never_becomes_an_absence_of_fact() -> None:
    """#3396 — « L'absence de donnée ne doit jamais être formulée comme une
    absence de fait. » Miroir exact de la raison n°7 (seule source FAISANT
    AUTORITÉ) contre les six autres : ne pas avoir trouvé n'est pas la preuve
    que ça n'existe pas."""
    assert "transformes JAMAIS un « non trouvé » en « non »" in BLOCK_DATA_UNKNOWN


def test_the_matrix_reads_a_non_empty_prompt() -> None:
    """Une garde qui lirait un prompt vide serait verte pour toujours."""
    assert len(BARE) > 5000
    assert len(STATIC_CASES) == 7
