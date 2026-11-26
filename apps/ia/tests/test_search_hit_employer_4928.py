"""#4928.1/.2/.6 — garde d'employeur sur chaque résultat de recherche par nom.

« Boulanger » ramenait « Boulangerie Ange » : la recherche floue d'Apollo n'était vérifiée par rien. Le garde doit
savoir dire NON (homonymes de noms communs) et OUI (le compte, ses suffixes, son groupe, une expérience en cours)."""

from __future__ import annotations

from app.models.contacts import ApolloSearchHit
from app.services.search_hit_employer import AccountIdentity, guard_search_hits, name_matches_account


def _hit(org: str, **kw) -> ApolloSearchHit:
    return ApolloSearchHit(id=kw.pop("id", "p1"), first_name="A", last_name="B", organization_name=org, **kw)


def test_boulangerie_is_not_boulanger() -> None:
    assert not name_matches_account("Boulangerie Ange", ["Boulanger"])
    assert not name_matches_account("Boulangeries Lucas", ["Boulanger"])
    assert not name_matches_account("Boulangerie chez Jules", ["Boulanger"])


def test_exact_and_legal_or_geo_suffix_pass() -> None:
    assert name_matches_account("BOULANGER", ["Boulanger"])
    assert name_matches_account("Boulanger SA", ["Boulanger"])
    assert name_matches_account("Boulanger France", ["Boulanger"])


def test_common_name_homonyms_say_no() -> None:
    assert not name_matches_account("Stillfront", ["Still"])
    assert not name_matches_account("Orange Bleue", ["Orange"])
    assert not name_matches_account("Total Wine", ["Total"])
    assert name_matches_account("Orange SA", ["Orange"])


def test_group_entity_name_passes() -> None:
    assert name_matches_account("Darty", ["Fnac Darty", "Darty"])


def test_guard_drops_with_reason_and_counts() -> None:
    account = AccountIdentity(names=["Boulanger"])
    kept, dropped = guard_search_hits([_hit("Boulanger SA", id="ok"), _hit("Boulangerie Ange", id="ko")], account)
    assert [h.id for h in kept] == ["ok"]
    assert [(h.id, reason) for h, reason in dropped] == [("ko", "employer_mismatch")]


def test_org_id_or_domain_keeps_even_with_odd_name() -> None:
    account = AccountIdentity(names=["Boulanger"], org_ids=["org1"], domains=["boulanger.com"])
    kept, _ = guard_search_hits(
        [_hit("Groupe X", id="a", organization_id="org1"), _hit("Groupe Y", id="b", organization_domain="www.boulanger.com")],
        account,
    )
    assert {h.id for h in kept} == {"a", "b"}


def test_ongoing_experience_at_account_keeps_and_fixes_entity_and_title() -> None:
    account = AccountIdentity(names=["Boulanger"])
    hit = _hit(
        "Boulangerie chez Jules",
        title="Aide boulanger",
        employment_history=[
            {"title": "Aide boulanger", "organization": "Boulangerie chez Jules", "current": True, "start_date": "2024-01-01"},
            {"title": "Responsable SI", "organization": "Boulanger", "current": True, "start_date": "2020-01-01"},
        ],
    )
    kept, dropped = guard_search_hits([hit], account)
    assert not dropped and kept[0].organization_name == "Boulanger" and kept[0].title == "Responsable SI"


def test_ended_experience_does_not_save_the_hit() -> None:
    account = AccountIdentity(names=["Boulanger"])
    hit = _hit(
        "Boulangerie Ange",
        employment_history=[{"title": "SI", "organization": "Boulanger", "current": False, "end_date": "2022-01-01"}],
    )
    kept, dropped = guard_search_hits([hit], account)
    assert not kept and len(dropped) == 1


def test_unknown_employer_is_never_rejected() -> None:
    kept, dropped = guard_search_hits([_hit("")], AccountIdentity(names=["Boulanger"]))
    assert len(kept) == 1 and not dropped


def test_no_account_identity_is_a_noop() -> None:
    kept, dropped = guard_search_hits([_hit("Boulangerie Ange")], AccountIdentity(names=[]))
    assert len(kept) == 1 and not dropped


def test_leading_generic_word_does_not_change_the_entity() -> None:
    assert name_matches_account("Unéo", ["MUTUELLE UNEO"])
    assert name_matches_account("Groupe Boulanger", ["Boulanger"])
    assert not name_matches_account("Groupe Boulangerie Ange", ["Boulanger"])
