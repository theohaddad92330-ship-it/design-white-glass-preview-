"""#1919 — les retours d'une personne sur les réponses de Laura, dans SON prompt.

Ce que ces tests tiennent, dans l'ordre d'importance :

1. **Sans retour, le prompt est BYTE-IDENTIQUE** (#1919.15) — golden
   ``advisor.txt`` et empreinte du registre inchangés, même discipline que
   ``account_feedback`` / ``page_context``.
2. **Le bloc vit dans le segment VOLATIL, jamais dans un segment mis en cache**
   (GA-293). Un retour se donne au milieu d'une conversation : collé avant un
   point de coupure, il invaliderait le cache du profil à chaque clic — et
   placé dans un segment caché, il serait relu PÉRIMÉ.
3. **La règle « un refus unique ne se généralise jamais » voyage avec les
   lignes** (#1919.16). Les lignes elles-mêmes sont déterministes et viennent de
   l'API (``reply-feedback-memory.ts``) ; le bloc porte la consigne de lecture.
4. **Le champ traverse** : ``ChatRequest`` le garde (pydantic avale une clé
   inconnue sans rien dire) et la route le rend au prompt réellement envoyé.

Aucun appel de modèle : l'orchestrateur est remplacé par un capteur.
"""

from __future__ import annotations

from app.models.chat import ChatRequest
from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.reply_feedback import reply_feedback_block
from app.services import rag_service
from app.services.claude_service import CACHE_SEGMENT_BREAK, _cached_system

_PROFILE = {"esn_name": "MonESN", "esn_specialties": ["Data"], "target_sectors": ["Banque"]}
_ACCOUNT = {"company_name": "Groupe Vallée", "sector": "Banque"}

# Ce que l'API compose (``assembleReplyFeedbackMemory``). Recopié ici comme une
# CHARGE UTILE d'exemple : ce fichier vérifie ce que le prompt fait des lignes,
# jamais comment elles sont écrites.
_LINES = (
    "- (2026-09-12) Ta réponse à propos de « Groupe Vallée » : jugée PAS PERTINENTE — motif : mauvais timing. "
    "Ne re-propose pas cette recommandation telle quelle ; ce refus porte sur elle seule."
)
_HEADER = "RETOURS DE LA PERSONNE SUR TES RÉPONSES"


def _prompt(**kwargs) -> str:
    return build_system_prompt(_PROFILE, _ACCOUNT, "Jean - DSI", "{}", **kwargs)


# ── 1. Byte-identique sans retour ───────────────────────────────────────────


def test_without_reply_feedback_the_prompt_is_byte_identical():
    baseline = _prompt()
    assert _prompt(reply_feedback="") == baseline
    assert _prompt(reply_feedback="   \n ") == baseline
    assert _HEADER not in baseline


def test_block_is_empty_without_lines():
    assert reply_feedback_block("") == ""
    assert reply_feedback_block(None) == ""
    assert reply_feedback_block("  \n") == ""


# ── 2. Avec retour : le bloc est LÀ, additif, et porte sa règle ─────────────


def test_lines_reach_the_prompt():
    rendered = _prompt(reply_feedback=_LINES)
    assert _HEADER in rendered
    assert "mauvais timing" in rendered


def test_the_block_is_additive_removing_it_gives_back_the_baseline():
    rendered = _prompt(reply_feedback=_LINES)
    assert rendered.replace(reply_feedback_block(_LINES), "") == _prompt()


def test_GA_1919_16_the_block_says_a_single_refusal_never_generalises():
    """#1919.16 — la règle est écrite là où les lignes sont lues."""
    block = reply_feedback_block(_LINES)
    assert "porte sur l'OBJET refusé" in block
    assert "technologie, une personne ou une entreprise" in block
    assert "RÉPÉTÉ" in block
    # « se dit » : une généralisation appliquée est annoncée à la personne.
    assert "tu le dis" in block


def test_block_caps_hostile_payloads():
    block = reply_feedback_block("x" * 50_000)
    assert len(block) < 6_000


# ── 3. Le cache : le bloc est VOLATIL (GA-293) ─────────────────────────────


def test_reply_feedback_lives_in_the_volatile_segment_never_in_a_cached_one():
    without = _prompt().split(CACHE_SEGMENT_BREAK)
    with_block = _prompt(reply_feedback=_LINES).split(CACHE_SEGMENT_BREAK)
    assert len(with_block) == 3
    assert with_block[0] == without[0], "le segment INVARIANT a bougé à cause d'un retour"
    assert with_block[1] == without[1], "le segment PROFIL (caché par session) a bougé à cause d'un retour"
    assert _HEADER in with_block[2], "le bloc doit finir dans le segment volatil, le seul jamais mis en cache"
    assert _HEADER not in with_block[0] + with_block[1]


def test_the_cached_api_blocks_are_identical_with_and_without_reply_feedback():
    """Même preuve au format réellement envoyé : tout ce qui précède le DERNIER
    ``cache_control`` est byte-identique, donc relisible depuis le cache."""
    blocks_a = _cached_system(_prompt())
    blocks_b = _cached_system(_prompt(reply_feedback=_LINES))
    last_a = max(i for i, block in enumerate(blocks_a) if "cache_control" in block)
    last_b = max(i for i, block in enumerate(blocks_b) if "cache_control" in block)
    assert last_a == last_b
    assert blocks_a[: last_a + 1] == blocks_b[: last_b + 1]


def test_the_guard_sees_a_block_glued_into_a_cached_segment():
    """Sait dire NON : un bloc collé AVANT le second point de coupure change le
    segment profil, et la comparaison ci-dessus le verrait."""
    baseline = _prompt().split(CACHE_SEGMENT_BREAK)
    regressed = _prompt().replace(CACHE_SEGMENT_BREAK, reply_feedback_block(_LINES) + CACHE_SEGMENT_BREAK, 2)
    assert regressed.split(CACHE_SEGMENT_BREAK)[1] != baseline[1]


# ── 4. La traversée ─────────────────────────────────────────────────────────


def test_chat_request_keeps_the_field_and_defaults_to_empty():
    assert ChatRequest(message="m", user_id="u").reply_feedback == ""
    assert ChatRequest(message="m", user_id="u", reply_feedback=_LINES).reply_feedback == _LINES


def test_chat_route_threads_reply_feedback_into_the_prompt_actually_sent(client, monkeypatch):
    captured: list[str] = []

    async def _orchestrate(system, user, **kwargs):
        captured.append(system)
        return ("réponse", [])

    async def _retrieve(*args, **kwargs):
        return []

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _orchestrate)
    monkeypatch.setattr(rag_service, "retrieve_knowledge_docs", _retrieve)

    res = client.post("/chat/message", json={"message": "salut", "user_id": "u", "reply_feedback": _LINES})
    assert res.status_code == 200
    res_without = client.post("/chat/message", json={"message": "salut", "user_id": "u"})
    assert res_without.status_code == 200

    assert len(captured) == 2
    assert _HEADER in captured[0]
    assert "mauvais timing" in captured[0]
    assert _HEADER not in captured[1]
