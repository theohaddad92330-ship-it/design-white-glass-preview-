"""#4432.2/.3 (recette prod 23/10) — une carte de compte de Laura ne proposait que « Sélectionner » : aucun lien
d'ouverture vers l'analyse. Chaque compte hors de l'espace porte désormais « Analyser ce compte » vers
``/search?company=…&zone=…`` — la zone de la recherche voyage avec le nom (présélectionnée côté écran)."""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from app.services.known_shape_gate import shape_read_from_tool


def _ranking(output: dict) -> dict:
    read = shape_read_from_tool("run_account_search", output)
    assert read is not None
    return read["blocks"]["account_ranking"]


def test_un_compte_hors_espace_s_ouvre_dans_search_avec_la_zone() -> None:
    block = _ranking(
        {
            "axes": ["Région : Occitanie"],
            "criteria": {"region": ["76"]},
            "items": [{"name": "DASSAULT AVIATION", "siren": "712042456", "why": ["Aéronautique"]}],
        }
    )
    action = block["items"][0]["action"]
    assert action["label"] == "Analyser ce compte"
    url = urlparse(action["href"])
    assert url.path == "/search"
    assert parse_qs(url.query) == {"company": ["DASSAULT AVIATION"], "zone": ["Occitanie"]}


def test_sans_zone_le_lien_porte_le_nom_seul() -> None:
    block = _ranking({"axes": ["Secteur"], "items": [{"name": "ACME", "siren": "123456789", "why": ["x"]}]})
    assert parse_qs(urlparse(block["items"][0]["action"]["href"]).query) == {"company": ["ACME"]}


def test_un_compte_de_l_espace_garde_sa_fiche() -> None:
    block = _ranking(
        {
            "axes": ["Secteur"],
            "items": [
                {"name": "ACME", "siren": "123456789", "why": ["x"], "account_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}
            ],
        }
    )
    row = block["items"][0]
    assert row["href"].startswith("/accounts/") and "action" not in row
