"""#2319.24 — « j'ai rendez-vous dans trente minutes » : Laura prépare le brief
par l'outil EXISTANT de la journée, sans aucune écriture."""

from __future__ import annotations

from app.services.chat_tools import DAY_BRIEF_TOOL, WRITE_TOOL_NAMES


def test_l_outil_de_la_journee_reconnait_le_rendez_vous_imminent():
    description = DAY_BRIEF_TOOL["description"]
    assert "dans trente minutes" in description
    # Le jour d'un rendez-vous imminent est AUJOURD'HUI — le défaut de l'outil
    # (« demain ») ferait préparer la mauvaise journée.
    assert "passe le jour d'AUJOURD'HUI" in description


def test_le_chemin_est_une_lecture_et_rien_d_autre():
    assert DAY_BRIEF_TOOL["name"] == "prepare_day_brief"
    assert "prepare_day_brief" not in WRITE_TOOL_NAMES
    # La garde sait dire NON : le registre des écritures n'est pas vide.
    assert len(WRITE_TOOL_NAMES) > 0
