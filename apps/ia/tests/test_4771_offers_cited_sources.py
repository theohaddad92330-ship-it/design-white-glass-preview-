"""#4771 — une liste d'offres datées et sourcées ne porte jamais « Aucune preuve actuelle ».

Mesuré en recette de production le 28/10/2026 : `search_job_offers` rendait 39 offres, mais
`cited_sources` ne la connaissait pas — `context.sources` restait vide avec un outil lu, et le
pied de réponse (`sourceCount === 0`) déduisait « Aucune preuve actuelle » sous la liste.
L'outil a un CITEUR : ce qu'il a lu entre dans les sources, daté de l'offre la plus récente.
"""

from __future__ import annotations

from app.services.chat_tools import cited_sources


def _offer(date: str, title: str = "Dev Java") -> dict:
    return {"title": title, "employer": "FOKUS", "date": date, "city": "Lyon", "url": "https://x.example/1"}


def test_offers_read_become_one_dated_cited_source() -> None:
    output = {"offers": [_offer("2026-10-06"), _offer("2026-10-28"), _offer("2026-10-15")]}
    sources = cited_sources("search_job_offers", output)
    assert len(sources) == 1
    assert sources[0]["as_of"] == "2026-10-28"
    assert sources[0]["label"]


def test_the_date_is_never_guessed_when_no_offer_carries_one() -> None:
    sources = cited_sources("search_job_offers", {"offers": [_offer(""), _offer("")]})
    assert len(sources) == 1
    assert "as_of" not in sources[0]


def test_no_offer_or_an_error_cites_nothing() -> None:
    assert cited_sources("search_job_offers", {"offers": []}) == []
    assert cited_sources("search_job_offers", {"error": "Les sources d'offres n'ont pas répondu"}) == []
