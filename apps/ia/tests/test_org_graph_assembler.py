"""OrgGraph assembler (Phase 2/3 emission). Locks the bridge from pipeline shapes
to the contract graph: id synthesis, level/type/role mapping, name-ref → id
resolution, resolver-driven edges, and that the output ALWAYS validates.
"""

from __future__ import annotations

from app.services.org_graph_assembler import assemble_org_graph
from app.services.org_graph_validate import validate_org_graph


def _contacts() -> list[dict]:
    return [
        {
            "fullName": "Jean Dupont",
            "title": "DSI",
            "entity": "TF1 Groupe",
            "role": "technical",
            "hierarchyLevel": "c_level",
            "source": "pappers",
            "reportingTo": None,
            "email": "jean@tf1.fr",
            "bucket": "decideur",
        },
        {
            "fullName": "Marie Martin",
            "title": "Responsable Data",
            "entity": "TF1 Groupe",
            "role": "user",
            "hierarchyLevel": "management",
            "source": "apollo",
            "reportingTo": "Jean Dupont",
            "bucket": "operationnel",
        },
        {
            "fullName": "Bruit Fantome",
            "title": None,
            "entity": "TF1 Groupe",
            "role": None,
            "source": "ia_reconstruction",
            "bucket": "bruit",
        },
    ]


def _entities() -> list[dict]:
    return [
        {"name": "TF1 Groupe", "type": "groupe", "parentId": None, "siren": "326300159"},
        {"name": "TF1 Pub", "type": "filiale_strategique", "parentId": "TF1 Groupe"},
        {"name": "GIE Bruit", "type": "bruit"},
    ]


def test_assembles_a_contract_valid_graph():
    g = assemble_org_graph(contacts=_contacts(), entities=_entities())
    assert validate_org_graph(g) == []
    assert g["graphVersion"] == 1


def test_entities_get_ids_mapped_type_and_resolved_parent():
    g = assemble_org_graph(contacts=[], entities=_entities())
    by_name = {e["name"]: e for e in g["entities"]}
    # noise entity excluded + memorised
    assert "GIE Bruit" not in by_name
    assert any(r["sourceId"].startswith("e-") for r in g["rejectedItems"])
    groupe, pub = by_name["TF1 Groupe"], by_name["TF1 Pub"]
    assert groupe["type"] == "groupe" and pub["type"] == "filiale"
    assert pub["parentId"] == groupe["id"]  # name-ref resolved to synthesised id
    assert groupe["parentId"] is None
    assert groupe["confidence"] == 85  # SIREN-backed


def test_people_attach_to_entity_and_map_level_role():
    g = assemble_org_graph(contacts=_contacts(), entities=_entities())
    people = {p["fullName"]: p for p in g["people"]}
    assert "Bruit Fantome" not in people  # bruit → rejected
    jean = people["Jean Dupont"]
    entity_ids = {e["id"] for e in g["entities"]}
    assert jean["entityId"] in entity_ids
    assert jean["hierarchyLevel"] == "L1"  # c_level → L1
    assert jean["decisionRoles"] == ["technical_buyer"]
    assert jean["identityStatus"] == "enriched"  # has email


def test_reports_to_edge_is_built_between_people():
    """Le N+1 est bien résolu et relié — mais en INFLUENCE, pas en hiérarchie.

    `reportingTo` est une supposition du modèle (« rapporte PROBABLEMENT ») :
    elle ne peut pas emprunter la provenance d'identité de la personne pour
    devenir une ligne hiérarchique. Détail : ``test_org_reporting_provenance``.
    """
    g = assemble_org_graph(contacts=_contacts(), entities=_entities())
    people = {p["fullName"]: p for p in g["people"]}
    reports = [e for e in g["influenceEdges"] if e["topic"] == "rattachement hiérarchique"]
    assert any(
        e["fromId"] == people["Marie Martin"]["id"] and e["toId"] == people["Jean Dupont"]["id"] for e in reports
    )
    assert not [e for e in g["hierarchyEdges"] if e["type"] == "reports_to"]


def test_ia_units_keep_their_own_type_instead_of_the_generic_bu():
    """#2636.1 — une unité IA/Data nommée comme telle ne retombait pas sur `bu`
    générique : « AI Factory », « Data Office » et « Lab » sont désormais des
    branches reconnues, chacune rattachée à son entité — pas fondues dans le
    central."""
    entities = [
        {"name": "Decathlon Groupe", "type": "groupe", "parentId": None},
        {"name": "Decathlon AI Factory", "type": "factory", "parentId": "Decathlon Groupe", "itAutonomy": "partage"},
        {"name": "Decathlon Data Office", "type": "data office", "parentId": "Decathlon Groupe"},
        {"name": "Decathlon Lab", "type": "lab", "parentId": "Decathlon Groupe"},
    ]
    g = assemble_org_graph(contacts=[], entities=entities)
    by_name = {e["name"]: e for e in g["entities"]}
    assert by_name["Decathlon AI Factory"]["type"] == "factory"
    assert by_name["Decathlon Data Office"]["type"] == "data_office"
    assert by_name["Decathlon Lab"]["type"] == "lab"
    # collecté par Phase 1 (`it_autonomy`), doit atteindre le graphe affiché.
    assert by_name["Decathlon AI Factory"]["itAutonomy"] == "partage"
    # jamais deviné pour une entité qui ne le porte pas.
    assert "itAutonomy" not in by_name["Decathlon Data Office"]


def test_committee_maps_to_person_ids():
    committee = {
        "members": [{"fullName": "Jean Dupont", "committeeRole": "technical_buyer", "roleLabel": "Acheteur technique"}]
    }
    g = assemble_org_graph(contacts=_contacts(), entities=_entities(), committee=committee)
    people = {p["fullName"]: p for p in g["people"]}
    assert g["buyingCommittee"][0]["personId"] == people["Jean Dupont"]["id"]
    assert g["buyingCommittee"][0]["role"] == "technical_buyer"


def test_uncovered_zones_and_path_map():
    zones = [{"zone": "Achats IT non couverts", "importance": "critique", "suggestedTitle": "Directeur Achats"}]
    approach = [{"step": 1, "contact": "Jean Dupont", "why_first": "sponsor budget", "unlocks": "le comité"}]
    g = assemble_org_graph(contacts=_contacts(), entities=_entities(), uncovered_zones=zones, approach_order=approach)
    assert g["uncoveredZones"][0]["reason"] == "Achats IT non couverts"
    assert g["uncoveredZones"][0]["suggestedTitles"] == ["Directeur Achats"]
    people = {p["fullName"]: p for p in g["people"]}
    assert g["recommendedPath"][0]["personId"] == people["Jean Dupont"]["id"]


def test_rejected_person_never_in_path():
    approach = [{"step": 1, "contact": "Bruit Fantome", "why_first": "x"}]
    g = assemble_org_graph(contacts=_contacts(), entities=_entities(), approach_order=approach)
    # the bruit contact must not surface in the path, and the graph stays valid
    assert g["recommendedPath"] == []


def test_step_surfaces_why_now_and_expected_result_separately_from_objective():
    # #2312.2/.8 (épopée #2963) — `why_first`/`expected_outcome` sont DÉJÀ
    # produits par le LLM (bellum_organigramme.py) mais fondus dans `objective`
    # par un simple repli de clé : ils sont maintenant AUSSI surfacés à part.
    approach = [
        {
            "step": 1,
            "contact": "Jean Dupont",
            "why_first": "le programme data vient de démarrer",
            "expected_outcome": "confirmation du périmètre",
        }
    ]
    g = assemble_org_graph(contacts=_contacts(), entities=_entities(), approach_order=approach)
    step = g["recommendedPath"][0]
    assert step["whyNow"] == "le programme data vient de démarrer"
    assert step["expectedResult"] == "confirmation du périmètre"
    assert step["objective"] == "le programme data vient de démarrer"


def test_step_surfaces_the_new_llm_fields_when_present():
    # #2312.4/.5/.6/.9/.12 — neufs côté prompt, projetés tels quels s'ils
    # arrivent, absents sinon (jamais devinés).
    approach = [
        {
            "step": 1,
            "contact": "Jean Dupont",
            "why_first": "x",
            "question_to_ask": "quel est le périmètre ?",
            "info_to_obtain": "le budget",
            "evidence_to_use": "article de presse",
            "gating_condition": "a confirmé le périmètre",
            "risk": "périmètre flou",
        }
    ]
    g = assemble_org_graph(contacts=_contacts(), entities=_entities(), approach_order=approach)
    step = g["recommendedPath"][0]
    assert step["questionToAsk"] == "quel est le périmètre ?"
    assert step["infoToObtain"] == "le budget"
    assert step["evidenceToUse"] == "article de presse"
    assert step["gatingCondition"] == "a confirmé le périmètre"
    assert step["risk"] == "périmètre flou"


def test_next_person_id_is_derived_structurally_not_a_new_llm_field():
    # #2312.10 — la personne suivante n'est jamais un second champ LLM : c'est
    # le personId de l'étape suivante dans LA MÊME séquence.
    approach = [
        {"step": 1, "contact": "Jean Dupont", "why_first": "x"},
        {"step": 2, "contact": "Marie Martin", "why_first": "y"},
    ]
    g = assemble_org_graph(contacts=_contacts(), entities=_entities(), approach_order=approach)
    people = {p["fullName"]: p for p in g["people"]}
    assert g["recommendedPath"][0]["nextPersonId"] == people["Marie Martin"]["id"]
    assert "nextPersonId" not in g["recommendedPath"][1]
    assert validate_org_graph(g) == []


def _board_contacts() -> list[dict]:
    """A chairman (L0 gouvernance) + the operational DSI, as the model ranks them."""
    return [
        {
            "fullName": "Martine Presidente",
            "title": "Présidente du conseil d'administration",
            "entity": "TF1 Groupe",
            "role": "economic",
            "hierarchyLevel": "governance",
            "source": "pappers",
        },
        {
            "fullName": "Jean Dupont",
            "title": "DSI",
            "entity": "TF1 Groupe",
            "role": "technical",
            "hierarchyLevel": "c_level",
            "source": "apollo",
        },
    ]


def _board_first_approach() -> list[dict]:
    return [
        {"step": 1, "contact": "Martine Presidente", "why_first": "la plus haute"},
        {"step": 2, "contact": "Jean Dupont", "why_first": "porte le sujet"},
    ]


def test_a_cold_account_never_opens_on_the_board():
    """DoD p32 : board/administrateur jamais en 1re approche sans relation."""
    g = assemble_org_graph(
        contacts=_board_contacts(),
        entities=_entities(),
        approach_order=_board_first_approach(),
        relationship_state="froid",
    )
    people = {p["id"]: p for p in g["people"]}
    first = people[g["recommendedPath"][0]["personId"]]
    assert first["fullName"] == "Jean Dupont"
    assert people[g["recommendedPath"][1]["personId"]]["hierarchyLevel"] == "L0"
    assert [s["step"] for s in g["recommendedPath"]] == [1, 2]
    assert validate_org_graph(g) == []


def test_a_missing_relationship_state_is_treated_as_cold():
    """No SalesContext resolved → the guard still fires (safe default)."""
    g = assemble_org_graph(contacts=_board_contacts(), entities=_entities(), approach_order=_board_first_approach())
    people = {p["id"]: p for p in g["people"]}
    assert people[g["recommendedPath"][0]["personId"]]["fullName"] == "Jean Dupont"


def test_a_warm_account_keeps_the_model_order():
    """With a relation, the board is a legitimate first touch — order untouched."""
    g = assemble_org_graph(
        contacts=_board_contacts(),
        entities=_entities(),
        approach_order=_board_first_approach(),
        relationship_state="client_actif",
    )
    people = {p["id"]: p for p in g["people"]}
    assert people[g["recommendedPath"][0]["personId"]]["fullName"] == "Martine Presidente"
    assert validate_org_graph(g) == []


def test_empty_inputs_yield_a_valid_empty_graph():
    g = assemble_org_graph()
    assert validate_org_graph(g) == []
    assert g["people"] == [] and g["entities"] == []


def test_org_chart_level_shape_is_accepted():
    # entities may arrive as org-chart rows {entity, level} (no `type`/`parentId`).
    entities = [{"entity": "ACME Group", "level": "groupe"}, {"entity": "ACME Data", "level": "BU"}]
    g = assemble_org_graph(contacts=[], entities=entities)
    types = {e["name"]: e["type"] for e in g["entities"]}
    assert types == {"ACME Group": "groupe", "ACME Data": "bu"}
    assert validate_org_graph(g) == []


def test_committee_seat_carries_a_deterministic_access_score():
    """accessScore (écart tracker) : le siège porte son accessibilité, dérivée du
    niveau + statut d'identité — le tri du chemin ne retombe plus sur la confiance."""
    committee = {
        "members": [
            {"fullName": "Marie Martin", "committeeRole": "champion", "roleLabel": "Champion"},
            {"fullName": "Jean Dupont", "committeeRole": "economic_buyer", "roleLabel": "Décideur"},
        ]
    }
    g = assemble_org_graph(contacts=_contacts(), entities=_entities(), committee=committee)
    by_pid = {p["id"]: p for p in g["people"]}
    seats = {seat["personId"]: seat for seat in g["buyingCommittee"]}
    for pid, seat in seats.items():
        assert "accessScore" in seat
        assert 0 <= seat["accessScore"] <= 100
    # Marie (management L3) est plus accessible que Jean (exécutif L1).
    marie = next(p for p in g["people"] if p["fullName"] == "Marie Martin")
    jean = next(p for p in g["people"] if p["fullName"] == "Jean Dupont")
    assert seats[marie["id"]]["accessScore"] > seats[jean["id"]]["accessScore"]


def test_procurement_tier_reaches_L5():
    """L5 Achats (écart tracker) : un tier achats atteint enfin le niveau L5 du
    contrat au lieu de tomber dans le vide."""
    contacts = [
        {
            "fullName": "Paul Acheteur",
            "title": "Responsable Achats IT",
            "entity": "TF1 Groupe",
            "role": "achat",
            "hierarchyLevel": "achats",
            "source": "apollo",
            "bucket": "operationnel",
        }
    ]
    g = assemble_org_graph(contacts=contacts, entities=_entities())
    paul = next(p for p in g["people"] if p["fullName"] == "Paul Acheteur")
    assert paul["hierarchyLevel"] == "L5"
    assert validate_org_graph(g) == []


def test_a_zone_at_the_achats_tier_maps_to_L5():
    zones = [{"zone": "Achats IT non couverts", "importance": "critique", "entity": "TF1 Groupe", "level": "achats"}]
    g = assemble_org_graph(contacts=_contacts(), entities=_entities(), uncovered_zones=zones)
    assert g["uncoveredZones"][0]["hierarchyLevel"] == "L5"


class TestInfluenceProvenance:
    """D405/GA-139 — LE MANQUE que ce chantier corrige : une influence ne
    portait sa provenance qu'en PROSE (`reasoning`), qui ne se filtre pas, ne
    vieillit pas et ne s'affiche pas comme une source. Chaque influenceEdge
    émise ici porte désormais `sourceIds` (même mécanisme que
    `hierarchyEdges[].sourceIds`) et `derivedAt` — la date du RUN, jamais une
    date d'observation inventée (une influence est une INFÉRENCE).

    Cette classe EST la garde : elle lit un corpus réellement non vide
    (`g["influenceEdges"]`, produit par le fixture `_contacts()` existant via
    le `reportingTo` de Marie Martin) et casse si un producteur régresse.
    """

    def test_carries_sourceids_and_the_injected_run_date(self):
        g = assemble_org_graph(contacts=_contacts(), entities=_entities(), derived_at="2026-08-30T09:00:00+00:00")
        assert len(g["influenceEdges"]) > 0, "corpus vide : la garde ne lirait plus rien"
        for edge in g["influenceEdges"]:
            assert isinstance(edge.get("sourceIds"), list)
            assert edge["derivedAt"] == "2026-08-30T09:00:00+00:00"
        # Le lien reportingTo (llm, Marie Martin → Jean Dupont) porte l'id de sa
        # preuve — jamais une liste vide alors qu'une source existe réellement.
        reports = [e for e in g["influenceEdges"] if e["topic"] == "rattachement hiérarchique"]
        assert reports and reports[0]["sourceIds"] == [f"s-{reports[0]['fromId']}-reporting-llm"]

    def test_never_invents_a_run_date_when_none_is_given(self):
        """`assemble_org_graph` reste PUR (docstring du module) : sans
        `derived_at` explicite, il ne devine PAS l'heure — `derivedAt`
        n'apparaît simplement pas. La vraie horloge du run vit un cran plus
        haut, chez `build_org_graph_payload` (voir la classe suivante), le
        seul endroit qui sait réellement QUAND le run a lieu."""
        g = assemble_org_graph(contacts=_contacts(), entities=_entities())
        assert len(g["influenceEdges"]) > 0
        for edge in g["influenceEdges"]:
            assert "derivedAt" not in edge

    def test_two_equivalent_calls_stay_byte_identical_without_derived_at(self):
        """Une influence NE fait PAS diverger deux assemblages par ailleurs
        identiques — c'est ce que plusieurs tests existants vérifient déjà
        (`test_the_gate_is_output_neutral_on_todays_graph`,
        `test_an_account_without_a_team_page_is_byte_identical`…). Un
        `datetime.now()` implicite aurait cassé cette promesse."""
        first = assemble_org_graph(contacts=_contacts(), entities=_entities())
        second = assemble_org_graph(contacts=_contacts(), entities=_entities())
        assert first == second

    def test_a_graph_stored_before_this_chantier_still_validates(self):
        """Rétrocompatibilité : un graphe déjà émis (donc déjà assemblé, mais
        relu tel quel côté API/écran) n'a ni `sourceIds` ni `derivedAt` sur ses
        influenceEdges — absent, pas un plantage, pas une valeur inventée."""
        g = assemble_org_graph(contacts=_contacts(), entities=_entities())
        legacy_edge = dict(g["influenceEdges"][0])
        legacy_edge.pop("sourceIds", None)
        legacy_edge.pop("derivedAt", None)
        legacy_graph = {**g, "influenceEdges": [legacy_edge, *g["influenceEdges"][1:]]}
        assert validate_org_graph(legacy_graph) == []


def test_a_person_cited_under_two_entities_is_one_node_4177_3():
    """#4177.3 — un groupe à deux entités : la même personne (nom neutralisé) n'est qu'UN nœud.

    Avant : « Jean Dupont » sous Servier SAS et « Jean  DUPONT » sous l'Institut donnaient deux personnes
    (`p-jean-dupont`, `p-jean-dupont-2`), donc deux fois la même fiche à l'écran et dans les décomptes."""
    contacts = [
        {
            "fullName": "Jean Dupont",
            "title": "DSI",
            "entity": "Servier SAS",
            "role": "technical",
            "hierarchyLevel": "c_level",
            "source": "apollo",
            "bucket": "decideur",
        },
        {
            "fullName": "Jean  DUPONT",
            "title": "DSI",
            "entity": "Institut Servier",
            "role": "technical",
            "hierarchyLevel": "c_level",
            "source": "pappers",
            "bucket": "decideur",
        },
        {
            "fullName": "Marie Martin",
            "title": "Data",
            "entity": "Institut Servier",
            "role": "user",
            "hierarchyLevel": "management",
            "source": "apollo",
            "bucket": "operationnel",
        },
    ]
    entities = [
        {"name": "Servier SAS", "type": "groupe"},
        {"name": "Institut Servier", "type": "filiale_strategique", "parentId": "Servier SAS"},
    ]
    g = assemble_org_graph(contacts=contacts, entities=entities)
    assert validate_org_graph(g) == []
    names = [p["fullName"].lower().replace("  ", " ") for p in g["people"]]
    assert names.count("jean dupont") == 1
    assert len(g["people"]) == 2


def test_two_different_people_stay_two_nodes_4177_3():
    contacts = [
        {"fullName": "Jean Dupont", "title": "DSI", "entity": "Servier SAS", "source": "apollo", "bucket": "decideur"},
        {
            "fullName": "Jean Dupond",
            "title": "DSI",
            "entity": "Institut Servier",
            "source": "apollo",
            "bucket": "decideur",
        },
    ]
    entities = [
        {"name": "Servier SAS", "type": "groupe"},
        {"name": "Institut Servier", "type": "filiale_strategique", "parentId": "Servier SAS"},
    ]
    g = assemble_org_graph(contacts=contacts, entities=entities)
    assert len(g["people"]) == 2
