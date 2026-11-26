"""Échec typé des sources de LISTE (prospection inversée).

Les fonctions d'enrichissement mono-entreprise (``public_tenders``,
``awarded_it_contracts``, ``it_job_signals``) renvoient ``[]`` sur erreur : une
source libre ne doit jamais casser une analyse en cours.

Les fonctions de LISTE (``list_*``) ont le contrat INVERSE : « Découvrir » n'a
qu'elles pour produire des candidats, donc un ``[]`` silencieux ferait passer une
source HS (pas de clé, quota, HTTP 5xx) pour « aucun résultat ». Le contrat
`agent_docs/discover-v2-contract.md` l'interdit — toute source injoignable doit
apparaître dans ``degraded``. Elles lèvent donc cette erreur, que le routeur
`/discover/signals` convertit en entrée ``{source, reason}``.
"""

from __future__ import annotations

from collections.abc import Awaitable


class SignalSourceUnavailable(RuntimeError):
    """Une source de signal n'a rien pu produire — dit, jamais masqué."""

    #: R23 — l'échec d'une source tierce est converti en entrée ``degraded`` par l'appelant : attendu.
    sentry_expected = True

    def __init__(self, source: str, reason: str) -> None:
        super().__init__(f"{source}: {reason}")
        self.source = source
        self.reason = reason


async def settled[T](awaitable: Awaitable[T]) -> T | Exception:
    """Rend l'échec d'une source au lieu de le LEVER.

    Une exception qui sort d'une tâche (``asyncio.gather`` en crée une par
    coroutine) est capturée par l'intégration asyncio de Sentry, même quand le
    ``gather(return_exceptions=True)`` la rattrape ensuite. Un échec de source
    déjà géré et dit à l'écran (429, 400 fournisseur, créneau du limiteur
    refusé, timeout) n'est pas un défaut : il voyage comme VALEUR. Seules les
    ``Exception`` sont rendues — une annulation (``CancelledError``) se propage.
    """
    try:
        return await awaitable
    except Exception as exc:  # noqa: BLE001 — l'appelant teste isinstance(…, BaseException)
        return exc
