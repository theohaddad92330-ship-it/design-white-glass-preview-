"""CONTACTS 1/6 (lot 755) — couverture : le décideur que le client CONNAÎT doit être trouvé.

Jeu de vérité SANS NOM : rôle × entreprise, décrits comme les clients les citent en appel.
La mesure en production sur les vraies personnes se fait en local, hors de cette PR.
"""

from __future__ import annotations

import asyncio
from typing import Any

from app.models.contacts import ApolloSearchHit
from app.services.contact_ranking import rank_contacts_for_enrichment
from app.services.contact_zone import annotate_zone, prefer_zone_seeds
from app.services.web_role_search import role_queries, web_role_search


def _li(name: str, role: str, employer: str, slug: str) -> dict:
    return {"title": f"{name} - {role} - {employer} | LinkedIn", "url": f"https://fr.linkedin.com/in/{slug}"}


# --- Trou n°1 : le niveau GROUPE est cherché ---------------------------------------------------


def test_group_names_get_their_own_queries_after_the_account() -> None:
    queries = role_queries("Decathlon France", ["dsi"], group_names=["Decathlon"], max_queries=6)
    texts = [q[2] for q in queries]
    assert any('"Decathlon France"' in t for t in texts)
    assert any('"Decathlon"' in t and '"Decathlon France"' not in t for t in texts)
    # le compte garde la priorité : sa première requête passe avant celle du groupe
    assert '"Decathlon France"' in texts[0]


def test_group_queries_are_bounded_by_the_same_cap() -> None:
    queries = role_queries("A", ["dsi", "data", "achats"], group_names=["B", "C", "D", "E"], max_queries=7)
    assert len(queries) == 7


def test_group_level_dsi_is_found_through_a_group_query() -> None:
    asked: list[str] = []

    async def search(q: str) -> list[dict]:
        asked.append(q)
        if '"Decathlon"' in q and '"Decathlon France"' not in q:
            return [_li("Anne Groupe", "Directeur des Systèmes d'Information", "Decathlon", "ag")]
        return []

    found = asyncio.run(web_role_search("Decathlon France", ["dsi"], group_names=["Decathlon"], search=search))
    assert [f["linkedinUrl"] for f in found] == ["https://fr.linkedin.com/in/ag"]
    assert found[0]["contactEmployer"] == "Decathlon"


def test_without_group_names_the_queries_are_unchanged() -> None:
    assert role_queries("AXA", ["data"], max_queries=3) == role_queries("AXA", ["data"], group_names=None, max_queries=3)


# --- Trou n°2 : la zone ORDONNE, ne supprime rien, et dit pourquoi -----------------------------


def _seed(name: str, country: str | None, city: str | None = None) -> dict[str, Any]:
    return {"fullName": name, "country": country, "city": city}


def test_foreign_contact_goes_behind_for_a_french_zone_and_nobody_is_dropped() -> None:
    seeds = [_seed("US", "United States"), _seed("Paris", "France", "Paris"), _seed("Inconnu", None)]
    ordered = prefer_zone_seeds(seeds, ["11"])  # Île-de-France
    assert [s["fullName"] for s in ordered] == ["Paris", "Inconnu", "US"]
    assert len(ordered) == 3


def test_the_line_says_why() -> None:
    ordered = prefer_zone_seeds([_seed("US", "United States"), _seed("Paris", "France", "Paris")], ["11"])
    notes = {s["fullName"]: s.get("zoneNote") for s in ordered}
    assert notes["US"] == "hors zone : pays United States"
    assert notes["Paris"] is None  # dans la zone : rien à expliquer
    # région inconnue : non prouvé, jamais présenté comme dans la zone ni comme hors zone
    assert annotate_zone({"fullName": "X", "country": None}, ["11"]).get("zoneNote") is None


def test_no_zone_is_byte_identical() -> None:
    seeds = [_seed("US", "United States"), _seed("Paris", "France")]
    assert prefer_zone_seeds(seeds, None) == seeds
    assert all("zoneNote" not in s for s in prefer_zone_seeds(seeds, []))


# --- Jeu de vérité sans nom : où tombe chaque absent ? -----------------------------------------

#: (rôle, entreprise) tels que cités en appel. « niveau » = groupe ou filiale.
TRUTH_SET = [
    ("Head of Data / CDO groupe", "L'Oréal", "groupe"),
    ("Head of AI", "L'Oréal", "groupe"),
    ("Achats IT", "L'Oréal", "groupe"),
    ("DSI groupe", "L'Oréal", "groupe"),
    ("DSI groupe", "Decathlon", "groupe"),
    ("DSI", "Decathlon France", "filiale"),
    ("Head of Data", "Decathlon", "groupe"),
    ("CDO", "AXA", "groupe"),
    ("DSI groupe", "AXA", "groupe"),
    ("Responsable IA récent", "Accor", "groupe"),
    ("DSI", "OGF", "groupe"),
    ("Décideurs", "Arquus", "groupe"),
]


def test_truth_set_presort_keeps_group_heads_inside_the_cap() -> None:
    """Un DSI/CDO groupe noyé parmi 80 profils moins hauts ne doit pas être coupé au pré-tri (plafond 50)."""
    noise = [{"fullName": f"N{i}", "title": "Ingénieur développement"} for i in range(80)]
    heads = [
        {"fullName": "Dsi", "title": "Group Chief Information Officer"},
        {"fullName": "Cdo", "title": "Chief Data Officer"},
        {"fullName": "Ia", "title": "Head of AI"},
    ]
    kept = rank_contacts_for_enrichment(noise + heads, 50)
    assert {"Dsi", "Cdo", "Ia"} <= {c["fullName"] for c in kept}


def test_truth_set_is_described_without_names() -> None:
    assert len(TRUTH_SET) == 12
    assert all(isinstance(x, str) and x for row in TRUTH_SET for x in row)
    # ApolloSearchHit reste importable : le jeu de vérité n'embarque aucune personne réelle
    assert ApolloSearchHit(first_name="A", last_name="B").first_name == "A"
