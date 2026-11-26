"""#4478 — les appelants du builder Supabase n'utilisent que l'API RÉELLE de `TableQuery`.

`fetch_last_loss` appelait `.filter(...)` et `.order(desc=True)`, absents de `TableQuery`
(AttributeError avalé → le motif de perte n'arrivait jamais au message). Les mocks en
chaîne acceptaient n'importe quoi : ici le vrai builder, sans réseau.
"""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Any

from app.routers.message import fetch_last_loss
from app.services.supabase_client import SupabaseREST, TableQuery

_APP = Path(__file__).resolve().parent.parent / "app"


class _Resp:
    is_success = True
    text = "[]"

    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def json(self) -> list[dict[str, Any]]:
        return self._rows


class _Http:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.params: dict[str, str] = {}

    def get(self, _url: str, params: dict[str, str], headers: dict[str, str]) -> _Resp:
        self.params = params
        return _Resp(self.rows)


def _client(rows: list[dict[str, Any]]) -> tuple[SupabaseREST, _Http]:
    sb = SupabaseREST("https://x.supabase.co", "key")
    http = _Http(rows)
    sb._http = http  # type: ignore[assignment]
    return sb, http


async def test_fetch_last_loss_tourne_sur_le_vrai_builder() -> None:
    sb, http = _client([{"loss_reason": "Budget gelé", "closed_at": "2026-05-01T10:00:00Z"}])
    assert await fetch_last_loss(sb, "acc-1") == {"reason": "Budget gelé", "closed_on": "2026-05-01"}
    assert http.params["loss_reason"] == "not.is.null"
    assert http.params["order"] == "closed_at.desc"
    assert http.params["stage"] == "eq.lost"


def test_not_is_filtre_postgrest() -> None:
    q = SupabaseREST("https://x.supabase.co", "key").table("projects").not_is("loss_reason", "null")
    assert q._params["loss_reason"] == "not.is.null"


def test_aucun_appelant_n_utilise_une_methode_absente_de_tablequery() -> None:
    """Jumeaux : `.order(..., desc=...)` et `.filter(...)` sur un builder de table."""
    interdits: list[str] = []
    for path in _APP.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
                continue
            if node.func.attr == "order" and any(k.arg == "desc" for k in node.keywords):
                interdits.append(f"{path.relative_to(_APP)}:{node.lineno} order(desc=)")
            if node.func.attr == "filter" and not hasattr(TableQuery, "filter"):
                owner = ast.unparse(node.func.value)
                if "table(" in owner or "aexecute" in owner:
                    interdits.append(f"{path.relative_to(_APP)}:{node.lineno} filter()")
    assert interdits == []
