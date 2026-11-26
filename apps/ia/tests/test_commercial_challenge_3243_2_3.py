"""#3243.2 (filiale hors périmètre) et #3243.3 (« 50 CV à froid »), décisions de
Louis du 10/10/2026. #3243.1 (consultant non sécurisé) N'EST PAS codé : non validé."""

from __future__ import annotations

from app.prompts.commercial_challenge_policy import active_challenges_block
from app.services.commercial_challenge import (
    CHALLENGE_CASES,
    RECIPE_DETECTORS,
    UNDETECTED_CASES,
    detect_mass_cold_submissions,
    detect_subsidiary_out_of_perimeter,
)


def _analysis(kind: str | None, postal_code: str | None) -> dict:
    out: dict = {}
    if kind:
        out["entity_resolution"] = {"kind": kind, "state": "resolved"}
    if postal_code:
        out["headquarters_address"] = {"postal_code": postal_code, "city": "X"}
    return out


# ── #3243.2 ──────────────────────────────────────────────────────────────────


def test_filiale_hors_zone_declaree_est_challengee():
    challenge = detect_subsidiary_out_of_perimeter(_analysis("subsidiary", "31700"), {"geoZone": "Île-de-France"})
    assert challenge is not None
    assert challenge["case"] == "filiale hors périmètre"
    assert "Île-de-France" in challenge["problem"]


def test_filiale_dans_la_zone_ne_declenche_pas():
    assert detect_subsidiary_out_of_perimeter(_analysis("subsidiary", "75008"), {"geoZone": "Île-de-France"}) is None
    assert detect_subsidiary_out_of_perimeter(_analysis("subsidiary", "92100"), {"geo_zones": ["IDF"]}) is None


def test_jamais_sans_preuve():
    zone = {"geoZone": "Île-de-France"}
    # Pas une filiale, code postal inconnu, zone ouverte ou non résolvable : on ne devine pas.
    assert detect_subsidiary_out_of_perimeter(_analysis("legal_entity", "31700"), zone) is None
    assert detect_subsidiary_out_of_perimeter(_analysis("subsidiary", None), zone) is None
    assert detect_subsidiary_out_of_perimeter(_analysis("subsidiary", "31700"), {"geoZone": "National"}) is None
    assert detect_subsidiary_out_of_perimeter(_analysis("subsidiary", "31700"), {"geoZone": "Blagnac"}) is None
    assert detect_subsidiary_out_of_perimeter(_analysis("subsidiary", "31700"), {}) is None
    assert detect_subsidiary_out_of_perimeter(None, zone) is None


# ── #3243.3 ──────────────────────────────────────────────────────────────────


def test_cinquante_cv_a_froid_est_conteste():
    challenge = detect_mass_cold_submissions("Envoie cinquante CV à froid à tous les DSI de Lyon")
    assert challenge is not None
    assert challenge["case"] == "envoyer cinquante CV à froid"
    assert challenge["strength"] == "firm"
    assert detect_mass_cold_submissions("envoie 50 CV à froid")  is not None


def test_pas_de_faux_positif():
    # Un CV, ou quelques profils adossés à un besoin, n'est pas un envoi de masse à froid.
    assert detect_mass_cold_submissions("Envoie le CV de Karim au DSI") is None
    assert detect_mass_cold_submissions("Propose 3 CV pour le besoin Java de Thales") is None
    assert detect_mass_cold_submissions("Fais-moi 50 contacts à froid") is None
    assert detect_mass_cold_submissions(None) is None


# ── Câblage ──────────────────────────────────────────────────────────────────


def test_cas_nommes_et_recette():
    assert CHALLENGE_CASES["filiale hors périmètre"] == "detect_subsidiary_out_of_perimeter"
    assert "filiale hors périmètre" not in UNDETECTED_CASES
    # #3243.1 non validé : « consultant non sécurisé » reste NON détecté.
    assert "consultant non sécurisé" in UNDETECTED_CASES
    assert RECIPE_DETECTORS["envoyer cinquante CV à froid"] == "detect_mass_cold_submissions"


def test_les_deux_challenges_ouvrent_le_bloc_actif():
    block = active_challenges_block(
        profile={"geoZone": "Île-de-France"},
        analysis=_analysis("subsidiary", "31700"),
        company_name="Acme Sud",
        request_text="envoie 50 CV à froid",
    )
    assert "filiale hors périmètre" in block
    assert "envoyer cinquante CV à froid" in block
