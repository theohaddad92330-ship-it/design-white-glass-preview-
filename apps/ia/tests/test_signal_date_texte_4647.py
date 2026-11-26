"""#4647 — une date en toutes lettres n'est plus lue « 1er janvier ».

``_DATE_RE`` ne lisait mois et jour que collés à l'année par ``-`` ou ``/`` :
« 23 octobre 2026 » rendait l'année seule, remplacée par le 1er janvier — et tout
signal de recrutement de l'année basculait en archive le 30 juin.

Tranché par Louis (27/10) : année seule → 31 décembre + précision ``année`` ;
mois + année → dernier jour du mois + précision ``mois``. Jamais le 1er janvier.

Gardes nommées : garde 0e4d70595c (jour 29/30/31 borné au mois réel) et
garde #3206.2/#3240 (valid_from / valid_to : mêmes champs, mêmes types).
"""

from datetime import date

import pytest

from app.services.signal_freshness import (
    classify_signal_freshness,
    classify_temporal_status,
    read_signal_date,
    stamp_signals_freshness,
)

TODAY = date(2026, 10, 27)

_MONTHS = [
    ("janvier", "janv.", 1, 31),
    ("février", "févr.", 2, 28),
    ("mars", "mars", 3, 31),
    ("avril", "avr.", 4, 30),
    ("mai", "mai", 5, 31),
    ("juin", "juin", 6, 30),
    ("juillet", "juil.", 7, 31),
    ("août", "août", 8, 31),
    ("septembre", "sept.", 9, 30),
    ("octobre", "oct.", 10, 31),
    ("novembre", "nov.", 11, 30),
    ("décembre", "déc.", 12, 31),
]


def _variants(word: str) -> set[str]:
    plain = word.replace("é", "e").replace("û", "u").replace("è", "e")
    return {word, word.upper(), word.capitalize(), plain, plain.upper(), word.rstrip(".")}


def test_offre_de_quatre_jours_en_toutes_lettres_est_recente() -> None:
    [s] = stamp_signals_freshness(
        [{"signal": "Offre Indeed", "date": "23 octobre 2026", "type": "recrutement"}], today=TODAY
    )
    assert s["valid_from"] == "2026-10-23"
    assert s["freshness"] == "current"
    assert s["temporal_status"] == "RECENT"
    assert s["date_precision"] == "jour"


@pytest.mark.parametrize("raw", ["4 septembre 2026", "1 janv. 2026", "1er octobre 2026", "le 23 Octobre 2026"])
def test_formes_jour_mois_annee(raw: str) -> None:
    assert read_signal_date(raw) is not None
    assert read_signal_date(raw)[1] == "jour"  # type: ignore[index]


@pytest.mark.parametrize(("full", "abbr", "month", "_last"), _MONTHS)
def test_les_douze_mois_complets_abreges_accents_casse_point(full: str, abbr: str, month: int, _last: int) -> None:
    for form in _variants(full) | _variants(abbr):
        got = read_signal_date(f"12 {form} 2025")
        assert got == (date(2025, month, 12), "jour"), form


@pytest.mark.parametrize(("full", "abbr", "month", "last"), _MONTHS)
def test_mois_et_annee_sans_jour_vaut_le_dernier_jour_du_mois(full: str, abbr: str, month: int, last: int) -> None:
    assert read_signal_date(f"{full.upper()} 2026") == (date(2026, month, last), "mois")
    assert read_signal_date(f"{abbr} 2026") == (date(2026, month, last), "mois")


def test_fevrier_bissextile_sans_jour() -> None:
    assert read_signal_date("février 2028") == (date(2028, 2, 29), "mois")


# ── Les tests qui disent NON ─────────────────────────────────────────────────


def test_iso_inchange() -> None:
    assert read_signal_date("2026-10-23") == (date(2026, 10, 23), "jour")


def test_annee_seule_vaut_le_31_decembre_jamais_le_1er_janvier() -> None:
    assert read_signal_date("2026") == (date(2026, 12, 31), "année")


def test_plage_d_annees_vaut_le_31_decembre_de_la_derniere() -> None:
    assert read_signal_date("2023-2024") == (date(2024, 12, 31), "année")


def test_premiere_annee_gagne_sur_une_date_de_depot_plus_tardive() -> None:
    assert read_signal_date("2024 (comptes déposés 2025-11)") == (date(2024, 12, 31), "année")


def test_vraie_offre_de_2024_reste_archive() -> None:
    assert classify_signal_freshness("12 mars 2024", today=TODAY, signal_type="recrutement") == "archive"
    assert classify_signal_freshness("2024", today=TODAY, signal_type="recrutement") == "archive"


def test_annee_seule_de_l_annee_courante_ne_vieillit_pas_par_defaut() -> None:
    # 31/12/2026 est dans le futur : jamais une archive (le 1er janvier l'aurait été le 30 juin).
    assert classify_signal_freshness("2026", today=TODAY, signal_type="recrutement") == "current"
    assert classify_temporal_status("2026", today=TODAY, signal_type="recrutement") == "RECENT"


def test_signal_non_date_reste_undated() -> None:
    assert read_signal_date("Non daté précisément") is None
    [s] = stamp_signals_freshness([{"signal": "x", "date": "Non daté précisément"}], today=TODAY)
    assert s["freshness"] == "undated"
    assert "valid_from" not in s and "valid_to" not in s and "date_precision" not in s


def test_type_inconnu_garde_ses_730_jours() -> None:
    [s] = stamp_signals_freshness([{"signal": "x", "date": "23 octobre 2026", "type": "inventé"}], today=TODAY)
    assert s["freshness_window_days"] == 730
    assert s["valid_to"] == "2028-10-22"


def test_garde_0e4d70595c_jour_hors_du_mois_borne_au_mois_reel() -> None:
    assert read_signal_date("31 novembre 2026") == (date(2026, 11, 30), "jour")
    assert read_signal_date("30 février 2026") == (date(2026, 2, 28), "jour")
    assert read_signal_date("31 octobre 2026") == (date(2026, 10, 31), "jour")


def test_garde_3206_contrat_valid_from_valid_to_memes_champs_memes_types() -> None:
    [s] = stamp_signals_freshness([{"signal": "x", "date": "23 octobre 2026", "type": "recrutement"}], today=TODAY)
    assert isinstance(s["valid_from"], str) and isinstance(s["valid_to"], str)
    assert s["valid_to"] == "2027-04-21"  # 23/10/2026 + 180 j


def test_mois_anglais_ne_sont_pas_lus() -> None:
    # « à mesurer avant d'élargir » (#4647) : l'année seule est lue, pas le mois.
    assert read_signal_date("October 23, 2026") == (date(2026, 12, 31), "année")
