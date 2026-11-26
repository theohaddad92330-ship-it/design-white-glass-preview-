"""#4289.4 / #4289.5 (recette prod 23/10, « alternatives à Thales, secteur défense ») — « aucune alternative
mesurablement plus accessible », 0 candidat, `access_path: null`.

- candidats : une ENTITÉ FRANÇAISE (SIREN propre) est un fait quand le compte visé est une TÊTE DE GROUPE ;
- les partenaires écartés sont NOMMÉS avec la RAISON ;
- chaque alternative porte son `access_path` (partenaire, rang 2, via…) ou dit pourquoi elle n'en a pas : jamais `null`.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services.chat_tools import _alternative_easier_facts
from tests.test_chat_alternatives_partner_access_3247 import _run


def test_french_entity_is_a_fact_when_the_target_is_a_group_head() -> None:
    candidate = {"siren": "111", "name": "Filiale défense"}
    none = _alternative_easier_facts(candidate, original_department="", original_headcount="")
    assert not any("entité française" in f for f in none)
    facts = _alternative_easier_facts(candidate, original_department="", original_headcount="", target_group_head=True)
    assert any("entité française" in f and "tête de groupe" in f for f in facts)
    # Sans SIREN, rien n'est affirmé.
    assert not _alternative_easier_facts({"name": "X"}, original_department="", original_headcount="", target_group_head=True)


@pytest.mark.asyncio
async def test_a_partner_set_aside_is_named_with_its_reason(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(
        monkeypatch, {"111": {"paths": [], "is_workspace_partner": {"name": "Alternative SAS", "stage": "actif"}}}
    )
    assert result["set_aside"] == [
        {"name": "Alternative SAS", "reason": "partenaire déclaré de ton espace — un partenaire n'est pas un client à prospecter"}
    ]
    assert result["set_aside_partners"] == ["Alternative SAS"]


@pytest.mark.asyncio
async def test_an_alternative_without_partner_path_says_so_never_null(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.chat_tools._pool_crm_relation_signal", AsyncMock(return_value={"matched": True}))
    known_empty = await _run(monkeypatch, {"111": {"paths": [], "is_workspace_partner": None}})
    assert known_empty["alternatives"], known_empty
    assert known_empty["alternatives"][0]["access_path"] == "aucun partenaire déclaré sur ce compte"
    unknown = await _run(monkeypatch, {})
    for alt in unknown["alternatives"]:
        assert alt["access_path"] == "non vérifié — compte hors de ton portefeuille"
    down = await _run(monkeypatch, None)
    for alt in down["alternatives"]:
        assert alt["access_path"] == "non vérifié — la lecture des partenaires n'a pas répondu"
