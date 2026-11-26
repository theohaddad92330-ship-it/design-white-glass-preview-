"""#3704 / #3705 — le tour d'horizon de Laura cherche de NOUVELLES entreprises,
dans le périmètre demandé (secteur, zone, taille), et le dit quand il en manque.

Retour bêta du call du 04-05/10 : « luxe » remontait une banque au Luxembourg.
Cause établie (reproduite ci-dessous, test 1) : `_sectors_for_word` appariait par
PRÉFIXE dans les deux sens — « luxembourg » commence par « luxe », donc le mot
d'un LIEU était lu comme le secteur « Luxe & mode ». Le tour d'horizon, lui, n'avait
ni le secteur luxe, ni la région, ni aucun contrôle du résultat contre la demande.

Ce que ce fichier tient :
  - un lieu n'est pas un secteur (le préfixe n'absorbe plus que pluriels/genres) ;
  - « luxe » interroge le registre par la LISTE de codes NAF du secteur, pas par un nom ;
  - un résultat hors secteur ou hors tranche d'effectif sort de la sélection principale,
    se range à part (`out_of_scope`) et ne sert JAMAIS à atteindre le nombre demandé ;
  - un NAF ou un effectif inconnu reste inconnu : gardé, nommé comme non vérifié ;
  - « donne-moi aussi des besoins » (signaux) ne retire aucune entreprise ;
  - trop peu de résultats : dit, avec un élargissement précis NON appliqué ;
  - une source en panne : le reste est rendu, la reprise est nommée.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_tools
from app.services.chat_tools import execute_chat_tool
from app.services.discover_request_reading import _sectors_for_word, read_request

TOOL_NAME = "run_account_search"


def _candidate(siren: str, name: str, naf: str | None, **extra: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "siren": siren,
        "name": name,
        "city": "Paris",
        "department": "75",
        "nafLabel": "Activité",
        "score": 60,
        "scoreMax": 100,
        "sources": [{"name": "registre", "fetchedAt": "2026-10-05T10:00:00+00:00"}],
    }
    if naf is not None:
        row["nafCode"] = naf
    row.update(extra)
    return row


class _Response:
    def __init__(self, candidates: list[dict[str, Any]], degraded: list[dict[str, Any]] | None = None) -> None:
        self.candidates = candidates
        self.degraded = degraded or []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


def _stub(monkeypatch: pytest.MonkeyPatch, response: Any) -> list[Any]:
    seen: list[Any] = []

    async def _fake(req: Any) -> Any:
        seen.append(req)
        return response

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)

    async def _no_portfolio(items: Any, user_id: str) -> None:
        return None

    monkeypatch.setattr(chat_tools, "_attach_owned_account_ids", _no_portfolio)
    return seen


async def _run(tool_input: dict[str, Any]) -> dict[str, Any]:
    return await execute_chat_tool(TOOL_NAME, tool_input, user_id="u-1", profile_data={"company_name": "Cyrah"})


MAISON_LUXE = _candidate("111111111", "MAISON DU CUIR", "15.12Z", nafLabel="Fabrication d'articles de voyage")
BIJOUTIER = _candidate("222222222", "ATELIER BIJOU", "32.12Z", nafLabel="Fabrication d'articles de joaillerie")
BANQUE_LU = _candidate(
    "333333333", "BANQUE DU LUXEMBOURG FRANCE", "64.19Z", nafLabel="Autres intermédiations monétaires"
)


class TestUnLieuNEstPasUnSecteur:
    def test_luxembourg_n_est_pas_le_secteur_luxe(self) -> None:
        # LA CAUSE du call : préfixe « luxe » dans « luxembourg ».
        assert _sectors_for_word("luxembourg") == []
        assert "luxury" in _sectors_for_word("luxe")

    def test_les_pluriels_et_genres_restent_lus(self) -> None:
        assert "luxury" in _sectors_for_word("luxes")
        assert _sectors_for_word("aeronautiques") == _sectors_for_word("aeronautique") != []

    def test_une_demande_banque_luxembourg_ne_lit_pas_de_luxe(self) -> None:
        reading = read_request("banque Luxembourg")
        assert "luxury" not in reading.activities


@pytest.mark.asyncio
class TestPerimetre:
    async def test_luxe_ile_de_france_interroge_par_codes_naf_et_region(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen = _stub(monkeypatch, _Response([MAISON_LUXE, BIJOUTIER]))
        out = await _run({"sectors": ["luxury"], "region": ["11"]})
        filters = seen[0].filters
        assert not filters.sectors, "« luxe » n'a pas de section NAF : il passe par sa liste de codes"
        assert "15.12Z" in (filters.nafCode or "") and "32.12Z" in (filters.nafCode or "")
        assert filters.regions == ["11"]
        assert out["criteria"]["sectors"] == ["luxury"]
        assert out["criteria"]["region"] == ["11"]
        assert {item["name"] for item in out["items"]} == {"MAISON DU CUIR", "ATELIER BIJOU"}

    async def test_la_banque_du_luxembourg_sort_de_la_selection_principale(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _stub(monkeypatch, _Response([BANQUE_LU, MAISON_LUXE]))
        out = await _run({"sectors": ["luxury"], "requested_count": 2})
        assert [item["name"] for item in out["items"]] == ["MAISON DU CUIR"]
        # Proposée À PART, jamais pour atteindre le nombre demandé.
        assert [row["siren"] for row in out["out_of_scope"]] == ["333333333"]
        assert "hors" in out["out_of_scope"][0]["reason"]
        assert out["shortfall"]["requested"] == 2 and out["shortfall"]["found"] == 1
        assert out["shortfall"]["applied"] is False

    async def test_taille_hors_tranche_exclue_taille_inconnue_gardee_et_nommee(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        petite = _candidate("444444444", "PETITE MAISON", "15.12Z", headcount=20)
        geante = _candidate("555555555", "GRAND GROUPE LUXE", "15.12Z", headcount=5000)
        inconnue = _candidate("666666666", "TAILLE INCONNUE", "15.12Z")
        _stub(monkeypatch, _Response([geante, petite, inconnue]))
        out = await _run({"sectors": ["luxury"], "headcount": "10-49"})
        names = [item["name"] for item in out["items"]]
        assert names == ["PETITE MAISON", "TAILLE INCONNUE"]
        assert [row["siren"] for row in out["out_of_scope"]] == ["555555555"]
        assert out["headcount_unverified_count"] == 1
        # Une filiale n'est pas une PME autonome : les barrières achats sont nommées,
        # sans promesse de contournement.
        note = out["purchasing_barrier_note"]
        assert "groupe" in note and "filiale" in note
        assert "sans promettre de contournement" in note

    async def test_naf_illisible_garde_mais_nomme_non_verifie(self, monkeypatch: pytest.MonkeyPatch) -> None:
        sans_naf = _candidate("777777777", "SANS NAF", None)
        _stub(monkeypatch, _Response([MAISON_LUXE, sans_naf]))
        out = await _run({"sectors": ["luxury"]})
        assert len(out["items"]) == 2
        assert out["activity_unverified_count"] == 1
        assert "out_of_scope" not in out

    async def test_secteur_d_ecran_controle_aussi_par_section(self, monkeypatch: pytest.MonkeyPatch) -> None:
        telecom = _candidate("888888888", "OPERATEUR", "61.10Z")
        banque = _candidate("999999999", "UNE BANQUE", "64.19Z")
        _stub(monkeypatch, _Response([telecom, banque]))
        out = await _run({"sectors": ["telecom"]})
        assert [item["name"] for item in out["items"]] == ["OPERATEUR"]
        assert [row["siren"] for row in out["out_of_scope"]] == ["999999999"]


@pytest.mark.asyncio
class TestNouvellesCibles:
    async def test_les_besoins_ne_sont_pas_un_filtre(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub(monkeypatch, _Response([MAISON_LUXE, BIJOUTIER]))
        out = await _run({"sectors": ["luxury"], "signals": ["hiring", "tender"]})
        assert len(out["items"]) == 2, "sans demande documentée, l'entreprise reste proposée"
        assert "signals_not_applied" in out
        assert "potentiel" in out["needs_note"]

    async def test_nouvelles_cibles_distinguees_du_portefeuille(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub(monkeypatch, _Response([MAISON_LUXE, BIJOUTIER]))

        async def _own_one(items: Any, user_id: str) -> None:
            items[0]["account_id"] = "acc-1"

        monkeypatch.setattr(chat_tools, "_attach_owned_account_ids", _own_one)
        out = await _run({"sectors": ["luxury"]})
        assert out["already_in_workspace_count"] == 1
        assert out["new_targets_count"] == 1
        assert "account_id" not in out["items"][1], "aucun compte créé par la recherche"

    async def test_trop_peu_de_resultats_dit_et_propose_sans_appliquer(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub(monkeypatch, _Response([MAISON_LUXE, BIJOUTIER]))
        out = await _run(
            {"sectors": ["luxury"], "department": "75", "headcount": "10-49", "requested_count": 5, "limit": 5}
        )
        shortfall = out["shortfall"]
        assert shortfall["requested"] == 5 and shortfall["found"] == 2
        assert shortfall["applied"] is False
        assert shortfall["widening_proposal"], "un élargissement précis, pas « élargis l'un d'eux »"
        assert len(out["items"]) == 2, "aucun remplissage hors critères"

    async def test_source_en_panne_resultats_rendus_et_reprise_nommee(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub(
            monkeypatch,
            _Response([MAISON_LUXE], degraded=[{"source": "registre-b", "reason": "timeout", "fields": []}]),
        )
        out = await _run({"sectors": ["luxury"]})
        assert len(out["items"]) == 1
        resume = out["resume"]
        assert resume["tool"] == TOOL_NAME and resume["refine"] is True
        assert "registre-b" not in str(resume), "nos fournisseurs ne se nomment jamais"
