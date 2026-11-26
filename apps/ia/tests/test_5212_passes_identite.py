"""Lot 789 (#5212) — une recherche par compétence ne paie pas deux fois l'identité d'un même employeur, et une offre
écartée par un filtre qui ne demande pas l'identité (âge, compétence absente) n'en déclenche aucune."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import pytest

from app.services import discover_skill_offers as skill

TODAY = datetime.now(UTC).date()


def _offer(title: str, employer: str, *, days_old: int = 1, dept: str = "59") -> dict:
    return {
        "title": title,
        "employer": employer,
        "siren": None,
        "department": dept,
        "city": "Lille",
        "date": (TODAY - timedelta(days=days_old)).isoformat(),
        "url": f"https://x.example/{employer}/{title}/{days_old}",
        "source": "adzuna",
    }


def _install(monkeypatch: pytest.MonkeyPatch, rows: list[dict]) -> list[str]:
    calls: list[str] = []

    async def harvest(skills, zone, profile, *, deadline=None, **_kw):  # noqa: ANN001, ANN003
        return skill.SkillHarvest(offers=[{**r, "skill": skills[0]} for r in rows])

    async def resolve(name, siren=None, **_kw):  # noqa: ANN001, ANN003
        calls.append(name)
        return skill.EmployerResolution({"siren": "123456789", "name": name, "department": "59"})

    async def silent(*_a, **_k):  # noqa: ANN002, ANN003
        return None

    monkeypatch.setattr(skill, "harvest_skill_offers", harvest)
    monkeypatch.setattr(skill, "resolve_employer", resolve)
    monkeypatch.setattr(skill.source_silence, "warn_unused", silent)
    return calls


@pytest.mark.asyncio
async def test_deux_passes_meme_employeur_une_seule_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _install(monkeypatch, [_offer("Dév Vue", "ACME SAS")])
    skill.begin_identity_memo()
    await skill.find_skill_accounts(["vue"], ["59"], {}, deadline=None)
    with skill.named_pass("widen_department"):
        await skill.find_skill_accounts(["vue"], ["59"], {}, deadline=None)
    assert calls == ["ACME SAS"]


@pytest.mark.asyncio
async def test_sans_memo_chaque_passe_resout(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _install(monkeypatch, [_offer("Dév Vue", "ACME SAS")])
    skill._IDENTITY_MEMO.set(None)
    await skill.find_skill_accounts(["vue"], ["59"], {}, deadline=None)
    await skill.find_skill_accounts(["vue"], ["59"], {}, deadline=None)
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_un_echec_transitoire_n_est_pas_memorise(monkeypatch: pytest.MonkeyPatch) -> None:
    _install(monkeypatch, [_offer("Dév Vue", "ACME SAS")])
    n = {"c": 0}

    async def flaky(name, siren=None, **_kw):  # noqa: ANN001, ANN003
        n["c"] += 1
        return skill.EmployerResolution(None, "unavailable")

    monkeypatch.setattr(skill, "resolve_employer", flaky)
    skill.begin_identity_memo()
    await skill.find_skill_accounts(["vue"], ["59"], {}, deadline=None)
    await skill.find_skill_accounts(["vue"], ["59"], {}, deadline=None)
    assert n["c"] == 2


def test_offre_trop_vieille_ou_sans_la_competence_filtree_avant_toute_identite() -> None:
    """Le filtre (`_reject_reason`) est pur : il tourne à la moisson, avant `resolve_employer`."""
    cutoff = TODAY - timedelta(days=90)
    old = _offer("Dév Vue", "ACME", days_old=400)
    absent = _offer("Boulanger", "ACME")
    assert skill._reject_reason(old, "vue", frozenset({"59"}), cutoff, None, False) == "tooOld"
    assert skill._reject_reason(absent, "vue", frozenset({"59"}), cutoff, None, False) == "skillAbsent"


@pytest.mark.asyncio
async def test_journal_de_duree_par_passe(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    _install(monkeypatch, [_offer("Dév Vue", "ACME SAS")])
    skill.begin_identity_memo()
    with caplog.at_level(logging.INFO):
        with skill.named_pass("exact"):
            await skill.find_skill_accounts(["vue"], ["59"], {}, deadline=None)
    assert any("discover pass=exact ms=" in r.message and "kept=1 identity_calls=1" in r.message for r in caplog.records)
