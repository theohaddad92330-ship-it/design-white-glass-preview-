"""#4045 (lot DISCOVER-MOTCLE, 12/10) — le mot-clé TRIE les signaux ; le bruit
administratif du greffe n'est pas un « Pourquoi maintenant »."""

from __future__ import annotations

import pytest

from app.routers.discover import DiscoverFilters, _legal_signal, _rank_signals_by_keywords
from app.services.domain_job_filters import keyword_terms, signal_matches_keywords


# ── Bruit juridique (point 2) ───────────────────────────────────────────────
@pytest.mark.parametrize(
    "row",
    [
        {"date": "2026-09-04", "type": "Modifications diverses"},
        {"date": "2026-09-04", "type": "Modifications diverses", "precision": "modification de l'adresse du siège"},
        {"date": "2026-09-04", "type": "Dépôts des comptes"},
        {"date": "2026-09-04", "type": "Dépôts des comptes", "precision": "Comptes annuels et rapports"},
    ],
)
def test_administrative_notices_are_not_signals(row: dict) -> None:
    assert _legal_signal(row) is None


@pytest.mark.parametrize(
    "row",
    [
        {"date": "2026-09-04", "type": "Changement de dirigeant"},
        {"date": "2026-09-04", "type": "Procédures collectives", "precision": "jugement d'ouverture de redressement judiciaire"},
        {"date": "2026-09-04", "type": "Modifications diverses", "precision": "modification survenue sur le capital (augmentation)"},
        {"date": "2026-09-04", "type": "Modifications diverses", "precision": "fusion absorption de la société"},
        {"date": "2026-09-04", "type": "Ventes et cessions", "precision": "cession de fonds de commerce"},
    ],
)
def test_business_events_stay_signals(row: dict) -> None:
    assert _legal_signal(row) is not None


# ── Lexique (point 1) ───────────────────────────────────────────────────────
def test_cyber_keyword_expands_to_the_cyber_lexicon() -> None:
    terms = keyword_terms(["cybersécurité"])
    assert {"cybersecurite", "soc", "pentest", "rssi", "iam"} <= set(terms)


def test_unknown_keyword_stays_itself_folded() -> None:
    assert keyword_terms(["Élevage"]) == ("elevage",)


def test_no_keyword_no_terms() -> None:
    assert keyword_terms(None) == () and keyword_terms([" ", ""]) == ()


def test_whole_word_match_not_substring() -> None:
    assert signal_matches_keywords({"label": "Analyste SOC N2"}, keyword_terms(["cybersécurité"]))
    assert not signal_matches_keywords({"label": "Associé en soccer"}, keyword_terms(["cybersécurité"]))
    assert not signal_matches_keywords({"label": "Data Analyst"}, keyword_terms(["cybersécurité"]))


# ── Tri (point 1) ───────────────────────────────────────────────────────────
def _sig(label: str, date: str, **extra: object) -> dict:
    return {"type": "hiring", "label": label, "date": date, **extra}


def test_keyword_match_goes_first_nothing_is_removed() -> None:
    signals = [_sig("Data Analyst", "2026-10-10"), _sig("Expert Pentest", "2026-10-01"), _sig("RSSI", "2026-09-01")]
    out = _rank_signals_by_keywords(signals, ["cybersécurité"])
    assert [s["label"] for s in out] == ["Expert Pentest", "RSSI", "Data Analyst"]
    assert [s.get("keywordMatch") for s in out] == [True, True, None]


def test_no_keyword_is_byte_identical() -> None:
    signals = [_sig("Data Analyst", "2026-10-10"), _sig("Expert Pentest", "2026-10-01")]
    assert _rank_signals_by_keywords(signals, None) == signals
    assert "keywordMatch" not in signals[0]


def test_registry_filters_accept_keywords() -> None:
    assert DiscoverFilters(keywords=["cybersécurité"]).keywords == ["cybersécurité"]
