"""#3549.2 — la cascade ne perd jamais une coordonnée déjà rendue.

Un second fournisseur COMPLÈTE le premier (présent-seulement) : il ne remplace
pas un e-mail ou un téléphone déjà résolu, et un fournisseur qui revient vide
n'efface rien.
"""

from app.services.apollo import ApolloEnrichmentResult, ApolloPhoneNumber, _merge_present_only


def _result(**over) -> ApolloEnrichmentResult:
    return ApolloEnrichmentResult(matched=True, **over)


def test_second_provider_fills_the_missing_phone_without_touching_the_email() -> None:
    base = _result(email="alice@corp.fr", linkedin_url="https://linkedin.com/in/alice")
    extra = _result(
        email="autre@corp.fr",
        phone="+33612345678",
        phone_numbers=[ApolloPhoneNumber(number="+33612345678", type="mobile", status=None)],
    )
    merged = _merge_present_only(base, extra)
    assert merged.email == "alice@corp.fr"
    assert merged.phone == "+33612345678"
    assert [p.number for p in merged.phone_numbers] == ["+33612345678"]


def test_an_empty_provider_never_erases_what_the_first_one_found() -> None:
    base = _result(email="alice@corp.fr", phone="+33611111111")
    merged = _merge_present_only(base, ApolloEnrichmentResult(matched=False))
    assert merged.email == "alice@corp.fr"
    assert merged.phone == "+33611111111"
    assert merged.matched is True


def test_a_phone_already_resolved_is_not_replaced_by_a_later_one() -> None:
    base = _result(phone="+33611111111")
    extra = _result(phone="+33622222222")
    assert _merge_present_only(base, extra).phone == "+33611111111"
