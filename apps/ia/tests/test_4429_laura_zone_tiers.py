"""#4429.3 — Laura : les mêmes paliers de zone que Découvrir, dans le CODE de l'outil.

« trouve-moi des comptes à Toulouse » passe par `run_account_search` → `discover_registry`, qui
élargit seul par paliers (`test_4429_zone_tiers.py`). Ce que l'outil doit en plus : accepter un
RAYON demandé (« autour de Toulouse, 25 km »), rendre en une ligne le palier utilisé — la phrase
de l'écran — et étiqueter chaque compte élargi. Laura ne demande JAMAIS « tu veux élargir ? » :
l'élargissement a déjà eu lieu, elle le dit.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_tools

USER = "77777777-7777-4777-8777-777777777777"
_TOULOUSE = {"code": "31555", "name": "Toulouse", "department": "31", "latitude": 43.6, "longitude": 1.44}


@pytest.fixture(autouse=True)
def _stub_communes(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _resolve(name: str) -> dict[str, Any] | None:
        return _TOULOUSE if name == "Toulouse" else None

    monkeypatch.setattr("app.services.data_sources.geo_communes.resolve_commune_by_name", _resolve)


def _stub_registry(monkeypatch: pytest.MonkeyPatch, *, candidates: list[dict], zone_widening: dict | None) -> list:
    seen: list[Any] = []

    class _Response:
        degraded: list[Any] = []
        query: dict[str, Any] = {}
        recommendedSort = "balanced"

    _Response.candidates = candidates
    _Response.zoneWidening = zone_widening

    async def _fake(req: Any) -> Any:
        seen.append(req)
        return _Response()

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    return seen


def _company(index: int, **over: Any) -> dict:
    return {"name": f"SOCIETE {index} SAS", "siren": f"{400000000 + index}", "city": "TOULOUSE", **over}


async def test_un_rayon_demande_part_au_registre(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub_registry(monkeypatch, candidates=[], zone_widening=None)

    await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse", "radius_km": 25}, user_id=USER, profile_data=None
    )

    assert seen and seen[0].filters.city == "Toulouse"
    assert seen[0].filters.radiusKm == 25


async def test_un_rayon_hors_des_paliers_ne_se_devine_pas(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub_registry(monkeypatch, candidates=[], zone_widening=None)

    await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse", "radius_km": 300}, user_id=USER, profile_data=None
    )

    # 300 km n'est jamais deviné : la ville part au rayon PAR DÉFAUT (25 km, #4515 du 01/11), pas à celui qu'on a lu.
    assert seen[0].filters.radiusKm == 25


async def test_le_palier_utilise_se_dit_en_une_ligne_et_chaque_compte_elargi_s_etiquette(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    widening = {"place": "Toulouse", "tier": "radius_50", "exactCount": 2, "widenedCount": 1}
    _stub_registry(
        monkeypatch,
        candidates=[
            _company(1),
            _company(2),
            _company(3, city="MURET", zone={"tier": "radius_50", "distanceKm": 37.6}),
        ],
        zone_widening=widening,
    )

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse"}, user_id=USER, profile_data=None
    )

    assert result["zone_widening"] == widening
    # #4429.3 (recette 23/10) — UNE ligne de Laura : le palier, ce qui est à la ville, ce qui est autour.
    assert result["zone_line"] == "J'ai élargi à 50 km : 2 comptes à Toulouse, 1 autour"
    labels = {item["siren"]: item.get("zone_label") for item in result["items"]}
    assert labels["400000003"] == "Élargi à 50 km · à 38 km de Toulouse"
    assert labels["400000001"] is None


async def test_sans_elargissement_aucune_ligne_de_palier(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_registry(monkeypatch, candidates=[_company(i) for i in range(12)], zone_widening=None)

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse"}, user_id=USER, profile_data=None
    )

    assert "zone_line" not in result
    assert "zone_widening" not in result


def test_l_outil_expose_le_rayon_et_interdit_de_demander_s_il_faut_elargir() -> None:
    schema = chat_tools.RUN_ACCOUNT_SEARCH_TOOL["input_schema"]["properties"]
    assert schema["radius_km"]["enum"] == [25, 50, 100]  # #4641 — « autour de Lille, 100 km »
    description = chat_tools.RUN_ACCOUNT_SEARCH_TOOL["description"]
    assert "zone_line" in description
    assert "tu veux élargir" in description


# #4432.3 — la carte `account_ranking` porte la zone cherchée (le lot la transmet au dossier) et
# l'étiquette de palier de chaque compte élargi. Libellés, jamais des codes nus.
def test_la_carte_porte_la_zone_cherchee_et_l_etiquette_de_palier() -> None:
    from app.services.known_shape_gate import _labels, _search_ranking

    output = {
        "axes": ["Région : Occitanie"],
        "criteria": {"region": ["76", "75"], "department": "31"},
        "items": [
            {"name": "SAFRAN", "why": ["Aéronautique."], "zone_label": "Haute-Garonne"},
            {"name": "AIRBUS", "why": ["Aéronautique."]},
        ],
    }
    card = _search_ranking(output, _labels("fr"))
    assert card["search_zone"] == {"departments": ["Haute-Garonne"], "regions": ["Occitanie", "Nouvelle-Aquitaine"]}
    assert card["items"][0]["zone_label"] == "Haute-Garonne"
    assert "zone_label" not in card["items"][1]


def test_la_carte_sans_zone_ne_porte_aucune_zone() -> None:
    from app.services.known_shape_gate import _labels, _search_ranking

    card = _search_ranking({"axes": ["Secteur"], "criteria": {"sectors": ["finance"]}, "items": [{"name": "X", "why": ["y"]}]}, _labels("fr"))
    assert "search_zone" not in card


async def test_la_ligne_de_laura_compte_ce_que_la_liste_montre_au_pluriel_et_au_singulier(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    widening = {"place": "Toulouse", "tier": "region", "area": "Occitanie", "exactCount": 1, "widenedCount": 3}
    _stub_registry(
        monkeypatch,
        candidates=[_company(1)]
        + [_company(i, city="MURET", zone={"tier": "region", "area": "Haute-Garonne"}) for i in (2, 3, 4)],
        zone_widening=widening,
    )

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse"}, user_id=USER, profile_data=None
    )

    assert result["zone_line"] == "J'ai élargi à la région (Occitanie) : 1 compte à Toulouse, 3 autour"


async def test_deux_groupes_de_filtres_gardent_le_palier_du_registre(monkeypatch: pytest.MonkeyPatch) -> None:
    widening = {"place": "Toulouse", "tier": "radius_50", "exactCount": 1, "widenedCount": 1}
    _stub_registry(
        monkeypatch,
        candidates=[_company(1), _company(2, city="BLAGNAC", zone={"tier": "radius_50", "distanceKm": 8.0})],
        zone_widening=widening,
    )

    result = await chat_tools.execute_chat_tool(
        "run_account_search",
        {"city": "Toulouse", "sectors": ["industrie", "banque"]},
        user_id=USER,
        profile_data=None,
    )

    assert result.get("zone_line") == "J'ai élargi à 50 km : 1 compte à Toulouse, 1 autour"


# #4429.3 (recette 25/10) — « 10 comptes à Albi » → 7 rendus sans palier nommé ; « rayon de 50 km autour d'Albi » → 1 seul
# compte, là où la ville seule en rendait 7 : un rayon PLUS LARGE rendait MOINS.
async def test_un_rayon_demande_englobe_au_minimum_ce_que_la_ville_seule_rendait(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[Any] = []

    class _Response:
        degraded: list[Any] = []
        query: dict[str, Any] = {}
        recommendedSort = "balanced"
        zoneWidening = None

        def __init__(self, candidates: list[dict]) -> None:
            self.candidates = candidates

    async def _fake(req: Any) -> Any:
        seen.append(req)
        if req.filters.radiusKm:
            return _Response([_company(1)])
        return _Response([_company(i) for i in range(1, 8)])

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse", "radius_km": 50}, user_id=USER, profile_data=None
    )

    assert any(r.filters.radiusKm == 50 for r in seen)
    # la ville seule est lue aussi, sans paliers (le rayon est déjà l'élargissement demandé)
    city_only = [r for r in seen if not r.filters.radiusKm]
    assert city_only and all(r.filters.zoneStrict for r in city_only)
    assert len({item["siren"] for item in result["items"]}) == 7
    assert len(result["items"]) == 7


async def test_un_palier_tente_sans_rien_trouver_de_plus_se_dit_quand_meme(monkeypatch: pytest.MonkeyPatch) -> None:
    widening = {"place": "Toulouse", "tier": "radius_50", "exactCount": 7, "widenedCount": 2}
    # les deux comptes élargis ne survivent pas aux retraits : la liste rendue n'a que les 7 exacts
    _stub_registry(monkeypatch, candidates=[_company(i) for i in range(1, 8)], zone_widening=widening)

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse"}, user_id=USER, profile_data=None
    )

    assert result["zone_line"] == "J'ai élargi à 50 km sans rien trouver de plus : 7 comptes à Toulouse"


# #4429.3 (RE-RECETTE PROD 26/10 + 28/10) — « 7 comptes sur 10 » sans NI palier NI rayon (0 « km », 0 « région ») :
# quand rien n'a été élargi, la réponse dit pourtant la zone CHERCHÉE — le rayon réellement posé, ou la ville seule.
async def test_un_rayon_pose_se_dit_en_toutes_lettres(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_registry(monkeypatch, candidates=[_company(i) for i in range(12)], zone_widening=None)

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse", "radius_km": 25}, user_id=USER, profile_data=None
    )

    assert result["reach_line"] == "Zone cherchée : 25 km autour de Toulouse, 8 comptes."
    assert "zone_line" not in result


async def test_une_liste_courte_dit_le_rayon_par_defaut(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_registry(monkeypatch, candidates=[_company(i) for i in range(3)], zone_widening=None)

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse"}, user_id=USER, profile_data=None
    )

    assert result["reach_line"] == "Zone cherchée : 25 km autour de Toulouse, 3 comptes."


async def test_la_ville_seule_se_dit_sans_rayon(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_registry(monkeypatch, candidates=[_company(1)], zone_widening=None)

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse", "radius_km": None}, user_id=USER, profile_data=None
    )

    assert result["reach_line"] == "Zone cherchée : Toulouse seule, 1 compte."


async def test_une_liste_pleine_sans_rayon_pose_ne_dit_rien(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_registry(monkeypatch, candidates=[_company(i) for i in range(12)], zone_widening=None)

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse"}, user_id=USER, profile_data=None
    )

    assert "reach_line" not in result


async def test_un_palier_dit_remplace_la_zone_cherchee(monkeypatch: pytest.MonkeyPatch) -> None:
    widening = {"place": "Toulouse", "tier": "radius_50", "exactCount": 1, "widenedCount": 0, "autoCapReached": True}
    _stub_registry(monkeypatch, candidates=[_company(1)], zone_widening=widening)

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse"}, user_id=USER, profile_data=None
    )

    assert "reach_line" not in result  # le palier a sa propre ligne (zone_line), jamais deux phrases pour une zone


def test_la_ligne_de_zone_cherchee_est_reprise_par_le_filet_de_la_reponse() -> None:
    from app.prompts.laura_acts import ensure_widening_line, widening_line_from_output

    output = {"items": [{"name": "A"}], "reach_line": "Zone cherchée : 25 km autour de Albi, 1 compte."}
    line = widening_line_from_output(output)
    assert line == "Zone cherchée : 25 km autour de Albi, 1 compte."
    # La prose qui dit déjà « 25 km » n'est pas doublée ; celle qui l'omet reçoit la ligne en tête.
    said = [{"widening_line": line}]
    assert ensure_widening_line("Voici 1 compte à 25 km d'Albi.", said) == "Voici 1 compte à 25 km d'Albi."
    silent = [{"widening_line": line}]
    assert ensure_widening_line("Voici 1 compte.", silent).startswith("Zone cherchée : 25 km autour de Albi")
