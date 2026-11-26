"""#3204.2 (épopée #3238) — équipe et rattachement, seulement si un marqueur explicite les nomme."""

from __future__ import annotations

from app.services.job_context import derive_replacement_signal, derive_reporting_line, derive_team


def test_equipe_nommee_apres_le_marqueur_fr() -> None:
    assert derive_team("Vous rejoignez l'équipe Data au sein de la DSI") == "data"


def test_equipe_nommee_en_anglais() -> None:
    assert derive_team("You will join the Platform Engineering team") == "platform engineering"


def test_aucun_marqueur_equipe_rend_none() -> None:
    assert derive_team("Développeur Java confirmé") is None
    assert derive_team(None) is None


def test_rattachement_fr_forme_masculine() -> None:
    assert derive_reporting_line("Poste rattaché au CTO") == "cto"


def test_rattachement_fr_forme_feminine_parenthesee() -> None:
    assert derive_reporting_line("Rattaché(e) au Directeur Technique") == "directeur technique"


def test_rattachement_en() -> None:
    assert derive_reporting_line("You will report to the Head of Engineering") == "head of engineering"


def test_intitule_seul_ne_suffit_pas_a_identifier_le_decideur() -> None:
    # RÈGLE explicite de la spec #3204 : un intitulé seul ne nomme jamais un
    # rattachement — seule une phrase explicite le fait.
    assert derive_reporting_line("Directeur Technique") is None
    assert derive_reporting_line(None) is None


# ── #3204.7 (épopée #3238, reste du 30/09) — REPLACEMENT_SIGNAL ────────────
#
# `hiring_aggregation.py` refuse à raison de déduire un remplacement d'une
# simple récurrence d'offres (confondrait croissance et remplacement, RÈGLE
# de la spec). La seule preuve honnête reste un marqueur EXPLICITE dans le
# texte de CETTE offre — jamais devinée d'un intitulé ou d'un volume.


def test_remplacement_nomme_explicitement_fr() -> None:
    assert derive_replacement_signal("Développeur — en remplacement d'un départ") is True


def test_succession_nommee_explicitement_fr() -> None:
    assert derive_replacement_signal("Poste vacant suite à la démission du titulaire") is True


def test_replacement_nomme_explicitement_en() -> None:
    assert derive_replacement_signal("Backfill for a departing team member") is True


def test_aucun_marqueur_de_remplacement_rend_false() -> None:
    assert derive_replacement_signal("Développeur Java confirmé") is False
    assert derive_replacement_signal(None) is False


def test_une_offre_de_croissance_seule_nest_jamais_lue_comme_un_remplacement() -> None:
    # RÈGLE explicite de la spec : plusieurs recrutements peuvent indiquer une
    # croissance, jamais un remplacement sans preuve de départ — un volume
    # d'offres, seul, ne suffit jamais.
    assert derive_replacement_signal("5 postes de développeur ouverts") is False
