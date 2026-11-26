"""#2284.1 — RÉSOUDRE l'entreprise AVANT de comparer.

Deux comptes choisis pour une comparaison peuvent désigner la MÊME entreprise
(même SIREN : un compte créé deux fois sous deux noms). Les classer l'un contre
l'autre compterait deux fois la même cible. On le DIT (``identity_overlaps``),
on ne fusionne JAMAIS, et une correction humaine versionnée (#2284.67-.69)
gagne sur le calcul : un SIREN écarté par l'espace ne rapproche plus rien."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from app.services.compare_normalization import identity_overlaps, normalize_accounts


def _account(aid: str, name: str, siren: str | None, *, column_siren: str | None = None) -> dict:
    resolution = (
        {"state": "resolved", "identifiers": {"siren": siren}, "canonical_id": f"FR-SIREN-{siren}"}
        if siren
        else {"state": "unresolved", "identifiers": {}, "canonical_id": None}
    )
    return {
        "id": aid,
        "company_name": name,
        "status": "completed",
        "siren": column_siren,
        "raw_analysis": {"entity_resolution": resolution},
    }


def test_two_accounts_on_the_same_siren_are_named_never_merged():
    accounts = [
        _account("a1", "EDF", "552081317"),
        _account("a2", "Électricité de France", "552081317"),
        _account("a3", "SNCF", "552049447"),
    ]
    overlaps = identity_overlaps(accounts, [])
    assert overlaps == [
        {
            "relation": "same_entity",
            "account_ids": ["a1", "a2"],
            "companies": ["EDF", "Électricité de France"],
            "siren": "552081317",
        }
    ]


def test_the_account_siren_column_counts_when_the_verdict_is_absent():
    accounts = [_account("a1", "EDF", None, column_siren="552081317"), _account("a2", "EDF SA", "552081317")]
    assert [o["account_ids"] for o in identity_overlaps(accounts, [])] == [["a1", "a2"]]


def test_a_name_alone_never_makes_an_overlap():
    """#2284.28 / .61 — même nom, aucun identifiant : aucune relation déduite."""
    accounts = [_account("a1", "Thales", None), _account("a2", "Thales", None)]
    assert identity_overlaps(accounts, []) == []


def test_a_workspace_rejection_wins_over_the_computed_siren():
    """#2284.67 — « ce n'est pas celle-ci » posé par l'espace : le SIREN calculé
    ne rapproche plus les deux comptes."""
    accounts = [_account("a1", "EDF", "552081317"), _account("a2", "EDF Renouvelables", "552081317")]
    corrections = [
        {"account_id": "a2", "version": 1, "decision": "rejected", "target_name": "EDF", "target_siren": "552081317"}
    ]
    assert identity_overlaps(accounts, corrections) == []


def test_a_workspace_confirmation_wins_and_the_latest_version_decides():
    accounts = [_account("a1", "EDF", "552081317"), _account("a2", "EDF Renouvelables", "379677636")]
    corrections = [
        {"account_id": "a2", "version": 1, "decision": "confirmed", "target_name": "X", "target_siren": "111111111"},
        {"account_id": "a2", "version": 2, "decision": "confirmed", "target_name": "EDF", "target_siren": "552081317"},
        {"account_id": "zz", "decision": None},  # ligne illisible : ignorée, jamais devinée
    ]
    assert [o["siren"] for o in identity_overlaps(accounts, corrections)] == ["552081317"]


def test_the_compare_route_says_the_overlap_to_the_screen(client) -> None:
    """L'APPELANT réel : la route /compare/ lit les corrections et porte ``identity_overlaps``."""
    accounts = [_account("a1", "EDF", "552081317"), _account("a2", "EDF bis", "552081317")]
    chain = MagicMock()
    chain.select.return_value = chain
    chain.in_.return_value = chain
    chain.eq.return_value = chain
    chain.aexecute = AsyncMock(side_effect=[MagicMock(data=accounts), MagicMock(data=[])])
    sb = MagicMock()
    sb.table.return_value = chain
    with (
        patch("app.routers.compare.get_supabase", return_value=sb),
        patch("app.routers.compare.call_claude", new_callable=AsyncMock, return_value=({"priority_order": []}, None)),
    ):
        res = client.post("/compare/", json={"account_ids": ["a1", "a2"], "user_id": "u1", "profile_data": {"x": 1}})
    assert res.json()["data"]["identity_overlaps"][0]["account_ids"] == ["a1", "a2"]
    assert "entity_resolution_corrections" in [c.args[0] for c in sb.table.call_args_list]


def test_normalize_accounts_carries_the_overlaps_of_the_comparable_accounts():
    accounts = [_account("a1", "EDF", "552081317"), _account("a2", "EDF bis", "552081317")]
    out = normalize_accounts(["a1", "a2"], accounts, [])
    assert out["identity_overlaps"][0]["account_ids"] == ["a1", "a2"]
    # Rien n'est écarté ni fusionné : les deux restent comparables.
    assert out["comparable"] == ["a1", "a2"]


def test_unreadable_corrections_mean_not_measured_never_an_overlap_that_ignores_them():
    """Corrections illisibles : ``None`` (non mesuré), jamais un rapprochement
    calculé en passant par-dessus une correction humaine qu'on n'a pas lue."""
    accounts = [_account("a1", "EDF", "552081317"), _account("a2", "EDF bis", "552081317")]
    assert normalize_accounts(["a1", "a2"], accounts, None)["identity_overlaps"] is None
