"""#4733 — un poste de direction n'est pas un métier d'ESN, c'est une porte d'entrée : il ne sort jamais du filtre métier
(recette 29/10 : « Directeur des Opérations H/F » badgé « hors de ton métier » et replié). Ces tests savent dire NON."""

import pytest

from app.services.discover_hiring_scope import hiring_scope_verdict
from app.services.hierarchy_level import is_executive_recruitment_title

_ESN_IT = {"placedRoles": ["Développeur Java"], "inferredPlacedRoles": False}


@pytest.mark.parametrize("label", ["Directeur des Opérations H/F", "CFO", "Directrice Financière", "Head of Finance"])
def test_un_dirigeant_reste_dans_le_metier(label: str) -> None:
    assert hiring_scope_verdict(label, _ESN_IT) == {"keep": True}


@pytest.mark.parametrize(
    "label", ["Assistant du directeur des opérations", "Technicien de maintenance - Électricien (CFO)"]
)
def test_sait_dire_non_ni_un_assistant_ni_un_cfo_courants_faibles_ne_sont_des_dirigeants(label: str) -> None:
    assert not is_executive_recruitment_title(label)


def test_sait_dire_non_un_developpeur_hors_profil_sort_toujours() -> None:
    assert hiring_scope_verdict("Électricien industriel", _ESN_IT) == {"keep": False, "reason": "off_trade"}
