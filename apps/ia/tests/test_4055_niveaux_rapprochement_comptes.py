"""#4055 (BEL-AM-1210-004) — trois niveaux de rapprochement sur une recherche de comptes : déjà dans la base
(SIREN), groupe d'une filiale connue, rapprochement à vérifier (nom proche). Jamais de fusion ni d'écriture."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import chat_tools
from app.services.chat_tools import _attach_workspace_match_levels, _match_key
from app.services.known_shape_gate import shape_read_from_tool


class _Query:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def __getattr__(self, _name: str):  # select/eq/neq/limit : chaînage sans effet
        return lambda *a, **k: self

    async def aexecute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self._rows)


class _Client:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def table(self, _name: str) -> _Query:
        return _Query(self._rows)


def test_match_key_ignores_accents_case_and_legal_form() -> None:
    assert _match_key("Société Générale SA") == _match_key("societe generale")
    assert _match_key("") == ""


@pytest.mark.asyncio
async def test_levels_are_proposed_not_asserted(monkeypatch: pytest.MonkeyPatch) -> None:
    owned = [
        {"id": "o1", "company_name": "Orange Business", "siren": "111111111", "group_head_siren": "380129866"},
        {"id": "o2", "company_name": "Doctolib SAS", "siren": "222222222", "group_head_siren": None},
    ]
    monkeypatch.setattr("app.services.supabase_client.get_supabase", lambda: _Client(owned))
    items = [
        {"name": "Orange SA", "siren": "380129866"},
        {"name": "DOCTOLIB", "siren": "999999999"},
        {"name": "Inconnue", "siren": "123456789"},
        {"name": "Déjà là", "siren": "1", "account_id": "x"},
    ]
    await _attach_workspace_match_levels(items, "u1")
    assert items[0]["workspace_match"] == {"level": "group_known", "account_id": "o1", "name": "Orange Business"}
    assert items[1]["workspace_match"] == {"level": "to_verify", "account_id": "o2", "name": "Doctolib SAS"}
    assert "workspace_match" not in items[2]
    assert "workspace_match" not in items[3]


@pytest.mark.asyncio
async def test_read_failure_sets_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    def _boom() -> None:
        raise RuntimeError("db down")

    monkeypatch.setattr("app.services.supabase_client.get_supabase", _boom)
    items = [{"name": "X", "siren": "1"}]
    await _attach_workspace_match_levels(items, "u1")
    assert "workspace_match" not in items[0]


def test_card_says_the_level_on_the_line() -> None:
    out = {
        "items": [
            {"name": "Orange SA", "siren": "380129866", "already_in_workspace": False,
             "workspace_match": {"level": "group_known", "account_id": "o1", "name": "Orange Business"}},
            {"name": "DOCTOLIB", "siren": "9", "already_in_workspace": False,
             "workspace_match": {"level": "to_verify", "account_id": "o2", "name": "Doctolib SAS"}},
        ],
        "criteria": {}, "axes": ["Adéquation"],
    }
    card = shape_read_from_tool("run_account_search", out)
    whys = {i["name"]: i["why"] for i in card["blocks"]["account_ranking"]["items"]}
    assert "Groupe dont vous connaissez déjà une filiale : Orange Business." in whys["Orange SA"]
    assert "Rapprochement à vérifier : proche de Doctolib SAS dans votre base." in whys["DOCTOLIB"]


# Recette prod 13/10 (743aebfed8, lot W-C) — « quels comptes du secteur telecom me manquent ? » :
# « CAPGEMINI TECHNOLOGY SERVICES » marqué « Nouvelle cible » alors qu'un compte CAPGEMINI existe dans
# l'espace. Le nom du compte connu est le DÉBUT du nom de la ligne (mots entiers) : rapprochement à
# vérifier, jamais « nouvelle cible ».
@pytest.mark.asyncio
async def test_capgemini_subsidiary_name_is_to_verify_not_new_target(monkeypatch: pytest.MonkeyPatch) -> None:
    owned = [{"id": "cap", "company_name": "CAPGEMINI", "siren": "330703844", "group_head_siren": None}]
    monkeypatch.setattr("app.services.supabase_client.get_supabase", lambda: _Client(owned))
    items = [
        {"name": "CAPGEMINI TECHNOLOGY SERVICES", "siren": "479766842", "already_in_workspace": False},
        {"name": "CAPGEMINIUS CONSEIL", "siren": "111222333", "already_in_workspace": False},
    ]
    await _attach_workspace_match_levels(items, "u1")
    assert items[0]["workspace_match"] == {"level": "to_verify", "account_id": "cap", "name": "CAPGEMINI"}
    # ⚠️ SAIT DIRE NON — un préfixe de LETTRES n'est pas un préfixe de MOTS.
    assert "workspace_match" not in items[1]

    card = shape_read_from_tool("run_account_search", {"items": items, "criteria": {}, "axes": ["Adéquation"]})
    rows = {i["name"]: i for i in card["blocks"]["account_ranking"]["items"]}
    capgemini = rows["CAPGEMINI TECHNOLOGY SERVICES"]
    assert "Rapprochement à vérifier : proche de CAPGEMINI dans votre base." in capgemini["why"]
    # Jamais « Nouvelle cible » sur une ligne rapprochée : le badge d'appartenance n'est pas posé.
    assert "already_in_workspace" not in capgemini
    assert rows["CAPGEMINIUS CONSEIL"]["already_in_workspace"] is False


@pytest.mark.asyncio
async def test_short_generic_key_never_matches_by_prefix(monkeypatch: pytest.MonkeyPatch) -> None:
    owned = [{"id": "g", "company_name": "Groupe SA", "siren": "1", "group_head_siren": None}]
    monkeypatch.setattr("app.services.supabase_client.get_supabase", lambda: _Client(owned))
    items = [{"name": "Groupe Renault", "siren": "2"}]
    await _attach_workspace_match_levels(items, "u1")
    assert "workspace_match" not in items[0]
