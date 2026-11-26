"""#3852 (recette prod 08/10, 2e passe) — « le besoin n'a pas été retrouvé
dans les besoins enregistrés » alors qu'il est listé sur l'écran.

`find_needs` ne pouvait chercher QUE par texte (titre, compétence, compte) —
sans moyen de résoudre un besoin DÉJÀ connu (son identifiant, lu plus haut
dans le fil ou sur une fiche ouverte) autrement qu'en retapant son titre, que
le découpage en mots peut rater. Ce fichier verrouille :

  1. `need_id`, quand il est fourni, est transmis au pont — jamais réduit à
     une recherche texte ;
  2. sans `need_id`, le comportement texte existant est inchangé.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
NEED_ID = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


@pytest.mark.asyncio
async def test_a_known_need_id_is_passed_through_rather_than_reduced_to_a_text_search(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    async def _find_needs(user_id: str, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"data": [{"id": NEED_ID, "title": "Java/Spring Boot", "account_name": "LVMH"}]}

    monkeypatch.setattr(bellum_api, "find_needs", _find_needs)
    out = await execute_chat_tool("find_needs", {"need_id": NEED_ID}, user_id=USER, profile_data=None)

    assert captured["need_id"] == NEED_ID
    assert out["needs"][0]["id"] == NEED_ID


@pytest.mark.asyncio
async def test_without_a_need_id_the_existing_text_search_is_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def _find_needs(user_id: str, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"data": []}

    monkeypatch.setattr(bellum_api, "find_needs", _find_needs)
    await execute_chat_tool("find_needs", {"query": "Java Spring Boot LVMH"}, user_id=USER, profile_data=None)

    assert captured["need_id"] is None
    assert captured["query"] == "Java Spring Boot LVMH"
