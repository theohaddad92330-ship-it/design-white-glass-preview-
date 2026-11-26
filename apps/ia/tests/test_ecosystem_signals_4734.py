"""#4734 — les lignes d'annuaire entrent dans les signaux, datées, liées, sans nom de fournisseur."""

from app.services.dated_signals import merge_ecosystem_signals

ROW = {
    "type": "ecosystem",
    "label": "Labellisé · French Tech 120 · 2025",
    "date": "2025-11-03",
    "detail": "Annuaire de l'écosystème startup",
    "status": "known",
    "url": "https://annuaire.example/x",
}


def test_row_becomes_a_typed_dated_linked_signal() -> None:
    out = merge_ecosystem_signals([{"signal": "autre", "type": "job", "date": "2026-01-01"}], [ROW])
    assert out[0]["signal"] == "autre"
    added = out[1]
    assert added["type"] == "ecosystem"
    assert added["date"] == "2025-11-03"
    assert added["url"] == "https://annuaire.example/x"
    assert added["signal"] == "Labellisé · French Tech 120 · 2025"
    assert added["source"] == "Annuaire de l'écosystème startup"


def test_nothing_found_adds_no_line() -> None:
    assert merge_ecosystem_signals([{"signal": "a"}], []) == [{"signal": "a"}]
    assert merge_ecosystem_signals(None, None) == []


def test_stale_label_stays_listed_as_to_confirm() -> None:
    stale = {**ROW, "status": "unknown", "detail": "Annuaire de l'écosystème startup — à confirmer"}
    added = merge_ecosystem_signals([], [stale])[0]
    assert added["status"] == "unknown"
    assert "à confirmer" in added["detail"]


def test_same_link_is_not_added_twice() -> None:
    out = merge_ecosystem_signals([{"signal": "x", "url": ROW["url"]}], [ROW])
    assert len(out) == 1


def test_the_collection_path_calls_the_connector() -> None:
    """« Du code juste que personne n'appelle » : le chemin d'analyse appelle le connecteur ET fusionne."""
    from pathlib import Path

    source = (Path(__file__).parents[1] / "app/routers/phase1_research.py").read_text(encoding="utf-8")
    # Fusion du 31/10/2026 : un seul appelant, par le helper qui avale la panne d'annuaire (#4808).
    assert 'await ecosystem_signals_merged(result.get("recentSignals"), _anchor_siren)' in source
    assert source.count("ecosystem_signals_merged(") == 1
