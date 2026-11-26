"""#2371.11 — vingt combinaisons persona × stade × objectif, évaluées sans modèle.

L'issue demande « générer vingt combinaisons, les faire évaluer par un commercial
ESN et un recruteur » et pose un NO-GO : « le message d'un opérationnel et celui
d'un acheteur posent la même question commerciale ». Ce fichier est la MOITIÉ
automatisable de cette recette : il construit, pour vingt triplets, le CADRAGE
que le prompt reçoit réellement (levier + consigne + exemple du persona, bloc
du stade, cadrage de l'objectif) et vérifie ce qu'une machine PEUT vérifier :

* aucun cadrage n'est le même texte qu'un autre sous un titre différent ;
* deux personas sur le MÊME stade et le MÊME objectif ne reçoivent pas la même
  question (le NO-GO nommé) ;
* aucune probabilité, aucun critère protégé n'entre dans un cadrage.

Ce que ce fichier NE FAIT PAS, à dessein : juger la qualité d'un message rédigé.
Aucun appel de modèle ici (CI hermétique) — la lecture par un commercial ESN et
un recruteur reste la recette humaine, décrite dans le commentaire de l'issue.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from itertools import combinations

import pytest

from app.knowledge.persona import _WRITING_ADVICE, PERSONA_EXAMPLES, PERSONA_PROFILES, PERSONAS
from app.services.message_brief import derive_message_brief, message_brief_block
from app.services.relationship_playbook import message_directive_block

#: Vingt triplets (persona, stade, objectif). Choisis pour que CHAQUE persona
#: apparaisse au moins deux fois, que les stades et les objectifs varient, et que
#: les paires « même stade + même objectif, personas différents » (le NO-GO)
#: soient présentes.
COMBINATIONS: tuple[tuple[str, str, str], ...] = (
    ("operationnel", "froid", "ouverture_compte"),
    ("acheteur", "froid", "ouverture_compte"),
    ("manager", "froid", "ouverture_compte"),
    ("decideur", "froid", "ouverture_compte"),
    ("expert", "froid", "demande_information"),
    ("direction", "connu", "ouverture_compte"),
    ("gouvernance", "connu", "recommandation"),
    ("operationnel", "linkedin", "ouverture_compte"),
    ("acheteur", "linkedin", "demande_information"),
    ("manager", "dormant", "reprise_relation"),
    ("decideur", "dormant", "reprise_relation"),
    ("expert", "refere", "introduction"),
    ("acheteur", "refere", "introduction"),
    ("operationnel", "ancien_client", "reprise_relation"),
    ("direction", "ancien_client", "renouvellement"),
    ("manager", "rang2", "positionnement_expertise"),
    ("acheteur", "client_actif", "renouvellement"),
    ("operationnel", "client_actif", "suivi_rendez_vous"),
    ("decideur", "besoin_ouvert", "proposer_profil"),
    ("expert", "besoin_ouvert", "demande_information"),
)

_LEVEL_OF_PERSONA = {
    "decideur": "c_level",
    "gouvernance": "governance",
    "direction": "direction",
    "manager": "management",
    "acheteur": "achats",
    "expert": "expert",
    "operationnel": "operationnel",
}

_PROBABILITY = re.compile(r"\d{1,3} ?%|probabilit|chance de (closing|signer|gagner)", re.IGNORECASE)
_PROTECTED = re.compile(r"\b(âge|age de|genre|origine|photo|adresse personnelle)\b", re.IGNORECASE)


def frame(persona: str, state: str, objective: str) -> str:
    """Ce que le prompt reçoit pour ce triplet, concaténé."""
    brief = derive_message_brief(
        contact={"hierarchyLevel": _LEVEL_OF_PERSONA[persona], "title": ""},
        relationship_state=state,
        angle=None,
        parameters={"objective": objective, "persona": persona},
    )
    profile = PERSONA_PROFILES[persona]
    persona_part = " | ".join(
        (
            profile["lever"],
            profile["speaks_in"],
            profile["turns_off"],
            _WRITING_ADVICE[persona],
            PERSONA_EXAMPLES[persona],
        )
    )
    return "\n".join((persona_part, message_directive_block(state), message_brief_block(brief)))


def test_the_corpus_is_twenty_distinct_triplets_covering_every_persona() -> None:
    assert len(COMBINATIONS) == 20
    assert len(set(COMBINATIONS)) == 20
    assert {persona for persona, _, _ in COMBINATIONS} == set(PERSONAS)
    assert len({state for _, state, _ in COMBINATIONS}) >= 8
    assert len({objective for _, _, objective in COMBINATIONS}) >= 8


def test_no_two_frames_are_the_same_text_under_a_different_title() -> None:
    frames = {combo: frame(*combo) for combo in COMBINATIONS}
    assert len(set(frames.values())) == 20
    for (first, text_a), (second, text_b) in combinations(frames.items(), 2):
        assert text_a != text_b, f"{first} et {second} produisent le même cadrage"


@pytest.mark.parametrize(("state", "objective"), sorted({(s, o) for _, s, o in COMBINATIONS}))
def test_two_personas_on_the_same_stage_and_objective_do_not_ask_the_same_question(state: str, objective: str) -> None:
    personas = [p for p, s, o in COMBINATIONS if (s, o) == (state, objective)]
    for first, second in combinations(personas, 2):
        # Le NO-GO de l'issue : « l'opérationnel et l'acheteur posent la même question commerciale ».
        similarity = SequenceMatcher(None, PERSONA_EXAMPLES[first], PERSONA_EXAMPLES[second]).ratio()
        assert similarity < 0.6, f"{first}/{second} : exemples trop proches ({similarity:.2f})"
        assert PERSONA_PROFILES[first]["lever"] != PERSONA_PROFILES[second]["lever"]


def test_the_seven_personas_carry_seven_different_examples_levers_and_advices() -> None:
    for table in (
        {p: PERSONA_EXAMPLES[p] for p in PERSONAS},
        {p: PERSONA_PROFILES[p]["lever"] for p in PERSONAS},
        {p: _WRITING_ADVICE[p] for p in PERSONAS},
    ):
        assert len(set(table.values())) == len(PERSONAS)


@pytest.mark.parametrize("combo", COMBINATIONS)
def test_a_frame_never_carries_a_probability_nor_a_protected_criterion(combo: tuple[str, str, str]) -> None:
    text = frame(*combo)
    assert not _PROBABILITY.search(text)
    assert not _PROTECTED.search(text)


@pytest.mark.parametrize("combo", COMBINATIONS)
def test_the_frame_names_the_chosen_objective_and_the_stage_rule(combo: tuple[str, str, str]) -> None:
    persona, state, objective = combo
    brief = derive_message_brief(
        contact={"hierarchyLevel": _LEVEL_OF_PERSONA[persona]},
        relationship_state=state,
        angle=None,
        parameters={"objective": objective, "persona": persona},
    )
    assert brief["objective"] == objective
    assert brief["persona"] == persona
    # Un stade autre que `froid` porte son bloc de règles ; `froid` n'en a pas, à dessein.
    assert bool(message_directive_block(state).strip()) == (state != "froid")


def test_the_checks_can_say_no() -> None:
    """Une garde doit savoir dire NON : deux personas qui recevraient la même
    question sont bien vus comme la même question, et un pourcentage est bien attrapé."""
    same = "Comment un nouveau prestataire peut-il intervenir sur ce périmètre ?"
    assert SequenceMatcher(None, same, same).ratio() >= 0.6
    assert _PROBABILITY.search("70 % de chances de signer")
    assert _PROTECTED.search("selon son âge")
