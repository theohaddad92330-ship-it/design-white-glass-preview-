"""#3231 (#219.8, X50) — la relation DÉCLARÉE d'un contact pilote la PREUVE exigée.

Rejeu côté Laura : ce que `search_workspace_contacts` et `get_account_contacts`
relaient au modèle quand le commercial a déclaré « ancien salarié ».
"""

import pytest

from app.services.person_relation_proof import relation_proof_note, with_relation_proof


@pytest.mark.parametrize("relation", ["employee_former", "contractor_historical", "consultant_presented"])
def test_une_relation_passee_ou_presentee_exige_une_preuve(relation):
    note = relation_proof_note(relation)
    assert note
    assert "%" not in note  # jamais de probabilité


@pytest.mark.parametrize("relation", [None, "", "unknown_relationship", "manager", "sponsor", "ancien", 3])
def test_sans_declaration_prudente_aucune_note(relation):
    assert relation_proof_note(relation) is None


def test_la_ligne_porte_la_relation_et_la_consigne():
    row = {"contact_id": "c1", "full_name": "Camille", "declared_person_company_relation": "employee_former"}
    out = with_relation_proof(row)
    assert out["person_company_relation"] == "employee_former"
    assert "confirmation" in out["relation_proof"]
    assert "declared_person_company_relation" not in out  # nom de colonne jamais relayé


def test_une_relation_declaree_non_prudente_est_relayee_sans_consigne():
    out = with_relation_proof({"contact_id": "c1", "declared_person_company_relation": "sponsor"})
    assert out["person_company_relation"] == "sponsor"
    assert "relation_proof" not in out


def test_une_absence_ne_fait_aucune_cle():
    row = {"contact_id": "c1", "declared_person_company_relation": None}
    assert with_relation_proof(row) == {"contact_id": "c1"}
    assert with_relation_proof("pas une ligne") == "pas une ligne"


def test_les_notes_d_une_relation_passee_nomment_aussi_la_confidentialite():
    for relation in ("employee_former", "contractor_historical"):
        assert "confidenti" in relation_proof_note(relation).lower()


def test_le_bloc_du_plan_nomme_les_contacts_a_relation_passee_seulement():
    from app.services.person_relation_proof import person_relation_plan_block

    contacts = [
        {"fullName": "Camille Roux", "declaredPersonCompanyRelation": "employee_former"},
        {"fullName": "Dominique Petit", "declaredPersonCompanyRelation": "sponsor"},
        {"fullName": "Alix Moreau"},
        {"fullName": "Sacha Noir", "declaredPersonCompanyRelation": "consultant_presented"},
    ]
    block = person_relation_plan_block(contacts)
    assert "Camille Roux" in block and "Sacha Noir" in block
    assert "Dominique Petit" not in block and "Alix Moreau" not in block
    assert "%" not in block


def test_aucun_contact_a_relation_passee_ne_fait_aucune_ligne():
    from app.services.person_relation_proof import person_relation_plan_block

    assert person_relation_plan_block([{"fullName": "Alix", "declaredPersonCompanyRelation": "sponsor"}]) == ""
    assert person_relation_plan_block([]) == ""
    assert person_relation_plan_block(None) == ""


def test_le_plan_recoit_les_contacts_a_relation_passee():
    """Rejeu : POST /phase/4/plan → prompt système capturé (appelant réel)."""
    from unittest.mock import AsyncMock, patch

    from fastapi.testclient import TestClient

    from app.main import app
    from tests.test_phase4_plan import _plan_dispatch

    body = {
        "account_id": "abc-123",
        "user_id": "11111111-1111-4111-8111-111111111111",
        "account_data": {"company_name": "Acme", "sector": "Transport", "angles": [{"angle": "Modernisation SI"}]},
        "contacts": [
            {"fullName": "Camille Roux", "title": "DSI", "declaredPersonCompanyRelation": "employee_former"},
            {"fullName": "Alix Moreau", "title": "CTO"},
        ],
        "profile_data": {"companyName": "MonESN", "size": "50"},
    }
    with (
        patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, side_effect=_plan_dispatch()) as claude,
        patch("app.routers.phase4_plan.bellum_api.delivery_capacity", new_callable=AsyncMock, return_value=None),
    ):
        res = TestClient(app).post("/phase/4/plan", json=body)
    assert res.status_code == 200
    prompts = [str(c[0][0]) for c in claude.call_args_list]
    block = next(p for p in prompts if "RELATION PASSÉE" in p)
    assert "Camille Roux" in block.split("RELATION PASSÉE", 1)[1]


def test_la_relation_declaree_dit_ce_qu_elle_autorise_comme_introduction():
    former = with_relation_proof({"declared_person_company_relation": "employee_former"})
    assert "pas une introduction" in former["introduction_capability"]
    sponsor = with_relation_proof({"declared_person_company_relation": "sponsor"})
    assert "confirmer" in sponsor["introduction_capability"]
    assert "collision_risk" not in sponsor


def test_une_relation_de_terrain_occupe_nomme_le_risque_de_collision_sans_probabilite():
    for relation in ("contractor_current", "freelancer", "consultant_presented"):
        out = with_relation_proof({"declared_person_company_relation": relation})
        assert out["collision_risk"]
        assert "%" not in out["collision_risk"]


def test_sans_declaration_ni_introduction_ni_collision():
    out = with_relation_proof({"declared_person_company_relation": "unknown_relationship"})
    assert "introduction_capability" not in out and "collision_risk" not in out


# #3231 (#219.8, recette prod 05/10) — la relation déclarée atteint le prompt
# MÊME quand le modèle n'appelle aucun outil ce tour : `declared_relations_context_block`
# lit `contacts_summary`, déjà dans le contexte de BASE de chaque tour (`chat.py`),
# pas seulement les retours de `search_workspace_contacts`/`get_account_contacts`.
def test_le_bloc_de_base_nomme_une_relation_declaree_lue_dans_contacts_summary():
    from app.services.person_relation_proof import declared_relations_context_block

    contacts_summary = (
        "Camille Roux - DSI - economic - relation déclarée: employee_former - contact_id: c1\n"
        "Alix Moreau - CTO - technical - contact_id: c2"
    )
    block = declared_relations_context_block(contacts_summary)
    assert "Camille Roux" in block
    assert "Alix Moreau" not in block
    assert "confirmation" in block  # la consigne de preuve, pas juste le nom


def test_le_bloc_de_base_nomme_aussi_introduction_et_collision():
    from app.services.person_relation_proof import declared_relations_context_block

    contacts_summary = (
        "Dominique Petit - - - relation déclarée: contractor_current - contact_id: c3\n"
        "Sacha Noir - - - relation déclarée: consultant_presented - contact_id: c4"
    )
    block = declared_relations_context_block(contacts_summary)
    assert "confirmer" in block  # introduction_capability de contractor_current
    assert "terrain" in block  # collision_risk des deux


def test_le_bloc_de_base_reste_vide_sans_aucune_relation_declaree():
    from app.services.person_relation_proof import declared_relations_context_block

    assert declared_relations_context_block("Alix Moreau - CTO - technical - contact_id: c2") == ""
    assert declared_relations_context_block("") == ""
    assert declared_relations_context_block(None) == ""


def test_le_bloc_de_base_ignore_une_relation_declaree_sans_consigne():
    from app.services.person_relation_proof import declared_relations_context_block

    # `technical_reviewer` est une relation DÉCLARÉE valide (vocabulaire
    # #219.2/.5/.9) mais ne porte ni preuve, ni introduction, ni collision —
    # même contrat que `sponsor` sans tool call : silence, jamais une ligne vide.
    assert (
        declared_relations_context_block("Alix Moreau - - - relation déclarée: technical_reviewer - contact_id: c2")
        == ""
    )
