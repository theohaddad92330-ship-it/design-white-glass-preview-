"""#1933.10 / #1903.24 — Laura ne redirige jamais vers Découvrir sans résultat.

Le trou que le registre nommait (1903.24) : ``find_accounts`` prépare des
CRITÈRES sans jamais vérifier qu'un seul compte y répond — contrairement à
``propose_guided_action`` (``_deep_link_count``, 15/09/2026), qui refuse déjà un
lien mesuré à zéro. Cette proposition-ci n'avait pas son garde-fou.

``_find_accounts_count`` réutilise le VRAI moteur (``_run_account_search`` →
``discover_registry``), avec la MÊME borne à trois issues que le reste du 15/09 :

  > 0       → la proposition est gardée telle quelle ;
  = 0 MESURÉ → la proposition est refusée, une erreur le dit ;
  non mesuré → la proposition est gardée telle quelle, exactement comme avant.

Le piège propre à Découvrir : une liste de candidats vide ne prouve pas un
« zéro marché » — elle peut venir d'une source en panne ou sans clé
(``degraded`` sans ``kind``, `company_filters.degrade_kind`). Seul un
``degraded`` où CHAQUE entrée porte un ``kind`` (« la source a répondu ») rend
le zéro digne de confiance ; une seule entrée SANS ``kind`` (un vrai défaut)
retombe sur « non mesuré ».

Le mode Signaux n'est pas mesurable du tout : ``discover_registry`` ne filtre
pas dessus (`app/routers/discover.py:543-545`), donc toute proposition qui
porte ``signals`` reste inchangée, budget non consommé.
"""

from __future__ import annotations

import asyncio

import pytest

from app.services import chat_tools

USER = "55555555-5555-4555-8555-555555555555"


@pytest.fixture(autouse=True)
def _clear_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DEEP_LINK_COUNT_DISABLED", raising=False)
    monkeypatch.delenv("DEEP_LINK_COUNT_BUDGET_S", raising=False)


async def _find(**tool_input: object) -> dict:
    return await chat_tools.execute_chat_tool(
        "find_accounts", {"sectors": ["health"], **tool_input}, user_id=USER, profile_data=None
    )


def _stub(monkeypatch: pytest.MonkeyPatch, result: dict) -> None:
    async def fake(_tool_input: dict, *, profile_data: dict | None) -> dict:
        return result

    monkeypatch.setattr(chat_tools, "_run_account_search", fake)


@pytest.mark.asyncio
async def test_a_measured_zero_blocks_the_proposal(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, {"items": [], "degraded": []})
    result = await _find()
    assert "proposal" not in result, result
    assert "aucune entreprise" in result["error"].lower()


@pytest.mark.asyncio
async def test_a_positive_measured_count_still_proposes(monkeypatch: pytest.MonkeyPatch) -> None:
    # Témoin positif du n°1 : sans lui, le refus pourrait être systématique.
    _stub(monkeypatch, {"items": [{"name": "FREE SAS"}], "degraded": []})
    result = await _find()
    assert "error" not in result, result
    assert result["proposal"]["action"] == "find_accounts"


@pytest.mark.asyncio
async def test_a_source_fault_makes_an_empty_list_unmeasured(monkeypatch: pytest.MonkeyPatch) -> None:
    # `degraded` porte une entrée SANS `kind` : un vrai défaut (clé absente,
    # panne réseau) — la liste vide ne prouve rien sur le marché.
    _stub(monkeypatch, {"items": [], "degraded": [{"source": "pappers", "reason": "missing_api_key"}]})
    result = await _find()
    assert "error" not in result, result
    assert result["proposal"]["action"] == "find_accounts"


@pytest.mark.asyncio
async def test_a_clean_no_match_kind_still_blocks(monkeypatch: pytest.MonkeyPatch) -> None:
    # Toutes les entrées portent un `kind` : chaque source a RÉPONDU, le zéro
    # est digne de confiance.
    _stub(
        monkeypatch,
        {
            "items": [],
            "degraded": [
                {"source": "pappers", "reason": "no_match", "kind": "no-match"},
                {"source": "recherche-entreprises", "reason": "no_match", "kind": "no-match"},
            ],
        },
    )
    result = await _find()
    assert "proposal" not in result, result


@pytest.mark.asyncio
async def test_signals_mode_is_never_counted(monkeypatch: pytest.MonkeyPatch) -> None:
    async def explode(*_a: object, **_k: object) -> dict:
        raise AssertionError("le mode Signaux ne doit jamais appeler le moteur registre")

    monkeypatch.setattr(chat_tools, "_run_account_search", explode)
    result = await _find(signals=["hiring"])
    assert "error" not in result, result
    assert result["proposal"]["action"] == "find_accounts"


@pytest.mark.asyncio
async def test_a_count_over_budget_still_proposes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEP_LINK_COUNT_BUDGET_S", "0.01")

    async def slow(_tool_input: dict, *, profile_data: dict | None) -> dict:
        await asyncio.sleep(0.3)
        return {"items": [], "degraded": []}

    monkeypatch.setattr(chat_tools, "_run_account_search", slow)
    result = await _find()
    assert "error" not in result, result


@pytest.mark.asyncio
async def test_the_kill_switch_makes_it_a_strict_no_op(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEP_LINK_COUNT_DISABLED", "true")

    async def explode(*_a: object, **_k: object) -> dict:
        raise AssertionError("zéro appel réseau attendu, le compte est coupé")

    monkeypatch.setattr(chat_tools, "_run_account_search", explode)
    result = await _find()
    assert "error" not in result, result
    assert result["proposal"]["action"] == "find_accounts"
