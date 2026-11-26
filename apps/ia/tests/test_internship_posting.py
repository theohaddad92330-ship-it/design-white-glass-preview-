"""#4044 — parité avec ``isInternshipPosting`` : le MÊME jeu de cas que le TS."""

import json
from pathlib import Path

import pytest

from app.services.internship_posting import drop_internship_postings, is_internship_posting

_CASES = json.loads(
    (Path(__file__).resolve().parents[3] / "packages/contracts/src/fixtures/internship-postings.json").read_text(
        encoding="utf-8"
    )
)


@pytest.mark.parametrize("case", _CASES["yes"])
def test_stage_est_reconnu(case):
    assert is_internship_posting(case["title"], case.get("contractType")) is True


@pytest.mark.parametrize("case", _CASES["no"])
def test_pas_un_stage(case):
    assert is_internship_posting(case["title"], case.get("contractType")) is False


def test_drop_ecarte_les_stages_et_garde_le_reste():
    rows = [{"title": "Stage Data"}, {"title": "Architecte cloud"}, {"intitule": "Stagiaire DevOps"}, "x"]
    kept = drop_internship_postings(rows, title_keys=("title", "intitule"))
    assert kept == [{"title": "Architecte cloud"}, "x"]


def test_signaux_deja_stockes_les_stages_de_recrutement_sortent():
    from app.services.internship_posting import drop_internship_signal_rows

    stage = {"signal": "CS27 - Bac 5 - Stage Supply Chain H/F", "type": "recrutement"}
    cdi = {"signal": "Architecte cloud", "type": "recrutement"}
    news = {"signal": "Programme de stage solidaire annoncé", "type": "other"}
    assert drop_internship_signal_rows([stage, cdi, news]) == [cdi, news]
    assert drop_internship_signal_rows(None) is None
