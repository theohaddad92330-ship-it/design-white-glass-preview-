"""#2920 (#2266.11/.12/.14/.16-.20) — les règles de lecture temporelle ajoutées
à `current_time.py` (`_READING_RULES`/`_READING_RULES_EN`), rendues par
`current_time_block` à chaque tour.

Substring assertions, comme `test_current_time_user_timezone.py` (même
fichier producteur) : ces règles sont des INSTRUCTIONS au modèle, pas un
calcul — le test lit le texte RÉELLEMENT rendu par le code de production,
jamais une copie du texte attendu.
"""

from __future__ import annotations

from datetime import datetime

from app.prompts.current_time import current_time_block

_INSTANT = datetime(2026, 9, 15, 9, 30)


def test_2266_11_12_corrige_sans_interrompre_et_ne_repete_pas_lerreur() -> None:
    block = current_time_block(now=_INSTANT)
    assert "corrige-la SANS interrompre" in block
    assert "Ne reproduis JAMAIS son erreur" in block


def test_2266_14_confirme_date_heure_et_fuseau_en_cas_dambiguite() -> None:
    block = current_time_block(now=_INSTANT)
    assert "confirme EXPLICITEMENT date, heure ET fuseau" in block


def test_2266_16_a_20_distingue_les_cinq_dates() -> None:
    block = current_time_block(now=_INSTANT)
    for word in ("FAIT rapporté", "COLLECTE", "VÉRIFICATION", "ANALYSE", "ACTION PRÉVUE"):
        assert word in block, f"{word!r} absent du bloc temporel"


def test_regles_anglaises_miroir_exact() -> None:
    block = current_time_block(now=_INSTANT, language="en")
    assert "correct them WITHOUT stopping" in block
    assert "NEVER repeat their mistake" in block
    assert "EXPLICITLY confirm date, time AND timezone" in block
    for word in ("reported FACT", "COLLECTION", "VERIFICATION", "ANALYSIS", "PLANNED ACTION"):
        assert word in block, f"{word!r} absent from the English block"
    # Jamais un mot français glissé dans le bloc anglais.
    assert "JAMAIS" not in block
