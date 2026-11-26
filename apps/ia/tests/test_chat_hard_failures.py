"""#2899 (#2443.3 / #2443.6) — la taxonomie des hard failures du chat.

Garde de COMPTE, même patron que `test_copilote_scenario_corpus.py §12` :
elle lit les valeurs RÉELLES de l'enum, jamais un nombre recopié à la main
qui divergerait dès le premier ajout sans qu'elle bouge.
"""

from __future__ import annotations

from app.eval.chat_hard_failures import HARD_FAILURE_SPECS, ChatHardFailure, hard_failure_spec


def test_exactly_thirty_hard_failures() -> None:
    # #2899 (lot X53) — trente-deux depuis « date erronée » et « renvoi vers une
    # page vide » ; #3222 — trente depuis les deux derniers (fait périmé, correction sans rerun) ;
    # #3222.1 (#3197) — vingt-huit depuis l'ajout des sept hard failures de
    # conversation (mauvaise entité, source refusée, ancienne personne présentée
    # comme contact, NO_GO sans explication, aucune alternative, facette
    # perdue, conseil générique), en FIN de liste
    # (GA-08, ordre figé : les vingt-et-une précédentes ne bougent pas).
    assert len(list(ChatHardFailure)) == 32


def test_every_value_has_a_spec_with_a_doctrine_citation() -> None:
    assert set(HARD_FAILURE_SPECS.keys()) == set(ChatHardFailure)
    for failure, spec in HARD_FAILURE_SPECS.items():
        assert spec.fr.strip(), f"{failure} sans texte FR"
        assert spec.en.strip(), f"{failure} sans texte EN"
        assert spec.doctrine_ref.strip(), f"{failure} n'est adossé à aucune doctrine — il serait DEVINÉ"


def test_no_two_failures_share_the_same_doctrine_citation() -> None:
    # Chaque hard failure NOMME un invariant DISTINCT : deux entrées sur la
    # même citation seraient une seule règle comptée deux fois.
    refs = [spec.doctrine_ref for spec in HARD_FAILURE_SPECS.values()]
    assert len(refs) == len(set(refs))


def test_hard_failure_spec_raises_on_an_unknown_value_rather_than_guessing() -> None:
    # `KeyError` explicite plutôt qu'un `.get()` qui rendrait `None` en
    # silence pour une valeur ajoutée à l'enum sans sa spec.
    import pytest

    with pytest.raises(KeyError):
        hard_failure_spec("not_a_real_value")  # type: ignore[arg-type]


def test_values_are_stable_strings_never_renumbered() -> None:
    # GA-08 : une valeur ne change jamais de forme une fois écrite — un futur
    # corpus ou gate qui la citerait littéralement ne doit jamais se rompre.
    assert ChatHardFailure.IDENTITY_ERROR.value == "identity_error"
    assert ChatHardFailure.DONE_WITHOUT_PROOF_OF_SEND.value == "done_without_proof_of_send"
    assert ChatHardFailure.PRIVATE_MESSAGE_BODY_EXPOSED.value == "private_message_body_exposed"
    assert ChatHardFailure.INTERMEDIARY_PRESENTED_AS_FINAL_CLIENT.value == "intermediary_presented_as_final_client"
    assert ChatHardFailure.SCOPE_EXCLUSION_SILENTLY_DROPPED.value == "scope_exclusion_silently_dropped"
    assert ChatHardFailure.CLARIFICATION_ASKED_TWICE.value == "clarification_asked_twice"
    assert (
        ChatHardFailure.FAULT_ACKNOWLEDGED_WITHOUT_REAL_CORRECTION.value
        == "fault_acknowledged_without_real_correction"
    )


def test_private_message_body_exposed_cites_claude_md_not_an_existing_entry() -> None:
    # #2899.23 (#2278.18 « source privée fuitée ») — distinct de CROSS_WORKSPACE_LEAK
    # (un AUTRE espace/membre) et de SECRET_LEAKED (une instruction interne) :
    # celui-ci nomme le corps d'un message de LA MÊME personne, qui ne doit
    # remonter ni au modèle ni à un autre humain (CLAUDE.md § Ce qu'on ne
    # collecte pas ; agent_docs/doctrine.md D65, tenu par
    # test_chat_mailbox_tools.py::test_mailbox_search_never_forwards_message_bodies).
    spec = HARD_FAILURE_SPECS[ChatHardFailure.PRIVATE_MESSAGE_BODY_EXPOSED]
    assert "CORPS des messages" in spec.doctrine_ref or "corps" in spec.doctrine_ref.lower()
    autres_refs = {
        f: s.doctrine_ref for f, s in HARD_FAILURE_SPECS.items() if f != ChatHardFailure.PRIVATE_MESSAGE_BODY_EXPOSED
    }
    assert spec.doctrine_ref not in autres_refs.values()


#: #3222.1 (#3197) — les neuf hard failures de CONVERSATION ajoutés le 02/10/2026,
#: chacun adossé à un invariant déjà écrit ET gardé par un test nommé.
_CONVERSATION_FAILURES = (
    ChatHardFailure.COMPANY_ENTITY_WRONG,
    ChatHardFailure.REFUSED_SOURCE_USED,
    ChatHardFailure.FORMER_PERSON_PRESENTED_AS_CURRENT_CONTACT,
    ChatHardFailure.NO_GO_WITHOUT_EXPLANATION,
    ChatHardFailure.NO_ALTERNATIVE_AFTER_VERDICT,
    ChatHardFailure.THREAD_FACET_DROPPED,
    ChatHardFailure.GENERIC_ADVICE_UNSUPPORTED,
    ChatHardFailure.STALE_FACT_PRESENTED_AS_CURRENT,
    ChatHardFailure.CORRECTION_WITHOUT_RERUN,
    ChatHardFailure.PERIOD_FACTS_BLENDED,
    ChatHardFailure.EMPTY_PAGE_REDIRECT,
)


def test_the_eleven_conversation_failures_are_appended_at_the_end_in_order() -> None:
    values = list(ChatHardFailure)
    assert tuple(values[-11:]) == _CONVERSATION_FAILURES


def test_each_conversation_failure_cites_a_guard_test_that_really_exists() -> None:
    """Une garde protège une règle, elle ne l'invente pas — elle doit LIRE.
    Chaque citation nomme `tests/<fichier>::<test>` : on ouvre le fichier et on
    vérifie que la fonction existe, sinon la citation serait décorative."""
    import re
    from pathlib import Path

    root = Path(__file__).resolve().parent.parent
    for failure in _CONVERSATION_FAILURES:
        ref = HARD_FAILURE_SPECS[failure].doctrine_ref
        cited = re.findall(r"(test_[a-z0-9_]+\.py)::(test_[a-z0-9_]+)", ref)
        assert cited, f"{failure} ne cite aucun test gardien"
        for filename, test_name in cited:
            source = (root / "tests" / filename).read_text(encoding="utf-8")
            assert re.search(rf"def {test_name}\b", source), f"{failure} cite {filename}::{test_name}, introuvable"


# ── #3222 (lot X17) — les deux gardiens qui LISENT le prompt ───────────────────


def test_guard_market_memory_is_never_presented_as_current() -> None:
    """Hard failure « fait périmé / Market Memory présenté comme actuel » : le
    prompt envoyé au modèle doit (1) classer la mémoire marché SOUS une source
    publique actuelle et SOUS un fait privé récent, (2) interdire de la dire
    actuelle, (3) imposer le vocabulaire daté (« a observé »)."""
    from app.prompts.bellum_advisor import _BLOCK_MARKET_MEMORY as block

    rank_private_fact = block.index("un fait privé RÉCENT")
    rank_public_current = block.index("une source publique ACTUELLE")
    rank_market_memory = block.index("l'observation du marché")
    assert rank_private_fact < rank_public_current < rank_market_memory
    assert "ne prouvent JAMAIS, seuls, un besoin actuel" in block
    for forbidden in ("Cette entreprise externalise actuellement", "X est actuellement chez eux"):
        assert f"« {forbidden} »" in block
    assert "Bellum a observé" in block
    # Le référentiel sectoriel reste un instantané DATÉ, jamais un état actuel.
    assert "un instantané DATÉ" in block


def test_guard_a_correction_requires_a_real_rerun_not_an_apology() -> None:
    """Hard failure « correction sans rerun » : tant qu'une correction est
    active, le rappel qui exige de RELANCER les outils est dans le prompt ; sans
    correction, il n'y est pas (prompt inchangé au bit près)."""
    from app.prompts.thread_state import CORRECTION_NOT_REPEATED_BLOCK, correction_not_repeated_block
    from app.services.chat_thread_state import ThreadState, thread_state_from_wire

    assert "RELANCE réellement les outils" in CORRECTION_NOT_REPEATED_BLOCK
    assert "T'excuser sans rien relancer" in CORRECTION_NOT_REPEATED_BLOCK
    assert correction_not_repeated_block(ThreadState()) == ""
    state = thread_state_from_wire(
        {
            "version": 1,
            "correction": {
                "correction_type": "wrong_scope",
                "summary": "Mauvaise couche",
                "invalidates": ["find_accounts"],
            }
        }
    )
    assert state.active_correction
    assert correction_not_repeated_block(state) == CORRECTION_NOT_REPEATED_BLOCK


# ── #2899 (lot X53) — « date erronée » et « redirection vers page vide » ──────


def test_guard_a_period_question_never_blends_facts_of_different_dates() -> None:
    """Hard failure « date erronée » : le prompt interdit de combiner deux faits
    vrais à des dates différentes en une situation actuelle, et de DEVINER une
    borne de période qu'on ne sait pas dater."""
    from app.prompts.bellum_advisor import _BLOCK_TEMPORAL_CLAIMS as block

    assert "jamais en mélangeant silencieusement" in block
    assert "une borne que tu ne peux pas dater dans le dossier est nommée comme telle, jamais devinée" in block
    assert "ne se combinent JAMAIS en une seule situation actuelle" in block
    assert "avec chacun sa date" in block


def test_guard_a_request_is_answered_in_the_chat_never_redirected_to_an_empty_page() -> None:
    """Hard failure « redirection vers page vide » : le plan demandé se répond
    DANS la conversation ; l'écran Actions ne sert qu'à exécuter ou suivre."""
    from app.prompts.bellum_advisor import _BLOCK_TEN_DAY_PLAN as block

    assert "jamais par un renvoi vers une page" in block
    assert "QUE pour exécuter ou suivre ce que tu viens de proposer" in block
    assert "jamais pour répondre à la demande elle-même" in block


def test_the_two_new_failures_cite_distinct_existing_guards() -> None:
    new = (ChatHardFailure.PERIOD_FACTS_BLENDED, ChatHardFailure.EMPTY_PAGE_REDIRECT)
    assert [f.value for f in new] == ["period_facts_blended", "empty_page_redirect"]
    assert HARD_FAILURE_SPECS[new[0]].doctrine_ref != HARD_FAILURE_SPECS[new[1]].doctrine_ref
