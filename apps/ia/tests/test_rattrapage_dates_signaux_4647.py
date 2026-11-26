"""#4647 — le script de rattrapage : compte d'abord, segment signaux seul, idempotent, humain intact."""

import asyncio
import importlib.util
import sys
from datetime import date
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "rattrapage_dates_signaux_4647", Path(__file__).resolve().parents[1] / "scripts" / "rattrapage_dates_signaux_4647.py"
)
assert _SPEC and _SPEC.loader
script = importlib.util.module_from_spec(_SPEC)
sys.modules[_SPEC.name] = script
_SPEC.loader.exec_module(script)

TODAY = date(2026, 10, 27)

# Tel que l'ancien code l'avait écrit : « 23 octobre 2026 » lu 1er janvier.
_WRONG = {
    "signal": "Offre Indeed", "date": "23 octobre 2026", "type": "recrutement",
    "freshness": "archive", "temporal_status": "STALE", "freshness_window_days": 180,
    "valid_from": "2026-01-01", "valid_to": "2026-06-30",
}  # fmt: skip
_OK = {"signal": "Budget voté", "date": "2026-09-01", "type": "budget", "valid_from": "2026-09-01"}


def _accounts(rows):
    async def gen(_after):
        for r in rows:
            yield r

    return gen


def test_simulation_compte_et_n_ecrit_rien() -> None:
    wrote: list[object] = []

    async def write(plan):
        wrote.append(plan)
        return 0

    rows = [{"id": "a", "recent_signals": [_WRONG, _OK], "raw_signals": None}, {"id": "b", "recent_signals": [_OK]}]
    plan = asyncio.run(script.run(apply=False, accounts=_accounts(rows), write=write, today=TODAY))
    assert (plan.accounts_seen, plan.accounts_concerned, plan.signals_concerned) == (2, 1, 1)
    assert wrote == []


def test_la_valeur_est_corrigee_et_les_couches_recalculees() -> None:
    plan = script.build_plan([{"id": "a", "recent_signals": [_WRONG], "raw_signals": [_WRONG]}], TODAY)
    [change] = plan.changes
    [fixed] = change.signals
    assert (fixed["valid_from"], fixed["freshness"], fixed["temporal_status"]) == ("2026-10-23", "current", "RECENT")
    assert change.layers["counts"]["historical"] == 0
    assert change.raw_signals == change.signals


def test_idempotent_un_compte_corrige_n_est_plus_concerne() -> None:
    first = script.build_plan([{"id": "a", "recent_signals": [_WRONG]}], TODAY)
    again = script.build_plan([{"id": "a", "recent_signals": first.changes[0].signals}], TODAY)
    assert again.accounts_concerned == 0 and again.changes == []


def test_signal_non_concerne_reste_octet_pour_octet() -> None:
    [change] = script.build_plan([{"id": "a", "recent_signals": [_OK, _WRONG]}], TODAY).changes
    assert change.signals[0] == _OK


def test_une_correction_humaine_n_est_jamais_ecrasee() -> None:
    human = {**_WRONG, "corrected": True}
    plan = script.build_plan([{"id": "a", "recent_signals": [human]}], TODAY)
    assert plan.accounts_concerned == 0 and plan.skipped_human == 1


def test_sans_drapeau_le_script_refuse() -> None:
    import pytest

    with pytest.raises(SystemExit):
        script.main([])
