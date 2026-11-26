"""#2887 (#2371.4, lot M09) — le 10e stade de relation « partenaire actif ».

Piste : `accounts.siren ↔ partner_relations.siren`, `placements_active > 0`,
lue côté API (`RelationAxisReaderService`) et transmise en
`partner_placements_active`. Un fait SIGNÉ (des placements en cours), jamais
déduit du nom : sans la clé, la classification est celle d'avant, à l'octet."""

from __future__ import annotations

from app.knowledge.message_matrix import MESSAGE_MATRIX
from app.models.research import ResearchRequest
from app.services.relationship_playbook import MESSAGE_PLAYBOOK, STATE_TO_CADENCE_TEMPLATE
from app.services.sales_context import RELATIONSHIP_STATES, build_sales_context, classify_relationship_state


def test_le_stade_existe_dans_la_taxonomie() -> None:
    assert "partenaire_actif" in RELATIONSHIP_STATES
    assert len(RELATIONSHIP_STATES) == 10


def test_des_placements_en_cours_classent_partenaire_actif() -> None:
    state, derivation, confidence, evidence, _ = classify_relationship_state(partner_placements_active=3)
    assert state == "partenaire_actif"
    assert derivation == "inferred"
    assert 0 < confidence < 100
    assert any("3 placement" in e for e in evidence)


def test_sans_placement_rien_ne_change() -> None:
    assert classify_relationship_state(partner_placements_active=0)[0] == "froid"
    assert classify_relationship_state(partner_placements_active=None)[0] == "froid"
    assert classify_relationship_state(commercial_status="customer")[0] == "client_actif"


def test_une_declaration_humaine_gagne_toujours() -> None:
    # Une correction humaine gagne, quelle que soit sa date (doctrine).
    assert classify_relationship_state(known_status="active", partner_placements_active=2)[0] == "client_actif"
    assert classify_relationship_state(preset="incumbent", partner_placements_active=2)[0] == "rang2"


def test_le_fait_signe_passe_devant_le_kanban_infere() -> None:
    # Le kanban est une pré-classification (inferred 70) ; des placements en
    # cours sont un fait déclaré sur la relation partenaire.
    assert classify_relationship_state(commercial_status="watching", partner_placements_active=1)[0] == (
        "partenaire_actif"
    )


def test_le_sales_context_porte_le_stade() -> None:
    ctx = build_sales_context({}, {}, partner_placements_active=2)
    assert ctx["relationship"]["state"] == "partenaire_actif"
    assert build_sales_context({}, {})["relationship"]["state"] == "froid"


def test_la_requete_de_recherche_accepte_la_cle() -> None:
    req = ResearchRequest(company_name="ACME", account_id="a", partner_placements_active=2)
    assert req.partner_placements_active == 2
    assert ResearchRequest(company_name="ACME", account_id="a").partner_placements_active is None


def test_playbook_cadence_et_matrice_couvrent_le_stade() -> None:
    assert "partenaire_actif" in MESSAGE_PLAYBOOK
    assert STATE_TO_CADENCE_TEMPLATE["partenaire_actif"] == "partenaire_actif"
    assert MESSAGE_MATRIX["stages"]["partenaire_actif"] is not None


def test_les_actions_recommandees_parlent_en_pair_pas_en_prospect() -> None:
    from app.services.action_recommender import MAX_ACTIONS, MIN_ACTIONS, recommend_next_actions

    out = recommend_next_actions(verdict="GO", relationship_state="partenaire_actif")
    ids = [a["id"] for a in out]
    assert MIN_ACTIONS <= len(ids) <= MAX_ACTIONS
    assert ids[0] == "demander_intro"
    assert "enrichir_p1" not in ids[:2]


def test_la_gouvernance_et_la_priorite_comptent_la_relation() -> None:
    from app.services.governance_guard import has_relation_or_sponsor

    assert has_relation_or_sponsor("partenaire_actif") is True
