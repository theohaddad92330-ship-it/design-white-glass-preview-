"""#4736 lot G — les packs pays sont BRANCHÉS de bout en bout, pas seulement codés.

Le motif qui revient dans le dépôt : du code juste, testé, que personne n'appelle.
Ici on prouve la chaîne entière pour chaque pays du lot, en cherchant l'APPELANT :

    registre COUNTRY_PACKS → get_active_pack → collect_country_signals / suggest_registry_entities
    → phase1_research (analyse) et companies (autocomplétion)

et on prouve que la garde LIT quelque chose (les appelants sont lus dans leur source).
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from app.services.country_packs import (
    COUNTRY_PACKS,
    collect_country_signals,
    empty_signals,
    get_active_pack,
    list_supported_countries,
    suggest_registry_entities,
)

# Les sept pays de #4736 : FR est le défaut (aucun pack, par conception), les six autres ont un pack.
LOT_PACKS = ("BE", "CH", "LU", "US", "DE", "GB", "ES")
APP = Path(__file__).resolve().parents[1] / "app"


@pytest.mark.parametrize("code", LOT_PACKS)
def test_every_lot_country_is_registered_and_active(code: str) -> None:
    assert code in COUNTRY_PACKS
    assert get_active_pack(code) is COUNTRY_PACKS[code]
    assert get_active_pack(code.lower()) is COUNTRY_PACKS[code]
    assert code in {row["code"] for row in list_supported_countries()}


def test_france_is_covered_by_the_default_path_not_by_a_pack() -> None:
    """FR est le chemin par défaut (recherche-entreprises, BODACC, France Travail) :
    aucun pack, et c'est voulu — un pack FR ne doublerait que la source."""
    assert get_active_pack("FR") is None
    assert "FR" not in COUNTRY_PACKS


@pytest.mark.asyncio
@pytest.mark.parametrize("code", LOT_PACKS)
async def test_pipeline_entry_reaches_the_pack(code: str, monkeypatch: pytest.MonkeyPatch) -> None:
    """``collect_country_signals`` (l'unique entrée du pipeline) appelle bien le pack du pays."""
    sentinel = empty_signals(code)
    sentinel["hits"] = [
        {"url": f"https://example.test/{code}", "title": "t", "description": "", "category": "x", "source": "t"}
    ]
    spy = AsyncMock(return_value=sentinel)
    monkeypatch.setattr(type(COUNTRY_PACKS[code]), "collect_signals", spy)
    out = await collect_country_signals(code, "Acme", ident=None)
    assert out is sentinel
    spy.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("code", LOT_PACKS)
async def test_autocomplete_entry_reaches_the_pack(code: str, monkeypatch: pytest.MonkeyPatch) -> None:
    """``suggest_registry_entities`` (l'autocomplétion) appelle bien le pack du pays."""
    entity = {"source": "t", "country": code, "name": "Acme", "registryId": "X1"}
    spy = AsyncMock(return_value=[entity])
    monkeypatch.setattr(type(COUNTRY_PACKS[code]), "suggest", spy)
    assert await suggest_registry_entities(code, "Acme") == [entity]
    spy.assert_awaited_once()


@pytest.mark.parametrize("code", LOT_PACKS)
def test_every_pack_injects_a_prompt_fragment_naming_its_country(code: str) -> None:
    """L'appelant de phase1_research injecte ``prompt_fragment`` : il doit exister, et nommer le pays."""
    pack = COUNTRY_PACKS[code]
    fragment = pack.local_vocabulary().get("prompt_fragment", "")
    assert fragment.strip()
    assert pack.country_name.split()[0].lower() in fragment.lower()


def test_the_callers_are_really_in_the_source() -> None:
    """La garde sait dire NON : si un appelant disparaît, un pack redevient du code mort."""
    research = (APP / "routers/phase1_research.py").read_text(encoding="utf-8")
    assert "get_active_pack(req.country)" in research
    assert "collect_country_signals(req.country" in research
    assert 'local_vocabulary().get("prompt_fragment"' in research
    companies = (APP / "routers/companies.py").read_text(encoding="utf-8")
    assert "suggest_registry_entities(code" in companies
    assert "get_active_pack(code)" in companies


@pytest.mark.parametrize("code", ("DE", "GB", "ES"))
def test_new_packs_never_claim_a_resolution_they_do_not_have(code: str) -> None:
    """Pack bêta = zéro réseau, contrat jamais « vérifié » : le badge s'allume, rien de facturé."""
    meta = COUNTRY_PACKS[code].metadata()
    assert meta["status"] == "beta"
    assert meta["contract"] == "documented"


@pytest.mark.asyncio
@pytest.mark.parametrize("code", ("DE", "GB", "ES"))
async def test_new_packs_are_zero_network_noop(code: str, monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    def _boom(*_a: object, **_k: object) -> None:
        raise AssertionError("pack bêta : aucun appel réseau permis")

    monkeypatch.setattr(httpx, "AsyncClient", _boom)
    pack = COUNTRY_PACKS[code]
    assert await pack.registry_lookup("Acme") is None
    assert await pack.suggest("Acme") == []
    assert await pack.collect_signals("Acme") == empty_signals(code)
    assert await collect_country_signals(code, "Acme") == empty_signals(code)


@pytest.mark.parametrize("code", ("DE", "GB", "ES"))
def test_new_packs_state_remote_and_compliance(code: str) -> None:
    """Chaque pack porte sa conformité et son vocabulaire de télétravail ; sa section COMPLIANCE existe."""
    pack = COUNTRY_PACKS[code]
    ontology = pack.entity_ontology()
    assert ontology.get("legalForms")
    assert "remote" in pack.local_vocabulary()["prompt_fragment"].lower()
    compliance = (APP / "services/country_packs/COMPLIANCE.md").read_text(encoding="utf-8")
    assert f"(pack {code})" in compliance
