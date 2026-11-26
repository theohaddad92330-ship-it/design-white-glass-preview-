from __future__ import annotations

from app.services.confidence import ConfidenceScore, compute_confidence

_FULL_METRICS = {
    "brave_results_count": 30,
    "firecrawl_pages_scraped": 5,
    "pappers_siren": "552120222",
}
_FULL_DATA = {
    "sector": "Banque",
    "employees": "100 000+",
    "revenue": "26 Md€",
    "headquarters": "Paris",
    "data_freshness": {"signals": "recent", "financials": "recent", "contacts": "recent"},
}


def test_all_signals_present_is_high_confidence() -> None:
    res = compute_confidence(metrics=_FULL_METRICS, data=_FULL_DATA)
    assert isinstance(res, ConfidenceScore)
    # The individual FACTORS are perfect for this firmo-complete, SIREN-anchored
    # input; the 4-axis global stays below 100 because _FULL_DATA carries no
    # signals / angles / INPI / tech-detect (technique + commerciale axes) — that
    # is the point of the split (retour Thales : 100 exige TOUT).
    assert res.factors.source_coverage == 1.0
    assert res.factors.legal_grounding == 1.0
    assert res.factors.freshness == 1.0
    assert res.factors.completeness == 1.0
    # No B3 sources block passed → cited_extracts proxies the legal anchor.
    assert res.factors.cited_extracts == 1.0
    assert res.axes.identite == 100


def test_cited_extracts_grades_from_b3_sources() -> None:
    # B3 cited 2 of the 4 key firmographic facts → cited_extracts = 0.5,
    # even though a SIREN anchor exists (legal_grounding stays 1.0).
    sources = {"facts": {"sector": ["pappers:552120222"], "revenue": ["pappers:552120222"]}}
    res = compute_confidence(metrics=_FULL_METRICS, data=_FULL_DATA, sources=sources)
    assert res.factors.cited_extracts == 0.5
    assert res.factors.legal_grounding == 1.0
    # Graded citation drags the otherwise-perfect score below 100.
    assert res.score < 100


def test_cited_extracts_full_when_all_key_facts_cited() -> None:
    cite = ["pappers:552120222"]
    sources = {"facts": {k: cite for k in ("sector", "employees", "revenue", "headquarters")}}
    res = compute_confidence(metrics=_FULL_METRICS, data=_FULL_DATA, sources=sources)
    assert res.factors.cited_extracts == 1.0


def test_cited_extracts_zero_when_sources_present_but_unanchored() -> None:
    # B3 ran but Pappers was down → no hard citations → cited_extracts = 0.
    res = compute_confidence(
        metrics={"brave_results_count": 5, "firecrawl_pages_scraped": 5, "pappers_siren": None},
        data=_FULL_DATA,
        sources={"facts": {}},
    )
    assert res.factors.cited_extracts == 0.0
    assert res.factors.legal_grounding == 0.0


def test_confidence_is_derived_from_signals_not_the_model() -> None:
    # A confidence self-declared by the LLM (any shape) must be IGNORED — the score
    # is computed only from objective signals. Injecting a bogus 100/high verdict
    # into the data leaves the derived score untouched, and it moves only when the
    # objective inputs move (here: removing Firecrawl pages lowers the technique axis).
    poisoned = {
        **_FULL_DATA,
        "confidence": {"score": 100, "tier": "high"},  # pretend the model claimed this
        "self_confidence": 100,
    }
    clean = compute_confidence(metrics=_FULL_METRICS, data=_FULL_DATA)
    with_llm_claim = compute_confidence(metrics=_FULL_METRICS, data=poisoned)
    assert with_llm_claim.score == clean.score  # the model's claim changed nothing

    weak = compute_confidence(metrics={**_FULL_METRICS, "firecrawl_pages_scraped": 0}, data=_FULL_DATA)
    assert clean.score > weak.score  # more real signal → higher derived score


def test_no_signals_is_non_evaluable_not_low_confidence() -> None:
    # #2307.19 — aucune des trois sources externes n'a répondu : ce n'est pas
    # une confiance BASSE (on aurait jugé, et c'est mauvais), c'est l'absence
    # de matière à juger. Avant ce correctif, ce cas se lisait comme « low »,
    # au même titre qu'un dossier réellement pauvre mais collecté.
    res = compute_confidence(metrics={}, data={})
    assert res.score == 0
    assert res.tier == "non_evaluable"
    assert res.factors.source_coverage == 0.0
    assert res.factors.legal_grounding == 0.0


def test_pappers_only_no_scrape_is_partial() -> None:
    # Brave + Pappers, no Firecrawl pages, undated, half the facts.
    metrics = {"brave_results_count": 12, "firecrawl_pages_scraped": 0, "pappers_siren": "123"}
    data = {"sector": "Tech", "employees": "500", "revenue": "", "headquarters": ""}
    res = compute_confidence(metrics=metrics, data=data)
    # source_coverage = 2/3, legal = 1, freshness = 0 (undated), completeness = 2/4
    assert res.factors.source_coverage == 2 / 3
    assert res.factors.legal_grounding == 1.0
    assert res.factors.freshness == 0.0
    assert res.factors.completeness == 0.5
    assert res.tier in ("medium", "low")


def test_legal_grounding_requires_siren() -> None:
    res = compute_confidence(
        metrics={"brave_results_count": 5, "firecrawl_pages_scraped": 5, "pappers_siren": None},
        data=_FULL_DATA,
    )
    assert res.factors.legal_grounding == 0.0
    assert res.factors.source_coverage == 2 / 3  # brave + firecrawl up, pappers down


def test_freshness_maps_old_to_half() -> None:
    res = compute_confidence(
        metrics=_FULL_METRICS,
        data={**_FULL_DATA, "data_freshness": {"signals": "old", "financials": "old", "contacts": "old"}},
    )
    assert res.factors.freshness == 0.5


def test_camelcase_data_freshness_key_is_tolerated() -> None:
    res = compute_confidence(
        metrics=_FULL_METRICS,
        data={**{k: v for k, v in _FULL_DATA.items() if k != "data_freshness"},
              "dataFreshness": {"signals": "recent", "financials": "recent", "contacts": "recent"}},
    )
    assert res.factors.freshness == 1.0


# ── #17 : fraîcheur depuis les VRAIES dates (BODACC/FT/signaux) ───────────────
def test_real_date_freshness_prefers_dated_evidence() -> None:
    from datetime import date

    from app.services.confidence import _real_date_freshness

    today = date(2026, 7, 6)
    # signal daté d'il y a ~1 mois → très frais (1.0), même si undated ailleurs
    fresh = {"recentSignals": [{"date": "2026-06-10"}, {"date": "2019-01-01"}]}
    assert _real_date_freshness(fresh, today=today) == 1.0
    # BODACC ~2 ans → 0.3
    mid = {"legalSignals": [{"date": "2024-08"}]}
    assert _real_date_freshness(mid, today=today) == 0.3
    # aucune date parseable → None (le caller retombe sur le LLM tristate)
    assert _real_date_freshness({"recentSignals": [{"date": "récemment"}]}, today=today) is None
    assert _real_date_freshness({}, today=today) is None
    # une date FUTURE (bruit) est ignorée
    assert _real_date_freshness({"news": [{"age": "2099-01-01"}]}, today=today) is None


def test_real_dates_override_pessimistic_llm_freshness() -> None:
    from datetime import UTC, datetime, timedelta

    recent = (datetime.now(UTC).date() - timedelta(days=20)).isoformat()
    data = {
        **_FULL_DATA,
        "data_freshness": {"signals": "old", "financials": "old", "contacts": "old"},
        "itJobSignals": [{"date": recent}],  # offre IT récente et datée
    }
    res = compute_confidence(metrics=_FULL_METRICS, data=data)
    assert res.factors.freshness == 1.0  # la vraie date récente prime sur le "old" du LLM


# ── #21 : corroboration multi-source (diagnostic, ne bouge pas le /100) ───────
def test_corroboration_counts_independent_registries() -> None:
    from app.services.confidence import _corroboration_score

    none = _corroboration_score({}, {})
    assert none == 0.0
    # Pappers siren + annuaire + BODACC + RNE + INSEE sites = 5/5
    full = _corroboration_score(
        {"pappers_siren": "123"},
        {
            "registryAnnuaire": {"x": 1},
            "legalSignals": [{"date": "2026-01"}],
            "beneficialOwners": [{"name": "X"}],
            "sitesFrance": [{"city": "Paris"}],
        },
    )
    assert full == 1.0
    # un seul registre → 0.2
    assert _corroboration_score({"pappers_siren": "1"}, {}) == 0.2


def test_corroboration_feeds_the_sources_axis() -> None:
    # Depuis le split (retour Thales), la corroboration multi-registre alimente
    # l'axe « confiance sources » — plus de registres qui confirment l'entité →
    # meilleur axe sources → meilleur global.
    base = compute_confidence(metrics=_FULL_METRICS, data=_FULL_DATA)
    corrob = compute_confidence(
        metrics={**_FULL_METRICS}, data={**_FULL_DATA, "registryAnnuaire": {"x": 1}}
    )
    assert corrob.factors.corroboration > base.factors.corroboration
    assert corrob.axes.sources > base.axes.sources
    assert corrob.score >= base.score
