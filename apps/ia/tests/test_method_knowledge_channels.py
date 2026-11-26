"""#3382.a — le filtre `applicable_channels` entre dans le chat Laura.

`selectApplicableMethodRules` (contrats TS) filtrait par canal mais n'avait aucun
appelant de production : le chat lit le corpus gouverné côté Python
(`method_knowledge.retrieve_method_chunks_with_rules`). Ce fichier prouve que le
filtre y est branché ET qu'il sait dire NON : une règle d'un AUTRE canal est
absente du retour, une règle sans canal reste servie partout.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.knowledge import method_corpus_governance
from app.services import method_knowledge


def _synthetic_corpus() -> tuple[dict, ...]:
    def chunk(title: str, content: str, channels: tuple[str, ...]) -> dict:
        return {
            "title": title,
            "content": content,
            "category": method_knowledge.CATEGORY_METHOD,
            "sector_key": None,
            "_rule_id": title,
            "_unit_id": None,
            "_channels": channels,
            "_title_tokens": method_knowledge._tokens(title),
            "_content_tokens": method_knowledge._tokens(content),
        }

    return (
        chunk("Ouverture linkedin discrete", "ouverture discrete messagerie reseau", ("linkedin",)),
        chunk("Ouverture telephone directe", "ouverture directe appel accroche", ("phone",)),
        chunk("Ouverture tous canaux", "ouverture generale accroche relation", ()),
    )


@pytest.fixture
def corpus(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(method_knowledge, "_corpus", _synthetic_corpus)


def _titles(channel: str | None) -> list[str]:
    chunks, _ = method_knowledge.retrieve_method_chunks_with_rules("ouverture accroche", channel=channel)
    return [c["title"] for c in chunks]


def test_rule_of_another_channel_is_absent(corpus: None) -> None:
    titles = _titles("phone")
    assert "Ouverture telephone directe" in titles
    assert "Ouverture linkedin discrete" not in titles
    assert "Ouverture tous canaux" in titles


def test_rule_of_the_requested_channel_is_present(corpus: None) -> None:
    titles = _titles("linkedin")
    assert "Ouverture linkedin discrete" in titles
    assert "Ouverture telephone directe" not in titles


def test_unknown_channel_serves_only_channel_free_rules(corpus: None) -> None:
    # Même sémantique que le TS : une règle bornée à un canal ne sort pas quand
    # le tour n'en déclare aucun.
    assert _titles(None) == ["Ouverture tous canaux"]


def test_default_call_is_byte_identical_for_the_real_corpus() -> None:
    # Aucune des règles servies aujourd'hui ne déclare de canal (miroir du TS) :
    # le paramètre neuf ne change RIEN au retrieval réel.
    query = "combien de contacts je dois viser sur ce compte ?"
    without = method_knowledge.retrieve_method_chunks_with_rules(query)
    with_channel = method_knowledge.retrieve_method_chunks_with_rules(query, channel="phone")
    assert without == with_channel


def test_served_rules_declare_no_channel_like_the_ts_corpus() -> None:
    assert all(not method_corpus_governance.rule_channels(rule_id) for rule_id in method_corpus_governance.wired_rule_ids())


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Prépare mon appel à froid pour demain", "phone"),
        ("Écris-moi un mail de relance", "email"),
        ("Rédige un message LinkedIn", "linkedin"),
        ("Prépare mon rendez-vous de jeudi", "meeting"),
        ("Un mail puis un appel", None),  # deux canaux : on ne devine pas
        ("Où en est ce compte ?", None),
        ("", None),
    ],
)
def test_detect_turn_channel(message: str, expected: str | None) -> None:
    assert method_knowledge.detect_turn_channel(message) == expected


# ── #3382.a — les règles SalesConnect bornées à un canal sont dans le corpus servi ──


def _served_channel_rules() -> list[dict]:
    path = Path(method_corpus_governance.__file__).with_name("method_channel_rules.json")
    return json.loads(path.read_text(encoding="utf-8"))


def _real_titles(query: str, channel: str | None) -> str:
    chunks, _ = method_knowledge.retrieve_method_chunks_with_rules(query, channel=channel, top_k=10)
    return " | ".join(c["title"] for c in chunks).lower()


def test_the_seven_governed_channel_rules_are_served_with_their_channel() -> None:
    rules = _served_channel_rules()
    assert len(rules) == 7  # preuve que le test lit quelque chose (miroir TS : 5 LinkedIn + 2 téléphone)
    for rule in rules:
        chunk = next(c for c in method_knowledge._corpus() if c["_rule_id"] == rule["rule_id"])
        assert chunk["_channels"] == tuple(rule["applicable_channels"])
        assert method_corpus_governance.rule_channels(rule["rule_id"]) == chunk["_channels"]


def test_linkedin_question_serves_the_linkedin_rule_and_not_the_phone_rule() -> None:
    titles = _real_titles("Comment structurer mon premier message LinkedIn pour vendre ?", "linkedin")
    assert "un premier message linkedin" in titles
    assert "pitch téléphonique" not in titles


def test_phone_question_serves_the_phone_rule_and_not_the_linkedin_rule() -> None:
    titles = _real_titles("Mon pitch téléphonique doit parler du besoin ou du profil ?", "phone")
    assert "pitch téléphonique" in titles
    assert "premier message linkedin" not in titles


def test_without_a_declared_channel_no_channel_rule_is_served() -> None:
    titles = _real_titles("premier message LinkedIn pitch téléphonique besoin profil", None)
    assert "premier message linkedin" not in titles
    assert "pitch téléphonique" not in titles
