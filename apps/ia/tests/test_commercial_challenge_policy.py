"""#3180 / #3243 — le bloc de prompt qui rend les challenges CONCRETS d'un
tour, `active_challenges_block`. Aucun test ne couvrait ce module avant cette
tranche (#3243, reste de #186.10) : les quatre détecteurs de
`commercial_challenge.py` sont testés isolément, mais rien ne prouvait qu'ils
sont réellement APPELÉS depuis le bloc de prompt que `bellum_advisor.py`
concatène à chaque tour — exactement le motif que `CLAUDE.md` nomme : « du
code juste, calculé, testé, que personne n'appelle ».
"""

from __future__ import annotations

from app.prompts.commercial_challenge_policy import active_challenges_block, commercial_challenge_policy_block


def test_no_challenge_renders_an_empty_string():
    assert active_challenges_block(department=None, profile=None, analysis=None) == ""


def test_the_geographic_overreach_detector_fires_through_the_block():
    block = active_challenges_block(
        department=None, profile={"geo_zones": ["Lyon & Auvergne-Rhône-Alpes"]}, analysis=None
    )
    assert "recherche excessivement large" in block


def test_the_saturated_account_detector_fires_through_the_block():
    block = active_challenges_block(analysis={"competitorsPresent": ["a", "b", "c"]})
    assert "compte déjà fortement saturé" in block


def test_the_closed_for_access_level_detector_fires_through_the_block():
    block = active_challenges_block(analysis={"contacts": []})
    assert "compte trop fermé pour le niveau d'accès actuel" in block


def test_the_recruitment_only_need_detector_fires_through_the_block():
    block = active_challenges_block(analysis={"itJobSignals": ["Dev backend"]})
    assert "besoin supposé à partir d'un simple recrutement CDI" in block


def test_several_challenges_can_fire_on_the_same_turn_none_silently_dropped():
    block = active_challenges_block(
        profile={"geo_zones": ["Lyon & Auvergne-Rhône-Alpes"]},
        analysis={"competitorsPresent": ["a", "b", "c"], "contacts": []},
    )
    assert "recherche excessivement large" in block
    assert "compte déjà fortement saturé" in block
    assert "compte trop fermé pour le niveau d'accès actuel" in block


def test_every_active_line_names_its_strength_never_untyped():
    block = active_challenges_block(analysis={"contacts": []})
    assert "[firm]" in block


def test_the_general_posture_block_is_always_present_independent_of_any_account():
    assert "POLITIQUE DE DÉSACCORD COMMERCIAL" in commercial_challenge_policy_block()


def test_un_ton_agressif_ou_insultant_demande_explicitement_est_refuse_avec_sa_raison():
    """#3243 (#186.10, lot R25) — pas un détecteur de plus (le CORPS d'un
    message ne sort jamais vers le modèle), une POSTURE PERMANENTE : la
    demande elle-même est le tour de conversation courant, déjà lu."""
    block = commercial_challenge_policy_block()
    assert "MESSAGE AGRESSIF OU INSULTANT" in block
    assert "REFUSES" in block
    assert "irréversible" in block
    assert "alternative ferme" in block


def test_the_general_posture_block_bans_flattery_and_artificial_pressure():
    # #3855 (BEL-LAU-1008-004) — section INTERDIT du retour : « Flatterie
    # automatique, "excellente idée" sans analyse, jugement personnel,
    # pression artificielle ou certitude sur un référencement non vérifié. »
    # Jugement personnel et certitude non vérifiée étaient déjà bannis
    # (VALUE_JUDGMENT, CHALLENGE_ON_UNVERIFIED_DATA) ; flatterie et pression
    # artificielle ne l'étaient pas ENCORE sous ce nom dans ce panier-ci.
    block = commercial_challenge_policy_block()
    assert "flatterie automatique" in block
    assert "pression artificielle" in block


def test_the_general_posture_block_tells_laura_to_execute_a_maintained_choice():
    # #3855 volet 2 (recette prod 08/10, 2e passe) — « Fais-le quand même »
    # produisait ENCORE un refus, puis une question sur ce qui venait d'être
    # tranché. La politique doit dire explicitement d'exécuter, de chercher
    # l'information manquante avant de conclure, et de nommer la limite
    # réelle plutôt que de s'arrêter.
    block = commercial_challenge_policy_block()
    assert "choix maintenu ignoré" in block
    assert "tu EXÉCUTES" in block
    assert "tu ne refuses pas et tu ne reposes pas une question" in block
    assert "get_account_contacts" in block


def test_declared_exclusion_fires_through_the_block_with_the_company_name():
    block = active_challenges_block(
        profile={"noGoSectors": ["Assurance & Mutuelles"]}, analysis=None, company_name="AXA Assurances"
    )
    assert "demande contraire aux exclusions du profil" in block


def test_stale_signals_fire_through_the_block():
    block = active_challenges_block(analysis={"recentSignals": [{"freshness": "archive"}]})
    assert "signal trop ancien" in block


def test_the_suitability_verdict_is_consulted_on_every_turn_about_an_opened_account():
    block = active_challenges_block(analysis={"contacts": []}, company_name="Acme")
    assert "compte pas encore une cible" in block
    assert "Acme" in block


def test_the_real_chat_prompt_carries_the_challenges_of_the_opened_account():
    """Rejeu du tour (#3242/#3243) : profil avec exclusion déclarée + compte
    ouvert sans contact, à travers `build_system_prompt` — le point d'entrée
    réel de /chat, pas le bloc isolé."""
    from app.prompts.bellum_advisor import build_system_prompt

    prompt = build_system_prompt(
        {"noGoSectors": ["Assurance & Mutuelles"]},
        {
            "company_name": "AXA Assurances",
            "raw_analysis": {"contacts": [], "recentSignals": [{"freshness": "archive"}]},
        },
        "",
        "",
    )
    assert "CHALLENGE(S) ACTIF(S) SUR CE TOUR" in prompt
    assert "demande contraire aux exclusions du profil" in prompt
    assert "signal trop ancien" in prompt
    assert "compte pas encore une cible" in prompt


def test_the_departed_contact_detector_fires_through_the_block_when_the_named_contact_left():
    block = active_challenges_block(
        contacts_summary="Sarah Martin - DSI - economic - parti de l’entreprise - contact_id: c-1"
    )
    assert "contacter une personne partie" in block
    assert "Sarah Martin" in block
    assert "AVANT de répondre" in block


def test_no_departed_contact_in_the_summary_adds_nothing():
    assert active_challenges_block(contacts_summary="Paul Roy - RSSI - technical - contact_id: c-2") == ""


def test_replayed_turn_the_advisor_prompt_carries_the_departed_contact_challenge():
    """Rejeu du tour « écris à Sarah Martin » sur un contact `historique` :
    l'API marque la ligne, le prompt de Laura porte le challenge AVANT sa réponse."""
    from app.prompts.bellum_advisor import build_system_prompt

    summary = "Sarah Martin - DSI - economic - parti de l’entreprise - contact_id: c-1"
    prompt = build_system_prompt({}, {"company_name": "TF1"}, summary, "")
    assert "CHALLENGE(S) ACTIF(S) SUR CE TOUR" in prompt
    assert "contacter une personne partie" in prompt
    assert "Sarah Martin a quitté l'entreprise" in prompt
    # Sans le marqueur, aucun challenge de ce cas.
    clean = build_system_prompt({}, {"company_name": "TF1"}, "Sarah Martin - DSI - economic - contact_id: c-1", "")
    assert "a quitté l'entreprise" not in clean


def test_partner_prospected_as_client_fires_through_the_block_and_the_advisor_prompt():
    from app.prompts.bellum_advisor import build_system_prompt

    block = active_challenges_block(account_data={"actorType": "ESN"}, company_name="Alten")
    assert "prospecter un partenaire existant comme un client" in block
    assert "AVANT de répondre" in block
    prompt = build_system_prompt({}, {"company_name": "Alten", "actorType": "ESN"}, "", "")
    assert "prospecter un partenaire existant comme un client" in prompt
    clean = build_system_prompt({}, {"company_name": "TF1", "actorType": "client final"}, "", "")
    assert "prospecter un partenaire existant comme un client" not in clean


# --- #3243 / recette prod 02/10 (Y17) : CAPGEMINI, /chat -----------------------
# Cause : /chat reçoit la LIGNE de compte (`actor_type`, snake_case, colonne
# #2265.14) ; le détecteur ne lisait que `actorType` (le résultat Phase 1) —
# le challenge « partenaire prospecté comme client » ne partait donc jamais.

_CAPGEMINI_ROW = {"company_name": "CAPGEMINI", "actor_type": "ESN"}
_CAPGEMINI_CONTACTS = "Patrick Stelmaszyk - Directeur - economic - email: p.s@example.test - contact_id: c-ps"


def test_the_chat_account_row_shape_fires_the_partner_challenge():
    """Le rejeu de la recette : la ligne de compte telle que l'API la passe."""
    block = active_challenges_block(account_data=_CAPGEMINI_ROW, company_name="CAPGEMINI")
    assert "prospecter un partenaire existant comme un client" in block


def test_the_phase1_nested_shape_fires_too():
    block = active_challenges_block(account_data={"raw_analysis": {"actorType": "ESN"}}, company_name="X")
    assert "prospecter un partenaire existant comme un client" in block


def test_replayed_turn_capgemini_names_the_challenge_before_any_question_and_only_proposes_read_people():
    """Tour : « Prépare-moi un message de prospection pour ce compte » sur
    CAPGEMINI (ESN) avec Patrick Stelmaszyk en CONTACTS CLÉS. Le prompt doit
    (1) porter le challenge actif, (2) dire que le challenge précède toute
    précision demandée, (3) n'autoriser à proposer qu'une personne dont la
    fiche est devant Laura, (4) interdire « aucune fiche » sur quelqu'un
    qu'elle vient de proposer."""
    from app.prompts.bellum_advisor import build_system_prompt

    prompt = build_system_prompt({}, _CAPGEMINI_ROW, _CAPGEMINI_CONTACTS, "")
    assert "CHALLENGE(S) ACTIF(S) SUR CE TOUR" in prompt
    assert "approche partenariat" in prompt
    assert "Patrick Stelmaszyk" in prompt
    assert "AVANT toute précision demandée" in prompt
    assert "PERSONNE PROPOSÉE = FICHE LUE" in prompt
    assert "jamais « aucune fiche » sur une personne que tu viens de proposer" in prompt
    # Sans ESN, aucun challenge (sait dire NON).
    clean = build_system_prompt({}, {"company_name": "TF1", "actor_type": "client final"}, "", "")
    assert "prospecter un partenaire existant comme un client" not in clean


# --- #3243 / recette prod 02/10 (Y19) : « type d'acteur CAPGEMINI non vérifié » --
# Un compte analysé AVANT la colonne `actor_type` (#2265.14) arrive sans type
# d'acteur mais avec son NAF : le type se déduit alors du NAF par la MÊME
# fonction que la Phase 1 (`classify_actor_type`, GA-26) — jamais deviné du nom.


def test_row_without_actor_type_but_with_naf_still_fires_the_partner_challenge():
    row = {"company_name": "CAPGEMINI", "actor_type": None, "naf_code": "62.02A"}
    assert "prospecter un partenaire existant comme un client" in active_challenges_block(
        account_data=row, company_name="CAPGEMINI"
    )


def test_row_without_actor_type_and_a_client_naf_says_no():
    row = {"company_name": "TF1", "actor_type": None, "naf_code": "60.20A"}
    assert "prospecter un partenaire existant" not in active_challenges_block(account_data=row, company_name="TF1")


def test_row_without_actor_type_and_without_naf_says_no():
    assert "prospecter un partenaire existant" not in active_challenges_block(
        account_data={"company_name": "CAPGEMINI"}, company_name="CAPGEMINI"
    )


def test_the_too_senior_detector_fires_through_the_block_on_a_named_ceo():
    block = active_challenges_block(
        contacts_summary="Pierre Durand - Président-directeur général - economic - nommé dans le message - contact_id: c-1"
    )
    assert "interlocuteur beaucoup trop haut" in block
    assert "Pierre Durand" in block
    assert "AVANT de répondre" in block
