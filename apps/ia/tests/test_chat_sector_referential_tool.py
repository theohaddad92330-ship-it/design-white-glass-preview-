"""#3193.2 (épopée #3217, lot E3 28/09 suite) — `search_sector_referential`.

Le référentiel sectoriel Bellum existait déjà côté RAG
(`search_dataforge_rag_chunks`, exposé par `/rag/dataforge/search`) — jamais
présenté au chat jusqu'ici. Ce lot ajoute le relais : un outil de LECTURE
SEULE, câblé dans `CHAT_TOOLS`, qui cite ce qu'il trouve réellement.

Ce que ces tests verrouillent :
  1. le nom interne du pack (DataForge/ORION) n'atteint jamais le nom, la
     description ou le schéma de l'outil (#3193.5) ;
  2. une requête vide est refusée AVANT tout appel ;
  3. un résultat réel est relayé sans invention, borné et flag de coupure ;
  4. une liste vide dit honnêtement qu'aucun repère ne correspond ;
  5. `cited_sources` ne cite QUE les repères qui portent un titre réel ;
  6. la couche `dataforge` du reçu de connaissance passe à `consulted`
     seulement sur cette preuve.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.prompts.context_transparency import build_knowledge_receipt
from app.services import dataforge_rag_chunks
from app.services.chat_tools import CHAT_TOOLS, cited_sources, execute_chat_tool

USER = "22222222-2222-4222-8222-222222222222"


def _tool() -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == "search_sector_referential")


def test_le_nom_interne_du_pack_natteint_jamais_loutil():
    tool = _tool()
    blob = str(tool).lower()
    assert "dataforge" not in blob
    assert "orion" not in blob


def test_une_requete_vide_est_refusee_avant_tout_appel(monkeypatch: pytest.MonkeyPatch):
    spy = AsyncMock(return_value=[])
    monkeypatch.setattr(dataforge_rag_chunks, "search_dataforge_rag_chunks", spy)

    result = await_execute("search_sector_referential", {"query": "   "})

    assert result == {"error": "Il me faut une question ou un thème pour chercher dans le référentiel sectoriel."}
    spy.assert_not_called()


@pytest.mark.asyncio
async def test_un_resultat_reel_est_relaye_sans_invention_et_borne(monkeypatch: pytest.MonkeyPatch):
    rows = [
        {
            "chunk_id": f"CK-{i}",
            "titre": f"Repère {i}",
            "texte": f"Contenu {i}",
            "entreprise": None,
            "niveau_confiance": "[confirmé]",
        }
        for i in range(6)
    ]
    spy = AsyncMock(return_value=rows)
    monkeypatch.setattr(dataforge_rag_chunks, "search_dataforge_rag_chunks", spy)

    result = await execute_chat_tool(
        "search_sector_referential", {"query": "cybersécurité budgets"}, user_id=USER, profile_data=None
    )

    assert len(result["results"]) == 5
    assert result["truncated"] is True
    assert result["results"][0] == {
        "title": "Repère 0",
        "content": "Contenu 0",
        "company": None,
        "confidence": "[confirmé]",
    }
    # sur-lecture d'UN (6) pour distinguer 5 pile de 6+ — même patron que
    # `find_free_slots` (GA-317).
    spy.assert_awaited_once_with("cybersécurité budgets", top_k=6)


@pytest.mark.asyncio
async def test_aucun_resultat_le_dit_honnetement(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(dataforge_rag_chunks, "search_dataforge_rag_chunks", AsyncMock(return_value=[]))

    result = await execute_chat_tool(
        "search_sector_referential", {"query": "un thème sans repère"}, user_id=USER, profile_data=None
    )

    assert result == {"results": [], "message": "Aucun repère sectoriel ne correspond assez à cette recherche."}


def test_cited_sources_ne_cite_que_les_reperes_avec_un_titre_reel():
    output = {
        "results": [
            {"title": "Repère A", "content": "..."},
            {"title": "", "content": "sans titre, jamais cité"},
        ]
    }
    sources = cited_sources("search_sector_referential", output)
    assert sources == [{"kind": "dataforge", "label": "Repère A"}]


def test_cited_sources_vide_sur_erreur_ou_liste_vide():
    assert cited_sources("search_sector_referential", {"error": "panne"}) == []
    assert cited_sources("search_sector_referential", {"results": []}) == []


def test_la_couche_dataforge_du_recu_passe_a_consulted_sur_cette_preuve():
    from tests.test_knowledge_receipt import _base_context

    context = _base_context()
    context["sources"] = [{"kind": "dataforge", "label": "Repère A"}]
    receipt = build_knowledge_receipt(context)
    assert receipt["dataforge"] == {"status": "consulted"}
    assert build_knowledge_receipt(_base_context())["dataforge"] == {"status": "not_requested"}


def await_execute(name: str, tool_input: dict) -> dict:
    """Petit pont synchrone pour le test de refus AVANT tout appel réseau —
    aucune coroutine à attendre puisque le refus est immédiat."""
    import asyncio

    return asyncio.run(execute_chat_tool(name, tool_input, user_id=USER, profile_data=None))
