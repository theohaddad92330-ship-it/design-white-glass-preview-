"""#4760 (HIST-F) — les offres d'emploi passent par l'estampillage ET par les couches.

Deux étages :
- le comportement (une offre de plus de 180 jours est ``archive`` et tombe dans
  ``historical``) ;
- la GARDE de câblage, qui lit ``phase1_research.py`` : ``test_signal_layers.py``
  teste la fonction seule, donc supprimer l'appel de la phase 1 ne cassait
  aucun test — c'est ainsi que #4070 et #4307 se sont perdues. Ces tests
  échouent si l'estampillage des offres ou la couche nommée disparaît.
"""

import ast
from datetime import date
from pathlib import Path

from app.services.signal_layers import build_signal_layers

TODAY = date(2026, 10, 28)
PHASE1 = Path(__file__).resolve().parents[1] / "app" / "routers" / "phase1_research.py"


def offre(titre: str, jour: str) -> dict:
    return {"title": titre, "date": jour}


class TestUneOffreAncienneEstArchivee:
    def test_une_offre_de_plus_de_180_jours_est_archive_avec_sa_date_reelle(self):
        stamped, layers = build_signal_layers(
            None, [offre("Architecte cloud", "2026-02-01"), offre("DevOps", "2026-10-10")], today=TODAY
        )
        by_title = {o["title"]: o for o in stamped}
        assert by_title["Architecte cloud"]["freshness"] == "archive"
        assert by_title["Architecte cloud"]["date"] == "2026-02-01"
        assert by_title["DevOps"]["freshness"] == "current"
        offers = layers["jobOffers"]
        assert [o["title"] for o in offers["historical"]] == ["Architecte cloud"]
        assert [o["title"] for o in offers["visible"]] == ["DevOps"]
        assert offers["counts"]["historical"] == 1

    def test_l_offre_non_datee_reste_undated_jamais_supposee_courante(self):
        stamped, _ = build_signal_layers(None, [{"title": "SRE"}], today=TODAY)
        assert stamped[0]["freshness"] == "undated"

    def test_aucune_offre_ni_signal_ne_pose_aucune_cle(self):
        stamped, layers = build_signal_layers(None, [], today=TODAY)
        assert stamped == [] and layers is None

    def test_sans_offre_les_couches_des_signaux_sont_inchangees(self):
        _, layers = build_signal_layers([{"signal": "Budget 2026", "date": "2026-09-01"}], [], today=TODAY)
        assert "jobOffers" not in layers and "visible" in layers

    def test_l_offre_ne_gagne_pas_de_type_en_sortie(self):
        stamped, _ = build_signal_layers(None, [offre("DevOps", "2026-10-10")], today=TODAY)
        assert "type" not in stamped[0]


def _phase1_calls() -> list[ast.Call]:
    tree = ast.parse(PHASE1.read_text(encoding="utf-8"))
    return [n for n in ast.walk(tree) if isinstance(n, ast.Call)]


class TestLeCablageDeLaPhase1:
    def test_la_phase1_appelle_build_signal_layers_sur_les_offres(self):
        calls = [
            c for c in _phase1_calls() if getattr(c.func, "id", None) == "build_signal_layers"
        ]
        assert calls, "phase1_research.py n'appelle plus build_signal_layers : les offres ne sont plus estampillées (#4760)"
        assert "itJobSignals" in ast.unparse(calls[0])

    def test_la_phase1_pose_les_offres_estampillees_et_la_cle_signalLayers(self):
        src = PHASE1.read_text(encoding="utf-8")
        assert 'result["itJobSignals"] = ' in src
        assert 'result["signalLayers"] = ' in src
