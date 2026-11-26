"""Root pytest wiring: the unit suite ignores the developer's shell.

``pytest`` used to be green on a clean environment and ~210 tests deep in red
after ``source tools/dev.secret.sh`` — which is precisely what a developer does
before running the app. CI never noticed (the ``test-ia`` job runs keyless), so
the damage landed entirely on whoever was trying to work.

A suite that is normally red teaches people not to read red. That is worth
fixing on its own, and doubly so next to ``tests/contracts/`` (#626), whose
whole value proposition is that a red test now means an upstream API changed.

The mechanism, in two layers:

``pytest_configure``
    Strips every policy-covered variable from ``os.environ`` before app modules
    are imported. This layer is load-bearing rather than belt-and-braces: knobs
    like ``CONTACTS_BATCH_SIZE`` and ``FIRECRAWL_MAX_PAGES`` are captured at
    module import, so a fixture would run far too late to neutralise them.

``_hermetic_environment`` (autouse)
    Re-asserts the strip per test and blocks non-loopback sockets, so a test
    that forgets to stub a provider fails loudly instead of quietly calling a
    real API. Loopback stays open — local Postgres (5440) and any test server
    keep working.

Both layers stand down for ``tests/contracts/``: that suite exists to make real
calls against real providers with real credentials. It is deselected from the
default run by ``pytest.ini``'s ``addopts`` and runs via ``make contracts`` /
``pytest -m upstream_contract``; when it is the target, the fixture restores the
credentials that ``pytest_configure`` removed.

See ``tests/env_hermeticity.py`` for the policy and ``tests/test_suite_hermeticity.py``
for the guard that keeps it honest.
"""

from __future__ import annotations

import re

import pytest

from tests import env_hermeticity as eh

#: Credentials removed at configure time, kept so a contract run can restore them.
_REMOVED_ENV: dict[str, str] = {}


def _targets_contract_suite(config: pytest.Config) -> bool:
    """True when this run is meant to hit real providers.

    ``pytest.ini`` always contributes ``-m "not upstream_contract"``; an explicit
    ``-m upstream_contract`` on the command line overrides it. Selecting the
    directory by path counts too, so ``pytest tests/contracts`` behaves.
    """
    markexpr = getattr(config.option, "markexpr", "") or ""
    if "upstream_contract" in markexpr and not re.search(
        r"\bnot\s+upstream_contract\b", markexpr
    ):
        return True
    return any(eh.is_exempt_path(arg) or "tests/contracts" in arg for arg in config.args)


def pytest_configure(config: pytest.Config) -> None:
    if _targets_contract_suite(config):
        return
    _REMOVED_ENV.update(eh.neutralise_environment())


@pytest.fixture(autouse=True)
def _hermetic_environment(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch):
    """Pin the environment and seal the network for the duration of one test.

    Tests that deliberately exercise a key-present path are unaffected: their
    ``monkeypatch.setenv`` runs after this fixture and therefore wins.
    """
    is_contract = request.node.get_closest_marker(
        "upstream_contract"
    ) is not None or eh.is_exempt_path(str(request.node.fspath))

    if is_contract:
        # Real keys, real network — that is the point of that suite.
        for name, value in _REMOVED_ENV.items():
            monkeypatch.setenv(name, value)
        yield
        return

    for name in eh.CREDENTIAL_VARS | eh.TUNING_VARS:
        monkeypatch.delenv(name, raising=False)

    eh.install_network_guard()
    try:
        yield
    finally:
        eh.uninstall_network_guard()
