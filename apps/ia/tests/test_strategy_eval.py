"""Tests for the #274 strategy-token eval harness (``app.eval.strategy``).

Fully hermetic: every "run" is a mocked callable returning a canned payload, so
the golden-set walk, the resume-after-crash path, the aggregation and the A/B
verdict are all exercised without a single network call or a cent of spend.

Also guards the two properties that make the harness safe to merge before any
live measurement exists:
  * the reduction levers are OFF by default (production output unchanged);
  * the golden set contains no fabricated business data.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from app.eval.strategy import campaign as C
from app.eval.strategy.catalog import (
    CAPTURE_NOT_CAPTURED,
    SEGMENTS,
    list_companies,
    load_company,
    segment_counts,
)
from app.eval.strategy.rubric import (
    BAND_POINTS,
    MAX_SCORE,
    extract_strategy,
    score_strategy,
)
from app.eval.strategy.run import main
from app.eval.strategy.variants import (
    BASELINE,
    DEFAULT_STRATEGY_MAX_TOKENS,
    VARIANTS,
    Variant,
    applied,
    get_variant,
)
from app.prompts import bellum_strategy
from app.prompts.strategy_levers import (
    TIGHT_SCHEMA_SUBSTITUTIONS,
    apply_schema_mode,
    concision_block,
    concision_mode,
    schema_mode,
)

# ── fixtures ──────────────────────────────────────────────────────────────────


def _angle(i: int = 0, *, complete: bool = True) -> dict:
    a = {
        "title": f"Play {i}",
        "strategy": "PROMESSE: réduire le lead time de 30%. PREUVE: mission similaire. "
                    "ACTION: atelier 45 min de cadrage.",
        "entryContactPersona": "Directeur Études BU Logistique",
        "specificOffer": "Audit SI logistique — 3 consultants, 4 semaines — feuille de route",
        "estimatedDealSize": "150-250K EUR sur 12 mois",
        "prerequisites": "Valider le sponsor budget",
    }
    if not complete:
        a["prerequisites"] = ""
        a["strategy"] = "Proposer du staffing data engineers."
        a["specificOffer"] = "prestation"
        a["estimatedDealSize"] = "à définir"
    return a


def _strategy(*, n_angles: int = 3, complete: bool = True) -> dict:
    return {
        "angles": [_angle(i, complete=complete) for i in range(n_angles)],
        "itChallenges": [
            {"title": f"Défi {i}", "description": "…", "severity": "high",
             "esnOfferMatch": "Data platform", "timeframe": "6 mois"}
            for i in range(4)
        ],
        "pains": [
            {"pain": f"Pain {i}", "businessImpact": "2M EUR/an", "esnOffer": "Cloud",
             "urgency": "haute", "urgencyJustification": "…"}
            for i in range(4)
        ],
        "axesEcartes": [
            {"angle": "SAP S/4HANA", "raison": "hors catalogue",
             "commentReactiver": "relancer sous profil SAP"}
            for _ in range(2)
        ],
        "commentOuvrirCompte": "Entrer par la BU Logistique via un atelier de cadrage.",
        "rdvScript": {
            "opening": "Votre annonce du 12 mars sur la refonte du SI logistique…",
            "positioning": "Nous avons livré la même chose chez un acteur comparable.",
            "exploration": [f"Question {i} ? — (pourquoi)" for i in range(5)],
            "proposal": "Un audit flash de 4 semaines.",
            "closing": "Je propose un créneau de 45 min la semaine prochaine.",
            "bridges": ["Justement…", "Ce que vous dites sur X…"],
            "storyFrames": ["Chez un acteur comparable…", "Un cas vécu en 2024…"],
        },
        "powerQuestions": [f"Question {i} ? — [pourquoi pertinente]" for i in range(4)],
        "objections": [
            {"objection": "Trop cher", "realConcern": "ROI non prouvé",
             "response": "Je comprends — quel KPI…", "mirrorQuestion": "Par rapport à quoi ?"}
            for _ in range(3)
        ],
    }


def _payload(strategy: dict | None = None, *, out_tokens: int = 6000,
             cost: float = 0.42) -> dict:
    """A run payload shaped like the real pipeline's (research + _api_metrics)."""
    research = dict(strategy if strategy is not None else _strategy())
    research["_api_metrics"] = {
        "token_usage": {
            "input_tokens": 40000,
            "output_tokens": out_tokens + 2000,
            "cost_usd": cost,
            "by_phase": {
                "facts": {"input_tokens": 20000, "output_tokens": 1500, "cost_usd": 0.1},
                "signals": {"input_tokens": 10000, "output_tokens": 500, "cost_usd": 0.02},
                "strategy": {"input_tokens": 10000, "output_tokens": out_tokens,
                             "cost_usd": cost - 0.12},
            },
        }
    }
    return {"research": research}


# ── golden set ────────────────────────────────────────────────────────────────


def test_golden_set_has_12_to_15_accounts_across_all_segments():
    companies = list_companies()
    assert 12 <= len(companies) <= 15, f"DoD demande 10-15 comptes, trouvé {len(companies)}"
    counts = segment_counts(companies)
    for segment in SEGMENTS:
        assert counts[segment] >= 3, f"segment {segment} sous-représenté: {counts}"


def test_every_golden_account_carries_verifiable_registry_provenance():
    for c in list_companies():
        assert c.siren.isdigit() and len(c.siren) == 9, f"{c.slug}: SIREN invalide {c.siren!r}"
        assert c.registry.get("_source", "").startswith("https://"), f"{c.slug}: source absente"
        assert c.registry.get("fetched_at"), f"{c.slug}: date de collecte absente"
        assert c.registry.get("denomination"), f"{c.slug}: dénomination absente"
        # expect must not assert anything the public registry cannot prove.
        assert "isPublic" not in c.expect, f"{c.slug}: isPublic non vérifiable via la source"
        assert "hasSubsidiaries" not in c.expect, f"{c.slug}: hasSubsidiaries non vérifiable"
        assert c.expect["siren"] == c.siren


def test_reference_outputs_are_marked_not_captured_not_invented():
    """No golden may ship a hand-written reference dossier (règle: jamais de données fictives)."""
    for c in list_companies():
        assert c.capture_status == CAPTURE_NOT_CAPTURED
        assert c.fixture is None


def test_sirens_are_unique():
    sirens = [c.siren for c in list_companies()]
    assert len(sirens) == len(set(sirens))


def test_load_unknown_company_raises():
    with pytest.raises(FileNotFoundError):
        load_company("does-not-exist")


# ── rubric ────────────────────────────────────────────────────────────────────


def test_rubric_band_points_sum_to_100():
    assert sum(BAND_POINTS.values()) == MAX_SCORE == 100.0


def test_rubric_scores_a_complete_strategy_near_full_marks():
    score = score_strategy(_payload())
    assert score.total >= 95.0, score.as_dict()


def test_rubric_punishes_an_incomplete_strategy():
    good = score_strategy(_payload())
    bad = score_strategy(_payload(_strategy(complete=False)))
    assert bad.total < good.total - 15


def test_rubric_penalises_wrong_number_of_plays():
    three = score_strategy(_payload()).by_name()["angles"].points
    one = score_strategy(_payload(_strategy(n_angles=1))).by_name()["angles"].points
    assert one < three


def test_rubric_handles_empty_and_malformed_input():
    for payload in ({}, {"research": {}}, {"research": {"angles": "not a list"}}):
        score = score_strategy(payload)
        assert 0.0 <= score.total <= MAX_SCORE


def test_rubric_ignores_schema_annotation_strings_in_arrays():
    """Models sometimes echo the schema's leading instruction string — not content."""
    s = _strategy()
    s["objections"] = ["(MIN 3, viser 4) Pour chaque objection :"] + s["objections"]
    assert score_strategy(_payload(s)).by_name()["objections"].data["count"] == 3


def test_extract_strategy_finds_the_block_in_several_envelopes():
    inner = _strategy()
    assert extract_strategy({"research": inner})["angles"]
    assert extract_strategy({"strategy": inner})["angles"]
    assert extract_strategy(inner)["angles"]


# ── token extraction ──────────────────────────────────────────────────────────


def test_extract_tokens_reads_the_by_phase_strategy_breakdown():
    t = C.extract_tokens(_payload(out_tokens=7321))
    assert t["strategy_output_tokens"] == 7321
    assert t["total_output_tokens"] == 9321


def test_extract_tokens_degrades_to_zero_without_telemetry(caplog):
    t = C.extract_tokens({"research": {}})
    assert t["strategy_output_tokens"] == 0
    assert "token_usage" in caplog.text


# ── capture: resumable + crash-safe ───────────────────────────────────────────


def _fake_run(payload_by_slug: dict[str, dict] | None = None, fail: set[str] | None = None):
    seen: list[str] = []

    def run(company, variant):
        seen.append(company.slug)
        if fail and company.slug in fail:
            raise RuntimeError("provider exploded")
        return (payload_by_slug or {}).get(company.slug) or _payload()

    run.seen = seen  # type: ignore[attr-defined]
    return run


def test_capture_writes_one_record_per_account(tmp_path: Path):
    store = tmp_path / "c.jsonl"
    companies = list_companies()[:3]
    produced = C.capture(get_variant(BASELINE), store, _fake_run(), companies=companies)
    assert len(produced) == 3
    assert all(r.ok for r in produced)
    assert len(C.load_records(store)) == 3


def test_capture_is_idempotent_and_resumes_where_it_stopped(tmp_path: Path):
    store = tmp_path / "c.jsonl"
    companies = list_companies()[:4]
    variant = get_variant(BASELINE)

    # First pass dies after 2 accounts (simulated by capping the slice)…
    C.capture(variant, store, _fake_run(), companies=companies[:2])
    assert len(C.load_records(store)) == 2

    # …resuming runs ONLY the 2 that never completed.
    runner = _fake_run()
    produced = C.capture(variant, store, runner, companies=companies)
    assert len(produced) == 2
    assert set(runner.seen) == {c.slug for c in companies[2:]}
    assert len(C.load_records(store)) == 4

    # A third pass is a no-op — no account is billed twice.
    runner2 = _fake_run()
    assert C.capture(variant, store, runner2, companies=companies) == []
    assert runner2.seen == []


def test_capture_records_failures_and_retries_them_on_resume(tmp_path: Path):
    store = tmp_path / "c.jsonl"
    companies = list_companies()[:3]
    bad = companies[1].slug
    variant = get_variant(BASELINE)

    produced = C.capture(variant, store, _fake_run(fail={bad}), companies=companies)
    assert sum(1 for r in produced if not r.ok) == 1
    assert next(r for r in produced if not r.ok).error

    # Resume retries the failed account only.
    runner = _fake_run()
    again = C.capture(variant, store, runner, companies=companies)
    assert runner.seen == [bad]
    assert again[0].ok


def test_capture_writes_incrementally_so_a_crash_keeps_earlier_results(tmp_path: Path):
    """The record for account #1 must already be on disk when account #2 explodes."""
    store = tmp_path / "c.jsonl"
    companies = list_companies()[:2]
    on_disk: list[int] = []

    def run(company, variant):
        on_disk.append(len(C.load_records(store)))
        return _payload()

    C.capture(get_variant(BASELINE), store, run, companies=companies)
    assert on_disk == [0, 1]


def test_capture_separates_variants_in_one_store(tmp_path: Path):
    store = tmp_path / "c.jsonl"
    companies = list_companies()[:2]
    C.capture(get_variant(BASELINE), store, _fake_run(), companies=companies)
    C.capture(get_variant("tight-concise"), store, _fake_run(), companies=companies)
    records = C.load_records(store)
    assert len(records) == 4
    assert C.done_slugs(records, BASELINE) == C.done_slugs(records, "tight-concise")


def test_load_records_drops_a_truncated_final_line(tmp_path: Path, caplog):
    store = tmp_path / "c.jsonl"
    store.write_text(
        json.dumps({"variant": "baseline", "slug": "a", "company": "A", "status": "ok"})
        + '\n{"variant": "baseline", "slug": "b"',  # killed mid-write
        encoding="utf-8",
    )
    assert len(C.load_records(store)) == 1
    assert "malformed" in caplog.text


# ── aggregation ───────────────────────────────────────────────────────────────


def test_summarize_ignores_failed_runs_in_the_means(tmp_path: Path):
    store = tmp_path / "c.jsonl"
    companies = list_companies()[:3]
    payloads = {companies[0].slug: _payload(out_tokens=1000),
                companies[1].slug: _payload(out_tokens=3000)}
    C.capture(get_variant(BASELINE), store, _fake_run(payloads, fail={companies[2].slug}),
              companies=companies)
    s = C.summarize(C.load_records(store), BASELINE)
    assert (s.n_ok, s.n_error) == (2, 1)
    assert s.mean_strategy_output_tokens == 2000.0


# ── A/B verdict ───────────────────────────────────────────────────────────────


def _rec(variant: str, slug: str, tokens: int, rubric: float, status: str = C.STATUS_OK):
    return C.Record(variant=variant, slug=slug, company=slug, status=status,
                    strategy_output_tokens=tokens, rubric_total=rubric)


def test_ab_passes_when_tokens_drop_and_quality_holds():
    records = [
        _rec(BASELINE, "a", 8000, 90.0), _rec(BASELINE, "b", 9000, 88.0),
        _rec("v", "a", 6000, 90.0), _rec("v", "b", 6500, 89.0),
    ]
    v = C.compare(records, BASELINE, "v")
    assert v.passed and v.tokens_reduced and v.quality_ok
    assert v.token_delta_pct < -20


def test_ab_fails_when_quality_mean_drops():
    records = [
        _rec(BASELINE, "a", 8000, 90.0), _rec(BASELINE, "b", 9000, 90.0),
        _rec("v", "a", 5000, 85.0), _rec("v", "b", 5000, 85.0),
    ]
    v = C.compare(records, BASELINE, "v")
    assert not v.passed and not v.quality_ok
    assert any("qualité moyenne" in r for r in v.reasons)


def test_ab_fails_on_a_single_account_cliff_even_if_the_mean_holds():
    """Mean is flat (+6/-6) but one account collapsed — an average must not hide that."""
    records = [
        _rec(BASELINE, "a", 8000, 90.0), _rec(BASELINE, "b", 8000, 84.0),
        _rec("v", "a", 6000, 84.0), _rec("v", "b", 6000, 90.0),
    ]
    v = C.compare(records, BASELINE, "v")
    assert v.rubric_delta == 0.0
    assert not v.passed
    assert any("décrochage" in r for r in v.reasons)


def test_ab_fails_when_the_variant_errors_more_often():
    """A cap low enough to truncate looks like a huge saving — it must not pass."""
    records = [
        _rec(BASELINE, "a", 8000, 90.0), _rec(BASELINE, "b", 8000, 90.0),
        _rec("v", "a", 3000, 90.0), _rec("v", "b", 0, 0.0, status=C.STATUS_ERROR),
    ]
    v = C.compare(records, BASELINE, "v")
    assert not v.passed
    assert any("échoue plus souvent" in r for r in v.reasons)


def test_ab_fails_when_tokens_do_not_drop():
    records = [_rec(BASELINE, "a", 8000, 90.0), _rec("v", "a", 8500, 92.0)]
    v = C.compare(records, BASELINE, "v")
    assert not v.passed and v.quality_ok and not v.tokens_reduced


def test_ab_only_pairs_accounts_present_in_both_arms():
    records = [
        _rec(BASELINE, "a", 8000, 90.0), _rec(BASELINE, "b", 20000, 90.0),
        _rec("v", "a", 6000, 90.0),
    ]
    v = C.compare(records, BASELINE, "v")
    assert v.paired_slugs == ["a"]
    assert v.baseline_mean_tokens == 8000.0  # not (8000+20000)/2


def test_ab_without_any_pair_is_an_explicit_failure():
    v = C.compare([_rec(BASELINE, "a", 8000, 90.0)], BASELINE, "v")
    assert not v.passed and v.paired_slugs == []


# ── cost projection ───────────────────────────────────────────────────────────


def test_cost_estimate_is_none_until_something_is_measured():
    est = C.estimate_campaign_cost([], n_accounts=15, n_variants=2)
    assert est["measured"] is False and est["projected_cost_usd"] is None
    assert est["runs"] == 30


def test_cost_estimate_uses_observed_run_cost():
    records = [C.Record(variant=BASELINE, slug="a", company="A", status=C.STATUS_OK,
                        total_cost_usd=0.50, strategy_cost_usd=0.30)]
    est = C.estimate_campaign_cost(records, n_accounts=15, n_variants=2)
    assert est["measured"] is True
    assert est["projected_cost_usd"] == pytest.approx(15.0)


# ── levers are OFF by default ─────────────────────────────────────────────────


def test_levers_are_no_ops_by_default(monkeypatch):
    monkeypatch.delenv("STRATEGY_CONCISION", raising=False)
    monkeypatch.delenv("STRATEGY_SCHEMA", raising=False)
    assert concision_mode() == "off"
    assert concision_block() == ""
    assert schema_mode() == "full"
    assert apply_schema_mode("anything") == "anything"


def test_baseline_variant_applies_no_override():
    assert get_variant(BASELINE).env == {}
    assert get_variant(BASELINE).is_baseline
    assert get_variant(BASELINE).max_tokens() == DEFAULT_STRATEGY_MAX_TOKENS


def test_every_non_baseline_variant_actually_changes_something():
    for name, v in VARIANTS.items():
        if name != BASELINE:
            assert v.env, f"{name} ne change rien — ce n'est pas une variante"
            assert set(v.env) <= {"STRATEGY_MAX_TOKENS", "STRATEGY_CONCISION", "STRATEGY_SCHEMA"}


def test_default_prompts_are_byte_identical_with_levers_off(monkeypatch):
    monkeypatch.delenv("STRATEGY_CONCISION", raising=False)
    monkeypatch.delenv("STRATEGY_SCHEMA", raising=False)
    profile = {"companyName": "ESN Test", "size": "50", "offers": ["Data"], "sectors": ["Banque"]}
    system = bellum_strategy.build_system_prompt(profile)
    user = bellum_strategy.build_user_prompt("Cible", "b", "f", "p")
    assert not system.endswith("CONCISION")
    assert "===== CONCISION" not in system
    assert "MIN 4, viser 5" in user  # tight rewrites not applied


def test_concision_lever_appends_only_when_enabled(monkeypatch):
    profile = {"companyName": "ESN Test", "size": "50"}
    monkeypatch.delenv("STRATEGY_CONCISION", raising=False)
    off = bellum_strategy.build_system_prompt(profile)
    monkeypatch.setenv("STRATEGY_CONCISION", "on")
    on = bellum_strategy.build_system_prompt(profile)
    assert on.startswith(off) and len(on) > len(off)
    assert "CONCISION" in on


def test_tight_schema_lever_rewrites_only_when_enabled(monkeypatch):
    monkeypatch.delenv("STRATEGY_SCHEMA", raising=False)
    full = bellum_strategy.build_user_prompt("Cible", "b", "f", "p")
    monkeypatch.setenv("STRATEGY_SCHEMA", "tight")
    tight = bellum_strategy.build_user_prompt("Cible", "b", "f", "p")
    assert tight != full
    assert "MIN 4, viser 5" not in tight
    assert "EXACTEMENT 4" in tight
    # A tighter schema must be SHORTER — that is the whole point.
    assert len(tight) < len(full)


def test_tight_schema_substitutions_all_match_the_live_prompt():
    """Anti-drift: an edit to the schema that orphans a substitution fails here,
    instead of silently turning the lever into a no-op."""
    prompt = bellum_strategy.build_user_prompt("Cible", "b", "f", "p")
    for before, _after in TIGHT_SCHEMA_SUBSTITUTIONS:
        assert before in prompt, f"substitution orpheline: {before!r}"


def test_unknown_lever_value_falls_back_to_production(monkeypatch, caplog):
    monkeypatch.setenv("STRATEGY_CONCISION", "bogus")
    monkeypatch.setenv("STRATEGY_SCHEMA", "bogus")
    assert concision_mode() == "off"
    assert schema_mode() == "full"
    assert "bogus" in caplog.text


def test_applied_restores_the_environment_exactly(monkeypatch):
    monkeypatch.delenv("STRATEGY_SCHEMA", raising=False)
    monkeypatch.setenv("STRATEGY_MAX_TOKENS", "12000")
    v = Variant("t", "", {"STRATEGY_SCHEMA": "tight", "STRATEGY_MAX_TOKENS": "8000"})
    with applied(v):
        assert os.environ["STRATEGY_SCHEMA"] == "tight"
        assert os.environ["STRATEGY_MAX_TOKENS"] == "8000"
    # An absent key must come back ABSENT, not empty.
    assert "STRATEGY_SCHEMA" not in os.environ
    assert os.environ["STRATEGY_MAX_TOKENS"] == "12000"


# ── CLI ───────────────────────────────────────────────────────────────────────


def test_cli_listing_commands_are_hermetic_and_succeed(capsys):
    assert main(["companies"]) == 0
    assert "Golden set" in capsys.readouterr().out
    assert main(["variants"]) == 0
    assert "baseline" in capsys.readouterr().out


def test_cli_capture_refuses_to_run_live_without_confirmation(capsys):
    assert main(["baseline"]) == 2
    assert "--yes-run-live" in capsys.readouterr().err


def test_cli_ab_requires_a_variant(capsys):
    assert main(["ab"]) == 2


def test_cli_ab_reports_the_verdict_from_a_store(tmp_path: Path, capsys):
    store = tmp_path / "c.jsonl"
    for r in (_rec(BASELINE, "a", 8000, 90.0), _rec("v", "a", 6000, 90.0)):
        C.append_record(store, r)
    assert main(["ab", "--variant", "v", "--store", str(store)]) == 0
    assert "PASS" in capsys.readouterr().out


def test_cli_ab_exits_1_on_a_failing_verdict(tmp_path: Path):
    store = tmp_path / "c.jsonl"
    for r in (_rec(BASELINE, "a", 8000, 90.0), _rec("v", "a", 6000, 70.0)):
        C.append_record(store, r)
    assert main(["ab", "--variant", "v", "--store", str(store)]) == 1


def test_cli_cost_reports_not_measured_on_an_empty_store(tmp_path: Path, capsys):
    assert main(["cost", "--store", str(tmp_path / "none.jsonl")]) == 0
    assert "aucun run capturé" in capsys.readouterr().out
