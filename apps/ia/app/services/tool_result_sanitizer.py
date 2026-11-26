"""#2438.6 — purge des secrets et de toute donnée cross-workspace des résultats
d'outil de chat, AVANT qu'ils ne rejoignent le modèle ou l'utilisateur.

Avant ce lot : aucune purge de résultat d'outil. `workspace-isolation.spec.ts`
(NestJS) garde l'isolation générale des requêtes DB, jamais un résultat
d'outil de chat qu'un connecteur tiers ou un champ mal projeté aurait pu faire
fuiter vers le modèle.

Un `workspace_id` n'a jamais eu besoin d'être exposé au modèle dans un résultat
d'outil de chat (aucun tool existant n'en renvoie un aujourd'hui) : le retirer
inconditionnellement, plutôt que de le comparer à celui de l'appelant, ferme le
trou sans dépendre d'un round-trip réseau supplémentaire à chaque appel — et
sans jamais pouvoir laisser passer le workspace d'un AUTRE utilisateur par
erreur d'implémentation d'un outil futur.

Dans l'esprit GA-18/GA-19 : on NOMME ce qui a été retiré (le marqueur), on ne
le fait pas disparaître en silence — un champ absent sans explication se
lirait comme une absence de donnée, pas comme une purge délibérée.
"""

from __future__ import annotations

from typing import Any

_REDACTED = "[retiré — #2438.6]"

_SECRET_KEY_MARKERS = (
    "token",
    "secret",
    "password",
    "passwd",
    "api_key",
    "apikey",
    "authorization",
    "credential",
    "private_key",
)

_CROSS_WORKSPACE_KEYS = ("workspace_id", "workspaceid")

# `plan_token`/`planToken` (`copilot-bridge/analysis-plan-token.ts`, #1489) est
# un jeton HMAC de SÉQUENCEMENT — il ne donne accès à rien, il prouve juste que
# l'étape de préparation a bien précédé le lancement, et le modèle DOIT le
# reporter au clic « go ». Le rediger casserait le seul chemin de lancement
# d'analyse. Seul nom explicitement exempté : tout autre `*token*` reste couvert.
_ALLOWED_KEYS = frozenset({"plantoken", "plan_token"})


def _is_secret_key(key: str) -> bool:
    lowered = key.lower()
    if lowered in _ALLOWED_KEYS:
        return False
    return any(marker in lowered for marker in _SECRET_KEY_MARKERS)


def is_cross_workspace_key(key: str) -> bool:
    # Public depuis #2879 (#2442.14) : le détecteur cross-tenant réutilise CE
    # prédicat plutôt que d'en copier un second (un réglage, un endroit).
    return key.lower().replace("_", "") in _CROSS_WORKSPACE_KEYS


_is_cross_workspace_key = is_cross_workspace_key


def sanitize_tool_result(value: Any) -> Any:
    """Retourne une COPIE de `value` où chaque clé secrète ou identifiant de
    workspace est remplacée par un marqueur nommé, à n'importe quelle
    profondeur. Les listes et scalaires traversent inchangés (hors récursion
    sur leurs éléments)."""
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, val in value.items():
            if isinstance(key, str) and (_is_secret_key(key) or _is_cross_workspace_key(key)):
                cleaned[key] = _REDACTED
            else:
                cleaned[key] = sanitize_tool_result(val)
        return cleaned
    if isinstance(value, list):
        return [sanitize_tool_result(item) for item in value]
    return value
