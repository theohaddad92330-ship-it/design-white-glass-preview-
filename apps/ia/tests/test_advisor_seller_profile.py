"""Le profil progressif modifie les conseils ET le ton du copilote (§12).

Le rapport pose ce critère d'acceptation : « le profil vient modifier ses
conseils et son ton ». Sans ces blocs, les 30 questions seraient de la capture
sans lecteur — le motif que ce produit a déjà fabriqué cinq fois.

Deux garanties tenues ici :
 1. un profil qui ne répond RIEN laisse le prompt byte-identique ;
 2. chaque réponse rendue est celle de l'utilisateur, jamais une paraphrase.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt


def _build(profile: dict) -> str:
    return build_system_prompt(
        profile_data=profile,
        account_data={"company_name": "TF1"},
        contacts_summary="",
        plan_summary="",
    )


BASE = {"esn_name": "Skaizen", "offers": ["Data"], "sectors": ["Médias"]}


def test_a_profile_without_the_questionnaire_leaves_the_prompt_untouched():
    assert _build(BASE) == _build({**BASE, "sellerRole": "", "sellerGoal": None, "salesBlockers": []})


def test_the_role_and_the_goal_reach_the_prompt():
    prompt = _build({**BASE, "sellerRole": "Business Manager", "sellerGoal": "Ouvrir de nouveaux comptes"})
    assert "Business Manager" in prompt
    assert "Ouvrir de nouveaux comptes" in prompt


def test_the_expected_proactivity_is_an_instruction_not_a_decoration():
    prompt = _build({**BASE, "proactivity": "Me suggérer des actions"})
    assert "Me suggérer des actions" in prompt
    # Le bloc doit être une CONSIGNE de comportement, pas une ligne de contexte
    # perdue au milieu du profil : on le vérifie par son intitulé.
    assert "NIVEAU D'ACCOMPAGNEMENT" in prompt


def test_the_blockers_tell_the_copilot_what_to_lift_first():
    prompt = _build({**BASE, "salesBlockers": ["Pas de réponse", "Référencement fermé"]})
    assert "Pas de réponse" in prompt
    assert "Référencement fermé" in prompt


def test_the_economics_frame_what_counts_as_an_opportunity():
    prompt = _build({**BASE, "dealSize": "30-75 k€", "targetMargin": "16-20 %", "rampUpCapacity": "1-2 semaines"})
    for value in ("30-75 k€", "16-20 %", "1-2 semaines"):
        assert value in prompt


def test_the_relationship_status_reaches_the_prompt():
    prompt = _build({**BASE, "accountsRelationshipStatus": "Client actif", "goToMarketChannels": ["Rang 2"]})
    assert "Client actif" in prompt
    assert "Rang 2" in prompt


# #1920.12 — l'ancienneté dans le poste, désormais mappée par `esnAnswersToProfileData`
# / `esn_row_to_profile_data`, doit encore atteindre le bloc LE COMMERCIAL À QUI
# TU PARLES : le mapping seul ne sert à rien si `bellum_advisor` ne le lit pas.
def test_the_role_tenure_reaches_the_prompt():
    prompt = _build({**BASE, "roleTenure": "2-5 ans"})
    assert "2-5 ans" in prompt


def test_role_tenure_absent_leaves_the_prompt_untouched():
    assert _build(BASE) == _build({**BASE, "roleTenure": ""})


# D9 — décision Louis 14/09/2026 : valider le contexte commercial. Laura cite
# le contexte comme validé : `profileContextValidatedAt` (ISO, posé côté
# résolveur SEULEMENT quand `profile_context_status === 'validated'` — voir
# `esn-profile-workspace.resolver.ts`) doit atteindre le prompt système.
def test_a_validated_context_is_cited_by_laura():
    prompt = _build({**BASE, "profileContextValidatedAt": "2026-09-10T08:00:00.000Z"})
    assert "validé" in prompt
    assert "2026-09-10" in prompt


def test_an_unvalidated_context_leaves_the_prompt_untouched():
    assert _build(BASE) == _build({**BASE, "profileContextValidatedAt": ""})


# #2033.9 / #2033.10 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
# DÉCLARÉ doit atteindre le prompt système RÉEL, pas seulement le module qui le
# compose (`test_laura_authority_scope.py`) : un bloc juste que personne
# n'appelle est le motif n°1 de ce dépôt.
def test_a_declined_authority_reaches_the_prompt_and_says_so():
    prompt = _build({**BASE, "staffingAuthority": "Je n'ai pas cette responsabilité"})
    assert "décider un staffing" in prompt
    assert "NE PROPOSE JAMAIS" in prompt


def test_an_undeclared_authority_leaves_the_prompt_untouched():
    assert _build(BASE) == _build({**BASE, "staffingAuthority": ""})


def test_deciding_alone_everywhere_leaves_the_prompt_untouched_too():
    """PIÈGE 1, porté jusqu'au prompt réel : déclarer tout décider seul ne
    fabrique ni bloc ni instruction supplémentaire — aucune élévation."""
    scope = {
        "recruitmentAccountsAuthority": "Je décide seul",
        "staffingAuthority": "Je décide seul",
        "marginBillingAuthority": "Je décide seul",
        "inviteAuthority": "Je décide seul",
    }
    assert _build(BASE) == _build({**BASE, **scope})


# #3386 (beta #3386, recette écran prod 26755bbac3, lot G04 30/09) — RESTE :
# « l'effet rôle × stade sur les réponses de Laura, non vérifié ». Le rôle
# (`sellerRole`) et le stade (`build_operating_context_block`, BEL-SC-222)
# étaient chacun testés en ISOLATION (`test_laura_operating_context.py`) mais
# jamais À TRAVERS le prompt système RÉEL — même motif que #2033.9 plus haut :
# un bloc juste que personne n'exerce bout en bout n'est pas une preuve.
def test_the_stage_and_structure_reach_the_real_prompt():
    prompt = _build({**BASE, "sellerRole": "Fondateur / CEO", "size": "3"})
    assert "STADE ET STRUCTURE" in prompt
    assert "Fondateur / CEO" in prompt
    assert "freelance / très petite structure" in prompt


def test_a_founder_solo_and_a_large_established_esn_get_materially_different_prompts():
    """DoD : DEUX profils commerciaux distincts, un fondateur solo et une
    grande ESN structurée, produisent des prompts système RÉELLEMENT
    différents — le stade change le PÉRIMÈTRE ET l'AMBITION cités, jamais le
    même « cette semaine » recopié (doc de `build_operating_context_block`)."""
    founder_solo = _build({**BASE, "sellerRole": "Fondateur / CEO", "size": "3"})
    large_established_team = _build(
        {**BASE, "sellerRole": "Directeur d'agence", "size": "220", "salesTeamSize": "12"}
    )

    assert founder_solo != large_established_team
    assert "freelance / très petite structure" in founder_solo
    assert "grande ESN" in large_established_team
    assert "une équipe commerciale de 5 personnes ou plus" not in founder_solo
    assert "une équipe commerciale de 5 personnes ou plus" in large_established_team


def test_without_a_declared_role_or_size_the_stage_block_is_absent():
    assert "STADE ET STRUCTURE" not in _build(BASE)


def test_changing_only_the_role_changes_the_prompt_and_nothing_else_of_the_stage():
    """#3386 — RESTE de la recette écran prod du 30/09 : « un cas de test qui
    CHANGE LE RÔLE et montre la différence ». Même stade, même structure ; seul
    `sellerRole` varie : le prompt réel change, et seules les lignes qui
    citent le rôle changent — le stade n'est pas réécrit par le rôle."""
    same_stage = {**BASE, "size": "220", "salesTeamSize": "12"}
    as_agency_director = _build({**same_stage, "sellerRole": "Directeur d'agence"})
    as_business_manager = _build({**same_stage, "sellerRole": "Business Manager"})

    assert as_agency_director != as_business_manager
    assert "- Rôle déclaré : Directeur d'agence" in as_agency_director
    assert "- Rôle déclaré : Business Manager" in as_business_manager
    changed = set(as_agency_director.splitlines()) ^ set(as_business_manager.splitlines())
    # le rôle se lit dans le bloc profil ET dans le bloc stade : seules ces lignes-là bougent
    assert changed
    # #3386 — la fiche de rôle (lignes « · ») change aussi avec le rôle : c'est le but.
    # #3386 (11/10) — et la combinaison rôle × stade (lignes « - » sous « Ta combinaison »).
    assert all(
        "Directeur d'agence" in line
        or "Business Manager" in line
        or line.startswith("  · ")
        or line.startswith("    - ")
        for line in changed
    )
    assert any("Stade de l'ESN" in line for line in as_agency_director.splitlines())
    assert not any("Stade" in line or "Structure commerciale" in line for line in changed)
