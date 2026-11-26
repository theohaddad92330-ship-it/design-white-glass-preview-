"""Huit outils de lecture sans aucune borne de sortie (LOT 3, Défaut A).

Vérifié sur les deux couches (le wrapper IA et le contrôleur interne NestJS) :
ni `limit`, ni pagination, ni drapeau de troncature. L'outil rendait TOUT, et
ça partait dans le contexte du modèle.

Le motif à suivre existe déjà dans le dépôt — on ne l'invente pas ici :
``find_needs`` transmet un ``limit`` (défaut 20) jusqu'au bout ; ``search_mailbox``
rend un drapeau ``truncated`` (voir ``chat_tools.py``, autour de la ligne 2950).

CE QUE CE FICHIER PROUVE, outil par outil :
1. la sortie est BORNÉE (un compte, pas une durée) ;
2. une sortie tronquée le DIT — ``truncated: True`` — pour que le modèle ne
   présente jamais un sous-ensemble comme un tout ;
3. une sortie SOUS la borne ne déclenche jamais le drapeau — la garde n'attrape
   pas ce qu'elle ne vise pas.

Pour ``get_chain_blockers`` et ``list_accounts_to_act``, la borne réelle et le
compte AVANT/APRÈS vivent côté NestJS (`copilot-bridge.controller.ts` — voir
``copilot-bridge.controller.spec.ts`` pour la preuve à cette couche) : ici on
vérifie seulement que le service IA relaie fidèlement le drapeau qu'il reçoit,
y compris son ABSENCE (une réponse plus ancienne, sans le champ, ne doit jamais
lever une exception ni mentir en disant « non tronqué »).

Garde GA-295.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(name: str, tool_input: dict | None = None) -> dict:
    return await execute_chat_tool(name, tool_input or {}, user_id=USER, profile_data=None)


# ── search_talents — la borne existe déjà (schéma NestJS, limit=20) ─────────
# ce qui manquait est le drapeau : `total` était déjà lu et jeté.


@pytest.mark.asyncio
async def test_search_talents_flags_truncation_from_the_total_already_carried(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _search(*_a: object, **_k: object) -> dict:
        return {"items": [{"id": f"c{i}", "fullName": f"Consultant {i}"} for i in range(20)], "total": 57}

    monkeypatch.setattr(bellum_api, "search_talents", _search)
    result = await _run("search_talents")
    assert len(result["talents"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_search_talents_does_not_flag_when_the_total_matches(monkeypatch: pytest.MonkeyPatch) -> None:
    """Témoin : la garde ne s'allume pas sur une liste réellement complète."""

    async def _search(*_a: object, **_k: object) -> dict:
        return {"items": [{"id": "c1", "fullName": "Consultant 1"}], "total": 1}

    monkeypatch.setattr(bellum_api, "search_talents", _search)
    result = await _run("search_talents")
    assert result["truncated"] is False


# ── search_proofs — aucune borne nulle part (TypeORM sans `.take`) ──────────


@pytest.mark.asyncio
async def test_search_proofs_caps_an_unbounded_list_and_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _proofs(*_a: object, **_k: object) -> list[dict]:
        return [{"id": f"p{i}"} for i in range(35)]

    monkeypatch.setattr(bellum_api, "usable_proofs", _proofs)
    result = await _run("search_proofs")
    assert len(result["proofs"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_search_proofs_does_not_flag_a_short_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _proofs(*_a: object, **_k: object) -> list[dict]:
        return [{"id": "p1"}, {"id": "p2"}]

    monkeypatch.setattr(bellum_api, "usable_proofs", _proofs)
    result = await _run("search_proofs")
    assert len(result["proofs"]) == 2
    assert result["truncated"] is False


# ── get_chain_blockers — la borne (5) est déjà côté NestJS ; relais du flag ──


@pytest.mark.asyncio
async def test_get_chain_blockers_relays_the_truncated_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _blockers(*_a: object, **_k: object) -> dict:
        return {"blockers": [{"chainKey": f"k{i}"} for i in range(5)], "truncated": True}

    monkeypatch.setattr(bellum_api, "chain_blockers", _blockers)
    result = await _run("get_chain_blockers")
    assert len(result["blockers"]) == 5
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_get_chain_blockers_defaults_to_not_truncated_when_the_flag_is_absent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Une réponse plus ancienne, sans le champ, ne doit jamais mentir « pas de
    troncature » en levant une exception — mais elle ne doit pas non plus
    AFFIRMER une troncature qu'elle n'a pas mesurée : `False` est le seul
    honnête par défaut ici, puisque l'absence du champ vient d'un appelant qui
    ne le portait pas encore, pas d'une mesure."""

    async def _blockers(*_a: object, **_k: object) -> dict:
        return {"blockers": [{"chainKey": "k1"}]}

    monkeypatch.setattr(bellum_api, "chain_blockers", _blockers)
    result = await _run("get_chain_blockers")
    assert result["truncated"] is False


# ── get_interventions — SQL déjà plafonné à 100, sans le dire ───────────────


@pytest.mark.asyncio
async def test_get_interventions_caps_and_flags(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _interventions(*_a: object, **_k: object) -> list[dict]:
        return [{"id": f"i{i}"} for i in range(30)]

    monkeypatch.setattr(bellum_api, "interventions", _interventions)
    result = await _run("get_interventions")
    assert len(result["interventions"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_get_interventions_does_not_flag_a_short_queue(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _interventions(*_a: object, **_k: object) -> list[dict]:
        return [{"id": "i1"}]

    monkeypatch.setattr(bellum_api, "interventions", _interventions)
    result = await _run("get_interventions")
    assert result["truncated"] is False


# ── get_mission_risks — reconstruit une liste en Python, jamais bornée ──────


@pytest.mark.asyncio
async def test_get_mission_risks_caps_and_flags(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _risks(*_a: object, **_k: object) -> dict:
        return {
            "missions": [
                {
                    "id": f"m{i}",
                    "label": f"Mission {i}",
                    "risks": ["fin proche"],
                    "ends_on": None,
                    "marginPercent": None,
                }
                for i in range(25)
            ]
        }

    monkeypatch.setattr(bellum_api, "mission_risks", _risks)
    result = await _run("get_mission_risks")
    assert len(result["missions"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_get_mission_risks_does_not_flag_a_short_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _risks(*_a: object, **_k: object) -> dict:
        return {"missions": [{"id": "m1", "label": "M1", "risks": ["x"], "ends_on": None, "marginPercent": None}]}

    monkeypatch.setattr(bellum_api, "mission_risks", _risks)
    result = await _run("get_mission_risks")
    assert result["truncated"] is False


# ── list_reactivation_pool — relayé TEL QUEL aujourd'hui, jamais borné ──────


@pytest.mark.asyncio
async def test_list_reactivation_pool_caps_entries_when_a_segment_is_asked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _pool(*_a: object, **_k: object) -> dict:
        return {"entries": [{"id": f"t{i}"} for i in range(30)]}

    monkeypatch.setattr(bellum_api, "reactivation_pool", _pool)
    result = await _run("list_reactivation_pool", {"segment": "dormant"})
    assert len(result["entries"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_list_reactivation_pool_segment_counts_are_not_a_list_to_cap(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Témoin : sans segment, la réponse est un COMPTE par segment (petit, fixe)
    — pas une liste à borner. La garde n'a rien à y attraper."""

    async def _pool(*_a: object, **_k: object) -> dict:
        return {"segments": [{"segment": "dormant", "count": 400}]}

    monkeypatch.setattr(bellum_api, "reactivation_pool", _pool)
    result = await _run("list_reactivation_pool")
    assert result == {"segments": [{"segment": "dormant", "count": 400}]}


# ── search_rfps — seule la forme LISTE (sans rfp_id) doit être bornée ───────


@pytest.mark.asyncio
async def test_search_rfps_caps_the_list_form(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _rfps(*_a: object, **_k: object) -> dict:
        return {"rfps": [{"id": f"r{i}"} for i in range(30)]}

    monkeypatch.setattr(bellum_api, "search_rfps", _rfps)
    result = await _run("search_rfps")
    assert len(result["rfps"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_search_rfps_with_an_id_is_a_single_object_never_capped(monkeypatch: pytest.MonkeyPatch) -> None:
    """Témoin : `rfp_id` fourni rend UN appel d'offres, pas une liste — la garde
    ne doit pas lui inventer un `truncated`."""

    async def _rfps(*_a: object, **_k: object) -> dict:
        return {"id": "r1", "title": "Refonte SI", "compliance": {"score": 4}}

    monkeypatch.setattr(bellum_api, "search_rfps", _rfps)
    result = await _run("search_rfps", {"rfp_id": "r1"})
    assert result == {"id": "r1", "title": "Refonte SI", "compliance": {"score": 4}}


# ── list_accounts_to_act — la borne descend côté NestJS, relais pur ─────────


@pytest.mark.asyncio
async def test_list_accounts_to_act_relays_the_truncated_flag_from_the_bridge(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _accounts(*_a: object, **_k: object) -> dict:
        return {"accounts": [{"id": f"a{i}"} for i in range(20)], "truncated": True}

    monkeypatch.setattr(bellum_api, "accounts_to_act", _accounts)
    result = await _run("list_accounts_to_act")
    assert result["accounts"] == [{"id": f"a{i}"} for i in range(20)]
    assert result["truncated"] is True
    assert result["status"] == "partial"


# ── Témoin transversal : un outil non concerné ne gagne pas un `truncated` ──


@pytest.mark.asyncio
async def test_an_unrelated_single_object_tool_never_grows_a_truncated_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """`get_account_briefing` rend UN dossier, jamais une liste : la borne ne
    doit rien lui ajouter — sinon elle attraperait ce qu'elle ne vise pas."""
    from unittest.mock import AsyncMock, MagicMock

    async def _fetch_owned_account(*_a: object, **_k: object) -> dict:
        return {"id": "acc-1", "company_name": "Client Test"}

    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))
    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_fetch_owned_account))
    result = await _run("get_account_briefing", {"account_id": "acc-1"})
    assert "truncated" not in result


def test_the_shared_cap_helper_is_exact_not_a_heuristic() -> None:
    """`_capped` fait le compte AVANT/APRÈS, pas une estimation."""
    items = list(range(45))
    capped, truncated = chat_tools._capped(items)
    assert len(capped) == chat_tools._LIST_TOOL_CAP == 20
    assert truncated is True
    short = list(range(3))
    capped_short, truncated_short = chat_tools._capped(short)
    assert capped_short == short
    assert truncated_short is False
