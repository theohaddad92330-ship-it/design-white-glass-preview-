"""#2721 — `web_search` est ENREGISTRÉ dans le catalogue du chat et DISPATCHÉ.

`test_web_search_tool.py` tient déjà le comportement du module
(`app.services.web_search_tool`) en isolation. Ce fichier-ci tient
uniquement la COUTURE avec `chat_tools.py` : l'outil apparaît dans
`CHAT_TOOLS`, à la FIN de la liste (préfixe de cache), n'est pas dans
`WRITE_TOOL_NAMES` (une lecture n'est pas une écriture), et
`execute_chat_tool("web_search", ...)` délègue bien à
`execute_web_search` — sans le recopier.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_tools
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

TOOL_NAME = "web_search"


def test_web_search_est_dans_le_catalogue_a_la_fin() -> None:
    names = [t["name"] for t in CHAT_TOOLS]
    assert TOOL_NAME in names
    # #1489 et tous les commentaires « EN FIN de liste » de ce fichier : un
    # outil neuf s'ajoute à la fin, jamais au milieu (préfixe d'outils mis en
    # cache). Le dernier de la liste doit être le nôtre.
    # #2294 (23/09/2026) — `search_workspace_contacts` a suivi, EN FIN : la
    # règle est « rien ne s'insère AVANT », pas « le dernier à jamais ».
    # #2337 (23/09/2026) — `plan_talent_territory` a suivi à son tour, EN FIN :
    # ce qui se garde est la position RELATIVE, juste avant ce qui l'a suivi.
    # #2392 — `compile_day_closure` a suivi, EN FIN : la recherche web reste
    # juste avant ce qui l'a suivi, jamais au milieu.
    # #2338.8 / #2409.8 — `get_mission_start_readiness` a suivi à son tour, EN FIN.
    # #2423.9 — `propose_mission_amendment` a suivi à son tour, EN FIN.
    # #1950.4 — la PRÉSENCE et l'ordre relatif, jamais la queue : un outil ajouté
    # EN FIN après eux (`describe_plan`) ne doit pas faire tomber ce test.
    assert names[names.index(TOOL_NAME) :][:6] == [
        TOOL_NAME,
        "search_workspace_contacts",
        "plan_talent_territory",
        "compile_day_closure",
        "get_mission_start_readiness",
        "propose_mission_amendment",
    ]


def test_web_search_est_une_lecture_pas_une_ecriture() -> None:
    assert TOOL_NAME not in chat_tools.WRITE_TOOL_NAMES


async def test_execute_chat_tool_delegue_au_module_dedie(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[dict[str, Any]] = []

    async def _fake(tool_input: dict[str, Any]) -> dict[str, Any]:
        seen.append(tool_input)
        return {"query": tool_input.get("query"), "results": []}

    monkeypatch.setattr("app.services.web_search_tool.execute_web_search", _fake)

    out = await execute_chat_tool(
        TOOL_NAME,
        {"query": "Sopra Steria DSI"},
        user_id="u-1",
        profile_data=None,
    )

    assert seen == [{"query": "Sopra Steria DSI"}]
    # #4288.1 (lot FINITION, 19/10/2026) — la réponse du module est relayée telle quelle, et chaque
    # résultat web dit son origine et l'ordre suivi (espace → registres → web).
    assert {key: out[key] for key in ("query", "results")} == {"query": "Sopra Steria DSI", "results": []}
    assert out["origin"] == "trouvé sur le web"
    assert "en dernier recours sur le web" in out["origin_order"]
