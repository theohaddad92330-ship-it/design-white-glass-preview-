"""Le FINAL du 27/08 (recopié dans `focalOrgData.ts:194-199`) : « masquer
complètement un blocker hiérarchiquement réel falsifie l'organigramme ; on
l'exclut du chemin, pas de la structure ». Le web tient déjà la règle
(`decisionBadgeOf`, `focalOrgData.ts:95-111`) : un bloqueur reste VISIBLE
dans l'arbre, atténué, mais n'entre jamais dans le chemin recommandé.

Le GÉNÉRATEUR ne la tenait pas : `assemble_org_graph` filtrait `recommendedPath`
sur les personnes rejetées (`rejected_ids`) et le cadrage (`scope_selection`),
jamais sur `decisionRoles`. Le `recommendedPath` STOCKÉ dans
`raw_analysis.org.orgGraph` pouvait donc contenir un bloqueur — tout ce qui
lit ce blob SANS passer par l'écran (export PDF, outil du copilote, MCP,
routine) recommandait la personne qui bloque le dossier.

Cette classe EST la garde : elle lit un corpus réellement non vide
(`g["recommendedPath"]` et `g["people"]`, produits par les fixtures ci-dessous)
et casse si le générateur régresse.
"""

from __future__ import annotations

from app.services.org_graph_assembler import assemble_org_graph
from app.services.org_graph_validate import validate_org_graph


def _contacts_with_a_blocker() -> list[dict]:
    return [
        {
            "fullName": "Jean Dupont",
            "title": "DSI",
            "entity": "TF1 Groupe",
            "role": "technical",
            "hierarchyLevel": "c_level",
            "source": "pappers",
            "bucket": "decideur",
        },
        {
            "fullName": "Blanche Bloqueuse",
            "title": "Directrice Juridique",
            "entity": "TF1 Groupe",
            # `role: blocker` → `_decision_roles` rend ["blocker"], comme le
            # documente le docstring de `_decision_roles` (§1 « le bloqueur
            # traverse ») — décision 5 du FINAL.
            "role": "blocker",
            "hierarchyLevel": "c_level",
            "source": "apollo",
            "bucket": "decideur",
        },
        {
            "fullName": "Nadia Neutre",
            "title": None,
            "entity": "TF1 Groupe",
            "role": None,
            "hierarchyLevel": "management",
            "source": "ia_reconstruction",
            "bucket": "operationnel",
        },
    ]


def _entities() -> list[dict]:
    return [{"name": "TF1 Groupe", "type": "groupe", "parentId": None}]


def _approach_order_through_the_blocker() -> list[dict]:
    return [
        {"step": 1, "contact": "Jean Dupont", "why_first": "sponsor budget"},
        {"step": 2, "contact": "Blanche Bloqueuse", "why_first": "signe les contrats"},
        {"step": 3, "contact": "Nadia Neutre", "why_first": "porte le besoin"},
    ]


def test_a_blocker_never_enters_the_recommended_path():
    g = assemble_org_graph(
        contacts=_contacts_with_a_blocker(),
        entities=_entities(),
        approach_order=_approach_order_through_the_blocker(),
    )
    people = {p["fullName"]: p for p in g["people"]}
    blocker = people["Blanche Bloqueuse"]
    path_person_ids = [step["personId"] for step in g["recommendedPath"]]

    assert blocker["decisionRoles"] == ["blocker"]
    assert blocker["id"] not in path_person_ids, (
        "un bloqueur hiérarchiquement réel entre dans le chemin recommandé — "
        "la règle du FINAL (« on l'exclut du chemin, pas de la structure ») "
        "n'est plus tenue par le générateur"
    )


def test_the_blocker_stays_visible_in_the_structure():
    """Exclure du chemin n'est pas masquer : le nœud reste dans `people`,
    exactement comme le web le lit (`focalOrgData.ts`) pour l'atténuer sans
    le faire disparaître."""
    g = assemble_org_graph(
        contacts=_contacts_with_a_blocker(),
        entities=_entities(),
        approach_order=_approach_order_through_the_blocker(),
    )
    names = {p["fullName"] for p in g["people"]}
    assert "Blanche Bloqueuse" in names
    assert validate_org_graph(g) == []


def test_the_other_steps_of_the_path_are_kept_and_still_numbered_from_one():
    """Le filtrage du bloqueur ne doit ni casser ni trouer la numérotation des
    étapes qui restent — même comportement que pour un contact rejeté."""
    g = assemble_org_graph(
        contacts=_contacts_with_a_blocker(),
        entities=_entities(),
        approach_order=_approach_order_through_the_blocker(),
    )
    people_by_id = {p["id"]: p for p in g["people"]}
    names_in_path = [people_by_id[s["personId"]]["fullName"] for s in g["recommendedPath"]]
    assert names_in_path == ["Jean Dupont", "Nadia Neutre"]
    assert [s["step"] for s in g["recommendedPath"]] == [1, 2]


def test_an_unknown_role_is_not_treated_as_a_blocker():
    """`unknown` veut dire « le générateur n'a rien pu établir » — pas un rôle.
    Le traiter comme un bloqueur exclurait du chemin des gens dont on ne sait
    simplement rien, ce que `focalOrgData.ts:98-102` interdit déjà côté web."""
    g = assemble_org_graph(
        contacts=_contacts_with_a_blocker(),
        entities=_entities(),
        approach_order=_approach_order_through_the_blocker(),
    )
    people = {p["fullName"]: p for p in g["people"]}
    nadia = people["Nadia Neutre"]
    path_person_ids = [step["personId"] for step in g["recommendedPath"]]

    assert nadia["decisionRoles"] == ["unknown"]
    assert nadia["id"] in path_person_ids
