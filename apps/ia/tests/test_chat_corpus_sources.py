"""#2899 (#2443.2) — le registre des neuf sources du corpus chat, gardé.

Une garde qui LIT : chaque source déclarée peuplée doit rendre un compte
RÉEL (>0, mesuré en relisant son corpus versionné), et chaque source vide
doit porter une raison écrite — jamais les deux à la fois, jamais ni l'un ni
l'autre.
"""

from __future__ import annotations

from app.eval.chat_corpus_sources import (
    EMPTY_SOURCE_REASONS,
    SOURCE_LABELS,
    ChatCorpusSource,
    populated_sources,
    source_total,
)

#: L'ordre GA-08 du corps de l'issue #2443 — figé, un ajout va en FIN.
_EXPECTED_ORDER = (
    ChatCorpusSource.PREPARED_REQUESTS,
    ChatCorpusSource.REAL_CONVERSATION_EXPORTS,
    ChatCorpusSource.EXPORT_CORRECTIONS,
    ChatCorpusSource.PROJECTED_REQUESTS,
    ChatCorpusSource.ANTOINE_FEEDBACK,
    ChatCorpusSource.SALESCONNECT_CASES,
    ChatCorpusSource.HISTORICAL_CORPUS,
    ChatCorpusSource.VALIDATED_SUPPORT_CONVERSATIONS,
    ChatCorpusSource.ANONYMIZED_PRODUCTION_ERRORS,
)


def test_exactly_nine_sources_in_the_frozen_order():
    assert tuple(ChatCorpusSource) == _EXPECTED_ORDER
    assert len(ChatCorpusSource) == 9


def test_every_source_has_a_bilingual_label():
    for source in ChatCorpusSource:
        label = SOURCE_LABELS[source]
        assert label.fr.strip()
        assert label.en.strip()


def test_every_source_is_either_populated_or_named_empty_never_both_never_neither():
    populated = set(populated_sources())
    empty = set(EMPTY_SOURCE_REASONS)
    assert populated.isdisjoint(empty)
    assert populated | empty == set(ChatCorpusSource)


def test_populated_sources_are_really_measured_not_a_frozen_number():
    counts = populated_sources()
    assert counts[ChatCorpusSource.PREPARED_REQUESTS] >= 100
    assert counts[ChatCorpusSource.HISTORICAL_CORPUS] > 0
    assert counts[ChatCorpusSource.PROJECTED_REQUESTS] > 0
    for count in counts.values():
        assert isinstance(count, int) and count > 0


def test_empty_sources_each_carry_a_concrete_written_reason():
    for source, reason in EMPTY_SOURCE_REASONS.items():
        assert reason.strip(), f"{source} n'a aucune raison écrite"
        assert len(reason) > 20, f"{source} : raison trop courte pour être concrète"


def test_source_total_sums_only_the_populated_sources():
    assert source_total() == sum(populated_sources().values())
    assert source_total() > 0
