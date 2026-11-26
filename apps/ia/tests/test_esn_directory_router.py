"""Étage 1 du référentiel ESN — la résolution d'un nom brut (tome 4 §17)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import esn_directory as router_mod
from app.services.homonym_disambiguation import Candidate, HomonymResolution, score_candidate


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _candidate(siren: str, name: str, naf: str) -> Candidate:
    return Candidate(siren=siren, name=name, nafCode=naf, isActive=True)


def _resolution(status: str, *, selected: str | None = None, candidates: list[Candidate] | None = None):
    scored = [score_candidate("x", c) for c in (candidates or [])]
    return HomonymResolution(status=status, selectedSiren=selected, candidates=scored)


@pytest.fixture
def resolver(monkeypatch):
    answers: dict[str, HomonymResolution] = {}

    async def fake(name: str, **_: object) -> HomonymResolution:
        return answers.get(name, _resolution("none"))

    monkeypatch.setattr(router_mod, "resolve_company_identity", fake)
    return answers


def test_a_resolved_name_carries_its_registry_facts(client, resolver) -> None:
    resolver["Karytis"] = _resolution(
        "selected", selected="552100554", candidates=[_candidate("552100554", "KARYTIS", "6202A")]
    )
    entry = client.post("/esn/resolve", json={"names": ["Karytis"]}).json()["entries"][0]
    assert entry["status"] == "resolved"
    assert entry["siren"] == "552100554"
    assert entry["nafCode"] == "6202A"


def test_an_unresolved_name_is_kept_with_its_reason(client, resolver) -> None:
    """« Une entrée non résolue est conservée avec sa raison, jamais supprimée. »"""
    entry = client.post("/esn/resolve", json={"names": ["Cabinet Inconnu"]}).json()["entries"][0]
    assert entry["status"] == "unresolved"
    assert entry["siren"] is None
    assert entry["reason"]


def test_a_foreign_legal_form_is_named_before_any_network_call(client, resolver) -> None:
    """MANAVA LTD n'est pas « introuvable » : elle n'est pas française. Chercher
    dans le registre FR rendrait un échec qui se lirait comme une panne."""
    entry = client.post("/esn/resolve", json={"names": ["MANAVA LTD"]}).json()["entries"][0]
    assert entry["status"] == "foreign"
    assert "étrangère" in (entry["reason"] or "")
    # Aucune résolution n'a été demandée pour ce nom.
    assert "MANAVA LTD" not in resolver


def test_the_naf_breaks_a_tie_when_exactly_one_homonym_is_an_esn(client, resolver) -> None:
    resolver["Ambivalent"] = _resolution(
        "ambiguous",
        candidates=[_candidate("111111111", "AMBIVALENT", "6202A"), _candidate("222222222", "AMBIVALENT", "5610A")],
    )
    entry = client.post("/esn/resolve", json={"names": ["Ambivalent"]}).json()["entries"][0]
    assert entry["status"] == "resolved"
    assert entry["siren"] == "111111111"


def test_the_naf_never_forces_a_choice_when_none_is_an_esn(client, resolver) -> None:
    """Forcer produirait un SIREN faux, sur lequel tout le référentiel
    s'appuierait ensuite."""
    resolver["Deux Restos"] = _resolution(
        "ambiguous",
        candidates=[_candidate("111111111", "DEUX RESTOS", "5610A"), _candidate("222222222", "DEUX RESTOS", "5630Z")],
    )
    entry = client.post("/esn/resolve", json={"names": ["Deux Restos"]}).json()["entries"][0]
    assert entry["status"] == "ambiguous"
    assert entry["siren"] is None
    assert "2 entités" in (entry["reason"] or "")


def test_two_esn_homonyms_stay_ambiguous(client, resolver) -> None:
    resolver["Double ESN"] = _resolution(
        "ambiguous",
        candidates=[_candidate("111111111", "DOUBLE ESN", "6202A"), _candidate("222222222", "DOUBLE ESN", "6201Z")],
    )
    entry = client.post("/esn/resolve", json={"names": ["Double ESN"]}).json()["entries"][0]
    assert entry["status"] == "ambiguous"
    assert "NAF informatique" in (entry["reason"] or "")


def test_one_name_that_blows_up_does_not_take_the_batch_down(client, monkeypatch) -> None:
    async def boom(name: str, **_: object):
        if name == "Boom":
            raise RuntimeError("registre HS")
        return _resolution("selected", selected="552100554", candidates=[_candidate("552100554", name, "6202A")])

    monkeypatch.setattr(router_mod, "resolve_company_identity", boom)
    entries = client.post("/esn/resolve", json={"names": ["Boom", "Sain"]}).json()["entries"]
    by_name = {e["inputName"]: e for e in entries}
    # `pending` et non `unresolved` : une panne n'est pas un verdict, et
    # l'écrire « non résolue » ferait cesser de réessayer.
    assert by_name["Boom"]["status"] == "pending"
    assert by_name["Sain"]["status"] == "resolved"
