"""#3191.6 (LAU-FINAL-197) — LE VOCABULAIRE QUE LAURA PRÉFÈRE, ET CELUI QU'ELLE ÉVITE.

Distinct de ``forbidden_phrasings.py`` : ce module-là bannit des formulations
qui trahissent un moteur de conversation (« je vois que »), sec, sans
alternative proposée. Ici, aucune des deux listes n'est un bannissement —
« vendre un consultant » reste une phrase compréhensible, elle sonne juste
comme un recruteur qui pousse plutôt qu'une collègue qui positionne une
expertise. Un module à part parce que la FORME diffère (deux registres d'un
même geste, pas un NON sec) : le mélanger dans ``forbidden_phrasings`` aurait
fait apparaître un registre comme un interdit strict dans les tests qui
vérifient qu'AUCUN interdit n'a été perdu.

Deux listes, PAS un mapping terme à terme : le retour source (LAU-FINAL-197)
en compte six à préférer et quatre à éviter — les associer un à un aurait
inventé une correspondance qu'aucune des deux phrases ne porte. Le doublon
avec des règles existantes est assumé, pas caché : « exploiter une cible » et
« attaquer agressivement » recoupent déjà PAS DE JUGEMENT et PAS DE MONTÉE DE
GAMME NON DEMANDÉE (``_BLOCK_LAURA``), et « probabilité de closing inventée »
reste interdite par ailleurs (aucune PROBABILITÉ, refusée six fois) — ce
module ne fait que leur donner leur place dans le lexique à éviter, pour la
lecture d'ensemble.
"""

from __future__ import annotations

#: Dans l'ordre du retour LAU-FINAL-197.
PREFERRED_TERMS: tuple[str, ...] = (
    "travailler un compte",
    "ouvrir un périmètre",
    "positionner une expertise",
    "proposer un consultant",
    "obtenir une information",
    "construire une voie d'accès",
)

AVOIDED_TERMS: tuple[str, ...] = (
    "vendre un consultant",
    "exploiter une cible",
    "attaquer agressivement",
    "probabilité de closing inventée",
)

_HEADER = "LEXIQUE (#3191.6, LAU-FINAL-197) — le geste commercial nommé simplement, jamais habillé en conquête :"


def _quoted(terms: tuple[str, ...]) -> str:
    return ", ".join(f"« {term} »" for term in terms)


BLOCK_REPLY_LEXICON = f"{_HEADER}\n- Préférer : {_quoted(PREFERRED_TERMS)}.\n- Éviter : {_quoted(AVOIDED_TERMS)}."
