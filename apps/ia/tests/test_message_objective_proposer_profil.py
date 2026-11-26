"""#2371.3 (reste) — un onzième objectif : « proposer un profil ».

La taxonomie (#1926.9-.17, #2374.6) couvrait dix objectifs mais pas celui
nommé par l'épopée persona × stade × objectif (#2371, issue source #086) :
« proposer un profil » — pousser un consultant identifié pour un besoin ou
une opportunité, distinct de #1926.13 (« faire connaître une expertise », qui
ne nomme jamais une personne précise). Rattaché au scénario D de #2386
(« push profil ») : Reverse Market identifie l'opportunité, ce message la
concrétise.

Même discipline que #2374.6 (`suivi_document`) : label + rules + cta côté
Python (`MESSAGE_OBJECTIVES`), code + libellé côté web
(`message-parameters.ts` + `engagement.json`), entrée dans la matrice
(`MESSAGE_MATRIX_OBJECTIVES` + `objectivePremises`) et son miroir JSON — la
garde `test_2123_the_web_form_offers_exactly_the_engine_codes` (déjà présente,
`test_message.py`) et `message-matrix.test.ts` (côté TS) ferment la boucle.
"""

from __future__ import annotations

from app.services.message_brief import MESSAGE_OBJECTIVES, message_brief_block


def test_proposer_profil_a_ses_regles_propres():
    assert "proposer_profil" in MESSAGE_OBJECTIVES
    entry = MESSAGE_OBJECTIVES["proposer_profil"]
    assert entry["label"]
    assert entry["rules"]
    assert entry["cta"]


def test_proposer_profil_interdit_une_disponibilite_ou_competence_non_fournie():
    """Doctrine — jamais de donnée fictive : une disponibilité ou une compétence
    non fournie ne se promet pas, meme dans la CONSIGNE de rédaction."""
    rules = MESSAGE_OBJECTIVES["proposer_profil"]["rules"].lower()
    assert "disponibilit" in rules or "competence" in rules or "compétence" in rules


def test_proposer_profil_atteint_le_prompt_utilisateur():
    """La preuve d'appelant : le cadrage ne vaut que s'il ATTEINT le prompt —
    même discipline que `TestStrategyPromptCarriesTheRevenueModel`."""
    brief = {"objective": "proposer_profil", "relationship": None}
    block = message_brief_block(brief)
    assert MESSAGE_OBJECTIVES["proposer_profil"]["label"] in block
    assert MESSAGE_OBJECTIVES["proposer_profil"]["rules"] in block


def test_proposer_profil_ne_suppose_aucune_relation_prealable():
    """Le scénario D (#2386) part souvent d'un compte NEUF trouvé par Reverse
    Market : l'objectif ne peut pas affirmer qu'une relation existe déjà —
    même discipline que `demande_information`/`recommandation` (prémisse
    `null`), tenue côté contrat par `message-matrix.test.ts`."""
    from app.knowledge.message_matrix import MESSAGE_MATRIX

    assert MESSAGE_MATRIX["objectivePremises"]["proposer_profil"] is None
