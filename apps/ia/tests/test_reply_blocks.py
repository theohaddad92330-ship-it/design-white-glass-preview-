"""#1914 — les blocs de réponse de Laura, côté IA.

Le modèle écrit une carte DANS le texte de sa réponse, entre deux clôtures
``bellum-block`` (le canal que `StructuredReply` lit déjà côté web, et que les
deux persistances gardent). Ce fichier tient trois promesses :

  1. PARITÉ — le miroir pydantic traverse le jeu partagé
     ``packages/contracts/src/schemas/reply-blocks.fixtures.json`` exactement
     comme le contrat zod. ⚠️ pydantic IGNORE les clés inconnues : sans
     l'égalité stricte ci-dessous, un champ déclaré d'un côté et oublié de
     l'autre serait demandé, produit, payé… et avalé en silence.
  2. NORMALISATION — ce qui sort du tour est un texte dont chaque bloc est
     valide ou redevenu du texte : jamais un JSON cassé à l'écran ni en base.
  3. TRAVERSÉE — chaque type de bloc arrive jusqu'à ``data.reply`` de
     ``/chat/message``, sur les deux chemins (outils et kill-switch), et c'est
     la version normalisée qui est persistée.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.models.reply_blocks import REPLY_BLOCK_TYPES, mentions_probability, validate_reply_block
from app.services.reply_blocks import (
    REPLY_BLOCK_FENCE,
    REPLY_TEXT_LABELS_FR,
    compact_history_blocks,
    normalize_reply_blocks,
    reply_blocks_as_text,
    split_reply_blocks,
)

_FIXTURES_REL = Path("packages/contracts/src/schemas/reply-blocks.fixtures.json")


def _monorepo_file(rel: Path) -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel
        if candidate.is_file():
            return candidate
    return None


def _load_fixtures() -> dict | None:
    path = _monorepo_file(_FIXTURES_REL)
    return json.loads(path.read_text(encoding="utf-8")) if path else None


_FIXTURES = _load_fixtures()


@pytest.fixture
def fixtures() -> dict:
    if _FIXTURES is None:
        pytest.skip("monorepo absent (image de déploiement) — la parité se vérifie en CI")
    return _FIXTURES


def _fence(block: dict) -> str:
    return f"```{REPLY_BLOCK_FENCE}\n{json.dumps(block, ensure_ascii=False)}\n```"


def _terminal_event(text: str) -> dict:
    events = [
        json.loads(chunk.strip()[len("data:") :].strip())
        for chunk in text.strip().split("\n\n")
        if chunk.strip().startswith("data:")
    ]
    return events[-1]


# ── 1. Parité avec le contrat ────────────────────────────────────────────────


def test_the_shared_fixture_covers_exactly_the_declared_types(fixtures: dict) -> None:
    assert set(fixtures["valid"]) == set(REPLY_BLOCK_TYPES)
    # #3392 / #3428 — `account_volume_sprint` ; #213.2 (#3228) — `count_contract` : quinze ; #3758.2 / #3762 —
    # `account_map` : seize ; #3758 (reste) — `post_meeting_summary` : dix-sept ; #2985 (lot E07 08/10) —
    # `manager_review` : dix-huit.
    assert len(REPLY_BLOCK_TYPES) == 18


@pytest.mark.parametrize("block_type", REPLY_BLOCK_TYPES)
def test_each_declared_type_crosses_the_mirror_without_losing_a_key(fixtures: dict, block_type: str) -> None:
    block = fixtures["valid"][block_type]
    assert validate_reply_block(block) == block


def test_an_undeclared_key_disappears_and_null_becomes_absent(fixtures: dict) -> None:
    assert fixtures["stripped"], "corpus vide — la garde ne garderait rien"
    for entry in fixtures["stripped"]:
        assert validate_reply_block(entry["input"]) == entry["output"], entry["why"]


def test_what_must_never_become_a_card_is_refused(fixtures: dict) -> None:
    assert len(fixtures["invalid"]) > 10
    for entry in fixtures["invalid"]:
        assert validate_reply_block(entry["block"]) is None, entry["why"]


def test_no_probability_passes_and_a_neighbouring_word_is_not_caught(fixtures: dict) -> None:
    for sample in fixtures["probability"]:
        assert mentions_probability(sample), sample
    for sample in fixtures["neutral"]:
        assert not mentions_probability(sample), sample


def test_the_split_is_the_same_as_the_web_one(fixtures: dict) -> None:
    for entry in fixtures["replies"]:
        assert [segment.kind for segment in split_reply_blocks(entry["text"])] == entry["kinds"], entry["why"]


# ── 2. Normalisation de ce qui sort du tour ──────────────────────────────────


def test_a_reply_without_block_is_byte_identical() -> None:
    reply = "Bonjour.\n\n- un point\n\n  Deux espaces en fin  "
    assert normalize_reply_blocks(reply) == reply
    assert reply_blocks_as_text(reply) == reply


def test_a_valid_block_is_rewritten_in_its_validated_form(fixtures: dict) -> None:
    noisy = {**fixtures["valid"]["verdict"], "score": 72}
    reply = (
        f"Mon verdict.\n\n```{REPLY_BLOCK_FENCE}\nVoici {json.dumps(noisy, ensure_ascii=False)} fin\n```\n\nOn y va ?"
    )
    out = normalize_reply_blocks(reply)
    segments = split_reply_blocks(out)
    assert [s.kind for s in segments] == ["text", "block", "text"]
    assert segments[1].block == fixtures["valid"]["verdict"]
    assert '"score"' not in out


def test_an_invalid_block_falls_back_to_its_own_texts(fixtures: dict) -> None:
    ranking_without_axes = {**fixtures["valid"]["account_ranking"], "axes": []}
    out = normalize_reply_blocks(f"Classement.\n\n{_fence(ranking_without_axes)}")
    assert REPLY_BLOCK_FENCE not in out
    assert "- Alpha Industrie" in out
    assert "- Signal cyber daté de juillet 2026." in out
    assert "/accounts/alpha-1" not in out


def test_an_unreadable_block_disappears_without_eating_the_text() -> None:
    out = normalize_reply_blocks(f'Avant.\n\n```{REPLY_BLOCK_FENCE}\n{{"type": "verdict", \n```\n\nAprès.')
    assert out == "Avant.\n\nAprès."


def test_a_reply_cut_inside_a_block_never_leaves_a_fence_behind() -> None:
    out = normalize_reply_blocks(f'Je prépare.\n\n```{REPLY_BLOCK_FENCE}\n{{"type":"account_ranking","axes":["Sig')
    assert out == "Je prépare."


def test_a_complete_block_whose_closing_fence_was_forgotten_is_kept(fixtures: dict) -> None:
    block = fixtures["valid"]["missing_data"]
    out = normalize_reply_blocks(f"Il me manque une chose.\n\n```{REPLY_BLOCK_FENCE}\n{json.dumps(block)}")
    assert [s.kind for s in split_reply_blocks(out)] == ["text", "block"]


def test_history_carries_the_texts_of_a_block_not_its_json(fixtures: dict) -> None:
    history = [
        {"role": "user", "content": "Par où je commence ?"},
        {"role": "assistant", "content": f"Voici.\n\n{_fence(fixtures['valid']['account_ranking'])}"},
    ]
    compacted = compact_history_blocks(history)
    assert compacted[0] == history[0]
    assert REPLY_BLOCK_FENCE not in compacted[1]["content"]
    assert "Alpha Industrie" in compacted[1]["content"]
    assert history[1]["content"].count(REPLY_BLOCK_FENCE) == 1, "l'historique d'origine n'est pas muté"


# ── 3. Traversée jusqu'à la réponse de /chat/message ─────────────────────────


def _reply_with_every_block(fixtures: dict) -> str:
    parts = ["Voici ce que je vois."]
    parts += [_fence(fixtures["valid"][block_type]) for block_type in REPLY_BLOCK_TYPES]
    parts.append(_fence({"type": "dashboard", "items": ["Un tableau de bord"]}))
    parts.append("Par lequel on commence ?")
    return "\n\n".join(parts)


def _assert_every_type_arrived(reply: str, fixtures: dict) -> None:
    blocks = [s.block for s in split_reply_blocks(reply) if s.kind == "block"]
    assert [b["type"] for b in blocks] == list(REPLY_BLOCK_TYPES)
    for block in blocks:
        assert block == fixtures["valid"][block["type"]]
    assert "- Un tableau de bord" in reply, "le bloc inconnu redevient du texte, il ne disparaît pas"
    assert '"dashboard"' not in reply


def test_every_block_type_reaches_the_reply_on_the_kill_switch_path(
    client: TestClient, monkeypatch, fixtures: dict
) -> None:
    monkeypatch.setenv("CHAT_TOOLS_DISABLED", "true")
    save_turn = AsyncMock()
    with (
        patch(
            "app.routers.chat.call_claude",
            new_callable=AsyncMock,
            return_value=(_reply_with_every_block(fixtures), None),
        ),
        patch("app.routers.chat.conversation_service.save_turn", save_turn),
    ):
        res = client.post("/chat/message", json={"message": "Priorise mes comptes", "user_id": "u1"})
    body = _terminal_event(res.text)
    assert body["success"] is True
    _assert_every_type_arrived(body["data"]["reply"], fixtures)
    persisted = [c.args[4] for c in save_turn.await_args_list if c.args[3] == "assistant"]
    assert persisted == [body["data"]["reply"]], "c'est la version NORMALISÉE qui est gardée en mémoire de fil"


def test_every_block_type_reaches_the_reply_on_the_tools_path(client: TestClient, monkeypatch, fixtures: dict) -> None:
    monkeypatch.delenv("CHAT_TOOLS_DISABLED", raising=False)
    with (
        patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new_callable=AsyncMock,
            return_value=(_reply_with_every_block(fixtures), []),
        ),
        patch("app.routers.chat.conversation_service.save_turn", AsyncMock()),
    ):
        res = client.post("/chat/message", json={"message": "Priorise mes comptes", "user_id": "u1"})
    body = _terminal_event(res.text)
    assert body["success"] is True
    _assert_every_type_arrived(body["data"]["reply"], fixtures)


def test_the_model_rereads_a_previous_card_as_text(client: TestClient, monkeypatch, fixtures: dict) -> None:
    monkeypatch.setenv("CHAT_TOOLS_DISABLED", "true")
    call = AsyncMock(return_value=("D'accord.", None))
    history = [
        {"role": "user", "content": "Par où je commence ?"},
        {"role": "assistant", "content": f"Voici.\n\n{_fence(fixtures['valid']['comparison'])}"},
    ]
    with (
        patch("app.routers.chat.call_claude", call),
        patch("app.routers.chat.conversation_service.save_turn", AsyncMock()),
    ):
        client.post("/chat/message", json={"message": "Et le second ?", "user_id": "u1", "history": history})
    user_prompt = call.await_args.args[1]
    assert REPLY_BLOCK_FENCE not in user_prompt
    # Une case se relit AVEC sa colonne, et une case inconnue reste « non mesuré » :
    # « Deux ESN identifiées » seul ne dirait plus pour quel compte.
    assert "- Beta Services — Deux ESN identifiées" in user_prompt
    assert "- Alpha Industrie — non mesuré" in user_prompt


# ── 4. Le TEXTE d'une réponse à cartes — parité avec le contrat TypeScript ───


def test_the_python_labels_are_the_shared_ones(fixtures: dict) -> None:
    assert fixtures["plain_text"]["labels"] == REPLY_TEXT_LABELS_FR


@pytest.mark.parametrize("block_type", REPLY_BLOCK_TYPES)
def test_each_card_reads_as_the_same_text_as_the_contract(fixtures: dict, block_type: str) -> None:
    out = reply_blocks_as_text(_fence(fixtures["valid"][block_type]))
    assert out == fixtures["plain_text"]["by_type"][block_type]
    assert REPLY_BLOCK_FENCE not in out


def test_the_plain_text_cases_match_the_contract(fixtures: dict) -> None:
    assert fixtures["plain_text"]["cases"], "corpus vide — la garde ne garderait rien"
    for entry in fixtures["plain_text"]["cases"]:
        assert reply_blocks_as_text(entry["text"]) == entry["expected"], entry["why"]
