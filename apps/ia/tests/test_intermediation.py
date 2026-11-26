"""Le filtre cabinet de recrutement (tome 2 §13, ticket BEL-SRC-002)."""

from __future__ import annotations

from app.services.intermediation import (
    INTERMEDIATED_NOTE,
    PLATFORM_NOTE,
    intermediary_kind,
    intermediated_note,
    is_intermediated_employer,
    is_recruitment_naf,
    looks_like_platform,
    looks_like_recruiter,
)


def test_the_two_naf_codes_of_the_tome_are_recognised_in_every_spelling() -> None:
    for code in ("78.10Z", "7810Z", "78.10z", "78.30Z", "7830z"):
        assert is_recruitment_naf(code), code


def test_a_missing_or_unreadable_naf_is_not_a_recruiter() -> None:
    """On n'écarte pas un employeur sur un doute."""
    for value in (None, "", "  ", "inconnu"):
        assert not is_recruitment_naf(value)


def test_temporary_work_is_not_intermediation() -> None:
    """78.20Z place ses PROPRES salariés : c'est un vrai besoin de main-d'œuvre,
    pas une annonce pour le compte d'un tiers. Élargir sans preuve écarterait
    des comptes valides."""
    assert not is_recruitment_naf("78.20Z")


def test_it_companies_are_never_mistaken_for_recruiters() -> None:
    for naf in ("62.02A", "62.01Z", "70.22Z"):
        assert not is_recruitment_naf(naf)


def test_the_name_is_only_a_fallback_and_matches_whole_words() -> None:
    assert looks_like_recruiter("Michael Page International France")
    assert looks_like_recruiter("HAYS FRANCE")
    # « Thays Conseil » n'est pas « Hays ».
    assert not looks_like_recruiter("Thays Conseil")
    assert not looks_like_recruiter("Capgemini")


def test_the_registry_wins_over_the_name() -> None:
    """Un NAF résolu fait foi : une ESN qui s'appellerait « Hays Technologies »
    et porterait un NAF 62.02A n'est pas un cabinet."""
    assert not is_intermediated_employer(name="Hays Technologies", naf="62.02A")
    # Et l'inverse : un nom inconnu avec un NAF de placement reste un cabinet.
    assert is_intermediated_employer(name="Cabinet Dupont & Associés", naf="7810Z")


def test_without_a_naf_the_name_decides() -> None:
    assert is_intermediated_employer(name="Expectra")
    assert not is_intermediated_employer(name="Doctolib")


# #2265.4 / #2265.9 — une plateforme de mise en relation (canal) est un
# intermédiaire au même titre qu'un cabinet de recrutement : l'offre qu'elle
# publie ne prouve rien du besoin de l'employeur qui la lit derrière.
def test_collective_work_is_recognised_as_a_platform() -> None:
    assert looks_like_platform("Collective.work")
    assert is_intermediated_employer(name="Collective.work")


def test_known_freelance_platforms_are_recognised_by_name() -> None:
    for name in ("Malt", "Comet", "Freelance.com"):
        assert looks_like_platform(name), name


def test_platform_name_matches_whole_words_only() -> None:
    # « Maltese Consulting » n'est pas « Malt ».
    assert not looks_like_platform("Maltese Consulting")


def test_a_recruitment_cabinet_is_not_a_platform() -> None:
    assert not looks_like_platform("Hays France")


def test_intermediary_kind_names_the_category_or_is_absent() -> None:
    assert intermediary_kind(name="Cabinet Dupont & Associés", naf="7810Z") == "cabinet_recrutement"
    assert intermediary_kind(name="Collective.work") == "plateforme"
    assert intermediary_kind(name="Doctolib", naf="62.02A") is None


def test_intermediated_note_matches_the_category() -> None:
    assert intermediated_note("cabinet_recrutement") == INTERMEDIATED_NOTE
    assert intermediated_note("plateforme") == PLATFORM_NOTE
    assert intermediated_note(None) == INTERMEDIATED_NOTE


def test_temp_agency_by_naf_or_whole_word_name() -> None:
    # Recette 21/10 B.6 — intérim reconnu (NAF 78.20Z ou nom), jamais un nom qui y ressemble.
    from app.services.intermediation import is_temp_agency

    assert is_temp_agency(naf="78.20Z")
    assert is_temp_agency(name="Randstad France")
    assert is_temp_agency(name="ADECCO", naf=None)
    assert not is_temp_agency(name="Michael Page", naf="78.10Z")
    assert not is_temp_agency(name="Thays Conseil")
    assert not is_temp_agency(name=None, naf=None)
