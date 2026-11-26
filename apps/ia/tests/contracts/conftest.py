"""Contract-suite wiring: auto-marking and the end-of-run verdict table.

Everything in this package hits the real network and (for some providers) costs
money, so the whole directory is marked ``upstream_contract`` automatically and
excluded from the default ``pytest`` run via ``pytest.ini``'s ``addopts``.
Run it explicitly with ``make contracts`` / ``pytest -m upstream_contract``.
"""

from __future__ import annotations

import pytest

from tests.contracts.harness import RECORDS, Verdict, summary_line, unwatched_notice

_ORDER = [
    Verdict.CONTRACT_BROKEN,
    Verdict.NOT_RUN,
    Verdict.CREDENTIALS_REJECTED,
    Verdict.UPSTREAM_OUTAGE,
    Verdict.OK,
]

_LABEL = {
    Verdict.CONTRACT_BROKEN: "CONTRACT BROKEN  (upstream API changed — fix the client)",
    Verdict.NOT_RUN: "NOT RUN          (no credential — contract UNVERIFIED, run stays neutral)",
    Verdict.CREDENTIALS_REJECTED: "CREDS REJECTED   (quota/plan/key — NOT a contract break)",
    Verdict.UPSTREAM_OUTAGE: "UPSTREAM OUTAGE  (provider hiccup — no action needed)",
    Verdict.OK: "OK               (contract verified live)",
}

#: Lifted verbatim into the GitHub job summary. Grepping a fixed token beats
#: parsing a table whose columns move the day someone renames a label.
_COUNTS_TOKEN = "CONTRACT COUNTS:"
_NOTICE_TOKEN = "CONTRACT NOTICE:"
#: The table's terminator. The block used to be delimited by its own ``===``
#: rule, so ``sed`` closed the range on the line right BELOW the title and the
#: job summary showed two lines and no verdicts at all.
_END_MARKER = "END OF CONTRACT VERDICTS"


def pytest_collection_modifyitems(items):
    """Every test in this package is a live upstream contract test."""
    for item in items:
        if "tests/contracts/" in str(item.fspath).replace("\\", "/"):
            item.add_marker(pytest.mark.upstream_contract)


def pytest_terminal_summary(terminalreporter):
    """Render the per-provider verdict table, then the counts.

    Two readers, two needs. Someone opening a red build wants to tell, in one
    glance, whether an API changed or a key merely ran dry — that is the table.
    Someone glancing at a GREEN build wants to know how much of the bench was
    actually verified — that is the count line, and since D25 made ``NOT_RUN``
    neutral it is the line that stops a green from meaning "all clear".
    """
    if not RECORDS:
        return

    write = terminalreporter.write_line
    write("")
    write("=" * 78)
    write("UPSTREAM CONTRACT VERDICTS")
    write("=" * 78)

    for verdict in _ORDER:
        rows = [r for r in RECORDS if r.verdict is verdict]
        if not rows:
            continue
        write("")
        write(f"  {_LABEL[verdict]}")
        for r in rows:
            detail = f" — {r.detail}" if r.detail else ""
            write(f"    · {r.provider:<22} {r.endpoint}{detail}")

    write("")
    write(f"  {_COUNTS_TOKEN} {summary_line(RECORDS)}")
    notice = unwatched_notice(RECORDS)
    if notice:
        write(f"  {_NOTICE_TOKEN} {notice}")
    write(f"{'=' * 27} {_END_MARKER} {'=' * 26}")
