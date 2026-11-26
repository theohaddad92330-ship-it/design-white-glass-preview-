"""#2265.2 / #2265.11 — rapprocher une résolution avec un compte du MÊME
espace, jamais une fusion (doctrine #2284.28 : le nom seul ne fusionne jamais
deux entités).
"""

from __future__ import annotations

from app.services.workspace_account_match import (
    fetch_workspace_account_candidates,
    match_workspace_account,
)

_CANDIDATES = [
    {"id": "acc-1", "company_name": "EDF Renouvelables", "siren": "552081317", "website": None},
    {"id": "acc-2", "company_name": "Malt SAS", "siren": None, "website": "https://www.malt.fr/"},
]


def test_matches_on_shared_siren_first():
    match = match_workspace_account(
        candidates=_CANDIDATES, siren="552081317", domain=None, target_name="Electricité de France"
    )
    assert match is not None
    assert match.account_id == "acc-1"
    assert match.matched_by == "siren"


def test_excludes_the_account_being_resolved_itself():
    match = match_workspace_account(
        candidates=_CANDIDATES, siren="552081317", domain=None, target_name="EDF", exclude_account_id="acc-1"
    )
    assert match is None


def test_matches_on_normalized_name_and_domain_together_without_siren():
    """#2265.11 — ni SIREN ni nom légal (le cas Brave/Apollo) : nom normalisé
    ET domaine partagés ensemble suffisent à NOMMER un rapprochement."""
    match = match_workspace_account(candidates=_CANDIDATES, siren=None, domain="malt.fr", target_name="Malt SAS")
    assert match is not None
    assert match.account_id == "acc-2"
    assert match.matched_by == "name_domain"


def test_name_alone_never_matches():
    """Doctrine #2284.28 — le nom seul ne fusionne jamais deux entités."""
    match = match_workspace_account(candidates=_CANDIDATES, siren=None, domain=None, target_name="Malt SAS")
    assert match is None


def test_domain_alone_without_matching_name_never_matches():
    match = match_workspace_account(
        candidates=_CANDIDATES, siren=None, domain="malt.fr", target_name="Une autre entreprise"
    )
    assert match is None


def test_no_candidates_is_no_match():
    assert match_workspace_account(candidates=[], siren="552081317", domain=None, target_name="EDF") is None


class _Res:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table: str, store: dict):
        self._table = table
        self._store = store
        self._filters: dict = {}

    def select(self, *a, **k):
        return self

    def eq(self, column, value):
        self._filters[column] = value
        return self

    async def aexecute(self):
        rows = [r for r in self._store.get(self._table, []) if all(r.get(c) == v for c, v in self._filters.items())]
        return _Res(rows)


class _Client:
    def __init__(self, store: dict):
        self._store = store

    def table(self, name: str) -> _Query:
        return _Query(name, self._store)


class TestFetchWorkspaceAccountCandidates:
    async def test_scopes_to_the_workspace_only(self):
        store = {
            "accounts": [
                {"id": "acc-1", "workspace_id": "ws-a", "company_name": "EDF"},
                {"id": "acc-2", "workspace_id": "ws-b", "company_name": "Un concurrent"},
            ]
        }
        rows = await fetch_workspace_account_candidates(_Client(store), "ws-a")
        assert [r["id"] for r in rows] == ["acc-1"]

    async def test_no_workspace_id_is_a_no_op(self):
        assert await fetch_workspace_account_candidates(_Client({"accounts": []}), None) == []
        assert await fetch_workspace_account_candidates(_Client({"accounts": []}), "") == []
