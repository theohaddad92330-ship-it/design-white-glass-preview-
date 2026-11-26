"""#2442.12 (épopée #2879, lot M10 09/10) — LE COÛT PAR OUTIL.

Les lots précédents cherchaient un chokepoint DANS `chat_tools.py` (des
dizaines d'outils, chacun son fournisseur) et n'en trouvaient pas. Il y en a
deux, en dessous, déjà partagés par tous :

* l'ENTRÉE — `_execute_one_tool` (`chat_orchestrator.py`), le seul chemin par
  lequel un outil de chat s'exécute pendant un tour ;
* la SORTIE — `cost_ledger.record`, où chaque appel fournisseur (modèle,
  recherche, scraping, enrichissement) se déclare déjà.

Le premier pose le nom de l'outil (`cost_ledger.bind_tool`), le second le lit :
chaque outil est instrumenté sans qu'aucun ne change. Ces tests tiennent
l'attribution — y compris quand trois outils tournent EN MÊME TEMPS — et la
forme d'avant pour tout ce qui ne vient pas d'un outil.
"""

from __future__ import annotations

import asyncio

import pytest

from app.services import chat_orchestrator, cost_ledger
from tests.test_chat_tool_round_concurrency import (  # noqa: F401 — fixtures autouse importées
    _install_client,
    _patch_env,
    _resp,
    _run_turn,
    _text,
    _throttle_passthrough,
    _tool_use,
    _usage,
)


def test_outside_a_tool_a_row_keeps_its_former_shape() -> None:
    """Un appel hors outil (la génération du tour elle-même, une phase
    d'analyse) n'a PAS de clé `tool` — jamais `null`, jamais un outil deviné."""
    with cost_ledger.bind_run("r"):
        cost_ledger.record("firecrawl", "scrape", units=2)
        rows = cost_ledger.snapshot()
    assert rows == [{"provider": "firecrawl", "operation": "scrape", "calls": 1, "units": 2, "cost_usd": None}]


def test_inside_a_tool_the_row_names_it_and_two_tools_never_merge() -> None:
    with cost_ledger.bind_run("r"):
        with cost_ledger.bind_tool("web_search"):
            cost_ledger.record("brave", "search", units=1, cost_usd=0.005)
        with cost_ledger.bind_tool("get_account_briefing"):
            cost_ledger.record("brave", "search", units=1, cost_usd=0.005)
        cost_ledger.record("brave", "search", units=1, cost_usd=0.005)
        rows = cost_ledger.snapshot()
    by_tool = {row.get("tool"): row for row in rows}
    assert set(by_tool) == {"web_search", "get_account_briefing", None}
    assert all(row["calls"] == 1 for row in rows)
    assert "tool" not in by_tool[None]


def test_a_malformed_tool_name_is_not_written() -> None:
    """La colonne SQL n'admet qu'un identifiant d'outil (`provider_costs_tool_check`) :
    un nom qui n'en a pas la forme n'est pas transmis — jamais une ligne refusée
    par la base qui ferait perdre TOUT le tour."""
    with cost_ledger.bind_run("r"):
        with cost_ledger.bind_tool("Web Search; DROP"):
            cost_ledger.record("brave", "search", units=1)
        rows = cost_ledger.snapshot()
    assert "tool" not in rows[0]


@pytest.mark.asyncio
async def test_every_tool_of_a_turn_is_attributed_even_when_they_run_together(monkeypatch) -> None:
    """Le chokepoint réel : trois outils PARALLÈLES qui déclarent chacun leur
    fournisseur ; chaque ligne porte le bon outil, aucune ne déborde sur l'autre."""
    _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [
                    _tool_use("get_account_briefing", {"account_id": "a"}, "t1"),
                    _tool_use("web_search", {"query": "b"}, "t2"),
                    _tool_use("get_account_briefing", {"account_id": "c"}, "t3"),
                ],
                usage=_usage(),
            ),
            _resp("end_turn", [_text("ok")], usage=_usage()),
        ],
    )

    async def _fake_tool(name, tool_input, **_kwargs):
        await asyncio.sleep(0.01)  # chevauchement réel
        provider = "brave" if name == "web_search" else "anthropic"
        cost_ledger.record(provider, f"op_{name}", units=1, cost_usd=0.01)
        return {"ok": True}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)
    with cost_ledger.bind_run("chat_turn"):
        reply, _actions = await _run_turn()
        rows = cost_ledger.snapshot()

    assert reply == "ok"
    tooled = {(row["provider"], row["operation"], row.get("tool")): row["calls"] for row in rows if "tool" in row}
    assert tooled == {
        ("anthropic", "op_get_account_briefing", "get_account_briefing"): 2,
        ("brave", "op_web_search", "web_search"): 1,
    }
