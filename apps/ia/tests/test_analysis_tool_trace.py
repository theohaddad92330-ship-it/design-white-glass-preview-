"""#2905 / #2442.16 — la trace des outils d'un run d'analyse est PERSISTÉE.

Avant ce lot, la répartition par fournisseur d'un run (`run_metrics.py`)
n'existait qu'en mémoire (perdue à chaque redémarrage du worker) et dans une
ligne de log. `record_analysis_tool_trace` lui donne une ligne durable par
fournisseur, préalable au rejeu d'un pipeline d'analyse (#2442.16).
"""

from __future__ import annotations

from app.services import analysis_tool_trace

CID = "cid-run-1"
ACCOUNT = "33333333-3333-4333-8333-333333333333"


class _Res:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table: str, inserts: list[tuple[str, dict]]):
        self._table = table
        self._inserts = inserts
        self._payload: dict | None = None

    def insert(self, payload: dict):
        self._payload = dict(payload)
        return self

    async def aexecute(self):
        self._inserts.append((self._table, self._payload))
        return _Res([{"id": "trace-row-1", **(self._payload or {})}])


class _Client:
    def __init__(self) -> None:
        self.inserts: list[tuple[str, dict]] = []

    def table(self, name):
        return _Query(name, self.inserts)


class _RaisingClient:
    def table(self, name):
        raise RuntimeError("supabase indisponible")


async def test_writes_one_row_per_provider():
    client = _Client()
    await analysis_tool_trace.record_analysis_tool_trace(
        CID,
        company_name="Bellum SA",
        account_id=ACCOUNT,
        provider_metrics={
            "brave": {"calls": 5, "errors": 0, "duration_ms": 1200, "wait_ms": 30, "cost_usd": 0.0},
            "firecrawl": {"calls": 3, "errors": 1, "duration_ms": 4500, "wait_ms": 900, "cost_usd": 0.02},
        },
        sb=client,
    )

    assert len(client.inserts) == 2
    tables = {table for table, _ in client.inserts}
    assert tables == {"analysis_tool_call_trace"}
    rows = {row["provider"]: row for _, row in client.inserts}
    assert rows["brave"]["calls"] == 5
    assert rows["brave"]["errors"] == 0
    assert rows["brave"]["account_id"] == ACCOUNT
    assert rows["brave"]["correlation_id"] == CID
    assert rows["brave"]["company_name"] == "Bellum SA"
    assert rows["firecrawl"]["errors"] == 1
    assert rows["firecrawl"]["cost_usd"] == 0.02


async def test_missing_account_id_writes_null_never_a_guess():
    client = _Client()
    await analysis_tool_trace.record_analysis_tool_trace(
        CID,
        company_name="Nouvelle entreprise",
        account_id=None,
        provider_metrics={"pappers": {"calls": 1, "errors": 0, "duration_ms": 200, "wait_ms": 0, "cost_usd": 0.1}},
        sb=client,
    )

    _, row = client.inserts[0]
    assert row["account_id"] is None


async def test_empty_metrics_writes_nothing():
    client = _Client()
    await analysis_tool_trace.record_analysis_tool_trace(
        CID, company_name="Bellum SA", account_id=None, provider_metrics={}, sb=client
    )

    assert client.inserts == []


async def test_blank_correlation_id_writes_nothing():
    client = _Client()
    await analysis_tool_trace.record_analysis_tool_trace(
        "   ",
        company_name="Bellum SA",
        account_id=None,
        provider_metrics={"brave": {"calls": 1, "errors": 0, "duration_ms": 10, "wait_ms": 0, "cost_usd": 0.0}},
        sb=client,
    )

    assert client.inserts == []


async def test_a_write_failure_never_raises():
    # Fail-soft : un run d'analyse par ailleurs correct ne doit jamais planter
    # parce que la trace n'a pas pu s'écrire.
    await analysis_tool_trace.record_analysis_tool_trace(
        CID,
        company_name="Bellum SA",
        account_id=None,
        provider_metrics={"brave": {"calls": 1, "errors": 0, "duration_ms": 10, "wait_ms": 0, "cost_usd": 0.0}},
        sb=_RaisingClient(),
    )
