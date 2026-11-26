"""#2441.4 — les SLO de streaming du chat (LAU-FINAL-155) : ack < 500 ms,
premier statut < 1,5 s, réponse < 10 s en P95.

Ce fichier tient les DEUX seuils qui se mesurent PAR TOUR (ack, premier
statut) : une valeur absente ne se lit jamais « 0 » ni « dans les clous » —
elle sort du verdict, nommée. Le troisième seuil (P95 sur la réponse totale)
est une statistique de POPULATION, pas d'un tour seul : il n'a pas sa place
ici (voir la ligne #2441.4 du registre pour ce qui reste à faire).
"""

from __future__ import annotations

from app.services.chat_slo import CHAT_SLO_THRESHOLDS_MS, ack_ms_from_stages, turn_slo_summary


def test_les_seuils_sont_les_trois_nommes_par_lissue():
    assert CHAT_SLO_THRESHOLDS_MS == {"ack": 500, "firstStatus": 1500, "responseP95": 10_000}


def test_ack_est_la_somme_des_deux_etapes_api_quand_les_deux_sont_connues():
    assert ack_ms_from_stages({"api.quota": 80, "api.context": 120}) == 200


def test_ack_absent_si_une_seule_des_deux_etapes_est_connue():
    # Une somme partielle mentirait sur ce qui a vraiment été mesuré.
    assert ack_ms_from_stages({"api.quota": 80}) is None
    assert ack_ms_from_stages({"api.context": 120}) is None


def test_ack_absent_si_aucune_etape_api_n_est_connue():
    assert ack_ms_from_stages({}) is None
    assert ack_ms_from_stages({"retrieval": 40}) is None


def test_turn_slo_summary_vide_quand_rien_n_est_mesure():
    assert turn_slo_summary(ack_ms=None, first_status_ms=None) == {}


def test_turn_slo_summary_porte_ack_dans_les_clous():
    summary = turn_slo_summary(ack_ms=200, first_status_ms=None)
    assert summary == {"ack": {"ms": 200, "sloMs": 500, "breached": False}}


def test_turn_slo_summary_porte_ack_en_depassement():
    summary = turn_slo_summary(ack_ms=900, first_status_ms=None)
    assert summary["ack"] == {"ms": 900, "sloMs": 500, "breached": True}


def test_turn_slo_summary_porte_premier_statut_independamment_de_ack():
    summary = turn_slo_summary(ack_ms=None, first_status_ms=1800)
    assert "ack" not in summary
    assert summary["firstStatus"] == {"ms": 1800, "sloMs": 1500, "breached": True}


def test_turn_slo_summary_porte_les_deux_quand_les_deux_sont_mesures():
    summary = turn_slo_summary(ack_ms=100, first_status_ms=400)
    assert summary["ack"]["breached"] is False
    assert summary["firstStatus"]["breached"] is False


def test_le_seuil_est_une_egalite_stricte_pas_un_depassement():
    # Exactement au seuil : pas encore un dépassement.
    summary = turn_slo_summary(ack_ms=500, first_status_ms=1500)
    assert summary["ack"]["breached"] is False
    assert summary["firstStatus"]["breached"] is False
