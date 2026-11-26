"""Self-consistency A1 — double dérivation des jugements clés.

Couvre le contrat du chantier :

- accord passe 1 / passe 2 → confiance haute par section ;
- divergence → confiance moyenne/basse + ``divergences[]`` exposant QUOI et les
  valeurs des DEUX passes — et la valeur retenue reste la passe 1 ;
- échec de la 2e passe → « non mesurée » (unmeasured), jamais un run cassé ;
- coût de la 2e passe tracké (usages remontés → ``_api_metrics.token_usage`` →
  cost_eur côté worker) ;
- kill-switch break-glass ``SELF_CONSISTENCY_DISABLED`` (défaut absent = ON) ;
- intégration Phase 4 : ``data.selfConsistency`` exposé, passe 1 jamais écrasée.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services.claude_service import TokenUsage
from app.services.self_consistency import (
    CONFIDENCE_HIGH,
    CONFIDENCE_LOW,
    CONFIDENCE_MEDIUM,
    CONFIDENCE_UNMEASURED,
    compare_contacts,
    compare_plays,
    compare_score,
    is_enabled,
    measure_self_consistency,
    overall_confidence,
    top_priority_contacts,
)
from tests.test_phase4_plan import GO_BREAKDOWN, STOP_BREAKDOWN, _plan_dispatch

_USAGE = TokenUsage(input_tokens=100, output_tokens=200, model="claude-sonnet-5", cost_usd=0.01)


# ── Kill-switch (politique zéro-flag : ON par défaut) ────────────────────────


def test_enabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SELF_CONSISTENCY_DISABLED", raising=False)
    assert is_enabled() is True


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "yes", "on"])
def test_kill_switch_disables(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("SELF_CONSISTENCY_DISABLED", value)
    assert is_enabled() is False


@pytest.mark.parametrize("value", ["", "0", "false", "off"])
def test_kill_switch_falsy_values_stay_on(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("SELF_CONSISTENCY_DISABLED", value)
    assert is_enabled() is True


# ── Comparaison score /25 + verdict (déterministe) ───────────────────────────


def test_score_agreement_is_high_confidence() -> None:
    section = compare_score({"score": 20, "verdict": "GO"}, {"score": 21, "verdict": "GO"})
    assert section["agree"] is True
    assert section["confidence"] == CONFIDENCE_HIGH
    assert "divergence" not in section


def test_score_same_verdict_wide_spread_is_medium_with_values() -> None:
    section = compare_score({"score": 20, "verdict": "GO"}, {"score": 24, "verdict": "GO"})
    assert section["agree"] is True
    assert section["confidence"] == CONFIDENCE_MEDIUM
    # La divergence expose QUOI + les valeurs des 2 passes.
    assert section["divergence"] == {"what": "score", "pass1": 20, "pass2": 24}


def test_score_verdict_flip_is_low_confidence_with_both_passes() -> None:
    section = compare_score({"score": 20, "verdict": "GO"}, {"score": 16, "verdict": "PRUDENT"})
    assert section["agree"] is False
    assert section["confidence"] == CONFIDENCE_LOW
    assert section["divergence"]["what"] == "verdict"
    assert section["divergence"]["pass1"] == {"score": 20, "verdict": "GO"}
    assert section["divergence"]["pass2"] == {"score": 16, "verdict": "PRUDENT"}


# ── Comparaison plays / contacts (ensembliste, normalisée accents/casse) ─────


def test_plays_full_overlap_is_high() -> None:
    section = compare_plays(["VINCI Énergies", "Boursorama", "SG Cyber"], ["vinci energies", "SG CYBER", "Boursorama"])
    assert section["agree"] is True
    assert section["confidence"] == CONFIDENCE_HIGH
    assert section["overlap"] == 3


def test_plays_partial_overlap_flags_divergence_with_both_sides() -> None:
    section = compare_plays(["A Corp", "B Corp", "C Corp"], ["A Corp", "B Corp", "Z Corp"])
    assert section["agree"] is False
    assert section["confidence"] == CONFIDENCE_MEDIUM  # 2/3 ≥ 0.5
    assert section["divergence"] == {"what": "plays", "pass1": ["C Corp"], "pass2": ["Z Corp"]}


def test_plays_no_overlap_is_low() -> None:
    section = compare_plays(["A Corp"], ["Z Corp"])
    assert section["confidence"] == CONFIDENCE_LOW


def test_contacts_thresholds() -> None:
    pass1 = ["Anna A", "Bob B", "Carl C", "Dan D", "Eve E"]
    # 4/5 confirmés → haute.
    high = compare_contacts(pass1, ["Anna A", "Bob B", "Carl C", "Dan D", "Xavier X"])
    assert high["agree"] is True and high["confidence"] == CONFIDENCE_HIGH
    # 3/5 → moyenne, divergence exposée des deux côtés.
    medium = compare_contacts(pass1, ["Anna A", "Bob B", "Carl C", "X X", "Y Y"])
    assert medium["agree"] is False and medium["confidence"] == CONFIDENCE_MEDIUM
    assert medium["divergence"]["pass1"] == ["Dan D", "Eve E"]
    assert medium["divergence"]["pass2"] == ["X X", "Y Y"]
    # 1/5 → basse.
    low = compare_contacts(pass1, ["Anna A", "V V", "W W", "X X", "Y Y"])
    assert low["confidence"] == CONFIDENCE_LOW


def test_overall_confidence_is_worst_measured_and_unmeasured_when_nothing_is() -> None:
    assert (
        overall_confidence(
            {
                "score": {"confidence": CONFIDENCE_HIGH},
                "plays": {"confidence": CONFIDENCE_LOW},
                "contacts": {"confidence": CONFIDENCE_UNMEASURED},
            }
        )
        == CONFIDENCE_LOW
    )
    assert overall_confidence({"score": {"confidence": CONFIDENCE_UNMEASURED}}) == CONFIDENCE_UNMEASURED


def test_top_priority_contacts_ranks_by_priority_and_caps_at_five() -> None:
    contacts = [
        {"fullName": "F Six", "priority": 6},
        {"fullName": "A One", "priority": 1},
        {"fullName": "C Three", "priority": 3},
        {"fullName": "B Two", "priority": 2},
        {"fullName": "E Five", "priority": 5},
        {"fullName": "D Four", "priority": 4},
        {"title": "sans nom"},
    ]
    assert top_priority_contacts(contacts) == ["A One", "B Two", "C Three", "D Four", "E Five"]


# ── Orchestrateur (2es passes mockées) ───────────────────────────────────────

_ACCOUNT_DATA = {
    "priorityPerimeters": [{"name": "SG Cyber"}, {"name": "Boursorama"}],
    "angles": [{"title": "Modernisation SI"}],
    "recentSignals": [{"signal": "Recrutement data", "source": "France Travail"}],
    "pains": [{"pain": "Dette technique"}],
}
_CONTACTS = [
    {"fullName": "Anna A", "title": "DSI", "priority": 1},
    {"fullName": "Bob B", "title": "CTO", "priority": 2},
]
_PLAYS = [{"perimeter": "SG Cyber"}, {"perimeter": "Boursorama"}]


def _agreeing_llm() -> AsyncMock:
    async def dispatch(*_args, **kwargs):
        name = kwargs.get("prompt_name", "")
        if name == "self_consistency_evaluation":
            return {"evaluation": {"scoreBreakdown": GO_BREAKDOWN}}, _USAGE
        if name == "self_consistency_plays":
            return {"plays": [{"perimeter": "SG Cyber", "angle": "Modernisation SI"}, {"perimeter": "Boursorama", "angle": "Modernisation SI"}]}, _USAGE
        if name == "self_consistency_contacts":
            return {"contacts": [{"name": "Anna A", "role": "décideur"}, {"name": "Bob B", "role": "prescripteur"}]}, _USAGE
        raise AssertionError(f"unexpected prompt {name}")

    return AsyncMock(side_effect=dispatch)


async def test_measure_agreement_high_confidence_and_cost_tracked() -> None:
    llm = _agreeing_llm()
    block, usages = await measure_self_consistency(
        llm_call=llm,
        system_prompt="SYSTEM",
        company_name="SG",
        profile_data={"companyName": "MonESN"},
        account_data=_ACCOUNT_DATA,
        evaluation={"score": 20, "verdict": "GO"},
        plays=_PLAYS,
        contacts=_CONTACTS,
    )
    assert block is not None
    assert block["sections"]["score"]["confidence"] == CONFIDENCE_HIGH
    assert block["sections"]["plays"]["confidence"] == CONFIDENCE_HIGH
    assert block["sections"]["contacts"]["confidence"] == CONFIDENCE_HIGH
    assert block["overallConfidence"] == CONFIDENCE_HIGH
    assert block["divergences"] == []
    # Transparence : le dossier/chat peut dire « score confirmé par double passe ».
    assert any("Score confirmé par double passe" in n for n in block["notes"])
    # Coût de la 2e passe tracké : 3 appels remontés à l'appelant (→ token_usage → cost_eur).
    assert len(usages) == 3
    assert block["secondPassCostUsd"] == pytest.approx(0.03)
    assert llm.await_count == 3


async def test_measure_divergence_flags_values_and_never_overwrites_pass1() -> None:
    async def dispatch(*_args, **kwargs):
        name = kwargs.get("prompt_name", "")
        if name == "self_consistency_evaluation":
            return {"evaluation": {"scoreBreakdown": STOP_BREAKDOWN}}, _USAGE  # 6/25 STOP vs GO
        if name == "self_consistency_plays":
            return {"plays": [{"perimeter": "Autre BU", "angle": "X"}]}, _USAGE
        if name == "self_consistency_contacts":
            return {"contacts": [{"name": "Zoé Z", "role": "décideur"}]}, _USAGE
        raise AssertionError(name)

    evaluation = {"score": 20, "verdict": "GO"}
    block, _usages = await measure_self_consistency(
        llm_call=AsyncMock(side_effect=dispatch),
        system_prompt="SYSTEM",
        company_name="SG",
        profile_data={},
        account_data=_ACCOUNT_DATA,
        evaluation=evaluation,
        plays=_PLAYS,
        contacts=_CONTACTS,
    )
    assert block is not None
    score = block["sections"]["score"]
    assert score["agree"] is False and score["confidence"] == CONFIDENCE_LOW
    # Les deux passes sont exposées (quoi + valeurs) dans divergences[].
    sections_flagged = {d["section"] for d in block["divergences"]}
    assert sections_flagged == {"score", "plays", "contacts"}
    score_div = next(d for d in block["divergences"] if d["section"] == "score")
    assert score_div["pass1"] == {"score": 20, "verdict": "GO"}
    assert score_div["pass2"] == {"score": 6, "verdict": "STOP"}
    assert block["overallConfidence"] == CONFIDENCE_LOW
    assert any("Divergence détectée sur le score" in n for n in block["notes"])
    # La passe 2 ne modifie JAMAIS la valeur retenue (passe 1).
    assert evaluation == {"score": 20, "verdict": "GO"}


async def test_measure_second_pass_failure_is_unmeasured_never_raises() -> None:
    llm = AsyncMock(side_effect=RuntimeError("Claude down"))
    block, usages = await measure_self_consistency(
        llm_call=llm,
        system_prompt="SYSTEM",
        company_name="SG",
        profile_data={},
        account_data=_ACCOUNT_DATA,
        evaluation={"score": 20, "verdict": "GO"},
        plays=_PLAYS,
        contacts=_CONTACTS,
    )
    assert block is not None
    for section in block["sections"].values():
        assert section["confidence"] == CONFIDENCE_UNMEASURED
        assert section["agree"] is None
    assert block["overallConfidence"] == CONFIDENCE_UNMEASURED
    assert usages == []
    assert any("non mesurée" in n for n in block["notes"])


async def test_measure_unparsable_second_pass_still_counts_cost() -> None:
    """Une sortie passe 2 inparsable = « non mesurée », mais l'appel a été
    facturé → son usage DOIT remonter dans le coût."""
    llm = AsyncMock(return_value=({}, _USAGE))
    block, usages = await measure_self_consistency(
        llm_call=llm,
        system_prompt="SYSTEM",
        company_name="SG",
        profile_data={},
        account_data=_ACCOUNT_DATA,
        evaluation={"score": 20, "verdict": "GO"},
        plays=_PLAYS,
        contacts=_CONTACTS,
    )
    assert block is not None
    assert all(s["confidence"] == CONFIDENCE_UNMEASURED for s in block["sections"].values())
    assert len(usages) == 3  # 3 appels facturés malgré les sorties vides
    assert block["secondPassCostUsd"] == pytest.approx(0.03)


async def test_measure_skips_sections_without_pass1_values() -> None:
    llm = _agreeing_llm()
    block, _usages = await measure_self_consistency(
        llm_call=llm,
        system_prompt="SYSTEM",
        company_name="SG",
        profile_data={},
        account_data={},
        evaluation=None,  # pas de score passe 1
        plays=[],  # pas de plays
        contacts=[],  # pas de contacts
    )
    assert block is not None
    assert all(s["confidence"] == CONFIDENCE_UNMEASURED for s in block["sections"].values())
    # Aucun appel LLM gaspillé quand il n'y a rien à confirmer.
    assert llm.await_count == 0


async def test_measure_kill_switch_returns_none_and_no_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SELF_CONSISTENCY_DISABLED", "true")
    llm = _agreeing_llm()
    block, usages = await measure_self_consistency(
        llm_call=llm,
        system_prompt="SYSTEM",
        company_name="SG",
        profile_data={},
        account_data=_ACCOUNT_DATA,
        evaluation={"score": 20, "verdict": "GO"},
        plays=_PLAYS,
        contacts=_CONTACTS,
    )
    assert block is None
    assert usages == []
    assert llm.await_count == 0


# ── Intégration Phase 4 (endpoint) ───────────────────────────────────────────

_PLAN_REQUEST = {
    "account_id": "abc-123",
    "account_data": {
        "sector": "Transport",
        "sources": {"tags": {"sector": "PUBLIC"}},
        "angles": [{"title": "Modernisation SI"}],
    },
    "contacts": [{"fullName": "Jean Dupont", "title": "DSI", "priority": 1}],
    "profile_data": {"companyName": "MonESN"},
}


def test_phase4_exposes_self_consistency_block(client: TestClient) -> None:
    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=_plan_dispatch(),
    ):
        res = client.post("/phase/4/plan", json=_PLAN_REQUEST)
    assert res.status_code == 200
    data = res.json()["data"]
    sc = data["selfConsistency"]
    # Score : la 2e passe (même GO_BREAKDOWN) confirme la passe 1 → haute.
    assert sc["sections"]["score"]["agree"] is True
    assert sc["sections"]["score"]["confidence"] == "high"
    # Contacts : « Jean Dupont » confirmé par la re-dérivation → haute.
    assert sc["sections"]["contacts"]["confidence"] == "high"
    # Plays : pas de priorityPerimeters dans ce dossier → rien à confirmer.
    assert sc["sections"]["plays"]["confidence"] == "unmeasured"
    assert sc["overallConfidence"] == "high"
    assert any("double passe" in n for n in sc["notes"])
    # La valeur retenue reste la passe 1.
    assert data["evaluation"]["score"] == 20
    assert data["evaluation"]["verdict"] == "GO"


def test_phase4_divergent_second_pass_flags_but_keeps_pass1(client: TestClient) -> None:
    dispatch = _plan_dispatch(
        {"self_consistency_evaluation": {"evaluation": {"scoreBreakdown": STOP_BREAKDOWN}}}
    )
    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=dispatch,
    ):
        res = client.post("/phase/4/plan", json=_PLAN_REQUEST)
    assert res.status_code == 200
    data = res.json()["data"]
    sc = data["selfConsistency"]
    assert sc["sections"]["score"]["agree"] is False
    assert sc["sections"]["score"]["confidence"] == "low"
    div = next(d for d in sc["divergences"] if d["section"] == "score")
    assert div["pass1"]["verdict"] == "GO" and div["pass2"]["verdict"] == "STOP"
    # RÈGLE DURE : la passe 2 n'écrase jamais — le verdict shippé reste la passe 1.
    assert data["evaluation"]["score"] == 20
    assert data["evaluation"]["verdict"] == "GO"
    assert data["priorityScore"] == 7  # /10 réconcilié depuis la passe 1, pas la 2


def test_phase4_plays_second_pass_fires_when_dossier_has_perimeters(client: TestClient) -> None:
    dispatch = _plan_dispatch(
        {
            "self_consistency_plays": {
                "plays": [{"perimeter": "SG Cyber", "angle": "Modernisation SI"}]
            }
        }
    )
    request = dict(
        _PLAN_REQUEST,
        account_data=dict(
            _PLAN_REQUEST["account_data"],
            priorityPerimeters=[{"name": "SG Cyber", "tier": "P1"}],
        ),
    )
    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=dispatch,
    ) as mock_claude:
        res = client.post("/phase/4/plan", json=request)
    assert res.status_code == 200
    data = res.json()["data"]
    # Passe 1 : un play sur « SG Cyber » ; la re-dérivation le confirme → haute.
    assert data["plays"][0]["perimeter"] == "SG Cyber"
    assert data["selfConsistency"]["sections"]["plays"]["agree"] is True
    assert data["selfConsistency"]["sections"]["plays"]["confidence"] == "high"
    # 12 génération + 3 secondes passes (évaluation + plays + contacts).
    assert mock_claude.call_count == 15


def test_phase4_kill_switch_omits_block_and_extra_calls(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SELF_CONSISTENCY_DISABLED", "1")
    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=_plan_dispatch(),
    ) as mock_claude:
        res = client.post("/phase/4/plan", json=_PLAN_REQUEST)
    assert res.status_code == 200
    assert "selfConsistency" not in res.json()["data"]
    # Break-glass : aucune 2e passe → exactement les 12 appels de génération.
    assert mock_claude.call_count == 12


def test_phase4_second_pass_crash_never_breaks_the_run(client: TestClient) -> None:
    base_dispatch = _plan_dispatch()

    async def dispatch(*args, **kwargs):
        if str(kwargs.get("prompt_name", "")).startswith("self_consistency"):
            raise RuntimeError("Claude down")
        return await base_dispatch(*args, **kwargs)

    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=dispatch,
    ):
        res = client.post("/phase/4/plan", json=_PLAN_REQUEST)
    # Échec gracieux : le run aboutit, les sections tentées sont « non mesurées ».
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["evaluation"]["verdict"] == "GO"
    sc = data["selfConsistency"]
    assert sc["sections"]["score"]["confidence"] == "unmeasured"
    assert sc["sections"]["contacts"]["confidence"] == "unmeasured"
    assert sc["overallConfidence"] == "unmeasured"


def test_phase4_second_pass_cost_lands_in_api_metrics(client: TestClient) -> None:
    """Le coût de la 2e passe est additionné au token_usage de la phase — le
    worker l'accumule dans cost_eur sans changement de contrat."""
    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=_plan_dispatch(),
    ) as mock_claude:
        res = client.post("/phase/4/plan", json=_PLAN_REQUEST)
    assert res.status_code == 200
    usage = res.json()["meta"]["token_usage"]
    # 12 appels de génération + 2 secondes passes (évaluation + contacts —
    # plays sans périmètre → pas d'appel), chacun 100 in / 200 out / $0.01.
    assert mock_claude.call_count == 14
    assert usage["input_tokens"] == 100 * 14
    assert usage["cost_usd"] == pytest.approx(0.01 * 14)


def test_16_10_evaluation_second_pass_ceiling_is_4000() -> None:
    from app.services import self_consistency

    assert self_consistency._EVAL_MAX_TOKENS == 4000
