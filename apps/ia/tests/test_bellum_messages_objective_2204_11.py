"""#2947 (#2204.11, lot M09) — l'objectif SÉLECTIONNABLE côté BATCH.

Le composer mono-contact choisit déjà son objectif (14 codes, ``MESSAGE_OBJECTIVES``).
Les messages prêts à envoyer du dossier (``bellum_messages``) restaient une
séquence M1-M2-M3 d'OUVERTURE fixe. L'objectif choisi dans « Changer de
stratégie » rejoue désormais les trois temps pour CET objectif, à partir de la
même table — aucune seconde définition. Sans objectif : prompt byte-identique."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.plan import StrategyScope
from app.prompts import bellum_messages
from app.services.message_brief import MESSAGE_OBJECTIVES

CONTACTS = [{"fullName": "Claire Dubois", "title": "DSI", "hierarchyLevel": "c_level"}]


def test_sans_objectif_le_bloc_est_vide_et_le_prompt_byte_identique() -> None:
    assert bellum_messages.message_objective_block(None) == ""
    assert bellum_messages.message_objective_block("") == ""
    base = bellum_messages.build_user_prompt("ACME", "ctx", CONTACTS)
    assert bellum_messages.build_user_prompt("ACME", "ctx", CONTACTS, objective_block="") == base


def test_un_objectif_inconnu_ne_fait_aucun_bloc_et_est_refuse_par_le_modele() -> None:
    assert bellum_messages.message_objective_block("vendre_a_tout_prix") == ""
    with pytest.raises(ValidationError):
        StrategyScope(objective="vendre_a_tout_prix")


@pytest.mark.parametrize("objective", sorted(MESSAGE_OBJECTIVES))
def test_chaque_objectif_rejoue_m1_m2_m3_avec_sa_propre_regle(objective: str) -> None:
    block = bellum_messages.message_objective_block(objective)
    entry = MESSAGE_OBJECTIVES[objective]
    # La règle vient de la table du composer, à l'octet : aucune seconde définition.
    assert entry["rules"] in block
    assert entry["label"] in block
    for step in ("- M1 :", "- M2 :", "- M3 :"):
        assert step in block


def test_deux_objectifs_produisent_deux_prompts_differents() -> None:
    a = bellum_messages.build_user_prompt(
        "ACME", "ctx", CONTACTS, objective_block=bellum_messages.message_objective_block("nurturing")
    )
    b = bellum_messages.build_user_prompt(
        "ACME", "ctx", CONTACTS, objective_block=bellum_messages.message_objective_block("introduction")
    )
    assert a != b
    assert "OBJECTIF CHOISI PAR L'UTILISATEUR" in a


def test_un_objectif_sans_demande_retire_les_15_minutes_du_m3() -> None:
    nurturing = bellum_messages.message_objective_block("nurturing")
    assert "aucune proposition de rendez-vous" in nurturing
    ouverture = bellum_messages.message_objective_block("ouverture_compte")
    assert "aucune proposition de rendez-vous" not in ouverture


def test_une_premisse_contredite_par_la_relation_est_nommee() -> None:
    # « ouvrir le compte » adressé à un client actif : l'objectif reste celui
    # choisi (une correction humaine gagne), mais la contradiction est NOMMÉE.
    block = bellum_messages.message_objective_block("ouverture_compte", relationship_state="client_actif")
    assert "ne correspond pas à la relation mesurée" in block
    assert "ne correspond pas" not in bellum_messages.message_objective_block("ouverture_compte")


def test_la_route_phase4_porte_lobjectif_choisi_aux_messages_batch() -> None:
    """Bout en bout : `strategy_scope.objective` → prompt du VRAI appel messages."""
    from unittest.mock import AsyncMock, patch

    from fastapi.testclient import TestClient

    from app.main import app
    from tests.test_phase4_plan import _plan_dispatch

    client = TestClient(app)
    body = {
        "account_id": "abc-123",
        "account_data": {"sector": "Transport", "sources": {"tags": {}}},
        "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
        "profile_data": {"companyName": "MonESN"},
    }

    def _messages_prompt(extra: dict) -> str:
        with patch(
            "app.routers.phase4_plan.call_claude", new_callable=AsyncMock, side_effect=_plan_dispatch()
        ) as mock_claude:
            res = client.post("/phase/4/plan", json={**body, **extra})
            assert res.status_code == 200
            call = next(c for c in mock_claude.call_args_list if c.kwargs.get("prompt_name") == "bellum_messages")
            return call[0][1]

    avec = _messages_prompt({"strategy_scope": {"objective": "partenariat"}})
    assert "OBJECTIF CHOISI PAR L'UTILISATEUR" in avec
    assert MESSAGE_OBJECTIVES["partenariat"]["rules"] in avec
    assert "OBJECTIF CHOISI PAR L'UTILISATEUR" not in _messages_prompt({})
