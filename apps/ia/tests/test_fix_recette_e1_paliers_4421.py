"""#4421.3 / #4408.1 (recette prod 25/10, épopée #4433 « tout s'élargit, Laura AGIT »).

« 10 petites structures < 250 salariés » rendait 3 comptes et « je ne complète pas artificiellement » : le
moteur avait bien élargi (tranche voisine, `widenedBy`), mais le contrôle de périmètre #3705 rangeait ces
voisins ÉTIQUETÉS « hors demande ». C'était l'APPELANT, pas le calcul : l'étiquette du palier doit désormais
sauver la ligne, et le manque restant se dit AVEC le palier — jamais sans lui."""

from __future__ import annotations

import pytest

from app.services.chat_tools import _split_by_scope
from tests.test_run_account_search_scope import _candidate, _Response, _run, _stub

SIZE_STEP = {"axis": "size", "tier": 1, "code": "GC"}


class TestUnVoisinEtiquetteResteDansLaListe:
    def test_une_tranche_voisine_etiquetee_n_est_pas_hors_demande(self) -> None:
        voisine = _candidate("111111111", "VOISINE", "15.12Z", headcount=400, widenedBy=SIZE_STEP)
        kept, out_of_scope, _, _ = _split_by_scope([voisine], sectors=[], headcount="50-249")
        assert [row["siren"] for row in kept] == ["111111111"]
        assert out_of_scope == []

    def test_dit_non_sans_etiquette_le_meme_effectif_reste_hors_demande(self) -> None:
        sans_etiquette = _candidate("222222222", "GROSSE", "15.12Z", headcount=400)
        kept, out_of_scope, _, _ = _split_by_scope([sans_etiquette], sectors=[], headcount="50-249")
        assert kept == []
        assert [row["siren"] for row in out_of_scope] == ["222222222"]

    def test_l_etiquette_d_un_axe_ne_sauve_pas_une_violation_d_un_autre(self) -> None:
        # étiquetée « secteur voisin » mais hors tranche d'effectif demandée : la taille reste une exigence.
        autre_axe = _candidate(
            "333333333", "AUTRE AXE", "15.12Z", headcount=400, widenedBy={"axis": "sector", "tier": 1}
        )
        kept, out_of_scope, _, _ = _split_by_scope([autre_axe], sectors=[], headcount="50-249")
        assert kept == []
        assert [row["siren"] for row in out_of_scope] == ["333333333"]


@pytest.mark.asyncio
class TestLeManqueSeDitAvecLePalier:
    async def test_dix_demandes_les_voisins_etiquetes_comptent_et_le_palier_est_dit(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        exacts = [_candidate(f"10000000{i}", f"PETITE {i}", "15.12Z", headcount=30) for i in range(3)]
        voisins = [
            _candidate(f"20000000{i}", f"VOISINE {i}", "15.12Z", headcount=400, widenedBy=SIZE_STEP) for i in range(4)
        ]
        _stub(monkeypatch, _Response([*exacts, *voisins]))
        out = await _run({"headcount": "10-49", "requested_count": 10, "limit": 10})
        assert len(out["items"]) == 7
        assert [item["name"] for item in out["items"][:3]] == ["PETITE 0", "PETITE 1", "PETITE 2"], "exacts d'abord"
        assert all(item.get("widened") for item in out["items"][3:])
        assert "widening_note" in out
        shortfall = out["shortfall"]
        assert shortfall["applied"] is True
        assert "taille voisine" in shortfall["message"]

    async def test_le_manque_apres_elargissement_ne_dit_jamais_je_ne_complete_pas_tout_court(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        exacts = [_candidate(f"10000000{i}", f"PETITE {i}", "15.12Z", headcount=30) for i in range(3)]
        _stub(monkeypatch, _Response(exacts))
        out = await _run({"headcount": "10-49", "requested_count": 10, "limit": 10})
        shortfall = out["shortfall"]
        message = shortfall["message"]
        assert "complète pas" not in message
        assert "sans demander" in message, "Laura n'attend pas la permission d'élargir"
        assert "en une ligne" in message
        assert "ton accord" not in str(shortfall.get("widening_proposal"))


def _compte_avec_offre(siren: str, name: str, titre: str, date: str) -> dict:
    return _candidate(
        siren, name, "15.12Z", skillEvidence={"latestOffer": {"title": titre, "date": date}}, signalsSearched=True
    )


@pytest.mark.asyncio
class TestUnCompteQuiRecrutePorteSonOffreDatee:
    """#4421.3 / #4408.1 — « 10 comptes qui recrutent un développeur commercial en AURA » rendait « Chargé de
    Clientèle H/F » : des comptes listés sans l'offre qui les justifie. Un compte sans offre datée n'entre pas
    dans la liste principale ; il se range à part, nommé, jamais compté dans le nombre demandé."""

    async def test_sans_offre_datee_le_compte_sort_de_la_liste_principale(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        avec = _compte_avec_offre("111111111", "AVEC OFFRE", "Développeur commercial H/F", "2026-10-20")
        sans = _candidate("222222222", "SANS OFFRE", "15.12Z")
        _stub(monkeypatch, _Response([avec, sans]))
        out = await _run({"signals": ["hiring"], "keywords": "développeurs", "region": ["84"], "limit": 10})
        assert [item["name"] for item in out["items"]] == ["AVEC OFFRE"]
        assert out["items"][0]["signals"][0] == {
            "type": "hiring",
            "label": "Développeur commercial H/F",
            "date": "2026-10-20",
        }
        assert [row["siren"] for row in out["without_matching_offer"]] == ["222222222"]
        assert "offre" in out["without_matching_offer"][0]["reason"]

    async def test_dit_non_hors_demande_de_recrutement_rien_n_est_retire(self, monkeypatch: pytest.MonkeyPatch) -> None:
        sans = _candidate("222222222", "SANS OFFRE", "15.12Z")
        _stub(monkeypatch, _Response([sans]))
        out = await _run({"region": ["84"], "limit": 10})
        assert [item["name"] for item in out["items"]] == ["SANS OFFRE"]
        assert "without_matching_offer" not in out
