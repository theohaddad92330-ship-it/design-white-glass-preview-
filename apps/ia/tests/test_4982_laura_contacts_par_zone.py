"""#4982.3 — « mes contacts triés par zone » : l'outil de Laura relaie le tri « zone » de l'écran Contacts
(même logique côté API, aucun second référentiel) et rend ville + département de chaque ligne."""

from __future__ import annotations

import inspect

import pytest

from app.services import bellum_api, chat_tools
from app.services import chat_orchestrator as orch
from app.services.compilers.intent_router import asks_contacts_by_zone

USER = "11111111-1111-4111-8111-111111111111"


@pytest.mark.asyncio
async def test_sort_by_zone_est_un_critere_a_lui_seul_et_part_au_pont(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict[str, object] = {}

    async def search(user_id: str, **kwargs: object) -> dict:
        seen.update(kwargs)
        return {
            "total": 2,
            "truncated": False,
            "contacts": [
                {"contact_id": "c1", "full_name": "A B", "company_name": "X", "city": "Lyon", "department": "69"},
                {"contact_id": "c2", "full_name": "C D", "company_name": "Y", "city": None, "department": None},
            ],
        }

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    out = await chat_tools.execute_chat_tool(
        "search_workspace_contacts", {"sort_by": "zone", "limit": 5}, user_id=USER, profile_data=None
    )
    assert "error" not in out
    assert seen.get("sort") == "zone"
    assert out["contacts"][0]["city"] == "Lyon"
    assert out["contacts"][1]["city"] is None  # lieu inconnu : nommé absent, jamais deviné


@pytest.mark.asyncio
async def test_repartis_par_region_rend_des_comptes_et_nomme_les_lieux_inconnus(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict[str, object] = {}

    async def search(user_id: str, **kwargs: object) -> dict:
        seen.update(kwargs)
        return {
            "zones": [{"region": "ile_de_france", "department": "75", "count": 40}],
            "unknown_zone": 60,
            "total": 100,
        }

    real_signature = inspect.signature(bellum_api.workspace_contacts)
    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    out = await chat_tools.execute_chat_tool(
        "search_workspace_contacts", {"by_zone": True}, user_id=USER, profile_data=None
    )
    assert "error" not in out
    assert seen.get("by_zone") is True
    # Prod 03/11 : `missing 1 required keyword-only argument: 'limit'` — l'appel doit lier la VRAIE signature.
    real_signature.bind(USER, **seen)
    assert out["zones"][0]["count"] == 40
    assert out["unknown_zone"] == 60 and out["total"] == 100
    assert "lieu inconnu : 60" in out["zone_breakdown_directive"]
    assert "contacts" not in out  # des comptes, jamais 200 lignes brutes


def test_description_de_l_outil_cite_repartis_et_region() -> None:
    props = chat_tools.SEARCH_WORKSPACE_CONTACTS_TOOL["input_schema"]["properties"]
    text = props["by_zone"]["description"].lower()
    assert "répartis" in text and "région" in text and "département" in text


@pytest.mark.asyncio
async def test_by_zone_region_seule_se_rend_sans_departement_invente(monkeypatch: pytest.MonkeyPatch) -> None:
    """#4982.3b — une région lue dans le lieu écrit n'a pas de département : « département non dit », jamais inventé."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(user_id: str, **kwargs: object) -> dict:
        return {
            "zones": [
                {"region": "ile_de_france", "department": None, "count": 30},
                {"region": "ile_de_france", "department": "75", "count": 10},
            ],
            "unknown_zone": 5,
            "total": 45,
        }

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    out = await chat_tools.execute_chat_tool(
        "search_workspace_contacts", {"by_zone": True}, user_id=USER, profile_data=None
    )
    assert out["zones"][0]["department"] is None
    assert "département non dit" in out["zone_breakdown_directive"]


# --- #4982.3 (suite) — la demande de répartition POUSSE le modèle vers l'agrégat ---

TOOLS = [{"name": "search_workspace_contacts"}]


@pytest.mark.parametrize(
    "message",
    [
        "Répartis mes contacts par région",
        "Combien de contacts par département ?",
        "répartition de mes contacts par zone",
        "Combien de contacts par ville ?",
    ],
)
def test_the_detector_recognises_a_zone_breakdown(message: str) -> None:
    assert asks_contacts_by_zone(message)


@pytest.mark.parametrize(
    "message",
    [
        "Trouve-moi un contact chez Airbus",
        "Combien de comptes par région ?",
        "Liste mes contacts",
    ],
)
def test_the_detector_ignores_other_requests(message: str) -> None:
    assert not asks_contacts_by_zone(message)


def test_the_first_round_forces_the_contacts_tool() -> None:
    forced = orch._forced_contacts_by_zone_kwargs(0, "Répartis mes contacts par région", TOOLS)
    assert forced == {"force_tool": "search_workspace_contacts"}


def test_no_forcing_later_round_other_request_or_missing_tool() -> None:
    assert orch._forced_contacts_by_zone_kwargs(1, "Répartis mes contacts par région", TOOLS) == {}
    assert orch._forced_contacts_by_zone_kwargs(0, "Trouve-moi un contact chez Airbus", TOOLS) == {}
    assert orch._forced_contacts_by_zone_kwargs(0, "Répartis mes contacts par région", []) == {}


def test_the_call_carries_by_zone_whatever_the_model_wrote() -> None:
    call = orch._ToolCall(id="t1", name="search_workspace_contacts", input={"sort_by": "zone", "limit": 50})
    imposed = orch._with_zone_breakdown(call, "Répartis mes contacts par région")
    assert imposed.input["by_zone"] is True
    assert "sort_by" not in imposed.input
    # Autre demande, ou autre outil : l'appel reste le MÊME objet.
    assert orch._with_zone_breakdown(call, "Trouve-moi un contact chez Airbus") is call
    other = orch._ToolCall(id="t2", name="get_account_contacts", input={})
    assert orch._with_zone_breakdown(other, "Répartis mes contacts par région") is other


def test_the_tool_description_tells_the_model_to_use_by_zone() -> None:
    description = chat_tools.SEARCH_WORKSPACE_CONTACTS_TOOL["description"]
    assert "by_zone" in description
    assert "lieu inconnu" in description
    assert "non mesuré" in description


@pytest.mark.asyncio
async def test_repartition_par_region_somme_les_departements_et_rend_un_tableau_avec_les_nombres(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Prod 03/11 (ia d53a8efd) : ~36 lignes région×département rangées en `contact_list` (sans champ nombre,
    plafond 30) → bloc refusé, rendu en puces SANS les comptes. La répartition se somme par région et se rend en
    `file_export` [Région, Contacts], dernière ligne « Lieu inconnu »."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def search(user_id: str, **kwargs: object) -> dict:
        return {
            "zones": [
                {"region": "ile_de_france", "department": "75", "count": 40},
                {"region": "occitanie", "department": "31", "count": 5},
                {"region": "ile_de_france", "department": "92", "count": 12},
                {"region": "occitanie", "department": None, "count": 3},
            ],
            "unknown_zone": 73545,
            "total": 73605,
        }

    monkeypatch.setattr(bellum_api, "workspace_contacts", search)
    out = await chat_tools.execute_chat_tool(
        "search_workspace_contacts", {"by_zone": True}, user_id=USER, profile_data=None
    )
    assert out["regions"] == [
        {"region": "Île-de-France", "departments": ["75", "92"], "count": 52},
        {"region": "Occitanie", "departments": ["31"], "count": 8},
    ]
    table = out["region_table"]
    assert table["type"] == "file_export"
    assert table["columns"] == ["Région", "Contacts"]
    assert [r["cells"] for r in table["rows"]] == [
        ["Île-de-France", "52"],
        ["Occitanie", "8"],
        ["Lieu inconnu", "73 545"],
    ]
    directive = out["zone_breakdown_directive"]
    assert "file_export" in directive and "contact_list" in directive  # nomme la carte, interdit l'autre
    assert "lieu inconnu : 73 545" in directive.lower()


def test_la_description_ne_range_pas_la_repartition_en_contact_list() -> None:
    text = chat_tools.SEARCH_WORKSPACE_CONTACTS_TOOL["description"]
    repartition = text[text.index("RÉPARTITION") :]
    assert "file_export" in repartition
