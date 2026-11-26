"""Persistance des financiers SEC/EDGAR US — ``_us_sec_financials_overlay``.

Constat #540 volet A : le pack US injectait ses financiers XBRL 10-K dans le
prompt mais ne les PERSISTAIT pas → invisibles sur la fiche compte. L'overlay
re-expose le snapshot ``secFinancials`` résolu par le pack sur le résultat de
recherche pour que l'API le persiste sous ``raw_analysis.us_sec_financials``.

Invariant dur vérifié ici : le défaut FR (pas de pack ⇒ ``_cp is None``) et
toute forme sans financiers renvoient ``{}`` — **aucune clé n'est ajoutée**, le
payload FR reste byte-identique. Rien n'est inventé.
"""

from __future__ import annotations

from app.routers.phase1_research import _us_sec_financials_overlay
from app.services.country_packs.base import empty_signals


def test_fr_default_none_signals_is_empty() -> None:
    """FR (pack None ⇒ pas de signaux) n'ajoute RIEN au résultat."""
    assert _us_sec_financials_overlay(None) == {}


def test_pack_without_financials_is_empty() -> None:
    """Un pack qui a tourné mais sans snapshot financier (empty_signals) n'ajoute rien."""
    assert _us_sec_financials_overlay(empty_signals("US")) == {}
    assert _us_sec_financials_overlay({**empty_signals("US"), "secFinancials": {}}) == {}


def test_non_dict_shapes_are_empty() -> None:
    assert _us_sec_financials_overlay("oops") == {}
    assert _us_sec_financials_overlay({"secFinancials": "not-a-dict"}) == {}
    assert _us_sec_financials_overlay([]) == {}


def test_sec_financials_are_exposed_under_us_sec_financials() -> None:
    fin = {
        "cik": "0001352010",
        "filingUrl": "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001352010&type=10-K",
        "detailUrl": "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001352010",
        "revenues": [{"end": "2025-12-31", "val": 5457056000, "filed": "2026-02-26"}],
        "netIncome": [{"end": "2025-12-31", "val": 377678000, "filed": "2026-02-26"}],
        "sharesOutstanding": {"end": "2026-04-30", "val": 52244451, "filed": "2026-02-26"},
        "filings": [
            {
                "form": "10-K",
                "date": "2026-02-26",
                "title": "SEC 10-K du 2026-02-26",
                "url": "https://www.sec.gov/Archives/edgar/data/1352010/x.htm",
            }
        ],
    }
    signals = {**empty_signals("US"), "secFinancials": fin}
    overlay = _us_sec_financials_overlay(signals)
    # Exactly one documented key, carrying the snapshot verbatim (the API snakes
    # it to raw_analysis.us_sec_financials at persist time).
    assert overlay == {"usSecFinancials": fin}
    assert set(overlay) == {"usSecFinancials"}
