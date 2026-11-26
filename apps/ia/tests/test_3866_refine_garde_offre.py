"""#3866 (reste du lot RAR) — « Trouve des comptes pour une offre Data/BI » puis une relance
`refine` : l'offre n'était jamais mémorisée (`ThreadState.searches` ne garde que les critères
affinables), donc la relance la perdait si le modèle ne la repassait pas — et un recrutement
commercial redevenait « Recommandé ».

L'offre se garde comme un critère ; elle n'est PAS un périmètre : la redonner seule, ou
changée, ne fait pas repartir la recherche de zéro (la zone et le secteur restent)."""

from __future__ import annotations

from app.services.chat_thread_state import ThreadStateCollector


def _first_turn() -> ThreadStateCollector:
    collector = ThreadStateCollector()
    collector.record(
        "run_account_search",
        {"sectors": ["finance"], "region": ["11"], "offer": "Data/BI", "limit": 5},
        {"accounts": []},
    )
    return collector


def test_3866_refine_without_offer_keeps_the_offer() -> None:
    collector = _first_turn()
    effective, refinement = collector.prepare("run_account_search", {"refine": True, "headcount": ["250-999"]})
    assert effective["offer"] == "Data/BI"
    assert effective["region"] == ["11"]
    assert refinement is not None and refinement["kept"]["offer"] == "Data/BI"


def test_3866_refine_can_drop_the_offer() -> None:
    collector = _first_turn()
    effective, _ = collector.prepare("run_account_search", {"refine": True, "drop": ["offer"]})
    assert "offer" not in effective
    assert effective["region"] == ["11"]


def test_3866_a_new_offer_alone_is_still_the_same_search() -> None:
    # Avant #3866 l'offre n'était pas un critère de périmètre : un appel qui ne porte qu'elle
    # restait une relance implicite (zone gardée). Ce comportement ne bouge pas.
    collector = _first_turn()
    effective, refinement = collector.prepare("run_account_search", {"offer": "cybersécurité"})
    assert effective["offer"] == "cybersécurité"
    assert effective["region"] == ["11"]
    assert refinement is not None


def test_3866_needs_follow_up_with_another_offer_keeps_the_region() -> None:
    # #3704 — « donne-moi aussi des besoins » en redonnant le secteur : la même recherche.
    # Une offre différente n'en fait pas une autre recherche.
    collector = _first_turn()
    effective, _ = collector.prepare(
        "run_account_search", {"sectors": ["finance"], "signals": ["hiring"], "offer": "cybersécurité"}
    )
    assert effective["region"] == ["11"]
    assert effective["offer"] == "cybersécurité"


def test_3866_another_sector_still_starts_from_scratch() -> None:
    # Sait dire NON : un vrai changement de périmètre repart de zéro, offre comprise.
    collector = _first_turn()
    raw = {"sectors": ["industry"], "signals": ["hiring"]}
    effective, refinement = collector.prepare("run_account_search", raw)
    assert effective is raw
    assert refinement is None


def test_3983_site_basis_alone_keeps_the_zone() -> None:
    # #3983 — « et au siège seulement » : la base de la zone change, la zone reste.
    collector = _first_turn()
    effective, refinement = collector.prepare("run_account_search", {"site_basis": "headquarters"})
    assert effective["site_basis"] == "headquarters"
    assert effective["region"] == ["11"]
    assert refinement is not None
