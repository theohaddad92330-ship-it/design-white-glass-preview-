"""Upstream contract-test harness — classification, retry, and reporting.

WHY THIS EXISTS
---------------
Every provider client in ``app/services`` swallows exceptions into an empty
result (``[]`` / ``None``). That is the right call in production — a free
registry must never break an analysis — but it means **a provider changing its
contract is indistinguishable from "no results"**. Nothing goes red. The break
surfaces weeks later as a user-visible "research failed".

These tests close that gap: they call the REAL provider, with the REAL
parameters production sends (imported from the production modules, never
retyped), and assert the exact response fields the production parsers read.

THE FOUR VERDICTS
-----------------
The whole design turns on refusing to collapse distinct failures into one
signal — that collapse is what caused the incident this suite exists to catch.

=========================  ======  ==========================================
Verdict                    pytest  Meaning
=========================  ======  ==========================================
``OK``                     pass    Contract verified against the live API.
``CONTRACT_BROKEN``        FAIL    The provider changed its API. Act now.
``NOT_RUN``                skip    No credential — the contract was NOT
                                   verified. NEUTRAL, and counted: neither a
                                   pass (that would be a lie) nor a failure
                                   (see D25 below).
``CREDENTIALS_REJECTED``   FAIL    Key present but refused (401/402/403) —
                                   quota exhausted, plan downgrade, revoked
                                   key. An ops problem, NOT a contract break.
``UPSTREAM_OUTAGE``        xfail   5xx / timeout / 429 that survived retries.
                                   The provider is having a bad day. Reported,
                                   never red — we don't cry wolf at a hiccup.
=========================  ======  ==========================================

``CREDENTIALS_REJECTED`` and ``CONTRACT_BROKEN`` are red, and they are red for
opposite reasons — each says so in its headline. Neither is ever reported as
the other.

WHY ``NOT_RUN`` STOPPED BEING RED — D25, 28/08/2026
---------------------------------------------------
It used to ``pytest.fail``, on the reasoning that "no key" and "API verified"
must never look alike. The reasoning holds. The consequence did not: this repo
carries ONE provider secret, so twelve of the eighteen contracts went red every
single day from the day the workflow was written. **A permanent daily red does
not signal anything** — it is the worst kind of red, the kind people learn to
scroll past, and the day a genuine ``CONTRACT_BROKEN`` lands it lands inside a
job that has been red for three weeks.

So the two cases are now told apart instead of collapsed:

* **no credential** → neutral ``NOT_RUN``, still recorded, still named, never
  reported as a verification;
* **credential present but refused, or contract broken** → red, unchanged.

The counterpart is NOT optional: a neutral state that does not say **how many**
contracts are unwatched would trade a useless red for a lying green. That is
what :func:`summary_line` and :func:`unwatched_notice` exist for, and why they
are unit-tested in ``tests/test_upstream_contract_verdicts.py`` rather than
merely printed.
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import httpx
import pytest

logger = logging.getLogger(__name__)


# ── Retry policy ──────────────────────────────────────────────────────────────
# A contract break is deterministic: a removed parameter 400s every single time.
# A hiccup is not. Retrying twice is enough to tell them apart without turning a
# 10-provider suite into a slow one.
_MAX_ATTEMPTS = 3
_BACKOFF_S = (0.5, 1.5)

_TRANSIENT_STATUSES = frozenset({408, 425, 429, 500, 502, 503, 504, 522, 524})
# 401 unauthorized / 402 payment required / 403 forbidden. All mean "your key
# was understood and refused" — the API contract itself is untouched.
_CREDENTIAL_STATUSES = frozenset({401, 402, 403})

# Some providers signal a RATE LIMIT with 403 rather than 429 (GitHub does this
# for the anonymous quota). That is transient — it clears on its own within the
# hour — so it must not be reported next to "your Pappers credits ran out",
# which needs a human to go buy more. Same status code, opposite response.
_RATE_LIMIT_BODY_MARKERS = (
    "rate limit exceeded",
    "secondary rate limit",
    "too many requests",
    "api rate limit",
)


def _is_rate_limited(resp: httpx.Response) -> bool:
    if resp.headers.get("x-ratelimit-remaining", "").strip() == "0":
        return True
    if resp.headers.get("retry-after"):
        return True
    body = (resp.text or "").lower()
    return any(marker in body for marker in _RATE_LIMIT_BODY_MARKERS)


class Verdict(str, Enum):
    OK = "OK"
    CONTRACT_BROKEN = "CONTRACT_BROKEN"
    NOT_RUN = "NOT_RUN"
    CREDENTIALS_REJECTED = "CREDENTIALS_REJECTED"
    UPSTREAM_OUTAGE = "UPSTREAM_OUTAGE"


@dataclass
class ContractRecord:
    provider: str
    endpoint: str
    verdict: Verdict
    detail: str = ""


# Populated as tests run; rendered by ``pytest_terminal_summary`` in conftest.
RECORDS: list[ContractRecord] = []


def _record(provider: str, endpoint: str, verdict: Verdict, detail: str = "") -> None:
    RECORDS.append(ContractRecord(provider, endpoint, verdict, detail))


# ── Terminal outcomes ─────────────────────────────────────────────────────────


def not_run(provider: str, endpoint: str, missing: str) -> None:
    """No credential → the contract was NOT verified. Neutral, never green.

    A skip, not a failure (D25 — see the module docstring). The reason is kept
    to ONE line on purpose: it is what ``pytest -rs`` prints in the short
    summary, and a multi-line reason gets clipped there. The long form of the
    argument belongs in the docstring, which nobody needs at 9am.

    It is not silent either. The record feeds the verdict table and the counts,
    so the run says how many contracts nobody is watching — which is the only
    thing that keeps this state from becoming a green that lies.
    """
    _record(provider, endpoint, Verdict.NOT_RUN, f"missing {missing}")
    pytest.skip(
        f"[NOT RUN — no credential] {provider} :: {endpoint} — missing {missing}. "
        f"Contract UNVERIFIED: not a pass, not a break. "
        f"Fix: export the key (see tools/dev.secret.sh) or set the CI secret."
    )


def credentials_rejected(provider: str, endpoint: str, status: int, body: str) -> None:
    """Key present but refused. An ops problem — NOT a contract break."""
    _record(provider, endpoint, Verdict.CREDENTIALS_REJECTED, f"HTTP {status}")
    hint = {
        401: "key invalid, revoked, or quota exhausted",
        402: "payment required — credits/quota exhausted",
        403: "key valid but plan does not allow this endpoint",
    }.get(status, "credential refused")
    pytest.fail(
        f"\n[CREDENTIALS REJECTED — NOT A CONTRACT BREAK] {provider} :: {endpoint}\n"
        f"  HTTP {status} — {hint}.\n"
        f"  Provider response: {_trim(body)}\n"
        f"  The API shape is UNVERIFIED, not broken. Do not change client code.\n"
        f"  Fix: top up / rotate the credential, then re-run.",
        pytrace=False,
    )


def upstream_outage(provider: str, endpoint: str, detail: str) -> None:
    """Transient provider failure that survived retries. Reported, not red."""
    _record(provider, endpoint, Verdict.UPSTREAM_OUTAGE, detail)
    logger.warning(
        "Upstream outage on %s :: %s after %d attempts — %s",
        provider,
        endpoint,
        _MAX_ATTEMPTS,
        detail,
    )
    pytest.xfail(
        f"[UPSTREAM OUTAGE — NOT A CONTRACT BREAK] {provider} :: {endpoint} — "
        f"{detail} (survived {_MAX_ATTEMPTS} attempts). Provider-side; no action "
        f"on our client."
    )


def contract_broken(
    provider: str,
    endpoint: str,
    *,
    what: str,
    expected: str,
    got: str,
    raw: str = "",
    request_detail: str = "",
) -> None:
    """The provider changed its contract. Red, with everything needed to act."""
    _record(provider, endpoint, Verdict.CONTRACT_BROKEN, what)
    lines = [
        f"\n[CONTRACT BROKEN] {provider} :: {endpoint}",
        f"  What changed : {what}",
        f"  Expected     : {expected}",
        f"  Got          : {got}",
    ]
    if request_detail:
        lines.append(f"  We sent      : {request_detail}")
    if raw:
        lines.append(f"  Raw response : {_trim(raw)}")
    lines.append(
        "  This is an upstream API change, not a network blip: transient failures "
        "(5xx, timeout, 429) are retried and reported separately as UPSTREAM_OUTAGE."
    )
    lines.append(
        "  Fix: update the client in apps/ia/app/services/ to match the new "
        "contract, then update this test."
    )
    pytest.fail("\n".join(lines), pytrace=False)


def ok(provider: str, endpoint: str, detail: str = "") -> None:
    _record(provider, endpoint, Verdict.OK, detail)


# ── Run-level counts — the counterpart of a neutral NOT_RUN ───────────────────
# These are not decoration. Since D25 a run where nothing could be verified is
# GREEN, and a green that does not say how many contracts went unwatched is a
# worse signal than the permanent red it replaced: nobody re-reads a green.
# The counts are therefore rendered at the end of every run and lifted into the
# GitHub job summary by .github/workflows/upstream-contracts.yml.


def verdict_counts(records: list[ContractRecord] | None = None) -> dict[Verdict, int]:
    """One count per verdict — all five, never two of them fused.

    ``NOT_RUN`` and ``CREDENTIALS_REJECTED`` used to be summed together under
    "unverified". They are both "we do not know", but only one of them has an
    owner and an action, so fusing them loses the distinction this whole suite
    was built to make.
    """
    rows = RECORDS if records is None else records
    return {verdict: sum(1 for r in rows if r.verdict is verdict) for verdict in Verdict}


def summary_line(records: list[ContractRecord] | None = None) -> str:
    """The one line someone reads before deciding whether to open the run."""
    rows = RECORDS if records is None else records
    if not rows:
        # An empty bench and an all-green bench must not read alike: "0 broken"
        # on zero contracts is true and useless.
        return "no contract was recorded — the suite did not reach a single provider"
    counts = verdict_counts(rows)
    return (
        f"{len(rows)} contracts · "
        f"{counts[Verdict.OK]} verified · "
        f"{counts[Verdict.NOT_RUN]} not run (no credential) · "
        f"{counts[Verdict.CONTRACT_BROKEN]} broken · "
        f"{counts[Verdict.CREDENTIALS_REJECTED]} credentials rejected · "
        f"{counts[Verdict.UPSTREAM_OUTAGE]} upstream outage"
    )


def unwatched_notice(records: list[ContractRecord] | None = None) -> str:
    """Names the providers nobody is watching, or says nothing at all.

    Empty when every contract was at least attempted — a warning that is always
    on is a warning nobody reads, which is the very failure D25 corrects.
    """
    rows = RECORDS if records is None else records
    unwatched = [r for r in rows if r.verdict is Verdict.NOT_RUN]
    if not unwatched:
        return ""
    # The COUNT is per contract and the NAMES are per provider: one provider can
    # own several endpoints, and "2 contracts, 1 provider" is the honest reading.
    providers = sorted({r.provider for r in unwatched})
    return (
        f"{len(unwatched)} contract(s) are NOT monitored — no credential is "
        f"configured for: {', '.join(providers)}. This run is not red because "
        f"nothing is BROKEN, not because everything is verified."
    )


# ── Credential gate ───────────────────────────────────────────────────────────


def require_env(provider: str, endpoint: str, *names: str) -> list[str]:
    """Return the env values, or terminate the test as NOT_RUN."""
    missing = [n for n in names if not (os.environ.get(n) or "").strip()]
    if missing:
        not_run(provider, endpoint, ", ".join(missing))
    return [os.environ[n] for n in names]


# ── Live request with transient-vs-contract classification ────────────────────


@dataclass
class Probe:
    """One verified live call: the parsed payload plus what we sent."""

    provider: str
    endpoint: str
    payload: Any
    status: int
    request_detail: str
    raw: str = field(default="", repr=False)


async def probe(
    *,
    provider: str,
    endpoint: str,
    method: str = "GET",
    url: str,
    request_detail: str,
    timeout: float = 30.0,
    **kwargs: Any,
) -> Probe:
    """Issue the real request, retrying only genuinely transient failures.

    ``request_detail`` is a human-readable echo of the parameters we sent — it
    lands in the failure message so whoever reads the red build at 9am knows
    which parameter to look at without re-deriving the call.
    """
    last: str = ""
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as http:
                resp = await http.request(method, url, **kwargs)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last = f"{type(exc).__name__}: {exc}"
            if attempt < _MAX_ATTEMPTS:
                await asyncio.sleep(_BACKOFF_S[attempt - 1])
                continue
            upstream_outage(provider, endpoint, last)

        # Rate limiting is checked BEFORE the credential branch: a provider that
        # rate-limits with 403 (GitHub, anonymous quota) would otherwise be
        # reported as a dead key every time the daily job runs twice.
        if resp.status_code in _TRANSIENT_STATUSES or (
            resp.status_code in _CREDENTIAL_STATUSES and _is_rate_limited(resp)
        ):
            last = f"HTTP {resp.status_code} (rate-limited/transient): {_trim(resp.text)}"
            if attempt < _MAX_ATTEMPTS:
                await asyncio.sleep(_BACKOFF_S[attempt - 1])
                continue
            upstream_outage(provider, endpoint, last)

        if resp.status_code in _CREDENTIAL_STATUSES:
            credentials_rejected(provider, endpoint, resp.status_code, resp.text)

        if not resp.is_success:
            # 400/404/422 on a request built from PRODUCTION parameters means the
            # provider stopped accepting what we send. That is the signature of
            # the `temperature` incident.
            contract_broken(
                provider,
                endpoint,
                what=f"request rejected with HTTP {resp.status_code}",
                expected="2xx for the parameters production sends",
                got=f"HTTP {resp.status_code}",
                raw=resp.text,
                request_detail=request_detail,
            )

        try:
            payload = resp.json()
        except ValueError as exc:
            contract_broken(
                provider,
                endpoint,
                what="response is no longer valid JSON",
                expected="a JSON body",
                got=f"{type(exc).__name__}: {exc}",
                raw=resp.text,
                request_detail=request_detail,
            )

        return Probe(
            provider=provider,
            endpoint=endpoint,
            payload=payload,
            status=resp.status_code,
            request_detail=request_detail,
            raw=resp.text,
        )

    raise AssertionError("unreachable")  # pragma: no cover


# ── Field assertions ──────────────────────────────────────────────────────────

_MISSING = object()


def dig(payload: Any, path: str) -> Any:
    """Walk a dotted path (``web.results.0.url``). Returns ``_MISSING`` if absent."""
    node = payload
    for part in path.split("."):
        if isinstance(node, list):
            if not part.isdigit() or int(part) >= len(node):
                return _MISSING
            node = node[int(part)]
        elif isinstance(node, dict):
            if part not in node:
                return _MISSING
            node = node[part]
        else:
            return _MISSING
    return node


def expect_field(p: Probe, path: str, types: type | tuple[type, ...], *, why: str) -> Any:
    """Assert a field the PRODUCTION PARSER reads still exists with its type.

    ``why`` names the production code that consumes it, so the failure message
    points at the file to fix rather than just the JSON path.
    """
    value = dig(p.payload, path)
    if value is _MISSING:
        contract_broken(
            p.provider,
            p.endpoint,
            what=f"response field `{path}` disappeared",
            expected=f"`{path}` present ({why})",
            got="field absent from the response",
            raw=p.raw,
            request_detail=p.request_detail,
        )
    if not isinstance(value, types):
        names = getattr(types, "__name__", None) or "/".join(t.__name__ for t in types)  # type: ignore[union-attr]
        contract_broken(
            p.provider,
            p.endpoint,
            what=f"response field `{path}` changed type",
            expected=f"`{path}` is {names} ({why})",
            got=f"{type(value).__name__} = {value!r}",
            raw=p.raw,
            request_detail=p.request_detail,
        )
    return value


def expect_nonempty(p: Probe, path: str, *, why: str) -> Any:
    """Assert a collection/string field is present AND non-degenerate."""
    value = expect_field(p, path, (list, dict, str), why=why)
    if not value:
        contract_broken(
            p.provider,
            p.endpoint,
            what=f"response field `{path}` is now always empty",
            expected=f"a non-empty `{path}` for a known-good query ({why})",
            got=f"empty {type(value).__name__}",
            raw=p.raw,
            request_detail=p.request_detail,
        )
    return value


def expect_parses(
    p: Probe, *, parser: str, result: Any, predicate: bool, expected: str
) -> None:
    """Assert the REAL production parser still produces a usable result.

    The wire assertions above catch a renamed field. This catches the subtler
    case: every field is still there, but the production parser no longer
    derives anything from them.
    """
    if not predicate:
        contract_broken(
            p.provider,
            p.endpoint,
            what=f"production parser `{parser}` no longer extracts usable data",
            expected=expected,
            got=f"{result!r}",
            raw=p.raw,
            request_detail=p.request_detail,
        )


def _trim(text: str, limit: int = 600) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[:limit] + " …[truncated]"
