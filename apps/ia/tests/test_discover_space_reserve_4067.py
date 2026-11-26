"""#4067 (reste) — l'IA ne coupe plus à ``limit`` sans avoir fait place aux faits de l'espace.

L'API (seule à connaître l'espace) transmet ``spaceSirens`` : les SIREN sur lesquels l'espace actif
détient un historique ou des affaires CRM. Avant la coupe à ``limit``, un candidat de cette liste
tombé sous la coupe REPREND la place du dernier candidat sans fait d'espace — dans la limite d'une
réserve (un quart de la page). Rien n'est inventé : un SIREN inconnu du bassin n'entre pas.
"""

from __future__ import annotations

from app.routers import discover as discover_router
from app.routers.discover import DiscoverRegistryRequest, _cut_with_space_reserve


def _c(siren: str, verdict: str = "recommended") -> dict:
    return {"siren": siren, "qualification": {"verdict": verdict}}


def _pool(n: int) -> list[dict]:
    return [_c(f"{i:09d}") for i in range(n)]


def test_without_space_sirens_the_cut_is_unchanged() -> None:
    ranked = _pool(10)
    assert _cut_with_space_reserve(ranked, 4, frozenset()) == ranked[:4]


def test_a_space_known_candidate_below_the_cut_takes_the_last_free_place() -> None:
    ranked = _pool(10)
    out = _cut_with_space_reserve(ranked, 4, frozenset({"000000008"}))
    assert [c["siren"] for c in out] == ["000000000", "000000001", "000000002", "000000008"]


def test_the_ranking_order_is_kept_not_the_rescue_order() -> None:
    ranked = _pool(10)
    out = _cut_with_space_reserve(ranked, 8, frozenset({"000000009"}))
    assert [c["siren"] for c in out][-1] == "000000009"
    assert [c["siren"] for c in out][:6] == [f"{i:09d}" for i in range(6)]


def test_the_reserve_is_a_quarter_of_the_page() -> None:
    ranked = _pool(40)
    known = frozenset(f"{i:09d}" for i in range(20, 40))
    out = _cut_with_space_reserve(ranked, 8, known)
    assert len(out) == 8
    assert sum(1 for c in out if c["siren"] in known) == 2  # 8 // 4


def test_candidates_already_in_the_cut_are_never_dropped_for_a_rescue() -> None:
    ranked = _pool(10)
    known = frozenset({"000000001", "000000002", "000000009"})
    out = _cut_with_space_reserve(ranked, 4, known)
    sirens = [c["siren"] for c in out]
    assert "000000001" in sirens and "000000002" in sirens and "000000009" in sirens
    assert len(out) == 4


def test_an_excluded_verdict_is_never_rescued() -> None:
    ranked = _pool(8) + [_c("000000099", "excluded")]
    out = _cut_with_space_reserve(ranked, 4, frozenset({"000000099"}))
    assert "000000099" not in [c["siren"] for c in out]


def test_a_siren_absent_from_the_pool_invents_nothing() -> None:
    ranked = _pool(6)
    out = _cut_with_space_reserve(ranked, 4, frozenset({"123456789"}))
    assert out == ranked[:4]


def test_a_short_pool_is_returned_whole() -> None:
    ranked = _pool(3)
    assert _cut_with_space_reserve(ranked, 4, frozenset({"000000001"})) == ranked


def test_the_request_cleans_space_sirens() -> None:
    req = DiscoverRegistryRequest(spaceSirens=["552 081 317", "abc", "552081317", "12345678901234"])
    assert discover_router._space_sirens(req) == frozenset({"552081317"})
