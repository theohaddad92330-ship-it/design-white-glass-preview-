"""Le bloc de prompt de la politique de désaccord commercial (#3180,
LAU-FINAL-186).

Toujours présent dans le prompt `/chat` (contrairement à
`cold_account_playbook_block`, qui n'existe que pour un compte froid précis) :
le DROIT et le DEVOIR de challenger une mauvaise prémisse commerciale sont une
posture générale de Laura, pas une réaction à UN compte. Quatre détecteurs
déterministes (`commercial_challenge.py` ; deux ajoutés #3243, reste de
#186.10) alimentent en plus ce bloc avec un challenge CONCRET quand l'un des
quatre cas mesurés se présente sur CE tour — additif, jamais un remplacement
de la posture générale.
"""

from __future__ import annotations

from typing import Any, Mapping

from app.prompts.forbidden_phrasings import (
    COPILOT_CHALLENGE_FORBIDDEN_BEHAVIOURS,
    COPILOT_CHALLENGE_FORBIDDEN_PHRASINGS,
    quoted_fr,
)
from app.services.commercial_challenge import (
    STRENGTH_DEFINITIONS,
    Challenge,
    detect_closed_for_access_level,
    detect_declared_exclusion,
    detect_geographic_overreach,
    detect_recruitment_only_need,
    detect_saturated_account,
    detect_stale_signals,
    detect_departed_contact,
    detect_generic_mass_message,
    detect_mass_cold_submissions,
    detect_partner_prospected_as_client,
    detect_subsidiary_out_of_perimeter,
    detect_too_senior_contact,
    detect_unsuitable_account,
)

#: La forme du challenge (section FORME DU CHALLENGE du retour), dans l'ordre
#: exact demandé — jamais réordonnée.
_CHALLENGE_FORM_STEPS: tuple[str, ...] = (
    "Répondre directement à la demande",
    "Nommer le problème",
    "Expliquer son impact concret",
    "Proposer la meilleure option",
    "Laisser la possibilité de continuer",
)


def commercial_challenge_policy_block() -> str:
    """La posture GÉNÉRALE — toujours rendue, jamais conditionnée à un compte.

    Cite les interdits PARTAGÉS (`COPILOT_CHALLENGE_FORBIDDEN_PHRASINGS` /
    `_BEHAVIOURS`) plutôt que de les retaper (GA-26).

    #3243 (#186.10, lot R25) — « message trop agressif ou trop générique »
    reste NON DÉTECTÉ comme signal par compte (`CHALLENGE_CASES`,
    ``commercial_challenge.py`` : le CORPS d'un message ne sort jamais vers
    le modèle ni vers un humain, doctrine CLAUDE.md § « ce qu'on ne collecte
    pas » — aucune fonction ne peut honnêtement mesurer un texte déjà
    rédigé). Mais la DEMANDE elle-même — « écris-lui un truc agressif/
    méchant/menaçant » — est le tour de conversation COURANT que le modèle
    lit déjà directement, sans donnée tierce à collecter : ce n'est donc pas
    un détecteur de plus, c'est une POSTURE PERMANENTE, écrite ici une fois
    pour toutes (même patron que ``_BLOCK_NEVER_REFUSE_IN_BLOCK`` côté
    ``bellum_advisor.py`` : un refus porte sur LA PARTIE problématique de la
    demande, jamais sur l'ensemble)."""
    steps = " → ".join(f"{i}. {step}" for i, step in enumerate(_CHALLENGE_FORM_STEPS, start=1))
    strengths = " ".join(f"{level} ({definition})" for level, definition in STRENGTH_DEFINITIONS.items())
    return (
        "\n\nPOLITIQUE DE DÉSACCORD COMMERCIAL — tu as le DROIT et le DEVOIR de contredire une "
        "demande qui repose sur une mauvaise prémisse commerciale (compte trop fermé pour l'accès "
        "actuel, interlocuteur trop haut, besoin supposé à partir d'un recrutement, message trop "
        "agressif ou générique, filiale hors périmètre, signal trop ancien, compte saturé, "
        "recherche excessivement large, action dont le coût dépasse la valeur probable). Tu "
        "n'es NI un assistant docile NI un coach moralisateur : protège le temps commercial, les "
        "l'usage, la réputation, les données, la relation client et la cohérence de la stratégie.\n"
        f"Forme du challenge, DANS CET ORDRE : {steps}.\n"
        f"JAMAIS : {quoted_fr(COPILOT_CHALLENGE_FORBIDDEN_PHRASINGS)}, ni {', '.join(COPILOT_CHALLENGE_FORBIDDEN_BEHAVIOURS)}.\n"
        # #3855 (BEL-LAU-1008-004, recette prod 08/10, 2e passe) — « Après avoir
        # expliqué son désaccord, Laura doit pouvoir exécuter le choix maintenu
        # par l'utilisateur dans les limites applicables. » Le volet 2 de la
        # recette montrait le trou : un « fais-le quand même » suivi d'un
        # second refus, puis d'une question sur ce qui venait d'être tranché.
        "APRÈS le challenge, si l'utilisateur maintient explicitement son choix (« fais-le quand "
        "même », un oui à l'alternative que tu viens de proposer, ou toute confirmation équivalente), "
        "tu EXÉCUTES — tu ne redis pas le même désaccord, tu ne refuses pas et tu ne reposes pas une "
        "question sur ce qu'il vient de trancher. Si une information encore manquante te bloque "
        "réellement (ex. aucun destinataire dont la fiche est lue), CHERCHE-la d'abord avec l'outil "
        "approprié (`get_account_contacts`, `search_workspace_contacts`) avant de conclure ; si elle "
        "manque toujours, NOMME cette limite précise et avance avec la meilleure option disponible, "
        "au lieu de t'arrêter.\n"
        f"Trois niveaux, TOUJOURS nommé et traçable : {strengths}\n"
        "MESSAGE AGRESSIF OU INSULTANT, DEMANDÉ EXPLICITEMENT : tu REFUSES d'écrire CE ton précis "
        "(pas la demande entière) et tu nommes la raison — un message délibérément agressif ou "
        "insultant risque la relation avec ce compte de façon potentiellement irréversible, et "
        "nuit à la réputation de l'ESN. Tu proposes dans le même tour une alternative ferme mais "
        "professionnelle (directe, sans détour, sans agressivité) ; tu n'attends pas que la "
        "personne insiste pour la préparer.\n"
        # #3243 (recette prod 02/10, CAPGEMINI) : elle proposait un contact puis
        # disait n'avoir aucune fiche de lui, sans nommer le challenge.
        "Un challenge actif (bloc « CHALLENGE(S) ACTIF(S) » ci-dessous, ou `commercial_challenges` dans "
        "le résultat d'un outil de compte comme `get_account_contacts`) s'énonce AVANT toute précision "
        "demandée : il ouvre la réponse, puis seulement `offer_reply_options` pour la suite.\n"
        # #3243 (r40, ARCHI LOGICIEL) — « prépare une action » sans geste nommé : elle redemandait « Quel geste ? ».
        "« PRÉPARE UNE ACTION » SUR UN COMPTE, SANS GESTE NOMMÉ : tu PRÉPARES directement le geste par défaut — "
        "un premier message au contact le plus pertinent (`prepare_message_for_contact` après lecture de "
        "`get_account_contacts`) — en le NOMMANT dans ta réponse (« je prépare un message à X »). Tu ne demandes "
        "jamais « Quel geste ? » ; le challenge actif (ex. signal archivé) ouvre la réponse, puis tu prépares "
        "quand même, en disant ce qui reste à confirmer.\n"
        "PERSONNE PROPOSÉE = FICHE LUE : tu ne proposes (en option, en destinataire, en canal) que "
        "quelqu'un dont la fiche est devant toi — CONTACTS CLÉS ou résultat de `get_account_contacts`. "
        "Sans fiche lue, tu ne le proposes pas ; et jamais « aucune fiche » sur une personne que tu "
        "viens de proposer : si elle t'échappe, tu le dis et tu retires la proposition."
    )


def active_challenges_block(
    *,
    department: str | None = None,
    profile: Mapping[str, Any] | None = None,
    analysis: Mapping[str, Any] | None = None,
    company_name: str | None = None,
    contacts_summary: str | None = None,
    account_data: Mapping[str, Any] | None = None,
    request_text: str | None = None,
) -> str:
    """Les challenges CONCRETS détectés sur CE tour — "" si aucun (additif,
    même contrat que `cold_account_playbook_block`)."""
    fired: list[Challenge] = [
        c
        for c in (
            detect_geographic_overreach(department=department, profile=profile),
            detect_saturated_account(analysis),
            # #3243 (reste de #186.10) — mêmes signaux déjà lus par les axes
            # `accessibility`/`signal` d'`account_score_axes.py` (GA-26).
            detect_closed_for_access_level(analysis, profile),
            detect_recruitment_only_need(analysis),
            # #3243/#3242 (30/09) — exclusions déclarées, signal périmé, et le
            # verdict d'aptitude consulté à CHAQUE tour portant un compte.
            detect_declared_exclusion(company_name, profile),
            detect_stale_signals(analysis),
            detect_unsuitable_account(analysis, profile, company=company_name),
            # #3243 (#186.9) — une personne NOMMÉE et partie du compte.
            detect_departed_contact(contacts_summary),
            # #3243 (#186.10) — la personne NOMMÉE est de direction générale / gouvernance.
            detect_too_senior_contact(contacts_summary),
            # #3243 (#186.9) — un compte dont l'archétype est un partenaire potentiel.
            detect_partner_prospected_as_client(account_data, company=company_name),
            # #3243 (#186.10, lot M09) — la DEMANDE du tour : un message identique
            # pour plusieurs personnes (jamais le corps d'un message rédigé).
            detect_generic_mass_message(request_text),
            # #3243.2/.3 (Louis 10/10) — filiale hors des zones du profil ; envoi de masse de CV à froid.
            detect_subsidiary_out_of_perimeter(analysis, profile),
            detect_mass_cold_submissions(request_text),
        )
        if c is not None
    ]
    if not fired:
        return ""
    lines = [
        f"- [{c['strength']}] {c['case']} — {c['problem']} {c['impact']} Alternative : {c['alternative']}"
        for c in fired
    ]
    return "\n\nCHALLENGE(S) ACTIF(S) SUR CE TOUR (fais-le AVANT de répondre, jamais après) :" + "".join(
        f"\n{line}" for line in lines
    )
