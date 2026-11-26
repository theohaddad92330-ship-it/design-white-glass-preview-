"""#3265.12 (épopée #3287) — après un résultat « réorienté », Laura LIT ce que
le commercial a déclaré et PROPOSE la suite sur la personne nommée.

Le nom du nouveau contact vit dans le `result` DÉCLARATIF de l'action complétée
(texte libre) : aucune extraction heuristique ici — l'outil rend le texte tel
quel, c'est Laura qui le lit. Trois propriétés :
 1. Seules les actions FAITES de CET utilisateur, avec l'issue `orientation_given`
    et un `result` non vide, remontent (une absence ne fait aucune ligne).
 2. L'outil est une LECTURE : aucun chemin d'écriture, jamais de création
    automatique — la consigne dit « propose, confirme avant ».
 3. Une lecture qui échoue DIT l'échec, jamais une liste vide qui se lirait
    « rien à suivre ».
"""

from __future__ import annotations

from unittest.mock import patch

from app.services import chat_tools
from app.services.ownership import fetch_orientation_actions

USER = "11111111-1111-4111-8111-111111111111"


class _Query:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows
        self._eq: dict[str, object] = {}
        self._max: int | None = None

    def select(self, _cols: str) -> "_Query":
        return self

    def eq(self, col: str, val: object) -> "_Query":
        self._eq[col] = val
        return self

    def order(self, _col: str, ascending: bool = True) -> "_Query":
        return self

    def limit(self, n: int) -> "_Query":
        self._max = n
        return self

    async def aexecute(self):
        matched = [r for r in self._rows if all(r.get(k) == v for k, v in self._eq.items())]
        return type("Res", (), {"data": matched[: self._max] if self._max else matched})()


class _Sb:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def table(self, _name: str) -> _Query:
        return _Query(self._rows)


def _row(**over: object) -> dict:
    base = {
        "id": "a-1",
        "user_id": USER,
        "contact_id": "c-1",
        "account_id": "acc-1",
        "execution_status": "done",
        "outcome": "orientation_given",
        "result": "Bernard n'est plus sur ce périmètre, il m'a orienté vers Delphine.",
        "completed_at": "2026-09-29T09:00:00Z",
    }
    base.update(over)
    return base


async def _run() -> dict:
    return await chat_tools.execute_chat_tool("get_orientations_to_follow", {}, user_id=USER, profile_data=None)


async def test_fetch_returns_only_this_users_done_orientations_with_a_declared_result() -> None:
    sb = _Sb(
        [
            _row(),
            _row(id="a-2", user_id="intruder"),
            _row(id="a-3", outcome="positive"),
            _row(id="a-4", execution_status="todo"),
            _row(id="a-5", result=None),
            _row(id="a-6", result="   "),
        ]
    )
    rows = await fetch_orientation_actions(sb, USER)
    assert [r["id"] for r in rows] == ["a-1"]


async def test_fetch_without_user_reads_nothing() -> None:
    assert await fetch_orientation_actions(_Sb([_row()]), "") == []


def test_tool_is_declared_and_appended() -> None:
    names = [t["name"] for t in chat_tools.CHAT_TOOLS]
    assert "get_orientations_to_follow" in names
    assert names.index("get_orientations_to_follow") > names.index("search_workspace_accounts")


async def test_tool_returns_what_was_declared_and_asks_confirmation_before_acting() -> None:
    async def _fake(_sb, _uid, limit=5):
        return [_row()]

    with patch("app.services.ownership.fetch_orientation_actions", _fake), patch(
        "app.services.supabase_client.get_supabase", lambda: object()
    ):
        result = await _run()
    assert result["orientations"][0]["declared_result"].startswith("Bernard")
    assert result["orientations"][0]["contact_id"] == "c-1"
    # Doctrine : le copilote prépare, le commercial confirme.
    assert "confirm" in result["instruction"].lower()
    assert "jamais" in result["instruction"].lower()


async def test_tool_with_nothing_to_follow_says_so() -> None:
    async def _fake(_sb, _uid, limit=5):
        return []

    with patch("app.services.ownership.fetch_orientation_actions", _fake), patch(
        "app.services.supabase_client.get_supabase", lambda: object()
    ):
        result = await _run()
    assert result["orientations"] == []
    assert "message" in result


async def test_tool_read_failure_is_an_error_never_an_empty_list() -> None:
    async def _boom(_sb, _uid, limit=5):
        raise RuntimeError("db down")

    with patch("app.services.ownership.fetch_orientation_actions", _boom), patch(
        "app.services.supabase_client.get_supabase", lambda: object()
    ):
        result = await _run()
    assert "error" in result
    assert "orientations" not in result
