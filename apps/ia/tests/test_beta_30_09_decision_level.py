"""Retour bêta 30/09 (#3429, #3430, #3436) — décision visée avant niveau de
contact.

Trois retours, un seul défaut : #3429 « qui est le décideur » répondait par un
nom unique sans dire QUELLE décision ; #3430 « écris au CTO » partait
directement sur le niveau le plus haut ; #3436 nomme trois des mêmes réflexes
dans sa liste d'INTERDITS (« voici les meilleurs décideurs », « je vous
recommande de contacter le DSI », « ce contact est votre champion »). Portée
par `_BLOCK_DECISION_LEVEL` dans `build_system_prompt`."""

from __future__ import annotations

from app.prompts.bellum_advisor import (
    _BLOCK_DECISION_LEVEL,
    build_system_prompt,
)


def test_names_the_three_distinct_decisions():
    """#3429.1 — une même situation porte plusieurs décisions distinctes."""
    block = _BLOCK_DECISION_LEVEL
    assert "PLUSIEURS décisions distinctes" in block
    for decision in (
        "valider techniquement le recours à un profil",
        "porter le budget",
        "autoriser le fournisseur ou le contrat",
    ):
        assert decision in block, f"décision absente : {decision!r}"


def test_never_names_a_single_decider_without_the_decision_and_confidence():
    """#3436.1 — « voici les meilleurs décideurs » sans décision ni confiance : interdit."""
    block = _BLOCK_DECISION_LEVEL
    assert "« le décideur est X »" in block
    assert "« voici les meilleurs décideurs »" in block
    assert "sans nommer LA décision visée et ta confiance" in block


def test_hierarchy_alone_is_not_a_reason_to_contact_the_dsi_or_cto():
    """#3430.1 / #3436.4 — niveau hiérarchique insuffisant, jamais le DSI/CTO par défaut."""
    block = _BLOCK_DECISION_LEVEL
    assert "NIVEAU HIÉRARCHIQUE INSUFFISANT" in block
    # #3670.4 (décision Louis 05/10) : plus d'interdiction absolue — un dirigeant
    # n'est recommandé que si la méthode ou le contexte le justifie.
    assert "tu ne recommandes JAMAIS de contacter le DSI ou le CTO par défaut" not in block
    assert "pas de dirigeant par défaut" in block
    assert "la méthode ou le contexte le justifie" in block
    assert "ROUTE SPONSOR" in block


def test_an_orientation_question_without_a_title_still_triggers_the_block():
    """#3670.2 (recette prod 08/10) — « Chez Accor, je commence par qui côté
    data ? » ne nomme AUCUN titre élevé : le déclencheur doit couvrir cette
    formulation, pas seulement « qui décide » ou un titre nommé (#3429/#3430)."""
    block = _BLOCK_DECISION_LEVEL
    assert "par qui je commence" in block
    assert "qui j'approche en premier" in block
    assert "je commence par qui côté <fonction>" in block


def test_an_orientation_question_always_names_both_routes():
    """#3670.2 — même sans titre nommé, la réponse doit porter le rôle
    opérationnel ET la route sponsor, EN PARALLÈLE — jamais le rôle seul."""
    block = _BLOCK_DECISION_LEVEL
    assert "« PAR QUI JE COMMENCE » APPELLE TOUJOURS LES DEUX ROUTES" in block
    assert "le rôle opérationnel le plus proche du problème (PREMIER CONTACT) ET le niveau élevé tenu en ROUTE SPONSOR, EN PARALLÈLE" in block
    assert "l'absence de titre dans la question n'excuse pas l'absence de la route sponsor dans la réponse" in block
    assert "répondre à une demande de PREMIER CONTACT par le seul rôle opérationnel sans nommer la route sponsor en parallèle" in block


def test_a_title_or_past_role_never_proves_an_internal_champion():
    """#3436.3 — « ce contact est votre champion » sans preuve : interdit."""
    block = _BLOCK_DECISION_LEVEL
    assert "« ce contact est votre champion »" in block
    assert "UN TITRE OU UN ANCIEN PARCOURS NE PROUVE PAS UN ENGAGEMENT INTERNE" in block
    assert "champion probable" in block


def test_names_the_five_forbidden_reflexes():
    """#3436 + #3430 (recette prod 26755bbac3, lot C1, 30/09) — les cinq réflexes interdits."""
    block = _BLOCK_DECISION_LEVEL
    for reflex in (
        "nommer un décideur unique sans préciser la décision visée",
        "recommander le CTO ou le DSI comme premier contact par seul réflexe hiérarchique",
        "demander « quel CTO » ou « quel DSI » avant d'avoir proposé le rôle applicatif",
        "écrire un message au niveau élevé sans d'abord proposer l'approche du rôle le plus proche du problème documenté",
        "affirmer qu'un contact est « votre champion » sans preuve d'un engagement interne récent",
    ):
        assert reflex in block, f"réflexe absent : {reflex!r}"


def test_a_request_that_already_names_the_title_gets_the_same_substitution_immediately():
    """#3430 (recette prod 26755bbac3, lot C1, 30/09) — « écris au CTO » ne fait jamais
    demander LEQUEL avant de proposer le rôle applicatif, même sur un compte multi-entités."""
    block = _BLOCK_DECISION_LEVEL
    assert "« ÉCRIS AU CTO » NE T'ENVOIE PAS CHERCHER LEQUEL" in block
    assert "tu ne demandes JAMAIS « quel CTO ? » ou « lequel des DSI ? »" in block
    assert "l'ambiguïté du NOM ne fait pas exception à la règle du NIVEAU" in block


def test_the_rule_reaches_the_real_system_prompt():
    """Une règle qui n'atteint jamais `build_system_prompt` n'est pas livrée."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "DÉCISION VISÉE AVANT NIVEAU DE CONTACT" in prompt
