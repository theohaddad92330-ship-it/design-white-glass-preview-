"""Politique de télétravail d'une offre d'emploi — #3096 (call bêta Apricot
Labs, 24/09/2026).

> « Cibler les comptes sur des critères liés au consultant, avec des tags full
> remote, pour qu'une ESN dont les consultants travaillent à distance sache
> vers quels comptes aller. »

Déterministe, sans LLM : une offre ne porte cette classification que si son
texte le dit EXPLICITEMENT. Doctrine — « non mesuré » n'est jamais « sur site » :
`None` est le résultat par défaut, jamais deviné d'un silence.
"""

from __future__ import annotations

from app.services.remote_policy import derive_remote_policy


def test_a_full_remote_offer_is_recognised_in_french():
    assert derive_remote_policy("Développeur Python", "Poste en full remote, équipe distribuée") == "full_remote"


def test_a_full_remote_offer_is_recognised_in_english():
    assert derive_remote_policy("Backend Engineer", "100% remote position, work from anywhere") == "full_remote"


def test_a_hybrid_offer_is_recognised():
    assert derive_remote_policy("Ingénieur DevOps", "Télétravail hybride, 2 jours par semaine au bureau") == "hybride"


def test_an_onsite_offer_is_recognised_only_when_explicit():
    assert derive_remote_policy("Technicien support", "Poste sur site, présentiel obligatoire") == "sur_site"


def test_an_offer_silent_on_remote_work_is_never_evaluated():
    """Silence n'est pas « sur site » — doctrine « non mesuré ≠ 0 »."""
    assert derive_remote_policy("Chef de projet IT", "Vous pilotez le programme de transformation.") is None


def test_empty_or_missing_text_is_never_evaluated():
    assert derive_remote_policy(None, None) is None
    assert derive_remote_policy("", "") is None


def test_full_remote_wins_when_the_text_also_mentions_occasional_office_days():
    """Une mention EXPLICITE de full remote prime — le texte peut nuancer
    ("télétravail total, un séminaire par trimestre") sans devenir hybride."""
    assert derive_remote_policy(None, "Télétravail total, un séminaire d'équipe par trimestre") == "full_remote"


# ── #4736 lot G : DE / ES / GB — les offres s'écrivent dans la langue du pays ─────


def test_a_full_remote_offer_is_recognised_in_german():
    assert derive_remote_policy("Backend-Entwickler", "Stelle komplett remote, 100 % remote möglich") == "full_remote"
    assert derive_remote_policy("DevOps", "Vollständig remote in ganz Deutschland") == "full_remote"


def test_a_full_remote_offer_is_recognised_in_spanish():
    assert derive_remote_policy("Desarrollador", "Puesto 100% remoto, teletrabajo total") == "full_remote"
    assert derive_remote_policy("Ingeniero", "Trabajo totalmente remoto desde España") == "full_remote"


def test_hybrid_in_german_and_spanish_is_never_full_remote():
    assert derive_remote_policy("Entwickler", "Hybrides Arbeiten, 2 Tage Homeoffice") == "hybride"
    assert derive_remote_policy("Desarrollador", "Modelo híbrido, teletrabajo parcial") == "hybride"
    assert derive_remote_policy("Developer", "Hybrid working, 3 days in the office") == "hybride"


def test_homeoffice_alone_is_not_a_policy():
    """« Homeoffice möglich » / « posibilidad de teletrabajo » ne dit pas full remote : None, pas deviné."""
    assert derive_remote_policy("Entwickler", "Homeoffice möglich") is None
    assert derive_remote_policy("Desarrollador", "Posibilidad de teletrabajo") is None
