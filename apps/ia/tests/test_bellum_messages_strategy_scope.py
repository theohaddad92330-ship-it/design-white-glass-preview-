"""#2947 (#2204.7/.11/.15, lot X53 puis lot R25) — la stratégie choisie par
l'utilisateur (« Changer de stratégie » : angle, mode d'entrée, périmètre,
contraintes de forme) atteint le prompt des messages batch M1-M2-M3. Avant,
elle ne menait que le plan : les messages prêts à envoyer étaient écrits sur
l'angle recommandé par le modèle.

Sans stratégie imposée, le prompt reste byte-identique."""

from __future__ import annotations

from app.models.plan import StrategyScope
from app.prompts import bellum_messages

CONTACTS = [{"fullName": "Claire Dubois", "title": "DSI", "hierarchyLevel": "c_level"}]


def test_sans_strategie_le_bloc_est_vide_et_le_prompt_byte_identique() -> None:
    assert bellum_messages.strategy_scope_message_block(None) == ""
    assert bellum_messages.strategy_scope_message_block(StrategyScope()) == ""
    base = bellum_messages.build_user_prompt("ACME", "ctx", CONTACTS)
    assert bellum_messages.build_user_prompt("ACME", "ctx", CONTACTS, scope_block="") == base


def test_le_bloc_nomme_langle_le_perimetre_et_le_mode_dentree() -> None:
    block = bellum_messages.strategy_scope_message_block(
        StrategyScope(angle="Cybersécurité SOC", entry_mode="bottom_up", focus_entity="Boursorama")
    )
    assert "STRATÉGIE CHOISIE PAR L'UTILISATEUR" in block
    assert "Cybersécurité SOC" in block
    assert "Boursorama" in block
    assert "bottom_up" in block
    # Le périmètre cadre le message, il n'invente aucun fait sur ce périmètre.
    assert "n'inventes rien" in block


def test_le_bloc_atteint_le_prompt_messages() -> None:
    block = bellum_messages.strategy_scope_message_block(StrategyScope(focus_entity="cyber"))
    prompt = bellum_messages.build_user_prompt("ACME", "ctx", CONTACTS, scope_block=block)
    assert "STRATÉGIE CHOISIE PAR L'UTILISATEUR" in prompt
    assert "cyber" in prompt


def test_un_champ_vide_ou_blanc_ne_fait_aucune_ligne() -> None:
    block = bellum_messages.strategy_scope_message_block(StrategyScope(angle="  ", focus_entity="Axa"))
    assert "Axa" in block
    assert "- Angle" not in block


def test_la_route_phase4_porte_la_strategie_choisie_aux_messages_batch() -> None:
    """Bout en bout (#2947/#2204.7) : une requête avec `strategy_scope` → le
    prompt du VRAI appel `bellum_messages` porte la stratégie ; sans elle, non."""
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

    avec = _messages_prompt({"strategy_scope": {"focus_entity": "Boursorama", "angle": "Cyber"}})
    assert "STRATÉGIE CHOISIE PAR L'UTILISATEUR" in avec
    assert "Boursorama" in avec
    assert "STRATÉGIE CHOISIE PAR L'UTILISATEUR" not in _messages_prompt({})


def test_le_bloc_nomme_les_contraintes_de_forme() -> None:
    """#2947 (#2204.15, lot R25) — même dialogue « changer de stratégie »,
    un champ en plus : les contraintes (longueur, mots à éviter) cadrent le
    message, elles n'écrivent jamais un corps elles-mêmes."""
    block = bellum_messages.strategy_scope_message_block(StrategyScope(constraints="Moins de 400 signes, pas d'emoji"))
    assert "Contraintes de forme" in block
    assert "Moins de 400 signes, pas d'emoji" in block


def test_un_champ_contraintes_vide_ou_blanc_ne_fait_aucune_ligne() -> None:
    block = bellum_messages.strategy_scope_message_block(StrategyScope(constraints="   ", focus_entity="Axa"))
    assert "Axa" in block
    assert "Contraintes de forme" not in block


def test_la_route_phase4_porte_les_contraintes_choisies_aux_messages_batch() -> None:
    """Bout en bout (#2947/#2204.15) : mêmes preuves que le test .7 ci-dessus,
    pour le champ contraintes."""
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

    avec = _messages_prompt({"strategy_scope": {"constraints": "Pas plus de deux phrases"}})
    assert "Contraintes de forme" in avec
    assert "Pas plus de deux phrases" in avec
    assert "Contraintes de forme" not in _messages_prompt({})


def test_la_route_phase4_porte_la_voie_dacces_aux_messages_batch() -> None:
    """#2947 (#2204.10, lot R25) — `evaluation.dossier_read.access_path`,
    déjà calculée à l'analyse et portée par `account_data`, atteint désormais
    le prompt des messages batch (comme elle atteint déjà le composer
    mono-contact, `test_outreach_access_path.py`). Lecture SYNCHRONE : les
    lots précédents la croyaient concurrente dans le `gather` de la phase4 —
    elle ne l'est pas, voir le commentaire de l'appelant."""
    from unittest.mock import AsyncMock, patch

    from fastapi.testclient import TestClient

    from app.main import app
    from tests.test_phase4_plan import _plan_dispatch

    client = TestClient(app)
    body = {
        "account_id": "abc-123",
        "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
        "profile_data": {"companyName": "MonESN"},
    }

    def _messages_prompt(account_data: dict) -> str:
        with patch(
            "app.routers.phase4_plan.call_claude", new_callable=AsyncMock, side_effect=_plan_dispatch()
        ) as mock_claude:
            res = client.post("/phase/4/plan", json={**body, "account_data": account_data})
            assert res.status_code == 200
            call = next(c for c in mock_claude.call_args_list if c.kwargs.get("prompt_name") == "bellum_messages")
            return call[0][1]

    avec = _messages_prompt(
        {
            "sector": "Transport",
            "sources": {"tags": {}},
            "evaluation": {"dossier_read": {"access_path": "Recommandation par un ancien collègue chez le client."}},
        }
    )
    assert "VOIE D'ACCÈS PROBABLE" in avec
    assert "Recommandation par un ancien collègue chez le client." in avec
    assert "VOIE D'ACCÈS PROBABLE" not in _messages_prompt({"sector": "Transport", "sources": {"tags": {}}})


def test_le_bloc_nomme_la_prudence_dun_contact_consultant_presente() -> None:
    """#2947 (#2204.35, lot R25) — « Consultant » n'a pas besoin d'une
    taxonomie parallèle : `declared_person_company_relation`, déjà classée
    pour le composer mono-contact, atteint désormais les messages BATCH,
    PAR contact (plusieurs contacts peuvent porter des relations
    différentes dans un même lot)."""
    contacts = [
        {"fullName": "Claire Dubois", "title": "DSI", "declaredPersonCompanyRelation": "consultant_presented"},
        {"fullName": "Marc Petit", "title": "DAF"},
    ]
    prompt = bellum_messages.build_user_prompt("ACME", "ctx", contacts)
    assert "RELATIONS DÉCLARÉES" in prompt
    assert "Claire Dubois" in prompt.split("RELATIONS DÉCLARÉES")[1].split("\n")[1]
    assert "ne l'affirme jamais comme un fait" in prompt
    # Marc Petit n'a aucune relation déclarée à risque : il ne doit jamais apparaître
    # dans le bloc de prudence, seulement dans la liste des contacts.
    assert "Marc Petit :" not in prompt


def test_sans_relation_declaree_a_risque_aucun_bloc() -> None:
    prompt = bellum_messages.build_user_prompt("ACME", "ctx", [{"fullName": "Marc Petit", "title": "DAF"}])
    assert "RELATIONS DÉCLARÉES" not in prompt


def test_la_route_phase4_porte_la_prudence_consultant_aux_messages_batch() -> None:
    """Bout en bout (#2947/#2204.35) : un contact `declaredPersonCompanyRelation`
    → le prompt du VRAI appel `bellum_messages` porte la prudence ; sans elle, non."""
    from unittest.mock import AsyncMock, patch

    from fastapi.testclient import TestClient

    from app.main import app
    from tests.test_phase4_plan import _plan_dispatch

    client = TestClient(app)
    body = {
        "account_id": "abc-123",
        "account_data": {"sector": "Transport", "sources": {"tags": {}}},
        "profile_data": {"companyName": "MonESN"},
    }

    def _messages_prompt(contacts: list[dict]) -> str:
        with patch(
            "app.routers.phase4_plan.call_claude", new_callable=AsyncMock, side_effect=_plan_dispatch()
        ) as mock_claude:
            res = client.post("/phase/4/plan", json={**body, "contacts": contacts})
            assert res.status_code == 200
            call = next(c for c in mock_claude.call_args_list if c.kwargs.get("prompt_name") == "bellum_messages")
            return call[0][1]

    avec = _messages_prompt(
        [{"fullName": "Jean Dupont", "title": "DSI", "declaredPersonCompanyRelation": "contractor_historical"}]
    )
    assert "RELATIONS DÉCLARÉES" in avec
    assert "Jean Dupont" in avec
    assert "RELATIONS DÉCLARÉES" not in _messages_prompt([{"fullName": "Jean Dupont", "title": "DSI"}])
