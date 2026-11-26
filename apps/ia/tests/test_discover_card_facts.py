"""#4068 (lot DECOUVRIR-CARTE) — parité avec ``classifyCardFact`` : le MÊME jeu de cas que le TS,
et l'IA ne compte plus dans le rang ce que la carte n'affiche pas."""

import json
from datetime import date
from pathlib import Path

import pytest

from app.services.discover_card_facts import classify_card_fact, drop_off_card_facts

_CASES = json.loads(
    (Path(__file__).resolve().parents[3] / "packages/contracts/src/fixtures/discover-card-facts.json").read_text(
        encoding="utf-8"
    )
)
_NOW = date.fromisoformat(_CASES["now"])


@pytest.mark.parametrize("case", _CASES["cases"], ids=lambda c: c["fact"]["label"])
def test_meme_verdict_que_le_contrat_ts(case):
    verdict = classify_card_fact(case["fact"], now=_NOW, company_name=_CASES["company"])
    assert verdict["tier"] == case["tier"]
    if "nature" in case:
        assert verdict["nature"] == case["nature"]
    if "reason" in case:
        assert verdict["reason"] == case["reason"]


def test_hors_carte_ecarte_et_le_reste_garde_dans_son_ordre():
    signals = [
        {"type": "legal", "label": "Modification survenue sur le capital", "date": "2026-09-01"},
        {"type": "hiring", "label": "Ingénieur systèmes embarqués H/F", "date": "2026-10-01"},
        {"type": "business", "label": "Lerevenu", "date": "2026-09-30"},
        {"type": "tender", "label": "Maintenance applicative du SI achats", "date": "2025-01-20"},
    ]
    # l'âge n'est pas jugé ici (la carte le coupe) : le vieil appel d'offres reste dans le rang, décoté.
    kept = drop_off_card_facts(signals, company_name="LATECOERE")
    assert [s["label"] for s in kept] == ["Ingénieur systèmes embarqués H/F", "Maintenance applicative du SI achats"]


@pytest.mark.asyncio
async def test_decouvrir_ne_rend_plus_les_actes_de_capital(monkeypatch: pytest.MonkeyPatch) -> None:
    """L'appelant : `_candidate_signals` ne range plus ce que la carte n'affiche pas."""
    from app.routers import discover

    today = date.today().isoformat()

    async def _none(*_a: object, **_k: object) -> list[dict]:
        return []

    async def _legal(_siren: str) -> list[dict]:
        return [
            {"date": today, "type": "Modifications diverses", "precision": "modification survenue sur le capital"},
            {"date": today, "type": "Ventes et cessions", "precision": "cession de fonds de commerce"},
        ]

    async def _jobs(*_a: object, **_k: object) -> list[dict]:
        return [
            {"date": today, "title": "Stage – Bac+5 – Ingénieur méthodes"},
            {"date": today, "title": "Ingénieur câblage"},
        ]

    monkeypatch.setattr(discover, "public_tenders", _none)
    monkeypatch.setattr(discover, "funding_signals", _none)
    monkeypatch.setattr(discover, "legal_signals", _legal)
    monkeypatch.setattr(discover, "it_job_signals", _jobs)
    monkeypatch.setattr(discover, "capital_increase_signals", _none)
    signals, _, _ = await discover._candidate_signals("LATECOERE", "572050169", all_roles=False)
    labels = [s["label"] for s in signals]
    assert "Ingénieur câblage" in labels
    assert not any("capital" in label or "Stage" in label for label in labels)
    assert any("cession" in label for label in labels)


@pytest.mark.asyncio
async def test_decouvrir_range_l_augmentation_de_capital_du_siren_de_la_carte(monkeypatch: pytest.MonkeyPatch) -> None:
    """#4285.1 — l'appelant : `_candidate_signals` range le fait « Augmentation de capital » (BODACC, par SIREN)."""
    from app.routers import discover

    asked: list[str] = []

    async def _none(*_a: object, **_k: object) -> list[dict]:
        return []

    async def _capital(siren: str, **_k: object) -> list[dict]:
        asked.append(siren)
        return [
            {
                "type": "business",
                "label": "Augmentation de capital",
                "date": date.today().isoformat(),
                "url": "https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:B1",
                "detail": None,
            }
        ]

    monkeypatch.setattr(discover, "public_tenders", _none)
    monkeypatch.setattr(discover, "funding_signals", _none)
    monkeypatch.setattr(discover, "legal_signals", _none)
    monkeypatch.setattr(discover, "it_job_signals", _none)
    monkeypatch.setattr(discover, "capital_increase_signals", _capital)
    signals, degraded, _ = await discover._candidate_signals("LATECOERE", "572050169", all_roles=False)
    assert asked == ["572050169"]
    (fact,) = [s for s in signals if s["label"] == "Augmentation de capital"]
    assert fact["url"].startswith("https://www.bodacc.fr/")
    assert degraded == []
