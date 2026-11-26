"""#4814.1 (recette prod 01/11, PARTIAL) — « Clients finaux » doit retirer les cabinets et ESN.

KLANIK (cabinet IT, NAF 71.12B « Architecture et ingénierie ») restait dans les cartes clients : le NAF ne le
désigne pas, et le référentiel de noms lu côté IA ne portait que les 15 fiches concurrents — pas les 477 ESN
connues du produit. On corrige la FAMILLE (le référentiel entier, et la nature d'intermédiaire : intérim, VMS,
MSP, apporteur d'affaires), jamais un nom seul — et un client final reste un client final.
"""

from __future__ import annotations

import pytest

from app.services.company_archetype import is_known_esn_name
from app.services.discover_skill_offers import intermediary_kind


@pytest.mark.parametrize("name", ["KLANIK", "Klanik", "Talan", "SII SUD OUEST", "Sogeti", "Expleo"])
def test_the_whole_esn_referential_is_known_to_the_ia_not_only_the_battlecards(name: str) -> None:
    assert is_known_esn_name(name) is True


def test_klanik_with_an_engineering_naf_is_set_aside_as_an_esn() -> None:
    # Le NAF 71.12B ne dit rien d'une ESN : c'est le NOM du référentiel qui tranche.
    assert intermediary_kind("KLANIK", "71.12B") == "esn"


@pytest.mark.parametrize("name", ["MANPOWER FRANCE", "Fieldglass", "SourceRight", "Randstad France"])
def test_interim_vms_msp_are_set_aside_in_the_skill_search_too(name: str) -> None:
    assert intermediary_kind(name, "70.22Z") == "recruiter"


@pytest.mark.parametrize("name", ["CARREFOUR HYPERMARCHES", "Décathlon", "Michelin"])
def test_a_real_end_client_is_never_set_aside(name: str) -> None:
    assert intermediary_kind(name, "47.11F") is None
    assert is_known_esn_name(name) is False
