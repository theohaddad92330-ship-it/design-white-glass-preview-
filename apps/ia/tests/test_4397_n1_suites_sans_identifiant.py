"""#4397 (recette 21/10, N1) — une suggestion cliquée n'écrit JAMAIS un identifiant dans le message.

Le gabarit ``follow_*_ask`` mettait « (consultant du vivier <uuid>) » dans le texte envoyé au clic :
le message de l'utilisateur affichait un UUID brut. Le texte visible n'en porte plus ; l'identifiant
voyage en métadonnée (``talent_id`` de la suite, puis ``follow_up_ref`` du tour) et l'IA le lit là.
"""

from __future__ import annotations

import re
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.chat import ChatRequest
from app.prompts.follow_up_ref import follow_up_ref_block
from app.services import chat_orchestrator
from app.services.known_shape_gate import shape_read_from_tool

_UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)
_TALENT = "34f4c624-1111-4222-8333-444455556666"


def _output() -> dict:
    return {
        "status": "ok",
        "consultant": {"id": _TALENT, "name": "Marie Dupont"},
        "accounts": [
            {"name": "Sopra Steria", "why": ["Java demandé sur le 69."], "observed_on": "2026-10-01"},
        ],
    }


def _follow_ups(language: str) -> list[dict]:
    from app.services import known_shape_gate as gate

    block = gate._talent_ranking(_output(), gate._labels(language))  # type: ignore[attr-defined]
    assert block is not None
    return block["items"][0]["follow_ups"]


@pytest.mark.parametrize("language", ["fr", "en"])
def test_les_suites_ne_portent_aucun_uuid_dans_leur_texte(language: str) -> None:
    ups = _follow_ups(language)
    assert len(ups) == 3
    for up in ups:
        assert not _UUID_RE.search(up["ask"]), up["ask"]
        assert not _UUID_RE.search(up["label"])
        assert "Marie Dupont" in up["ask"]
        assert "Sopra Steria" in up["ask"]
        # l'identifiant voyage en métadonnée de l'option
        assert up["talent_id"] == _TALENT


def test_la_suite_analyse_est_la_phrase_attendue() -> None:
    ask = _follow_ups("fr")[0]["ask"]
    assert ask == "Lance l’analyse du compte Sopra Steria pour y placer Marie Dupont." or ask == (
        "Lance l'analyse du compte Sopra Steria pour y placer Marie Dupont."
    )


def test_la_lecture_de_forme_reste_valide() -> None:
    assert shape_read_from_tool("find_accounts_for_talent", _output(), language="fr") is not None


def test_follow_up_ref_refuse_un_identifiant_qui_n_est_pas_un_uuid() -> None:
    with pytest.raises(ValueError):
        ChatRequest(message="x", user_id="u", follow_up_ref={"talent_id": "pas-un-uuid"})


def test_le_bloc_de_prompt_porte_l_identifiant_et_seulement_lui() -> None:
    req = ChatRequest(message="x", user_id="u", follow_up_ref={"talent_id": _TALENT})
    block = follow_up_ref_block(req.follow_up_ref)
    assert _TALENT in block
    assert follow_up_ref_block(None) == ""


# ── la réponse forcée sans outil résume les analyses réellement parties ─────────────────────────


class _Throttle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


def _resp(stop, content):
    return SimpleNamespace(stop_reason=stop, content=content)


def _tool(company: str, n: int):
    return SimpleNamespace(
        type="tool_use", name="start_account_analysis", input={"company": company, "plan_token": "t"}, id=f"t{n}"
    )


class _Stream:
    def __init__(self, r):
        self.r = r

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_e):
        return False

    async def __aiter__(self):
        for b in self.r.content:
            if b.type == "text":
                yield SimpleNamespace(type="text", text=b.text)

    async def get_final_message(self):
        return self.r


class _Client:
    def __init__(self, responses):
        self._r = list(responses)
        self.calls: list[dict] = []
        self.messages = self

    def stream(self, **kw):
        self.calls.append(kw)
        return _Stream(self._r.pop(0))


def _all_text(messages) -> str:
    out = []
    for m in messages:
        c = m.get("content")
        if isinstance(c, str):
            out.append(c)
        elif isinstance(c, list):
            out.extend(b.get("text", "") for b in c if isinstance(b, dict))
    return "\n".join(out)


@pytest.mark.asyncio
async def test_la_reponse_forcee_apres_des_analyses_reussies_nomme_les_comptes(monkeypatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    fake = _Client(
        [
            _resp("tool_use", [_tool("Sopra Steria", 1), _tool("Alten", 2)]),
            _resp("tool_use", [_tool("Capgemini", 3)]),
            _resp("end_turn", [SimpleNamespace(type="text", text="Voilà.")]),
        ]
    )
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_k: fake)

    async def _exec(name, tool_input, *a, **k):
        if tool_input["company"] == "Capgemini":
            return {"error": "Le lancement n'a pas répondu."}
        return {"launched": True, "run_id": "r"}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(side_effect=_exec))
    await chat_orchestrator.run_chat_with_tools("sys", "Lance les analyses", user_id="u1", profile_data=None)

    final = _all_text(fake.calls[-1]["messages"])
    assert "Sopra Steria" in final and "Alten" in final
    # un lancement en échec n'est jamais annoncé comme parti
    assert "Capgemini" in final
    assert "2 analyse" in final


@pytest.mark.asyncio
async def test_sans_analyse_lancee_aucune_note_de_synthese(monkeypatch) -> None:
    assert chat_orchestrator._launched_analyses_note([], [], "fr") == ""


def test_garde_aucun_gabarit_de_suggestion_n_a_de_place_pour_un_identifiant() -> None:
    """Garde : un gabarit ``*_ask`` (texte envoyé au clic) n'accepte AUCUN champ ``{id}`` — ni aujourd'hui, ni demain."""
    from app.services import known_shape_gate as gate

    asks = [
        (lang, key, text)
        for lang, labels in gate._LABELS.items()
        for key, text in labels.items()
        if key.endswith("_ask")
    ]
    assert asks, "la garde doit lire quelque chose"
    for lang, key, text in asks:
        assert "{id}" not in text and "{talent_id}" not in text, f"{lang}.{key} met un identifiant dans le texte"
