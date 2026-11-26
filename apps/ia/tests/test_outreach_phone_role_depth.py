"""#3697(a) (reste) — le support d'appel généré (canal `phone`,
`bellum_outreach`) doit : adapter ton et profondeur au RÔLE du contact,
n'imposer jamais un rendez-vous comme objectif par défaut, et montrer
l'ouverture (fait + question) D'EMBLÉE, sans préambule de politesse.

Les objections, elles, restent HORS de ce canal : un fait déclaré distinct
(panneau Objections, modèles approuvés ordonnés par rôle, #3697.9/lot F16),
jamais régénéré une seconde fois par ce prompt — voir sa docstring.
"""

from __future__ import annotations

from app.prompts import bellum_outreach


def _phone_system_prompt() -> str:
    return bellum_outreach.build_system_prompt({}, "phone")


def test_phone_opening_states_the_fact_first_never_a_politeness_preamble() -> None:
    system = _phone_system_prompt()
    assert "PREMIÈRE phrase est le fait précis du compte" in system
    assert "jamais une formule de politesse" in system
    assert "comment allez-vous" in system.lower()


def test_phone_tone_and_depth_follow_the_contact_role() -> None:
    system = _phone_system_prompt()
    assert "dirigeant/décideur, enjeu et conséquence" in system
    assert "contact technique ou opérationnel, un détail concret observable" in system
    assert "contact achats, le process ou la condition" in system
    # Le rôle pilote le CHOIX, par le MÊME bloc persona que les autres canaux —
    # jamais une seconde table de rôles tenue ici (GA-26).
    assert "le PERSONA et son levier (ci-dessus) pilotent" in system


def test_phone_never_imposes_a_meeting_as_the_default_objective() -> None:
    system = _phone_system_prompt()
    assert "AUCUN rendez-vous proposé par défaut" in system
    assert "jamais un créneau d'agenda inventé" in system
    # Garde-fou GLOBAL (tous canaux) déjà posé par le système : « sinon obtenir
    # une RÉPONSE, pas un RDV » — ce lot le renforce côté canal, il ne le remplace pas.
    assert "sinon obtenir une RÉPONSE, pas un RDV" in system


def test_phone_output_is_still_a_single_opening_body_not_a_second_objections_field() -> None:
    """Les objections sont déjà un fait déclaré distinct (#3697.9) : ce canal
    ne gagne pas un second champ qui les régénérerait sans preuve."""
    assert bellum_outreach._CHANNEL_OWN_FIELDS["phone"] == (
        '  "body": "ouverture téléphonique de 2-3 phrases prête à dire",\n'
    )
