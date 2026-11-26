"""Deterministic signal freshness (Théo p.7/p.12): a 2021 signal is an archive,
not a live 'à relancer' trigger."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.services.signal_freshness import (
    TEMPORAL_HISTORICAL,
    TEMPORAL_RECENT,
    TEMPORAL_STALE,
    TEMPORAL_UNDATED,
    _parse_signal_date,
    archive_after_days,
    classify_signal_freshness,
    classify_temporal_status,
    stamp_signals_freshness,
)

TODAY = date(2026, 7, 14)


def test_old_signal_is_archive():
    assert classify_signal_freshness("10 mars 2021", today=TODAY) == "archive"
    assert classify_signal_freshness("2021", today=TODAY) == "archive"
    assert classify_signal_freshness("2021-03-10", today=TODAY) == "archive"


def test_a_year_range_is_read_at_its_end_year():
    # #4647 : une plage se lit à l'année de FIN, et une date incomplète au DERNIER jour
    # de la période (jamais le 1er janvier) — on ne vieillit pas un fait par défaut.
    # "2023-2024" vaut donc 2024-12-31, soit ~18 mois : current, pas archive.
    assert classify_signal_freshness("2023-2024", today=TODAY) == "current"
    # La règle reste capable de dire NON : une plage qui finit avant le seuil est bien archive.
    assert classify_signal_freshness("2021-2022", today=TODAY) == "archive"


def test_recent_signal_is_current():
    assert classify_signal_freshness("1 janv. 2026", today=TODAY) == "current"
    assert classify_signal_freshness("2026-06", today=TODAY) == "current"
    assert classify_signal_freshness("2025-01", today=TODAY) == "current"  # ~18 months


def test_reads_the_leading_year_not_a_later_date_in_the_string():
    # "Revenus 2023 : … accounts filed 2025-11" — the signal is about 2023, the
    # 2025-11 is a filing date. Must classify on 2023 (archive), not 2025-11.
    # L'année menante est 2023 et non 2024 depuis #4647 : lue au 31 décembre, 2024
    # tomberait du même côté que 2025-11 et le test ne saurait plus dire NON.
    assert classify_signal_freshness("2023 (full year accounts filed 2025-11)", today=TODAY) == "archive"


_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
           "septembre", "octobre", "novembre", "décembre"]  # fmt: skip


# #4716 — mêmes cas que signal-date.test.ts (« signalDateMs ») : à garder alignés.
@pytest.mark.parametrize("index,name", list(enumerate(_MONTHS, start=1)))
def test_month_in_letters_is_read_not_january(index: int, name: str) -> None:
    assert _parse_signal_date(f"23 {name} 2026") == date(2026, index, 23)


def test_month_in_letters_variants_and_numeric_formats() -> None:
    assert _parse_signal_date("octobre 2026") == date(2026, 10, 1)
    assert _parse_signal_date("1er mars 2021") == date(2021, 3, 1)
    assert _parse_signal_date("3 janv. 2026") == date(2026, 1, 3)
    assert _parse_signal_date("2021-03-10") == date(2021, 3, 10)
    assert _parse_signal_date("2021/03") == date(2021, 3, 1)


def test_month_in_letters_keeps_the_first_year_anchor_and_says_no() -> None:
    assert _parse_signal_date("2024 (comptes déposés 2025-11)") == date(2024, 1, 1)
    assert _parse_signal_date("2024 (comptes déposés en novembre 2025)") == date(2024, 1, 1)
    assert _parse_signal_date("2026") == date(2026, 1, 1)
    assert _parse_signal_date("exercice 2026") == date(2026, 1, 1)
    assert _parse_signal_date("Non daté précisément") is None


def test_undated_signal_stays_undated():
    assert classify_signal_freshness("Non daté précisément", today=TODAY) == "undated"
    assert classify_signal_freshness("", today=TODAY) == "undated"
    assert classify_signal_freshness(None, today=TODAY) == "undated"


def test_future_dated_is_not_an_archive():
    assert classify_signal_freshness("2027-01", today=TODAY) == "current"


def test_stamp_signals_freshness_adds_field():
    signals = [
        {"signal": "Comm. presse blockchain", "date": "10 mars 2021"},
        {"signal": "BoursoBank valorisée", "date": "1 janv. 2026"},
        {"signal": "Enjeu", "date": "Non daté"},
        "junk",  # dropped
    ]
    out = stamp_signals_freshness(signals, today=TODAY)
    assert [s["freshness"] for s in out] == ["archive", "current", "undated"]
    # Original date/signal preserved.
    assert out[0]["signal"] == "Comm. presse blockchain"


def test_stamp_handles_none():
    assert stamp_signals_freshness(None) == []


# ── Fenêtres par TYPE (PDF 2, items 90-97 — décision de Louis du 21/08) ───────


class TestFreshnessWindowsByType:
    """La fenêtre unique de 24 mois faisait remonter des signaux morts.

    Une offre d'emploi de vingt mois est pourvue ou abandonnée ; une échéance
    réglementaire du même âge porte encore. Les traiter pareil rend le compteur
    de signaux inutile pour décider quoi faire aujourd'hui.
    """

    TODAY = date(2026, 8, 21)

    def test_a_job_ad_ages_faster_than_a_regulation(self) -> None:
        nine_months_ago = "2025-11-01"
        assert classify_signal_freshness(nine_months_ago, today=self.TODAY, signal_type="recrutement") == "archive"
        assert classify_signal_freshness(nine_months_ago, today=self.TODAY, signal_type="regulation") == "current"

    def test_an_unknown_type_keeps_the_historical_window(self) -> None:
        """La sûreté du changement tient à cette ligne.

        Un signal non typé — ou typé d'un mot que le prompt ne produit pas — est
        classé EXACTEMENT comme avant. Aucun dossier existant ne bascule par
        surprise.
        """
        eighteen_months_ago = "2025-02-01"
        assert classify_signal_freshness(eighteen_months_ago, today=self.TODAY) == "current"
        assert classify_signal_freshness(eighteen_months_ago, today=self.TODAY, signal_type="") == "current"
        assert classify_signal_freshness(eighteen_months_ago, today=self.TODAY, signal_type="inventé") == "current"
        assert archive_after_days(None) == 730
        assert archive_after_days("n'importe quoi") == 730

    def test_the_type_is_read_case_insensitively(self) -> None:
        # Le modèle écrit parfois « Recrutement ». Rater la casse ferait
        # retomber silencieusement sur le défaut, et la fenêtre ne servirait à
        # rien sans qu'on le voie.
        assert archive_after_days("Recrutement") == 180
        assert archive_after_days("  BUDGET  ") == 365

    def test_stamping_uses_the_signal_own_type(self) -> None:
        stamped = stamp_signals_freshness(
            [
                {"signal": "Recrute 12 devs", "date": "2025-11-01", "type": "recrutement"},
                {"signal": "NIS2 applicable", "date": "2025-11-01", "type": "regulation"},
                {"signal": "Sans type", "date": "2025-11-01"},
            ],
            today=self.TODAY,
        )
        assert [entry["freshness"] for entry in stamped] == ["archive", "current", "current"]

    def test_every_declared_type_is_one_the_prompt_produces(self) -> None:
        """Un type inventé ici ne matcherait jamais — la fenêtre serait morte.

        Les dix-huit types viennent du contrat de sortie de `bellum_signals`
        (``apps/ia/app/prompts/bellum_signals.py``, champ ``type``).
        """
        from app.services.signal_freshness import _ARCHIVE_AFTER_DAYS_BY_TYPE

        produced = {
            "nomination",
            "budget",
            "projet",
            "incident",
            "regulation",
            "acquisition",
            "partenariat",
            "restructuration",
            "recrutement",
            "transformation",
            "demenagement",
            "investissement",
            "organisation",
            "levee_fonds",
            "appel_offres",
            "technologie",
            "contact",
            "recours_externe",
        }
        assert set(_ARCHIVE_AFTER_DAYS_BY_TYPE) <= produced

    def test_the_four_previously_uncovered_real_types_now_have_a_named_window(self) -> None:
        """LAU-FINAL-212 (#3206.6) — quatre types RÉELLEMENT émis par
        `bellum_signals` (vérifié : `type` en liste ligne 107 du prompt)
        tombaient sur le défaut générique de 730 jours sans qu'aucune raison
        écrite ne le justifie — exactement le motif que la doctrine nomme :
        « du code juste, calculé, testé, que personne n'appelle » à l'envers
        ici (un type APPELÉ mais jamais COUVERT). La durée n'est pas
        identique pour tous les signaux (LAU-FINAL-212, SIGNAL DECAY).
        """
        eighteen_months_ago = "2025-02-01"
        assert archive_after_days("investissement") == 365
        assert archive_after_days("transformation") == 545
        assert archive_after_days("demenagement") == 365
        assert archive_after_days("organisation") == 365
        # Confirme que la fenêtre s'applique bien au classement, pas juste au lookup.
        assert (
            classify_signal_freshness(eighteen_months_ago, today=self.TODAY, signal_type="investissement")
            == "archive"
        )

    def test_every_type_the_prompt_produces_has_its_own_window(self) -> None:
        """#3206.6 (partiel) — aucun des dix-huit types émis ne retombe plus sur
        le défaut historique par silence (seul un type INCONNU du prompt le
        fait, testé ailleurs)."""
        from app.services.signal_freshness import _ARCHIVE_AFTER_DAYS_BY_TYPE

        produced = {
            "nomination",
            "budget",
            "projet",
            "incident",
            "regulation",
            "acquisition",
            "partenariat",
            "restructuration",
            "recrutement",
            "transformation",
            "demenagement",
            "investissement",
            "organisation",
            "levee_fonds",
            "appel_offres",
            "technologie",
            "contact",
            "recours_externe",
        }
        assert produced <= set(_ARCHIVE_AFTER_DAYS_BY_TYPE)

    def test_newly_windowed_types_use_their_own_window_not_the_default(self) -> None:
        # #3206.6 (partiel, épopée #3240) — les 9 types produits par le prompt
        # mais jamais fenêtrés jusqu'ici (4 déjà émis sans fenêtre + 5 ajoutés
        # ce lot au contrat de sortie).
        assert archive_after_days("transformation") != 730
        assert archive_after_days("demenagement") != 730
        assert archive_after_days("investissement") != 730
        assert archive_after_days("organisation") != 730
        assert archive_after_days("levee_fonds") != 730
        assert archive_after_days("appel_offres") != 730
        assert archive_after_days("technologie") != 730
        assert archive_after_days("contact") != 730
        assert archive_after_days("recours_externe") != 730


# ── Statuts temporels nommés (#3206.3, épopée #3240) ──────────────────────────
#
# Champ ADDITIF à `freshness` (jamais un remplacement — un lecteur existant qui
# compare littéralement à 'archive'/'current'/'undated' ne doit rien voir
# bouger). Seuls 4 des 6 statuts nommés par #3206 sont atteignables avec les
# capacités d'aujourd'hui : CURRENT_VERIFIED demande un événement de
# vérification qui n'existe pas encore (`last_verified_at`), SUPERSEDED demande
# une détection de doublon inter-signaux qui n'existe pas non plus — les deux
# restent "reste" (voir le commentaire de clôture de l'épopée), pas devinés ici.
class TestTemporalStatus:
    TODAY = date(2026, 8, 21)

    def test_undated_stays_undated(self) -> None:
        assert classify_temporal_status(None, today=self.TODAY) == TEMPORAL_UNDATED
        assert classify_temporal_status("Non daté", today=self.TODAY) == TEMPORAL_UNDATED

    def test_current_signal_is_recent_never_verified(self) -> None:
        # Jamais CURRENT_VERIFIED : aucune vérification n'a eu lieu, seulement
        # une observation — la nuance que #3206 demande de ne pas confondre.
        assert classify_temporal_status("2026-06", today=self.TODAY, signal_type="budget") == TEMPORAL_RECENT

    def test_archived_state_type_is_historical(self) -> None:
        # nomination / partenariat / restructuration / acquisition : une fois
        # périmés, ils décrivent un ÉTAT passé encore utile de contexte — "une
        # personne ayant travaillé chez le compte n'est pas un contact actuel"
        # (règle #3206) sans pour autant être sans valeur documentaire.
        nine_months_ago = "2025-11-01"
        assert classify_temporal_status(nine_months_ago, today=self.TODAY, signal_type="recrutement") == TEMPORAL_STALE
        two_years_ago = "2024-08-01"
        assert (
            classify_temporal_status(two_years_ago, today=self.TODAY, signal_type="nomination") == TEMPORAL_HISTORICAL
        )

    def test_archived_time_limited_type_is_stale(self) -> None:
        # recrutement / budget / projet / incident / regulation / type inconnu :
        # une fois périmés, "trop anciens pour soutenir une décision actuelle".
        two_years_ago = "2024-08-01"
        assert classify_temporal_status(two_years_ago, today=self.TODAY, signal_type="budget") == TEMPORAL_STALE
        assert classify_temporal_status(two_years_ago, today=self.TODAY) == TEMPORAL_STALE

    def test_newly_windowed_state_types_are_historical_once_archived(self) -> None:
        # demenagement / organisation / levee_fonds / technologie / contact :
        # même logique que nomination/partenariat/restructuration/acquisition —
        # un ÉTAT passé toujours utile de contexte, pas une fenêtre d'action
        # manquée. "Une personne ayant travaillé chez le compte n'est pas un
        # contact actuel" (#3206) vaut mot pour mot pour ``contact``.
        two_years_ago = "2024-08-01"
        for state_type in ("demenagement", "organisation", "levee_fonds", "technologie", "contact", "recours_externe"):
            assert (
                classify_temporal_status(two_years_ago, today=self.TODAY, signal_type=state_type) == TEMPORAL_HISTORICAL
            ), state_type

    def test_newly_windowed_time_limited_types_are_stale_once_archived(self) -> None:
        # transformation / investissement / appel_offres : une fois périmés, une
        # fenêtre d'action manquée, pas un état encore utile — même famille que
        # projet/budget/incident.
        two_years_ago = "2024-08-01"
        for time_limited_type in ("transformation", "investissement", "appel_offres"):
            assert (
                classify_temporal_status(two_years_ago, today=self.TODAY, signal_type=time_limited_type)
                == TEMPORAL_STALE
            ), time_limited_type

    def test_future_dated_is_recent_not_an_archive_status(self) -> None:
        assert classify_temporal_status("2027-01", today=self.TODAY) == TEMPORAL_RECENT

    def test_stamping_adds_temporal_status_and_freshness_window_additively(self) -> None:
        stamped = stamp_signals_freshness(
            [{"signal": "Recrute 12 devs", "date": "2025-11-01", "type": "recrutement"}],
            today=self.TODAY,
        )
        assert stamped[0]["freshness"] == "archive"  # existing field untouched
        assert stamped[0]["temporal_status"] == TEMPORAL_STALE
        assert stamped[0]["freshness_window_days"] == 180

    # ── #3206.2 (reste, épopée #3240) — valid_from / valid_to ──────────────

    def test_valid_from_is_the_signals_own_date_never_invented(self) -> None:
        stamped = stamp_signals_freshness(
            [{"signal": "Recrute 12 devs", "date": "2025-11-01", "type": "recrutement"}],
            today=self.TODAY,
        )
        assert stamped[0]["valid_from"] == "2025-11-01"

    def test_valid_to_is_exactly_valid_from_plus_the_freshness_window(self) -> None:
        stamped = stamp_signals_freshness(
            [{"signal": "Recrute 12 devs", "date": "2025-11-01", "type": "recrutement"}],
            today=self.TODAY,
        )
        expected = (date(2025, 11, 1) + timedelta(days=180)).isoformat()
        assert stamped[0]["valid_to"] == expected

    def test_valid_from_and_valid_to_use_the_type_specific_window(self) -> None:
        # Même date, un TYPE différent (fenêtre 545 jours) — valid_to change,
        # preuve que la fenêtre n'est jamais un chiffre unique codé en dur.
        stamped = stamp_signals_freshness(
            [{"signal": "Programme annoncé", "date": "2025-11-01", "type": "projet"}],
            today=self.TODAY,
        )
        expected = (date(2025, 11, 1) + timedelta(days=545)).isoformat()
        assert stamped[0]["valid_to"] == expected

    def test_an_undated_signal_never_gets_a_guessed_validity_window(self) -> None:
        stamped = stamp_signals_freshness(
            [{"signal": "Sans date exploitable", "date": "date non normalisée"}],
            today=self.TODAY,
        )
        assert "valid_from" not in stamped[0]
        assert "valid_to" not in stamped[0]


# #4832 — cas PARTAGÉS avec packages/contracts/src/schemas/signal-date.test.ts (« date incomplète = fin de période ») :
# même tableau, mêmes dates. Corriger une moitié sans l'autre laisse l'autre mentir.
@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("2024", date(2024, 12, 31)),
        ("exercice 2026", date(2026, 12, 31)),
        ("2023-2024", date(2024, 12, 31)),
        ("2021-2022", date(2022, 12, 31)),
        ("octobre 2026", date(2026, 10, 31)),
        ("février 2024", date(2024, 2, 29)),
        ("2021-03", date(2021, 3, 31)),
        ("2021-03-10", date(2021, 3, 10)),
    ],
)
def test_shared_cases_incomplete_date_is_end_of_period(text, expected):
    from app.services.signal_freshness import read_signal_date

    read = read_signal_date(text)
    assert read is not None
    assert read[0] == expected
