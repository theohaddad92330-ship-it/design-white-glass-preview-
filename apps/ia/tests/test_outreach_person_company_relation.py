"""#219.8 (LAU-FINAL-219, #3231) — la relation personne↔entreprise DÉCLARÉE
pilote le MESSAGE via ``relationship_playbook.message_directive_block``.

Ce fichier verrouille le fil bout-à-bout `contact dict → build_user_prompt` :
`message_directive_block` lui-même (le calcul pur) est couvert dans
`test_relationship_playbook.py` ; ici, l'APPELANT réel — sans lui, le calcul
serait juste, testé, et jamais atteint (le motif qui revient dans ce dépôt).
"""

from __future__ import annotations

from app.prompts.bellum_outreach import build_user_prompt

_CONTACT = {"full_name": "Bernard Petit", "title": "DSI"}
_PROFILE: dict = {}


def _user_prompt(contact: dict) -> str:
    return build_user_prompt(
        contact=contact,
        raw_analysis={},
        profile=_PROFILE,
        recent_signals=None,
        channel="email",
        context="",
        company_name="Société Générale",
    )


def test_sans_relation_declaree_le_prompt_est_inchange() -> None:
    """Ni la colonne (appelant d'avant ce lot), ni une valeur déclarée : le
    prompt reste identique à avant ce paramètre — c'est `unknown_relationship`,
    qui n'ajoute aucune ligne."""
    prompt = _user_prompt(_CONTACT)
    assert "RELATION PERSONNE" not in prompt


def test_une_valeur_hors_vocabulaire_n_ajoute_rien() -> None:
    """`classify_person_company_relation` retombe sur `unknown_relationship`
    pour tout ce qui n'est pas une des treize valeurs — jamais un rapprochement
    par ressemblance."""
    prompt = _user_prompt({**_CONTACT, "declared_person_company_relation": "ancien collègue"})
    assert "RELATION PERSONNE" not in prompt


def test_ex_salarie_declare_ajoute_la_prudence_au_prompt() -> None:
    prompt = _user_prompt({**_CONTACT, "declared_person_company_relation": "employee_former"})
    assert "RELATION PERSONNE↔ENTREPRISE" in prompt
    assert "n'est plus salariée" in prompt


def test_presente_seulement_declare_ajoute_la_prudence_au_prompt() -> None:
    prompt = _user_prompt({**_CONTACT, "declared_person_company_relation": "consultant_presented"})
    assert "ne l'affirme jamais comme un fait" in prompt


def test_employe_actuel_declare_n_ajoute_rien() -> None:
    """`employee_current` est déclaré et VALIDE, mais sans prise sur le texte
    du message (voir `relationship_playbook._PERSON_RELATION_CAUTION`) : le
    corps de l'issue #3213 ne demande de prudence que pour les quatre valeurs
    « passé/non prouvé/en mission »."""
    prompt = _user_prompt({**_CONTACT, "declared_person_company_relation": "employee_current"})
    assert "RELATION PERSONNE" not in prompt
