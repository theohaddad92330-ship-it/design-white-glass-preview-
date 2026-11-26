"""#1793 — « pouvoir compléter son profil avec Laura ».

Recherche (avant de coder, comme demandé) : trois capacités existantes
pouvaient couvrir ce retour sans rien construire de neuf.

  · `/settings/memory` (`MemoryLedgerView.tsx`) — un LEDGER en LECTURE des
    préférences et des résumés de conversation, dérivés automatiquement. On
    n'y TAPE rien.
  · `/settings/profile/context` (`ProfileContextSubPage.tsx`) — un récapitulatif
    GÉNÉRÉ par un bouton « régénérer », pas un texte que la personne écrit.
  · `ProfileComplementCard` / `useProfileComplement` — cinq questions à choix
    FERMÉ (personas, cycle de vente, TJM moyen, références, secteurs exclus),
    posées par une CARTE d'écran, jamais depuis la conversation.

Aucune des trois ne couvre « je pose un gros pavé de contexte à Laura, en lui
parlant, et ça enrichit mon profil ». Ce n'est donc PAS un problème de
découverte (« on ne le trouve pas ») : la capacité n'existe pas. La construire
— un outil d'écriture validé contre le vocabulaire FERMÉ de
`TEMPS2_ANSWER_OPTIONS`, son rendu dans `PendingActions.tsx`, le clic qui
écrit réellement — est une tranche verticale de la taille de `toggle_routine`
(#1823), PARQUÉE : ce lot livre la seule partie qui tient dans son budget, la
REDIRECTION vers la porte qui existe déjà et qui, elle, écrit pour de vrai.

Ce test tient donc le correctif réellement livré : quand quelqu'un donne du
contexte sur son ESN en conversation, Laura le dit et redirige vers
`/settings/profile` (`get_user_context`, la lecture qui précède la question) —
elle n'invente jamais d'écriture qu'elle ne peut pas faire.
"""

from __future__ import annotations

from app.services import chat_tools


def _tool_description(name: str) -> str:
    return str(next(t for t in chat_tools.CHAT_TOOLS if t["name"] == name)["description"])


def test_user_context_tool_redirects_to_the_profile_screen_it_cannot_write() -> None:
    description = _tool_description("get_user_context")
    assert "/settings/profile" in description
    assert "propose_guided_action" in description


def test_the_redirect_route_is_a_known_settings_screen() -> None:
    """Corrélat avec #1822 : la route citée doit exister dans le catalogue —
    sinon ce correctif recommanderait lui-même une route devinée."""
    assert "/settings/profile" in {str(e["route"]) for e in chat_tools.SETTINGS_SCREENS}


def test_no_write_tool_is_invented_for_the_profile() -> None:
    """Garde-fou négatif : ce lot ne doit PAS avoir ajouté un outil qui prétend
    écrire le profil tout seul — la porte reste celle de l'écran."""
    names = {str(t["name"]) for t in chat_tools.CHAT_TOOLS}
    assert not any("profile" in name and "write" in name for name in names)
    assert not any(name in ("update_profile", "write_profile", "save_profile") for name in names)
