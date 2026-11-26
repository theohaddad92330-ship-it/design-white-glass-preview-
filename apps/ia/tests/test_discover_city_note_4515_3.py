"""#4515.3 — « Non appliqué » sous le champ VILLE seulement si la source qui a répondu l'ignore."""

from __future__ import annotations

from app.routers.discover import _drop_city_note_of_other_sources
from app.services.company_filters import DegradeReason, degraded_entry


def test_la_note_ville_d_une_autre_source_tombe_quand_la_source_repondante_a_applique_la_ville() -> None:
    degraded = [degraded_entry("pappers", DegradeReason.UNSUPPORTED_FILTERS, fields=["city"])]
    _drop_city_note_of_other_sources(degraded, "recherche-entreprises")
    assert degraded == []


def test_sait_dire_non_la_note_de_la_source_repondante_reste() -> None:
    degraded = [degraded_entry("pappers", DegradeReason.UNSUPPORTED_FILTERS, fields=["city"])]
    _drop_city_note_of_other_sources(degraded, "pappers")
    assert [d["fields"] for d in degraded] == [["city"]]


def test_seule_la_ville_est_retiree_les_autres_criteres_non_appliques_restent() -> None:
    degraded = [degraded_entry("pappers", DegradeReason.UNSUPPORTED_FILTERS, fields=["sector", "city"])]
    _drop_city_note_of_other_sources(degraded, "recherche-entreprises")
    assert [d["fields"] for d in degraded] == [["sector"]]
