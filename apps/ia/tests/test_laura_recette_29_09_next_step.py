"""Recette prod 29/09 (361632bac) — #3189.4 et #3195 : une réponse d'outil qui
n'offre AUCUN geste suivant laisse Laura sur une impasse, puis sur un renvoi
vers des sites. Ces tests passent par l'appelant réel (`execute_chat_tool`), là
où le modèle lit ce que l'outil a rendu."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_tools
from app.services.chat_content_guards import violates_manual_redirect_instruction
from app.services.chat_tools import execute_chat_tool


async def _web_search(monkeypatch: pytest.MonkeyPatch, hits: Any, query: str = "consultations SNCF") -> dict[str, Any]:
    async def _fake(q: str, **kwargs: Any) -> Any:
        if isinstance(hits, Exception):
            raise hits
        return hits

    monkeypatch.setattr("app.services.brave_search.search_web", _fake)
    return await execute_chat_tool("web_search", {"query": query}, user_id="u-1", profile_data=None)


async def test_web_search_results_are_sources_not_the_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    # #3189.4 — « Tu trouveras les consultations SNCF sur la page officielle » :
    # les résultats étaient des pages, relayées telles quelles à la personne.
    out = await _web_search(
        monkeypatch,
        [{"title": "Consultations fournisseurs SNCF", "description": "Avis en cours", "url": "https://example.com/c"}],
    )
    step = out["next_step"]
    assert "SOURCES" in step and "jamais" in step.lower()
    assert violates_manual_redirect_instruction(step) is False  # la consigne ne se contredit pas


async def test_web_search_with_no_result_names_the_search_and_a_gesture(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _web_search(monkeypatch, [])
    assert out["results"] == []
    step = out["next_step"]
    # LOT DATA-B.6 (15/10) — chaque `web_search` est payant : sur résultat vide, Laura PROPOSE la
    # suite (requête plus ciblée ou registre) et la personne décide ; elle ne relance plus seule.
    assert "propose" in step.lower()
    assert "ne lance pas" in step.lower()
    assert "find_accounts" in step  # le geste proposé, toujours nommé : jamais une impasse


async def test_web_search_not_configured_still_offers_a_next_step(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _web_search(monkeypatch, ValueError("no key"))
    assert "error" in out and out["next_step"]


async def test_a_tool_without_dead_end_gets_no_next_step(monkeypatch: pytest.MonkeyPatch) -> None:
    # La garde sait dire NON : un résultat normal ne reçoit aucun next_step.
    async def _dispatch(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {"accounts": [{"id": "a1"}]}

    monkeypatch.setattr(chat_tools, "_execute_chat_tool_dispatch", _dispatch)
    out = await execute_chat_tool("list_accounts", {}, user_id="u-1", profile_data=None)
    assert "next_step" not in out


async def test_unknown_account_is_never_a_dead_end(monkeypatch: pytest.MonkeyPatch) -> None:
    # #3195.1-.4 — « Zorbatek Consulting » : « pas parmi les comptes analysés… je
    # n'ai pas interrogé de source publique » puis rien.
    async def _dispatch(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {"error": "Compte introuvable dans votre portefeuille."}

    monkeypatch.setattr(chat_tools, "_execute_chat_tool_dispatch", _dispatch)
    out = await execute_chat_tool("get_account_briefing", {"account_id": "x"}, user_id="u-1", profile_data=None)
    assert out["error"] == "Compte introuvable dans votre portefeuille."
    step = out["next_step"]
    assert "web_search" in step  # lecture gratuite : elle la LANCE elle-même
    assert "analyser" in step.lower()  # et propose l'analyse du compte (payante)
    assert "pas la preuve" in step.lower()  # « non trouvé » n'est pas « n'existe pas »
    # #3859 (recette prod 09/10) — cette consigne disait « jamais lancé sans accord »,
    # qui contredit la doctrine c84 (une analyse demandée en langage naturel part
    # directement, sans carte à valider) : Laura s'appuyait sur CE texte pour proposer
    # une analyse au lieu de la lancer. Jamais une promesse de confirmation ici.
    assert "sans accord" not in step.lower()
