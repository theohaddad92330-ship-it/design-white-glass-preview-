"""#2877 (#2385.5, niveau GLOBAL) — ce que les messages ont appris à Laura dans TOUS les espaces.

Décision Louis 11/10/2026 : « sers-toi d'un max de data possible et juste anonymise
au besoin ». Les signaux d'apprentissage des messages, mutualisés par l'API dans
`shared_message_learning_aggregates` (k >= 3 espaces, un jeton par signal, aucun
identifiant d'espace, jamais le corps d'un message), sont lus à la génération de
CHAQUE message et deviennent des vigilances de rédaction.

Contrat : base commune vide ou illisible → ``""`` — le prompt est celui d'avant,
à l'octet près.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.services.shared_message_learning import (
    SHARED_LEARNING_MIN_COUNT,
    fetch_shared_message_learning,
    shared_message_learning_block,
)


def _row(signal: str, count: int, workspaces: int = 3) -> dict:
    return {"signal": signal, "count": count, "contributing_workspaces": workspaces}


def test_base_commune_vide_le_bloc_est_vide() -> None:
    assert shared_message_learning_block([]) == ""
    assert shared_message_learning_block(None) == ""


def test_les_signalements_declares_deviennent_des_vigilances_comptees() -> None:
    block = shared_message_learning_block(
        [_row("wrong_fact", 7, 4), _row("wrong_cta", 5), _row("wrong_persona", SHARED_LEARNING_MIN_COUNT)]
    )
    low = block.lower()
    assert "base commune" in low
    assert "7" in block and "faux fait" in low
    assert "appel à l'action" in low
    assert "destinataire" in low
    # Des comptes, jamais un taux ni une probabilité.
    assert "%" not in block
    assert "probab" not in low


def test_les_retouches_majoritaires_deviennent_une_consigne_de_premier_jet() -> None:
    block = shared_message_learning_block([_row("approved_after_edit", 12), _row("approved_without_edit", 5)])
    assert "12" in block and "5" in block
    assert "retouch" in block.lower()


def test_sait_dire_non_sous_le_seuil_ou_sous_trois_espaces_rien_ne_sort() -> None:
    assert shared_message_learning_block([_row("wrong_fact", SHARED_LEARNING_MIN_COUNT - 1)]) == ""
    assert shared_message_learning_block([_row("wrong_fact", 40, workspaces=2)]) == ""
    # Validés tels quels plus souvent que retouchés : rien à corriger, aucune consigne.
    assert shared_message_learning_block([_row("approved_after_edit", 5), _row("approved_without_edit", 9)]) == ""


def test_sait_dire_non_un_signal_hors_vocabulaire_ne_sort_jamais() -> None:
    assert shared_message_learning_block([_row("Bonjour Claire, suite à notre échange", 50)]) == ""


def _fake_sb(is_demo: bool) -> tuple[MagicMock, MagicMock]:
    cells = MagicMock()
    cells.select.return_value = cells
    cells.eq.return_value = cells
    cells.gte.return_value = cells
    cells.aexecute = AsyncMock(return_value=MagicMock(data=[_row("wrong_fact", 6)]))
    workspaces = MagicMock()
    workspaces.select.return_value = workspaces
    workspaces.eq.return_value = workspaces
    workspaces.limit.return_value = workspaces
    workspaces.aexecute = AsyncMock(return_value=MagicMock(data=[{"is_demo": is_demo}]))
    sb = MagicMock()
    sb.table.side_effect = lambda name: cells if name == "shared_message_learning_aggregates" else workspaces
    return sb, cells


async def test_un_espace_reel_lit_la_base_commune_reelle_au_seuil_et_la_lecture_ne_leve_jamais() -> None:
    sb, cells = _fake_sb(is_demo=False)
    with patch("app.services.shared_message_learning.resolve_workspace_id", new=AsyncMock(return_value="ws-1")):
        rows = await fetch_shared_message_learning(sb, "u1")
    cells.eq.assert_called_once_with("scope", "live")
    cells.gte.assert_called_once_with("contributing_workspaces", 3)
    assert rows == [_row("wrong_fact", 6)]

    broken = MagicMock()
    broken.table.side_effect = RuntimeError("panne")
    with patch("app.services.shared_message_learning.resolve_workspace_id", new=AsyncMock(return_value="ws-1")):
        assert await fetch_shared_message_learning(broken, "u1") == []


async def test_la_salle_de_demo_lit_ses_propres_cellules_jamais_le_reel() -> None:
    sb, cells = _fake_sb(is_demo=True)
    with patch("app.services.shared_message_learning.resolve_workspace_id", new=AsyncMock(return_value="ws-demo")):
        await fetch_shared_message_learning(sb, "u-demo")
    cells.eq.assert_called_once_with("scope", "demo")


def test_le_routeur_porte_la_vigilance_commune_au_redacteur_jamais_comme_preuve(client: TestClient) -> None:
    captured: dict = {}
    contact = {"full_name": "Olivier Martin", "title": "CTO", "account_id": "acc-1"}

    async def fake_claude(system_prompt, user_prompt, **_kwargs):
        captured["system_prompt"] = system_prompt
        return {"subject": "Suite", "body": "Bonjour Olivier, un mot sur l'audit SRE."}, None

    with (
        patch("app.routers.message.get_supabase", return_value=MagicMock()),
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=contact),
        patch(
            "app.routers.message.fetch_owned_account",
            new_callable=AsyncMock,
            return_value={"company_name": "BNP Paribas", "raw_analysis": {}},
        ),
        patch("app.routers.message.fetch_last_loss", new_callable=AsyncMock, return_value=None),
        patch(
            "app.routers.message.fetch_shared_message_learning",
            new_callable=AsyncMock,
            return_value=[_row("wrong_fact", 9, 5)],
        ),
        patch("app.routers.message.call_claude", side_effect=fake_claude),
    ):
        res = client.post(
            "/message/generate",
            json={
                "contact_id": "c1",
                "user_id": "u1",
                "channel": "email",
                "context": "audit SRE",
                "profile_data": {"companyName": "Acme"},
            },
        )
    assert res.status_code == 200, res.text
    assert "base commune" in captured["system_prompt"].lower()
    assert "9" in captured["system_prompt"]
