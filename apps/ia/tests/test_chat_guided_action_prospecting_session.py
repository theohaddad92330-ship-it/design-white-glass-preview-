"""#2367.13 — Laura reconnaît l'intention « session de prospection » sur son
réseau professionnel, c'est-à-dire des messages À COPIER, jamais envoyés.

Doctrine c79 : ce canal n'est admis que s'il est apporté par l'UTILISATEUR —
jamais un envoi, on prépare. Avant ce lot, aucun mot de `chat_tools.py` ne
référençait la capacité de session de prospection (`apps/web/src/features/
prospecting-session`, ouverte depuis l'écran « Découvrir »/`CallListResults.tsx`) :
`git grep -c "session de prospection" apps/ia/app/services/chat_tools.py` = 0.
Une personne qui demandait « prépare-moi une session pour prospecter mes
contacts » ne pouvait recevoir qu'une intention non routée.

La tranche minimale : `propose_guided_action` route déjà vers `/discover`
(catalogue existant, `APP_SCREENS`) — le geste empêché n'est pas une route
manquante, c'est que sa description ne DIT pas que la session de prospection y
vit. Ce test le vérifie, sans nommer le fournisseur (GA-… / doctrine : « nos
fournisseurs ne se nomment jamais » — vocabulaire déjà posé par
`REGISTRY_ACTION_SURFACE[("LinkedIn", "prepare_message_for_contact")]` dans
`test_copilote_prompt_blocks.py` : « ton réseau professionnel »).
"""

from __future__ import annotations

from app.services import chat_tools


def _discover_entry() -> dict[str, str]:
    entry = next((e for e in chat_tools.APP_SCREENS if e["route"] == "/discover"), None)
    assert entry is not None, "/discover a disparu du catalogue"
    return entry


def test_discover_names_the_prospecting_session_to_copy_yourself() -> None:
    description = _discover_entry()["description"].lower()
    assert "session de prospection" in description
    # #2367.13 — jamais un envoi : la carte dit qu'on COPIE, on n'expédie rien.
    assert "copier" in description


def test_discover_description_never_names_the_vendor() -> None:
    description = _discover_entry()["description"].lower()
    assert "linkedin" not in description


def test_the_tool_still_names_every_app_screen_after_the_change() -> None:
    """Garde-fou de non-régression : `propose_guided_action` continue de citer
    `/discover` mot pour mot — même règle que `test_chat_guided_action_app_routes.
    test_the_tool_description_names_every_app_screen`."""
    tool_description = str(next(t for t in chat_tools.CHAT_TOOLS if t["name"] == "propose_guided_action")["description"])
    assert "`/discover`" in tool_description
