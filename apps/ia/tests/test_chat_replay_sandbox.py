"""Tests de `app/services/chat_replay_sandbox.py` — #2445.6 (#2442.16, #2766).

Hermétique : aucun appel réseau, aucun modèle. La preuve structurelle centrale
(`test_the_module_never_imports_a_real_execution_path`) lit le SOURCE du
module — elle casserait au diff si quelqu'un y ajoutait un import vers un
pont ou un dispatcher réel, plutôt que de laisser la garantie devenir fausse
en silence.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from app.access.rights_matrix import SPENDING_TOOLS
from app.services.chat_replay_sandbox import (
    REPLAY_UNAVAILABLE,
    RecordedToolCall,
    ReplaySandboxExecutor,
    build_sandbox_snapshot,
    mask_tool_result,
)
from app.services.chat_tools import WRITE_TOOL_NAMES

_MODULE_PATH = Path(__file__).resolve().parents[1] / "app" / "services" / "chat_replay_sandbox.py"

#: Tout import qui donnerait accès à un chemin d'exécution RÉEL — pont HTTP,
#: dispatcher, client externe. Une correspondance PARTIELLE suffit (import
#: d'un sous-module), donc on teste des PRÉFIXES de module.
_FORBIDDEN_IMPORT_PREFIXES = (
    "app.services.tool_resilience",
    "app.services.chat_tools",
    "app.services.chat_orchestrator",
    "httpx",
    "requests",
    "aiohttp",
)


def test_the_module_never_imports_a_real_execution_path():
    """La garantie « sans écriture ni débit » est STRUCTURELLE : ce module ne
    doit importer AUCUN pont, dispatcher ou client HTTP."""
    tree = ast.parse(_MODULE_PATH.read_text(encoding="utf-8"))
    imported_modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_modules.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_modules.append(node.module)

    offenders = [m for m in imported_modules if any(m.startswith(prefix) for prefix in _FORBIDDEN_IMPORT_PREFIXES)]
    assert not offenders, f"le bac à sable importe un chemin d'exécution réel : {offenders}"


def test_the_guard_knows_how_to_say_no():
    """Preuve n°1 — elle sait dire NON : une liste fabriquée avec un import
    interdit doit être détectée par la même logique."""
    fake_source = "import app.services.chat_tools\n"
    tree = ast.parse(fake_source)
    imported = [n.names[0].name for n in ast.walk(tree) if isinstance(n, ast.Import)]
    assert any(m.startswith("app.services.chat_tools") for m in imported)


# ── l'exécuteur ne rend jamais qu'un snapshot déjà fourni ───────────────────


def test_a_recorded_tool_call_is_replayed_from_the_snapshot():
    snapshot = build_sandbox_snapshot((RecordedToolCall("get_pipeline", {"deals": 3}),))
    sandbox = ReplaySandboxExecutor(snapshot=snapshot)
    assert sandbox.execute("get_pipeline") == {"deals": 3}


def test_an_unrecorded_tool_call_is_never_invented():
    sandbox = ReplaySandboxExecutor(snapshot={})
    assert sandbox.execute("get_pipeline") == REPLAY_UNAVAILABLE


@pytest.mark.parametrize("outil", sorted(SPENDING_TOOLS | WRITE_TOOL_NAMES))
def test_every_write_or_spending_tool_replays_from_snapshot_never_for_real(outil):
    """Le point central de #2445.6 : rejouer un outil de dépense ou d'écriture
    ne débite ni n'écrit jamais — il ne rend QUE le snapshot, ou l'indisponible."""
    sandbox_avec = ReplaySandboxExecutor(snapshot={outil: {"status": "rejoué"}})
    assert sandbox_avec.execute(outil) == {"status": "rejoué"}

    sandbox_sans = ReplaySandboxExecutor(snapshot={})
    assert sandbox_sans.execute(outil) == REPLAY_UNAVAILABLE


def test_the_last_recorded_call_wins_when_a_tool_was_called_twice():
    snapshot = build_sandbox_snapshot(
        (
            RecordedToolCall("get_pipeline", {"deals": 3}),
            RecordedToolCall("get_pipeline", {"deals": 5}),
        )
    )
    assert snapshot["get_pipeline"] == {"deals": 5}


# ── masquage des secrets machine ─────────────────────────────────────────────


def test_mask_tool_result_redacts_a_machine_secret_in_a_string_leaf():
    masked = mask_tool_result("clé : sk-ant-abcdefgh12345678")
    assert "sk-ant-" not in masked
    assert "[valeur masquée]" in masked


def test_mask_tool_result_recurses_into_nested_structures():
    masked = mask_tool_result({"notes": ["ras", "jeton eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123def456"]})
    assert "eyJ" not in masked["notes"][1]


def test_mask_tool_result_leaves_non_secret_data_untouched():
    assert mask_tool_result({"deals": 3, "label": "Renouvellement Acme"}) == {"deals": 3, "label": "Renouvellement Acme"}


def test_to_json_never_raises_on_a_masked_snapshot():
    sandbox = ReplaySandboxExecutor(snapshot={"get_pipeline": {"deals": 3}})
    assert '"get_pipeline"' in sandbox.to_json()
