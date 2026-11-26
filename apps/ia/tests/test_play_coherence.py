"""Juge de cohérence des plays / offres (retour Thales 2026-07-07).

Théo : « contact prioritaire Remy mais action Nicolas », « play avec Bernard mais
action vers Marie ». La chaîne périmètre → signal → offre → contact → action →
message → preuve → risque doit raconter la MÊME histoire. ``enforce_play_coherence``
détecte qu'une action cible un contact autre que le contact prioritaire du play,
la recadre sur le bon contact, et signale les maillons manquants (offre / contact
non déterminés) au lieu de laisser un play incohérent passer.
"""

from __future__ import annotations

from app.services.play_coherence import enforce_play_coherence

_CONTACTS = [
    {"fullName": "Remy Dupont", "role": "technical"},
    {"fullName": "Nicolas Martin", "role": "economic"},
    {"fullName": "Bernard Blanc", "role": "champion"},
    {"fullName": "Marie Girard", "role": "user"},
]


def test_action_targeting_another_contact_is_flagged_and_rebound() -> None:
    play = {
        "perimeter": "Thales Digital Factory",
        "painSignal": "Recrutements MLOps massifs.",
        "esnOffer": "TMA data / MLOps",
        "targetContact": "Remy Dupont",
        "targetContactRole": "technical",
        "angle": "Renfort MLOps",
        "firstAction": "Appeler Nicolas pour présenter l'offre.",
        "risk": "Accès à confirmer.",
    }
    fixed = enforce_play_coherence(play, _CONTACTS)
    assert fixed["coherence"]["status"] == "repaired"
    # The action no longer targets Nicolas; it targets the play's own contact.
    assert "nicolas" not in fixed["firstAction"].lower()
    assert "Remy Dupont" in fixed["firstAction"]
    assert any("nicolas" in i.lower() for i in fixed["coherence"]["issues"])


def test_coherent_play_is_left_untouched() -> None:
    play = {
        "perimeter": "Thales Digital Factory",
        "painSignal": "Recrutements MLOps.",
        "esnOffer": "TMA MLOps",
        "targetContact": "Remy Dupont",
        "targetContactRole": "technical",
        "angle": "Renfort MLOps",
        "firstAction": "Contacter Remy Dupont sur le renfort MLOps.",
        "risk": "Accès à confirmer.",
    }
    fixed = enforce_play_coherence(play, _CONTACTS)
    assert fixed["coherence"]["status"] == "coherent"
    assert fixed["firstAction"] == play["firstAction"]
    assert fixed["coherence"]["issues"] == []


def test_missing_offer_or_contact_is_marked_incoherent() -> None:
    play = {
        "perimeter": "Thales Agro",
        "painSignal": "à qualifier",
        "esnOffer": "à qualifier",
        "targetContact": "à identifier",
        "angle": "à définir",
        "firstAction": "à définir",
        "risk": "Accès à confirmer.",
    }
    fixed = enforce_play_coherence(play, _CONTACTS)
    assert fixed["coherence"]["status"] == "incoherent"
    joined = " ".join(fixed["coherence"]["issues"]).lower()
    assert "offre" in joined
    assert "contact" in joined


def test_generic_action_without_names_is_coherent() -> None:
    play = {
        "perimeter": "Thales Digital Factory",
        "painSignal": "Signal.",
        "esnOffer": "Offre.",
        "targetContact": "Bernard Blanc",
        "targetContactRole": "champion",
        "angle": "Angle",
        "firstAction": "Envoyer un message LinkedIn de mise en relation.",
        "risk": "Risque.",
    }
    fixed = enforce_play_coherence(play, _CONTACTS)
    assert fixed["coherence"]["status"] == "coherent"
    assert fixed["firstAction"] == play["firstAction"]


def test_action_naming_the_target_is_coherent() -> None:
    # The action DOES name the target (first name only) → no mismatch.
    play = {
        "perimeter": "P",
        "painSignal": "S",
        "esnOffer": "O",
        "targetContact": "Marie Girard",
        "targetContactRole": "user",
        "angle": "A",
        "firstAction": "Relancer Marie après l'événement.",
        "risk": "R",
    }
    fixed = enforce_play_coherence(play, _CONTACTS)
    assert fixed["coherence"]["status"] == "coherent"
