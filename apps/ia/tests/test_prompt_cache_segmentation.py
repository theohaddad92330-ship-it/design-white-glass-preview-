"""GA-293 — le cache de prompt de Laura, annulé par l'ordre des blocs.

``claude_service._cached_system`` posait UN SEUL point de coupure
``cache_control: ephemeral`` à la FIN du system prompt. Le cache Anthropic
porte sur le PRÉFIXE jusqu'à ce point de coupure : avec un seul point de
coupure à la fin, le préfixe est TOUT le texte — et comme
``bellum_advisor.build_system_prompt`` commençait par ``_BLOCK_IDENTITY`` puis
finissait par le contenu qui change à chaque tour (``kb``, ``memory``…), CE
préfixe entier ratait le cache à chaque tour, y compris les ~25 000 caractères
des 15 blocs ``_BLOCK_*`` qui, eux, n'ont jamais bougé.

Le correctif SEGMENTE le prompt en trois zones, séparées par
``claude_service.CACHE_SEGMENT_BREAK`` :

1. INVARIANT — les 19 blocs constants (15 à l'ouverture de ce lot, plus
   ``_BLOCK_OUT_OF_SCOPE`` ajouté par #1929.6, plus ``_BLOCK_SUPPORT`` ajouté
   par #1960, plus ``BLOCK_ROLE_AND_VOICE``
   importé de ``laura_role_and_voice.py`` par #1920/#1922/#1923/#1924, plus
   ``THREAD_CONTINUITY_BLOCK`` importé de ``thread_state.py`` par #1927.8, plus
   ``BLOCK_UNKNOWN_REQUEST`` importé de ``laura_unknown_request.py`` par #1949),
   identiques pour absolument toute conversation, tout compte, tout
   utilisateur ;
2. STABLE-PAR-SESSION — le profil ESN, le prénom du vendeur ET la langue de
   réponse (#1958.8), qui ne changent pas d'un tour à l'autre d'une même
   conversation ;
3. VOLATIL — compte analysé, contacts, plan, CRM, outils, écran, pièces
   jointes, RAG, mémoire roulante : tout ce qui peut changer à chaque tour.

``_cached_system`` pose ensuite un ``cache_control`` sur chaque segment SAUF
le dernier (le volatil ne sera jamais relu, l'y cacher ne paierait qu'une
prime d'écriture pour rien).

Ce fichier tient trois preuves, comme toute garde du dépôt : elle SAIT dire
NON (``test_GA_293_the_guard_detects_a_variable_block_glued_before_the_stable_segment``),
elle LIT quelque chose (``test_GA_293_the_guard_reads_a_real_corpus_not_an_empty_one``),
et elle n'attrape pas ce qu'elle ne vise pas
(``test_GA_293_a_legitimate_edit_inside_an_invariant_block_does_not_trip_the_guard``).
"""

from __future__ import annotations

from app.prompts.bellum_advisor import (
    _BLOCK_ASK_FIRST,
    _BLOCK_CLOSING_QUESTION,
    _BLOCK_DISCOVERY,
    _BLOCK_DURABLE_CONTEXT,
    _BLOCK_FORMAT,
    _BLOCK_IDENTITY,
    _BLOCK_LAURA,
    _BLOCK_MARKET_ANSWER,
    _BLOCK_MARKET_MEMORY,
    _BLOCK_MEMORY_GOVERNANCE,
    _BLOCK_OUT_OF_SCOPE,
    _BLOCK_PRIORITISATION,
    _BLOCK_PROTECTED_CRITERIA,
    _BLOCK_SECURITY,
    _BLOCK_SUPPORT,
    _BLOCK_TOOLS,
    _BLOCK_TRUTH,
    _BLOCK_TRUTH_LEVELS,
    build_system_prompt,
)
from app.prompts.laura_role_and_voice import BLOCK_ROLE_AND_VOICE
from app.prompts.laura_unknown_request import BLOCK_UNKNOWN_REQUEST
from app.prompts.thread_state import THREAD_CONTINUITY_BLOCK, THREAD_STATE_HEADER, format_thread_state_block
from app.services.chat_thread_state import ThreadStateCollector
from app.services.claude_service import CACHE_SEGMENT_BREAK, _cached_system

#: Les 19 blocs invariants — 15 mesurés à ~25 423 caractères à l'ouverture de
#: ce lot, plus ``_BLOCK_OUT_OF_SCOPE`` (#1929.6), le bloc de support
#: ``_BLOCK_SUPPORT`` (#1960, `app/prompts/laura_support.py`, 3 612 caractères
#: mesurés à l'ajout), ``BLOCK_ROLE_AND_VOICE`` (#1920/#1922/#1923/#1924, depuis
#: son propre module) et ``THREAD_CONTINUITY_BLOCK`` (#1927.8 — les CONSIGNES du
#: fil, qui ne dépendent d'aucun argument). Si ce compte change sans qu'on l'ait
#: mesuré à nouveau, quelque chose a bougé en silence.
_INVARIANT_BLOCKS = (
    THREAD_CONTINUITY_BLOCK,
    _BLOCK_IDENTITY,
    _BLOCK_OUT_OF_SCOPE,
    _BLOCK_TRUTH,
    _BLOCK_TRUTH_LEVELS,
    _BLOCK_MARKET_MEMORY,
    _BLOCK_MARKET_ANSWER,
    _BLOCK_PRIORITISATION,
    _BLOCK_DISCOVERY,
    _BLOCK_DURABLE_CONTEXT,
    # #2260 — les règles de conflit de la MÉMOIRE (durée de vie), prolongement
    # du contexte durable ci-dessus.
    _BLOCK_MEMORY_GOVERNANCE,
    # #1949 — le repli universel, écrit dans `laura_unknown_request.py`.
    BLOCK_UNKNOWN_REQUEST,
    _BLOCK_ASK_FIRST,
    _BLOCK_CLOSING_QUESTION,
    _BLOCK_TOOLS,
    _BLOCK_PROTECTED_CRITERIA,
    _BLOCK_SECURITY,
    _BLOCK_SUPPORT,
    _BLOCK_LAURA,
    BLOCK_ROLE_AND_VOICE,
    _BLOCK_FORMAT,
)

_PROFILE = {"esn_name": "MonESN", "esn_specialties": ["Data"], "target_sectors": ["Banque"]}
_ACCOUNT = {"company_name": "Groupe Vallée", "sector": "Banque"}


def test_there_are_exactly_twenty_invariant_blocks():
    # #2260 — `_BLOCK_MEMORY_GOVERNANCE` en a fait 21 : la mémoire (durée de
    # vie) est aussi invariante que le contexte durable dont elle prolonge la
    # règle, pour toute conversation.
    assert len(_INVARIANT_BLOCKS) == 21


# ── 1. Le test central : le segment stable survit à un changement du RAG ────


def test_stable_segment_is_byte_identical_when_only_knowledge_context_changes():
    """Deux prompts qui NE diffèrent QUE par ``knowledge_context`` (le RAG,
    qui change à chaque question) doivent produire le MÊME segment invariant
    et le MÊME segment de profil — c'est ce qui rend le cache relisible."""
    prompt_a = build_system_prompt(
        _PROFILE, _ACCOUNT, "Jean - DSI", "Plan A",
        knowledge_context="Extrait RAG A — document Alpha, chunk 3.",
    )
    prompt_b = build_system_prompt(
        _PROFILE, _ACCOUNT, "Jean - DSI", "Plan A",
        knowledge_context="Extrait RAG B, complètement différent et plus long, document Beta.",
    )

    segments_a = prompt_a.split(CACHE_SEGMENT_BREAK)
    segments_b = prompt_b.split(CACHE_SEGMENT_BREAK)

    assert len(segments_a) == 3, (
        "attendu : segment invariant, segment profil (session), segment volatil — "
        f"trouvé {len(segments_a)} segment(s), le prompt n'est pas segmenté"
    )
    assert segments_a[0] == segments_b[0], "le segment INVARIANT a bougé alors que seul le RAG a changé"
    assert segments_a[1] == segments_b[1], "le segment PROFIL (stable sur la session) a bougé"
    # Le knowledge_context est VOLATIL par construction : il doit finir dans
    # le troisième segment, qui lui, est censé changer.
    assert segments_a[2] != segments_b[2], "le RAG ne se retrouve nulle part — il a disparu du prompt"


def test_stable_prefix_precedes_the_last_cache_breakpoint_in_the_actual_api_blocks():
    """Même vérification, mais au niveau des blocs ``cache_control`` réels tels
    qu'ils partent vers l'API — c'est CE format que Claude reçoit."""
    prompt_a = build_system_prompt(
        _PROFILE, _ACCOUNT, "Jean - DSI", "Plan A", knowledge_context="RAG A",
    )
    prompt_b = build_system_prompt(
        _PROFILE, _ACCOUNT, "Jean - DSI", "Plan A", knowledge_context="RAG B" * 200,
    )
    blocks_a = _cached_system(prompt_a)
    blocks_b = _cached_system(prompt_b)

    assert isinstance(blocks_a, list) and isinstance(blocks_b, list)

    def _last_cache_controlled_index(blocks: list[dict]) -> int:
        idxs = [i for i, b in enumerate(blocks) if "cache_control" in b]
        assert idxs, "aucun bloc ne porte de cache_control — le cache ne peut jamais être relu"
        return idxs[-1]

    last_a = _last_cache_controlled_index(blocks_a)
    last_b = _last_cache_controlled_index(blocks_b)
    assert last_a == last_b, "le nombre de points de coupure diffère entre les deux appels"
    assert blocks_a[: last_a + 1] == blocks_b[: last_b + 1], (
        "tout ce qui précède (et inclut) le DERNIER point de coupure doit être "
        "byte-identique entre les deux appels — sinon Anthropic ne peut pas relire le cache"
    )


# ── 2. Le corpus : les 15 blocs sont TOUS dans le premier segment ───────────


def test_all_fifteen_invariant_blocks_are_inside_the_first_stable_segment():
    bare = build_system_prompt({}, {}, "", "")
    first_segment = bare.split(CACHE_SEGMENT_BREAK, 1)[0]
    missing = [i for i, block in enumerate(_INVARIANT_BLOCKS) if block not in first_segment]
    assert not missing, (
        f"bloc(s) invariant(s) absent(s) du segment stable (index {missing}) — "
        "un bloc oublié dans le segment volatil repasse au tarif plein sans que personne ne le voie"
    )


# ── 3. _cached_system : la primitive de segmentation ────────────────────────


def test_cached_system_wraps_each_segment_and_caches_all_but_the_last():
    text = f"stable{CACHE_SEGMENT_BREAK}profil{CACHE_SEGMENT_BREAK}volatil"
    blocks = _cached_system(text)
    assert blocks == [
        {"type": "text", "text": "stable", "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": "profil", "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": "volatil"},
    ]


def test_cached_system_disabled_strips_the_markers_and_returns_plain_text():
    text = f"stable{CACHE_SEGMENT_BREAK}profil{CACHE_SEGMENT_BREAK}volatil"
    assert _cached_system(text, enabled=False) == "stableprofilvolatil"


def test_cached_system_without_any_marker_is_unchanged_single_block_behaviour():
    """Tous les AUTRES prompts du dépôt (facts, signals, strategy…) n'émettent
    aucun marqueur : ce chemin doit rester EXACTEMENT celui d'avant ce lot."""
    assert _cached_system("sys") == [
        {"type": "text", "text": "sys", "cache_control": {"type": "ephemeral"}}
    ]
    assert _cached_system("sys", enabled=False) == "sys"


# ── 4. La garde prouve qu'elle sait dire NON ────────────────────────────────


def test_GA_293_the_guard_detects_a_variable_block_glued_before_the_stable_segment():
    """Reconstruit la FORME EXACTE de la régression que ce lot corrige : un
    extrait qui varie par question (RAG) collé AVANT le premier point de
    coupure au lieu d'après. La comparaison utilisée plus haut doit la voir."""

    def _regressed_prompt(kb: str) -> str:
        return kb + _BLOCK_IDENTITY + CACHE_SEGMENT_BREAK + "profil" + CACHE_SEGMENT_BREAK + "volatil"

    stable_a = _regressed_prompt("Extrait RAG A").split(CACHE_SEGMENT_BREAK, 1)[0]
    stable_b = _regressed_prompt("Extrait RAG B, bien plus long et différent.").split(
        CACHE_SEGMENT_BREAK, 1
    )[0]
    assert stable_a != stable_b, (
        "la garde doit pouvoir DÉTECTER cette régression — sinon elle ne protège rien"
    )


# ── 5. La garde prouve qu'elle LIT quelque chose ────────────────────────────


def test_GA_293_the_guard_reads_a_real_corpus_not_an_empty_one():
    bare = build_system_prompt({}, {}, "", "")
    first_segment = bare.split(CACHE_SEGMENT_BREAK, 1)[0]
    assert len(first_segment) > 20_000, (
        f"le segment stable ne fait que {len(first_segment)} caractères (mesuré : 25 423) — "
        "sous ce plancher, la garde ci-dessus est verte pour de mauvaises raisons"
    )
    assert all(len(block) > 0 for block in _INVARIANT_BLOCKS), "un bloc invariant vide passerait inaperçu"


# ── 6. La garde ne doit PAS attraper ce qu'elle ne vise pas ─────────────────


def test_GA_293_a_legitimate_edit_inside_an_invariant_block_does_not_trip_the_guard():
    """Reformuler un bloc invariant (son CONTENU) n'est pas une régression
    d'ORDRE : la garde compare des POSITIONS, pas un hash figé du contenu."""

    def _shaped_prompt(identity: str, kb: str) -> str:
        return identity + CACHE_SEGMENT_BREAK + "profil" + CACHE_SEGMENT_BREAK + kb

    edited_identity = _BLOCK_IDENTITY + "\n\nPhrase ajoutée par une reformulation légitime."
    a = _shaped_prompt(edited_identity, "RAG A")
    b = _shaped_prompt(edited_identity, "RAG B, différent et plus long")
    assert a.split(CACHE_SEGMENT_BREAK, 1)[0] == b.split(CACHE_SEGMENT_BREAK, 1)[0], (
        "un même contenu de bloc invariant (même édité) ne doit jamais faire "
        "rougir la comparaison — seul un DÉPLACEMENT doit le faire"
    )


# ── 7. #1927.8 — l'ÉTAT DU FIL est variable : jamais dans un segment en cache ──


def _state_block(company: str) -> str:
    thread = ThreadStateCollector()
    thread.record("get_account_briefing", {}, {"account_id": "acc-1", "company_name": company})
    return format_thread_state_block(thread.state)


def _system_with_state(company: str) -> str:
    # Le routeur ajoute le bloc en QUEUE du prompt système (`routers/chat.py`).
    return build_system_prompt(_PROFILE, _ACCOUNT, "Jean - DSI", "Plan A") + _state_block(company)


def test_GA_293_the_thread_state_lands_in_the_uncached_tail_and_leaves_the_cached_blocks_identical():
    blocks_a = _cached_system(_system_with_state("ACME Industrie"))
    blocks_b = _cached_system(_system_with_state("Groupe Vallée"))
    cached_a = [b for b in blocks_a if "cache_control" in b]
    cached_b = [b for b in blocks_b if "cache_control" in b]
    assert cached_a and cached_a == cached_b, "un bloc en cache a bougé quand SEUL l'état du fil a changé"
    assert THREAD_STATE_HEADER in blocks_a[-1]["text"] and "cache_control" not in blocks_a[-1]
    assert all(THREAD_STATE_HEADER not in b["text"] for b in cached_a)


def test_GA_293_the_guard_detects_a_thread_state_glued_into_a_cached_segment():
    """La garde sait dire NON : le même bloc collé AVANT le dernier point de
    coupure fait diverger les segments en cache."""

    def _regressed(company: str) -> str:
        return (
            _BLOCK_IDENTITY
            + CACHE_SEGMENT_BREAK
            + "profil"
            + _state_block(company)
            + CACHE_SEGMENT_BREAK
            + "volatil"
        )

    cached_a = [b for b in _cached_system(_regressed("ACME Industrie")) if "cache_control" in b]
    cached_b = [b for b in _cached_system(_regressed("Groupe Vallée")) if "cache_control" in b]
    assert cached_a != cached_b


def test_GA_293_the_thread_state_guard_reads_a_non_empty_block():
    assert len(_state_block("ACME Industrie")) > 50
    assert format_thread_state_block(ThreadStateCollector().state) == ""
