"""#3921 — ouverture d'établissement détectée entre deux relevés Sirene.

`etablissements_by_siren` (INSEE, déjà testé) rend l'état COURANT d'un SIREN ;
rien ne compare deux relevés dans le temps. `new_establishments` est la
primitive pure qui fait ce diff — testée ici sur un SIREN fixe, sans appel
réseau (elle ne prend que des `InseeEtablissement` déjà résolus).
"""

from app.services.insee_sirene import InseeEtablissement
from app.services.signals.establishment_openings import new_establishments

# SIREN fixe, choisi arbitrairement pour que le test soit reproductible — la
# fonction ne regarde jamais ce SIREN, il n'identifie que le scénario.
_FIXED_SIREN = "403355726"


def _etab(siret: str, *, city: str = "LYON", active: bool = True, started: str | None = None) -> InseeEtablissement:
    return InseeEtablissement(
        siret=siret,
        city=city,
        postal_code="69000",
        is_headquarters=False,
        headcount_range="12",
        is_active=active,
        closure_date=None if active else (started or "2026-01-01"),
        period_start_date=started,
    )


def test_new_establishment_between_two_snapshots_has_a_date() -> None:
    previous = [_etab(f"{_FIXED_SIREN}00010", started="2020-01-01")]
    current = [
        _etab(f"{_FIXED_SIREN}00010", started="2020-01-01"),
        _etab(f"{_FIXED_SIREN}00028", city="GRENOBLE", started="2026-09-15"),
    ]
    out = new_establishments(previous, current)
    assert len(out) == 1
    assert out[0]["siret"] == f"{_FIXED_SIREN}00028"
    assert out[0]["date"] == "2026-09-15"
    assert out[0]["type"] == "nouvel établissement"
    assert "GRENOBLE" in out[0]["label"]


def test_no_previous_snapshot_yields_nothing_rather_than_everything() -> None:
    """Sans relevé antérieur, rien n'est comparable — ce n'est pas « tout est
    nouveau ». Un appelant qui n'a pas encore de second relevé ne doit pas lire
    la liste entière comme des ouvertures du jour."""
    current = [_etab(f"{_FIXED_SIREN}00010", started="2020-01-01")]
    assert new_establishments([], current) == []


def test_closed_establishment_is_never_an_opening() -> None:
    previous = [_etab(f"{_FIXED_SIREN}00010", started="2020-01-01")]
    current = [
        _etab(f"{_FIXED_SIREN}00010", started="2020-01-01"),
        _etab(f"{_FIXED_SIREN}00036", active=False, started="2026-09-15"),
    ]
    assert new_establishments(previous, current) == []


def test_establishment_without_a_registry_date_is_dropped_not_guessed() -> None:
    """Un signal sans date n'est pas un signal — jamais la date du jour."""
    previous = [_etab(f"{_FIXED_SIREN}00010", started="2020-01-01")]
    current = [
        _etab(f"{_FIXED_SIREN}00010", started="2020-01-01"),
        _etab(f"{_FIXED_SIREN}00044", started=None),
    ]
    assert new_establishments(previous, current) == []


def test_already_known_establishment_does_not_retrigger() -> None:
    previous = [_etab(f"{_FIXED_SIREN}00010", started="2020-01-01")]
    current = [_etab(f"{_FIXED_SIREN}00010", started="2020-01-01")]
    assert new_establishments(previous, current) == []
