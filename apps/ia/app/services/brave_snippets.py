"""#4016 SIG-D4 — Brave ``extra_snippets`` : jusqu'à 5 extraits de plus par résultat.

Doc Brave (web ET news, relue le 11/10/2026) : ``extra_snippets=true`` ajoute un
tableau ``extra_snippets`` à chaque résultat, pour la MÊME requête. Ils nourrissent le
texte déjà analysé (``description``) — aucun nouveau champ n'est exposé.

``BRAVE_EXTRA_SNIPPETS=0|false|off|no`` coupe : la doc réserve la fonction à certains
forfaits sans dire ce que fait un forfait qui ne l'a pas, donc le retour en arrière
doit tenir en une variable. Absente ⇒ activé.
"""

from __future__ import annotations

import os

_OFF = {"0", "false", "off", "no"}
#: Plafond du texte ajouté à une description (5 extraits ≈ 5 × 150 caractères).
_MAX_EXTRA_CHARS = 700


def extra_snippets_enabled() -> bool:
    return os.environ.get("BRAVE_EXTRA_SNIPPETS", "").strip().lower() not in _OFF


def extra_snippets_params() -> dict[str, str]:
    """Paramètre de requête à fusionner — ``{}`` quand coupé (requête byte-identique)."""
    return {"extra_snippets": "true"} if extra_snippets_enabled() else {}


def merge_description(description: str, extras: object) -> str:
    """``description`` + extraits supplémentaires (texte seul, jamais un nouveau champ)."""
    if not extra_snippets_enabled() or not isinstance(extras, list):
        return description
    text = " ".join(" ".join(str(e).split()) for e in extras if str(e or "").strip())[:_MAX_EXTRA_CHARS]
    return f"{description} {text}".strip() if text else description
