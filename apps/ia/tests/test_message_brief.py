"""#1926 — préparer un message : le CADRAGE est connu AVANT de rédiger.

Avant ce lot, l'objectif du message était câblé en dur (« obtenir une réponse,
pas un RDV »), le niveau hiérarchique et le tu/vous étaient laissés au modèle,
l'appel à l'action n'existait pas. Le cadrage est désormais DÉRIVÉ, en Python,
de ce que le contexte porte déjà — et chaque valeur dit D'OÙ elle vient :

* ``angle``   — le commercial l'a écrit dans l'angle demandé (composer, ou
  l'angle que Laura passe à l'outil de préparation) ;
* ``relation`` — déduit de l'état de relation du compte (SalesContext) ;
* ``poste``   — le persona calculé depuis le poste du contact ;
* ``defaut``  — la règle par défaut, NOMMÉE comme telle ;
* ``indetermine`` — aucun objectif ne se laisse lire ni déduire.

Ce qui ne peut ni être lu ni être déduit part dans ``missing`` : la matière
d'UNE question groupée, jamais d'un questionnaire.

#1926.11-.15, .17 — les NEUF objectifs de la taxonomie portent désormais chacun
leurs règles propres. Six d'entre eux étaient reconnus mais rendus ``hors_lot``
(le prompt renvoyait à l'angle du commercial) : information, recommandation,
positionnement d'expertise, nurturing, suivi de rendez-vous, renouvellement.
Un objectif reste sans règles tant qu'il n'en a pas — jamais rédigé avec celles
d'un autre.

#1926.32 — golden par persona × objectif × relation : tests déterministes sur
le prompt CONSTRUIT. Aucun appel de modèle.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.prompts import bellum_outreach
from app.services.message_brief import (
    _CTA_RULES,
    _STATE_TO_SCENARIO,
    MESSAGE_OBJECTIVES,
    derive_message_brief,
    message_brief_block,
    tone_options,
)
from app.services.relationship_playbook import MESSAGE_PLAYBOOK, objective_premise_holds
from app.services.sales_context import RELATIONSHIP_STATES

_REPO = Path(__file__).resolve().parents[3]

_DECIDEUR = {"full_name": "Camille Martin", "title": "Directrice Générale"}
_MANAGER = {"full_name": "Olivier Bernard", "title": "Engineering Manager"}
_OPERATIONNEL = {"full_name": "Sophie Leroy", "title": "Data Engineer"}
_SANS_POSTE = {"full_name": "Alex Durand", "title": ""}


# ── Le corpus : les neuf objectifs, chacun avec SES règles ─────────────────

#: Les neuf objectifs de l'issue (#1926.9-.17) PLUS le dixième ajouté par
#: #2374.6 (« suivi après document ») PLUS les deux ajoutés par #2947/#2204.22
#: et #2204.27 (« introduction », « partenariat ») PLUS le treizième ajouté par
#: #2371.3 (« proposer un profil », scénario D de #2386) PLUS le quatorzième
#: ajouté par #2204.21 (« valider un contexte »), écrits ici plutôt
#: qu'importés : une garde qui lit la liste qu'elle vérifie ne vérifie rien.
_TAXONOMY = {
    "ouverture_compte",
    "reprise_relation",
    "demande_information",
    "recommandation",
    "positionnement_expertise",
    "nurturing",
    "suivi_rendez_vous",
    "relance",
    "renouvellement",
    "suivi_document",
    "introduction",
    "partenariat",
    "proposer_profil",
    "valider_contexte",
    # #4060 — l'approche directe, choisie ; aucun signal imposé.
    "approche_directe",
}


def test_the_eleven_objectives_each_carry_their_own_rules_and_a_known_cta():
    # #1926.11-.15, .17 — six objectifs étaient RECONNUS sans règles propres
    # (rendus ``hors_lot``, le prompt renvoyant à l'angle) : la taxonomie est
    # désormais entière, et aucun objectif n'emprunte les règles d'un autre.
    assert set(MESSAGE_OBJECTIVES) == _TAXONOMY
    for code, entry in MESSAGE_OBJECTIVES.items():
        assert entry["rules"].strip(), code
        assert entry["label"].strip(), code
        assert entry["cta"] in _CTA_RULES, code
    written = [entry["rules"] for entry in MESSAGE_OBJECTIVES.values()]
    assert len(set(written)) == len(written), "deux objectifs partagent les mêmes règles"


def test_every_call_to_action_written_is_reachable_from_an_objective_or_the_angle():
    # Une règle d'appel à l'action que rien ne choisit est du texte mort : le
    # défaut n°1 du dépôt (du code juste que personne n'appelle).
    reachable = {entry["cta"] for entry in MESSAGE_OBJECTIVES.values()} | {"echange_court"}
    assert set(_CTA_RULES) == reachable


# ── #1926.2 / .9 / .10 / .16 — l'objectif ───────────────────────────────────


@pytest.mark.parametrize(
    ("angle", "objective"),
    [
        ("relance après mon premier message", "relance"),
        ("Relancer sur le sujet data", "relance"),
        ("reprendre contact après la mission de 2024", "reprise_relation"),
        ("renouer avec l'ancienne équipe", "reprise_relation"),
        ("ouvrir le compte par la DSI", "ouverture_compte"),
        ("premier contact sur la cyber", "ouverture_compte"),
    ],
)
def test_the_objective_written_in_the_angle_wins(angle: str, objective: str):
    brief = derive_message_brief(contact=_MANAGER, relationship_state="client_actif", angle=angle)
    assert brief["objective"] == objective
    assert brief["objectiveSource"] == "angle"


@pytest.mark.parametrize(
    ("state", "objective", "source"),
    [
        ("", "ouverture_compte", "defaut"),
        ("froid", "ouverture_compte", "relation"),
        ("linkedin", "ouverture_compte", "relation"),
        ("refere", "ouverture_compte", "relation"),
        ("dormant", "reprise_relation", "relation"),
        ("ancien_client", "reprise_relation", "relation"),
    ],
)
def test_without_angle_the_objective_is_deduced_from_the_relationship(state: str, objective: str, source: str):
    brief = derive_message_brief(contact=_MANAGER, relationship_state=state, angle="")
    assert brief["objective"] == objective
    assert brief["objectiveSource"] == source
    assert "objective" not in brief["missing"]


@pytest.mark.parametrize("state", ["connu", "client_actif", "besoin_ouvert", "rang2"])
def test_a_relationship_outside_this_lot_leaves_the_objective_missing(state: str):
    # Aucun scénario d'approche ne couvre ces états (`scenarioForRelationship`
    # rend null) : on ne les range pas de force dans « ouverture de compte ».
    brief = derive_message_brief(contact=_MANAGER, relationship_state=state, angle="")
    assert brief["objective"] is None
    assert brief["objectiveSource"] == "indetermine"
    assert "objective" in brief["missing"]


@pytest.mark.parametrize("state", ["connu", "client_actif", "besoin_ouvert", "rang2"])
def test_a_state_without_objective_but_with_a_playbook_defers_to_the_relationship_block(state: str):
    """#1926.2 — le défaut épinglé par le golden persona × contexte : le cadrage
    écrivait « sans supposer de relation ni de besoin » pendant que le bloc
    RELATION AU COMPTE, trois lignes plus haut, décrivait un client actif ou un
    besoin qualifié. Deux consignes contraires ne sont pas un réglage : l'une
    des deux est ignorée, et on ne choisit pas laquelle."""
    block = message_brief_block(derive_message_brief(contact=_MANAGER, relationship_state=state, angle=""))
    assert "suis le bloc RELATION AU COMPTE" in block
    assert "sans supposer de relation" not in block


def test_a_state_no_playbook_describes_still_gets_the_prudent_opening():
    # Le témoin du voisin légitime : sans bloc RELATION AU COMPTE à suivre, la
    # consigne prudente reste la bonne — elle ne contredit alors personne.
    block = message_brief_block(derive_message_brief(contact=_MANAGER, relationship_state="zzq_inconnu", angle=""))
    assert "sans supposer de relation" in block
    assert "suis le bloc RELATION AU COMPTE" not in block


# ── #2887.5 — « interdits » : le sixième attribut composé du triplet,
# rendu comme DONNÉE (pas de prose neuve) pour un appelant qui veut le cadrage
# complet sans reparser le prompt. Même source que `relationship_playbook`
# (`MESSAGE_PLAYBOOK`) — zéro second texte, zéro risque de divergence (GA-26).


def test_froid_has_no_stage_specific_prohibition_named():
    # Froid n'est pas « non mesuré » : la règle d'or n°3 suffit déjà, aucune
    # interdiction de stade à nommer en plus (#2371.4 : non mesuré ≠ froid,
    # et ici froid ≠ une absence à nommer non plus).
    brief = derive_message_brief(contact=_MANAGER, relationship_state="froid", angle="")
    assert brief["forbidden"] is None
    assert brief["forbiddenSource"] == "sans_objet"


@pytest.mark.parametrize("state", sorted(MESSAGE_PLAYBOOK))
def test_a_known_stage_names_its_own_prohibition(state: str):
    brief = derive_message_brief(contact=_MANAGER, relationship_state=state, angle="")
    assert brief["forbidden"] == MESSAGE_PLAYBOOK[state]["forbidden"]
    assert brief["forbiddenSource"] == "relation"


@pytest.mark.parametrize("state", ["", "zzq_inconnu"])
def test_an_unmeasured_stage_never_guesses_a_prohibition(state: str):
    # #2371.4 — un état absent ou hors contrat n'est jamais confondu avec
    # « aucune interdiction » : `None`, jamais deviné depuis un autre stade.
    brief = derive_message_brief(contact=_MANAGER, relationship_state=state, angle="")
    assert brief["forbidden"] is None
    assert brief["forbiddenSource"] == "non_mesure"


def test_a_relance_is_never_deduced_from_data():
    # Aucune donnée ne dit qu'un message est parti sans réponse
    # (`contacts.lifecycle_state` n'a pas d'état « contacté ») : une relance
    # n'existe que si le commercial la demande.
    for state in ("", "froid", "connu", "dormant", "client_actif"):
        assert derive_message_brief(contact=_MANAGER, relationship_state=state, angle="")["objective"] != "relance"


@pytest.mark.parametrize(
    ("angle", "objective"),
    [
        ("message de renouvellement du contrat", "renouvellement"),
        ("suivi de rendez-vous de mardi", "suivi_rendez_vous"),
        ("obtenir une recommandation vers la DSI", "recommandation"),
        ("nurturing trimestriel", "nurturing"),
        ("demander une information sur le panel", "demande_information"),
        ("positionner notre expertise cyber", "positionnement_expertise"),
    ],
)
def test_the_six_objectives_of_this_lot_carry_their_own_rules(angle: str, objective: str):
    # #1926.11-.15, .17 — reconnus depuis le lot précédent, mais rendus
    # ``hors_lot`` : le prompt renvoyait à l'angle faute de règles.
    brief = derive_message_brief(contact=_MANAGER, relationship_state="froid", angle=angle)
    assert brief["objective"] == objective
    assert brief["objectiveSource"] == "angle"
    assert MESSAGE_OBJECTIVES[objective]["rules"] in message_brief_block(brief)


@pytest.mark.parametrize(
    "angle",
    [
        "suivi après l'envoi du document",
        "suivi document envoyé la semaine dernière",
        "après envoi du dossier",
    ],
)
def test_2374_6_the_after_document_objective_is_recognized(angle: str):
    # #2374.6 — un dixième objectif : un document (dossier, étude de cas,
    # proposition) a déjà été envoyé, ce message en fait le suivi. Même motif
    # que #1926.15 (« suivi de rendez-vous ») : reprendre le contexte fourni,
    # jamais reconstituer ce qui a été envoyé.
    brief = derive_message_brief(contact=_MANAGER, relationship_state="froid", angle=angle)
    assert brief["objective"] == "suivi_document"
    assert brief["objectiveSource"] == "angle"
    assert MESSAGE_OBJECTIVES["suivi_document"]["rules"] in message_brief_block(brief)


@pytest.mark.parametrize(
    ("angle", "objective"),
    [
        ("demander une introduction auprès de son DAF", "introduction"),
        ("mettre en relation avec le directeur achats", "introduction"),
        ("explorer un partenariat de co-traitance", "partenariat"),
        ("apport d'affaires possible avec cette ESN", "partenariat"),
    ],
)
def test_2947_2204_22_27_introduction_and_partnership_carry_their_own_rules(angle: str, objective: str):
    # #2947/#2204.22 — « demander une introduction » : distinct de
    # `recommandation` (#1926.12, qui demande VERS QUI se tourner sans tiers
    # nommé) — ici le tiers est déjà identifié dans l'angle.
    # #2947/#2204.27 — « partenariat » : une collaboration ENTRE
    # organisations, jamais une vente à la personne elle-même.
    brief = derive_message_brief(contact=_MANAGER, relationship_state="froid", angle=angle)
    assert brief["objective"] == objective
    assert brief["objectiveSource"] == "angle"
    assert MESSAGE_OBJECTIVES[objective]["rules"] in message_brief_block(brief)


def test_an_objective_of_this_lot_never_wins_over_a_relance_written_in_the_same_angle():
    # Le témoin du voisin légitime : « relance sur le renouvellement » est une
    # relance. L'ordre des motifs le décide, et il doit rester lisible.
    brief = derive_message_brief(contact=_MANAGER, relationship_state="froid", angle="relance sur le renouvellement")
    assert brief["objective"] == "relance"


# ── #1926.4 — le niveau hiérarchique ────────────────────────────────────────


@pytest.mark.parametrize(
    ("contact", "persona"),
    [(_DECIDEUR, "decideur"), (_MANAGER, "manager"), (_OPERATIONNEL, "operationnel")],
)
def test_the_persona_is_computed_from_the_title(contact: dict, persona: str):
    brief = derive_message_brief(contact=contact, relationship_state="", angle="")
    assert brief["persona"] == persona


def test_an_unknown_title_is_named_missing_never_guessed():
    brief = derive_message_brief(contact=_SANS_POSTE, relationship_state="", angle="")
    assert brief["persona"] is None
    assert brief["missing"] == ["persona", "decisionRole"]


def test_missing_items_are_grouped_in_one_list():
    brief = derive_message_brief(contact=_SANS_POSTE, relationship_state="client_actif", angle="")
    assert brief["missing"] == ["objective", "persona", "decisionRole"]


# ── #3418.4 (retour bêta 30/09) — le rôle dans la décision ──────────────────


def test_decision_role_is_read_from_the_contact_column_when_present():
    brief = derive_message_brief(contact={**_SANS_POSTE, "decision_role": "economic"}, relationship_state="", angle="")
    assert brief["decisionRole"] == "economic"
    assert "decisionRole" not in brief["missing"]


def test_decision_role_falls_back_to_the_title_classifier_when_the_column_is_absent():
    brief = derive_message_brief(contact=_DECIDEUR, relationship_state="", angle="")
    assert brief["decisionRole"] == "champion"


def test_decision_role_is_named_missing_never_guessed_on_an_empty_title():
    brief = derive_message_brief(contact=_SANS_POSTE, relationship_state="", angle="")
    assert brief["decisionRole"] is None
    assert "decisionRole" in brief["missing"]


# ── #1926.5 — tu / vous (le message EXTERNE garde celui du contact) ────────


def test_formality_defaults_to_vous_and_says_so():
    brief = derive_message_brief(contact=_OPERATIONNEL, relationship_state="", angle="")
    assert brief["formality"] == "vous"
    assert brief["formalitySource"] == "defaut"


@pytest.mark.parametrize(
    ("angle", "formality"), [("le tutoyer, on se connaît", "tu"), ("tutoiement", "tu"), ("vouvoiement", "vous")]
)
def test_the_formality_asked_in_the_angle_wins(angle: str, formality: str):
    brief = derive_message_brief(contact=_DECIDEUR, relationship_state="", angle=angle)
    assert brief["formality"] == formality
    assert brief["formalitySource"] == "angle"


# ── #1926.8 — l'appel à l'action ────────────────────────────────────────────


@pytest.mark.parametrize(
    ("angle", "state", "cta", "source"),
    [
        ("", "froid", "question_facile", "objectif"),
        ("relance", "froid", "sortie_elegante", "objectif"),
        ("", "dormant", "ce_qui_a_change", "objectif"),
        ("", "client_actif", "question_facile", "defaut"),
        ("proposer un rendez-vous de 15 min", "froid", "echange_court", "angle"),
        ("nurturing trimestriel", "froid", "aucune_demande", "objectif"),
        ("obtenir une recommandation vers la DSI", "froid", "vers_qui", "objectif"),
        # Le rendez-vous ici est le PASSÉ qu'on suit, pas un rendez-vous demandé :
        # le motif « rendez-vous » ne doit pas le lire comme une demande.
        ("suivi de rendez-vous de mardi", "froid", "prochaine_etape", "objectif"),
    ],
)
def test_the_call_to_action_follows_the_angle_then_the_objective(angle: str, state: str, cta: str, source: str):
    brief = derive_message_brief(contact=_MANAGER, relationship_state=state, angle=angle)
    assert brief["cta"] == cta
    assert brief["ctaSource"] == source


def test_asking_for_no_meeting_is_not_a_meeting_request():
    brief = derive_message_brief(
        contact=_MANAGER, relationship_state="froid", angle="sans rendez-vous, juste une question"
    )
    assert brief["cta"] == "question_facile"


# ── #1926.31 — changer le ton ───────────────────────────────────────────────


def test_tone_options_offer_the_other_formality_and_round_trip_through_the_angle():
    brief = derive_message_brief(contact=_DECIDEUR, relationship_state="", angle="")
    options = tone_options(brief)
    ids = [o["id"] for o in options]
    assert ids == ["tutoiement", "plus_court", "plus_direct"]
    # L'instruction est ce que l'appelant renvoie comme angle : relue, elle
    # change réellement le registre — pas une étiquette décorative.
    switch = next(o for o in options if o["id"] == "tutoiement")
    assert (
        derive_message_brief(contact=_DECIDEUR, relationship_state="", angle=switch["instruction"])["formality"] == "tu"
    )

    tu_brief = derive_message_brief(contact=_DECIDEUR, relationship_state="", angle="tutoiement")
    assert [o["id"] for o in tone_options(tu_brief)][0] == "vouvoiement"


def test_tone_options_carry_no_display_label():
    # Un libellé français écrit dans un contrat est français pour toujours :
    # l'écran traduit l'`id`, l'IA ne rédige pas le bouton.
    brief = derive_message_brief(contact=_DECIDEUR, relationship_state="", angle="")
    assert all(set(option) == {"id", "instruction"} for option in tone_options(brief))


# ── #1926.32 — golden persona × objectif × relation, sur le prompt construit ─


_PERSONAS = {"decideur": _DECIDEUR, "manager": _MANAGER, "operationnel": _OPERATIONNEL, "inconnu": _SANS_POSTE}
_OBJECTIVE_ANGLES = {
    "ouverture_compte": "ouvrir le compte",
    "relance": "relance",
    "reprise_relation": "reprendre contact",
    "demande_information": "demander une information sur le panel",
    "recommandation": "obtenir une recommandation vers la DSI",
    "positionnement_expertise": "positionner notre expertise cyber",
    "nurturing": "nurturing trimestriel",
    "suivi_rendez_vous": "suivi de rendez-vous de mardi",
    "renouvellement": "préparer le renouvellement du contrat",
}


def _prompt(contact: dict, angle: str, state: str, channel: str = "email") -> tuple[dict, str]:
    brief = derive_message_brief(contact=contact, relationship_state=state, angle=angle)
    prompt = bellum_outreach.build_user_prompt(
        contact=contact,
        raw_analysis={"recent_signals": [{"title": "Cession Uptevia", "date": "2026-06-02"}]},
        profile={"companyName": "Acme", "offers": ["SRE"]},
        recent_signals=[{"title": "Cession Uptevia", "date": "2026-06-02"}],
        channel=channel,
        context=angle,
        company_name="BNP Paribas",
        relationship_state=state,
        brief=brief,
    )
    return brief, prompt


@pytest.mark.parametrize("persona", list(_PERSONAS))
@pytest.mark.parametrize("objective", list(_OBJECTIVE_ANGLES))
@pytest.mark.parametrize("state", ["froid", "dormant", "client_actif"])
def test_golden_persona_objective_relationship(persona: str, objective: str, state: str):
    brief, prompt = _prompt(_PERSONAS[persona], _OBJECTIVE_ANGLES[objective], state)

    assert "CADRAGE DU MESSAGE" in prompt
    # L'objectif est celui demandé, avec SES règles — sauf quand le bloc RELATION
    # AU COMPTE décrit déjà cet objectif pour cet état — et aucune des deux autres.
    assert brief["objective"] == objective
    covered_by_relationship = (state, objective) == ("dormant", "reprise_relation")
    assert (MESSAGE_OBJECTIVES[objective]["rules"] in prompt) is not covered_by_relationship
    for other, rules in MESSAGE_OBJECTIVES.items():
        if other != objective:
            assert rules["rules"] not in prompt
    # Le niveau hiérarchique est DONNÉ (ou nommé inconnu), jamais laissé à deviner.
    if persona == "inconnu":
        assert "non déterminé" in prompt
    else:
        assert f"persona {persona}" in prompt
    # Aucun tu/vous demandé : le registre par défaut reste celui du prompt système.
    assert "- Ton :" not in prompt
    # La relation garde son bloc quand elle n'est pas froide (p6).
    assert ("RELATION AU COMPTE" in prompt) is (state != "froid")
    # CHANGEMENT VOULU (#2371, matrice stade × objectif) : un objectif dont la
    # prémisse écrite contredit la relation (« suivi de rendez-vous » sur un
    # compte froid, « ouvrir le compte » chez un client actif) porte désormais
    # une ligne qui le NOMME ; une combinaison cohérente garde le prompt d'avant.
    assert ("La prémisse de cet objectif" in prompt) is (objective_premise_holds(state, objective) is False)


def test_golden_the_same_contact_gets_a_different_prompt_per_objective():
    prompts = {objective: _prompt(_MANAGER, angle, "froid")[1] for objective, angle in _OBJECTIVE_ANGLES.items()}
    assert len(set(prompts.values())) == len(_OBJECTIVE_ANGLES) == 9


def test_golden_the_same_objective_gets_a_different_prompt_per_persona():
    prompts = {persona: _prompt(contact, "relance", "froid")[1] for persona, contact in _PERSONAS.items()}
    assert len(set(prompts.values())) == 4


def test_the_brief_block_is_empty_without_a_brief():
    # Un appelant qui ne passe pas de cadrage garde le prompt d'avant ce lot.
    assert message_brief_block(None) == ""
    without = bellum_outreach.build_user_prompt(
        contact=_MANAGER, raw_analysis={}, profile={}, recent_signals=[], channel="email", context=""
    )
    assert "CADRAGE DU MESSAGE" not in without


def test_the_brief_never_reads_a_protected_criterion():
    # Doctrine c58 : ce qui choisit l'angle ou la personne ne lit aucun critère
    # protégé. Un contact chargé de ces champs donne le MÊME cadrage.
    loaded = {
        **_MANAGER,
        "photo_url": "https://x/y.png",
        "age": 52,
        "gender": "F",
        "nationality": "FR",
        "address": "1 rue X",
    }
    assert derive_message_brief(contact=loaded, relationship_state="froid", angle="") == derive_message_brief(
        contact=_MANAGER, relationship_state="froid", angle=""
    )


# ── Ce que le cadrage ne redit pas, et d'où vient sa correspondance ─────────


def test_an_objective_the_relationship_block_already_describes_is_not_repeated():
    brief, prompt = _prompt(_MANAGER, "", "dormant")
    assert brief["objective"] == "reprise_relation"
    assert "suis le bloc RELATION AU COMPTE" in prompt
    assert MESSAGE_OBJECTIVES["reprise_relation"]["rules"] not in prompt
    # Témoin : sans bloc relation (compte froid), les règles sont bien écrites.
    assert MESSAGE_OBJECTIVES["ouverture_compte"]["rules"] in _prompt(_MANAGER, "", "froid")[1]


def test_only_a_requested_formality_is_written_in_the_brief():
    assert "- Ton : tutoiement (demandé par le commercial)" in _prompt(_DECIDEUR, "tutoiement", "froid")[1]
    assert "- Ton :" not in _prompt(_DECIDEUR, "", "froid")[1]


def test_the_state_to_scenario_mapping_mirrors_the_ts_contract():
    # Parité avec `scenarioForRelationship` (outreach-scenarios.ts), que lit le
    # contrôle avant envoi : une copie que rien ne vérifie finit par diverger.
    ts = (_REPO / "packages" / "contracts" / "src" / "schemas" / "outreach-scenarios.ts").read_text(encoding="utf-8")
    body = ts.split("export function scenarioForRelationship", 1)[1].split("\n}", 1)[0]
    mapping: dict[str, str] = {}
    pending: list[str] = []
    for line in body.splitlines():
        if case := re.search(r"case '([a-z_0-9]+)':", line):
            pending.append(case.group(1))
        elif scenario := re.search(r"return OUTREACH_SCENARIOS\.([a-z_]+)", line):
            mapping.update(dict.fromkeys(pending, scenario.group(1)))
            pending = []
    # La garde LIT quelque chose : cinq états, dont le témoin « froid ».
    assert len(mapping) == 5
    assert mapping["froid"] == "cold_approach"
    assert mapping == _STATE_TO_SCENARIO


def test_every_deduced_state_is_a_real_relationship_state():
    assert set(_STATE_TO_SCENARIO) <= set(RELATIONSHIP_STATES)


def test_same_contact_opening_expertise_and_follow_up_get_distinct_framing_3695():
    """#3695.1 — le MÊME contact, trois objectifs : trois intentions, jamais « la même
    demande avec une date différente ». Le signal du compte (angle) reste porté ;
    aucun des trois n'impose de rendez-vous."""
    blocks = {}
    for objective in ("ouverture_compte", "positionnement_expertise", "relance"):
        brief = derive_message_brief(
            contact={"fullName": "Claire Martin", "title": "Directrice des achats IT"},
            relationship_state=None,
            angle="signal : appel d'offres infogérance publié en septembre",
            parameters={"objective": objective},
        )
        assert brief["objective"] == objective and brief["objectiveSource"] == "formulaire"
        blocks[objective] = message_brief_block(brief)
        assert "proposer un rendez-vous" not in blocks[objective].lower()
    assert len(set(blocks.values())) == 3
