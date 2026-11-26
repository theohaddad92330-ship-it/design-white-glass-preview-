"""#3190 (LAU-FINAL-196, « PRE-RESPONSE COMMERCIAL VERIFIER ») — la tranche
LIVRABLE de ce lot, prouvée en la cassant (même discipline que
``chat_content_guards``) : le vérificateur SAIT DIRE NON sur un texte fautif
fabriqué, pas seulement l'absence de faute sur un texte déjà correct.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
La spec demande un contrôle avant de RENDRE la réponse, avec un pouvoir de
RÉPARATION (retirer une affirmation, raccourcir, déclencher une alternative).
``chat_orchestrator`` diffuse déjà le texte au fil de l'eau (``emit`` : les
évènements ``delta`` partent PENDANT que le modèle écrit) — au moment où ce
vérificateur tourne (même place que ``_self_check``, fin du tour), le texte a
DÉJÀ été affiché. Réparer ce qui est déjà affiché demanderait de bufferiser
CHAQUE tour avant diffusion — un changement d'architecture (latence perçue),
hors de cette tranche. Tranché sans Louis : ce vérificateur rend un VERDICT
observé (``pass``/``repair``), jamais une réécriture — exactement la
discipline déjà choisie pour ``chat_content_guards`` (« mesurer avant de
pouvoir bloquer »). ``block`` et les catégories qui exigent un jugement
sémantique (INTENTION, PERSONNALISATION, STRATÉGIE, SCOPE) restent hors de
cette tranche — voir l'épopée.

Seules deux catégories de la checklist sont déterministes ET déjà nourries
par des données qui existent réellement dans ce tour (pas de paramètre neuf
qu'aucun appelant ne remplirait) :
 - VÉRITÉ : une affirmation non supportée existe-t-elle ? (réutilise
   ``chat_turn_plan.unverified_figures``, déjà câblé).
 - STYLE : la réponse ressemble-t-elle à un template d'IA ? (réutilise
   ``forbidden_phrasings.COPILOT_FORBIDDEN_PHRASINGS``, même catalogue que le
   prompt, GA-26).
"""

from __future__ import annotations

import pytest

from app.services.commercial_verifier import (
    ACTION_DECLARED_WITHOUT_PROOF,
    ARTIFICIAL_LIST,
    MARKET_OBSERVATION_AS_CURRENT,
    PROMISES_UNCONNECTED_CAPABILITY,
    RESPONSE_DENSITY_MISMATCH,
    RESPONSE_TOO_LONG,
    UNNECESSARY_HEADER,
    VerifierResult,
    verify_response,
)

# ── 1. Le verdict PASS — rien à répARER ──────────────────────────────────────


def test_pass_on_a_grounded_reply_with_no_template_style():
    result = verify_response("Le compte Thales a trois contacts actifs, dont un DSI.", tool_outputs=['{"count": 3}'])
    assert result == VerifierResult(status="pass", repair_reasons=[])


def test_pass_on_an_empty_reply():
    result = verify_response("", tool_outputs=[])
    assert result.status == "pass"
    assert result.repair_reasons == []


# ── 2. VÉRITÉ — affirmation non supportée ───────────────────────────────────


def test_repair_on_an_unsupported_figure():
    result = verify_response("Il reste 37 relances à faire.", tool_outputs=['{"count": 3}'])
    assert result.status == "repair"
    assert "affirmation_non_supportee" in result.repair_reasons


def test_pass_when_the_figure_is_grounded_in_a_tool_output():
    # Témoin voisin : le même chiffre, mais rendu par un outil de ce tour.
    result = verify_response("Il reste 3 relances à faire.", tool_outputs=['{"count": 3}'])
    assert result.status == "pass"


# ── 3. STYLE — la réponse ressemble à un template d'IA ──────────────────────


def test_repair_on_an_ai_template_phrasing():
    result = verify_response("Voici une analyse exhaustive du compte Airbus.", tool_outputs=[])
    assert result.status == "repair"
    assert "style_template_ia" in result.repair_reasons


def test_pass_on_the_legitimate_neighbour_of_the_template_phrasing():
    # Témoin voisin (même paire que test_forbidden_phrasings.BANS) : la
    # phrase légitime la plus proche ne doit pas déclencher.
    result = verify_response("Voici l'analyse du compte Airbus, en trois points.", tool_outputs=[])
    assert result.status == "pass"


# ── 4. Les deux motifs peuvent se cumuler ───────────────────────────────────


def test_repair_reasons_accumulate_without_duplicating():
    result = verify_response(
        "Voici une analyse exhaustive : il reste 37 relances à faire.", tool_outputs=['{"count": 3}']
    )
    assert result.status == "repair"
    assert set(result.repair_reasons) == {"affirmation_non_supportee", "style_template_ia"}
    # Un seul motif par catégorie, même si plusieurs chiffres manquent.
    assert result.repair_reasons.count("style_template_ia") == 1


# ── 5. VÉRITÉ (épopée #3241, #3190.9 reste) — un envoi prétendu ACHEVÉ ──────


def test_repair_when_the_reply_claims_a_message_was_sent():
    # Doctrine c67 : « Fait » ne porte jamais de preuve d'envoi — Laura
    # prépare, elle n'envoie jamais (#2391).
    result = verify_response("C'est fait, message envoyé à Julien.", tool_outputs=[])
    assert result.status == "repair"
    assert ACTION_DECLARED_WITHOUT_PROOF in result.repair_reasons


def test_repair_when_the_reply_claims_an_email_just_left():
    result = verify_response("Le mail est parti à l'instant.", tool_outputs=[])
    assert result.status == "repair"
    assert ACTION_DECLARED_WITHOUT_PROOF in result.repair_reasons


def test_pass_on_the_legitimate_neighbour_of_a_send_claim():
    # Témoin voisin : PROPOSER un envoi, ou le partager pour relecture, n'est
    # pas prétendre qu'il a été mené à bien.
    result = verify_response("Je te propose ce message, dis-moi si je l'envoie.", tool_outputs=[])
    assert result.status == "pass"


# ── 6. STYLE (épopée #3241, #3190.10 reste) — une réponse trop longue ──────


def test_repair_on_a_reply_that_overflows_the_chat_bubble_width():
    # Tranché sans Louis : seuil ancré sur D81/GA-34 (70ch) — voir le module.
    result = verify_response("x" * 1401, tool_outputs=[])
    assert result.status == "repair"
    assert RESPONSE_TOO_LONG in result.repair_reasons


def test_pass_on_a_reply_right_at_the_threshold():
    result = verify_response("x" * 1400, tool_outputs=[])
    assert result.status == "pass"


# ── 7. ACTION (épopée #3241, #3190.11 reste, volet RÉALISTE) ───────────────
# Une promesse de texte sur une capacité NON connectée — l'outil est déjà
# retiré du catalogue (`chat_tools.tools_for`), rien n'empêchait la PROMESSE.


def test_repair_when_the_reply_promises_a_crm_export_without_crm_connected():
    result = verify_response("Je l'exporte vers ton CRM dès maintenant.", connected_families=["email"])
    assert result.status == "repair"
    assert PROMISES_UNCONNECTED_CAPABILITY in result.repair_reasons


def test_repair_when_the_reply_promises_a_calendar_reminder_without_calendar_connected():
    result = verify_response("Je te mets un rappel dans ton agenda demain.", connected_families=["crm"])
    assert result.status == "repair"
    assert PROMISES_UNCONNECTED_CAPABILITY in result.repair_reasons


def test_pass_when_the_promised_capability_is_actually_connected():
    result = verify_response("Je l'exporte vers ton CRM dès maintenant.", connected_families=["crm"])
    assert result.status == "pass"


def test_pass_on_the_legitimate_neighbour_of_a_capability_promise():
    # PROPOSER (une question), jamais PROMETTRE (un engagement) — même
    # discipline que le témoin voisin d'un envoi prétendu ci-dessus.
    result = verify_response(
        "Je peux te proposer d'exporter ce contact vers ton CRM si tu le souhaites.",
        connected_families=["email"],
    )
    assert result.status == "pass"


def test_promise_check_is_a_strict_no_op_without_connected_families():
    """``None`` (le défaut) : « on ne sait pas » ne déclenche jamais un repair
    — même repli sûr que ``chat_tools.tools_for``/``missing_capabilities``."""
    result = verify_response("Je l'exporte vers ton CRM dès maintenant.")
    assert result.status == "pass"


# ── 8. #3192 (LAU-FINAL-198) — densité de réponse incohérente avec la question ──


def test_repair_on_a_mini_report_for_a_micro_question():
    result = verify_response("x" * 400, user_message="SG prend des consultants ?")
    assert result.status == "repair"
    assert RESPONSE_DENSITY_MISMATCH in result.repair_reasons


def test_pass_on_a_short_reply_to_a_micro_question():
    result = verify_response("Oui, trois missions en cours chez SG.", user_message="SG prend des consultants ?")
    assert result.status == "pass"


def test_density_check_is_a_strict_no_op_without_a_user_message():
    """``None`` (le défaut) : « on ne sait pas » ne déclenche jamais un repair
    — même repli sûr que ``test_promise_check_is_a_strict_no_op_without_connected_families``."""
    result = verify_response("x" * 400)
    assert result.status == "pass"


# ── 9. STYLE (épopée #3241, #3190.10 reste) — la FORME, pas la longueur ────
# « titres nécessaires, listes artificielles » : un jugement sur la structure
# markdown, mesurable sans appel de modèle (même discipline que
# RESPONSE_TOO_LONG : une mesure de forme, jamais un jugement de fond).


def test_repair_on_a_header_in_a_short_reply():
    result = verify_response("## Résumé\nTrois contacts actifs chez Thales.", tool_outputs=[])
    assert result.status == "repair"
    assert UNNECESSARY_HEADER in result.repair_reasons


def test_pass_on_a_header_in_a_long_reply():
    # Témoin voisin : le même titre, mais dans une réponse assez longue pour
    # justifier un sectionnement (même borne D81/GA-34 que RESPONSE_TOO_LONG).
    body = "Trois contacts actifs chez Thales. " * 25
    result = verify_response(f"## Résumé\n{body}", tool_outputs=[])
    assert UNNECESSARY_HEADER not in result.repair_reasons


def test_pass_on_a_short_reply_without_a_header():
    result = verify_response("Trois contacts actifs chez Thales.", tool_outputs=[])
    assert result.status == "pass"


def test_repair_on_an_artificial_two_item_list():
    result = verify_response("- Appelle Julien\n- Relance Marc", tool_outputs=[])
    assert result.status == "repair"
    assert ARTIFICIAL_LIST in result.repair_reasons


def test_pass_on_a_longer_list_of_short_items():
    # Témoin voisin : au-delà de deux éléments, la liste organise une
    # vraie énumération plutôt que de fragmenter une phrase.
    result = verify_response("- Appelle Julien\n- Relance Marc\n- Prépare le devis", tool_outputs=[])
    assert ARTIFICIAL_LIST not in result.repair_reasons


def test_pass_on_a_two_item_list_of_substantial_items():
    # Témoin voisin : deux éléments, mais chacun assez développé pour que la
    # liste ne soit pas un simple découpage artificiel d'une phrase.
    result = verify_response(
        "- Relance Julien sur le devis envoyé la semaine dernière, il n'a pas répondu\n"
        "- Prépare un point avec Marc sur le renouvellement du contrat cadre",
        tool_outputs=[],
    )
    assert ARTIFICIAL_LIST not in result.repair_reasons


def test_verifier_result_is_immutable():
    result = VerifierResult(status="pass", repair_reasons=[])
    try:
        result.status = "repair"  # type: ignore[misc]
    except AttributeError:
        pass
    else:
        raise AssertionError("VerifierResult devrait être un dataclass FROZEN")


# ── #3436.2 (lot Q06) — une observation de marché n'est jamais présentée comme
# une pratique ACTUELLE : le catalogue fermé que le prompt bannit, mesuré sur
# la réponse (verdict observé, comme les autres motifs).


@pytest.mark.parametrize(
    "claim",
    [
        "Devoteam recrute des freelances en ce moment.",
        "Cette entreprise recrute actuellement des freelances sur ce périmètre.",
        "Ils externalisent actuellement leur run.",
        "Java est leur stack officielle.",
        "Sopra est leur fournisseur en place.",
        "Le budget est confirmé pour le T4.",
        "Claire Martin est le décideur final.",
        "Ils acceptent d'être en rang 2 chez Capgemini.",
    ],
)
def test_repair_when_a_market_observation_is_stated_as_a_current_practice(claim):
    result = verify_response(claim)
    assert result.status == "repair"
    assert MARKET_OBSERVATION_AS_CURRENT in result.repair_reasons


def test_pass_when_the_observation_is_named_as_an_observation():
    text = (
        "Bellum a observé des missions freelance chez Devoteam par le passé ; "
        "je ne peux pas dire qu'ils recrutent des freelances aujourd'hui."
    )
    assert verify_response(text).status == "pass"


def test_pass_when_the_claim_is_negated():
    assert verify_response("Rien ne prouve que Java soit leur stack officielle.").status == "pass"
    assert verify_response("Ils ne recrutent pas des freelances à ma connaissance.").status == "pass"
