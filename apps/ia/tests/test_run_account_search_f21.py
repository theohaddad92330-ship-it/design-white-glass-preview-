"""F21 (#3705 .3/.5, #3706) — sens de la zone, rattachement à un groupe, secteurs exclus.

⚠️ #3983 (Louis 11/10) revient sur F21/3db6babee4, délibérément : la zone filtre l'implantation
par défaut, le siège sur demande. « Ça dépend du type de boîte : une holding à Paris dont les
boîtes sont dans le Sud, ce sont les boîtes du Sud qui comptent, là où les gens recrutent. »
F21 faisait dire à toute zone « filtre sur le SIÈGE » ; `site_basis` choisit désormais la base,
et la note dit la base RÉELLEMENT appliquée.
"""

from __future__ import annotations

import pytest

from app.services.chat_thread_state import REFINABLE_SEARCH_CRITERIA
from app.services.data_sources.recherche_entreprises import _corporate_officers
from tests.test_run_account_search_scope import (
    BANQUE_LU,
    MAISON_LUXE,
    _candidate,
    _Response,
    _run,
    _stub,
)


def test_commissaire_aux_comptes_n_est_pas_une_maison_mere() -> None:
    raw = [
        {"type_dirigeant": "personne morale", "denomination": "HOLDING X", "qualite": "Président"},
        {"type_dirigeant": "personne morale", "denomination": "CABINET AUDIT", "qualite": "Commissaire aux comptes titulaire"},
        {"type_dirigeant": "personne physique", "nom": "DUPONT", "qualite": "Président"},
    ]
    assert _corporate_officers(raw) == ["HOLDING X"]
    assert _corporate_officers(None) == []


@pytest.mark.asyncio
class TestF21:
    async def test_la_zone_dit_qu_elle_filtre_le_siege(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """#3983 — nom gardé pour l'historique : la zone filtre l'IMPLANTATION par défaut, le
        SIÈGE seulement sur `site_basis`. Les deux branches sont vérifiées : la note de l'une ne
        se lit jamais dans l'autre (le test dit NON à une note « siège » sans demande)."""
        _stub(monkeypatch, _Response([MAISON_LUXE]))
        out = await _run({"sectors": ["luxury"], "region": ["11"]})
        assert out["geography_basis"] == "presence"
        assert "IMPLANTATION" in out["geography_note"]
        assert "SIÈGE" not in out["geography_note"]

        _stub(monkeypatch, _Response([MAISON_LUXE]))
        out = await _run({"sectors": ["luxury"], "region": ["11"], "site_basis": "headquarters"})
        assert out["geography_basis"] == "headquarters"
        assert "SIÈGE" in out["geography_note"]
        assert "IMPLANTATION" not in out["geography_note"]

    async def test_sans_zone_aucune_note_de_geographie(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub(monkeypatch, _Response([MAISON_LUXE]))
        out = await _run({"sectors": ["luxury"]})
        assert "geography_note" not in out

    async def test_filiale_observee_n_est_pas_presentee_autonome(self, monkeypatch: pytest.MonkeyPatch) -> None:
        filiale = _candidate("777777777", "PETITE FILIALE", "15.12Z", headcount=20, corporateOfficers=["GROUPE MERE SA"])
        libre = _candidate("888888888", "INDEPENDANTE", "15.12Z", headcount=20)
        _stub(monkeypatch, _Response([filiale, libre]))
        out = await _run({"sectors": ["luxury"], "headcount": "10-49"})
        by_name = {item["name"]: item for item in out["items"]}
        assert by_name["PETITE FILIALE"]["group_link"]["observed_entities"] == ["GROUPE MERE SA"]
        assert "group_link" not in by_name["INDEPENDANTE"], "l'absence d'indice n'est pas « indépendante »"
        assert out["group_link_count"] == 1
        assert "PETITE FILIALE" in out["subsidiary_warning"] and "INDEPENDANTE" not in out["subsidiary_warning"]

    async def test_secteur_exclu_sort_de_la_selection_et_se_compte(self, monkeypatch: pytest.MonkeyPatch) -> None:
        inconnu = _candidate("999999999", "NAF ILLISIBLE", None)
        _stub(monkeypatch, _Response([BANQUE_LU, MAISON_LUXE, inconnu]))
        out = await _run({"keywords": "maison", "exclude_sectors": ["finance"]})
        assert [i["name"] for i in out["items"]] == ["MAISON DU CUIR", "NAF ILLISIBLE"]
        assert out["excluded_by_sector_count"] == 1
        assert out["criteria"]["exclude_sectors"] == ["finance"]
        assert "out_of_scope" not in out

    async def test_exclure_un_secteur_vise_est_ignore(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _stub(monkeypatch, _Response([MAISON_LUXE]))
        out = await _run({"sectors": ["luxury"], "exclude_sectors": ["luxury"]})
        assert "exclude_sectors" not in out["criteria"] and len(out["items"]) == 1

    def test_l_exclusion_est_affinable(self) -> None:
        assert "exclude_sectors" in REFINABLE_SEARCH_CRITERIA["run_account_search"]


# ── #3706 — le point d'entrée choisi pilote la suite ────────────────────────
from app.prompts.thread_state import format_thread_state_block  # noqa: E402
from app.services.chat_thread_state import ThreadState, ThreadStateCollector  # noqa: E402
from app.services.chat_tools import execute_chat_tool  # noqa: E402

ROOT = {"id": "acc-groupe", "label": "Groupe Mère"}
FILIALE = {"id": "acc-fil", "label": "Filiale Sud", "relation": "filiale", "chosen_by": "user"}


def _collector() -> ThreadStateCollector:
    return ThreadStateCollector(ThreadState())


@pytest.mark.asyncio
async def test_une_recommandation_de_laura_n_est_pas_un_choix() -> None:
    out = await execute_chat_tool(
        "note_thread_context", {"group_scope_root": ROOT, "group_scope_entry": {**FILIALE, "chosen_by": "laura"}},
        user_id="u-1", profile_data=None,
    )
    assert "group_scope_entry" not in out


@pytest.mark.asyncio
async def test_le_choix_de_filiale_entre_dans_le_fil_et_le_prompt() -> None:
    out = await execute_chat_tool(
        "note_thread_context", {"group_scope_root": ROOT, "group_scope_entry": FILIALE}, user_id="u-1", profile_data=None
    )
    assert out["group_scope_entry"]["relation"] == "filiale"
    collector = _collector()
    collector.record("note_thread_context", {}, {"status": "thread_note", **out})
    scope = collector.state.persistent_scope
    assert scope is not None and scope.entry_entity is not None and scope.entry_entity.id == "acc-fil"
    block = format_thread_state_block(collector.state)
    assert "CHOISI par la personne (filiale) : Filiale Sud" in block
    assert "dirigeant informatique du groupe" in block


def test_le_choix_survit_au_tour_suivant_et_change_avec_le_groupe() -> None:
    collector = _collector()
    entry = {**FILIALE}
    collector.record("note_thread_context", {}, {"status": "thread_note", "group_scope_root": ROOT, "group_scope_entry": entry})
    collector.record("note_thread_context", {}, {"status": "thread_note", "group_scope_includes": [{"id": "x", "label": "X"}]})
    assert collector.state.persistent_scope.entry_entity.id == "acc-fil"
    collector.record("note_thread_context", {}, {"status": "thread_note", "group_scope_root": {"id": "autre", "label": "Autre"}})
    assert collector.state.persistent_scope.entry_entity is None


def test_le_choix_traverse_la_serialisation_du_fil() -> None:
    from app.services.chat_thread_state import thread_state_from_wire

    collector = _collector()
    collector.record("note_thread_context", {}, {"status": "thread_note", "group_scope_root": ROOT, "group_scope_entry": FILIALE})
    back = thread_state_from_wire(collector.state.to_wire())
    assert back.persistent_scope is not None and back.persistent_scope.entry_relation == "filiale"
    assert back.persistent_scope.entry_entity.label == "Filiale Sud"


@pytest.mark.asyncio
async def test_un_compte_connu_est_signale_sans_remplacer_la_comparaison(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import chat_tools

    _stub(monkeypatch, _Response([MAISON_LUXE, _candidate("121212121", "AUTRE MAISON", "15.12Z")]))

    async def _owned(items: object, user_id: str) -> None:
        for item in items or []:  # type: ignore[union-attr]
            if item["siren"] == "111111111":
                item["account_id"] = "acc-1"

    monkeypatch.setattr(chat_tools, "_attach_owned_account_ids", _owned)
    out = await _run({"sectors": ["luxury"]})
    assert [i["name"] for i in out["items"]] == ["MAISON DU CUIR", "AUTRE MAISON"], "la ligne reste, au même rang"
    assert out["items"][0]["already_in_workspace"] is True
    # #3704.2 — recette prod 06/10 : posé sur CHAQUE ligne (True ET False), jamais
    # seulement sur les comptes connus — sinon la carte ne peut jamais nommer une
    # « nouvelle cible », faute de distinguer « non vérifié » de « nouveau ».
    assert out["items"][1]["already_in_workspace"] is False
    assert out["already_in_workspace_count"] == 1 and out["new_targets_count"] == 1
    assert "ne remplace jamais" in out["known_account_note"]
