"""#3192.8 (LAU-FINAL-198, reste des lots du 28-29/09/2026) — LE CONTRÔLE DE
DENSITÉ RENDU PROUVABLE.

Mesuré avant d'écrire : `detail_level_from_message` (#2257.14,
`app/services/compilers/intent_markers.py`) est calculé À CHAQUE tour
(`app/routers/chat.py`) mais son résultat ne sert qu'au journal
(`request_intent_contract_for_log`) — jamais consommé par
`build_system_prompt`. Le contrôle de densité décrit dans `_BLOCK_FORMAT`
(section NIVEAU DE RÉPONSE) restait donc entièrement laissé au jugement du
modèle, sans AUCUN signal calculé côté code : rien à prouver, puisque rien
n'était câblé — exactement le défaut que trois lots successifs (28/09, 29/09
L05, 29/09 N07) ont buté sur le même mur (« pas d'appel Claude live possible
dans cet environnement pour le vérifier empiriquement ») sans remarquer que
la moitié PROUVABLE — le signal calculé, déterministe — n'était même pas
branchée.

Ce module ne redéfinit PAS les marqueurs (GA-26, un seul endroit :
`intent_markers.py`) : il consomme leur résultat déjà calculé et rend un
bloc textuel, sur le même patron que `reply_preferences_block`
(`reply_preferences.py`) — absent = ``""``, prompt inchangé au byte près.
"""

from __future__ import annotations

_BREF = (
    "SIGNAL DE CE TOUR (#2257.14, calculé sur le message lui-même, jamais deviné) : "
    "la personne a explicitement demandé un résumé bref. Ce signal pousse vers MICRO "
    "ou SHORT dans NIVEAU DE RÉPONSE ci-dessus ; il s'ajoute aux autres critères, il "
    "ne les remplace pas."
)
_DETAILLE = (
    "SIGNAL DE CE TOUR (#2257.14, calculé sur le message lui-même, jamais deviné) : "
    "la personne a explicitement demandé un développement détaillé ou exhaustif. Ce "
    "signal pousse vers DÉCISION ou DEEP dans NIVEAU DE RÉPONSE ci-dessus, selon le "
    "sujet ; il s'ajoute aux autres critères, il ne les remplace pas."
)

_BLOCKS: dict[str, str] = {"bref": _BREF, "detaille": _DETAILLE}


def reply_density_signal_block(niveau_detail: str | None) -> str:
    """Le signal calculé par `detail_level_from_message`, ou ``""`` si aucun
    marqueur déclaré — jamais une valeur devinée (doctrine « non mesuré n'est
    jamais 0 » appliquée à ce signal)."""
    block = _BLOCKS.get(niveau_detail or "")
    return f"\n\n{block}" if block else ""
