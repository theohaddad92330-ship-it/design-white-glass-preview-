"""#3231 (#219.6, X50) — CLIENT INTERNE : la SOURCE est une déclaration du commercial.

Avant : aucune donnée ne disait qu'un compte est une direction interne servant
des métiers, donc Laura appelait chaque métier cité « client externe ». La
déclaration vit sur la fiche compte (`accounts.declared_internal_client_mode`),
jamais devinée d'un texte. Ces tests rejouent : colonne → account_data →
prompt de Laura (chat) ET prompt du plan.
"""

import pytest

from app.prompts.bellum_advisor import build_system_prompt
from app.services.internal_client import (
    INTERNAL_CLIENT_MODES,
    internal_client_block,
    internal_client_mode_of,
)
from tests.test_prompts_new import SAMPLE_PROFILE


def test_le_vocabulaire_est_ferme_a_deux_valeurs():
    assert INTERNAL_CLIENT_MODES == ("internal_service", "external_buyer")


@pytest.mark.parametrize(
    "account", [None, {}, {"declared_internal_client_mode": None}, {"declared_internal_client_mode": "x"}]
)
def test_une_declaration_absente_ou_inconnue_ne_fait_aucune_ligne(account):
    assert internal_client_mode_of(account) is None
    assert internal_client_block(account, "Acme") == ""


def test_service_interne_nomme_les_quatre_roles_sans_client_externe():
    block = internal_client_block({"declared_internal_client_mode": "internal_service"}, "Acme")
    for role in ("commanditaire", "utilisateur", "entité juridique", "client final"):
        assert role in block.lower()
    assert "Acme" in block
    assert "client externe" in block.lower()  # pour l'INTERDIRE
    assert "déclaré" in block.lower()


def test_client_direct_declare_ne_range_pas_les_metiers_en_commanditaires_internes():
    block = internal_client_block({"declared_internal_client_mode": "external_buyer"}, "Acme")
    assert "externe" in block.lower()
    assert "commanditaires internes" in block.lower()


def test_le_prompt_du_chat_porte_la_declaration_et_reste_identique_sans():
    base = build_system_prompt(SAMPLE_PROFILE, {"company_name": "Acme"}, "", "")
    declared = build_system_prompt(
        SAMPLE_PROFILE,
        {"company_name": "Acme", "declared_internal_client_mode": "internal_service"},
        "",
        "",
    )
    assert "CLIENT INTERNE" not in base
    assert "CLIENT INTERNE" in declared
    assert (
        declared.replace(internal_client_block({"declared_internal_client_mode": "internal_service"}, "Acme"), "")
        == base
    )


def test_le_plan_recoit_la_declaration_nommant_le_compte_cible():
    """Rejeu : POST /phase/4/plan → prompt système capturé (appelant réel)."""
    from unittest.mock import AsyncMock, patch

    from fastapi.testclient import TestClient

    from app.main import app
    from tests.test_phase4_plan import _plan_dispatch

    body = {
        "account_id": "abc-123",
        "user_id": "11111111-1111-4111-8111-111111111111",
        "account_data": {
            "company_name": "Mairie de Lille",
            "sector": "Transport",
            "declared_internal_client_mode": "internal_service",
            "angles": [{"angle": "Modernisation SI"}],
        },
        "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
        "profile_data": {"companyName": "MonESN", "size": "50"},
    }
    with (
        patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, side_effect=_plan_dispatch()) as claude,
        patch("app.routers.phase4_plan.bellum_api.delivery_capacity", new_callable=AsyncMock, return_value=None),
    ):
        res = TestClient(app).post("/phase/4/plan", json=body)
    assert res.status_code == 200
    prompts = [str(c[0][0]) for c in claude.call_args_list]
    assert any("CLIENT INTERNE — Mairie de Lille" in p for p in prompts)


# ── #219.6 (J05) — les QUATRE rôles se NOMMENT quand le commercial les a déclarés ──


def test_les_roles_declares_sont_nommes_dans_le_bloc_en_clair():
    block = internal_client_block(
        {
            "declared_internal_client_mode": "internal_service",
            "declared_internal_sponsor": "Direction Digital France",
            "declared_internal_users": "Équipes agences",
            "declared_legal_entity": "SNCF Voyageurs",
            "declared_end_client": "Voyageurs",
        },
        "Acme",
    )
    for name in ("Direction Digital France", "Équipes agences", "SNCF Voyageurs", "Voyageurs"):
        assert name in block


def test_un_role_non_declare_ne_fait_aucune_ligne_jamais_un_nom_invente():
    block = internal_client_block(
        {"declared_internal_client_mode": "internal_service", "declared_internal_sponsor": "Direction Digital"},
        "Acme",
    )
    assert "Direction Digital" in block
    assert "Équipes" not in block
    assert "non renseign" not in block.lower()
    assert "None" not in block


def test_les_roles_sans_mode_interne_ne_disent_rien():
    assert internal_client_block({"declared_internal_sponsor": "Direction Digital"}, "Acme") == ""
    assert (
        "Direction Digital"
        not in internal_client_block(
            {"declared_internal_client_mode": "external_buyer", "declared_internal_sponsor": "Direction Digital"},
            "Acme",
        )
    )
