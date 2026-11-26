"""#2899 (#2443.10, décision 11/10) — le REJEU NOCTURNE des échantillons de production anonymisés.

Hors CI : le module n'est lancé que par le planificateur nocturne (`python -m app.eval.chat_samples_replay`),
jamais collecté ici comme un test d'intégration. Désactivé sans clé : zéro appel réseau, zéro modèle.
Chaque réponse rejouée est lue par les détecteurs DÉTERMINISTES du dépôt (`chat_content_guards`) ; un échantillon qui
n'est pas anonyme n'est jamais rejoué.
"""

from __future__ import annotations

import pytest

from app.eval import chat_samples_replay as replay
from app.eval.chat_prod_samples import ProdSample, ProdSampleReport, ProdSampleStatus


def _report(*texts: str) -> ProdSampleReport:
    return ProdSampleReport(status=ProdSampleStatus.OK, samples=[ProdSample(t, "2026-10-16") for t in texts])


@pytest.fixture
def key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-not-a-real-key")
    monkeypatch.delenv(replay.ENABLED_ENV, raising=False)


class _Spy:
    def __init__(self) -> None:
        self.loaded = 0
        self.played: list[str] = []

    async def load(self, limit: int) -> ProdSampleReport:
        self.loaded += 1
        return _report("liste mes contacts chez ACME", "prépare une relance pour mon dernier contact")

    async def play(self, text: str) -> str | None:
        self.played.append(text)
        return "Voici la liste."


@pytest.mark.asyncio
async def test_without_a_model_key_nothing_runs_and_nothing_is_called(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    spy = _Spy()
    out = await replay.run_samples_replay(load=spy.load, play_turn=spy.play)
    assert out.status == "not_configured" and out.exit_code == 0
    assert spy.loaded == 0 and spy.played == []


@pytest.mark.asyncio
async def test_a_switch_turns_it_off_even_with_a_key(key: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(replay.ENABLED_ENV, "false")
    spy = _Spy()
    out = await replay.run_samples_replay(load=spy.load, play_turn=spy.play)
    assert out.status == "disabled" and spy.loaded == 0


@pytest.mark.asyncio
async def test_clean_samples_are_replayed_and_a_clean_reply_is_not_a_violation(key: None) -> None:
    spy = _Spy()
    out = await replay.run_samples_replay(load=spy.load, play_turn=spy.play)
    assert out.status == "ok" and out.replayed == 2 and out.violations == [] and out.exit_code == 0
    assert len(spy.played) == 2


@pytest.mark.asyncio
async def test_a_sample_that_leaks_is_never_replayed_only_counted(key: None) -> None:
    played: list[str] = []

    async def load(_limit: int) -> ProdSampleReport:
        return _report("écris à marc@acme.example pour demain", "liste mes contacts")

    async def play(text: str) -> str | None:
        played.append(text)
        return "ok"

    out = await replay.run_samples_replay(load=load, play_turn=play)
    assert played == ["liste mes contacts"] and out.not_anonymous == 1 and out.replayed == 1


@pytest.mark.asyncio
async def test_a_reply_that_sends_the_user_to_an_empty_page_is_a_violation_by_rank_never_by_text(key: None) -> None:
    async def load(_limit: int) -> ProdSampleReport:
        return _report("donne-moi mon plan", "liste mes contacts")

    async def play(text: str) -> str | None:
        if "plan" in text:
            return "Va dans le menu Actions, puis dans Plan, puis ouvre le détail pour le voir."
        return "Voici la liste."

    out = await replay.run_samples_replay(load=load, play_turn=play)
    assert out.exit_code == 1 and [v["sample_rank"] for v in out.violations] == [1]
    assert all(set(v) == {"sample_rank", "rule"} for v in out.violations)  # ni texte de question, ni texte de réponse


@pytest.mark.asyncio
async def test_a_bridge_that_is_off_is_unmeasured_not_zero_and_the_cap_bounds_the_night(key: None) -> None:
    async def off(_limit: int) -> ProdSampleReport:
        return ProdSampleReport(status=ProdSampleStatus.UNAVAILABLE)

    spy = _Spy()
    out = await replay.run_samples_replay(load=off, play_turn=spy.play)
    assert out.status == "unavailable" and out.measured is False and out.exit_code == 0 and spy.played == []

    async def many(_limit: int) -> ProdSampleReport:
        return _report(*[f"liste {i}" for i in range(50)])

    out = await replay.run_samples_replay(load=many, play_turn=spy.play, max_samples=5)
    assert out.replayed == 5 and out.skipped == 45


@pytest.mark.asyncio
async def test_a_turn_that_fails_is_named_failed_never_judged_clean(key: None) -> None:
    async def load(_limit: int) -> ProdSampleReport:
        return _report("liste mes contacts")

    async def play(_text: str) -> str | None:
        return None

    out = await replay.run_samples_replay(load=load, play_turn=play)
    assert out.failed == 1 and out.replayed == 0


@pytest.mark.asyncio
async def test_each_replayed_reply_is_scored_without_carrying_its_text(key: None) -> None:
    """#2899 (#2278.13) — le rejeu note chaque réponse sur les dimensions que le tour permet de juger ; le bilan
    compte, par dimension, les réponses évaluées et les basses, sans jamais porter la question ni la réponse."""
    out = await replay.run_samples_replay(
        load=_Spy().load, play_turn=_play_with(lambda _t: "Excellente question ! C'est garanti à 100 %, absolument !")
    )
    scores = out.dimension_scores
    assert scores["posture"] == {"evaluated": 2, "low": 2}
    assert scores["security"]["evaluated"] == 2 and scores["security"]["low"] == 0
    assert "depth" not in scores or scores["depth"]["evaluated"] == 0  # pas d'outil dans le rejeu : non évaluable
    assert "Excellente" not in str(out.as_dict()) and "liste mes contacts" not in str(out.as_dict())


@pytest.mark.asyncio
async def test_a_low_score_is_reported_but_never_a_violation(key: None) -> None:
    out = await replay.run_samples_replay(
        load=_Spy().load, play_turn=_play_with(lambda _t: "Excellente question ! C'est garanti à 100 %, absolument !")
    )
    assert out.violations == [] and out.exit_code == 0


def _play_with(make):
    async def play(text: str) -> str | None:
        return make(text)

    return play
