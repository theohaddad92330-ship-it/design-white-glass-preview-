"""#3762 — RÉFUTÉ EN PRODUCTION le 06/10/2026 : « ouvre mon périmètre à
Montpellier et périphérie » (département 34, Hérault) rendait un classement
filtré sur le département 76 (Seine-Maritime). `find_accounts` et
`run_account_search` ne demandaient au modèle QUE le code département — il
devait le DEVINER de mémoire, et s'est trompé.

Ce fichier tient : une ville passée dans `city` est résolue par la source
officielle (`geo_communes.resolve_commune_by_name`), jamais devinée — et,
depuis #3876.5 (lot M13, 09/10), elle reste une COMMUNE : son nom canonique
voyage jusqu'au registre / à Découvrir, jamais son département entier ; un
département explicite garde la priorité ; une ville sans correspondance
exacte est NOMMÉE (`city_not_resolved`), jamais silencieusement perdue ni
remplacée par un département inventé.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_tools

USER = "77777777-7777-4777-8777-777777777777"

_MONTPELLIER = {
    "code": "34172",
    "name": "Montpellier",
    "postalCodes": ["34000", "34070", "34080", "34090"],
    "latitude": 43.6112,
    "longitude": 3.8767,
    "population": 299988,
    "department": "34",
    "departmentName": "Hérault",
}

_LILLE = {
    "code": "59350",
    "name": "Lille",
    "postalCodes": ["59000", "59260", "59777", "59800"],
    "latitude": 50.6305,
    "longitude": 3.0493,
    "population": 234475,
    "department": "59",
    "departmentName": "Nord",
}

_LYON = {
    "code": "69123",
    "name": "Lyon",
    "postalCodes": ["69001", "69002", "69003"],
    "latitude": 45.7485,
    "longitude": 4.8467,
    "population": 522228,
    "department": "69",
    "departmentName": "Rhône",
}

_SAINT_ETIENNE = {
    "code": "42218",
    "name": "Saint-Étienne",
    "postalCodes": ["42000", "42100"],
    "latitude": 45.4397,
    "longitude": 4.3872,
    "population": 171924,
    "department": "42",
    "departmentName": "Loire",
}


def _stub_communes(monkeypatch: pytest.MonkeyPatch, by_name: dict[str, dict[str, Any]]) -> list[str]:
    seen: list[str] = []

    async def _fake(name: str) -> dict[str, Any] | None:
        seen.append(name)
        return by_name.get(name)

    monkeypatch.setattr("app.services.data_sources.geo_communes.resolve_commune_by_name", _fake)
    return seen


@pytest.fixture(autouse=True)
def _stub_count(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _count(*_a: object, **_k: object) -> int | None:
        return 5

    monkeypatch.setattr(chat_tools, "_find_accounts_count", _count)


@pytest.mark.asyncio
class TestFindAccountsCityResolution:
    @pytest.mark.parametrize(
        ("city", "commune", "expected_department"),
        [
            ("Montpellier", _MONTPELLIER, "34"),
            ("Lille", _LILLE, "59"),
            ("Lyon", _LYON, "69"),
            ("Saint-Étienne", _SAINT_ETIENNE, "42"),
        ],
    )
    async def test_une_ville_est_resolue_en_commune_par_la_source_officielle(
        self, monkeypatch: pytest.MonkeyPatch, city: str, commune: dict[str, Any], expected_department: str
    ) -> None:
        _stub_communes(monkeypatch, {city: commune})
        out = await chat_tools.execute_chat_tool(
            "find_accounts", {"city": city}, user_id=USER, profile_data=None
        )
        assert out.get("error") is None, out
        # #3876.5 — la commune officielle, jamais son département (`expected_department`
        # reste dans la table : c'est exactement ce qui ne doit plus voyager).
        assert out["proposal"]["city"] == commune["name"]
        assert out["proposal"].get("department") != expected_department
        assert "city_not_resolved" not in out

    async def test_un_departement_explicite_garde_la_priorite_sur_la_ville(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        seen = _stub_communes(monkeypatch, {"Montpellier": _MONTPELLIER})
        out = await chat_tools.execute_chat_tool(
            "find_accounts", {"city": "Montpellier", "department": "75"}, user_id=USER, profile_data=None
        )
        assert out["proposal"]["department"] == "75"
        assert not seen, "un département explicite ne fait jamais résoudre la ville"

    async def test_une_ville_sans_correspondance_est_nommee_jamais_devinee(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _stub_communes(monkeypatch, {})
        out = await chat_tools.execute_chat_tool(
            "find_accounts", {"city": "Trifouillis", "sectors": ["finance"]}, user_id=USER, profile_data=None
        )
        assert out.get("error") is None, out
        assert "department" not in out["proposal"]
        assert out["city_not_resolved"] == "Trifouillis"
        assert "city_not_resolved_reason" in out

    async def test_une_ville_sans_correspondance_et_aucun_autre_critere_refuse_plutot_que_deviner(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _stub_communes(monkeypatch, {})
        out = await chat_tools.execute_chat_tool(
            "find_accounts", {"city": "Trifouillis"}, user_id=USER, profile_data=None
        )
        assert "Trifouillis" in out["error"]
        assert "department" not in out


@pytest.mark.asyncio
class TestRunAccountSearchCityResolution:
    async def _stub_registry(self, monkeypatch: pytest.MonkeyPatch, candidates: list[dict[str, Any]]) -> list[Any]:
        seen: list[Any] = []

        class _Response:
            def __init__(self) -> None:
                self.candidates = candidates
                self.degraded: list[Any] = []
                self.query: dict[str, Any] = {}
                self.recommendedSort = "balanced"

        async def _fake(req: Any) -> Any:
            seen.append(req)
            return _Response()

        monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
        return seen

    async def test_montpellier_reste_la_commune_jamais_un_departement(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _stub_communes(monkeypatch, {"Montpellier": _MONTPELLIER})
        seen = await self._stub_registry(monkeypatch, [])
        out = await chat_tools.execute_chat_tool(
            "run_account_search", {"city": "Montpellier"}, user_id=USER, profile_data=None
        )
        assert out.get("error") is None, out
        assert seen, "le registre doit être interrogé avec la commune résolue"
        # #3876.5 — ni le 34 entier, ni (#3762) le 76 deviné : la commune.
        assert seen[-1].filters.city == "Montpellier"
        assert seen[-1].filters.department in (None, "")
        assert "city_not_resolved" not in out

    async def test_une_ville_sans_correspondance_est_nommee_dans_lenveloppe(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _stub_communes(monkeypatch, {})
        out = await chat_tools.execute_chat_tool(
            "run_account_search", {"city": "Trifouillis", "sectors": ["finance"]}, user_id=USER, profile_data=None
        )
        assert out.get("error") is None, out
        assert out["city_not_resolved"] == "Trifouillis"
        assert "city_not_resolved_reason" in out
