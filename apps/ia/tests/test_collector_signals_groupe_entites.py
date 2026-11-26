"""DECATHLON-FIN 11/10 — #4031 : le compteur « Jobs IT » de la Veille compte les
signaux `recrutement` de `recent_signals`. Les offres des entités d'un même groupe
(Decathlon France, Decathlon Technology, Decathlon Digital) y entrent TOUTES, y
compris deux offres de même intitulé le même jour mais d'entités (donc de liens)
différents : ce sont deux offres, pas un doublon."""

from __future__ import annotations

from app.services.dated_signals import merge_collector_signals


def _recruitment(out: list[dict]) -> list[dict]:
    return [s for s in out if s.get("type") == "recrutement"]


def test_offers_of_several_group_entities_are_all_kept() -> None:
    jobs = [
        {"title": "Développeur Java", "date": "2026-10-05", "url": "https://jobs.example/france/1"},
        {"title": "Data engineer", "date": "2026-10-04", "url": "https://jobs.example/technology/2"},
        {"title": "Product owner", "date": "2026-10-03", "url": "https://jobs.example/digital/3"},
    ]
    assert len(_recruitment(merge_collector_signals([], jobs=jobs))) == 3


def test_same_title_same_day_on_two_entities_is_two_offers() -> None:
    jobs = [
        {"title": "Développeur Java", "date": "2026-10-05", "url": "https://jobs.example/france/1"},
        {"title": "Développeur Java", "date": "2026-10-05", "url": "https://jobs.example/technology/9"},
    ]
    assert len(_recruitment(merge_collector_signals([], jobs=jobs))) == 2


def test_same_link_or_same_unlinked_row_is_still_one_offer() -> None:
    same_link = [
        {"title": "Développeur Java", "date": "2026-10-05", "url": "https://jobs.example/1"},
        {"title": "Développeur Java (copie)", "date": "2026-10-05", "url": "https://jobs.example/1"},
    ]
    assert len(_recruitment(merge_collector_signals([], jobs=same_link))) == 1
    unlinked = [
        {"title": "Développeur Java", "date": "2026-10-05"},
        {"title": "Développeur Java", "date": "2026-10-05"},
    ]
    assert len(_recruitment(merge_collector_signals([], jobs=unlinked))) == 1
