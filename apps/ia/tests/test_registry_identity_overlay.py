"""Dédup internationale des comptes canoniques — ``_registry_identity_overlay``.

The overlay re-exposes the country pack's resolved registry identity (CIK US /
corp id CA / UID CH / BCE BE) on the research result so the API can persist
``registry_id`` / ``registry_country`` on the account and dedup the workspace's
canonical account on them — the non-FR twin of the SIREN lift.

Hard invariant verified here: the FR default (no pack ⇒ ``_cp is None``) and
every unresolved shape yield ``{}`` — **no key is ever added**, the FR payload
stays byte-identical. No identifier is ever invented.
"""

from __future__ import annotations

from app.routers.phase1_research import _registry_identity_overlay
from app.services.country_packs.base import empty_signals


def test_fr_default_none_signals_is_empty() -> None:
    """FR (pack None ⇒ no signals awaited) adds NOTHING to the result."""
    assert _registry_identity_overlay(None) == {}


def test_unresolved_registry_is_empty() -> None:
    """A pack that ran but resolved no identity (empty_signals) adds nothing."""
    assert _registry_identity_overlay(empty_signals("US")) == {}


def test_non_dict_shapes_are_empty() -> None:
    assert _registry_identity_overlay("oops") == {}
    assert _registry_identity_overlay({"registry": "not-a-dict"}) == {}
    assert _registry_identity_overlay([]) == {}


def test_registry_without_id_or_country_is_empty() -> None:
    # Never surface a half identity — the API could not dedup on it.
    assert _registry_identity_overlay({"registry": {"country": "US", "name": "EPAM"}}) == {}
    assert _registry_identity_overlay({"registry": {"registryId": "0001352010", "name": "EPAM"}}) == {}
    assert _registry_identity_overlay({"registry": {"registryId": "  ", "country": "US"}}) == {}


def test_us_cik_is_exposed_flat_plus_full_entity() -> None:
    registry = {
        "source": "sec_edgar",
        "country": "US",
        "name": "EPAM Systems Inc",
        "registryId": "0001352010",
        "registryIdLabel": "CIK",
        "detailUrl": "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001352010",
    }
    signals = {**empty_signals("US"), "registry": registry}
    overlay = _registry_identity_overlay(signals)
    assert overlay == {
        "registryId": "0001352010",
        "registryCountry": "US",
        "countryRegistry": registry,
    }


def test_ch_uid_country_is_uppercased_and_id_kept_verbatim() -> None:
    """The pack's display form rides the wire untouched — the API canonicalises
    it at persist time (registry-id.util.ts), keeping one normaliser per side."""
    signals = {
        **empty_signals("CH"),
        "registry": {"country": "ch", "registryId": "CHE-105.944.452", "name": "Nestlé SA"},
    }
    overlay = _registry_identity_overlay(signals)
    assert overlay["registryCountry"] == "CH"
    assert overlay["registryId"] == "CHE-105.944.452"


def test_overlay_only_ever_adds_the_three_documented_keys() -> None:
    signals = {
        **empty_signals("BE"),
        "registry": {"country": "BE", "registryId": "0202.239.951"},
    }
    assert set(_registry_identity_overlay(signals)) == {
        "registryId",
        "registryCountry",
        "countryRegistry",
    }
