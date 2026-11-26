"""The suite's verdict must not depend on the developer's shell.

Before this file existed, ``pytest`` was green on a clean environment and ~210
tests deep in red the moment a developer ran ``source tools/dev.secret.sh``
first — the exact thing they must do to run the app. CI never saw it (the
``test-ia`` job runs keyless), so the failures looked like the developer's
machine being haunted.

That is not a cosmetic problem. The upstream-contract suite (#626) is built on
the premise that a red test *means* something; a suite that is routinely red for
an environmental reason trains everyone to ignore red, which is the same failure
mode that let a total production outage (``temperature`` rejected by Sonnet 5)
run for hours unnoticed.

These tests pin the invariant that makes the rest of the suite trustworthy:

1. no provider credential is visible to a unit test, so every env-gated source
   takes its documented no-op path — the contract the tests claim to check;
2. a unit test cannot open a non-local socket, so a missing stub surfaces as a
   loud error instead of a silent live API call;
3. the neutralisation list cannot silently fall behind the app — adding a new
   env-gated provider without registering it fails here.

The live-network suite (``tests/contracts/``, marker ``upstream_contract``) is
deliberately exempt from 1 and 2: real calls are its entire point.
"""

from __future__ import annotations

import os
import re
import socket
from pathlib import Path

import pytest

from tests import env_hermeticity as eh

_APP_DIR = Path(__file__).resolve().parent.parent / "app"


# ── 1. credentials are not visible ────────────────────────────────────────────


@pytest.mark.parametrize("var", sorted(eh.CREDENTIAL_VARS))
def test_no_provider_credential_is_visible_to_a_unit_test(var: str) -> None:
    """A unit test inherits no provider credential, whatever the shell holds.

    This is what makes "no key → no-op" assertions honest: they exercise the
    keyless path by construction rather than by luck.
    """
    assert not os.environ.get(var), (
        f"{var} leaked into the unit suite. The autouse fixture in "
        f"apps/ia/conftest.py should have cleared it."
    )


def test_tuning_knobs_fall_back_to_their_code_defaults() -> None:
    """Behaviour knobs a dev shell exports must not reach the suite either.

    ``FIRECRAWL_MAX_PAGES`` is the cautionary tale: a stale Railway override of
    ``3`` (see CLAUDE.md) silently shrinks collection depth, and a suite that
    inherited it would assert against the wrong default.
    """
    leaked = sorted(v for v in eh.TUNING_VARS if os.environ.get(v))
    assert not leaked, f"tuning vars leaked into the unit suite: {leaked}"


# ── 2. the network is out of reach ────────────────────────────────────────────


def test_outbound_network_is_blocked() -> None:
    """A unit test that forgets to stub a provider must fail loudly, not bill us."""
    with pytest.raises(eh.NetworkBlockedError):
        socket.create_connection(("api.anthropic.com", 443), timeout=1)


def test_dns_resolution_is_blocked() -> None:
    """Name resolution is a network call too — and a slow one when it hangs."""
    with pytest.raises(eh.NetworkBlockedError):
        socket.getaddrinfo("api.apollo.io", 443)


def test_ip_literals_still_resolve_but_do_not_connect() -> None:
    """Classifying an address is not a network call; reaching it is.

    ``app/services/progress.py``'s SSRF guard resolves a callback host to decide
    whether it points at loopback or cloud metadata. For a numeric address that
    is pure local parsing, so it must keep working — while an actual connection
    to the same address stays blocked.
    """
    assert socket.getaddrinfo("8.8.8.8", 443)

    with pytest.raises(eh.NetworkBlockedError):
        socket.create_connection(("8.8.8.8", 443), timeout=1)


def test_localhost_stays_reachable() -> None:
    """The guard must not wall off local services (Postgres on 5440, test servers).

    A refused connection is fine — that only means nothing is listening. What
    must never happen is the guard itself rejecting a loopback address.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        try:
            sock.connect(("127.0.0.1", 5440))
        except eh.NetworkBlockedError:  # pragma: no cover - the actual failure
            pytest.fail("the network guard must never block loopback")
        except OSError:
            pass  # nothing listening / refused / timed out — all acceptable

    # Loopback name resolution must survive too.
    assert socket.getaddrinfo("localhost", 5440)


# ── 3. the policy cannot silently fall behind the app ─────────────────────────


def _env_vars_read_by_app() -> set[str]:
    pattern = re.compile(
        r"""os\.(?:getenv|environ\.get)\(\s*["']([A-Z0-9_]+)["']"""
        r"""|os\.environ\[\s*["']([A-Z0-9_]+)["']"""
    )
    found: set[str] = set()
    for path in _APP_DIR.rglob("*.py"):
        for match in pattern.finditer(path.read_text(encoding="utf-8")):
            found.add(match.group(1) or match.group(2))
    return found


def test_every_env_var_the_app_reads_is_classified() -> None:
    """Adding an env-gated source without registering it fails here.

    A convention in a docstring decays; this does not. When someone wires a new
    provider behind ``os.getenv("NEWTHING_API_KEY")``, this test tells them
    exactly where to declare it instead of letting the suite quietly regain a
    dependency on the developer's shell.
    """
    read = _env_vars_read_by_app()
    assert read, "the source scan found nothing — the scan itself is broken"

    unclassified = sorted(v for v in read if not eh.is_classified(v))
    assert not unclassified, (
        "these env vars are read by app/ but not declared in "
        "tests/env_hermeticity.py:\n  "
        + "\n  ".join(unclassified)
        + "\n\nAdd each to CREDENTIAL_VARS (anything that unlocks a real "
        "provider or backing service) or TUNING_VARS (behaviour knobs), so the "
        "unit suite keeps running against documented defaults."
    )


def test_credential_pattern_sweep_catches_unregistered_keys() -> None:
    """Belt and braces: credential-shaped names are neutralised on sight.

    The explicit list is the contract; this sweep is the safety net for the
    provider someone adds on a Friday.
    """
    for name in ("NEWPROVIDER_API_KEY", "SOMETHING_CLIENT_SECRET", "FOO_TOKEN"):
        assert eh.looks_like_credential(name), name
    for name in ("PHASE_PLAN_TIMEOUT_S", "LOG_LEVEL", "CONTACTS_BATCH_SIZE"):
        assert not eh.looks_like_credential(name), name


def test_contract_suite_is_exempt_from_neutralisation() -> None:
    """``tests/contracts/`` needs real keys and a real network — by design.

    If the hermeticity fixture ever started stripping credentials there, the
    upstream contract suite would report "no credential" for every provider and
    verify nothing, while looking perfectly green.
    """
    assert eh.is_exempt_path("/repo/apps/ia/tests/contracts/test_anthropic.py")
    assert not eh.is_exempt_path("/repo/apps/ia/tests/test_apollo_service.py")
