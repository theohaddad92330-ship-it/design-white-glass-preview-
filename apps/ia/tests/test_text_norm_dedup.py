"""#23 : dedup par nom normalisé (au-delà du dedup SIREN-only)."""

from __future__ import annotations

from app.services.text_norm import dedup_by_name


def test_dedup_scalars_accent_case_insensitive():
    assert dedup_by_name(["Capgemini", "CAPGEMINI", "Sopra"]) == ["Capgemini", "Sopra"]
    assert dedup_by_name(["Énergies", "Energies"]) == ["Énergies"]


def test_dedup_dicts_by_key_first_wins_order_preserved():
    items = [
        {"name": "Capgemini", "scope": "infra"},
        {"name": "capgemini se", "scope": "apps"},  # même nom normalisé (SE ignoré ? non)
        {"name": "Accenture", "scope": "conseil"},
    ]
    out = dedup_by_name(items, key=lambda d: d.get("name"))
    # "capgemini se" != "capgemini" → gardé (dedup exact, pas de suffixe magique)
    assert [d["name"] for d in out] == ["Capgemini", "capgemini se", "Accenture"]


def test_exact_name_variant_deduped():
    items = [{"name": "Sopra Steria"}, {"name": "sopra  steria"}, {"name": "Atos"}]
    out = dedup_by_name(items, key=lambda d: d.get("name"))
    assert [d["name"] for d in out] == ["Sopra Steria", "Atos"]


def test_blank_names_all_kept():
    items = [{"name": ""}, {"name": None}, {"name": "X"}, {"name": "X"}]
    out = dedup_by_name(items, key=lambda d: d.get("name"))
    # les 2 blancs restent (ne pas fusionner des lignes distinctes) ; les 2 "X" → 1
    assert len(out) == 3


def test_non_list_returns_empty():
    assert dedup_by_name(None) == []
    assert dedup_by_name("nope") == []
