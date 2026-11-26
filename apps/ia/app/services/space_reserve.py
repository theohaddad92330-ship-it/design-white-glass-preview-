"""La coupe à ``limit`` qui fait place aux comptes de l'espace (#4067) — partagée par les deux
modes de Découvrir (registre et signaux)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

SPACE_RESERVE_DIVISOR = 4


def cut_with_space_reserve(
    ranked: list[Any],
    limit: int,
    space_sirens: frozenset[str],
    *,
    siren_of: Callable[[Any], str | None],
    is_excluded: Callable[[Any], bool],
) -> list[Any]:
    """La coupe à ``limit``, sans couper avant d'avoir mêlé les faits de l'espace (#4067).

    L'IA ne connaît ni le CRM ni l'historique de l'espace : coupée à ``limit`` sur le seul rang,
    elle écartait pour de bon un compte que l'espace connaît (affaire gagnée, besoin récurrent)
    avant que l'API puisse le pondérer. Un candidat de ``space_sirens`` tombé sous la coupe
    reprend donc la place du DERNIER candidat sans fait d'espace, au plus
    ``limit // SPACE_RESERVE_DIVISOR`` fois. Un verdict « exclu » n'est jamais repêché ; un SIREN
    absent du bassin n'invente rien ; l'ordre du classement est conservé."""
    if len(ranked) <= limit or not space_sirens:
        return ranked[:limit]

    def known(candidate: Any) -> bool:
        return siren_of(candidate) in space_sirens

    reserve = max(1, limit // SPACE_RESERVE_DIVISOR)
    rescue = [i for i in range(limit, len(ranked)) if known(ranked[i]) and not is_excluded(ranked[i])][:reserve]
    droppable = [i for i in range(limit - 1, -1, -1) if not known(ranked[i])]
    swaps = min(len(rescue), len(droppable))
    if swaps == 0:
        return ranked[:limit]
    kept = (set(range(limit)) - set(droppable[:swaps])) | set(rescue[:swaps])
    return [ranked[i] for i in sorted(kept)]
