"""Recette 31/10 — les filiales COCHÉES alimentent aussi les group_names de la recherche web par rôle."""

import re
from pathlib import Path

from app.services.search_hit_employer import account_identity

ROUTER = Path(__file__).resolve().parents[1] / "app" / "routers" / "phase2_contacts.py"


def test_checked_subsidiary_is_in_group_names() -> None:
    names = account_identity("Decathlon France", [], [], {}, extra_names=["Decathlon Digital"]).names[1:]
    assert "Decathlon Digital" in names


def test_web_role_search_group_names_receive_checked_entities() -> None:
    source = ROUTER.read_text(encoding="utf-8")
    line = next(row for row in source.splitlines() if "_wr_group = account_identity(" in row)
    assert re.search(r"extra_names=_checked", line), line
