"""#2454.4 / #2454.5 / #2454.9 — le mode de contexte SURVIT au handoff Laura→Découvrir.

─────────────────────────────────────────────────────────────────────────────
LE TROU QUE LE REGISTRE NOMMAIT
─────────────────────────────────────────────────────────────────────────────
Le mode (`my_activity` / `one_off_mission` / `neutral`, `laura-context-mode.ts`)
est déjà résolu par `apps/ia/app/routers/chat.py` (`apply_context_mode`,
`req.context_mode`) et déjà lu par Découvrir depuis SON URL
(`?context=neutral`, `discover-context-mode.ts`). Mais entre les deux,
`chat_tools.execute_chat_tool` ne recevait jamais ce mode : la carte
`find_accounts` que Laura propose ne le portait pas, donc le clic renvoyait
vers Découvrir SANS lui — la recherche neutre redevenait « Mon activité » par
défaut d'espace, silencieusement (exactement le NO-GO de #2454.10, mais côté
Laura→Découvrir plutôt que Découvrir→Découvrir).

─────────────────────────────────────────────────────────────────────────────
CE QUE CE TEST PROUVE
─────────────────────────────────────────────────────────────────────────────
Un `context_mode` connu du tour voyage jusque dans la proposition
`find_accounts` — un CHAMP de plus sur l'enveloppe existante, pas un nouveau
système. Absent (`None`, le défaut de tous les appelants d'avant ce lot), rien
ne change : la clé `context_mode` n'apparaît pas du tout — jamais une valeur
devinée.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools

USER = "66666666-6666-4666-8666-666666666666"


@pytest.mark.asyncio
async def test_a_known_context_mode_rides_along_on_the_proposal() -> None:
    result = await chat_tools.execute_chat_tool(
        "find_accounts",
        {"sectors": ["health"]},
        user_id=USER,
        profile_data=None,
        context_mode="neutral",
    )
    assert result["proposal"]["context_mode"] == "neutral"


@pytest.mark.asyncio
async def test_no_context_mode_means_no_field_at_all() -> None:
    # Défaut de tous les appelants d'avant ce lot : byte-identique, aucune clé
    # devinée.
    result = await chat_tools.execute_chat_tool(
        "find_accounts",
        {"sectors": ["health"]},
        user_id=USER,
        profile_data=None,
    )
    assert "context_mode" not in result["proposal"]
