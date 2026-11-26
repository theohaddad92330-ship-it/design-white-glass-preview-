"""LUD.6 — un compte ouvert depuis une zone : ses décideurs passent devant, personne n'est exclu."""

from __future__ import annotations

import asyncio

from app.models.contacts import ApolloSearchHit, ContactsRequest
from app.services.contact_zone import prefer_zone, zone_departments


def _hit(first: str, city: str, state: str) -> ApolloSearchHit:
    return ApolloSearchHit(
        first_name=first, last_name="X", title="Directeur", organization_name="ARQUUS", city=city, state=state
    )


VERSAILLES = _hit("Siege", "Versailles", "Île-de-France")
GARCHIZY = _hit("Garchizy", "Garchizy", "Bourgogne-Franche-Comté")
DIJON = _hit("Dijon", "Dijon", "Bourgogne-Franche-Comté")
INCONNU = _hit("Inconnu", "", "")
LYON = _hit("Lyon", "Lyon", "Auvergne-Rhône-Alpes")


def test_zone_codes() -> None:
    assert "58" in zone_departments(["27"])  # BFC
    assert "69" in zone_departments(["84"])  # AURA
    assert zone_departments(["dept:69"]) == frozenset({"69"})
    assert zone_departments([]) == frozenset()


def test_bfc_contacts_first_nobody_excluded() -> None:
    hits = [VERSAILLES, INCONNU, GARCHIZY, LYON, DIJON]
    ordered = prefer_zone(hits, ["27"])
    assert [h.first_name for h in ordered] == ["Garchizy", "Dijon", "Siege", "Inconnu", "Lyon"]
    assert len(ordered) == len(hits)


def test_no_zone_keeps_the_order_exactly() -> None:
    hits = [VERSAILLES, GARCHIZY]
    assert prefer_zone(hits, None) == hits
    assert prefer_zone(hits, []) == hits


def test_contacts_route_ranks_the_zone_first(monkeypatch) -> None:
    from app.routers.phase2_contacts import _contacts

    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    hits = [VERSAILLES, INCONNU, GARCHIZY, DIJON, LYON]
    out = asyncio.run(_contacts(ContactsRequest(company_name="ARQUUS", prefetched_hits=hits, preferred_zone=["27"])))
    names = [c["fullName"] for c in out.data["contacts"]]
    assert names[:2] == ["Garchizy X", "Dijon X"]
    assert {"Siege X", "Lyon X"} <= set(names), "les décideurs du siège restent"
    cities = {c["fullName"]: c.get("city") for c in out.data["contacts"]}
    assert cities["Garchizy X"] == "Garchizy", "la ville est rendue"

    plain = asyncio.run(_contacts(ContactsRequest(company_name="ARQUUS", prefetched_hits=hits)))
    assert [c["fullName"] for c in plain.data["contacts"]][0] == "Siege X"
