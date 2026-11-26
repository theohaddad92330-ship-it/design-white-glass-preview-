"""Le tri des marchés publics suit le domaine que le vendeur VEND.

Addendum Stelya §11 : l'appel d'offres est le signal le PLUS fort du retour bêta
(« preuve d'achat et document explicite »). Il était filtré sur les divisions CPV
48/72 en dur — une société de conseil en ingénierie ne voyait aucun des marchés
qu'elle sait gagner.
"""

from __future__ import annotations

import pytest

from app.services.data_sources.decp import _is_it as decp_is_it
from app.services.data_sources.public_tenders import _is_it as boamp_is_it
from app.services.domain_market_filters import market_filter_for

MATCHERS = [pytest.param(decp_is_it, id="decp"), pytest.param(boamp_is_it, id="boamp")]


@pytest.mark.parametrize("pack", [None, "", "esn_it", "pack-inconnu"])
def test_no_filter_means_the_historical_it_sort(pack: str | None) -> None:
    assert market_filter_for(pack) is None


@pytest.mark.parametrize("matcher", MATCHERS)
@pytest.mark.parametrize("pack", [None, "esn_it"])
def test_it_sort_is_unchanged(matcher, pack: str | None) -> None:
    """La non-régression : le tri d'un vendeur IT est celui d'avant."""
    assert matcher({"objet": "Infogérance du SI"}, ["72500000"], pack=pack) is True
    assert matcher({"objet": "Maîtrise d'œuvre ligne de production"}, ["71300000"], pack=pack) is False


@pytest.mark.parametrize("matcher", MATCHERS)
def test_industrial_pack_sees_the_engineering_markets(matcher) -> None:
    for objet, cpv in (
        ("Maîtrise d'œuvre pour la modernisation d'une ligne", "71300000"),
        ("Assistance technique en bureau d'études mécanique", "71340000"),
        ("Maintenance industrielle des équipements de production", "50500000"),
        ("Fourniture et mise en service de machines", "42990000"),
        ("Étude de R&D sur un procédé", "73100000"),
    ):
        assert matcher({"objet": objet}, [cpv], pack="industrial_engineering") is True, objet


@pytest.mark.parametrize("matcher", MATCHERS)
def test_industrial_pack_does_not_swallow_it_markets(matcher) -> None:
    """Un marché de services informatiques n'est pas le marché d'un bureau
    d'études ; le compter gonflerait son signal."""
    assert matcher({"objet": "Développement d'une application métier"}, ["72200000"], pack="industrial_engineering") is False


@pytest.mark.parametrize("matcher", MATCHERS)
def test_construction_works_are_deliberately_excluded(matcher) -> None:
    """CPV 45 est la division la plus volumineuse de la commande publique. Un
    marché de travaux n'est pas une prestation d'ingénierie : l'inclure noierait
    les quelques marchés adressables sous des centaines de chantiers."""
    assert matcher({"objet": "Travaux de réfection de voirie"}, ["45233120"], pack="industrial_engineering") is False


@pytest.mark.parametrize("matcher", MATCHERS)
def test_the_objet_rescues_a_market_whose_cpv_is_a_facade(matcher) -> None:
    """Beaucoup d'avis portent un CPV générique : l'objet doit pouvoir rattraper."""
    assert matcher({"objet": "Prestations d'ingénierie et d'essais"}, ["79000000"], pack="industrial_engineering") is True
