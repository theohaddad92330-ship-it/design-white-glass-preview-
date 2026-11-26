"""#5013 — Laura connaît la classe d'accès A-D qu'affiche Découvrir.

Même calcul que l'écran (`access_scoring.barrier_for_company`) ; une classe non
estimable reste ABSENTE et se nomme dans `not_evaluated` (jamais « D » par défaut).
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import _search_item, execute_chat_tool

USER = "88888888-8888-4888-8888-888888888888"


def _cand(siren: str, name: str, **extra: Any) -> dict[str, Any]:
    return {"siren": siren, "name": name, "city": "Lille", "department": "59", **extra}


def _barrier(klass: str | None, score: float | None) -> dict[str, Any]:
    labels = {"A": "Ouvert probable", "B": "Ouvert par une entité", "C": "Semi-ouvert", "D": "Verrouillage probable"}
    return {
        "score": score,
        "access_class": klass,
        "label": labels.get(klass or ""),
        "measurable": klass is not None,
        "missing": [],
        "proxies": [
            {"key": "effectif", "contribution": 1.0, "evidence": "effectif 20 à 49 salariés", "measurable": True},
            {"key": "statut", "contribution": 0.5, "evidence": "PME indépendante", "measurable": True},
            {"key": "inconnu", "contribution": 0.0, "evidence": "ne se lit pas", "measurable": False},
        ],
    }


class TestSearchItemAccessClass:
    def test_la_classe_et_sa_raison_factuelle_sont_exposees(self) -> None:
        item = _search_item(_cand("111111111", "PETITE SAS", barrier=_barrier("A", 2.5)))
        assert item is not None
        assert item["access_class"] == "A"
        assert item["access_label"] == "Ouvert probable"
        assert item["access_reason"] == ["effectif 20 à 49 salariés", "PME indépendante"]

    def test_une_classe_non_estimable_est_absente_et_nommee(self) -> None:
        item = _search_item(_cand("222222222", "FLOUE SAS", barrier=_barrier(None, None)))
        assert item is not None
        assert "access_class" not in item
        assert "access_reason" not in item
        assert "non estimable" in item["access_class_unmeasured"]

    def test_sans_barriere_fournie_elle_est_calculee_comme_decouvrir(self) -> None:
        item = _search_item(_cand("333333333", "CALCULEE SAS", headcount=30, creationDate="2005-01-01"))
        assert item is not None
        # Soit estimée (A-D), soit nommée non évaluée : jamais ni l'une ni l'autre.
        assert ("access_class" in item) != ("access_class_unmeasured" in item)


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[Any] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


@pytest.mark.asyncio
class TestSortByAccess:
    async def test_les_plus_faciles_d_abord_les_non_estimables_en_dernier(self, monkeypatch: pytest.MonkeyPatch) -> None:
        rows = [
            _cand("444444444", "D SAS", barrier=_barrier("D", 8.5)),
            _cand("555555555", "FLOUE SAS", barrier=_barrier(None, None)),
            _cand("666666666", "A SAS", barrier=_barrier("A", 2.0)),
            _cand("777777777", "C SAS", barrier=_barrier("C", 6.0)),
        ]

        async def _fake(req: Any) -> Any:
            return _Response(rows)

        monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
        out = await execute_chat_tool(
            "run_account_search", {"department": "59", "sort_by": "access"}, user_id=USER, profile_data=None
        )
        assert [i["name"] for i in out["items"]] == ["A SAS", "C SAS", "D SAS", "FLOUE SAS"]
        assert out["sorted_by"] == "access"

    async def test_ordre_a_b_c_d_puis_sans_classe_sans_rien_perdre(self, monkeypatch: pytest.MonkeyPatch) -> None:
        rows = [
            _cand("111111111", "C SAS", barrier=_barrier("C", 6.0)),
            _cand("222222222", "FLOUE SAS", barrier=_barrier(None, None)),
            _cand("333333333", "B SAS", barrier=_barrier("B", 4.0)),
            _cand("444444444", "A SAS", barrier=_barrier("A", 2.0)),
            _cand("555555555", "D SAS", barrier=_barrier("D", 8.5)),
        ]

        async def _fake(req: Any) -> Any:
            return _Response(rows)

        monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
        out = await execute_chat_tool(
            "run_account_search", {"department": "59", "sort_by": "access"}, user_id=USER, profile_data=None
        )
        assert [i["name"] for i in out["items"]] == ["A SAS", "B SAS", "C SAS", "D SAS", "FLOUE SAS"]

    async def test_sans_sort_by_l_ordre_du_registre_est_inchange(self, monkeypatch: pytest.MonkeyPatch) -> None:
        rows = [_cand("444444444", "D SAS", barrier=_barrier("D", 8.5)), _cand("666666666", "A SAS", barrier=_barrier("A", 2.0))]

        async def _fake(req: Any) -> Any:
            return _Response(rows)

        monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
        out = await execute_chat_tool("run_account_search", {"department": "59"}, user_id=USER, profile_data=None)
        assert [i["name"] for i in out["items"]] == ["D SAS", "A SAS"]
        assert "sorted_by" not in out


@pytest.mark.asyncio
class TestAccessSummaryDuMemeRendu:
    async def test_le_compte_par_classe_vient_des_comptes_rendus(self, monkeypatch: pytest.MonkeyPatch) -> None:
        rows = [
            _cand("444444444", "C SAS", barrier=_barrier("C", 6.0)),
            _cand("555555555", "FLOUE SAS", barrier=_barrier(None, None)),
            _cand("666666666", "A SAS", barrier=_barrier("A", 2.0)),
            _cand("777777777", "B SAS", barrier=_barrier("B", 4.0)),
            _cand("888888888", "A2 SAS", barrier=_barrier("A", 2.5)),
        ]

        async def _fake(req: Any) -> Any:
            return _Response(rows)

        monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
        out = await execute_chat_tool(
            "run_account_search", {"department": "59", "sort_by": "access"}, user_id=USER, profile_data=None
        )
        assert out["access_summary"] == {"A": 2, "B": 1, "C": 1, "D": 0, "non_estimable": 1}
        # Le texte que Laura relaie est celui des cartes : A, A, B, C, puis la classe non estimable.
        assert [i.get("access_class") for i in out["items"]] == ["A", "A", "B", "C", None]
        assert "2 en A" in out["access_line"] and "1 non estimable" in out["access_line"]
