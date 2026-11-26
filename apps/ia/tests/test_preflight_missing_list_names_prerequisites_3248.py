"""#3248 (recette NB 10/10) — « qu'est-ce qui manque avant d'ouvrir ce compte ? » listait
« aucun consultant positionné » mais ne nommait NI l'opt-out vérifié NI le plafond de
dossiers suivis (0 occurrence). La liste porte désormais ces deux lignes à chaque fois,
avec leur état (jamais cochées d'avance, jamais omises faute de donnée)."""

from __future__ import annotations

from app.services.compilers.account_preflight import ACCOUNT_PREFLIGHT_TOOL


def test_the_missing_list_always_names_opt_out_and_tracked_accounts_cap() -> None:
    description = str(ACCOUNT_PREFLIGHT_TOOL["description"])
    assert "AVANT D'OUVRIR" in description
    assert "opt-out" in description
    assert "plafond de dossiers suivis" in description
    assert "plafond non déclaré" in description
    assert "jamais omise" in description
