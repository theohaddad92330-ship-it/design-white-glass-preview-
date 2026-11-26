"""Contrat ``MarketBrief`` côté IA (marchés locaux, lot L0, 04/10/2026).

Le modèle pydantic est le miroir du zod ; la copie embarquée du JSON Schema est
celle que lit l'endpoint. Ce fichier tient : la parité des clés (à toute
profondeur), la fermeture du contrat, le refus du mélange France/Suisse, et la
validité du fixture de Lille contre LE JSON Schema et contre le modèle.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft7Validator

from app.contracts.shared_schemas import VENDORED_DIR
from app.models.market_brief import MarketBrief

_SCHEMA = json.loads((VENDORED_DIR / "market-brief.schema.json").read_text(encoding="utf-8"))
_FIXTURE = json.loads(
    (Path(__file__).resolve().parents[3] / "packages/contracts/src/market-brief/lille.fixture.json").read_text(
        encoding="utf-8"
    )
)


def _brief(**over: object) -> dict:
    brief = copy.deepcopy(_FIXTURE)
    brief.update(over)
    return brief


def test_the_pydantic_model_mirrors_the_json_schema():
    generated = MarketBrief.model_json_schema()
    assert set(generated["properties"]) == set(_SCHEMA["properties"])
    assert set(generated["required"]) == set(_SCHEMA["required"])
    zone = generated["$defs"]["Zone"]
    assert set(zone["properties"]) == set(_SCHEMA["properties"]["zone"]["properties"])
    grid = generated["$defs"]["PriceGrid"]
    assert set(grid["properties"]) == set(_SCHEMA["properties"]["price_grid"]["properties"])
    assert set(grid["required"]) == set(_SCHEMA["properties"]["price_grid"]["required"])


def test_the_vendored_copy_is_the_shared_schema():
    shared = Path(__file__).resolve().parents[3] / "packages/shared/schemas/market-brief.schema.json"
    assert shared.read_bytes() == (VENDORED_DIR / "market-brief.schema.json").read_bytes()


def test_the_lille_fixture_is_valid_against_the_schema_and_the_model():
    assert list(Draft7Validator(_SCHEMA).iter_errors(_brief())) == []
    MarketBrief.model_validate(_brief())


def test_the_model_is_closed_like_the_contract():
    with pytest.raises(ValueError):
        MarketBrief.model_validate(_brief(colonne_brute="x"))


@pytest.mark.parametrize(
    "zone",
    [
        {"departments": []},
        {"cantons": ["VD"]},
        {"scope": "suisse"},
        {"scope": "suisse", "departments": [], "cantons": []},
    ],
)
def test_france_and_switzerland_are_never_mixed(zone: dict):
    brief = _brief()
    brief["zone"] = {**brief["zone"], **zone}
    with pytest.raises(ValueError):
        MarketBrief.model_validate(brief)


def test_a_swiss_zone_with_cantons_only_is_valid():
    brief = _brief()
    brief["zone"] = {**brief["zone"], "scope": "suisse", "departments": [], "cantons": ["VD", "GE"]}
    MarketBrief.model_validate(brief)
