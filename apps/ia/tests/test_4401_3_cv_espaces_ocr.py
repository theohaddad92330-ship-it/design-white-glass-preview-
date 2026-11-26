"""#4401.3 — le texte rendu par l'OCR garde ses coordonnées : espaces insécables et indicatif entre parenthèses.

Mesuré sur des CV FICTIFS : un téléphone écrit « 06 12 34 56 78 » avec des espaces INSÉCABLES (U+00A0 /
U+202F, ce que rendent l'OCR et les PDF mis en page) n'était pas reconnu, et « (+33)612345678 » sortait
tronqué (« +33)612345678 »). Rien n'est deviné : la valeur lue reste celle du document, seuls les espaces
sont ramenés à l'espace simple.
"""

from __future__ import annotations

import pytest

from app.routers.cv import _complete_identity
from app.services import cv_identity


@pytest.mark.parametrize("space", [" ", " ", " "])
def test_telephone_aux_espaces_insecables_est_lu(space: str) -> None:
    text = f"Julie MARTIN\n06{space}12{space}34{space}56{space}78\njulie.martin@example.com"
    assert cv_identity.read_contact_facts(text)["phone"] == "06 12 34 56 78"


def test_indicatif_entre_parentheses_n_est_pas_tronque() -> None:
    text = "Julie Martin\n(+33)612345678\njulie@example.com"
    assert cv_identity.read_contact_facts(text)["phone"] == "(+33)612345678"


def test_cv_simple_aux_espaces_insecables_pose_nom_email_telephone() -> None:
    text = "# Julie MARTIN\n\nConsultante cybersécurité\n\njulie.martin@example.com · 06 12 34 56 78\n"
    fields = [{"detection": "identity", "value": None, "confidence": 0.0}]
    completed, gaps = _complete_identity(fields, text)
    value = completed[0]["value"]
    joined = " ".join(value) if isinstance(value, list) else str(value)
    assert "Julie MARTIN" in joined
    assert "julie.martin@example.com" in joined
    assert "06 12 34 56 78" in joined
    assert gaps == []


def test_telephone_absent_reste_inconnu() -> None:
    assert cv_identity.read_contact_facts("Julie MARTIN\njulie@example.com")["phone"] is None
