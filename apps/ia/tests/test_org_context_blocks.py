"""Les sept blocs de contexte de l'organigramme — et le verrou de WORKSPACE_CORRECTIONS.

CE QUE CETTE GARDE PROTÈGE
--------------------------
Deux choses, et la seconde est la raison d'être du fichier :

1. **Le contrat commun des blocs** : vide en entrée ⇒ ``""`` en sortie ⇒ prompt
   inchangé. C'est la discipline de ``feedback_directives_block`` et de
   ``workspace_learning_block`` ; sans elle, un bloc squelette apprend au modèle
   à ignorer les blocs.

2. **Aucun critère protégé n'entre dans ``WORKSPACE_CORRECTIONS``.** Y faire
   entrer des corrections humaines, c'est faire entrer des données de PERSONNES
   dans le prompt qui reconstruit la chaîne de décision — c'est-à-dire dans un
   prompt qui CLASSE des gens (annexe III de l'EU AI Act). Les trois verrous
   (liste blanche de clés, liste blanche de champs, ``strip_protected_criteria``
   en sortie) sont éprouvés ici sur des corrections EMPOISONNÉES.

CE QU'ELLE NE FAIT PAS, PARCE QU'UNE AUTRE LE FAIT MIEUX
--------------------------------------------------------
Elle ne relit pas le prompt réellement envoyé au modèle :
``test_protected_criteria_scoring.py`` exécute la VRAIE phase 3 et le capture.
Ici on teste la porte ; là-bas on teste ce qui sort du bâtiment.
"""

from __future__ import annotations

import json
from typing import Any

from app.prompts import bellum_organigramme
from app.services.org_context_blocks import (
    CORRECTABLE_FIELDS,
    direction_scope_block,
    entity_scope_block,
    existing_graph_summary_block,
    graph_coverage_block,
    project_context_block,
    relation_evidence_block,
    workspace_corrections_block,
)
from app.services.protected_criteria import PROTECTED_CRITERIA

_ALL_BLOCKS = (
    lambda: graph_coverage_block(discovered=None, reaching_model=None, already_classified=None),
    lambda: entity_scope_block(in_scope=None, out_of_scope=None),
    lambda: direction_scope_block(None),
    lambda: project_context_block(None),
    lambda: existing_graph_summary_block(None),
    lambda: workspace_corrections_block(None),
    lambda: relation_evidence_block(None),
)


def _found_in(text: str, criteria: frozenset[str]) -> list[str]:
    return sorted(criterion for criterion in criteria if criterion in text)


# ── Le contrat commun : vide ⇒ "" ⇒ prompt inchangé ────────────────────────


def test_chaque_bloc_vide_rend_une_chaine_vide() -> None:
    """Sept blocs, sept contrats identiques. Un seul qui dérive et le prompt
    porte un squelette qui n'apprend rien et coûte des tokens à chaque appel."""
    for build in _ALL_BLOCKS:
        assert build() == ""


def test_un_prompt_sans_aucun_bloc_dit_non_fourni_partout() -> None:
    """Les garde-fous du prompt système traitent « non fourni » explicitement —
    encore faut-il que ce soit ce qui est écrit."""
    prompt = bellum_organigramme.build_user_prompt(
        company_name="ACME", contacts="[]", entities="[]", angles="[]", pains="[]"
    )
    for name in (
        "GRAPH_COVERAGE",
        "ENTITY_SCOPE",
        "DIRECTION_SCOPE",
        "PROJECT_CONTEXT",
        "EXISTING_GRAPH_SUMMARY",
        "WORKSPACE_CORRECTIONS",
        "RELATION_EVIDENCE",
    ):
        assert f"{name}:" in prompt, f"{name} n'est pas dans le prompt"
    assert "non fourni" in prompt


# ── GRAPH_COVERAGE : « non mesuré » n'est jamais « 0 » ──────────────────────


def test_une_population_non_mesuree_se_dit_non_mesuree_jamais_zero() -> None:
    block = graph_coverage_block(discovered=None, reaching_model=50)
    assert "non mesure" in block
    assert "personnes connues sur ce compte : 0" not in block


def test_la_couverture_dit_que_l_echantillon_n_est_pas_le_compte() -> None:
    block = graph_coverage_block(discovered=2241, reaching_model=50, already_classified=300)
    assert "2241" in block and "50" in block and "300" in block
    assert "ECHANTILLON" in block


# ── WORKSPACE_CORRECTIONS : les trois verrous ──────────────────────────────


def _poisoned_correction() -> dict[str, Any]:
    """Une correction légitime, à laquelle on ajoute tous les critères protégés
    qu'un jour quelqu'un pourrait joindre à la ligne. Construite comme la
    production la fournirait, plus le poison."""
    return {
        "personName": "Claire Perrin",
        "field": "title",
        "previousValue": "DSI",
        "correctedValue": "Directrice des Systemes d'Information",
        "evidenceKind": "official_site",
        "correctedAt": "2026-08-20T10:00:00.000Z",
        # Ce qui ne doit JAMAIS voyager.
        "reason": "je l'ai rencontree, elle habite 12 rue des Lilas",
        "userId": "8f2c-…",
        "photoUrl": "https://cdn.exemple/claire.jpg",
        "birthDate": "1979-04-02",
        "gender": "female",
        "nationality": "francaise",
        "maritalStatus": "mariee",
        "address": "12 rue des Lilas, 75011 Paris",
        "apolloDetails": {"seniority": "director", "photoUrl": "https://cdn.exemple/c.jpg"},
    }


def test_aucun_critere_protege_n_entre_dans_workspace_corrections() -> None:
    """Le cœur du fichier. Si ce test tombe : un critère protégé vient d'entrer
    dans le prompt qui reconstruit la chaîne de décision. Le retirer de la
    charge utile — jamais retirer le test."""
    block = workspace_corrections_block([_poisoned_correction()])
    assert block, "le bloc est vide : la garde ne lirait rien"
    assert _found_in(block, PROTECTED_CRITERIA) == [], _found_in(block, PROTECTED_CRITERIA)
    # Ni les CLÉS ni les VALEURS : une adresse rendue sans sa clé reste une adresse.
    assert "rue des Lilas" not in block
    assert "1979-04-02" not in block
    assert "cdn.exemple" not in block


def test_la_raison_ecrite_par_l_humain_reste_au_ledger() -> None:
    """Texte LIBRE, donc non bornable : impossible de prouver qu'il est exempt
    de critère protégé. Le couple champ + valeur corrigée dit déjà ce qu'il faut
    savoir — quelle affirmation fait foi."""
    block = workspace_corrections_block([_poisoned_correction()])
    assert "rencontree" not in block
    assert "reason" not in block
    assert "userId" not in block


def test_l_identite_et_la_correction_elles_passent() -> None:
    """L'interdit ne doit pas vider le bloc de sa substance : l'IDENTITÉ est
    l'une des deux exceptions nommées de la doctrine (le livrable DÉSIGNE la
    personne), et sans la valeur corrigée le bloc n'apprendrait rien."""
    block = workspace_corrections_block([_poisoned_correction()])
    assert "Claire Perrin" in block
    assert "Directrice des Systemes d'Information" in block
    assert "FAIT FOI" in block


def test_un_critere_protege_IMBRIQUE_dans_une_valeur_autorisee_ne_passe_pas() -> None:
    """Verrou n°3, testé SEUL — sans lui, ce cas passerait.

    ``correctedValue`` est une clé de la liste blanche et ``title`` un champ
    autorisé : les deux premiers verrous laissent donc passer la ligne. Si la
    valeur elle-même porte une structure (ce qu'un appelant mal écrit peut
    envoyer), seul le nettoyage RÉCURSIF en sortie l'arrête. C'est la raison
    d'être de la ceinture ET des bretelles.
    """
    block = workspace_corrections_block(
        [
            {
                "personName": "Claire Perrin",
                "field": "title",
                "correctedValue": {"label": "DSI", "photoUrl": "https://cdn.exemple/claire.jpg"},
            }
        ]
    )
    assert block, "la ligne devait passer les deux premiers verrous"
    assert _found_in(block, PROTECTED_CRITERIA) == []
    assert "cdn.exemple" not in block
    # Et la partie légitime de la valeur survit — le verrou nettoie, il ne jette pas.
    assert "DSI" in block


def test_un_champ_hors_de_la_liste_fermee_fait_tomber_la_ligne() -> None:
    """Verrou n°2 : on ne devine pas ce qu'un champ inconnu contient."""
    assert workspace_corrections_block([{**_poisoned_correction(), "field": "salaire"}]) == ""
    assert workspace_corrections_block([{**_poisoned_correction(), "field": ""}]) == ""


def test_la_liste_des_champs_corrigibles_est_celle_du_contrat() -> None:
    """Les dix champs de `ORG_CORRECTION_FIELDS`. La garde LIT une liste réelle —
    si elle se vidait, tous les tests ci-dessus passeraient sur du vent."""
    assert CORRECTABLE_FIELDS == frozenset(
        {
            "title",
            "entityId",
            "hierarchyLevel",
            "decisionRoles",
            "reportsTo",
            "name",
            "parentId",
            "type",
            "verified",
            "presence",
        }
    )
    # Et aucun de ces champs n'est lui-même un critère protégé.
    assert _found_in(" ".join(sorted(CORRECTABLE_FIELDS)), PROTECTED_CRITERIA) == []


def test_le_detecteur_sait_dire_non() -> None:
    """La garde doit prouver qu'elle refuse — sinon elle ne garde rien.

    On lui soumet un bloc volontairement fautif : une correction sérialisée
    telle quelle, sans passer par la porte. Elle doit NOMMER ce qui déborde.
    """
    fautif = json.dumps(_poisoned_correction(), ensure_ascii=False)
    assert _found_in(fautif, PROTECTED_CRITERIA) == [
        "address",
        "birthDate",
        "gender",
        "maritalStatus",
        "nationality",
        "photoUrl",
    ]
    # Et elle ne crie pas sur un bloc sain.
    assert _found_in(workspace_corrections_block([_poisoned_correction()]), PROTECTED_CRITERIA) == []


# ── Les autres blocs disent ce qu'ils promettent ───────────────────────────


def test_entity_scope_nomme_ce_qui_a_ete_ecarte() -> None:
    block = entity_scope_block(in_scope=[{"name": "ACME SI"}], out_of_scope=[{"name": "ACME Immobilier"}])
    assert "ACME SI" in block
    assert "ACME Immobilier" in block
    assert "ECARTEES" in block


def test_existing_graph_summary_ne_porte_que_des_comptes_et_des_noms() -> None:
    block = existing_graph_summary_block(
        {"peopleCount": 300, "entityCount": 12, "verifiedRelations": 4, "knownPeople": ["Claire Perrin"]}
    )
    assert "300" in block and "12" in block and "Claire Perrin" in block
    assert _found_in(block, PROTECTED_CRITERIA) == []


def test_relation_evidence_rappelle_qu_une_identite_ne_prouve_pas_un_lien() -> None:
    block = relation_evidence_block([{"from": "Marc Dubois", "to": "Claire Perrin", "kind": "official_site"}])
    assert "IDENTITE" in block and "RELATION" in block


def test_direction_scope_et_project_context_rendent_leur_contenu() -> None:
    assert "Engineering" in direction_scope_block("Engineering")
    assert "migration SAP" in project_context_block([{"title": "migration SAP"}])
