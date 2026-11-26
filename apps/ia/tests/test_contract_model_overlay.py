"""#2291.2 (lot R, 19/09/2026) — L'OBSERVATION SURVIT à la recherche.

``_contract_model_overlay`` calcule le modèle de contrat OBSERVÉ de la cible
sur les offres d'emploi et les avis BOAMP que la phase 1 a DÉJÀ en main (le
bloc de signaux datés, §5) — la MÊME fonction que Découvrir
(``contract_model.observe_contract_model``), zéro appel réseau de plus.

Invariant qui la distingue des autres overlays (registre/SEC US, qui renvoient
``{}`` sur rien) : celui-ci pose TOUJOURS la clé ``contractModel``, même
``None`` — c'est ce qui permet au rattrapage par segment de distinguer
« analysé avant cette capacité » (clé absente en base) de « analysé depuis,
rien observé » (``None``, jamais un « n'y recourt pas »).
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.routers.phase1_research import _contract_model_overlay


def _offer(code: str, date: str, company: str = "DECATHLON") -> dict:
    return {"title": "Développeur", "date": date, "company": company, "contractCode": code, "contractType": None}


def _tender(title: str, buyer: str = "DECATHLON", date: str = "2026-08-10") -> dict:
    return {"title": title, "buyer": buyer, "publishedDate": date}


def test_the_key_is_always_present_even_with_nothing_attributable() -> None:
    """Contrairement aux overlays pays (``{}`` = rien à ajouter), celui-ci pose
    TOUJOURS ``contractModel`` — même ``None`` : la clé est le marqueur « ce
    compte a passé la phase de signaux DEPUIS cette capacité »."""
    overlay = _contract_model_overlay("DECATHLON", [], [])
    assert overlay == {"contractModel": None}
    assert "contractModel" in overlay


def test_it_reads_the_same_dated_signals_the_phase_already_collected() -> None:
    jobs = [_offer("LIB", "2026-09-01T10:00:00Z"), _offer("CDI", "2026-08-01T10:00:00Z")]
    tenders = [_tender("Prestations de développement en régie")]
    overlay = _contract_model_overlay("DECATHLON", jobs, tenders)
    model = overlay["contractModel"]
    assert model is not None
    assert model["jobOffers"]["total"] == 2
    assert model["jobOffers"]["counts"]["freelance"] == 1
    assert model["publicContracts"]["regie"] == 1


def test_an_employer_with_no_attributable_offer_or_notice_is_none_not_dropped() -> None:
    """Un employeur pour qui rien n'est attribuable reste OBSERVÉ (cherché,
    ``None``) — la clé n'est jamais retirée du résultat."""
    overlay = _contract_model_overlay("DECATHLON", [_offer("LIB", "2026-09-01", company="RANDSTAD")], [])
    assert overlay == {"contractModel": None}


def test_matches_observe_contract_model_directly() -> None:
    """Pas de logique dupliquée : l'overlay délègue tel quel à la fonction
    partagée avec Découvrir (même jour de constat, l'horloge est figée)."""
    from app.services.contract_model import observe_contract_model

    jobs = [_offer("MIS", "2026-09-01")]
    tenders: list[dict] = []
    now = datetime(2026, 9, 19, tzinfo=UTC)
    expected = observe_contract_model("DECATHLON", jobs, tenders, now=now)
    overlay = _contract_model_overlay("DECATHLON", jobs, tenders)
    assert overlay["contractModel"]["jobOffers"] == expected["jobOffers"]
    assert overlay["contractModel"]["publicContracts"] == expected["publicContracts"]
