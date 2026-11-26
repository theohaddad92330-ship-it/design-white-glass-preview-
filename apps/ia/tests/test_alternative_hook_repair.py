"""#3419 (recette prod nuit 08→09/10) — « Autres accroches » réécrivait le message
ENTIER (≠ « seule l'ouverture change ») et laissait des placeholders bruts
« [Prénom] [fonction] [coordonnées] » dans le texte envoyé. Ce fichier tient les deux
réparations déterministes, jamais un second appel de modèle."""

from __future__ import annotations

from app.services.alternative_hook_repair import enforce_only_opening_changed, resolve_placeholders


def test_only_the_first_paragraph_of_the_model_survives() -> None:
    current = "Bonjour Olivier,\n\nVotre levée récente.\n\nUn mot sur l'audit SRE."
    rewritten_everything = "Salut,\n\nJ'ai tout changé.\n\nEt ça aussi."
    out = enforce_only_opening_changed(rewritten_everything, current)
    assert out == "Salut,\n\nVotre levée récente.\n\nUn mot sur l'audit SRE."


def test_a_current_body_with_a_single_paragraph_keeps_only_the_new_opening() -> None:
    assert enforce_only_opening_changed("Nouvelle ouverture.", "Ancienne ouverture.") == "Nouvelle ouverture."


def test_an_empty_model_opening_keeps_the_original_untouched() -> None:
    current = "Bonjour,\n\nAccroche.\n\nSuite."
    assert enforce_only_opening_changed("", current) == current
    assert enforce_only_opening_changed("   \n\nautre chose", current) == current


def test_known_placeholders_become_the_real_contact_values() -> None:
    body = "Bonjour [Prénom],\n\nEn tant que [fonction], contactez-moi via [coordonnées]."
    out = resolve_placeholders(body, first_name="Julie", role="DSI", email="julie@acme.example", phone="0102030405")
    assert out == "Bonjour Julie,\n\nEn tant que DSI, contactez-moi via julie@acme.example, 0102030405."


def test_a_placeholder_without_a_known_value_disappears_never_raw() -> None:
    body = "Bonjour [Prénom], en tant que [fonction] vous savez que [coordonnées] restent à confirmer."
    out = resolve_placeholders(body, first_name=None, role=None, email=None, phone=None)
    assert "[" not in out and "]" not in out
    assert out == "Bonjour, en tant que vous savez que restent à confirmer."


def test_an_unrecognized_bracket_token_is_stripped_never_guessed() -> None:
    assert resolve_placeholders("Votre [secteur] nous intéresse.", first_name=None, role=None, email=None, phone=None) == (
        "Votre nous intéresse."
    )


def test_only_phone_known_is_still_used_for_contact_info() -> None:
    out = resolve_placeholders("Appelez-moi : [coordonnées].", first_name=None, role=None, email=None, phone="0102030405")
    assert out == "Appelez-moi : 0102030405."
