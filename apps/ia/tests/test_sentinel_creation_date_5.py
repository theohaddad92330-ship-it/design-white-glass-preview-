"""#5 (recette 23/10) — « Immatriculation 1 janv. 1900 » : une date sentinelle de registre n'est pas une date."""

from app.services.company_filters import plausible_creation_date
from app.services.pappers.models import CompanyProfile


def test_a_sentinel_or_unreadable_date_is_absent() -> None:
    for sentinel in ("1900-01-01", "1900-01-01T00:00:00Z", "01/01/1900", "1901-06-01", "0001-01-01", "", None, "n/a"):
        assert plausible_creation_date(sentinel) is None


def test_a_real_date_is_kept_verbatim() -> None:
    assert plausible_creation_date("1982-09-17") == "1982-09-17"
    assert plausible_creation_date(" 2023-03-01 ") == "2023-03-01"
    assert plausible_creation_date("1902-01-01") == "1902-01-01"


def test_the_pappers_profile_drops_a_sentinel_creation_date() -> None:
    assert CompanyProfile(siren="123456789", date_creation="1900-01-01").creation_date is None
    assert CompanyProfile(siren="123456789", date_creation="1982-09-17").creation_date == "1982-09-17"
