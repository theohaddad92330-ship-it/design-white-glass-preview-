"""Budget global de contexte (#15).

Les blocs d'un prompt (résumé contacts, plan, base de connaissance…) ont chacun
un cap, mais rien ne borne leur SOMME : quand tous sont pleins en même temps, le
prompt gonfle. Ce helper impose un plafond total et sacrifie les blocs les moins
prioritaires d'abord — on garde intégralement ce qui compte le plus, on rogne la
queue. Complète les caps par-bloc (appliqués en amont), ne les remplace pas.
"""

from __future__ import annotations

from collections.abc import Sequence


def fit_to_budget(blocks: Sequence[tuple[str, str]], total: int) -> dict[str, str]:
    """Rogne un ensemble de blocs pour que leur longueur cumulée ≤ ``total``, en
    sacrifiant les blocs de PLUS BASSE priorité d'abord.

    ``blocks`` = ``(clé, texte)`` par priorité DÉCROISSANTE (le plus important en
    tête). Chaque bloc reçoit ce qu'il reste du budget ; un bloc qui déborde est
    tronqué, les suivants (moins prioritaires) tombent à vide. Retourne
    ``{clé: texte éventuellement tronqué}``.
    """
    result: dict[str, str] = {}
    remaining = max(0, total)
    for key, text in blocks:
        t = text or ""
        if len(t) <= remaining:
            result[key] = t
            remaining -= len(t)
        else:
            result[key] = t[:remaining]
            remaining = 0
    return result
