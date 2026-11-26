"""#3707 (R4 07/10) — RÉFUTÉ EN PRODUCTION : sous les cartes « Classement de
comptes », le libellé brut anglais « recommended » (`qualification.verdict`)
et les clés brutes du scoreur (« Non évalué : activity · accessibility »,
`scoreUnmeasured` / `_BLOCK_MAXIMA`) s'affichaient en clair.

Ce fichier tient que `_search_item` (lu par `run_account_search`) traduit
désormais ces deux familles de codes fermés avec le MÊME vocabulaire que
l'écran Découvrir (`discover.json:scoreCriteria` / `qualification.verdict`),
jamais un code brut laissé passer.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import execute_chat_tool

USER = "88888888-8888-4888-8888-888888888888"


def _candidate(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "siren": "552032534",
        "name": "FREE SAS",
        "city": "Paris",
        "department": "75",
        "headcount": 1200,
        "nafLabel": "Télécommunications filaires",
        "qualification": {"verdict": "recommended"},
        "sources": [{"name": "registre", "fetchedAt": "2026-09-16T15:26:00+00:00"}],
    }
    base.update(overrides)
    return base


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[Any] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


def _stub_registry(monkeypatch: pytest.MonkeyPatch, candidates: list[dict[str, Any]]) -> None:
    async def _fake(req: Any) -> Any:
        return _Response(candidates)

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)


@pytest.mark.asyncio
class TestAccountRankingVerdictLabel:
    async def test_le_verdict_recommended_est_traduit_en_francais(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # #3866 — « Recommandé » exige une preuve d'adéquation (angle ou signal daté).
        _stub_registry(monkeypatch, [_candidate(angle="Projet data annoncé")])
        out = await execute_chat_tool(
            "run_account_search", {"department": "75"}, user_id=USER, profile_data=None
        )
        assert out["items"][0]["verdict"] == "Recommandé"
        assert out["items"][0]["verdict"] != "recommended"

    async def test_le_verdict_to_verify_est_traduit_en_francais(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, [_candidate(qualification={"verdict": "to_verify"})])
        out = await execute_chat_tool(
            "run_account_search", {"department": "75"}, user_id=USER, profile_data=None
        )
        assert out["items"][0]["verdict"] == "À vérifier"

    async def test_un_code_de_verdict_inconnu_nest_pas_perdu(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Un code hors du vocabulaire fermé (jamais produit aujourd'hui, mais
        la table ne doit pas lever) reste visible, jamais avalé en silence."""
        _stub_registry(monkeypatch, [_candidate(qualification={"verdict": "a_new_code"})])
        out = await execute_chat_tool(
            "run_account_search", {"department": "75"}, user_id=USER, profile_data=None
        )
        assert out["items"][0]["verdict"] == "a_new_code"


@pytest.mark.asyncio
class TestAccountRankingNotEvaluatedLabels:
    @pytest.mark.parametrize(
        ("raw_key", "expected_label"),
        [
            ("activity", "secteur d'activité"),
            ("geography", "zone géographique"),
            ("headcount", "effectif"),
            ("age", "ancienneté"),
            ("it_surface", "surface informatique"),
            ("accessibility", "accessibilité des interlocuteurs"),
            ("evidence", "qualité des preuves"),
        ],
    )
    async def test_chaque_cle_brute_du_scoreur_est_traduite(
        self, monkeypatch: pytest.MonkeyPatch, raw_key: str, expected_label: str
    ) -> None:
        _stub_registry(monkeypatch, [_candidate(scoreUnmeasured=[raw_key])])
        out = await execute_chat_tool(
            "run_account_search", {"department": "75"}, user_id=USER, profile_data=None
        )
        not_evaluated = out["items"][0]["not_evaluated"]
        assert not_evaluated == [expected_label]
        assert raw_key not in not_evaluated

    async def test_plusieurs_cles_brutes_sont_toutes_traduites(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub_registry(monkeypatch, [_candidate(scoreUnmeasured=["activity", "accessibility"])])
        out = await execute_chat_tool(
            "run_account_search", {"department": "75"}, user_id=USER, profile_data=None
        )
        not_evaluated = out["items"][0]["not_evaluated"]
        assert not_evaluated == ["secteur d'activité", "accessibilité des interlocuteurs"]
        assert "activity" not in not_evaluated
        assert "accessibility" not in not_evaluated
