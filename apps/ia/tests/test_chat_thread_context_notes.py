"""#2268.1 / #2268.5 / #2268.10 / #2268.12 / #2268.13 / #2268.15 — L'OBJECTIF,
LES EXCLUSIONS, LES DÉCISIONS, LE JOB EN COURS, PAR LA VOIE STRUCTURÉE.

`chat_thread_state.py` ne portait ni l'objectif actif du fil, ni les critères
explicitement EXCLUS du périmètre (distincts d'une piste ÉCARTÉE : « sans les
grands groupes » n'est pas « j'écarte Lyon »), ni les décisions prises, ni le
job en cours d'un travail à plusieurs tours, son étape actuelle ou le prochain
geste prévu. Même voie que #1927.3 / #1927.4 : un outil TYPÉ que le modèle
appelle en plus de son texte, jamais un détecteur qui relit une phrase —
`note_thread_context` porte `goal`, `excluded`, `decisions`, `current_job`,
`current_step` et `next_step`, silencieux, sans carte.
"""

from __future__ import annotations

import asyncio

from app.prompts.thread_state import format_thread_state_block
from app.services import chat_orchestrator
from app.services.chat_thread_state import (
    DECISIONS_MAX,
    EXCLUDED_MAX,
    PRECAUTIONS_MAX,
    TREATED_ENTITIES_MAX,
    ThreadState,
    ThreadStateCollector,
    thread_state_from_wire,
)
from app.services.chat_tools import NOTE_THREAD_CONTEXT_TOOL, execute_chat_tool
from tests.test_unrouted_intent import USER, _resp, _text, _tool_use, fake_model  # noqa: F401


# ── La sortie TYPÉE ──────────────────────────────────────────────────────────


def test_the_tool_requires_none_of_its_fields() -> None:
    schema = NOTE_THREAD_CONTEXT_TOOL["input_schema"]
    assert schema["required"] == []
    assert {
        "goal",
        "excluded",
        "decisions",
        "current_job",
        "current_step",
        "next_step",
        "accepted",
        "treated_entities",
        "precautions",
    } <= set(schema["properties"])


async def _note(**fields: object) -> dict:
    return await execute_chat_tool("note_thread_context", fields, user_id="u-1", profile_data=None)


async def test_the_executor_keeps_what_the_model_named() -> None:
    out = await _note(
        goal="Ouvrir un point d'entrée Data chez ACME",
        excluded=[{"criterion": "grands groupes", "reason": "hors cible cette année"}],
        decisions=["Ne pas relancer avant le comité du 30/09"],
    )

    assert out["goal"] == "Ouvrir un point d'entrée Data chez ACME"
    assert out["excluded"] == [{"criterion": "grands groupes", "reason": "hors cible cette année"}]
    assert out["decisions"] == ["Ne pas relancer avant le comité du 30/09"]


async def test_the_executor_keeps_the_job_the_step_and_the_next_step() -> None:
    out = await _note(
        current_job="Préparer 3 messages pour la shortlist ACME",
        current_step="Vérification des critères d'accès avant l'envoi",
        next_step="Proposer les brouillons une fois la vérification terminée",
    )

    assert out["current_job"] == "Préparer 3 messages pour la shortlist ACME"
    assert out["current_step"] == "Vérification des critères d'accès avant l'envoi"
    assert out["next_step"] == "Proposer les brouillons une fois la vérification terminée"


# #3347 (recette prod 30/09/2026) — « le travail Java s'est interrompu,
# reprendre ? » ouvrait une réponse SANS RAPPORT avec ce que l'utilisateur
# venait de demander : `current_job` n'avait aucun moyen de s'effacer une fois
# le travail terminé ou abandonné. `job_done` est ce moyen.
async def test_job_done_alone_is_enough_to_call_the_tool() -> None:
    out = await _note(job_done=True)
    assert out["job_done"] is True


async def test_the_executor_keeps_the_precautions() -> None:
    # #3191.3.12 (LAU-FINAL-197, épopée #3220) — même voie TYPÉE que les
    # décisions, jamais un détecteur qui relit le texte de la réponse.
    out = await _note(precautions=["Cette donnée n'est pas mesurée, à confirmer avant l'envoi"])

    assert out["precautions"] == ["Cette donnée n'est pas mesurée, à confirmer avant l'envoi"]


async def test_the_executor_keeps_the_facets_the_model_named() -> None:
    # #193.1 — un type CONNU (`FACET_TYPES`), une clé par type, rien d'autre.
    out = await _note(facets={"group": "BoursoBank et ses filiales"})

    assert out["facets"] == {"group": "BoursoBank et ses filiales"}


async def test_a_facet_of_an_unknown_type_is_dropped_not_guessed() -> None:
    out = await _note(facets={"budget": "1M€", "sectors": "banque"})

    assert out["facets"] == {"sectors": "banque"}


async def test_a_facet_without_its_value_is_dropped() -> None:
    out = await _note(facets={"group": ""})

    assert "error" in out


async def test_the_executor_keeps_the_correction_the_model_named() -> None:
    # #194.1 / #194.2 — un type CONNU (`CORRECTION_TYPES`) et l'écart reconnu.
    out = await _note(correction={"correction_type": "wrong_scope", "summary": "J'ai utilisé la mauvaise couche"})

    assert out["correction"] == {"correction_type": "wrong_scope", "summary": "J'ai utilisé la mauvaise couche"}


async def test_a_correction_of_an_unknown_type_is_dropped_not_guessed() -> None:
    out = await _note(correction={"correction_type": "mauvaise_humeur", "summary": "test"})

    assert "error" in out


async def test_a_correction_without_its_summary_is_dropped() -> None:
    out = await _note(correction={"correction_type": "wrong_scope"})

    assert "error" in out


async def test_the_executor_keeps_the_tools_the_correction_invalidates() -> None:
    # #194.2 (reste, épopée #3233) — un outil CONNU (`REFINABLE_SEARCH_CRITERIA`),
    # nommé par le modèle, jamais deviné.
    out = await _note(
        correction={
            "correction_type": "wrong_scope",
            "summary": "J'ai utilisé la mauvaise couche",
            "invalidates": ["find_accounts"],
        }
    )

    assert out["correction"] == {
        "correction_type": "wrong_scope",
        "summary": "J'ai utilisé la mauvaise couche",
        "invalidates": ["find_accounts"],
    }


async def test_an_unknown_tool_in_invalidates_is_dropped_not_guessed() -> None:
    out = await _note(
        correction={
            "correction_type": "wrong_scope",
            "summary": "J'ai utilisé la mauvaise couche",
            "invalidates": ["find_accounts", "search_rfps"],
        }
    )

    assert out["correction"]["invalidates"] == ["find_accounts"]


async def test_invalidates_is_omitted_when_empty() -> None:
    out = await _note(correction={"correction_type": "wrong_scope", "summary": "J'ai utilisé la mauvaise couche"})

    assert "invalidates" not in out["correction"]


async def test_a_call_with_nothing_to_note_is_refused() -> None:
    # Un appel sans rien à dire n'est pas silencieux : il gaspillerait un tour
    # d'outil pour ne rien faire, et masquerait un vrai bug d'appel.
    out = await _note()

    assert "error" in out


async def test_an_excluded_criterion_without_its_text_is_dropped_not_guessed() -> None:
    out = await _note(excluded=[{"reason": "trop gros"}, {"criterion": "grands groupes"}])

    assert out["excluded"] == [{"criterion": "grands groupes"}]


async def test_a_treated_entity_without_its_name_is_dropped_not_guessed() -> None:
    out = await _note(treated_entities=[{"reason": "déjà traitée"}, {"entity": "BoursoBank"}])

    assert out["treated_entities"] == [{"entity": "BoursoBank"}]


async def test_the_executor_keeps_the_treated_entities() -> None:
    out = await _note(treated_entities=[{"entity": "BoursoBank", "reason": "filiales et volumes déjà donnés"}])

    assert out["treated_entities"] == [{"entity": "BoursoBank", "reason": "filiales et volumes déjà donnés"}]


# ── La traversée jusqu'à l'état du fil ───────────────────────────────────────


def _collector() -> ThreadStateCollector:
    return ThreadStateCollector(ThreadState())


def test_the_state_remembers_the_goal_the_exclusions_and_the_decisions() -> None:
    collector = _collector()
    collector.record(
        "note_thread_context",
        {},
        {
            "status": "thread_note",
            "goal": "Ouvrir un point d'entrée Data chez ACME",
            "excluded": [{"criterion": "grands groupes", "reason": "hors cible cette année"}],
            "decisions": ["Ne pas relancer avant le comité du 30/09"],
        },
    )

    assert collector.state.goal == "Ouvrir un point d'entrée Data chez ACME"
    assert [(e.criterion, e.reason) for e in collector.state.excluded] == [("grands groupes", "hors cible cette année")]
    assert collector.state.decisions == ["Ne pas relancer avant le comité du 30/09"]


def test_a_new_goal_replaces_the_previous_one() -> None:
    collector = _collector()
    collector.record("note_thread_context", {}, {"status": "thread_note", "goal": "Premier objectif"})
    collector.record("note_thread_context", {}, {"status": "thread_note", "goal": "Second objectif"})

    assert collector.state.goal == "Second objectif"


def test_the_state_remembers_precautions_most_recent_first_deduplicated() -> None:
    collector = _collector()
    collector.record(
        "note_thread_context", {}, {"status": "thread_note", "precautions": ["Non mesuré", "À confirmer avant envoi"]}
    )
    collector.record("note_thread_context", {}, {"status": "thread_note", "precautions": ["Non mesuré"]})

    # « Non mesuré » remonte en tête (dernier énoncé) sans se dupliquer, et
    # « À confirmer avant envoi » reste — aucune précaution déjà dite n'est
    # supprimée, elle est seulement réordonnée.
    assert collector.state.precautions == ["Non mesuré", "À confirmer avant envoi"]


def test_precautions_are_bounded_and_the_most_recent_comes_first() -> None:
    collector = _collector()
    for index in range(PRECAUTIONS_MAX + 2):
        collector.record("note_thread_context", {}, {"status": "thread_note", "precautions": [f"precaution-{index}"]})

    assert len(collector.state.precautions) == PRECAUTIONS_MAX
    assert collector.state.precautions[0] == f"precaution-{PRECAUTIONS_MAX + 1}"


def test_the_state_remembers_the_job_the_step_and_the_next_step() -> None:
    collector = _collector()
    collector.record(
        "note_thread_context",
        {},
        {
            "status": "thread_note",
            "current_job": "Préparer 3 messages pour la shortlist ACME",
            "current_step": "Vérification des critères d'accès avant l'envoi",
            "next_step": "Proposer les brouillons une fois la vérification terminée",
        },
    )

    assert collector.state.current_job == "Préparer 3 messages pour la shortlist ACME"
    assert collector.state.current_step == "Vérification des critères d'accès avant l'envoi"
    assert collector.state.next_step == "Proposer les brouillons une fois la vérification terminée"


# #3347 (recette prod 30/09/2026) — sans `job_done`, rien n'efface jamais
# `current_job` (`if current_job:` n'assigne qu'une valeur non vide) : un job
# clos continuait de déclencher « le travail s'est interrompu, reprendre ? »
# sur des tours qui n'avaient plus rien à voir avec lui.
def test_job_done_clears_the_job_the_step_and_the_next_step() -> None:
    collector = _collector()
    collector.record(
        "note_thread_context",
        {},
        {
            "status": "thread_note",
            "current_job": "Préparer 3 messages pour la shortlist ACME",
            "current_step": "Vérification des critères d'accès avant l'envoi",
            "next_step": "Proposer les brouillons une fois la vérification terminée",
        },
    )
    collector.record("note_thread_context", {}, {"status": "thread_note", "job_done": True})

    assert collector.state.current_job is None
    assert collector.state.current_step is None
    assert collector.state.next_step is None


def test_job_done_without_a_prior_job_is_a_no_op() -> None:
    collector = _collector()
    collector.record("note_thread_context", {}, {"status": "thread_note", "job_done": True})

    assert collector.state.current_job is None


def test_a_new_current_step_replaces_the_previous_one() -> None:
    # Comme `goal` : un fil n'a qu'une étape actuelle à la fois, contrairement
    # aux décisions qui s'accumulent.
    collector = _collector()
    collector.record("note_thread_context", {}, {"status": "thread_note", "current_step": "Première étape"})
    collector.record("note_thread_context", {}, {"status": "thread_note", "current_step": "Seconde étape"})

    assert collector.state.current_step == "Seconde étape"


def test_the_most_recent_comes_first_and_the_lists_are_bounded() -> None:
    collector = _collector()
    for index in range(EXCLUDED_MAX + 2):
        collector.record(
            "note_thread_context",
            {},
            {
                "status": "thread_note",
                "excluded": [{"criterion": f"critere-{index}"}],
                "decisions": [f"decision-{index}"],
            },
        )

    assert len(collector.state.excluded) == EXCLUDED_MAX
    assert collector.state.excluded[0].criterion == f"critere-{EXCLUDED_MAX + 1}"
    assert len(collector.state.decisions) == DECISIONS_MAX
    assert collector.state.decisions[0] == f"decision-{EXCLUDED_MAX + 1}"


def test_the_state_remembers_and_bounds_the_treated_entities() -> None:
    collector = _collector()
    for index in range(TREATED_ENTITIES_MAX + 2):
        collector.record(
            "note_thread_context",
            {},
            {"status": "thread_note", "treated_entities": [{"entity": f"entite-{index}"}]},
        )

    assert len(collector.state.treated_entities) == TREATED_ENTITIES_MAX
    assert collector.state.treated_entities[0].entity == f"entite-{TREATED_ENTITIES_MAX + 1}"


def test_a_treated_entity_named_again_replaces_the_earlier_reason_instead_of_duplicating() -> None:
    # Le scénario de #3187.4 : « et côté BoursoBank ? » puis « et les autres ? »
    # ne doit pas empiler deux fois la même filiale.
    collector = _collector()
    collector.record(
        "note_thread_context", {}, {"status": "thread_note", "treated_entities": [{"entity": "BoursoBank"}]}
    )
    collector.record(
        "note_thread_context",
        {},
        {"status": "thread_note", "treated_entities": [{"entity": "BoursoBank", "reason": "filiales données"}]},
    )

    assert [(e.entity, e.reason) for e in collector.state.treated_entities] == [("BoursoBank", "filiales données")]


def test_the_state_remembers_a_facet_and_a_new_value_replaces_it() -> None:
    # #193.1 — comme `goal` : un type ne garde qu'une valeur active à la fois.
    collector = _collector()
    collector.record(
        "note_thread_context",
        {},
        {"status": "thread_note", "facets": {"group": "BoursoBank"}},
    )
    collector.record(
        "note_thread_context",
        {},
        {"status": "thread_note", "facets": {"group": "BoursoBank et ses filiales"}},
    )

    assert collector.state.facets == {"group": "BoursoBank et ses filiales"}


def test_two_distinct_facet_types_coexist() -> None:
    collector = _collector()
    collector.record(
        "note_thread_context",
        {},
        {"status": "thread_note", "facets": {"group": "BoursoBank", "sectors": "banque, assurance"}},
    )

    assert collector.state.facets == {"group": "BoursoBank", "sectors": "banque, assurance"}


def test_193_6_a_region_correction_replaces_the_geography_facet() -> None:
    # #193.6 — scénario « correction de région » : la précédente géographie ne
    # doit plus apparaître, seule la corrigée survit.
    collector = _collector()
    collector.record("note_thread_context", {}, {"status": "thread_note", "facets": {"geographies": "Lyon"}})
    collector.record("note_thread_context", {}, {"status": "thread_note", "facets": {"geographies": "Toulouse"}})

    assert collector.state.facets == {"geographies": "Toulouse"}
    assert "Lyon" not in format_thread_state_block(collector.state)


def test_193_6_a_period_change_replaces_the_period_facet() -> None:
    # #193.6 — scénario « changement de période ».
    collector = _collector()
    collector.record("note_thread_context", {}, {"status": "thread_note", "facets": {"periods": "Q4 2026"}})
    collector.record("note_thread_context", {}, {"status": "thread_note", "facets": {"periods": "S1 2027"}})

    assert collector.state.facets == {"periods": "S1 2027"}


def test_193_6_returning_to_the_group_scope_replaces_the_narrower_value() -> None:
    # #193.6 — scénario « retour au scope groupe » : après avoir resserré sur
    # une filiale nommée, l'utilisateur redemande le groupe entier — la
    # nouvelle valeur REMPLACE la resserrée, comme toute facette.
    collector = _collector()
    collector.record("note_thread_context", {}, {"status": "thread_note", "facets": {"group": "BoursoBank"}})
    collector.record(
        "note_thread_context",
        {},
        {"status": "thread_note", "facets": {"group": "Groupe entier, toutes filiales"}},
    )

    assert collector.state.facets == {"group": "Groupe entier, toutes filiales"}


def test_194_2_a_new_correction_replaces_the_previous_one() -> None:
    # #194.2 — comme `goal` : une seule correction active à la fois.
    collector = _collector()
    collector.record(
        "note_thread_context",
        {},
        {"status": "thread_note", "correction": {"correction_type": "wrong_source", "summary": "Source publique"}},
    )
    collector.record(
        "note_thread_context",
        {},
        {"status": "thread_note", "correction": {"correction_type": "wrong_scope", "summary": "Mauvaise couche"}},
    )

    assert collector.state.active_correction is not None
    assert collector.state.active_correction.correction_type == "wrong_scope"
    assert collector.state.active_correction.summary == "Mauvaise couche"


def test_194_2_invalidates_drops_the_named_search_plan() -> None:
    # #194.2 (reste, épopée #3233) — invalidation FORMELLE : l'outil nommé
    # perd son plan de recherche retenu, le prochain `refine` ne le retrouve
    # plus — repartir de zéro, PAS deviner ce qui reste valide.
    collector = _collector()
    collector.record("find_accounts", {"sectors": ["banque"], "department": "75"}, {"accounts": []})
    collector.record("search_talents", {"query": "data"}, {"talents": []})
    assert collector.state.searches.keys() == {"find_accounts", "search_talents"}

    collector.record(
        "note_thread_context",
        {},
        {
            "status": "thread_note",
            "correction": {
                "correction_type": "wrong_scope",
                "summary": "Mauvaise couche",
                "invalidates": ["find_accounts"],
            },
        },
    )

    assert "find_accounts" not in collector.state.searches
    assert "search_talents" in collector.state.searches


def test_194_2_residu_invalidation_retire_aussi_la_proposition_de_l_outil_nomme() -> None:
    # #194.2 (résidu, épopée #3233) — `find_accounts` est une recherche ET une
    # proposition. L'invalider retirait son plan de recherche mais LAISSAIT sa
    # proposition, que le prompt continuait à citer comme « préparée ». Le lien
    # proposition → outil d'origine est maintenant NOMMÉ (`tool`), jamais deviné.
    collector = _collector()
    collector.record(
        "find_accounts",
        {},
        {"status": "pending_confirmation", "proposal": {"action": "find_accounts", "sectors": ["banque"]}},
    )
    collector.record(
        "prepare_message_for_contact",
        {},
        {
            "status": "pending_confirmation",
            "proposal": {"action": "prepare_message", "contact_id": "c-1", "contact_name": "Jean"},
        },
    )
    assert {p.action for p in collector.state.proposals} == {"find_accounts", "prepare_message"}

    collector.record(
        "note_thread_context",
        {},
        {
            "status": "thread_note",
            "correction": {"correction_type": "wrong_sector", "summary": "Mauvais secteur", "invalidates": ["find_accounts"]},
        },
    )

    # La proposition de l'outil invalidé part ; celle d'un AUTRE outil reste (on
    # ne devine jamais une correspondance qu'aucun lien nommé ne porte).
    assert [p.action for p in collector.state.proposals] == ["prepare_message"]


def test_194_2_residu_le_lien_outil_survit_au_tour_suivant_par_le_fil() -> None:
    from app.services.chat_thread_state import thread_state_from_wire

    collector = _collector()
    collector.record(
        "find_accounts",
        {},
        {"status": "pending_confirmation", "proposal": {"action": "find_accounts", "sectors": ["banque"]}},
    )
    wire = collector.state.to_wire()
    assert wire["proposals"][0]["tool"] == "find_accounts"
    assert thread_state_from_wire(wire).proposals[0].tool == "find_accounts"
    # Un état ÉCRIT avant ce lot (sans `tool`) se relit sans erreur : jamais un lien inventé.
    legacy = {**wire, "proposals": [{k: v for k, v in wire["proposals"][0].items() if k != "tool"}]}
    assert thread_state_from_wire(legacy).proposals[0].tool is None


def test_194_2_invalidation_leaves_the_prepare_bilan_with_no_previous_plan() -> None:
    # La preuve que ça marche : après invalidation, `prepare()` ne retrouve
    # plus de critère précédent à affiner pour l'outil nommé.
    collector = _collector()
    collector.record("find_accounts", {"sectors": ["banque"], "department": "75"}, {"accounts": []})
    collector.record(
        "note_thread_context",
        {},
        {
            "status": "thread_note",
            "correction": {
                "correction_type": "wrong_scope",
                "summary": "Mauvaise couche",
                "invalidates": ["find_accounts"],
            },
        },
    )

    _entry, refinement = collector.prepare("find_accounts", {"refine": True, "sectors": ["industrie"]})

    assert refinement is not None
    assert refinement["previous_found"] is False


def test_194_2_invalidates_without_a_matching_search_is_a_no_op() -> None:
    # Un outil nommé sans plan retenu n'a rien à retirer : pas d'erreur, pas
    # de recherche fantôme créée.
    collector = _collector()
    collector.record(
        "note_thread_context",
        {},
        {
            "status": "thread_note",
            "correction": {
                "correction_type": "wrong_scope",
                "summary": "Mauvaise couche",
                "invalidates": ["find_accounts"],
            },
        },
    )

    assert collector.state.searches == {}


def test_the_state_survives_the_round_trip_through_the_wire() -> None:
    collector = _collector()
    collector.record(
        "note_thread_context",
        {},
        {
            "status": "thread_note",
            "goal": "Ouvrir un point d'entrée Data chez ACME",
            "excluded": [{"criterion": "grands groupes", "reason": "hors cible cette année"}],
            "decisions": ["Ne pas relancer avant le comité du 30/09"],
            "current_job": "Préparer 3 messages pour la shortlist ACME",
            "current_step": "Vérification des critères d'accès avant l'envoi",
            "next_step": "Proposer les brouillons une fois la vérification terminée",
            "treated_entities": [{"entity": "BoursoBank", "reason": "filiales et volumes déjà donnés"}],
            "precautions": ["Cette donnée n'est pas mesurée, à confirmer avant l'envoi"],
            "facets": {"group": "BoursoBank et ses filiales"},
            "correction": {
                "correction_type": "wrong_scope",
                "summary": "J'ai utilisé la mauvaise couche",
                "invalidates": ["find_accounts"],
            },
        },
    )

    revived = thread_state_from_wire(collector.state.to_wire())

    assert revived.goal == "Ouvrir un point d'entrée Data chez ACME"
    assert [(e.criterion, e.reason) for e in revived.excluded] == [("grands groupes", "hors cible cette année")]
    assert revived.decisions == ["Ne pas relancer avant le comité du 30/09"]
    assert revived.current_job == "Préparer 3 messages pour la shortlist ACME"
    assert revived.current_step == "Vérification des critères d'accès avant l'envoi"
    assert revived.next_step == "Proposer les brouillons une fois la vérification terminée"
    assert [(e.entity, e.reason) for e in revived.treated_entities] == [
        ("BoursoBank", "filiales et volumes déjà donnés")
    ]
    assert revived.precautions == ["Cette donnée n'est pas mesurée, à confirmer avant l'envoi"]
    assert revived.facets == {"group": "BoursoBank et ses filiales"}
    assert revived.active_correction is not None
    assert revived.active_correction.correction_type == "wrong_scope"
    assert revived.active_correction.summary == "J'ai utilisé la mauvaise couche"
    assert revived.active_correction.invalidates == ("find_accounts",)


def test_an_empty_state_is_still_empty_and_the_prompt_stays_byte_identical() -> None:
    assert ThreadState().is_empty()
    assert format_thread_state_block(ThreadState()) == ""


def test_the_prompt_block_names_them() -> None:
    state = thread_state_from_wire(
        {
            "version": 1,
            "goal": "Ouvrir un point d'entrée Data chez ACME",
            "excluded": [{"criterion": "grands groupes", "reason": "hors cible cette année"}],
            "decisions": ["Ne pas relancer avant le comité du 30/09"],
            "current_job": "Préparer 3 messages pour la shortlist ACME",
            "current_step": "Vérification des critères d'accès avant l'envoi",
            "next_step": "Proposer les brouillons une fois la vérification terminée",
            "treated_entities": [{"entity": "BoursoBank", "reason": "filiales et volumes déjà donnés"}],
            "precautions": ["Cette donnée n'est pas mesurée, à confirmer avant l'envoi"],
            "facets": {"group": "BoursoBank et ses filiales"},
            "correction": {
                "correction_type": "wrong_scope",
                "summary": "J'ai utilisé la mauvaise couche",
                "invalidates": ["find_accounts", "search_talents"],
            },
        }
    )

    block = format_thread_state_block(state)

    assert "Ouvrir un point d'entrée Data chez ACME" in block
    assert "grands groupes" in block and "hors cible cette année" in block
    assert "Ne pas relancer avant le comité du 30/09" in block
    assert "Préparer 3 messages pour la shortlist ACME" in block
    assert "Vérification des critères d'accès avant l'envoi" in block
    assert "Proposer les brouillons une fois la vérification terminée" in block
    assert "BoursoBank" in block and "filiales et volumes déjà donnés" in block
    assert "Cette donnée n'est pas mesurée, à confirmer avant l'envoi" in block
    assert "ne les redis pas mot pour mot par réflexe" in block
    assert "Groupe : BoursoBank et ses filiales" in block
    assert "Mauvais scope" in block and "J'ai utilisé la mauvaise couche" in block
    # #194.2 (reste) — la relance CIBLÉE nomme les outils invalidés, jamais
    # « relance tout ».
    assert "la recherche de comptes" in block and "la recherche de talents" in block
    assert "la recherche dans la mémoire marché" not in block


# ── LE TÉMOIN : aucun détecteur par mots-clés n'a été posé ───────────────────


# ── #2268.1/.5/.10 — SILENCIEUX, comme `note_unrouted_request` ──────────────


def test_a_note_next_to_the_answer_ends_the_turn_without_another_model_call(fake_model) -> None:
    messages = fake_model(
        [
            _resp(
                "tool_use",
                [
                    _text("Je pars sur ACME, hors grands groupes."),
                    _tool_use(
                        "note_thread_context",
                        {"goal": "Ouvrir ACME", "excluded": [{"criterion": "grands groupes"}]},
                        "t1",
                    ),
                ],
            )
        ]
    )
    events: list[dict] = []

    async def emit(event: dict) -> None:
        events.append(event)

    reply, actions = asyncio.run(
        chat_orchestrator.run_chat_with_tools(
            "system", "Trouve-moi des comptes Data", user_id=USER, profile_data=None, emit=emit
        )
    )

    assert reply.startswith("Je pars sur ACME")
    assert len(messages.calls) == 1, "la note ne doit pas payer un aller-retour de modèle de plus"
    assert not [event for event in events if event.get("type") == "step"], "l'outil silencieux n'affiche aucune étape"


def test_a_reply_that_SAYS_a_goal_or_a_decision_puts_nothing_in_the_state() -> None:
    """Le même refus que `chat_thread_state.py:44-49`, étendu à ces trois
    champs : seule la sortie TYPÉE de `note_thread_context` entre dans l'état."""
    collector = _collector()
    collector.record(
        "ask_clarification",
        {},
        {
            "status": "clarification",
            "question": (
                "Mon objectif est d'ouvrir ACME, je décide de ne pas relancer avant le 30/09, "
                "prochaine étape : vérifier les accès. Quel compte ?"
            ),
            "options": ["ACME", "BETA"],
        },
    )

    assert collector.state.goal is None
    assert collector.state.excluded == []
    assert collector.state.decisions == []
    assert collector.state.current_job is None
    assert collector.state.current_step is None
    assert collector.state.next_step is None
    assert collector.state.facets == {}
    assert collector.state.active_correction is None
