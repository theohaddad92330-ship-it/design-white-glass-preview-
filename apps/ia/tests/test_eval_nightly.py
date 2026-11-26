"""#2975 / #2440.82 — le rejeu NOCTURNE des évals IA (décision Louis 11/10 : automatique,
plafond de coût, arrêt au plafond, alerte si régression contre la référence, désactivable)."""

from __future__ import annotations

import json
from datetime import date
from typing import Any

import pytest

from app.eval import nightly
from app.eval.golden import list_goldens, resolve_analysis


def _good_state(slug: str) -> dict[str, Any]:
    golden = next(g for g in list_goldens() if g.slug == slug)
    return resolve_analysis(golden)


def _runner(costs: dict[str, float | None], *, bad: set[str] = frozenset()):
    calls: list[str] = []

    async def run_live(company: str, slug: str):
        calls.append(slug)
        state = _good_state_hallucinated() if slug in bad else _good_state(slug)
        return state, costs.get(slug, 0.5)

    run_live.calls = calls  # type: ignore[attr-defined]
    return run_live


def _good_state_hallucinated() -> dict[str, Any]:
    from app.eval.golden import load_fixture

    return load_fixture("hallucinated.analysis")


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for key in ("EVAL_NIGHTLY_ENABLED", "EVAL_NIGHTLY_MAX_COST_USD"):
        monkeypatch.delenv(key, raising=False)


def test_desactive_par_la_cle_aucun_appel(monkeypatch):
    monkeypatch.setenv("EVAL_NIGHTLY_ENABLED", "false")
    run_live = _runner({})
    out = nightly.run_nightly(run_live=run_live, today=date(2026, 10, 12))
    assert out.status == "disabled"
    assert run_live.calls == []
    assert out.exit_code == 0


def test_plafond_par_defaut_prudent_et_valeur_invalide_retombe_au_defaut(monkeypatch):
    assert nightly.max_cost_usd() == nightly.DEFAULT_MAX_COST_USD
    monkeypatch.setenv("EVAL_NIGHTLY_MAX_COST_USD", "abc")
    assert nightly.max_cost_usd() == nightly.DEFAULT_MAX_COST_USD
    monkeypatch.setenv("EVAL_NIGHTLY_MAX_COST_USD", "-3")
    assert nightly.max_cost_usd() == nightly.DEFAULT_MAX_COST_USD
    monkeypatch.setenv("EVAL_NIGHTLY_MAX_COST_USD", "1.5")
    assert nightly.max_cost_usd() == 1.5


def test_arret_au_plafond_les_comptes_restants_sont_nommes(monkeypatch):
    monkeypatch.setenv("EVAL_NIGHTLY_MAX_COST_USD", "1.0")
    run_live = _runner({})  # 0,5 $ par compte
    out = nightly.run_nightly(run_live=run_live, today=date(2026, 10, 12))
    assert len(run_live.calls) == 2
    assert out.status == "stopped_at_cap"
    assert out.spent_usd == pytest.approx(1.0)
    assert len(out.skipped) == len(list_goldens()) - 2
    assert set(out.skipped).isdisjoint(out.ran)


def test_la_rotation_change_chaque_nuit_pour_couvrir_tous_les_comptes(monkeypatch):
    monkeypatch.setenv("EVAL_NIGHTLY_MAX_COST_USD", "0.5")
    first = _runner({})
    nightly.run_nightly(run_live=first, today=date(2026, 10, 12))
    second = _runner({})
    nightly.run_nightly(run_live=second, today=date(2026, 10, 13))
    assert first.calls != second.calls


def test_cout_non_mesure_arrete_le_rejeu_jamais_compte_comme_zero():
    run_live = _runner({s.slug: None for s in list_goldens()})
    out = nightly.run_nightly(run_live=run_live, today=date(2026, 10, 12))
    assert len(run_live.calls) == 1
    assert out.status == "stopped_cost_unmeasured"
    assert out.spent_usd is None


def test_regression_contre_la_reference_alerte_exit_1():
    first = nightly.rotation(list_goldens(), date(2026, 10, 12))[0].slug
    run_live = _runner({}, bad={first})
    out = nightly.run_nightly(run_live=run_live, today=date(2026, 10, 12), max_goldens=1)
    assert out.regressions
    assert out.status == "regression"
    assert out.exit_code == 1


def test_sans_regression_exit_0():
    out = nightly.run_nightly(run_live=_runner({}), today=date(2026, 10, 12), max_goldens=1)
    assert out.regressions == []
    assert out.exit_code == 0


def test_resume_ne_contient_aucun_nom_de_fournisseur():
    out = nightly.run_nightly(run_live=_runner({}), today=date(2026, 10, 12), max_goldens=1)
    blob = json.dumps(out.as_dict()).lower()
    for vendor in ("anthropic", "openai", "firecrawl", "apollo", "brave", "pappers"):
        assert vendor not in blob
