"""#2920 (#2266.7/.8) — jours fériés utiles + période du workspace.

Trois preuves : sait dire NON (un jour férié hors fenêtre, ou une date de
création d'espace illisible, disparaît du bloc), lit vraiment (les onze jours
fériés français 2026, Pâques compris, comparés à des dates connues), et
n'attrape pas ce qu'elle ne vise pas (aucune donnée ⇒ chaîne vide, byte pour
byte — même discipline que `current_time.py`).

⚠️ Aucun nom de mois venu de la locale (mêmes tables que `current_time.py`,
réutilisées, jamais dupliquées — GA-26).
"""

from __future__ import annotations

from datetime import date, datetime

from app.prompts.temporal_grounding import (
    french_public_holidays,
    next_useful_holiday,
    temporal_grounding_block,
)


def test_onze_jours_feries_francais_2026_paques_compris() -> None:
    holidays = french_public_holidays(2026)
    assert len(holidays) == 11
    by_label = {label: d for d, label, _ in holidays}
    # Pâques 2026 tombe le 5 avril (dimanche) — vérifié contre une source
    # externe (calendrier officiel). Lundi de Pâques = 6 avril.
    assert by_label["Lundi de Pâques"] == date(2026, 4, 6)
    assert by_label["Ascension"] == date(2026, 5, 14)
    assert by_label["Lundi de Pentecôte"] == date(2026, 5, 25)
    assert by_label["Jour de l'an"] == date(2026, 1, 1)
    assert by_label["Noël"] == date(2026, 12, 25)


def test_les_jours_feries_sont_tries_par_date() -> None:
    holidays = french_public_holidays(2026)
    dates = [d for d, _, _ in holidays]
    assert dates == sorted(dates)


def test_next_useful_holiday_dans_la_fenetre() -> None:
    # 26/09/2026 → le prochain férié est la Toussaint (01/11/2026, 36 jours).
    moment = datetime(2026, 9, 26, 10, 0)
    holiday = next_useful_holiday(moment)
    assert holiday is not None
    assert holiday[1] == "Toussaint"
    assert holiday[0] == date(2026, 11, 1)


def test_next_useful_holiday_dit_non_hors_fenetre() -> None:
    # Le 20/11, le prochain férié (Noël, 25/12) est à 35 jours : dans la
    # fenêtre par défaut (45j). Mais depuis le 1er décembre, Noël tombe à 24
    # jours — toujours dedans. On teste explicitement le cas HORS fenêtre avec
    # une fenêtre réduite.
    moment = datetime(2026, 9, 26, 10, 0)
    assert next_useful_holiday(moment, window_days=10) is None


def test_next_useful_holiday_traverse_lannee() -> None:
    # 26/12/2026 (lendemain de Noël) → le prochain férié est le Jour de l'an
    # 2027, un férié de l'année SUIVANTE — jamais un 2026 déjà passé.
    moment = datetime(2026, 12, 26, 10, 0)
    holiday = next_useful_holiday(moment)
    assert holiday is not None
    assert holiday[1] == "Jour de l'an"
    assert holiday[0] == date(2027, 1, 1)


def test_temporal_grounding_block_vide_sans_rien_a_dire() -> None:
    # Fenêtre volontairement minuscule pour neutraliser le jour férié, aucune
    # date de création d'espace : le bloc ne dit RIEN — jamais un titre vide.
    moment = datetime(2026, 9, 26, 10, 0)
    assert temporal_grounding_block(moment) != ""  # le jour férié seul suffit à remplir le bloc ici
    # Cas réellement vide : aucun jour férié dans une fenêtre nulle simulée
    # en repoussant le moment juste après un jour férié, sans espace connu.
    day_after_new_year = datetime(2026, 1, 2, 10, 0)
    from app.prompts import temporal_grounding as module

    original_window = module._USEFUL_HOLIDAY_WINDOW_DAYS
    module._USEFUL_HOLIDAY_WINDOW_DAYS = 1
    try:
        assert temporal_grounding_block(day_after_new_year) == ""
    finally:
        module._USEFUL_HOLIDAY_WINDOW_DAYS = original_window


def test_temporal_grounding_block_nomme_le_ferie_et_la_periode() -> None:
    moment = datetime(2026, 9, 26, 10, 0)
    block = temporal_grounding_block(moment, workspace_created_at="2026-01-15T00:00:00Z", language="fr")
    assert "Toussaint" in block
    assert "1 novembre 2026" in block
    assert "15 janvier 2026" in block
    assert "PÉRIODE ET JOURS FÉRIÉS" in block


def test_temporal_grounding_block_en_anglais_jamais_de_francais() -> None:
    moment = datetime(2026, 9, 26, 10, 0)
    block = temporal_grounding_block(moment, workspace_created_at="2026-01-15T00:00:00Z", language="en")
    assert "All Saints" in block
    assert "PERIOD AND PUBLIC HOLIDAYS" in block
    assert "PÉRIODE" not in block


def test_temporal_grounding_block_ignore_une_date_de_creation_illisible() -> None:
    moment = datetime(2026, 12, 20, 10, 0)  # aucun férié utile avant le 1er janvier à 12 jours, dans la fenêtre
    block = temporal_grounding_block(moment, workspace_created_at="pas-une-date", language="fr")
    assert "utilise Bellum depuis" not in block


def test_temporal_grounding_block_workspace_seul_sans_ferie_proche() -> None:
    # Le lendemain d'un jour férié tout juste passé, hors fenêtre du suivant :
    # seule la période de l'espace doit apparaître.
    moment = datetime(2026, 1, 2, 10, 0)
    block = temporal_grounding_block(moment, workspace_created_at="2025-06-01T00:00:00Z", language="fr")
    assert "utilise Bellum depuis le 1 juin 2025" in block


def test_temporal_grounding_block_nomme_la_derniere_collecte_connue() -> None:
    # #2266.10 — indépendant de #2266.8 : peut apparaître seul, ou avec.
    moment = datetime(2026, 1, 2, 10, 0)
    block = temporal_grounding_block(moment, workspace_last_sync_at="2025-12-20T00:00:00Z", language="fr")
    assert "Dernière collecte de données réussie connue" in block
    assert "20 décembre 2025" in block
    assert "utilise Bellum depuis" not in block


def test_temporal_grounding_block_derniere_collecte_en_anglais() -> None:
    moment = datetime(2026, 1, 2, 10, 0)
    block = temporal_grounding_block(moment, workspace_last_sync_at="2025-12-20T00:00:00Z", language="en")
    assert "Last known successful data sync" in block
    assert "PERIOD AND PUBLIC HOLIDAYS" in block
    assert "Dernière" not in block


def test_temporal_grounding_block_ignore_une_derniere_collecte_illisible() -> None:
    moment = datetime(2026, 1, 2, 10, 0)
    block = temporal_grounding_block(moment, workspace_last_sync_at="pas-une-date", language="fr")
    assert block == ""


def test_temporal_grounding_block_periode_et_derniere_collecte_ensemble() -> None:
    # Les deux faits sont INDÉPENDANTS et cumulables sur un même tour.
    moment = datetime(2026, 1, 2, 10, 0)
    block = temporal_grounding_block(
        moment,
        workspace_created_at="2025-06-01T00:00:00Z",
        workspace_last_sync_at="2025-12-20T00:00:00Z",
        language="fr",
    )
    assert "utilise Bellum depuis le 1 juin 2025" in block
    assert "Dernière collecte de données réussie connue" in block
    assert "20 décembre 2025" in block
