"""#AM.59 (#4059) — comparer des profils à un besoin COLLÉ sans le créer dans le pipe : `run_matching` accepte
`draft_need` (critères lus dans le texte), le calcul se fait en mémoire côté API (`needs/match-draft`) et rien n'est
écrit. « Créer le besoin » reste un geste séparé."""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import MATCH_NEED_TOOL, execute_chat_tool

DRAFT = {"role": "Développeur Java senior", "skills": [{"term": "Java", "required": True}], "location": "Paris"}


def test_l_outil_declare_draft_need_sans_exiger_need_id() -> None:
    props = MATCH_NEED_TOOL["input_schema"]["properties"]
    assert "draft_need" in props
    assert props["draft_need"]["properties"]["role"]["type"] == "string"
    assert "need_id" not in MATCH_NEED_TOOL["input_schema"]["required"]
    assert "SANS créer" in MATCH_NEED_TOOL["description"]


@pytest.mark.asyncio
async def test_un_besoin_colle_se_classe_sans_aucune_ecriture(monkeypatch) -> None:
    calls: dict[str, object] = {}

    async def run_matching_draft(user_id, *, need):
        calls["draft"] = (user_id, need)
        return {"need": {"needId": None, "role": need["role"]}, "recommended": [{"consultantId": "c1"}], "excluded": []}

    async def run_matching(*_a, **_k):
        raise AssertionError("le chemin qui journalise ne doit pas être pris")

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "run_matching_draft", run_matching_draft)
    monkeypatch.setattr(bellum_api, "run_matching", run_matching)
    out = await execute_chat_tool("run_matching", {"draft_need": DRAFT}, user_id="u-1", profile_data=None)
    assert calls["draft"] == ("u-1", DRAFT)
    assert out["draft"] is True  # le besoin n'est PAS créé : le dire, sans le présenter comme enregistré
    assert out["recommended"] == [{"consultantId": "c1"}]
    assert "Créer le besoin" in out["draft_note"]


@pytest.mark.asyncio
async def test_sans_besoin_ni_brouillon_rien_n_est_devine(monkeypatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    out = await execute_chat_tool("run_matching", {"draft_need": {"skills": []}}, user_id="u-1", profile_data=None)
    assert "error" in out
