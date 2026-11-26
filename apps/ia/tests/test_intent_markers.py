"""#2257.12/.13/.14 — HORIZON, URGENCE, NIVEAU DE DÉTAIL du compilateur
d'intention (LAU-FINAL-002, reste du 25/09).

Même doctrine que le routeur d'intention (#2321, `intent_router.py`) : des
marqueurs DÉCLARÉS (FR et EN), aucun appel de modèle, et surtout — l'absence de
marqueur ne rend JAMAIS une valeur par défaut. « Non mesuré n'est jamais 0 » :
un message sans marqueur d'urgence n'est pas `"normal"`, il est `None`.
"""

from __future__ import annotations

import pytest

from app.services.compilers.intent_markers import (
    detail_level_from_message,
    horizon_from_message,
    urgency_from_message,
)


@pytest.mark.parametrize(
    "message,attendu",
    [
        ("Trouve-moi du business, j'ai 3 devs de libre demain", "immediat"),
        ("I need this today, not tomorrow", "immediat"),
        ("Il me faut ça cette semaine", "cette_semaine"),
        ("Can you do this by Friday, this week?", "cette_semaine"),
        ("On regarde ça ce mois-ci", "ce_mois"),
        ("Let's plan this for this month", "ce_mois"),
        ("On vise ce trimestre pour ouvrir le compte", "ce_trimestre"),
        ("This is a plan for this quarter", "ce_trimestre"),
    ],
)
def test_horizon_est_lu_sur_des_marqueurs_declares(message: str, attendu: str) -> None:
    assert horizon_from_message(message) == attendu


def test_horizon_sait_dire_non_aucun_marqueur_ne_devine_rien() -> None:
    assert horizon_from_message("Trouve-moi 15 filiales industrielles françaises avec des sujets IAM") is None


@pytest.mark.parametrize(
    "message",
    [
        "C'est urgent, j'ai besoin de ça vite",
        "Il faut faire ça au plus vite",
        "Réponds-moi dès que possible",
        "This is urgent, please reply ASAP",
        "I need this as soon as possible",
    ],
)
def test_urgence_est_lue_sur_des_marqueurs_declares(message: str) -> None:
    assert urgency_from_message(message) == "urgent"


def test_urgence_sait_dire_non_labsence_de_marqueur_nest_jamais_normal() -> None:
    # Doctrine : l'absence n'est jamais 0/normal — elle est None.
    assert urgency_from_message("Trouve-moi 15 filiales industrielles françaises") is None


@pytest.mark.parametrize(
    "message,attendu",
    [
        ("Fais-moi ça en bref, pas besoin de détail", "bref"),
        ("Donne-moi juste un résumé", "bref"),
        ("Just a quick summary, please", "bref"),
        ("Je veux un rapport complet et détaillé", "detaille"),
        ("Explique-moi ça de manière détaillée", "detaille"),
        ("I want this explained in depth", "detaille"),
    ],
)
def test_niveau_de_detail_est_lu_sur_des_marqueurs_declares(message: str, attendu: str) -> None:
    assert detail_level_from_message(message) == attendu


def test_niveau_de_detail_sait_dire_non_aucun_marqueur_ne_devine_rien() -> None:
    assert detail_level_from_message("Trouve-moi 15 filiales industrielles françaises") is None


def test_les_marqueurs_ne_confondent_pas_candidature_et_candidat() -> None:
    # Même garde-fou que le routeur (#2321, frontière de mot) : un mot plus
    # long ne doit pas déclencher un marqueur plus court par sous-chaîne.
    assert horizon_from_message("La candidature est arrivée hier") is None
