from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import httpx

from app.services import langfuse_client

logger = logging.getLogger(__name__)


class SupabaseREST:
    """Lightweight Supabase REST client that works with both old (eyJ...) and new (sb_*) key formats."""

    def __init__(self, url: str, key: str) -> None:
        self.base_url = f"{url.rstrip('/')}/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        # One pooled client for the process instead of a fresh httpx.Client per
        # query: reuses keep-alive connections (no TCP+TLS handshake on every
        # call) and is safe to share across threads, so it also works under the
        # ``aexecute`` thread offload below.
        self._http = httpx.Client(timeout=15.0)

    def table(self, name: str) -> TableQuery:
        return TableQuery(self, name)

    def rpc(self, function_name: str, params: dict[str, Any] | None = None) -> TableQuery:
        """Call a Supabase RPC (PostgreSQL function) via POST."""
        query = TableQuery(self, f"rpc/{function_name}")
        query._method = "POST"
        query._body = params or {}
        return query


class TableQuery:
    """Chainable query builder mimicking supabase-py's API."""

    def __init__(self, client: SupabaseREST, table: str) -> None:
        self._client = client
        self._table = table
        self._method = "GET"
        self._params: dict[str, str] = {}
        self._body: Any = None
        self._headers: dict[str, str] = {}
        self._is_maybe_single = False

    def select(self, columns: str = "*") -> TableQuery:
        self._method = "GET"
        self._params["select"] = columns
        return self

    def insert(self, data: dict[str, Any]) -> TableQuery:
        self._method = "POST"
        self._body = data
        return self

    def update(self, data: dict[str, Any]) -> TableQuery:
        self._method = "PATCH"
        self._body = data
        return self

    def delete(self) -> TableQuery:
        self._method = "DELETE"
        return self

    def eq(self, column: str, value: Any) -> TableQuery:
        self._params[column] = f"eq.{value}"
        return self

    def neq(self, column: str, value: Any) -> TableQuery:
        self._params[column] = f"neq.{value}"
        return self

    def is_(self, column: str, value: Any) -> TableQuery:
        """``IS`` filter — PostgREST ``col=is.null``/``is.true``/``is.false``,
        distinct from ``eq`` (NULL/booleans don't compare with ``=``)."""
        self._params[column] = f"is.{value}"
        return self

    def not_is(self, column: str, value: Any) -> TableQuery:
        """``NOT IS`` filter — PostgREST ``col=not.is.null`` (lignes dont la colonne est renseignée)."""
        self._params[column] = f"not.is.{value}"
        return self

    def single(self) -> TableQuery:
        self._headers["Accept"] = "application/vnd.pgrst.object+json"
        return self

    def order(self, column: str, ascending: bool = True, nulls_last: bool = False) -> TableQuery:
        direction = "asc" if ascending else "desc"
        self._params["order"] = f"{column}.{direction}" + (".nullslast" if nulls_last else "")
        return self

    def limit(self, count: int) -> TableQuery:
        self._params["limit"] = str(count)
        return self

    def ilike(self, column: str, value: str) -> TableQuery:
        """Case-insensitive LIKE filter using PostgREST ilike syntax."""
        self._params[column] = f"ilike.{value}"
        return self

    def text_search(self, column: str, query: str, *, config: str = "french", type_: str = "websearch") -> TableQuery:
        """Full-text search on ``column`` via PostgREST FTS operators — real
        tokenized/stemmed matching (``to_tsvector @@ websearch_to_tsquery``),
        computed on the fly (no index/migration needed). ``websearch`` accepts
        raw user input safely (quotes/operators handled), unlike ``to_tsquery``."""
        op = {"websearch": "wfts", "plain": "plfts", "phrase": "phfts", "raw": "fts"}.get(type_, "wfts")
        self._params[column] = f"{op}({config}).{query}"
        return self

    def or_(self, expression: str) -> TableQuery:
        """Disjunctive filter — PostgREST ``?or=(a.eq.1,b.is.null)``.

        Needed by workspace-scoped retrieval, whose predicate is a disjunction
        (``workspace_id.eq.<ws>`` OR a legacy owner-private row) and therefore
        cannot be expressed with the conjunctive ``eq`` filters above. The
        expression is passed through verbatim, so callers build it from values
        they control (UUIDs resolved server-side), never from user input.
        """
        self._params["or"] = f"({expression})"
        return self

    def in_(self, column: str, values: list[Any]) -> TableQuery:
        """Filter rows where column value is in the given list."""
        joined = ",".join(str(v) for v in values)
        self._params[column] = f"in.({joined})"
        return self

    def contains(self, column: str, values: list[Any]) -> TableQuery:
        """Array column CONTAINS every given value — PostgREST ``cs.{a,b}`` (#4281.1)."""
        joined = ",".join(str(v) for v in values)
        self._params[column] = f"cs.{{{joined}}}"
        return self

    def gte(self, column: str, value: Any) -> TableQuery:
        """Filter rows where column >= value."""
        self._params[column] = f"gte.{value}"
        return self

    def lte(self, column: str, value: Any) -> TableQuery:
        """Filter rows where column <= value."""
        self._params[column] = f"lte.{value}"
        return self

    def lt(self, column: str, value: Any) -> TableQuery:
        """Filter rows where column < value."""
        self._params[column] = f"lt.{value}"
        return self

    def maybe_single(self) -> TableQuery:
        """Return a single row or None (no error if zero rows)."""
        self._headers["Accept"] = "application/vnd.pgrst.object+json"
        self._headers["Prefer"] = "return=representation"
        self._is_maybe_single = True
        return self

    def execute(self) -> QueryResult:
        # #2442.4 (épopée #2879) — span « connecteur/DB », distinct du span
        # `tool:<name>` qui l'englobe : ce point de sortie est le SEUL commun à
        # toute requête Supabase, quel que soit l'outil appelant. Hors trace de
        # tour liée, `langfuse_client.span` est un no-op (jobs async, tests).
        with langfuse_client.span("db"):
            url = f"{self._client.base_url}/{self._table}"
            headers = {**self._client.headers, **self._headers}
            client = self._client._http

            try:
                if self._method == "GET":
                    res = client.get(url, params=self._params, headers=headers)
                elif self._method == "POST":
                    res = client.post(url, params=self._params, headers=headers, json=self._body)
                elif self._method == "PATCH":
                    res = client.patch(url, params=self._params, headers=headers, json=self._body)
                elif self._method == "DELETE":
                    res = client.delete(url, params=self._params, headers=headers)
                else:
                    raise ValueError(f"Unknown method: {self._method}")

                if not res.is_success:
                    # maybe_single() with 0 rows returns 406 — treat as None, not error
                    if self._is_maybe_single and res.status_code == 406:
                        return QueryResult(data=None, error=None)
                    logger.error(
                        "Supabase %s %s/%s failed: %s %s", self._method, url, self._params, res.status_code, res.text[:200]
                    )
                    return QueryResult(data=None, error=res.text)

                data = res.json() if res.text else None
                return QueryResult(data=data, error=None)
            except Exception as exc:
                logger.error("Supabase request failed: %s", exc)
                return QueryResult(data=None, error=str(exc))

    async def aexecute(self) -> QueryResult:
        """Non-blocking variant for async handlers: offloads the blocking HTTP
        call to a worker thread so a Supabase round-trip never freezes the
        event loop. Uses the same pooled client (httpx.Client is thread-safe)."""
        return await asyncio.to_thread(self.execute)


class QueryResult:
    """Mimics supabase-py's response object."""

    def __init__(self, data: Any, error: Any) -> None:
        self.data = data
        self.error = error


_client: SupabaseREST | None = None


def get_supabase() -> SupabaseREST:
    """Get a cached Supabase REST client using service role key."""
    global _client
    if _client is not None:
        return _client

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    _client = SupabaseREST(url, key)
    return _client
