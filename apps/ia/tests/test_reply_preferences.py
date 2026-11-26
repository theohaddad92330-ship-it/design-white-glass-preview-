"""#1928.2/.3/.5/.6 — la façon dont Laura répond, réglée par la personne.

Ce que ce fichier tient, dans l'ordre d'importance :

1. **ABSENT = prompt BYTE-IDENTIQUE.** Aucun sac, un sac sans clé de réponse,
   une clé de réponse à valeur inconnue : le prompt d'avant ce lot, au
   caractère près (le golden ``advisor.txt`` ne bouge pas).
2. **Chaque réglage connu ATTEINT le prompt** — et jamais sous sa forme brute
   dans la MÉMOIRE (« - replyLength : short » serait une clé technique lue par
   le modèle comme une préférence libre).
3. **HORS des segments mis en cache (GA-293).** La préférence est PAR
   UTILISATEUR et peut changer entre deux tours : elle vit dans le segment
   VOLATIL. Les deux segments cachés restent identiques quelle que soit la
   préférence — c'est la preuve demandée.
4. **La forme, jamais le fond (#1928.10).** Le segment des règles de vérité
   est identique avec ou sans préférence, et le bloc le redit là où il est lu.
5. **La COPIE Python ne diverge pas du contrat TS** — la garde LIT le fichier
   et prouve qu'elle y trouve quelque chose.
6. **Le chemin RÉEL** : le corps que l'API envoie → pydantic → routeur →
   prompt passé au modèle. ``pydantic`` avale les clés INCONNUES : un test qui
   n'appellerait que ``build_system_prompt`` ne verrait pas ce défaut-là.
7. **Le texte du bloc est épinglé** (``tests/golden/reply_preferences_block.txt``,
   régénéré par ``UPDATE_PROMPT_GOLDEN=1``).
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import pytest

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.reply_preferences import (
    REPLY_PREFERENCES,
    reply_preferences_block,
    without_reply_preferences,
)
from app.services import rag_service
from app.services.claude_service import CACHE_SEGMENT_BREAK, _cached_system

_PROFILE = {"esn_name": "MonESN", "esn_specialties": ["Data"], "target_sectors": ["Banque"]}
_ACCOUNT = {"company_name": "Groupe Vallée", "sector": "Banque"}
_HEADER = "PRÉFÉRENCES DE RÉPONSE"

_ALL_FIRST = {"replyLength": "short", "replyTone": "direct", "replyFormat": "text", "replySources": "minimal"}
_ALL_SECOND = {"replyLength": "detailed", "replyTone": "teaching", "replyFormat": "lists", "replySources": "detailed"}


def _prompt(**kwargs) -> str:
    return build_system_prompt(_PROFILE, _ACCOUNT, "Jean - DSI", "Plan A", **kwargs)


# ── 1. Absent = byte-identique ──────────────────────────────────────────────


def test_absent_preferences_leave_the_prompt_byte_identical():
    baseline = _prompt()
    assert _HEADER not in baseline
    assert _prompt(user_preferences={}) == baseline
    assert _prompt(user_preferences=None) == baseline
    # Une clé de réponse à valeur inconnue (écrite avant la validation, ou
    # corrompue) ne produit NI bloc NI ligne brute dans la mémoire.
    assert _prompt(user_preferences={"replyLength": "banana", "replyTone": None}) == baseline


def test_a_free_form_preference_keeps_its_historical_rendering():
    """Les clés libres qui vivaient déjà dans le sac sont rendues EXACTEMENT
    comme avant : ce lot ne touche que ses quatre clés."""
    rendered = _prompt(user_preferences={"tone": "direct"})
    assert "Préférences de l'utilisateur :\n- tone : direct" in rendered
    assert _HEADER not in rendered


# ── 2. Chaque réglage connu atteint le prompt ───────────────────────────────


@pytest.mark.parametrize(
    ("key", "value", "marker"),
    [
        ("replyLength", "short", "Longueur : courte"),
        ("replyLength", "detailed", "Longueur : détaillée"),
        ("replyTone", "direct", "Ton : direct"),
        ("replyTone", "teaching", "Ton : pédagogique"),
        ("replyFormat", "text", "Format : texte"),
        ("replyFormat", "lists", "Format : listes"),
        ("replySources", "minimal", "Explication des sources : minimale"),
        ("replySources", "detailed", "Explication des sources : détaillée"),
    ],
)
def test_each_known_setting_reaches_the_prompt(key, value, marker):
    rendered = _prompt(user_preferences={key: value})
    assert _HEADER in rendered
    assert marker in rendered


def test_every_option_of_the_contract_has_a_directive():
    """La garde LIT quelque chose : huit valeurs, huit consignes non vides."""
    count = 0
    for key, values in REPLY_PREFERENCES.items():
        for value in values:
            block = reply_preferences_block({key: value})
            assert block.strip(), f"{key}={value} ne produit aucune consigne"
            count += 1
    assert count == 8


def test_a_reply_key_never_leaks_raw_into_the_memory_block():
    rendered = _prompt(user_preferences={"replyLength": "short", "tone": "direct"})
    assert "- replyLength" not in rendered
    assert "replyLength" not in rendered
    assert "- tone : direct" in rendered
    assert "Longueur : courte" in rendered


def test_without_reply_preferences_returns_the_same_bag_when_nothing_to_strip():
    bag = {"tone": "direct"}
    assert without_reply_preferences(bag) is bag
    assert without_reply_preferences(None) is None
    assert without_reply_preferences({"replyTone": "direct", "tone": "x"}) == {"tone": "x"}


# ── 3. Hors des segments mis en cache ───────────────────────────────────────


def test_the_block_lives_in_the_volatile_segment_never_in_a_cached_one():
    short = _prompt(user_preferences={"replyLength": "short"})
    detailed = _prompt(user_preferences={"replyLength": "detailed"})
    baseline = _prompt()

    s, d, b = (p.split(CACHE_SEGMENT_BREAK) for p in (short, detailed, baseline))
    assert len(s) == len(d) == len(b) == 3
    # Les DEUX segments cachés ne dépendent pas de la préférence…
    assert s[0] == d[0] == b[0], "le segment INVARIANT (partagé par tous) a bougé avec une préférence personnelle"
    assert s[1] == d[1] == b[1], "le segment STABLE-PAR-SESSION a bougé avec une préférence"
    # …et le bloc est bien là, dans le troisième.
    assert _HEADER in s[2] and _HEADER in d[2]
    assert _HEADER not in s[0] + s[1]
    assert s[2] != d[2]


def test_cached_api_blocks_are_identical_whatever_the_preference():
    """Même preuve au niveau des blocs ``cache_control`` qui partent vraiment."""
    blocks_a = _cached_system(_prompt(user_preferences=_ALL_FIRST))
    blocks_b = _cached_system(_prompt(user_preferences=_ALL_SECOND))
    cached_a = [block for block in blocks_a if "cache_control" in block]
    cached_b = [block for block in blocks_b if "cache_control" in block]
    assert cached_a, "aucun bloc caché — la preuve ne lirait rien"
    assert cached_a == cached_b
    assert all(_HEADER not in block["text"] for block in cached_a)


# ── 4. La forme, jamais le fond ─────────────────────────────────────────────


def test_the_block_says_it_suspends_no_truth_rule():
    block = reply_preferences_block(_ALL_FIRST)
    assert "ne suspendent AUCUNE règle" in block
    assert "source non consultée" in block


def test_a_minimal_sources_preference_leaves_the_not_consulted_guardrail_in_place():
    rendered = _prompt(
        user_preferences={"replySources": "minimal"},
        not_consulted=["CRM non connecté"],
    )
    assert "SOURCES NON DISPONIBLES POUR CETTE RÉPONSE" in rendered
    assert "CRM non connecté" in rendered


# ── 5. La copie Python ne diverge pas du contrat TS ─────────────────────────

_TS_REL = Path("packages/contracts/src/schemas/reply-preferences.ts")


def _monorepo_file(rel: Path) -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel
        if candidate.is_file():
            return candidate
    return None


def _ts_options() -> dict[str, tuple[str, ...]]:
    source_path = _monorepo_file(_TS_REL)
    if source_path is None:
        pytest.skip("monorepo absent (image de déploiement) — la parité se vérifie en CI")
    source = source_path.read_text(encoding="utf-8")
    body = source.split("export const REPLY_PREFERENCE_OPTIONS = {", 1)[1].split("} as const", 1)[0]
    return {
        key: tuple(re.findall(r"'([a-z]+)'", values))
        for key, values in re.findall(r"^\s*(reply[A-Za-z]+): \[([^\]]*)\],$", body, flags=re.MULTILINE)
    }


def test_python_mirror_matches_the_contract():
    options = _ts_options()
    assert len(options) == 4, f"extraction vide ou partielle ({options}) — la garde ne garderait rien"
    assert options == REPLY_PREFERENCES


# ── 6. Le chemin réel : corps de l'API → pydantic → routeur → modèle ────────


def _terminal_event(text: str) -> dict:
    events = [json.loads(line[len("data: ") :]) for line in text.splitlines() if line.startswith("data: ")]
    return next(event for event in reversed(events) if event.get("type") == "done")


def test_the_preference_sent_by_the_api_reaches_the_prompt_given_to_the_model(client, monkeypatch):
    captured: dict[str, str] = {}

    async def _orchestrate(system, user, **kwargs):
        captured["system"] = system
        return ("réponse", [])

    async def _retrieve(*args, **kwargs):
        return []

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _orchestrate)
    monkeypatch.setattr(rag_service, "retrieve_knowledge_docs", _retrieve)
    # La forme EXACTE de `ia.client.ts::chatBody` : le sac entier sous
    # `user_preferences`, clés libres comprises.
    res = client.post(
        "/chat/message",
        json={
            "message": "par où commencer ?",
            "user_id": "u",
            "user_preferences": {"replyLength": "short", "replySources": "detailed", "tone": "direct"},
        },
    )
    assert res.status_code == 200
    assert _terminal_event(res.text)["success"] is True
    system = captured["system"]
    assert "Longueur : courte" in system
    assert "Explication des sources : détaillée" in system
    assert "- tone : direct" in system
    assert "replyLength" not in system


# ── 7. Le texte du bloc est épinglé ─────────────────────────────────────────

_GOLDEN = Path(__file__).parent / "golden" / "reply_preferences_block.txt"


def test_the_block_text_matches_its_golden():
    rendered = (
        "### première valeur de chaque réglage"
        + reply_preferences_block(_ALL_FIRST)
        + "\n\n### seconde valeur de chaque réglage"
        + reply_preferences_block(_ALL_SECOND)
        + "\n"
    )
    if os.getenv("UPDATE_PROMPT_GOLDEN") == "1":
        _GOLDEN.write_text(rendered, encoding="utf-8")
        return
    assert _GOLDEN.exists(), "golden absent — `UPDATE_PROMPT_GOLDEN=1 pytest tests/test_reply_preferences.py`"
    assert rendered == _GOLDEN.read_text(encoding="utf-8"), (
        "le texte du bloc a changé — si c'est voulu, régénérer avec UPDATE_PROMPT_GOLDEN=1 et relire le diff"
    )
