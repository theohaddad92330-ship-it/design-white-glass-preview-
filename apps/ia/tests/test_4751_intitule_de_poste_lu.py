"""#4751 — « Product Owner à Lille » : l'intitulé est un PROFIL cherché, pas deux mots « non pris en compte ».

Lu avant : `leftover=('Product', 'Owner')` — les deux mots sortaient de la recherche (listés « non
appliqués ») et la demande perdait son métier. Un intitulé connu se lit comme un profil recruté, sans que
l'utilisateur ait à écrire « qui recrute » ; la lecture le dit (`profile_words`), elle ne le devine pas
quand le mot est ambigu (« Product Software » reste un nom).
"""

from __future__ import annotations

import pytest

from app.services.discover_request_reading import read_request
from tests.test_discover_signals_router import _post, _resolution, _row, registry, resolver, sources  # noqa: F401


@pytest.mark.parametrize(
    "text, title",
    [
        ("Product Owner à Lille", "Product Owner"),
        ("product manager sur Lyon", "product manager"),
        ("Scrum Master à Nantes", "Scrum Master"),
        ("chef de projet à Lille", "chef de projet"),
    ],
)
def test_a_known_job_title_is_read_as_the_profile_sought(text, title) -> None:
    reading = read_request(text)
    assert " ".join(reading.profile_words).lower() == title.lower()
    assert reading.intent == "hiring"
    assert reading.leftover == ()


def test_the_place_is_still_read_after_the_title() -> None:
    assert read_request("Product Owner à Lille").place_candidates == ("Lille",)


def test_an_ambiguous_word_alone_stays_a_name() -> None:
    reading = read_request("Product Software")
    assert reading.profile_words == ()
    assert reading.leftover == ("Product", "Software")


def test_an_explicit_intent_is_never_overridden() -> None:
    reading = read_request("Product Owner marché public à Lille")
    assert reading.intent == "tender"


def test_one_legal_entity_named_three_ways_is_one_account(client, sources, resolver) -> None:
    """Le doublon vu en démonstration : le même employeur publié sous trois écritures (nom seul, nom avec
    forme sociale, SIRET complet) ne fait qu'UN compte, signaux fusionnés. Garde de non-régression de la
    fusion par SIREN (`_build_candidates`) : même cause que #4603 si elle casse (un compte, pas deux)."""
    sources["hiring"] = [
        _row("Décathlon", "hiring", 1),
        _row("DECATHLON FRANCE SAS", "hiring", 2),
        _row("Decathlon", "hiring", 3, siren="30613890001234"),
    ]
    resolver["Décathlon"] = _resolution("306138900", "DECATHLON", naf="4764Z")
    resolver["DECATHLON FRANCE SAS"] = _resolution("306138900", "DECATHLON", naf="4764Z")

    data = _post(client).json()
    assert [c["siren"] for c in data["candidates"]] == ["306138900"]
    assert len(data["candidates"][0]["signals"]) == 3
