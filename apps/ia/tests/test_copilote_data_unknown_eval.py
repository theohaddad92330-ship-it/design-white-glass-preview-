"""#3195 (LAU-FINAL-201) — garde de ``laura_data_unknown.BLOCK_DATA_UNKNOWN``.

Aucun appel au modèle (même raison que les familles voisines, voir
``test_copilote_unknown_request_eval.py``) : chaque assertion vérifie qu'une
RÈGLE ÉCRITE existe dans le prompt ASSEMBLÉ, jamais qu'une réponse précise en
sortirait. Trois preuves, comme toute garde du dépôt :

1. savoir dire NON — ``test_removing_the_block_drops_every_anchor`` ;
2. lire un corpus non vide — ``BARE`` est le VRAI prompt assemblé, pas un
   extrait recopié ;
3. ne pas attraper le voisin — les ancres cherchées sont propres à ce bloc,
   vérifiées ABSENTES de ``HORS_BLOC`` (le prompt privé du bloc).
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.forbidden_phrasings import (
    CANNOT_ANSWER,
    COPILOT_FORBIDDEN_PHRASINGS,
    NO_INFO_AVAILABLE,
    REDIRECT_TO_LINKEDIN,
)
from app.prompts.laura_data_unknown import BLOCK_DATA_UNKNOWN

#: Le prompt « nu » : aucun contexte utilisateur — assemblé par le VRAI
#: gabarit, ce qui fait tomber la garde si le bloc est écrit mais jamais
#: appelé (défaut n°1 du dépôt : du code juste que personne n'appelle).
BARE = build_system_prompt({}, {}, "", "")

#: Le prompt PRIVÉ du bloc de ce lot — seul corpus dans lequel une ancre
#: cherchée doit être ABSENTE, sans quoi la garde attraperait un voisin.
HORS_BLOC = BARE.replace(BLOCK_DATA_UNKNOWN, "")

#: #3195.1 — les sept raisons, dans les mots (pas l'étiquette technique) que
#: le bloc doit porter pour que le modèle les distingue sans les nommer.
_SEVEN_REASONS: tuple[str, ...] = (
    "absente du workspace",
    "hors du périmètre couvert par le référentiel sectoriel Bellum",
    "jamais observée par l'observation du marché",
    "non vérifiée À L'INSTANT",
    "source indisponible",
    "donnée ambiguë",
    "réellement inexistante selon une source FAISANT AUTORITÉ",
)

#: #3195.2 — les cinq gestes, dans l'ordre où l'issue les exige.
_FIVE_GESTES: tuple[str, ...] = (
    "Dis précisément ce qui manque — jamais un « je ne sais pas » vague",
    "Dis ce que tu sais QUAND MÊME",
    "Explique l'impact sur LA décision",
    "Propose le prochain moyen concret",
    "Continue avec une option alternative",
)

#: #3195.4 — les trois niveaux et le NO-GO qui les ferme.
_LEVELS: tuple[str, ...] = (
    "UNKNOWN_BUT_ACTIONABLE",
    "UNKNOWN_AND_BLOCKING",
    "UNKNOWN_BUT_NON_BLOCKING",
    "NO-GO",
)


def test_the_corpus_is_not_empty():
    assert BARE
    assert BLOCK_DATA_UNKNOWN in BARE


def test_the_seven_reasons_are_all_named():
    for reason in _SEVEN_REASONS:
        assert reason in BLOCK_DATA_UNKNOWN, reason


def test_the_five_gestes_are_all_present_in_order():
    positions = [BLOCK_DATA_UNKNOWN.index(geste) for geste in _FIVE_GESTES]
    assert positions == sorted(positions)


def test_the_three_levels_and_the_no_go_are_named():
    for level in _LEVELS:
        assert level in BLOCK_DATA_UNKNOWN, level


def test_forbidden_behaviours_are_written_in_clear_because_no_other_block_renders_them():
    assert "inventes JAMAIS une valeur" in BLOCK_DATA_UNKNOWN
    assert "transformes JAMAIS un « non trouvé » en « non »" in BLOCK_DATA_UNKNOWN


def test_the_three_literal_bans_reuse_the_shared_forbidden_phrasings_module():
    """#3195.3 — un seul endroit qui les cite (GA-26) : ce bloc ne les répète
    pas, elles voyagent déjà par ``COPILOT_FORBIDDEN_PHRASINGS`` (« PAS DE
    MÉTA », ``bellum_advisor.py``)."""
    assert CANNOT_ANSWER == "je ne peux pas répondre"
    assert NO_INFO_AVAILABLE == "aucune information disponible"
    assert REDIRECT_TO_LINKEDIN == "consulte un réseau professionnel"
    for phrase in (CANNOT_ANSWER, NO_INFO_AVAILABLE, REDIRECT_TO_LINKEDIN):
        assert phrase in COPILOT_FORBIDDEN_PHRASINGS
        assert phrase in BARE
        assert phrase not in BLOCK_DATA_UNKNOWN


def test_removing_the_block_drops_every_anchor():
    """Preuve n°1 (savoir dire NON) et n°3 (ne pas attraper le voisin) : sans
    le bloc, aucune de ses ancres ne doit survivre ailleurs dans le prompt.
    ``NO-GO`` est exclu : le terme est réutilisé, générique, par d'autres
    blocs LAU-FINAL (ex. ``laura_unknown_request.py``) — ce n'est pas une
    ancre PROPRE à ce bloc-ci, les trois niveaux nommés le sont déjà."""
    for anchor in (*_SEVEN_REASONS, *_FIVE_GESTES, *_LEVELS):
        if anchor == "NO-GO":
            continue
        assert anchor not in HORS_BLOC, anchor


def test_a_free_read_is_run_by_laura_not_proposed():
    """#3195 (recette prod 29/09, « Zorbatek Consulting ») — « je n'ai pas interrogé de
    source publique » puis rien : une recherche GRATUITE se lance dans le tour ;
    seul un run payant se propose."""
    assert "UNE RECHERCHE GRATUITE SE LANCE, ELLE NE SE PROPOSE PAS" in BARE
    assert "UNE RECHERCHE GRATUITE SE LANCE, ELLE NE SE PROPOSE PAS" not in HORS_BLOC


def test_a_natural_language_analysis_launches_directly_per_c84():
    """#3859 (recette prod 09/10, « trouve-moi 5 décideurs IT chez Lactalis ») — ce bloc
    disait « seule une recherche qui dépense des crédits (analyse d'un compte) se
    propose, sans jamais partir sans accord », qui contredisait la doctrine c84 (une
    analyse demandée en LANGAGE NATUREL part directement, aucune carte à valider).
    Laura s'appuyait sur cette phrase pour PROPOSER une analyse (confirmation) au lieu
    de la lancer elle-même, dans le même tour — exactement le KO observé en recette."""
    assert "sans jamais partir sans accord" not in BLOCK_DATA_UNKNOWN
    assert "langage naturel" in BLOCK_DATA_UNKNOWN
    assert "c84" in BLOCK_DATA_UNKNOWN
