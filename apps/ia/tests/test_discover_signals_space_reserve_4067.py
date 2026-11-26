"""#4067 (reste) — le mode Signaux fait, lui aussi, place aux comptes que l'espace connaît.

Avant : ``after_delivery_fit[: req.limit]`` coupait sur le seul rang des signaux ; un compte que
l'espace connaît (affaire gagnée, besoin récurrent) tombé sous la coupe était écarté pour de bon
avant que l'API puisse le pondérer. Même règle que le registre (``_cut_with_space_reserve``).
"""

from __future__ import annotations

from app.routers.discover_signals import DiscoverCandidate, DiscoverSignalsRequest, _cut_signals_with_space_reserve


def _cand(siren: str) -> DiscoverCandidate:
    return DiscoverCandidate(name=f"Société {siren}", siren=siren)


def _pool(n: int) -> list[DiscoverCandidate]:
    return [_cand(f"{i:09d}") for i in range(n)]


def test_request_carries_space_sirens_defaulting_to_empty() -> None:
    assert DiscoverSignalsRequest().spaceSirens == []


def test_without_space_sirens_the_cut_is_unchanged() -> None:
    pool = _pool(10)
    assert _cut_signals_with_space_reserve(pool, 4, frozenset()) == pool[:4]


def test_a_space_known_account_below_the_cut_takes_the_last_free_place() -> None:
    out = _cut_signals_with_space_reserve(_pool(10), 4, frozenset({"000000008"}))
    assert [c.siren for c in out] == ["000000000", "000000001", "000000002", "000000008"]


def test_an_unknown_siren_invents_nothing() -> None:
    out = _cut_signals_with_space_reserve(_pool(10), 4, frozenset({"999999999"}))
    assert [c.siren for c in out] == ["000000000", "000000001", "000000002", "000000003"]


def test_the_reserve_is_a_quarter_of_the_page() -> None:
    known = frozenset(f"{i:09d}" for i in range(20, 40))
    out = _cut_signals_with_space_reserve(_pool(40), 8, known)
    assert len(out) == 8 and sum(1 for c in out if c.siren in known) == 2
