"""LUDB.9 — « méthodes/qualité » est un MÉTIER, pas une raison sociale ; « freelance » n'est jamais une cible."""

from __future__ import annotations

from app.services.chat_tools import _split_technologies


def test_job_terms_in_keywords_do_not_filter_the_company_name() -> None:
    # Cadré par une région et un secteur : « méthodes qualité » ne doit pas devenir un filtre de nom.
    _, keywords = _split_technologies(None, "méthodes qualité", reclassify=True)
    assert keywords == ""


def test_freelance_is_never_kept_as_a_target_keyword() -> None:
    _, keywords = _split_technologies(None, "freelance", reclassify=True)
    assert keywords == ""
    _, keywords = _split_technologies(None, "freelances méthodes", reclassify=True)
    assert keywords == ""


def test_real_company_name_is_kept() -> None:
    _, keywords = _split_technologies(None, "Still", reclassify=True)
    assert keywords == "Still"
    _, keywords = _split_technologies(None, "Qualité Mécanique SA", reclassify=True)
    assert keywords == "Qualité Mécanique SA"


def test_without_frame_a_job_word_stays_a_name() -> None:
    # Sans secteur ni zone, rien n'est reclassé : comportement d'avant.
    _, keywords = _split_technologies(None, "méthodes qualité", reclassify=False)
    assert keywords == "méthodes qualité"
