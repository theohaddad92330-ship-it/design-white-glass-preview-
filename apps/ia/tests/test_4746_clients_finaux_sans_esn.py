"""#4746 — « clients finaux uniquement » retire ce que l'entreprise EST, pas seulement son NAF.

Vu en démonstration le 28/10 : le filtre ne regardait que le NAF RÉSOLU, et gardait tout NAF inconnu
des deux côtés. Or une offre ne rend jamais de NAF : une ESN dont l'employeur n'a pas été résolu au
registre, ou une plateforme de freelance (aucun NAF unique), passait pour un client final.
`entityType="esn"` et `"all"` ne bougent pas : la route de rang 2 reste une capacité voulue (#4285.3).
"""

from __future__ import annotations

import pytest

from app.services.actor_typology import ActorType, classify_actor_type, matches_end_client
from app.services.intermediation import looks_like_platform
from tests.test_discover_signals_router import _post, _resolution, _row, registry, resolver, sources  # noqa: F401


@pytest.mark.parametrize(
    "actor",
    [
        ActorType.ESN,
        ActorType.ESN_CONCURRENTE,
        ActorType.PLATEFORME_INTERMEDIATION,
        ActorType.CABINET_RECRUTEMENT,
        ActorType.FREELANCE_INDEPENDANT,
        ActorType.SOUS_TRAITANT_ESN,
        ActorType.PARTENAIRE,
        # #4814 — arbitrage Louis 31/10 « les quatre » : intérim, VMS, MSP, apporteurs d'affaires.
        ActorType.ENTREPRISE_INTERIM,
        ActorType.VMS,
        ActorType.MSP,
        ActorType.COURTIER_OU_APPORTEUR_AFFAIRES,
    ],
)
def test_an_esn_or_intermediary_is_not_an_end_client(actor) -> None:
    assert matches_end_client(actor, is_known_esn=False) is False


def test_a_known_esn_name_beats_an_unresolved_naf() -> None:
    assert matches_end_client(ActorType.NON_CLASSE, is_known_esn=True) is False


def test_what_is_unknown_or_ambiguous_stays_an_end_client() -> None:
    # « Non établi » n'est jamais « ESN » : on ne retire pas sur un doute (GA-18/19).
    assert matches_end_client(ActorType.NON_CLASSE, is_known_esn=False) is True
    assert matches_end_client(ActorType.AMBIGU_CONSEIL_OU_ESN, is_known_esn=False) is True
    assert matches_end_client(ActorType.CLIENT_FINAL, is_known_esn=False) is True


@pytest.mark.parametrize("name", ["FreeWork", "Free-Work", "FREE WORK France", "Freework"])
def test_freework_is_a_freelance_platform(name) -> None:
    assert looks_like_platform(name) is True


def test_client_reading_drops_an_esn_whose_employer_was_not_resolved(client, sources, resolver) -> None:
    sources["hiring"] = [
        _row("Sopra Steria Group", "hiring", 1),
        _row("FreeWork", "hiring", 2),
        _row("USINE SA", "hiring", 3),
    ]
    # Le registre rend le NAF d'un SIÈGE (holding 64.20Z) pour le groupe, et 63.12Z pour la plateforme :
    # aucun des deux n'est un NAF d'ESN, donc le NAF seul les classait « client final ».
    resolver["Sopra Steria Group"] = _resolution("552100554", "Sopra Steria Group", naf="6420Z")
    resolver["FreeWork"] = _resolution("552100556", "FreeWork", naf="6312Z")
    resolver["USINE SA"] = _resolution("552100555", "USINE SA", naf="2313Z")

    data = _post(client, entityType="client").json()
    assert [c["name"] for c in data["candidates"]] == ["USINE SA"]
    assert data["coverage"]["filteredByEntityType"] == 2


def test_the_other_readings_keep_the_rank_two_routes(client, sources, resolver) -> None:
    sources["hiring"] = [_row("Sopra Steria Group", "hiring", 1), _row("USINE SA", "hiring", 3)]
    resolver["Sopra Steria Group"] = _resolution("552100554", "Sopra Steria Group", naf="6420Z")
    resolver["USINE SA"] = _resolution("552100555", "USINE SA", naf="2313Z")

    assert "Sopra Steria Group" in [c["name"] for c in _post(client, entityType="all").json()["candidates"]]
    assert "Sopra Steria Group" in [c["name"] for c in _post(client, entityType="esn").json()["candidates"]]


# ── #4814 — les quatre familles, prouvées par le NAF ou par le nom (jamais devinées) ──
@pytest.mark.parametrize(
    ("name", "naf", "expected"),
    [
        ("Synergie", None, ActorType.ENTREPRISE_INTERIM),
        ("Groupe Dupont Emploi", "7820Z", ActorType.ENTREPRISE_INTERIM),
        ("SAP Fieldglass", "6201Z", ActorType.VMS),
        ("Pixid", None, ActorType.VMS),
        ("Pontoon Solutions France", None, ActorType.MSP),
        ("Dupont Apporteur d'Affaires SAS", None, ActorType.COURTIER_OU_APPORTEUR_AFFAIRES),
    ],
)
def test_the_four_families_are_classified_and_dropped(name, naf, expected) -> None:
    actor = classify_actor_type(naf=naf, name=name)
    assert actor is expected
    assert matches_end_client(actor, is_known_esn=False) is False


@pytest.mark.parametrize(
    ("name", "naf"),
    [("USINE SA", "2313Z"), ("Beelines Boulangerie", "1071C"), ("Intérimaire Logistique Nord", "5229A"), ("Banque du Nord", None)],
)
def test_a_real_end_client_is_not_dropped(name, naf) -> None:
    actor = classify_actor_type(naf=naf, name=name)
    assert matches_end_client(actor, is_known_esn=False) is True


def test_client_reading_drops_the_four_families_and_keeps_the_real_client(client, sources, resolver) -> None:
    # L'intérim est déjà écarté en amont (S.14, `is_temp_agency`) : couvert par le test de classification.
    names = ["SAP Fieldglass", "Pontoon Solutions France", "Dupont Apporteur d'Affaires SAS", "USINE SA"]
    sources["hiring"] = [_row(n, "hiring", i + 1) for i, n in enumerate(names)]
    for i, n in enumerate(names):
        resolver[n] = _resolution(f"55210055{i}", n, naf="2313Z")

    data = _post(client, entityType="client").json()
    assert [c["name"] for c in data["candidates"]] == ["USINE SA"]
    assert data["coverage"]["filteredByEntityType"] == 3


def test_the_four_families_carry_the_intermediary_flag_the_screen_filters_on(client, sources, resolver) -> None:
    """#4814 — le mode registre filtre côté écran sur `isIntermediary` : la même nature, le même drapeau (GA-26)."""
    sources["hiring"] = [_row("SAP Fieldglass", "hiring", 1), _row("USINE SA", "hiring", 2)]
    resolver["SAP Fieldglass"] = _resolution("552100550", "SAP Fieldglass", naf="2313Z")
    resolver["USINE SA"] = _resolution("552100551", "USINE SA", naf="2313Z")

    by_name = {c["name"]: c["isIntermediary"] for c in _post(client, entityType="all").json()["candidates"]}
    assert by_name == {"SAP Fieldglass": True, "USINE SA": False}
