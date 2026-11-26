"""#2536.1 — mesuré en recette le 17/09 (cas 1958.18 et 1935.5/.14) : après avoir
répondu au choix que Laura propose, elle redemandait une précision au lieu de
rendre sa carte.

`clarification_already_asked` retirait déjà l'OUTIL `ask_clarification` de la
boîte à outils (`chat_orchestrator.py`, §9.4) — mais rien n'empêchait le modèle
de reposer une question en TEXTE LIBRE, sans passer par l'outil. Le seul texte
qui en parlait vivait dans le segment INVARIANT et FIGÉ
(`thread_state.THREAD_CONTINUITY_BLOCK`, « sinon dis lequel tu retiens et
pourquoi ») : un conseil general noyé parmi d'autres, jamais renforcé au tour
où une clarification vient RÉELLEMENT d'être dépensée.

Ce test prouve que le prompt porte, dans son segment VOLATIL (jamais mis en
cache — GA-293), une consigne SANS AMBIGUÏTÉ quand une clarification a déjà eu
lieu dans ce fil : ni carte, ni question en texte, elle avance avec sa
meilleure hypothèse et rend sa réponse. Absente quand aucune clarification n'a
eu lieu — le prompt reste inchangé au bit près (même garde que
`test_chat_thread_state_turn.py`).

#3854 (BEL-LAU-1008-003) — cette borne ne dure plus la VIE ENTIÈRE du fil :
`ThreadState.has_open_question` ne la tient vraie que pour le tour qui SUIT
celui où la question a été posée (`source_turn` estampillé par le collecteur,
jamais par le modèle — même convention que `ThreadConstraint.source_turn`,
#3224). Une tâche neuve, plusieurs tours plus tard dans le même fil, retrouve
l'outil `ask_clarification`. `test_an_old_clarification_does_not_ban_a_new_one`
ci-dessous en est le test qui sait dire NON à l'ancien défaut (bannissement à
vie) ; les fixtures qui suivent, sans `source_turn`, couvrent le fil
D'AVANT l'estampille — elles restent bannies, par défaut sûr (#3224 déjà pris
cette décision pour les contraintes).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.eval.chat_hard_failures import HARD_FAILURE_SPECS, ChatHardFailure
from app.prompts.thread_state import CLARIFICATION_SPENT_BLOCK
from app.services.claude_service import CACHE_SEGMENT_BREAK

# #2899.26 (#2278.22) — ce test EST l'appelant réel de la taxonomie pour ce
# hard failure : le mécanisme (retrait de l'outil + rappel VOLATIL) existait
# déjà depuis #2536.1, il n'était simplement pas nommé sous le vocabulaire de
# #2443.6.
_CLARIFICATION_ASKED_TWICE = HARD_FAILURE_SPECS[ChatHardFailure.CLARIFICATION_ASKED_TWICE]

_FIXTURE = {
    "version": 1,
    "questions": [{"question": "Quel compte ?", "options": ["ACME", "BETA"]}],
}


def _post(client: TestClient, body: dict) -> dict:
    captured: dict = {}

    async def _fake_run(system, user, **kwargs):
        captured["system"] = system
        captured["kwargs"] = kwargs
        return ("Réponse.", [])

    from unittest.mock import patch

    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run):
        res = client.post("/chat/message", json={"message": "Et lui ?", "user_id": "u1", **body})
    assert res.status_code == 200
    return captured


def test_a_clarification_already_asked_in_the_thread_bans_asking_again_in_text(client: TestClient) -> None:
    captured = _post(client, {"thread_state": _FIXTURE, "clarification_asked": False})
    assert captured["kwargs"]["clarification_already_asked"] is True
    system = captured["system"]
    segments = system.split(CACHE_SEGMENT_BREAK)
    # Segment VOLATIL uniquement (GA-293) : jamais mis en cache.
    assert CLARIFICATION_SPENT_BLOCK in segments[-1], (
        f"Hard failure #2899 : {ChatHardFailure.CLARIFICATION_ASKED_TWICE.value} — "
        f"{_CLARIFICATION_ASKED_TWICE.fr}"
    )
    assert all(CLARIFICATION_SPENT_BLOCK not in segment for segment in segments[:-1])


def test_the_flag_from_the_browser_alone_also_bans_asking_again(client: TestClient) -> None:
    captured = _post(client, {"clarification_asked": True})
    assert CLARIFICATION_SPENT_BLOCK in captured["system"]


def test_without_any_clarification_the_prompt_is_byte_identical_to_before(client: TestClient) -> None:
    captured = _post(client, {"clarification_asked": False})
    assert CLARIFICATION_SPENT_BLOCK not in captured["system"]


def test_an_old_clarification_does_not_ban_a_new_one(client: TestClient) -> None:
    """#3854 (BEL-LAU-1008-003), critère 1 — « Une nouvelle tâche peut recevoir
    une clarification après une ancienne question. » La question a été posée
    au tour 2 (`source_turn`), le fil en est maintenant au tour 5 : ce n'est
    plus LE tour qui suit, l'outil redevient disponible."""
    fixture = {
        "version": 1,
        "turns": 5,
        "questions": [{"question": "Quel compte ?", "options": ["ACME", "BETA"], "source_turn": 2}],
    }
    captured = _post(client, {"thread_state": fixture, "clarification_asked": False})
    assert captured["kwargs"]["clarification_already_asked"] is False
    assert CLARIFICATION_SPENT_BLOCK not in captured["system"]


def test_the_turn_right_after_the_question_still_bans_asking_again(client: TestClient) -> None:
    """Même fixture, mais la question vient d'être posée AU tour qui précède
    celui-ci (`source_turn` == `turns`) : la fenêtre d'un tour est toujours là."""
    fixture = {
        "version": 1,
        "turns": 2,
        "questions": [{"question": "Quel compte ?", "options": ["ACME", "BETA"], "source_turn": 2}],
    }
    captured = _post(client, {"thread_state": fixture, "clarification_asked": False})
    assert captured["kwargs"]["clarification_already_asked"] is True
    assert CLARIFICATION_SPENT_BLOCK in captured["system"]
