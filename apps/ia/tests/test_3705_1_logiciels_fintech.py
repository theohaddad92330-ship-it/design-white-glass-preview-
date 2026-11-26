"""#3705.1 — recette prod R4b (73cd6104b3) : Découvrir « logiciels fintech »

ramenait 9 noms sur 10 qui contenaient simplement « LOGICIELS » dans leur
raison sociale. Cause établie (reproduite ci-dessous) : « fintech » est bien
reconnu comme secteur (`application_sectors.py`), mais « logiciels » n'est le
mot d'AUCUN libellé de secteur — `_sectors_for_word` compare un mot à l'écran
« Éditeurs & tech » (`software_tech`), qui ne contient ni « logiciel » ni
« logiciels ». Le mot non reconnu partait alors en texte libre (`leftover` →
`DiscoverFilters.freetext` → `q` du registre), qui compare au NOM de
l'entreprise, pas à son activité — d'où l'appariement sur la raison sociale
que l'issue décrit.
"""

from __future__ import annotations

from app.services.application_sector_naf import naf_codes_for_sectors
from app.services.discover_request_reading import _sectors_for_word, read_request


class TestLogicielsEstUneActivite:
    def test_logiciels_seul_pointe_vers_le_secteur_editeurs_tech(self) -> None:
        assert "software_tech" in _sectors_for_word("logiciels")
        assert "software_tech" in _sectors_for_word("logiciel")

    def test_logiciels_fintech_lit_les_deux_secteurs_jamais_un_nom(self) -> None:
        reading = read_request("logiciels fintech")
        assert set(reading.activities) == {"fintech", "software_tech"}
        expected_codes = set(naf_codes_for_sectors(["fintech", "software_tech"]))
        assert set(reading.naf_codes) == expected_codes
        # #3705.1 — plus aucun mot envoyé en texte libre (raison sociale) :
        # « logiciels » était le motif exact de l'appariement sur le nom.
        assert reading.leftover == ()
