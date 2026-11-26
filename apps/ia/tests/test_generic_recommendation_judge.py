"""#3223 (décision Louis 11/10/2026) — le juge « recommandation générique », évalué."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.eval import generic_recommendation_judge as judge
from app.eval.chat_prod_sampling import ENV_VAR as SAMPLING_ENV

TS_SOURCE = judge.calibration_ts_path().read_text(encoding="utf-8")


def _ts_string(name: str) -> str:
    match = re.search(rf"{name}: '([^']*)'", TS_SOURCE)
    assert match, f"{name} absent du contrat"
    return match.group(1)


def _ts_number(name: str) -> int:
    match = re.search(rf"{name}\s*[:=]\s*(\d+)", TS_SOURCE)
    assert match, f"{name} absent du contrat"
    return int(match.group(1))


# ── Le contrat partagé : verdicts, jeu, calibration liée au juge courant ─────


def test_verdicts_are_the_mirror_of_the_contract():
    match = re.search(r"GENERIC_JUDGE_VERDICTS = \[([^\]]*)\]", TS_SOURCE)
    assert match
    assert tuple(re.findall(r"'([^']+)'", match.group(1))) == judge.VERDICTS


def test_label_set_is_well_formed_and_covers_every_verdict():
    cases = judge.load_label_set()
    assert len(cases) >= _ts_number("GENERIC_JUDGE_MIN_LABELLED_CASES")
    assert len({c.id for c in cases}) == len(cases), "identifiants en double"
    assert {c.label for c in cases} == set(judge.VERDICTS)
    assert all(c.answer.strip() for c in cases)


def test_calibration_belongs_to_the_current_judge_and_label_set(monkeypatch):
    """Sait dire NON : changer la consigne, le modèle ou le jeu sans re-mesurer
    fait échouer ce test — `--calibrate` (mesure) ou `--reset` (non fiable)."""
    monkeypatch.delenv("MODEL_BELLUM_GENERIC_RECOMMENDATION_JUDGE", raising=False)
    assert _ts_string("judgeVersion") == judge.judge_version()
    assert _ts_string("labelSetVersion") == judge.label_set_version()
    assert _ts_number("labelledCases") == len(judge.load_label_set())


def test_judge_version_changes_with_the_model():
    assert judge.judge_version("claude-a") != judge.judge_version("claude-b")


def test_label_set_version_changes_with_the_file(tmp_path: Path):
    copy = tmp_path / "labels.json"
    data = json.loads(judge.LABELS_PATH.read_text(encoding="utf-8"))
    copy.write_text(json.dumps(data), encoding="utf-8")
    before = judge.label_set_version(copy)
    data["cases"][0]["label"] = "specifique"
    copy.write_text(json.dumps(data), encoding="utf-8")
    assert judge.label_set_version(copy) != before


def test_the_judge_uses_the_reasoning_model_of_the_repository(monkeypatch):
    from app.services.model_policy import REASONING

    monkeypatch.delenv("MODEL_BELLUM_GENERIC_RECOMMENDATION_JUDGE", raising=False)
    assert judge.judge_model() == REASONING


# ── L'accord ─────────────────────────────────────────────────────────────────


def test_agreement_counts_agreements_and_never_converts_a_failure():
    cases = [
        judge.LabelledCase("a", "x", "generique"),
        judge.LabelledCase("b", "x", "specifique"),
        judge.LabelledCase("c", "x", "sans_recommandation"),
    ]
    got = judge.measure_agreement(cases, {"a": "generique", "b": "generique", "c": None})
    assert got == judge.Agreement(agreed=1, judged=2, failed=1)


async def test_calibrate_judges_every_labelled_case():
    seen: list[str] = []

    async def oracle(answer: str) -> str | None:
        seen.append(answer)
        return next(c.label for c in judge.load_label_set() if c.answer == answer)

    agreement = await judge.calibrate(oracle)
    cases = judge.load_label_set()
    assert len(seen) == len(cases)
    assert agreement == judge.Agreement(agreed=len(cases), judged=len(cases), failed=0)


def test_calibration_block_is_rewritten_between_markers_only(tmp_path: Path):
    target = tmp_path / "contract.ts"
    target.write_text(TS_SOURCE, encoding="utf-8")
    block = judge.render_calibration_block(
        agreement=judge.Agreement(agreed=27, judged=30, failed=0),
        model="claude-x",
        measured_at="2026-10-11",
        cases=30,
        judge="abcdefabcdef",
        labels="012345012345",
    )
    judge.write_calibration(block, target)
    written = target.read_text(encoding="utf-8")
    assert "agreed: 27," in written and "judgeVersion: 'abcdefabcdef'" in written
    assert written.count("// <generic-judge-calibration>") == 1
    # Tout ce qui est hors du bloc est intact.
    assert written.split("// <generic-judge-calibration>")[0] == TS_SOURCE.split("// <generic-judge-calibration>")[0]


def test_write_calibration_refuses_a_file_without_markers(tmp_path: Path):
    target = tmp_path / "x.ts"
    target.write_text("export const A = 1\n", encoding="utf-8")
    with pytest.raises(ValueError):
        judge.write_calibration("bloc", target)


# ── Un appel au juge ─────────────────────────────────────────────────────────


async def test_judge_answer_returns_the_closed_token(monkeypatch):
    calls: list[dict] = []

    async def fake_call(system, user, **kwargs):
        calls.append({"user": user, **kwargs})
        return judge._JudgeOutput(verdict="generique"), None

    monkeypatch.setattr("app.services.claude_service.call_claude", fake_call)
    assert await judge.judge_answer("Une réponse " + "x" * 10_000, model="claude-x") == "generique"
    assert calls[0]["prompt_name"] == judge.PROMPT_NAME
    assert len(calls[0]["user"]) < judge.MAX_ANSWER_CHARS + 200, "réponse coupée au plafond"


async def test_judge_failure_is_none_and_logs_no_content(monkeypatch, caplog):
    async def boom(*_a, **_k):
        raise RuntimeError("SECRET réponse du commercial recopiée")

    monkeypatch.setattr("app.services.claude_service.call_claude", boom)
    assert await judge.judge_answer("texte", model="claude-x") is None
    assert "SECRET" not in caplog.text
    assert "RuntimeError" in caplog.text


# ── La route ─────────────────────────────────────────────────────────────────


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)
    from app.main import app

    return TestClient(app)


def _body(n: int = 2) -> dict:
    return {"answers": [{"id": f"m{i}", "text": f"réponse {i}"} for i in range(n)]}


def test_route_is_a_strict_noop_when_sampling_is_off(client, monkeypatch):
    monkeypatch.delenv(SAMPLING_ENV, raising=False)

    async def never(*_a, **_k):
        raise AssertionError("aucun appel au modèle quand l'échantillonnage est éteint")

    monkeypatch.setattr(judge, "judge_answer", never)
    res = client.post("/eval/generic-recommendation-judge", json=_body())
    assert res.status_code == 200
    assert res.json()["data"] == {"status": "disabled"}


def test_route_judges_when_sampling_is_on(client, monkeypatch):
    monkeypatch.setenv(SAMPLING_ENV, "true")

    class _Available:
        def is_available(self) -> bool:
            return True

    monkeypatch.setattr("app.routers.reasoning_judge.resolve_dispatch", lambda *_a: (_Available(), "m"))

    async def fake_many(answers, judge_fn=None):
        return ["generique", None][: len(answers)]

    monkeypatch.setattr("app.routers.reasoning_judge.judge_many", fake_many)
    res = client.post("/eval/generic-recommendation-judge", json=_body(2))
    data = res.json()["data"]
    assert data["status"] == "judged"
    assert data["judgeVersion"] == judge.judge_version()
    assert data["verdicts"] == [{"id": "m0", "verdict": "generique"}, {"id": "m1", "verdict": None}]


def test_route_without_model_key_sends_nothing(client, monkeypatch):
    monkeypatch.setenv(SAMPLING_ENV, "true")

    class _Missing:
        def is_available(self) -> bool:
            return False

    monkeypatch.setattr("app.routers.reasoning_judge.resolve_dispatch", lambda *_a: (_Missing(), "m"))
    res = client.post("/eval/generic-recommendation-judge", json=_body())
    assert res.json()["data"] == {"status": "unavailable"}


def test_route_refuses_a_batch_over_the_hard_cap(client, monkeypatch):
    monkeypatch.setenv(SAMPLING_ENV, "true")
    res = client.post("/eval/generic-recommendation-judge", json=_body(judge.MAX_BATCH + 1))
    assert res.status_code == 422
