"""Router tests for ``/weekly/briefing`` — the seller-context source switch.

Proves the briefing resolves its ESN profile from the unified
``resolve_seller_context`` (esn_profiles) when nothing is forwarded, and uses a
forwarded ``profile_data`` verbatim otherwise — never the legacy ``profiles``
table.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

_RESOLVED = {"companyName": "DataForge", "size": "12"}


class _FakeQuery:
    """Chainable no-op query returning a canned row list for a table."""

    def __init__(self, rows: list) -> None:
        self._rows = rows

    def __getattr__(self, _name):
        # select / eq / order / limit / lte / gte … all chain and return self.
        def _chain(*_a, **_k):
            return self

        return _chain

    async def aexecute(self):
        return SimpleNamespace(data=self._rows)


class _FakeSupabase:
    """Returns empty result sets for accounts / action_plans / user_actions."""

    def table(self, _name):
        return _FakeQuery([])


def _patches(resolved: dict | None = None):
    return (
        patch("app.routers.weekly.get_supabase", return_value=_FakeSupabase()),
        patch(
            "app.routers.weekly.resolve_seller_context",
            new_callable=AsyncMock,
            return_value=(resolved if resolved is not None else {}),
        ),
        patch(
            "app.routers.weekly.call_claude",
            new_callable=AsyncMock,
            return_value=({"greeting": "Bonjour", "top_5_actions": []}, None),
        ),
    )


def test_weekly_resolves_seller_context_when_no_profile_forwarded(client: TestClient) -> None:
    p1, p2, p3 = _patches(resolved=_RESOLVED)
    with p1, p2 as m_resolve, p3:
        res = client.post("/weekly/briefing", json={"user_id": "u1"})
    assert res.status_code == 200
    m_resolve.assert_awaited_once()
    assert m_resolve.await_args.args[1] == "u1"


def test_weekly_uses_forwarded_profile_and_skips_resolve(client: TestClient) -> None:
    p1, p2, p3 = _patches()
    with p1, p2 as m_resolve, p3 as m_claude:
        res = client.post(
            "/weekly/briefing",
            json={"user_id": "u1", "profile_data": {"companyName": "CloudScale", "size": "220"}},
        )
    assert res.status_code == 200
    m_resolve.assert_not_awaited()
    # Forwarded profile personalises the system prompt (esn_name from companyName).
    system_prompt = m_claude.await_args.args[0]
    assert "CloudScale" in system_prompt


# --------------------------------------------------------------------------- #
#  Data-layer wiring: the briefing reads the LIVE schema (action_plan_items /  #
#  real user_actions action_type values), not the legacy action_plans.deadline #
#  column or the never-written "analysis_done" bucket.                         #
# --------------------------------------------------------------------------- #

from datetime import date, timedelta  # noqa: E402


class _SchemaQuery:
    """Chainable query that returns the canned rows for one table."""

    def __init__(self, rows: list) -> None:
        self._rows = rows

    def __getattr__(self, _name):
        def _chain(*_a, **_k):
            return self

        return _chain

    async def aexecute(self):
        return SimpleNamespace(data=self._rows)


class _SchemaSupabase:
    def __init__(self, store: dict) -> None:
        self._store = store

    def table(self, name: str) -> _SchemaQuery:
        return _SchemaQuery(self._store.get(name, []))


def _schema_store() -> dict:
    today = date.today()
    yesterday = (today - timedelta(days=1)).isoformat()
    in_three = (today + timedelta(days=3)).isoformat()
    return {
        "accounts": [
            {"id": "a1", "company_name": "BNP Paribas", "priority_score": 90, "status": "completed"},
        ],
        "action_plan_items": [
            {"label": "Relancer le DSI", "due_date": yesterday, "account_id": "a1", "done": False},
            {"label": "Envoyer le case study", "due_date": in_three, "account_id": "a2", "done": False},
            {"label": "Déjà fait", "due_date": yesterday, "account_id": "a1", "done": True},
        ],
        "user_actions": [
            # Expédié par Bellum (preuve de livraison).
            {"action_type": "message_sent", "metadata": {"via": "bellum"}},
            # Déclaré par le commercial sur LinkedIn (invérifiable).
            {"action_type": "plan_action_message_sent", "metadata": {"via": "declaration", "declared": True}},
            {"action_type": "analysis_completed", "metadata": {}},
            {"action_type": "response_received", "metadata": {}},
            {"action_type": "profile_generated", "metadata": {}},
        ],
    }


def test_weekly_pending_actions_from_action_plan_items(client: TestClient) -> None:
    with (
        patch("app.routers.weekly.get_supabase", return_value=_SchemaSupabase(_schema_store())),
        patch("app.routers.weekly.build_user_prompt", return_value="PROMPT") as build_prompt,
        patch(
            "app.routers.weekly.call_claude",
            new_callable=AsyncMock,
            return_value=({"greeting": "Bonjour"}, None),
        ),
    ):
        res = client.post(
            "/weekly/briefing",
            json={"user_id": "u1", "profile_data": {"esn_name": "Acme"}},
        )

    assert res.status_code == 200
    pending = build_prompt.call_args.kwargs["pending_actions"]
    # Done item filtered out; two open items remain.
    assert len(pending) == 2
    overdue = [p for p in pending if p["overdue"]]
    assert len(overdue) == 1
    assert overdue[0]["action"] == "Relancer le DSI"
    # Company resolved from the accounts already fetched (no extra query)…
    assert overdue[0]["company"] == "BNP Paribas"
    # …and unknown accounts stay None rather than being invented.
    upcoming = [p for p in pending if not p["overdue"]]
    assert upcoming[0]["company"] is None


def test_weekly_stats_count_real_action_types(client: TestClient) -> None:
    with (
        patch("app.routers.weekly.get_supabase", return_value=_SchemaSupabase(_schema_store())),
        patch("app.routers.weekly.build_user_prompt", return_value="PROMPT") as build_prompt,
        patch(
            "app.routers.weekly.call_claude",
            new_callable=AsyncMock,
            return_value=({"greeting": "Bonjour"}, None),
        ),
    ):
        res = client.post(
            "/weekly/briefing",
            json={"user_id": "u1", "profile_data": {"esn_name": "Acme"}},
        )

    assert res.status_code == 200
    stats = build_prompt.call_args.kwargs["weekly_stats"]
    assert stats["messages_sent"] == 2  # message_sent + plan_action_message_sent
    assert stats["responses"] == 1  # response_received
    assert stats["analyses_done"] == 1  # analysis_completed (legacy "analysis_done" was always 0)
    assert stats["total_actions"] == 5
    # Le briefing reçoit la décomposition : il ne doit pas présenter un envoi
    # seulement déclaré comme une livraison confirmée.
    assert stats["messages_sent_breakdown"] == {
        "verified": 1,
        "declared": 1,
        "unattributed": 0,
        "total": 2,
    }


def test_weekly_stats_never_mark_provenance_less_history_as_verified() -> None:
    """Les lignes antérieures au marquage `metadata.via` ne prouvent rien.

    Elles restent comptées dans le total (le travail a eu lieu) mais tombent en
    « unattributed » : dans le doute, jamais « verified ».
    """
    from app.routers.weekly import _breakdown_message_sends

    rows = [
        {"action_type": "message_sent"},  # metadata absente (historique)
        {"action_type": "message_sent", "metadata": None},
        {"action_type": "plan_action_message_sent", "metadata": {}},
        {"action_type": "message_copied", "metadata": {"via": "bellum"}},  # pas un envoi
    ]
    assert _breakdown_message_sends(rows) == {
        "verified": 0,
        "declared": 0,
        "unattributed": 3,
        "total": 3,
    }


def test_weekly_stats_declaration_never_promoted_to_verified() -> None:
    """Une déclaration reste une déclaration, quel que soit l'action_type."""
    from app.routers.weekly import _breakdown_message_sends

    rows = [
        {"action_type": "message_sent", "metadata": {"via": "declaration"}},
        {"action_type": "message_sent", "metadata": {"via": "bellum", "declared": True}},
        # Aucun chemin d'écriture ne produit ceci : non prouvable, donc non vérifié.
        {"action_type": "plan_action_message_sent", "metadata": {"via": "bellum"}},
    ]
    assert _breakdown_message_sends(rows) == {
        "verified": 0,
        "declared": 2,
        "unattributed": 1,
        "total": 3,
    }
