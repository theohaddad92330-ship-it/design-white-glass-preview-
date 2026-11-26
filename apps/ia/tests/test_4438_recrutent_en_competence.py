"""#4438.1 (recette prod 22/10) — « tous les comptes qui recrutent en data en France ».

8 comptes retenus parce que leur RAISON SOCIALE contenait « data » : Laura envoyait « data » dans `keywords`,
que le registre lit comme un nom d'entreprise. « Qui recrutent en X » = des OFFRES d'emploi X (compétence ou
famille), jamais un match sur le nom. La garde sait dire NON : une vraie raison sociale reste un filtre de nom.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import _split_technologies, execute_chat_tool


def test_4438_1_hiring_reads_keywords_as_a_skill_not_a_name() -> None:
    techs, keywords = _split_technologies(None, "data", reclassify=False, hiring=True)
    assert techs == ["data"]
    assert keywords == ""


def test_4438_1_hiring_drops_filler_words_and_keeps_the_skill() -> None:
    techs, keywords = _split_technologies(None, "recrutent data", reclassify=False, hiring=True)
    assert techs == ["data"]
    assert keywords == ""


def test_4438_1_without_hiring_a_framed_name_stays_a_name() -> None:
    # SAIT DIRE NON — sans intention « recrutent », « Sopra » reste une raison sociale.
    techs, keywords = _split_technologies(None, "Sopra", reclassify=True, hiring=False)
    assert techs == []
    assert keywords == "Sopra"


def test_4438_1_without_hiring_data_alone_is_untouched() -> None:
    techs, keywords = _split_technologies(None, "data", reclassify=False, hiring=False)
    assert techs == []
    assert keywords == "data"


class _Response:
    def __init__(self) -> None:
        self.candidates: list[dict[str, Any]] = []
        self.degraded: list[dict[str, Any]] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


@pytest.mark.asyncio
async def test_4438_1_the_registry_never_receives_the_skill_as_a_company_name(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[Any] = []

    async def _fake(req: Any) -> Any:
        seen.append(req)
        return _Response()

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    await execute_chat_tool(
        "run_account_search",
        {"keywords": "data", "signals": ["hiring"]},
        user_id="u-1",
        profile_data=None,
    )
    assert seen, "la recherche par compétence doit partir (jamais l'erreur « précise un secteur »)"
    filters = seen[0].filters
    assert not (filters.freetext or "").strip()
    # #4438.1 (recette prod 23/10) — le métier « data » se lit en intitulés d'offres (data engineer, analyst…),
    # plus en mot littéral que le référentiel ne connaît pas.
    # Borné à SKILL_MAX_TERMS = 5 (#4579 L5 : 3 → 5) ; le métier « data » en porte quatre.
    assert list(filters.technologiesObserved or []) == [
        "data engineer",
        "data analyst",
        "data scientist",
        "ingénieur data",
    ]
