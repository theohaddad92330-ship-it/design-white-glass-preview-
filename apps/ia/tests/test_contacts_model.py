"""Regression tests for the ``ApolloSearchHit`` / ``ContactsData`` boundary.

The phase-2 envelope path wraps camelCase seed dicts (built by
``_apollo_hit_to_seed`` / ``_fallback_contact_to_seed`` / the Pappers seed
block) into ``ContactsData``. Those builders emit ``city=None`` / ``country=None``
for unknown locations, while ``ApolloSearchHit`` documents empty strings — not
None — as the stable wire shape. Pydantic must coerce, not reject.
"""

from __future__ import annotations

from app.models.contacts import ApolloSearchHit, ContactsRequest
from app.models.contacts_data import ContactsData


def test_contacts_request_defaults_prefetched_hits_to_none() -> None:
    # None = no prefetch (contacts_node searches live). The forward ref to the
    # later-defined ApolloSearchHit must resolve so the model instantiates.
    req = ContactsRequest(company_name="x")
    assert req.prefetched_hits is None


def test_contacts_request_accepts_prefetched_hits() -> None:
    hits = [ApolloSearchHit(first_name="Jean", last_name="Dupont", title="DSI")]
    req = ContactsRequest(company_name="x", prefetched_hits=hits)
    assert req.prefetched_hits is not None
    assert req.prefetched_hits[0].first_name == "Jean"
    # An empty list is a genuine 0-hit prefetch, distinct from None.
    assert ContactsRequest(company_name="x", prefetched_hits=[]).prefetched_hits == []


def test_apollo_hit_coerces_none_strings_to_empty() -> None:
    hit = ApolloSearchHit(city=None, country=None, title=None)  # type: ignore[arg-type]
    assert hit.city == ""
    assert hit.country == ""
    assert hit.title == ""


def test_contacts_data_accepts_seeds_with_none_location() -> None:
    """Mirrors the exact shape phase-2 builds before wrapping in the envelope:
    camelCase keys + None for unknown title/city/country."""
    seeds = [
        {
            "fullName": "Jean Dupont",
            "title": None,
            "linkedinUrl": None,
            "city": None,
            "country": None,
            "source": "apollo",
        },
    ]
    data = ContactsData(contacts=seeds, count=len(seeds))
    assert data.count == 1
    assert data.contacts[0].title == ""
    assert data.contacts[0].city == ""
    assert data.contacts[0].country == ""


def test_apollo_hit_passes_camelcase_seed_keys_through() -> None:
    """``extra="allow"`` mirrors the TS ``.passthrough()`` so the camelCase
    seed identity (fullName / linkedinUrl / source) survives the envelope."""
    hit = ApolloSearchHit.model_validate(
        {"fullName": "Jean Dupont", "linkedinUrl": "https://x", "source": "apollo"}
    )
    dumped = hit.model_dump()
    assert dumped["fullName"] == "Jean Dupont"
    assert dumped["linkedinUrl"] == "https://x"
    assert dumped["source"] == "apollo"
