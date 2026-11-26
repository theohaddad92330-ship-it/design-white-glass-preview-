"""#4462.9 — au retour des analyses lancées par Laura depuis une liste de noms, le classement « par où commencer »
est posté quand la DERNIÈRE se termine. Côté IA : Laura DÉCLARE le lot au lancement (les analyses en cours, et les
comptes déjà connus) ; la fin du lot est suivie côté API (`LauraBatchFollowService`)."""

from __future__ import annotations

from typing import Any

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool
from tests.test_4462_laura_liste_noms import Bridge, _install

TOOL = "analyze_named_companies"


async def _run(names: list[str]) -> dict[str, Any]:
    return await execute_chat_tool(TOOL, {"companies": names}, user_id="u-1", profile_data=None)


async def test_4462_9_the_batch_is_declared_with_running_and_known_accounts(monkeypatch):
    bridge = Bridge(workspace={"Guerbet": [{"account_id": "acc-known", "company_name": "Guerbet"}]})
    _install(monkeypatch, bridge)
    followed: list[tuple[str, list[str], list[str]]] = []

    async def follow(user_id, launched, known):
        followed.append((user_id, list(launched), list(known)))
        return {"ok": True}

    monkeypatch.setattr(bellum_api, "follow_analysis_batch", follow)

    result = await _run(["Guerbet", "Théa", "Ipsen"])

    assert [row["company"] for row in result["launched"]] == ["Théa", "Ipsen"]
    assert followed == [("u-1", ["acc-Théa", "acc-Ipsen"], ["acc-known"])]


async def test_4462_9_nothing_launched_means_nothing_to_wait_for(monkeypatch):
    bridge = Bridge(workspace={"Guerbet": [{"account_id": "acc-known", "company_name": "Guerbet"}]})
    _install(monkeypatch, bridge)
    followed: list[Any] = []

    async def follow(*args, **kwargs):
        followed.append(args)

    monkeypatch.setattr(bellum_api, "follow_analysis_batch", follow)

    await _run(["Guerbet", "Guerbet"])

    assert followed == []


async def test_4462_9_a_lost_declaration_never_fails_the_launch(monkeypatch):
    bridge = Bridge()
    _install(monkeypatch, bridge)

    async def follow(*args, **kwargs):
        raise RuntimeError("pont muet")

    monkeypatch.setattr(bellum_api, "follow_analysis_batch", follow)

    result = await _run(["Théa", "Ipsen"])

    assert len(result["launched"]) == 2
    assert "error" not in result
